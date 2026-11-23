import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildVaultDataFromState, useWizardStore } from './useWizardStore';
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


describe('Gemini-only vault activation and logout', () => {
  afterEach(() => {
    useWizardStore.setState({ geminiApiKey: '', isAuthenticated: false, masterResume: null, jobs: [], selectedJobId: null, tailoredArtifacts: {}, applications: [], vaultPersistenceError: null });
  });

  it('includes the verified Gemini key in encrypted vault data and no retired provider field', () => {
    const state = { ...useWizardStore.getState(), geminiApiKey: 'AIza-test-key' };
    const vaultData = buildVaultDataFromState(state);
    expect(vaultData.geminiApiKey).toBe('AIza-test-key');
    expect(vaultData).not.toHaveProperty('groqApiKey');
  });

  it('logs out by locking the workspace and clearing the in-memory Gemini key and career data', () => {
    useWizardStore.setState({
      geminiApiKey: 'AIza-test-key',
      isAuthenticated: true,
      masterResume: { rawText: 'Private resume' } as any,
      jobs: [job],
      selectedJobId: job.id,
      tailoredArtifacts: { [job.id]: {} as any },
      applications: [],
      vaultPersistenceError: null
    });

    useWizardStore.getState().signOut();

    expect(useWizardStore.getState().isAuthenticated).toBe(false);
    expect(useWizardStore.getState().geminiApiKey).toBe('');
    expect(useWizardStore.getState().masterResume).toBeNull();
    expect(useWizardStore.getState().jobs).toEqual([]);
    expect(useWizardStore.getState().selectedJobId).toBeNull();
    expect(useWizardStore.getState().tailoredArtifacts).toEqual({});
  });
});

