import type { MasterResume, ExperienceItem, EducationItem, ProjectItem, CertificationItem, ByocStructuredApplicationData } from '../types';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
export type { ByocStructuredApplicationData };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractionResult {
  success: boolean;
  isScannedImage?: boolean;
  rawText: string;
  parsedProfile?: MasterResume;
  error?: string;
  wordCount: number;
  pageCount: number;
  charCount: number;
  fileName: string;
}

/**
 * Client-Side Binary & Stream Text Extractor for PDF, DOCX, TXT, MD
 * Operates purely locally with 0 external network dependencies and zero fabrication.
 */
export async function extractResumeFile(file?: File | null): Promise<ExtractionResult> {
  if (!file) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName: 'unknown',
      error: 'No file was provided for extraction.'
    };
  }

  const fileName = file.name || 'uploaded_document';
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Guard against 0-byte or corrupted empty files
  if (file.size === 0) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'The uploaded file is empty (0 bytes). Please upload a valid document or paste text directly.'
    };
  }

  // 2. Guard against files exceeding memory limits (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'File size exceeds the 10MB limit. Please upload a smaller document.'
    };
  }

  const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'heic', 'svg']);
  const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'docx']);

  if (IMAGE_EXTENSIONS.has(fileExt)) {
    return {
      success: false,
      isScannedImage: true,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: 'Raster image OCR is not supported in local extraction. Please upload a .docx, .txt, .md, or selectable-text .pdf file, or paste your resume text in Manual Paste Fallback.'
    };
  }

  if (fileExt && !SUPPORTED_EXTENSIONS.has(fileExt)) {
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: `Unsupported file format (.${fileExt}). Local extraction supports .docx, .txt, .md, and basic selectable-text .pdf files; otherwise paste text directly.`
    };
  }

  try {
    let rawText = '';
    let detectedPages = 1;

    if (fileExt === 'txt' || fileExt === 'md' || !fileExt) {
      rawText = await file.text();
      const words = rawText.split(/\s+/).filter(Boolean);
      detectedPages = Math.max(1, Math.ceil(words.length / 450));
    } else if (fileExt === 'pdf') {
      const pdfExtraction = await extractPdfText(file);
      rawText = pdfExtraction.text;
      detectedPages = pdfExtraction.pageCount;
    } else if (fileExt === 'docx') {
      rawText = await extractDocxText(file);
      const words = rawText.split(/\s+/).filter(Boolean);
      detectedPages = Math.max(1, Math.ceil(words.length / 450));
    }

    // Clean text
    const cleanedText = (rawText || '').replace(/\r\n/g, '\n').trim();
    const words = cleanedText ? cleanedText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const charCount = cleanedText.length;

    // Scanned Image / Empty / Complex Encoded Stream Detection
    if ((fileExt === 'pdf' && wordCount < 5) || (fileExt !== 'pdf' && wordCount < 10)) {
      return {
        success: false,
        isScannedImage: true,
        rawText: cleanedText,
        wordCount,
        pageCount: detectedPages || 1,
        charCount,
        fileName,
        error: fileExt === 'pdf'
          ? 'This PDF contains fewer than 5 readable words. It may be a scanned or image-only PDF. Please use Manual Paste Fallback; cloud OCR is not used.'
          : 'No readable text could be extracted. Please use Manual Paste Fallback or upload a .docx/.txt/.md file.'
      };
    }

    const parsedProfile = parseRawResumeToStructured(cleanedText, fileName, wordCount, detectedPages, charCount);

    return {
      success: true,
      rawText: cleanedText,
      parsedProfile,
      wordCount,
      pageCount: detectedPages,
      charCount,
      fileName
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown parsing error occurred while reading document';
    return {
      success: false,
      isScannedImage: false,
      rawText: '',
      wordCount: 0,
      pageCount: 0,
      charCount: 0,
      fileName,
      error: errorMsg
    };
  }
}

