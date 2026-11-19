import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWizardStore } from './useWizardStore';
import type { JobPosting, JobVerificationEvidence } from '../types';

const job: JobPosting = {
  id: 'job-1',
  title: 'Data Analyst',
  company: 'Acme Analytics',
  location: 'Chennai, India',
  workplaceType: 'Remote',
  salary: '',
  postedDate: '',
  jobDescriptionRaw: 'Build reports.',
  url: 'https://boards.greenhouse.io/acme/jobs/123456',
  source: 'Greenhouse',
  skillsRequired: [],
  fitScore: null,
  matchedKeywords: [],
  missingKeywords: [],
  experienceLevel: 'Unspecified'
};

const evidence: JobVerificationEvidence = {
  status: 'confirmed',
  provider: 'greenhouse',
  checkedAt: '2026-11-19T00:00:00.000Z',
  postingId: '123456',
  boardToken: 'acme',
  officialTitle: 'Data Analyst',
  officialCompany: 'Acme Analytics',
  evidenceUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456',
  explanation: 'Public ATS record found.',
  riskFlags: [],
  employerIdentityVerified: false
};

describe('job verification evidence persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useWizardStore.setState({ jobs: [], selectedJobId: null });
  });

  afterEach(() => {
    useWizardStore.setState({ jobs: [], selectedJobId: null });
    localStorage.clear();
  });

  it('stores evidence on the selected job and retains it when the same URL is refreshed', () => {
    useWizardStore.getState().setJobs([job]);
    useWizardStore.getState().updateJobVerification(job.id, evidence);

    useWizardStore.getState().setJobs([{ ...job, postedDate: '2026-11-19' }]);

    expect(useWizardStore.getState().jobs[0].verification).toEqual(evidence);
  });

  it('does not carry evidence over to a different posting URL', () => {
    useWizardStore.getState().setJobs([job]);
    useWizardStore.getState().updateJobVerification(job.id, evidence);

    useWizardStore.getState().setJobs([{
      ...job,
      url: 'https://boards.greenhouse.io/acme/jobs/999999'
    }]);

    expect(useWizardStore.getState().jobs[0].verification).toBeUndefined();
  });
});


describe('interview prep question updates', () => {
  it('refreshes questions without replacing or unreviewing an existing tailored resume', () => {
    const existing = {
      id: 'artifact-1',
      jobId: 'job-1',
      jobTitle: 'Data Analyst',
      company: 'Acme Analytics',
      selectedVariantId: 'variant-1',
      variants: [{
        id: 'variant-1',
        name: 'Role-aligned',
        badge: 'Role Alignment',
        description: 'Existing reviewed variant',
        tailoredSummary: 'Existing reviewed summary',
        highlightedSkills: ['SQL'],
        optimizedBullets: [],
        coverLetter: 'Existing reviewed cover letter',
        interviewPrepQuestions: []
      }],
      tailoredSummary: 'Existing reviewed summary',
      highlightedSkills: ['SQL'],
      optimizedBullets: [],
      coverLetter: 'Existing reviewed cover letter',
      interviewPrepQuestions: [],
      generationTimestamp: '2026-11-20T00:00:00.000Z',
      authenticityGuaranteed: false,
      reviewConfirmed: true
    } as any;
    const questions = [{
      question: 'How did you use SQL in a recorded project?',
      category: 'Technical' as const,
      suggestedTalkingPoints: ['Explain the task and your contribution.'],
      authenticEvidenceRef: 'Project: sales analysis using SQL.'
    }];

    useWizardStore.setState({ tailoredArtifacts: { 'job-1': existing } });
    useWizardStore.getState().saveInterviewPrepQuestions('job-1', questions);

    const saved = useWizardStore.getState().tailoredArtifacts['job-1'];
    expect(saved.reviewConfirmed).toBe(true);
    expect(saved.tailoredSummary).toBe('Existing reviewed summary');
    expect(saved.coverLetter).toBe('Existing reviewed cover letter');
    expect(saved.variants[0].tailoredSummary).toBe('Existing reviewed summary');
    expect(saved.interviewPrepQuestions).toEqual(questions);
    expect(saved.variants[0].interviewPrepQuestions).toEqual(questions);
  });
});
