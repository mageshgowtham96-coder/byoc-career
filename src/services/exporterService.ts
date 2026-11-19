import type { MasterResume, TailoredArtifact, TailoredVariant, JobPosting } from '../types';
import type { Paragraph } from 'docx';
import { resolveTailoredResumeForExportAndPreview } from '../utils/tailoredBulletResolver';

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'txt';
  artifact: TailoredArtifact;
  masterResume: MasterResume;
  targetJob?: JobPosting | null;
}


/**
 * Adapts an approved Master Resume into the existing structured document exporter.
 * This is not a job-specific artifact: every source section remains the user's profile.
 */
export function createMasterResumeExportArtifact(resume: MasterResume): TailoredArtifact {
  const highlightedSkills = [
    ...resume.skills.technical,
    ...resume.skills.soft,
    ...resume.skills.tools,
    ...resume.skills.domains
  ].filter((skill, index, all) => Boolean(skill.trim()) && all.indexOf(skill) === index);
  const optimizedBullets = resume.experiences.flatMap((experience) =>
    experience.bullets.map((bullet) => ({
      experienceId: experience.id,
      company: experience.company,
      role: experience.role,
      originalBullet: bullet,
      tailoredBullet: bullet,
      matchRationale: 'Original user-approved Master Resume evidence.'
    }))
  );
  const variant: TailoredVariant = {
    id: 'master-resume',
    name: 'Master Resume',
    badge: 'Master Resume',
    description: 'User-approved career profile, not tailored to a specific vacancy.',
    tailoredSummary: resume.summary,
    highlightedSkills,
    optimizedBullets,
    coverLetter: '',
    interviewPrepQuestions: []
  };
  return {
    id: 'master-' + resume.stats.lastParsedDate,
    jobId: 'master-resume',
    jobTitle: resume.headline || resume.currentRole || 'Master Resume',
    company: '',
    selectedVariantId: variant.id,
    variants: [variant],
    tailoredSummary: resume.summary,
    highlightedSkills,
    optimizedBullets,
    coverLetter: '',
    interviewPrepQuestions: [],
    generationTimestamp: new Date().toISOString(),
    authenticityGuaranteed: false,
    reviewConfirmed: true
  };
}

/**
 * Universal Mobile-Aware File Dispatcher
 * Checks navigator.canShare() to seamlessly offer iOS / Android Web Share sheet fallback
 */
export async function dispatchExportFile(blob: Blob, filename: string, mimeType: string): Promise<boolean> {
  // Check if Web Share API is available and can share files (iOS Safari & Android Chrome)
  if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: filename,
            text: `BYOC Tailored Career Artifact: ${filename}`
          });
          return true;
        } catch (err: unknown) {
          if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') {
            // User cancelled the share sheet; do not report a successful export.
            return false;
          }
          console.warn('Web Share failed, falling back to blob download anchor:', err);
        }
      }
    } catch {
      // File constructor or canShare not supported; proceed to blob download fallback
    }
  }

  // Standard Blob Download Trigger
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 2000);
    return true;
  } catch (downloadErr) {
    console.error('Download dispatch error:', downloadErr);
    return false;
  }
}

/**
 * Clean Text (.txt) Generator
 */
