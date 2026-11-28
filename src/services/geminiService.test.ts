import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import {
  GeminiApiError,
  callGeminiChat,
  formatGeminiError,
  mergeGeminiResumeProfile,
  validateInterviewPrepQuestions,
  validateJobVetting,
  validateQuestionnaireDraft,
  validateTailoredOutput
} from './geminiService';

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn()
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent }
  }))
}));

const createMasterResume = (): MasterResume => ({
  rawText: 'Original resume text with verified TypeScript experience.',
  contactInfo: {
    name: 'Alex Candidate',
    email: 'alex@example.com',
    phone: '1234567890',
    location: 'Chennai',
    linkedin: '',
    github: '',
    portfolio: ''
  },
  headline: 'Software Engineer',
  summary: 'Builds reliable web applications.',
  skills: { technical: ['TypeScript', 'React'], soft: ['Communication'], tools: ['Git'], domains: ['Web'] },
  experiences: [{
    id: 'exp-1',
    company: 'Acme',
    role: 'Engineer',
    startDate: '2021',
    endDate: 'Present',
    location: 'Chennai',
    bullets: ['Built reliable services with TypeScript.'],
    isCurrent: true
  }],
  education: [],
  projects: [],
  certifications: [],
  stats: { wordCount: 20, pageCount: 1, charCount: 100, lastParsedDate: '2026-11-28', sourceFileName: 'resume.pdf' }
});

const createJob = (): JobPosting => ({
  id: 'job-1',
  title: 'Software Engineer',
  company: 'Acme',
  location: 'Remote',
  workplaceType: 'Remote',
  salary: 'Not specified',
  postedDate: '2026-11-28',
  jobDescriptionRaw: 'Build TypeScript applications and maintain reliable services.',
  url: 'https://example.com/jobs/1',
  source: 'Employer',
  skillsRequired: ['TypeScript', 'React'],
  fitScore: null,
  matchedKeywords: [],
  missingKeywords: [],
  experienceLevel: 'Mid'
});

