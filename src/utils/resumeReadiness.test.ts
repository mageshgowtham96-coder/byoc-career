import { describe, expect, it } from 'vitest';
import { hasCareerEvidence, hasStructuredCareerEvidence } from './resumeReadiness';

const baseProfile = {
  rawText: '',
  contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: '',
  summary: '',
  skills: { technical: [], soft: [], tools: [], domains: [] },
  experiences: [],
  education: [],
  projects: [],
  certifications: [],
  additionalEvidence: [],
  stats: { wordCount: 0, pageCount: 0, charCount: 0, lastParsedDate: '', sourceFileName: '' }
} as any;

describe('career evidence gating', () => {
  it('does not treat raw text or a headline alone as structured candidate evidence', () => {
    expect(hasCareerEvidence({ ...baseProfile, rawText: 'Unparsed resume source text.' })).toBe(true);
    expect(hasStructuredCareerEvidence({ ...baseProfile, rawText: 'Unparsed resume source text.' })).toBe(false);
    expect(hasStructuredCareerEvidence({ ...baseProfile, headline: 'Software Engineer' })).toBe(false);
  });

  it('accepts structured skills, education, projects and additional evidence', () => {
    expect(hasStructuredCareerEvidence({
      ...baseProfile,
      skills: { ...baseProfile.skills, technical: ['SQL'] }
    })).toBe(true);
    expect(hasStructuredCareerEvidence({
      ...baseProfile,
      education: [{ id: 'edu-1', institution: 'City University', degree: 'B.Com', field: '', gradYear: '2025' }]
    })).toBe(true);
    expect(hasStructuredCareerEvidence({
      ...baseProfile,
      additionalEvidence: ['Volunteering: Supported a learning centre.']
    })).toBe(true);
  });
});