export function generatePlainTextResume(artifact: TailoredArtifact, resume: MasterResume): string {
  const resolved = resolveTailoredResumeForExportAndPreview(artifact, resume);
  const lines: string[] = [];

  // Header
  if (resolved.contactInfo.name) {
    lines.push(resolved.contactInfo.name.toUpperCase());
  }
  if (resolved.headline) {
    lines.push(resolved.headline);
  }
  const contactLine = [
    resolved.contactInfo.email,
    resolved.contactInfo.phone,
    resolved.contactInfo.location
  ]
    .filter(Boolean)
    .join(' | ');
  if (contactLine) lines.push(contactLine);
  resolved.contactLinks.forEach((link) => lines.push(link));
  lines.push('\n' + '='.repeat(50) + '\n');

  // Professional Summary
  if (resolved.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(resolved.summary);
    lines.push('\n' + '-'.repeat(50) + '\n');
  }

  // Highlighted & Master Core Competencies
  if (resolved.skills.length > 0) {
    lines.push('CORE SKILLS & TECHNOLOGIES');
    lines.push(resolved.skills.join('  •  '));
    lines.push('\n' + '-'.repeat(50) + '\n');
  }

  // Professional Experience (all entries & all unmatched original bullets preserved)
  lines.push('PROFESSIONAL EXPERIENCE');
  resolved.experiences.forEach(({ experience: exp, bullets }) => {
    lines.push(`\n${exp.role.toUpperCase()} — ${exp.company}`);
    const dateLoc = [
      [exp.startDate, exp.endDate].filter(Boolean).join(' - '),
      exp.location
    ]
      .filter(Boolean)
      .join(' | ');
    if (dateLoc) lines.push(dateLoc);

    bullets.forEach((bullet) => {
      lines.push(`  • ${bullet.text}`);
    });
  });

  // Projects
  if (resolved.projects.length > 0) {
    lines.push('\n' + '-'.repeat(50) + '\n');
    lines.push('PROJECTS');
    resolved.projects.forEach((proj) => {
      const titleLine = proj.link ? `${proj.title} (${proj.link})` : proj.title;
      lines.push(`\n${titleLine}`);
      if (proj.technologies && proj.technologies.length > 0) {
        lines.push(`Technologies: ${proj.technologies.join(', ')}`);
      }
      if (proj.description) {
        lines.push(proj.description);
      }
    });
  }

  // Education
  if (resolved.education.length > 0) {
    lines.push('\n' + '-'.repeat(50) + '\n');
    lines.push('EDUCATION');
    resolved.education.forEach((edu) => {
      const degreeLabel = edu.field ? `${edu.degree} in ${edu.field}` : edu.degree;
      const yearPart = edu.gradYear ? ` (${edu.gradYear})` : '';
      const gpaPart = edu.gpa ? ` | GPA: ${edu.gpa}` : '';
      lines.push(`${degreeLabel} — ${edu.institution}${yearPart}${gpaPart}`);
    });
  }

  // Certifications
  if (resolved.certifications.length > 0) {
    lines.push('\n' + '-'.repeat(50) + '\n');
    lines.push('CERTIFICATIONS');
    resolved.certifications.forEach((cert) => {
      const meta = [cert.issuer, cert.issueDate].filter(Boolean).join(', ');
      lines.push(meta ? `${cert.name} — ${meta}` : cert.name);
    });
  }

  if (resolved.additionalEvidence.length > 0) {
    lines.push('\n' + '-'.repeat(50) + '\n');
    lines.push('ADDITIONAL CAREER EVIDENCE');
    resolved.additionalEvidence.forEach((item) => lines.push(item));
  }

  // Cover Letter Section if generated
  if (resolved.coverLetter) {
    lines.push('\n\n' + '='.repeat(50));
    lines.push('TAILORED COVER LETTER');
    lines.push('='.repeat(50) + '\n');
    lines.push(resolved.coverLetter);
  }

  return lines.join('\n');
}