describe('clear Master Resume cleanup', () => {
  it('clears the rollback snapshot as well as the active and staged profiles', () => {
    const saved = { rawText: 'Previous resume', contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' }, headline: '', summary: '', skills: { technical: [], soft: [], tools: [], domains: [] }, experiences: [], education: [], projects: [], certifications: [], additionalEvidence: [], stats: { wordCount: 2, pageCount: 1, charCount: 15, lastParsedDate: '', sourceFileName: '' } } as any;
    useWizardStore.setState({ masterResume: saved, previousMasterResume: saved, stagedParsedResume: saved, careerFormDraft: {} as any, tailoredArtifacts: { old: {} as any } });
    useWizardStore.getState().clearMasterResume();
    expect(useWizardStore.getState().masterResume).toBeNull();
    expect(useWizardStore.getState().previousMasterResume).toBeNull();
    expect(useWizardStore.getState().stagedParsedResume).toBeNull();
    expect(useWizardStore.getState().careerFormDraft).toBeNull();
    expect(useWizardStore.getState().tailoredArtifacts).toEqual({});
  });
});

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


describe('tailored variant evidence references', () => {
  it('switches summary and cover-letter source references with the selected variant', () => {
    const firstSummary = [{ id: 'summary', text: 'Original summary evidence.' }];
    const firstLetter = [{ id: 'skill:0', text: 'Original skill evidence.' }];
    const secondSummary = [{ id: 'experience:exp-1:bullet:0', text: 'Second variant experience evidence.' }];
    const secondLetter = [{ id: 'education:edu-1', text: 'Second variant education evidence.' }];
    const artifact = {
      id: 'artifact-1', jobId: 'job-1', jobTitle: 'Analyst', company: 'Acme',
      selectedVariantId: 'variant-1',
      variants: [
        { id: 'variant-1', name: 'Role', badge: 'Role', description: '', tailoredSummary: 'First', summaryEvidence: firstSummary, highlightedSkills: [], optimizedBullets: [], coverLetter: 'First letter', coverLetterEvidence: firstLetter, interviewPrepQuestions: [] },
        { id: 'variant-2', name: 'Evidence', badge: 'Evidence', description: '', tailoredSummary: 'Second', summaryEvidence: secondSummary, highlightedSkills: [], optimizedBullets: [], coverLetter: 'Second letter', coverLetterEvidence: secondLetter, interviewPrepQuestions: [] }
      ],
      tailoredSummary: 'First', summaryEvidence: firstSummary, highlightedSkills: [], optimizedBullets: [],
      coverLetter: 'First letter', coverLetterEvidence: firstLetter, interviewPrepQuestions: [],
      generationTimestamp: '2026-11-20T00:00:00.000Z', authenticityGuaranteed: false, reviewConfirmed: true
    } as any;
    useWizardStore.setState({ tailoredArtifacts: { 'job-1': artifact }, toasts: [] });

    useWizardStore.getState().selectTailoredVariant('job-1', 'variant-2');

    const saved = useWizardStore.getState().tailoredArtifacts['job-1'];
    expect(saved.summaryEvidence).toEqual(secondSummary);
    expect(saved.coverLetterEvidence).toEqual(secondLetter);
    expect(saved.reviewConfirmed).toBe(false);
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

  it('invalidates interview questions and review approval when Master Resume evidence changes', () => {
    const existing = {
      id: 'artifact-1', jobId: 'job-1', jobTitle: 'Data Analyst', company: 'Acme',
      selectedVariantId: 'variant-1',
      variants: [{ id: 'variant-1', name: 'Role', badge: 'Role', description: '', tailoredSummary: 'Old summary', summaryEvidence: [{ id: 'summary', text: 'Old summary evidence.' }], highlightedSkills: [], optimizedBullets: [], coverLetter: 'Old letter', coverLetterEvidence: [{ id: 'experience:exp-1:bullet:0', text: 'Old bullet evidence.' }], interviewPrepQuestions: [{ question: 'Old question', category: 'Technical', suggestedTalkingPoints: ['Old point'], authenticEvidenceRef: 'Old source' }] }],
      tailoredSummary: 'Old summary', summaryEvidence: [{ id: 'summary', text: 'Old summary evidence.' }], highlightedSkills: [], optimizedBullets: [], coverLetter: 'Old letter',
      coverLetterEvidence: [{ id: 'experience:exp-1:bullet:0', text: 'Old bullet evidence.' }],
      interviewPrepQuestions: [{ question: 'Old question', category: 'Technical', suggestedTalkingPoints: ['Old point'], authenticEvidenceRef: 'Old source' }],
      generationTimestamp: '2026-11-20T00:00:00.000Z', authenticityGuaranteed: false, reviewConfirmed: true
    } as any;
    const master = {
      rawText: 'Asha Rao', contactInfo: { name: 'Asha Rao', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: 'Updated career summary',
      skills: { technical: [], soft: [], tools: [], domains: [] }, experiences: [], education: [], projects: [],
      certifications: [], additionalEvidence: [],
      stats: { wordCount: 2, pageCount: 1, charCount: 8, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: '' }
    } as any;
    useWizardStore.setState({ masterResume: master, tailoredArtifacts: { 'job-1': existing } });

    useWizardStore.getState().updateMasterResume((previous) => ({ ...previous, summary: 'A changed summary.' }));

    const saved = useWizardStore.getState().tailoredArtifacts['job-1'];
    expect(saved.reviewConfirmed).toBe(false);
    expect(saved.interviewPrepQuestions).toEqual([]);
    expect(saved.variants[0].interviewPrepQuestions).toEqual([]);
    expect(saved.summaryEvidence).toEqual([]);
    expect(saved.coverLetterEvidence).toEqual([]);
    expect(saved.variants[0].summaryEvidence).toEqual([]);
    expect(saved.variants[0].coverLetterEvidence).toEqual([]);
  });

});


describe('Master Resume rollback snapshot', () => {
  it('keeps the replaced resume in encrypted vault data and allows restoring it', () => {
    const previous = {
      rawText: 'Original career evidence',
      contactInfo: { name: 'Candidate', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: 'Original role', summary: 'Original summary',
      skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [], additionalEvidence: [],
      stats: { wordCount: 3, pageCount: 1, charCount: 24, lastParsedDate: '2026-11-21T00:00:00.000Z', sourceFileName: 'original.docx' }
    } as any;
    const imported = { ...previous, rawText: 'Imported career evidence', headline: 'Imported role' };
    useWizardStore.setState({ masterResume: previous, previousMasterResume: null, stagedParsedResume: imported, tailoredArtifacts: {} });
    useWizardStore.getState().confirmStagedResume();
    expect(useWizardStore.getState().masterResume).toEqual(imported);
    expect(useWizardStore.getState().previousMasterResume).toEqual(previous);
    expect(buildVaultDataFromState(useWizardStore.getState()).previousMasterResume).toEqual(previous);
    useWizardStore.getState().restorePreviousMasterResume();
    expect(useWizardStore.getState().masterResume).toEqual(previous);
    expect(useWizardStore.getState().previousMasterResume).toEqual(imported);
    useWizardStore.setState({ masterResume: null, previousMasterResume: null, stagedParsedResume: null, tailoredArtifacts: {} });
  });
});
