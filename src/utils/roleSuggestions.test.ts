import { describe, expect, it } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import { getRoleSuggestions } from './roleSuggestions';

const cachedJob = (title: string): JobPosting => ({
  id: 'cached-1', title, company: 'Example', location: 'Remote',
  workplaceType: 'Remote', salary: 'Undisclosed', postedDate: 'Today',
  jobDescriptionRaw: '', url: 'https://example.com/job', source: 'Cached Portal',
  skillsRequired: [], skillsListed: [], fitScore: null, matchedKeywords: [],
  missingKeywords: [], experienceLevel: 'Unspecified'
});

describe('getRoleSuggestions', () => {
  it('suggests support roles from a partial query without a role-specific shortcut', () => {
    const suggestions = getRoleSuggestions('Supp');
    expect(suggestions.some((item) => /support/i.test(item))).toBe(true);
    expect(suggestions).not.toContain('Fraud Analyst');
  });

  it('uses resume roles, skills, domains and project evidence as suggestion sources', () => {
    const resume = {
      headline: 'Cloud Operations Professional',
      currentRole: 'Platform Specialist',
      roleFamily: 'Cloud Operations',
      skills: { technical: ['Kubernetes'], soft: ['Stakeholder Management'], tools: ['Terraform'], domains: ['FinTech'] },
      experiences: [{ role: 'Site Reliability Engineer' }],
      projects: [{ title: 'Cloud Cost Optimizer', technologies: ['Prometheus'] }],
      certifications: [{ name: 'AWS Solutions Architect' }]
    } as unknown as MasterResume;
    expect(getRoleSuggestions('Kuber', resume)).toContain('Kubernetes');
    expect(getRoleSuggestions('SRE', resume)).toContain('Site Reliability Engineer');
  });

  it('uses cached portal job titles and tags', () => {
    const suggestions = getRoleSuggestions('Supp', null, [cachedJob('Customer Support Associate')]);
    expect(suggestions).toContain('Customer Support Associate');
  });

  it('tolerates a one-character typo and only treats the final token as partial', () => {
    expect(getRoleSuggestions('Suport').some((item) => /support/i.test(item))).toBe(true);
    expect(getRoleSuggestions('Data Analysit').some((item) => /data analyst/i.test(item))).toBe(true);
    expect(getRoleSuggestions('React Eng', null, [cachedJob('Reactive Engineer')])).not.toContain('Reactive Engineer');
  });

  it('does not suggest for one character and keeps unknown searches unrestricted', () => {
    expect(getRoleSuggestions('f')).toEqual([]);
    expect(getRoleSuggestions('niche-title-not-in-catalogue')).toEqual([]);
  });

  it('returns a bounded, de-duplicated list', () => {
    const results = getRoleSuggestions('analyst', null, [cachedJob('Data Analyst')], 3);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(new Set(results.map((item) => item.toLowerCase())).size).toBe(results.length);
  });
});
