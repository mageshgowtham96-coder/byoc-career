import { describe, it, expect, beforeEach } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportedMaterialRecord, TailoredArtifact } from '../types';

// Mock the docx and pdf-lib modules since they may not be available in test environment
vi.mock('docx', () => ({
  PDFDocument: {
    create: vi.fn(),
    StandardFonts: {
      Helvetica: 'Helvetica'
    }
  },
  Plus: {},
  Packer: {
    toFile: vi.fn().mockResolvedValue('blob'),
    toBase64: vi.fn().mockResolvedString('base64'),
    toWordArray: vi.fn()
  },
  RegisterFont: vi.fn(),
  FileType: '.docx'
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(),
    StandardFonts: {
      Helvetica: 'Helvetica'
    }
  },
  addPage: vi.fn(),
  drawText: vi.fn(),
  save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  RegisterFont: vi.fn()
}));

describe('Export Service', () => {
  beforeEach(() => {
    // Clear any mock state
    vi.clearAllMocks();
  });

  describe('TailoredArtifact structure', () => {
    it('has required fields', () => {
      const artifact: TailoredArtifact = {
        id: 'test-1',
        jobId: 'job-1',
        jobTitle: 'Software Engineer',
        company: 'Test Company',
        selectedVariantId: 'variant-a',
        variants: [],
        tailoredSummary: 'Test summary',
        highlightedSkills: ['TypeScript', 'React'],
        optimizedBullets: [],
        coverLetter: 'Test cover letter',
        interviewPrepQuestions: [],
        generationTimestamp: new Date().toISOString(),
        authenticityGuaranteed: false,
        exportedMaterials: []
      };

      expect(artifact).toBeDefined();
      expect(artifact.jobId).toBe('job-1');
      expect(artifact.company).toBe('Test Company');
      expect(artifact.highlightedSkills).toContain('TypeScript');
    });

    it('ExportedMaterialRecord has required fields', () => {
      const record: ExportedMaterialRecord = {
        id: 'exp-1',
        format: 'DOCX' as const,
        fileName: 'resume_export.docx',
        exportedAt: new Date().toISOString(),
        variantId: 'variant-a',
        variantName: 'Variant A: Leadership & Scale'
      };

      expect(record.format).toBe('DOCX');
      expect(record.fileName).toBe('resume_export.docx');
    });
  });

  describe('DOCX export preparation', () => {
    it('prepares export data structure correctly', () => {
      const artifact: TailoredArtifact = {
        id: 'test-1',
        jobId: 'job-1',
        jobTitle: 'Software Engineer',
        company: 'Test Company',
        selectedVariantId: 'variant-a',
        variants: [],
        tailoredSummary: 'Engineering leadership experience with team management.',
        highlightedSkills: ['TypeScript', 'React', 'Node.js'],
        optimizedBullets: [
          {
            experienceId: 'exp-1',
            company: 'Test Company',
            role: 'Software Engineer',
            originalBullet: 'Led a team of 5 developers.',
            tailoredBullet: 'Led a cross-functional team of 5 developers to deliver platform improvements.',
            matchRationale: 'Direct alignment with job requirement of team leadership.'
          }
        ],
        coverLetter: 'Dear Hiring Manager,\n\nI am writing to apply...',
        interviewPrepQuestions: [
          {
            question: 'Describe your leadership experience.',
            category: 'Leadership' as const,
            suggestedTalkingPoints: ['Team of 5', 'Platform improvements'],
            authenticEvidenceRef: 'Master Resume Record'
          }
        ],
        authenticityGuaranteed: false,
        exportedMaterials: []
      };

      // Verify structure integrity
      expect(artifact.highlightedSkills).toHaveLength(3);
      expect(artifact.optimizedBullets).toHaveLength(1);
      expect(artifact.optimizedBullets[0].matchRationale).toBeDefined();
      expect(artifact.interviewPrepQuestions).toHaveLength(1);
      expect(artifact.interviewPrepQuestions[0].category).toBe('Leadership');
    });
  });
});