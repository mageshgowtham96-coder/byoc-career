import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportedMaterialRecord, TailoredArtifact, MasterResume } from '../types';
import { dispatchExportFile, generatePlainTextResume, generatePdfResume, generateDocxResume } from '../services/exporterService';

// Mock the docx and pdf-lib modules
vi.mock('docx', () => ({
  Document: vi.fn().mockImplementation(function(this: any, options: any) {
    this.sections = options.sections || [];
    this.children = [];
    return this;
  }),
  Packer: {
    toBlob: vi.fn().mockResolvedValue(new Blob(['mock-docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
    toBase64: vi.fn().mockResolvedValue('base64-mock'),
    toWordArray: vi.fn()
  },
  Paragraph: vi.fn().mockImplementation(function(this: any, options: any) {
    this.options = options;
    return this;
  }),
  TextRun: vi.fn().mockImplementation(function(this: any, options: any) {
    this.options = options;
    return this;
  }),
  HeadingLevel: {
    TITLE: 'TITLE',
    HEADING_1: 'HEADING_1',
    HEADING_2: 'HEADING_2'
  },
  RegisterFont: vi.fn(),
  FileType: '.docx'
}));

vi.mock('pdf-lib', () => {
  const page = {
    getSize: vi.fn().mockReturnValue({ width: 612, height: 792 }),
    drawText: vi.fn(),
    drawLine: vi.fn()
  };
  return {
    PDFDocument: {
      create: vi.fn().mockResolvedValue({
        addPage: vi.fn().mockReturnValue(page),
        embedFont: vi.fn().mockResolvedValue({ widthOfTextAtSize: vi.fn().mockReturnValue(10) }),
        save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
      })
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'Helvetica-Bold',
      HelveticaOblique: 'Helvetica-Oblique'
    },
    rgb: vi.fn((r: number, g: number, b: number) => ({ r, g, b }))
  };
});

vi.mock('../utils/tailoredBulletResolver', () => ({
  resolveTailoredResumeForExportAndPreview: vi.fn().mockImplementation((artifact, resume) => ({
    contactInfo: resume.contactInfo,
    headline: resume.headline,
    summary: resume.summary,
    skills: resume.skills.technical,
    contactLinks: [],
    experiences: artifact.variants[0]?.optimizedBullets?.map((b: any) => ({
      experience: { role: b.role, company: b.company, startDate: b.startDate, endDate: b.endDate, location: b.location },
      bullets: [{ text: b.tailoredBullet || b.originalBullet }]
    })) || [],
    projects: resume.projects,
    education: resume.education,
    certifications: resume.certifications,
    coverLetter: artifact.coverLetter
  }))
}));

describe('Export Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockArtifact = (): TailoredArtifact => ({
    id: 'artifact-1',
    jobId: 'job-1',
    jobTitle: 'Software Engineer',
    company: 'Test Company',
    selectedVariantId: 'variant-a',
    variants: [
      {
        id: 'variant-a',
        name: 'Variant A: Leadership & Scale',
        badge: 'Leadership & Scale',
        description: 'Leadership focus',
        tailoredSummary: 'Leadership summary',
        highlightedSkills: ['TypeScript', 'React'],
        optimizedBullets: [
          {
            experienceId: 'exp-1',
            company: 'Test Company',
            role: 'Senior Engineer',
            originalBullet: 'Led team of 5',
            tailoredBullet: 'Led a cross-functional team of 5 engineers',
            matchRationale: 'Direct leadership experience'
          }
        ],
        coverLetter: 'Dear Hiring Manager...',
        interviewPrepQuestions: []
      }
    ],
    tailoredSummary: 'Leadership summary',
    highlightedSkills: ['TypeScript', 'React'],
    optimizedBullets: [
      {
        experienceId: 'exp-1',
        company: 'Test Company',
        role: 'Senior Engineer',
        originalBullet: 'Led team of 5',
        tailoredBullet: 'Led a cross-functional team of 5 engineers',
        matchRationale: 'Direct leadership experience'
      }
    ],
    coverLetter: 'Dear Hiring Manager...',
    interviewPrepQuestions: [],
    generationTimestamp: new Date().toISOString(),
    authenticityGuaranteed: false,
    exportedMaterials: []
  });

  const createMockResume = (): MasterResume => ({
    rawText: 'Test resume',
    contactInfo: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234',
      location: 'San Francisco, CA',
      linkedin: 'linkedin.com/in/johndoe',
      github: 'github.com/johndoe',
      portfolio: 'johndoe.dev'
    },
    headline: 'Senior Software Engineer',
    summary: 'Experienced engineer with 10+ years...',
    skills: {
      technical: ['TypeScript', 'React', 'Node.js', 'Python'],
      soft: ['Leadership', 'Communication'],
      tools: ['Git', 'Docker', 'VS Code'],
      domains: ['Web Development', 'Cloud']
    },
    experiences: [
      {
        id: 'exp-1',
        company: 'Test Company',
        role: 'Senior Engineer',
        startDate: '2020',
        endDate: 'Present',
        location: 'San Francisco',
        bullets: ['Led team of 5', 'Built scalable systems'],
        isCurrent: true
      }
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Stanford University',
        degree: 'MS Computer Science',
        field: 'Computer Science',
        gradYear: '2015',
        gpa: '3.8'
      }
    ],
    projects: [
      {
        id: 'proj-1',
        title: 'Project Alpha',
        description: 'A great project',
        technologies: ['React', 'Node.js'],
        link: 'https://github.com/project'
      }
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified',
        issuer: 'Amazon',
        issueDate: '2023'
      }
    ],
    stats: {
      wordCount: 500,
      pageCount: 2,
      charCount: 3000,
      lastParsedDate: new Date().toISOString(),
      sourceFileName: 'resume.pdf'
    }
  });

  describe('generatePlainTextResume', () => {
    it('generates non-empty text output with expected sections', () => {
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      const text = generatePlainTextResume(artifact, resume);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain('JOHN DOE');
      expect(text).toContain('Senior Software Engineer');
      expect(text).toContain('john@example.com');
      expect(text).toContain('PROFESSIONAL SUMMARY');
      expect(text).toContain('CORE SKILLS');
      expect(text).toContain('PROFESSIONAL EXPERIENCE');
      expect(text).toContain('Test Company');
      expect(text).toContain('Led a cross-functional team');
    });

    it('includes all major resume sections', () => {
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      const text = generatePlainTextResume(artifact, resume);
      
      expect(text).toContain('EDUCATION');
      expect(text).toContain('Stanford University');
      expect(text).toContain('PROJECTS');
      expect(text).toContain('Project Alpha');
      expect(text).toContain('CERTIFICATIONS');
      expect(text).toContain('AWS Certified');
      expect(text).toContain('TAILORED COVER LETTER');
      expect(text).toContain('Dear Hiring Manager');
    });
  });

  describe('generateDocxResume', () => {
    it('returns a Blob with correct MIME type', async () => {
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      const blob = await generateDocxResume(artifact, resume);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('calls Packer.toBlob with document', async () => {
      const { Packer } = await import('docx');
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      await generateDocxResume(artifact, resume);
      
      expect(Packer.toBlob).toHaveBeenCalled();
    });

    it('handles missing data gracefully', async () => {
      const artifact = { ...createMockArtifact(), coverLetter: '', variants: [] };
      const resume = { ...createMockResume(), experiences: [], projects: [], education: [], certifications: [] };
      
      const blob = await generateDocxResume(artifact, resume);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('generatePdfResume', () => {
    it('returns a Blob with correct MIME type', async () => {
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      const blob = await generatePdfResume(artifact, resume);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/pdf');
    });

    it('calls PDFDocument.save', async () => {
      const { PDFDocument } = await import('pdf-lib');
      const artifact = createMockArtifact();
      const resume = createMockResume();
      
      await generatePdfResume(artifact, resume);
      
      expect(PDFDocument.create).toHaveBeenCalled();
    });

    it('handles empty resume sections', async () => {
      const artifact = createMockArtifact();
      const resume = { ...createMockResume(), experiences: [], projects: [], education: [], certifications: [] };
      
      const blob = await generatePdfResume(artifact, resume);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('dispatchExportFile', () => {
    it('handles blob download fallback when Web Share unavailable', async () => {
      const { dispatchExportFile } = await import('../services/exporterService');
      const blob = new Blob(['test'], { type: 'text/plain' });
      
      // Mock no Web Share API
      Object.defineProperty(global.navigator, 'canShare', { value: false, configurable: true });
      Object.defineProperty(global.navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock'), configurable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
      
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const result = await dispatchExportFile(blob, 'test.txt', 'text/plain');
      expect(result).toBe(true);
      clickSpy.mockRestore();
    });
  });

  describe('ExportedMaterialRecord structure', () => {
    it('validates record structure', () => {
      const record: ExportedMaterialRecord = {
        id: 'exp-1',
        format: 'DOCX',
        fileName: 'resume_export.docx',
        exportedAt: new Date().toISOString(),
        variantId: 'variant-a',
        variantName: 'Variant A: Leadership & Scale'
      };

      expect(record.format).toBe('DOCX');
      expect(record.fileName).toBe('resume_export.docx');
      expect(record.variantId).toBe('variant-a');
      expect(new Date(record.exportedAt)).toBeInstanceOf(Date);
    });

    it('accepts all valid formats', () => {
      const formats: ExportedMaterialRecord['format'][] = ['PDF', 'DOCX', 'TXT'];
      
      formats.forEach(format => {
        const record: ExportedMaterialRecord = {
          id: 'exp-1',
          format,
          fileName: `resume_export.${format.toLowerCase()}`,
          exportedAt: new Date().toISOString()
        };
        expect(record.format).toBe(format);
      });
    });
  });

  describe('TailoredArtifact structure validation', () => {
    it('has all required fields for export', () => {
      const artifact = createMockArtifact();
      
      expect(artifact.id).toBeDefined();
      expect(artifact.jobId).toBeDefined();
      expect(artifact.jobTitle).toBeDefined();
      expect(artifact.company).toBeDefined();
      expect(artifact.selectedVariantId).toBeDefined();
      expect(artifact.variants).toBeInstanceOf(Array);
      expect(artifact.tailoredSummary).toBeDefined();
      expect(artifact.highlightedSkills).toBeInstanceOf(Array);
      expect(artifact.optimizedBullets).toBeInstanceOf(Array);
      expect(artifact.coverLetter).toBeDefined();
      expect(artifact.interviewPrepQuestions).toBeInstanceOf(Array);
      expect(artifact.generationTimestamp).toBeDefined();
      expect(artifact.authenticityGuaranteed).toBe(false);
    });

    it('validates variant structure', () => {
      const artifact = createMockArtifact();
      const variant = artifact.variants[0];
      
      expect(variant.id).toBeDefined();
      expect(variant.name).toBeDefined();
      expect(variant.badge).toBeDefined();
      expect(variant.description).toBeDefined();
      expect(variant.tailoredSummary).toBeDefined();
      expect(variant.highlightedSkills).toBeInstanceOf(Array);
      expect(variant.optimizedBullets).toBeInstanceOf(Array);
      expect(variant.coverLetter).toBeDefined();
      expect(variant.interviewPrepQuestions).toBeInstanceOf(Array);
    });

    it('validates bullet structure', () => {
      const artifact = createMockArtifact();
      const bullet = artifact.optimizedBullets[0];
      
      expect(bullet.experienceId).toBeDefined();
      expect(bullet.company).toBeDefined();
      expect(bullet.role).toBeDefined();
      expect(bullet.originalBullet).toBeDefined();
      expect(bullet.tailoredBullet).toBeDefined();
      expect(bullet.matchRationale).toBeDefined();
    });
  });
});

describe('dispatchExportFile cancellation', () => {
  it('does not report success when the user cancels the native share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Share cancelled', 'AbortError'));
    class TestFile extends Blob {
      name: string;
      constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) { super(parts, options); this.name = name; }
    }
    vi.stubGlobal('File', TestFile);
    const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn().mockReturnValue(true) });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    try {
      const result = await dispatchExportFile(new Blob(['resume']), 'resume.txt', 'text/plain');
      expect(result).toBe(false);
      expect(share).toHaveBeenCalledOnce();
    } finally {
      if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare);
      else Reflect.deleteProperty(navigator, 'canShare');
      if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
      else Reflect.deleteProperty(navigator, 'share');
      vi.unstubAllGlobals();
    }
  });
  it('refuses to silently strip non-Latin resume text from PDF output', async () => {
    const artifact = createMockArtifact();
    const resume = createMockResume();
    resume.contactInfo.name = 'தமிழ் வேட்பாளர்';
    await expect(generatePdfResume(artifact, resume))
      .rejects.toThrow(/cannot safely render.*Unicode|Unicode.*DOCX/i);
  });

});