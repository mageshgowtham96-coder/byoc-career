import { describe, expect, it } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import { getTailoringStrategies } from './groqService';

const job: JobPosting = {
  id: 'job-1', title: 'Customer Support Associate', company: 'Example', location: 'India',
  workplaceType: 'On-site', salary: 'Undisclosed', postedDate: 'Unspecified',
  jobDescriptionRaw: 'Support customers and resolve service requests.', url: 'https://example.com/jobs/1',
  source: 'User Import', skillsRequired: ['Customer Support'], fitScore: null,
  matchedKeywords: [], missingKeywords: [], experienceLevel: 'Entry'
};

const makeProfile = (overrides: Partial<MasterResume> = {}): MasterResume => ({
  rawText: 'Customer support and communication',
  contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: '', summary: 'Customer support candidate with communication skills.',
  skills: { technical: [], soft: ['Communication'], tools: [], domains: ['Customer Support'] },
  experiences: [], education: [], projects: [], certifications: [],
  stats: { wordCount: 5, pageCount: 1, charCount: 30, lastParsedDate: '', sourceFileName: '' },
  ...overrides
});

describe('role-relevant tailoring strategies', () => {
  it('does not force leadership or systems-architecture variants onto a fresher with project evidence', () => {
    const strategies = getTailoringStrategies(job, makeProfile({
      projects: [{ id: 'p1', title: 'Customer Feedback Study', description: 'Reviewed survey responses', technologies: [] }]
    }));
    expect(strategies.map((item) => item.badge)).toEqual(['Projects & Learning', 'ATS Alignment']);
    expect(strategies.some((item) => /leadership|systems|architecture/i.test(item.badge))).toBe(false);
  });

  it('includes experience, project and ATS strategies only when the corresponding evidence exists', () => {
    const strategies = getTailoringStrategies(job, makeProfile({
      experiences: [{ id: 'e1', company: 'Example', role: 'Support Associate', startDate: '2023', endDate: 'Present', location: '', bullets: ['Resolved customer cases'] }],
      projects: [{ id: 'p1', title: 'Feedback Study', description: 'Reviewed survey responses', technologies: [] }]
    }));
    expect(strategies.map((item) => item.badge)).toEqual(['Relevant Experience', 'Projects & Learning', 'ATS Alignment']);
  });

  it('uses certifications and additional career evidence when no employment, project or education records exist', () => {
    const strategies = getTailoringStrategies(job, makeProfile({
      certifications: [{ id: 'c1', name: 'Customer Service Foundations', issuer: 'Open Learning', issueDate: '2025' }],
      additionalEvidence: ['Volunteering: Helped coordinate a community learning centre.', 'Languages: Tamil — Native']
    }));
    expect(strategies.map((item) => item.badge)).toEqual(['Career Evidence', 'ATS Alignment']);
    expect(strategies[0].description).toMatch(/volunteering.*languages/i);
    expect(strategies.some((item) => /do not convert these into invented employment/i.test(item.description))).toBe(true);
  });

});
