import { describe, expect, it } from 'vitest';
import { assessResumeReadiness, getCandidateDiscoverySignals, hasCareerEvidence, hasStructuredCareerEvidence } from './resumeReadiness';

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

describe('shared candidate discovery signals', () => {
  it('includes skills, role, education, projects, certifications and additional evidence', () => {
    const signals = getCandidateDiscoverySignals({
      ...baseProfile,
      headline: 'Junior Analyst',
      currentRole: 'Accounts Assistant',
      experiences: [{ role: 'Office Assistant' }],
      education: [{ degree: 'B.Com', field: 'Accounting', institution: 'City College' }],
      projects: [{ title: 'Sales Dashboard', description: 'Ignored narrative', technologies: ['Excel'] }],
      certifications: [{ name: 'Tally Prime', issuer: 'Training Centre' }],
      additionalEvidence: ['Volunteered as a tutor'],
      skills: { technical: ['SQL'], soft: ['Communication'], tools: [], domains: [] }
    });
    expect(signals).toEqual(expect.arrayContaining(['Junior Analyst', 'Accounts Assistant', 'Office Assistant', 'B.Com', 'Accounting', 'Sales Dashboard', 'Excel', 'Tally Prime', 'Volunteered as a tutor']));
    expect(signals).not.toContain('Ignored narrative');
  });
});

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

  it('counts substantial volunteering and other evidence as contribution evidence without requiring employment', () => {
    const result = assessResumeReadiness({
      ...baseProfile,
      contactInfo: { ...baseProfile.contactInfo, name: 'Asha Rao', email: 'asha@example.com' },
      summary: 'Commerce graduate with analytical project and community support experience.',
      skills: { ...baseProfile.skills, technical: ['SQL', 'Excel', 'Power BI'] },
      additionalEvidence: ['Volunteering: Coordinated weekly learning sessions for 20 local students.']
    });
    expect(result.completenessPercent).toBe(100);
    expect(result.missingSections).toEqual([]);
  });
});