/**
 * Extract selectable text locally with Mozilla PDF.js. Vite emits the worker
 * as an application asset for offline browser and Capacitor WebView use.
 * PDF.js preserves its standard text-item order; arbitrary multi-column visual
 * reading order is not guaranteed to be reconstructed.
 */
async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | undefined;

  try {
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false });
    pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\\n' : ' ') : ''))
        .join('')
        .trim();
      if (pageText) pages.push(pageText);
      page.cleanup();
    }

    return { text: pages.join('\\n'), pageCount: pdf.numPages };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : '';
    if (/password/i.test(message) || /PasswordException/i.test(errorName)) {
      throw new Error('This PDF is password-protected. Unlock it before uploading, or use Manual Paste Fallback.');
    }
    throw error;
  } finally {
    await pdf?.destroy();
  }
}

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Standard DOCX must be a PKZIP archive, or in edge tests raw XML containing <w:t>
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (isZip) {
    const entry = extractZipEntryViaCentralDirectory(bytes, 'word/document.xml');
    if (!entry) {
      throw new Error('Could not locate word/document.xml inside this .docx archive. File may be corrupted or encrypted.');
    }

    let xmlBytes: Uint8Array;
    if (entry.compressionMethod === 0) {
      xmlBytes = entry.compressedBytes;
    } else if (entry.compressionMethod === 8) {
      xmlBytes = await decompressBytes(entry.compressedBytes, 'deflate-raw');
    } else {
      throw new Error(
        `Unsupported .docx ZIP compression method (${entry.compressionMethod}). Try re-saving as standard .docx or pasting text manually.`
      );
    }

    const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes);
    return extractParagraphsFromDocumentXml(xml);
  }

  // Fallback ONLY if raw uncompressed Word XML (containing <w:t>) was saved directly
  const rawXml = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/<w:t[\s>]/i.test(rawXml)) {
    return extractParagraphsFromDocumentXml(rawXml);
  }

  return '';
}

/**
 * Parses raw text into MasterResume with STRICT ZERO-FABRICATION rules:
 * - If a field is not detected, it remains an empty string or empty array.
 * - NO fake companies (Premier Engineering Org), NO fake bullets, NO fake degrees, NO fake certifications.
 */