function toPdfSafeText(text: string): string {
  const normalized = (text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\u2192/g, '->');
  const supportedExtendedCharacters = new Set([
    0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022
  ]);
  const unsupported = Array.from(normalized).find((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint > 0xff && !supportedExtendedCharacters.has(codePoint);
  });
  if (unsupported) {
    throw new Error(
      'PDF export cannot safely render this Unicode script with the built-in standard fonts. Export as DOCX to preserve every character; the original and approved resume data remain unchanged.'
    );
  }
  return normalized.replace(/[^\x20-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g, ' ');
}

/**
 * Standard PDF Generator using pdf-lib with clean margins & layout
 */
export async function generatePdfResume(artifact: TailoredArtifact, resume: MasterResume): Promise<Blob> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const resolved = resolveTailoredResumeForExportAndPreview(artifact, resume);
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]); // Standard US Letter (points)
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 45;
  const contentWidth = width - margin * 2;
  let cursorY = height - margin;

  function checkPageSpace(requiredSpace: number) {
    if (cursorY - requiredSpace < margin) {
      page = pdfDoc.addPage([612, 792]);
      cursorY = height - margin;
    }
  }

  // Draw Header Name
  page.drawText(toPdfSafeText(resolved.contactInfo.name || 'Candidate'), {
    x: margin,
    y: cursorY,
    size: 18,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16)
  });
  cursorY -= 18;

  if (resolved.headline) {
    const headlineLines = wrapText(toPdfSafeText(resolved.headline), contentWidth, 9.5, fontOblique);
    headlineLines.forEach((line) => {
      checkPageSpace(14);
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 9.5,
        font: fontOblique,
        color: rgb(0.25, 0.3, 0.4)
      });
      cursorY -= 13;
    });
  }

  // Contact Info Line
  const contactParts = [
    resolved.contactInfo.email,
    resolved.contactInfo.phone,
    resolved.contactInfo.location
  ].filter(Boolean);

  if (contactParts.length > 0) {
    const contactLines = wrapText(toPdfSafeText(contactParts.join('  |  ')), contentWidth, 9, fontRegular);
    contactLines.forEach((line) => {
      checkPageSpace(14);
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 9,
        font: fontRegular,
        color: rgb(0.35, 0.4, 0.5)
      });
      cursorY -= 14;
    });
  }

  if (resolved.contactLinks.length > 0) {
    const linkLines = wrapText(toPdfSafeText(resolved.contactLinks.join('  |  ')), contentWidth, 8.5, fontRegular);
    linkLines.forEach((line) => {
      checkPageSpace(14);
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.2, 0.4, 0.8)
      });
      cursorY -= 14;
    });
  }

  // Divider Line
  cursorY -= 2;
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: width - margin, y: cursorY },
    thickness: 1,
    color: rgb(0.8, 0.85, 0.9)
  });
  cursorY -= 16;

  // Section Heading Helper
  function drawSectionHeader(title: string) {
    checkPageSpace(30);
    page.drawText(toPdfSafeText(title.toUpperCase()), {
      x: margin,
      y: cursorY,
      size: 10.5,
      font: fontBold,
      color: rgb(0.25, 0.35, 0.8)
    });
    cursorY -= 5;
    page.drawLine({
      start: { x: margin, y: cursorY },
      end: { x: width - margin, y: cursorY },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92)
    });
    cursorY -= 12;
  }

  // Professional Summary
  if (resolved.summary) {
    drawSectionHeader('Executive Summary');
    const summaryLines = wrapText(toPdfSafeText(resolved.summary), contentWidth, 9, fontRegular);
    summaryLines.forEach((line) => {
      checkPageSpace(14);
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.25)
      });
      cursorY -= 13;
    });
    cursorY -= 8;
  }

  // Core Competencies
  if (resolved.skills.length > 0) {
    drawSectionHeader('Target Core Competencies');
    const skillsLine = toPdfSafeText(resolved.skills.join('  •  '));
    const skillLines = wrapText(skillsLine, contentWidth, 8.5, fontRegular);
    skillLines.forEach((line) => {
      checkPageSpace(13);
      page.drawText(line, {
        x: margin,
        y: cursorY,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.3)
      });
      cursorY -= 12;
    });
    cursorY -= 8;
  }

  // Professional Experience
  if (resolved.experiences.length > 0) {
    drawSectionHeader('Tailored Professional Experience');
    resolved.experiences.forEach(({ experience: exp, bullets }) => {
      checkPageSpace(45);

      const headerLeft = toPdfSafeText(`${exp.role}  —  ${exp.company}`);
      const dateLoc = toPdfSafeText(
        [[exp.startDate, exp.endDate].filter(Boolean).join(' - '), exp.location].filter(Boolean).join('  |  ')
      );
      const leftWidth = fontBold.widthOfTextAtSize(headerLeft, 10);
      const dateWidth = dateLoc ? fontOblique.widthOfTextAtSize(dateLoc, 8.5) : 0;

      if (leftWidth + dateWidth + 12 <= contentWidth) {
        page.drawText(headerLeft, {
          x: margin,
          y: cursorY,
          size: 10,
          font: fontBold,
          color: rgb(0.1, 0.15, 0.2)
        });
        if (dateLoc) {
          page.drawText(dateLoc, {
            x: width - margin - dateWidth,
            y: cursorY,
            size: 8.5,
            font: fontOblique,
            color: rgb(0.4, 0.45, 0.5)
          });
        }
        cursorY -= 14;
      } else {
        wrapText(headerLeft, contentWidth, 10, fontBold).forEach((line) => {
          checkPageSpace(14);
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: 10,
            font: fontBold,
            color: rgb(0.1, 0.15, 0.2)
          });
          cursorY -= 13;
        });
        if (dateLoc) {
          checkPageSpace(13);
          page.drawText(dateLoc, {
            x: margin,
            y: cursorY,
            size: 8.5,
            font: fontOblique,
            color: rgb(0.4, 0.45, 0.5)
          });
          cursorY -= 13;
        }
      }

      bullets.forEach((bullet) => {
        const bulletLines = wrapText(toPdfSafeText(bullet.text), contentWidth - 14, 8.5, fontRegular);
        bulletLines.forEach((bLine, idx) => {
          checkPageSpace(12);
          if (idx === 0) {
            page.drawText('•', {
              x: margin + 3,
              y: cursorY,
              size: 9,
              font: fontBold,
              color: rgb(0.35, 0.4, 0.8)
            });
          }
          page.drawText(bLine, {
            x: margin + 14,
            y: cursorY,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.2, 0.25, 0.3)
          });
          cursorY -= 11.5;
        });
        cursorY -= 2;
      });

      cursorY -= 6;
    });
  }

  // Projects
  if (resolved.projects.length > 0) {
    drawSectionHeader('Projects');
    resolved.projects.forEach((proj) => {
      checkPageSpace(30);
      const titleText = toPdfSafeText(proj.link ? `${proj.title}  —  ${proj.link}` : proj.title);
      wrapText(titleText, contentWidth, 9.5, fontBold).forEach((line) => {
        checkPageSpace(13);
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 9.5,
          font: fontBold,
          color: rgb(0.12, 0.17, 0.24)
        });
        cursorY -= 12.5;
      });

      if (proj.technologies && proj.technologies.length > 0) {
        const techLines = wrapText(
          toPdfSafeText(`Technologies: ${proj.technologies.join(', ')}`),
          contentWidth,
          8.5,
          fontOblique
        );
        techLines.forEach((line) => {
          checkPageSpace(12);
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: 8.5,
            font: fontOblique,
            color: rgb(0.35, 0.4, 0.5)
          });
          cursorY -= 11.5;
        });
      }

      if (proj.description) {
        wrapText(toPdfSafeText(proj.description), contentWidth, 8.5, fontRegular).forEach((line) => {
          checkPageSpace(12);
          page.drawText(line, {
            x: margin,
            y: cursorY,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.2, 0.25, 0.3)
          });
          cursorY -= 11.5;
        });
      }
      cursorY -= 5;
    });
  }

  // Education
  if (resolved.education.length > 0) {
    drawSectionHeader('Education & Credentials');
    resolved.education.forEach((edu) => {
      checkPageSpace(20);
      const degreeLabel = edu.field ? `${edu.degree} in ${edu.field}` : edu.degree;
      const gpaSuffix = edu.gpa ? `  (GPA: ${edu.gpa})` : '';
      const eduText = toPdfSafeText(`${degreeLabel}  —  ${edu.institution}${gpaSuffix}`);
      const yearText = toPdfSafeText(edu.gradYear || '');
      const yearWidth = yearText ? fontRegular.widthOfTextAtSize(yearText, 8.5) : 0;

      const eduLines = wrapText(eduText, contentWidth - yearWidth - 10, 9, fontBold);
      eduLines.forEach((line, idx) => {
        checkPageSpace(14);
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 9,
          font: fontBold,
          color: rgb(0.15, 0.2, 0.25)
        });
        if (idx === 0 && yearText) {
          page.drawText(yearText, {
            x: width - margin - yearWidth,
            y: cursorY,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.4, 0.45, 0.5)
          });
        }
        cursorY -= 13;
      });
      cursorY -= 2;
    });
    cursorY -= 4;
  }

  // Certifications
  if (resolved.certifications.length > 0) {
    drawSectionHeader('Certifications');
    resolved.certifications.forEach((cert) => {
      checkPageSpace(16);
      const meta = [cert.issuer, cert.issueDate].filter(Boolean).join('  |  ');
      const certLine = toPdfSafeText(meta ? `${cert.name}  —  ${meta}` : cert.name);
      wrapText(certLine, contentWidth, 8.5, fontRegular).forEach((line) => {
        checkPageSpace(13);
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.15, 0.2, 0.25)
        });
        cursorY -= 12;
      });
    });
  }

  if (resolved.additionalEvidence.length > 0) {
    drawSectionHeader('Additional Career Evidence');
    resolved.additionalEvidence.forEach((item) => {
      wrapText(toPdfSafeText(item), contentWidth, 8.5, fontRegular).forEach((line) => {
        checkPageSpace(13);
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.15, 0.2, 0.25)
        });
        cursorY -= 12;
      });
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
}

