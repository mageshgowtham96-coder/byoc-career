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
});
