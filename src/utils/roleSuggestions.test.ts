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

  it('includes common Indian non-technical occupations in local suggestions', () => {
    expect(getRoleSuggestions('acc')).toContain('Accountant');
    expect(getRoleSuggestions('office')).toContain('Office Admin');
    expect(getRoleSuggestions('customer supp')).toContain('Customer Support');
    expect(getRoleSuggestions('retail')).toContain('Retail');
    expect(getRoleSuggestions('operations')).toContain('Operations');
    expect(getRoleSuggestions('logistics')).toContain('Logistics');
    expect(getRoleSuggestions('sales')).toContain('Sales');
  });

  it('uses cached portal job titles and tags', () => {
    const suggestions = getRoleSuggestions('Supp', null, [cachedJob('Customer Support Associate')]);
    expect(suggestions).toContain('Customer Support Associate');
  });

  it('preserves Tamil letters from resume evidence and cached job titles', () => {
    const resume = {
      headline: 'தமிழ் வாடிக்கையாளர் ஆதரவு நிபுணர்', currentRole: '', roleFamily: '',
      skills: { technical: [], soft: [], tools: [], domains: [] }, experiences: [], projects: [], certifications: []
    } as unknown as MasterResume;
    expect(getRoleSuggestions('தமிழ்', resume)).toContain('தமிழ் வாடிக்கையாளர் ஆதரவு நிபுணர்');
    expect(getRoleSuggestions('தமிழ்', null, [cachedJob('தமிழ் வாடிக்கையாளர் ஆதரவு')])).toContain('தமிழ் வாடிக்கையாளர் ஆதரவு');
  });

  it('maps common Tamil occupation terms to English role suggestions', () => {
    expect(getRoleSuggestions('கணக்காளர்')).toContain('Accountant');
    expect(getRoleSuggestions('வாடிக்கையாளர் சேவை').some((item) => /customer support/i.test(item))).toBe(true);
    expect(getRoleSuggestions('தரவு பகுப்பாய்வாளர்').some((item) => /data analyst/i.test(item))).toBe(true);
    expect(getRoleSuggestions('எக்செல்')).toContain('Excel');
    expect(getRoleSuggestions('தரவு உள்ளீடு')).toContain('Data Entry');
  });

  it('normalizes combining marks without discarding accented letters', () => {
    const decomposedQuery = 'Cafe\u0301';
    expect(getRoleSuggestions(decomposedQuery, null, [cachedJob('Café Analyst')])).toContain('Café Analyst');
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