export function parseRawResumeToStructured(
  rawText: string,
  fileName: string = 'Uploaded_Resume.pdf',
  wordCount: number = 0,
  pageCount: number = 1,
  charCount: number = 0
): MasterResume {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. Contact Info Extraction (strictly from regex matches)
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  const githubMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);
  const portfolioMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:dev|me|io|com)/i);

  // Name extraction: inspect top lines for a standalone personal name
  let detectedName = '';
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    // Check if line looks like a person's name (2-4 capitalized words, no punctuation/emails)
    if (
      line.length >= 3 &&
      line.length <= 45 &&
      !line.includes('@') &&
      !line.includes('http') &&
      !line.includes('/') &&
      !/^(resume|curriculum|cv|summary|experience|education|skills|page)/i.test(line) &&
      /^[A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){1,3}$/.test(line)
    ) {
      detectedName = line;
      break;
    }
  }

  // 2. Headline & Professional Summary
  let detectedHeadline = '';
  let summary = '';

  // Look for a headline in first few lines beneath the name
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    if (line !== detectedName && !line.includes('@') && line.length > 5 && line.length < 60) {
      if (/(engineer|developer|architect|manager|lead|director|specialist|designer|analyst|scientist)/i.test(line)) {
        detectedHeadline = line;
        break;
      }
    }
  }

  const summaryHeaderIdx = lines.findIndex((l) =>
    /^(summary|profile|professional summary|about me|overview|executive summary)/i.test(l)
  );

  if (summaryHeaderIdx !== -1) {
    const summaryLines: string[] = [];
    for (let i = summaryHeaderIdx + 1; i < Math.min(lines.length, summaryHeaderIdx + 6); i++) {
      const line = lines[i];
      if (/^(experience|work experience|employment|education|skills|projects|certifications)/i.test(line)) {
        break;
      }
      summaryLines.push(line);
    }
    summary = summaryLines.join(' ').trim();
  }

  // 3. Skills extraction (match terms ONLY if explicitly present in rawText)
  const technicalSkills: string[] = [];
  const softSkills: string[] = [];
  const tools: string[] = [];
  const domains: string[] = [];

  const commonTech = [
    'React', 'TypeScript', 'JavaScript', 'Node.js', 'Next.js', 'Python', 'Go', 'Golang',
    'Java', 'C++', 'C#', '.NET', 'Rust', 'GraphQL', 'Tailwind CSS', 'Redux', 'Zustand', 'HTML5', 'CSS3',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'REST APIs',
    'Kafka', 'RabbitMQ', 'Microservices', 'FastAPI', 'Django', 'Spring Boot', 'SQL'
  ];

  commonTech.forEach((tech) => {
    const reg = new RegExp(`\\b${tech.replace(/[.+]/g, '\\$&')}\\b`, 'i');
    if (reg.test(rawText) && !technicalSkills.includes(tech)) {
      technicalSkills.push(tech);
    }
  });

  const commonTools = ['Figma', 'Jira', 'Postman', 'VS Code', 'GitHub Actions', 'Datadog', 'Jest', 'Playwright', 'Git', 'Vite', 'Webpack', 'Docker', 'Terraform'];
  commonTools.forEach((tool) => {
    if (new RegExp(`\\b${tool}\\b`, 'i').test(rawText) && !tools.includes(tool)) {
      tools.push(tool);
    }
  });

  const commonSoft = [
    'System Architecture', 'Agile Delivery', 'Cross-Functional Leadership',
    'Mentorship', 'Code Review', 'Stakeholder Management', 'Sprint Planning'
  ];
  commonSoft.forEach((soft) => {
    if (new RegExp(`\\b${soft}\\b`, 'i').test(rawText) && !softSkills.includes(soft)) {
      softSkills.push(soft);
    }
  });

  // 4. Experiences Extraction (strictly parsed, zero fabrication)
  const experiences: ExperienceItem[] = [];
  const expIndex = lines.findIndex((l) => /^(experience|work experience|employment history|work history|professional experience)/i.test(l));

  if (expIndex !== -1) {
    const expSlice = lines.slice(expIndex + 1);
    let currentExp: Partial<ExperienceItem> | null = null;
    let bullets: string[] = [];

    for (let i = 0; i < expSlice.length; i++) {
      const line = expSlice[i];
      if (/^(education|projects|certifications|skills|awards|publications)/i.test(line)) {
        break;
      }

      const dateMatch = line.match(/(20\d\d|19\d\d|present|current)/i);
      const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line);

      if (dateMatch && !isBullet && line.length < 90) {
        if (currentExp && bullets.length > 0) {
          experiences.push({
            id: 'exp-' + experiences.length,
            company: currentExp.company || '',
            role: currentExp.role || '',
            startDate: currentExp.startDate || '',
            endDate: currentExp.endDate || '',
            location: currentExp.location || '',
            bullets: [...bullets],
            isCurrent: currentExp.isCurrent || false
          });
          bullets = [];
        }

        const parts = line.split(/[-–|,]/).map((p) => p.trim());
        const role = parts[0] || '';
        const company = parts[1] || '';
        const isCurrent = /present|current/i.test(line);

        currentExp = {
          role,
          company,
          startDate: dateMatch[0],
          endDate: isCurrent ? 'Present' : '',
          isCurrent
        };
      } else if (isBullet) {
        bullets.push(line.replace(/^[•\-*]\s*/, '').trim());
      } else if (line.length > 25 && currentExp) {
        bullets.push(line);
      }
    }

    if (currentExp && (bullets.length > 0 || currentExp.role || currentExp.company)) {
      experiences.push({
        id: 'exp-' + experiences.length,
        company: currentExp.company || '',
        role: currentExp.role || '',
        startDate: currentExp.startDate || '',
        endDate: currentExp.endDate || '',
        location: currentExp.location || '',
        bullets: [...bullets],
        isCurrent: currentExp.isCurrent || false
      });
    }
  }

  // 5. Education Extraction (strictly parsed, zero fabrication)
  const education: EducationItem[] = [];
  const eduIndex = lines.findIndex((l) => /^(education|academic background|academics|qualifications)/i.test(l));

  if (eduIndex !== -1) {
    const eduSlice = lines.slice(eduIndex + 1);
    for (let i = 0; i < Math.min(eduSlice.length, 20); i++) {
      const line = eduSlice[i];
      if (/^(experience|projects|certifications|skills|awards)/i.test(line)) {
        break;
      }
      if (/(bachelor|master|phd|b\.s|m\.s|b\.tech|m\.tech|bca|mca|degree|diploma|university|college|institute)/i.test(line)) {
        const yearMatch = line.match(/(20\d\d|19\d\d)/);
        education.push({
          id: 'edu-' + education.length,
          institution: line.split(/[-–|,]/)[0]?.trim() || line,
          degree: line.split(/[-–|,]/)[1]?.trim() || '',
          field: '',
          gradYear: yearMatch ? yearMatch[0] : ''
        });
      }
    }
  }

  // 6. Projects & Certifications (strictly from detected headers, zero fabrication)
  const projects: ProjectItem[] = [];
  const projIndex = lines.findIndex((l) => /^(projects|personal projects|key projects)/i.test(l));
  if (projIndex !== -1) {
    const projSlice = lines.slice(projIndex + 1);
    for (let i = 0; i < Math.min(projSlice.length, 15); i++) {
      const line = projSlice[i];
      if (/^(education|experience|certifications|skills)/i.test(line)) break;
      if (line.length > 10 && line.length < 80) {
        projects.push({
          id: 'proj-' + projects.length,
          title: line,
          description: '',
          technologies: []
        });
      }
    }
  }

  const certifications: CertificationItem[] = [];
  const certIndex = lines.findIndex((l) => /^(certifications|licenses|certificates)/i.test(l));
  if (certIndex !== -1) {
    const certSlice = lines.slice(certIndex + 1);
    for (let i = 0; i < Math.min(certSlice.length, 10); i++) {
      const line = certSlice[i];
      if (/^(education|experience|projects|skills)/i.test(line)) break;
      if (line.length > 5 && line.length < 90) {
        certifications.push({
          id: 'cert-' + certifications.length,
          name: line,
          issuer: '',
          issueDate: ''
        });
      }
    }
  }

  return {
    rawText,
    contactInfo: {
      name: detectedName,
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      location: '',
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      github: githubMatch ? githubMatch[0] : '',
      portfolio: portfolioMatch ? portfolioMatch[0] : ''
    },
    headline: detectedHeadline,
    summary,
    skills: {
      technical: technicalSkills,
      soft: softSkills,
      tools,
      domains
    },
    experiences,
    education,
    projects,
    certifications,
    stats: {
      wordCount: wordCount || rawText.split(/\s+/).filter(Boolean).length,
      pageCount: pageCount || 1,
      charCount: charCount || rawText.length,
      lastParsedDate: new Date().toISOString(),
      sourceFileName: fileName
    }
  };
}

