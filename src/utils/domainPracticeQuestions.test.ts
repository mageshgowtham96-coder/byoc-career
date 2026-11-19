import { describe, expect, it } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import { buildDomainPracticeQuestions } from './domainPracticeQuestions';

const profile = (overrides: Partial<MasterResume> = {}): MasterResume => ({
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
  stats: { wordCount: 0, pageCount: 0, charCount: 0, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: '' },
  ...overrides
});

const job = (overrides: Partial<JobPosting> = {}): JobPosting => ({
  id: 'job-1', title: 'Customer Support Specialist', company: 'HelpCo', location: 'Chennai',
  workplaceType: 'On-site', salary: '', postedDate: '', jobDescriptionRaw: 'Resolve customer issues and maintain CRM records.',
  url: '', source: 'Test', skillsRequired: ['CRM', 'Communication'], fitScore: null,
  matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified',
  ...overrides
});

describe('role-neutral interview practice', () => {
  it('adapts prompts to the selected role without assuming architecture or leadership duties', () => {
    const questions = buildDomainPracticeQuestions(profile({
      skills: { technical: ['CRM'], soft: ['Communication'], tools: [], domains: [] }
    }), job());

    expect(questions).toHaveLength(4);
    expect(questions.map((question) => question.category)).toEqual([
      'Role-Specific', 'Technical', 'Behavioral', 'Situational'
    ]);
    expect(questions[0].question).toContain('Customer Support Specialist');
    expect(questions[1].question).toContain('CRM');
    expect(questions.some((question) => /architecture|leadership/i.test(question.title + question.question))).toBe(false);
    expect(questions[0].hasEvidence).toBe(true);
    expect(questions[1].isGenericPractice).toBe(false);
  });

  it('anchors student and career-changer practice to project or education evidence', () => {
    const questions = buildDomainPracticeQuestions(profile({
      headline: 'Commerce Graduate',
      education: [{ id: 'edu-1', institution: 'City University', degree: 'Bachelor of Commerce', field: 'Commerce', gradYear: '2026' }],
      projects: [{ id: 'project-1', title: 'Retail Sales Analysis', description: 'Reviewed sales trends using Excel.', technologies: ['Excel'] }]
    }), null);

    expect(questions[0].hasEvidence).toBe(true);
    expect(questions[0].sampleEvidencePrompt).toContain('Retail Sales Analysis');
    expect(questions[2].sampleEvidencePrompt).toContain('Retail Sales Analysis');
    expect(questions.every((question) => !/Staff \/ Lead|Senior Tier/.test(question.difficulty))).toBe(true);
  });

  it('keeps a blank profile in clearly labelled generic practice mode', () => {
    const questions = buildDomainPracticeQuestions(null, job());
    expect(questions.every((question) => question.isGenericPractice)).toBe(true);
    expect(questions.every((question) => !question.hasEvidence)).toBe(true);
    expect(questions[3].category).toBe('Situational');
  });
});
