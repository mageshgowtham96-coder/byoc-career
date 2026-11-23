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

  it('supports role-neutral practice across occupational families, not only IT', () => {
    const occupations = [
      ['Registered Nurse', 'Patient assessment'],
      ['Primary School Teacher', 'Lesson planning'],
      ['Accountant', 'Financial reporting'],
      ['Electrician', 'Electrical safety'],
      ['Manufacturing Technician', 'Quality inspection'],
      ['Agricultural Supervisor', 'Crop management'],
      ['Hotel Front Desk Associate', 'Guest services'],
      ['Chef', 'Food safety'],
      ['Commercial Driver', 'Vehicle safety'],
      ['Paralegal', 'Legal research'],
      ['Public Health Officer', 'Community outreach'],
      ['Graphic Designer', 'Visual communication'],
      ['Laboratory Technician', 'Sample handling'],
      ['Retail Store Manager', 'Inventory control'],
      ['Social Worker', 'Case management'],
      ['Plumber', 'Pipe installation'],
      ['Civil Engineer', 'Site supervision'],
      ['Museum Curator', 'Collections management'],
      ['Financial Adviser', 'Client suitability'],
      ['Human Resources Officer', 'Employee relations'],
      ['Emergency Medical Technician', 'First response'],
      ['Logistics Coordinator', 'Shipment planning']
    ] as const;

    for (const [title, skill] of occupations) {
      const questions = buildDomainPracticeQuestions(profile({
        headline: title,
        skills: { technical: [], soft: ['Communication'], tools: [], domains: [skill] }
      }), job({ title, skillsRequired: [skill] }));

      expect(questions[0].title).toContain(title);
      expect(questions[0].question).toContain(title);
      expect(questions[1].question).toContain(skill);
      expect(questions).toHaveLength(4);
      expect(questions.some((question) =>
        /software architecture|write code|deploy an api|database schema|programming language/i
          .test(question.title + ' ' + question.question + ' ' + question.suggestedFramework)
      )).toBe(false);
    }
  });

  it('keeps a blank profile in clearly labelled generic practice mode', () => {
    const questions = buildDomainPracticeQuestions(null, job());
    expect(questions.every((question) => question.isGenericPractice)).toBe(true);
    expect(questions.every((question) => !question.hasEvidence)).toBe(true);
    expect(questions[3].category).toBe('Situational');
  });
});