describe('Gemini service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateContent.mockResolvedValue({ text: '{"ok":true}' });
  });

  describe('GeminiApiError', () => {
    it('preserves status, code, recovery hint, and error name', () => {
      const error = new GeminiApiError('Unauthorized', 401, 'UNAUTHORIZED', 'Check the key');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('GeminiApiError');
      expect(error.message).toBe('Unauthorized');
      expect(error.status).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.recoveryHint).toBe('Check the key');
    });

    it('formats recovery hints and unknown errors', () => {
      expect(formatGeminiError(new GeminiApiError('Rate limited', 429, 'RATE_LIMITED', 'Retry later')))
        .toBe('Rate limited Retry later');
      expect(formatGeminiError(new Error('Network unavailable'))).toBe('Network unavailable');
      expect(formatGeminiError(null, 'Fallback message')).toBe('Fallback message');
    });
  });

  describe('callGeminiChat', () => {
    it('rejects missing API keys before calling the SDK', async () => {
      await expect(callGeminiChat('system', 'user')).rejects.toMatchObject({
        name: 'GeminiApiError',
        status: 401,
        code: 'API_KEY_REQUIRED'
      });
      expect(generateContent).not.toHaveBeenCalled();
    });

    it('sends the system and user prompts to Gemini 2.5 Flash and returns its text', async () => {
      generateContent.mockResolvedValueOnce({ text: '  {"answer":"grounded"}  ' });

      const result = await callGeminiChat('Use only evidence.', 'Candidate evidence.', '  test-api-key  ');

      expect(result).toBe('{"answer":"grounded"}');
      expect(generateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: 'Candidate evidence.',
        config: {
          systemInstruction: 'Use only evidence.',
          temperature: 0.15,
          maxOutputTokens: 3800,
          responseMimeType: 'application/json'
        }
      });
    });

    it('rejects an empty Gemini response with a typed error', async () => {
      generateContent.mockResolvedValueOnce({ text: '   ' });

      await expect(callGeminiChat('system', 'user', 'test-api-key')).rejects.toMatchObject({
        name: 'GeminiApiError',
        status: 502,
        code: 'EMPTY_RESPONSE'
      });
    });
  });

  describe('validateJobVetting', () => {
    it('clamps the fit score and normalizes the recommendation and flag lists', () => {
      const result = validateJobVetting({
        cultureFit: 120,
        redFlags: ['  Unclear salary  ', null],
        greenFlags: [' Transparent expectations '],
        pros: ['Growth'],
        cons: ['Travel'],
        gapAnalysis: { strongAlignments: ['TypeScript'], addressableGaps: [], criticalMissing: [] },
        recommendation: 'Strong Match',
        summaryVerdict: 'Evidence-aligned'
      });

      expect(result.cultureFit).toBe(100);
      expect(result.redFlags).toEqual(['Unclear salary', 'null']);
      expect(result.greenFlags).toEqual(['Transparent expectations']);
      expect(result.pros).toEqual(['Growth']);
      expect(result.cons).toEqual(['Travel']);
      expect(result.recommendation).toBe('Strong Match');
      expect(result.summaryVerdict).toBe('Evidence-aligned');
    });

    it('rejects non-object responses', () => {
      expect(() => validateJobVetting(null)).toThrow(GeminiApiError);
      expect(() => validateJobVetting([])).toThrow(GeminiApiError);
    });
  });

  describe('validateInterviewPrepQuestions', () => {
    it('normalizes valid questions and supplies safe defaults for incomplete items', () => {
      const result = validateInterviewPrepQuestions([
        {
          question: 'Describe a TypeScript service you built.',
          category: 'Technical',
          suggestedTalkingPoints: ['TypeScript', 'Reliability'],
          authenticEvidenceRef: 'Acme experience'
        },
        { question: 'Tell me about a challenge.', category: 'Unrecognized', suggestedTalkingPoints: null }
      ]);

      expect(result).toEqual([
        {
          question: 'Describe a TypeScript service you built.',
          category: 'Technical',
          suggestedTalkingPoints: ['TypeScript', 'Reliability'],
          authenticEvidenceRef: 'Acme experience'
        },
        {
          question: 'Tell me about a challenge.',
          category: 'Technical',
          suggestedTalkingPoints: ['Cite documented milestones from master profile'],
          authenticEvidenceRef: 'Master Resume Record'
        }
      ]);
    });

    it('returns an empty list for non-array input', () => {
      expect(validateInterviewPrepQuestions(null)).toEqual([]);
      expect(validateInterviewPrepQuestions({})).toEqual([]);
    });
  });

  describe('validateQuestionnaireDraft', () => {
    it('accepts a concise answer with exact source evidence', () => {
      const evidence = 'Acme; Engineer; Built reliable services with TypeScript.';
      const result = validateQuestionnaireDraft({
        answer: 'I built reliable services with TypeScript.',
        evidenceUsed: ['Built reliable services with TypeScript.']
      }, evidence);

      expect(result).toEqual({
        answer: 'I built reliable services with TypeScript.',
        evidenceUsed: ['Built reliable services with TypeScript.']
      });
    });

    it('rejects evidence not present in the supplied resume', () => {
      expect(() => validateQuestionnaireDraft({
        answer: 'I led a team of 20.',
        evidenceUsed: ['Led a team of 20.']
      }, 'Built reliable services with TypeScript.')).toThrow(GeminiApiError);
    });

    it('rejects unsupported claims with no cited evidence', () => {
      expect(() => validateQuestionnaireDraft({
        answer: 'I led a team of 20.',
        evidenceUsed: []
      }, 'Built reliable services with TypeScript.')).toThrow(GeminiApiError);
    });
  });

  describe('validateTailoredOutput', () => {
    it('creates three variants and keeps authenticity unguaranteed', () => {
      const job = createJob();
      const resume = createMasterResume();
      const result = validateTailoredOutput({
        variants: [
          { tailoredSummary: 'Leadership summary', highlightedSkills: ['TypeScript'], interviewPrepQuestions: [] },
          { tailoredSummary: 'Systems summary', highlightedSkills: ['React'], interviewPrepQuestions: [] },
          { tailoredSummary: 'ATS summary', highlightedSkills: ['TypeScript'], interviewPrepQuestions: [] }
        ]
      }, job, resume);

      expect(result.variants).toHaveLength(3);
      expect(result.selectedVariantId).toBe('variant-a');
      expect(result.variants[0].highlightedSkills).toEqual(['TypeScript']);
      expect(result.authenticityGuaranteed).toBe(false);
    });

    it('rejects fewer than three variants', () => {
      expect(() => validateTailoredOutput({ variants: [{}] }, createJob(), createMasterResume()))
        .toThrow(GeminiApiError);
    });
  });

  describe('mergeGeminiResumeProfile', () => {
    it('preserves local source text and extraction statistics while merging structured fields', () => {
      const local = createMasterResume();
      const result = mergeGeminiResumeProfile({
        headline: 'Senior Software Engineer',
        summary: 'Structured summary',
        contactInfo: { name: 'Alex Candidate' },
        skills: { technical: ['TypeScript', 'React', 'TypeScript'] }
      }, local);

      expect(result.rawText).toBe(local.rawText);
      expect(result.stats).toBe(local.stats);
      expect(result.headline).toBe('Senior Software Engineer');
      expect(result.summary).toBe('Structured summary');
      expect(result.skills.technical).toEqual(['TypeScript', 'React']);
      expect(result.experiences).toEqual(local.experiences);
    });

    it('rejects malformed top-level responses', () => {
      expect(() => mergeGeminiResumeProfile(null, createMasterResume())).toThrow(GeminiApiError);
    });
  });
});
