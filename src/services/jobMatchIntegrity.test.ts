import { describe, expect, it } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import { calculateHonestMatch } from './jobSearchService';

const profile = (rawText: string, technical: string[] = []): MasterResume => ({
  rawText,
  contactInfo: { name: 'Test Candidate', email: 'test@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: '', summary: '',
  skills: { technical, soft: [], tools: [], domains: [] },
  experiences: [], education: [], projects: [], certifications: [],
  stats: { wordCount: 1, pageCount: 1, charCount: rawText.length, lastParsedDate: '', sourceFileName: 'test.docx' }
});

const job = (skillsRequired: string[]): JobPosting => ({
  id: 'job-1', title: 'Engineer', company: 'Example', location: 'India',
  workplaceType: 'On-site', salary: 'Undisclosed', postedDate: 'Unspecified',
  jobDescriptionRaw: 'Role requirements', url: 'https://example.com/jobs/1',
  source: 'User Import', skillsRequired, fitScore: null, matchedKeywords: [],
  missingKeywords: [], experienceLevel: 'Unspecified'
});

describe('honest job match semantics', () => {
  it('does not match the short skill Go inside the word ongoing', () => {
    const result = calculateHonestMatch(job(['Go']), profile('Responsible for ongoing operational reviews.'));
    expect(result.matchedKeywords).toEqual([]);
    expect(result.missingKeywords).toEqual(['Go']);
  });

  it('matches short skills only when explicitly listed in structured skills', () => {
    const result = calculateHonestMatch(job(['Go']), profile('Built services using Go and PostgreSQL.', ['Go']));
    expect(result.matchedKeywords).toEqual(['Go']);
  });

  it('matches an exact skill entry but not a substring of a different skill', () => {
    const result = calculateHonestMatch(job(['R']), profile('Experienced analyst.', ['React']));
    expect(result.matchedKeywords).toEqual([]);
    expect(result.missingKeywords).toEqual(['R']);
  });

  it('does not describe keyword overlap as a verified match', () => {
    const result = calculateHonestMatch(job(['SQL']), profile('Used SQL for reporting.', ['SQL']));
    expect(result.statusText.toLowerCase()).toContain('keyword overlap');
    expect(result.statusText.toLowerCase()).not.toContain('verified');
  });

  it('returns insufficient data when profile contains neither structured evidence nor text', () => {
    const result = calculateHonestMatch(job(['SQL']), profile(''));
    expect(result.score).toBeNull();
    expect(result.statusText).toBe('Insufficient profile data');
  });
});
