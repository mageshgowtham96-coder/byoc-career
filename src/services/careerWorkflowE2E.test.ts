import { describe, expect, it } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import { calculateHonestMatch } from './jobSearchService';
import { buildInterviewEvidenceMap, getTailoringStrategies, validateTailoredOutput } from './groqService';
import { generateDocxResume, generatePdfResume } from './exporterService';
import { buildVaultDataFromState, useWizardStore } from '../store/useWizardStore';
import { decryptVault, encryptVault } from '../utils/cryptoVault';

const resume: MasterResume = {
  rawText: 'Original source text remains unchanged.',
  contactInfo: { name: 'Example Candidate', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: 'Operations Analyst',
  summary: 'Commerce graduate with documented operational reporting and data analysis experience.',
  skills: { technical: ['SQL'], soft: ['Communication'], tools: ['Excel'], domains: ['Operations Reporting'] },
  experiences: [{
    id: 'exp-1', company: 'Example Co-op', role: 'Operations Analyst', startDate: '2024', endDate: '2025',
    location: 'Chennai', bullets: ['Prepared weekly operational reports using Excel and SQL.'], isCurrent: false
  }],
  education: [{ id: 'edu-1', institution: 'Example University', degree: 'Bachelor of Commerce', field: 'Commerce', gradYear: '2025' }],
  projects: [{ id: 'proj-1', title: 'Retail Sales Analysis', description: 'Reviewed monthly sales trends using Excel and SQL.', technologies: ['Excel', 'SQL'] }],
  certifications: [],
  additionalEvidence: ['Languages: Tamil — Native.'],
  stats: { wordCount: 40, pageCount: 1, charCount: 220, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: 'example.docx' }
};

const job: JobPosting = {
  id: 'job-ops-1', title: 'Operations Analyst', company: 'Example Employer', location: 'Chennai, India',
  workplaceType: 'Hybrid', salary: 'Undisclosed', postedDate: '2026-11-19',
  jobDescriptionRaw: 'Prepare operational reports and analyze transaction data.',
  url: 'https://example.com/careers/operations-analyst', source: 'User Import',
  skillsRequired: ['SQL', 'Excel'], skillsPreferred: ['Power BI'],
  eligibilityAssessment: { status: 'explicitly-eligible', market: 'IN', evidence: 'India', source: 'published-location' },
  fitScore: null,
  matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified'
};

describe('whole career workflow integration', () => {
  it('carries profile evidence through match, tailoring, export, tracking and encrypted reload', async () => {
    const match = calculateHonestMatch(job, resume);
    expect(match.score).toBe(100);
    expect(match.statusText).toContain('user-specified required skills');

    const strategies = getTailoringStrategies(job, resume);
    const evidence = buildInterviewEvidenceMap(resume);
    const evidenceId = 'experience:exp-1:bullet:0';
    expect(evidence[evidenceId]).toContain('Prepared weekly operational reports');
    const questions = [1, 2, 3].map((n) => ({
      question: `How would you explain the reporting work you completed, example ${n}?`,
      category: 'Behavioral',
      suggestedTalkingPoints: ['Explain the actual context and your contribution.'],
      evidenceId
    }));

    const artifact = validateTailoredOutput({
      variants: strategies.map((strategy) => ({
        name: strategy.name, badge: strategy.badge, description: strategy.description,
        tailoredSummary: resume.summary, highlightedSkills: ['SQL', 'Excel'],
        optimizedBullets: [{
          experienceId: 'exp-1', company: 'Example Co-op', role: 'Operations Analyst',
          originalBullet: 'Prepared weekly operational reports using Excel and SQL.',
          tailoredBullet: 'Prepared weekly operational reports using Excel and SQL.',
          matchRationale: 'Preserves the original reporting evidence.'
        }],
        coverLetter: 'I am interested in the Operations Analyst role.',
        interviewPrepQuestions: questions
      }))
    }, job, resume);

    expect(artifact.optimizedBullets[0].verified).toBe(true);
    expect(artifact.authenticityGuaranteed).toBe(false);
    useWizardStore.setState({ masterResume: resume, jobs: [job], selectedJobId: job.id, tailoredArtifacts: {}, applications: [], toasts: [] });
    useWizardStore.getState().saveTailoredArtifact(job.id, artifact);
    useWizardStore.getState().setTailoredArtifactReviewConfirmed(job.id, true);
    const approved = useWizardStore.getState().tailoredArtifacts[job.id];
    const docx = await generateDocxResume(approved, resume);
    const pdf = await generatePdfResume(approved, resume);
    expect(docx.size).toBeGreaterThan(0);
    expect(pdf.size).toBeGreaterThan(0);

    const application = useWizardStore.getState().applyForJob(job.id, 'Reviewed the exported materials.');
    expect(application?.status).toBe('Saved');
    expect(application?.tailoredResumeSnapshot).toEqual(approved);
    expect(application?.eligibilityAssessment).toEqual(job.eligibilityAssessment);
    const { envelope } = await encryptVault(buildVaultDataFromState(useWizardStore.getState()), 'unit-test-only-passphrase', {
      id: 'example-user', name: 'Example Candidate', email: '', biometricEnabled: false, updatedAt: new Date().toISOString()
    }, 'unit-test-recovery-material');
    const restored = await decryptVault(envelope, 'unit-test-only-passphrase');
    expect(restored.masterResume?.rawText).toBe('Original source text remains unchanged.');
    expect(restored.tailoredArtifacts[job.id].reviewConfirmed).toBe(true);
    expect(restored.applications[0].tailoredResumeSnapshot).toEqual(approved);
    expect(restored.applications[0].eligibilityAssessment).toEqual(job.eligibilityAssessment);
    useWizardStore.setState({ masterResume: null, jobs: [], selectedJobId: null, tailoredArtifacts: {}, applications: [], toasts: [] });
  });
});