/**
 * Real DOCX Generator using the official 'docx' package
 */
export async function generateDocxResume(artifact: TailoredArtifact, resume: MasterResume): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const resolved = resolveTailoredResumeForExportAndPreview(artifact, resume);
  const children: Paragraph[] = [];

  // Header Title
  children.push(
    new Paragraph({
      text: resolved.contactInfo.name || 'Candidate',
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 }
    })
  );

  if (resolved.headline) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resolved.headline,
            italics: true,
            size: 20,
            color: '444444'
          })
        ],
        spacing: { after: 80 }
      })
    );
  }

  // Contact line + all contact links
  const contactInfo = [
    resolved.contactInfo.email,
    resolved.contactInfo.phone,
    resolved.contactInfo.location,
    ...resolved.contactLinks
  ]
    .filter(Boolean)
    .join('  |  ');

  if (contactInfo) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactInfo,
            size: 19,
            color: '555555'
          })
        ],
        spacing: { after: 200 }
      })
    );
  }

  // Executive Summary Heading
  if (resolved.summary) {
    children.push(
      new Paragraph({
        text: 'EXECUTIVE SUMMARY',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resolved.summary,
            size: 21
          })
        ],
        spacing: { after: 200 }
      })
    );
  }

  // Skills Heading
  if (resolved.skills.length > 0) {
    children.push(
      new Paragraph({
        text: 'CORE COMPETENCIES',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resolved.skills.join('  •  '),
            size: 20
          })
        ],
        spacing: { after: 200 }
      })
    );
  }

  // Experience Heading (all entries & all unmatched original bullets preserved)
  if (resolved.experiences.length > 0) {
    children.push(
      new Paragraph({
        text: 'PROFESSIONAL EXPERIENCE',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    resolved.experiences.forEach(({ experience: exp, bullets }) => {
      const dateLoc = [
        [exp.startDate, exp.endDate].filter(Boolean).join(' - '),
        exp.location
      ]
        .filter(Boolean)
        .join(' | ');

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${exp.role}  —  ${exp.company}`,
              bold: true,
              size: 22
            }),
            ...(dateLoc
              ? [
                  new TextRun({
                    text: `\t${dateLoc}`,
                    italics: true,
                    size: 19,
                    color: '666666'
                  })
                ]
              : [])
          ],
          spacing: { before: 120, after: 80 }
        })
      );

      bullets.forEach((bullet) => {
        children.push(
          new Paragraph({
            text: bullet.text,
            bullet: { level: 0 },
            spacing: { after: 60 }
          })
        );
      });
    });
  }

  // Projects
  if (resolved.projects.length > 0) {
    children.push(
      new Paragraph({
        text: 'PROJECTS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    resolved.projects.forEach((proj) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: proj.link ? `${proj.title}  —  ${proj.link}` : proj.title,
              bold: true,
              size: 21
            })
          ],
          spacing: { before: 80, after: 40 }
        })
      );

      if (proj.technologies && proj.technologies.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Technologies: ${proj.technologies.join(', ')}`,
                italics: true,
                size: 19,
                color: '555555'
              })
            ],
            spacing: { after: 40 }
          })
        );
      }

      if (proj.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: proj.description, size: 20 })],
            spacing: { after: 80 }
          })
        );
      }
    });
  }

  // Education
  if (resolved.education.length > 0) {
    children.push(
      new Paragraph({
        text: 'EDUCATION',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    resolved.education.forEach((edu) => {
      const degreeLabel = edu.field ? `${edu.degree} in ${edu.field}` : edu.degree;
      const yearPart = edu.gradYear ? ` (${edu.gradYear})` : '';
      const gpaPart = edu.gpa ? ` | GPA: ${edu.gpa}` : '';
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${degreeLabel}  —  ${edu.institution}${yearPart}${gpaPart}`,
              size: 20
            })
          ],
          spacing: { after: 60 }
        })
      );
    });
  }

  // Certifications
  if (resolved.certifications.length > 0) {
    children.push(
      new Paragraph({
        text: 'CERTIFICATIONS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    resolved.certifications.forEach((cert) => {
      const meta = [cert.issuer, cert.issueDate].filter(Boolean).join(', ');
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: meta ? `${cert.name}  —  ${meta}` : cert.name,
              size: 20
            })
          ],
          spacing: { after: 60 }
        })
      );
    });
  }

  if (resolved.additionalEvidence.length > 0) {
    children.push(new Paragraph({
      text: 'ADDITIONAL CAREER EVIDENCE',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 }
    }));
    resolved.additionalEvidence.forEach((item) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: item, size: 20 })],
        spacing: { after: 60 }
      }));
    });
  }

  // Cover Letter Section if available
  if (resolved.coverLetter) {
    children.push(
      new Paragraph({
        text: 'TAILORED COVER LETTER',
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        spacing: { before: 200, after: 150 }
      })
    );

    const letterParagraphs = resolved.coverLetter.split('\n\n');
    letterParagraphs.forEach((p) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: p, size: 21 })],
          spacing: { after: 120 }
        })
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

/**
 * Text line wrapping helper for canvas/PDF coordinates
 */
function wrapText(text: string, maxWidth: number, fontSize: number, font: { widthOfTextAtSize: (t: string, s: number) => number }): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