/**
 * Maps raw unstructured text or MasterResume into the strict BYOC Target Output Schema
 */
export function mapResumeToTargetSchema(
  resume?: MasterResume | null,
  rawText?: string
): ByocStructuredApplicationData {
  if (!resume && rawText && rawText.trim().length > 0) {
    resume = parseRawResumeToStructured(rawText);
  }

  if (!resume) {
    return {
      personal_details: {
        full_name: '',
        email: '',
        phone: '',
        location: ''
      },
      professional_summary: '',
      work_experience: [],
      skills: [],
      education: []
    };
  }

  return {
    personal_details: {
      full_name: resume.contactInfo?.name || '',
      email: resume.contactInfo?.email || '',
      phone: resume.contactInfo?.phone || '',
      location: resume.contactInfo?.location || ''
    },
    professional_summary: resume.summary || '',
    work_experience: (resume.experiences || []).map((exp) => ({
      company: exp.company || '',
      role: exp.role || '',
      duration: [exp.startDate, exp.endDate].filter(Boolean).join(' - '),
      key_responsibilities: exp.bullets || []
    })),
    skills: Array.from(
      new Set([
        ...(resume.skills?.technical || []),
        ...(resume.skills?.soft || []),
        ...(resume.skills?.tools || []),
        ...(resume.skills?.domains || [])
      ])
    ),
    education: (resume.education || []).map((edu) => ({
      degree: [edu.degree, edu.field].filter(Boolean).join(' in '),
      institution: edu.institution || '',
      year: edu.gradYear || ''
    }))
  };
}

