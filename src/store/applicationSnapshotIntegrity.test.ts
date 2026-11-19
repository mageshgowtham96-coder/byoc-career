import { describe, expect, it } from 'vitest';
import type { JobPosting } from '../types';
import { buildApplicationSnapshotRecord } from './useWizardStore';

const job: JobPosting = {
  id: 'job-1', title: 'Analyst', company: 'Example', location: 'India',
  workplaceType: 'On-site', salary: 'Undisclosed', postedDate: 'Unspecified',
  jobDescriptionRaw: 'Analyst role', url: 'https://example.com/jobs/1',
  source: 'User Import', skillsRequired: ['SQL'], fitScore: null,
  matchedKeywords: [], missingKeywords: ['SQL'], experienceLevel: 'Unspecified'
};

describe('application snapshot authenticity', () => {
  it('does not claim a baseline resume is independently verified', () => {
    const snapshot = buildApplicationSnapshotRecord({ job, masterResumeSummary: 'Analyst profile' });
    expect(snapshot.tailoredResumeSnapshot.authenticityGuaranteed).toBe(false);
  });
  it('treats a student profile with education and projects as a usable Master Resume', async () => {
    const { useWizardStore } = await import('./useWizardStore');
    const student = {
      rawText: '',
      contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: 'Commerce Student', summary: 'Final-year commerce student interested in financial operations.',
      skills: { technical: [], soft: ['Communication'], tools: ['Excel'], domains: ['Data Analysis'] },
      experiences: [],
      education: [{ id: 'edu-1', institution: 'City University', degree: 'B.Com', field: 'Commerce', gradYear: '2026' }],
      projects: [{ id: 'proj-1', title: 'Sales Analysis', description: 'Analysed retail sales data.', technologies: ['Excel'] }],
      certifications: [],
      stats: { wordCount: 0, pageCount: 1, charCount: 0, lastParsedDate: '', sourceFileName: '' }
    };
    useWizardStore.setState({ masterResume: student });
    expect(useWizardStore.getState().hasMasterResume()).toBe(true);
    useWizardStore.setState({ masterResume: null });
  });

});