export interface SchemaValidationResult {
  isValid: boolean;
  isComplete: boolean;
  missingMandatoryFields: string[];
  warnings: string[];
  completenessPercent: number;
}

/**
 * Validates extracted career data against the mandatory application schema
 * and provides clear, user-friendly fallback alerts/empty-states.
 */
export function validateExtractedSchema(
  data: ByocStructuredApplicationData | MasterResume | null | undefined
): SchemaValidationResult {
  if (!data) {
    return {
      isValid: false,
      isComplete: false,
      missingMandatoryFields: [
        'Candidate Full Name',
        'Email Address',
        'Professional Summary',
        'Work Experience Milestones',
        'Skills & Competencies'
      ],
      warnings: ['No profile data is currently staged or loaded.'],
      completenessPercent: 0
    };
  }

  const missing: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  const isTargetSchema = 'personal_details' in data;

  const name = isTargetSchema
    ? data.personal_details?.full_name
    : data.contactInfo?.name;
  const email = isTargetSchema
    ? data.personal_details?.email
    : data.contactInfo?.email;
  const phone = isTargetSchema
    ? data.personal_details?.phone
    : data.contactInfo?.phone;
  const summary = isTargetSchema
    ? data.professional_summary
    : data.summary;
  const experiences = isTargetSchema
    ? data.work_experience
    : data.experiences;
  const skills = isTargetSchema
    ? data.skills
    : data.skills?.technical;

  // 1. Mandatory: Candidate Name
  if (!name || name.trim().length === 0 || name.trim().toLowerCase() === 'candidate') {
    missing.push('Candidate Full Name');
    warnings.push('Full name could not be extracted with high confidence.');
  } else {
    score += 20;
  }

  // 2. Mandatory: Email Address
  if (!email || !email.includes('@')) {
    missing.push('Email Address');
    warnings.push('Valid email address is missing from contact details.');
  } else {
    score += 20;
  }

  // Optional: Phone
  if (!phone || phone.trim().length === 0) {
    warnings.push('Phone number is empty. (Optional, recommended for recruiter callbacks)');
  }

  // 3. Mandatory: Professional Summary
  if (!summary || summary.trim().length < 15) {
    missing.push('Professional Summary');
    warnings.push('Professional summary is missing or brief.');
  } else {
    score += 20;
  }

  // 4. Mandatory: Work Experience
  if (!Array.isArray(experiences) || experiences.length === 0) {
    missing.push('Work Experience Milestones');
    warnings.push('No work experience entries detected.');
  } else {
    score += 25;
  }

  // 5. Mandatory: Skills
  if (!Array.isArray(skills) || skills.length === 0) {
    missing.push('Skills & Competencies');
    warnings.push('No technical skills or competencies detected.');
  } else {
    score += 15;
  }

  return {
    isValid: missing.length === 0,
    isComplete: missing.length === 0 && warnings.length === 0,
    missingMandatoryFields: missing,
    warnings,
    completenessPercent: Math.min(100, score)
  };
}
