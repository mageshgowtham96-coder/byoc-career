import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArbeitnowJobAdapter, assessRemoteCountryEligibility, calculateHonestMatch, getJobMatchBasisLabel, getJobMatchCriteria, mergePortalShortcuts, isLiveDiscoveredJobSource, isPostedWithinDays, JobicyJobAdapter, LiveJobSearchEngine, matchesJobSearchTerms, matchesRemoteCountryAndLocation, mergeDiscoveredJobs, PublicFeedsJobAdapter } from './jobSearchService';

const fetchMock = vi.fn();

describe('published-location-only eligibility gate', () => {
  it('does not infer country or city eligibility from job-description mentions', () => {
    expect(matchesRemoteCountryAndLocation(
      'Remote',
      'The company has an office in Chennai, India.',
      'IN'
    )).toBe(false);
    expect(matchesRemoteCountryAndLocation(
      'Remote',
      'The role description mentions Chennai, India.',
      'IN',
      'Chennai'
    )).toBe(false);
  });

  it('accepts a worldwide location only when the search preference allows it', () => {
    expect(matchesRemoteCountryAndLocation('Worldwide', '', 'IN', undefined, true)).toBe(true);
    expect(matchesRemoteCountryAndLocation('Worldwide', '', 'IN', undefined, false)).toBe(false);
  });

  it('treats country-wide remote scope as eligible for a city inside that market', () => {
    expect(matchesRemoteCountryAndLocation('Anywhere in the US', '', 'US', 'New York')).toBe(true);
    expect(matchesRemoteCountryAndLocation('Anywhere in the US', '', 'IN', 'Chennai')).toBe(false);
  });
});

describe('explicit remote market eligibility evidence', () => {
  it.each([
    ['Remote — India', 'IN', 'explicitly-eligible'],
    ['Remote — Asia', 'IN', 'regionally-eligible'],
    ['Remote — USA only', 'IN', 'explicitly-ineligible'],
    ['Remote — North America', 'IN', 'explicitly-ineligible'],
    ['Remote', 'IN', 'not-stated'],
    ['Worldwide', 'IN', 'explicitly-eligible'],
    ['Worldwide', 'GLOBAL', 'not-assessed'],
    ['Global Remote', 'IN', 'explicitly-eligible'],
    ['Remote — Anywhere', 'IN', 'explicitly-eligible'],
    ['Anywhere in the US', 'IN', 'explicitly-ineligible'],
    ['Anywhere in the US', 'US', 'explicitly-eligible'],
    ['Remote anywhere in USA', 'IN', 'explicitly-ineligible'],
    ['Global HQ, New York', 'IN', 'not-stated']
  ])('classifies published location %s for market %s as %s', (location, market, expected) => {
    expect(assessRemoteCountryEligibility(location, market).status).toBe(expected);
  });

  it('retains the exact published location phrase as eligibility evidence', () => {
    expect(assessRemoteCountryEligibility('Remote — India', 'IN')).toMatchObject({
      status: 'explicitly-eligible',
      market: 'IN',
      evidence: 'India',
      source: 'published-location'
    });
  });

  it('identifies worldwide searches as a scope choice rather than published eligibility evidence', () => {
    expect(assessRemoteCountryEligibility('Worldwide', 'GLOBAL')).toMatchObject({
      status: 'not-assessed',
      market: 'GLOBAL',
      source: 'search-scope'
    });
  });
});

describe('dynamic typo-tolerant search matching', () => {
  it('maps Tamil occupation and skill searches to English listing terms', () => {
    expect(matchesJobSearchTerms('கணக்காளர்', 'Accountant')).toBe(true);
    expect(matchesJobSearchTerms('வாடிக்கையாளர் சேவை', 'Customer Support Associate')).toBe(true);
    expect(matchesJobSearchTerms('தரவு உள்ளீடு', 'Data Entry Operator')).toBe(true);
    expect(matchesJobSearchTerms('எக்செல்', 'Excel Specialist')).toBe(true);
  });

  it('matches partial role tokens without requiring a complete title', () => {
    expect(matchesJobSearchTerms('Supp', 'Customer Support Specialist')).toBe(true);
  });

  it('tolerates a one-character typo in a role token', () => {
    expect(matchesJobSearchTerms('Suport Analyst', 'Support Analyst')).toBe(true);
    expect(matchesJobSearchTerms('Data Analysit', 'Data Analyst')).toBe(true);
  });

  it('does not fuzzy-match very short tokens or unrelated roles', () => {
    expect(matchesJobSearchTerms('QA', 'Customer Support Associate')).toBe(false);
    expect(matchesJobSearchTerms('Product Manager', 'Customer Support Associate')).toBe(false);
  });

  it('keeps matching every query token rather than accepting one accidental overlap', () => {
    expect(matchesJobSearchTerms('Support Finance', 'Customer Support Associate')).toBe(false);
  });
});

describe('isLiveDiscoveredJobSource', () => {
  it.each([
    ['Remotive Live', true],
    ['Remote OK Live', true],
    ['Jobicy Live', true],
    ['Arbeitnow Live', true],
    ['User Import', false],
    ['Company Careers', false]
  ])('classifies %s as discovered=%s', (source, expected) => {
    expect(isLiveDiscoveredJobSource(source)).toBe(expected);
  });
});


describe('ArbeitnowJobAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the public no-key feed, preserves the posting URL and maps its published date', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          slug: 'frontend-engineer-example-123',
          title: 'Frontend Engineer',
          company_name: 'Example GmbH',
          description: '<p>Build React applications.</p>',
          remote: true,
          url: 'https://www.arbeitnow.com/jobs/companies/example/frontend-engineer-123',
          tags: ['React', 'TypeScript'],
          location: 'Berlin, Germany',
          created_at: 1795046400
        }],
        links: { next: 'https://www.arbeitnow.com/api/job-board-api?page=2' }
      })
    });

    const adapter = new ArbeitnowJobAdapter();
    const jobs = await adapter.search({ query: 'Frontend Engineer', country: 'GLOBAL' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('arbeitnow.com/api/job-board-api?page=1');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Frontend Engineer',
      company: 'Example GmbH',
      location: 'Berlin, Germany',
      workplaceType: 'Remote',
      url: 'https://www.arbeitnow.com/jobs/companies/example/frontend-engineer-123',
      source: 'Arbeitnow Live',
      skillsRequired: [],
      skillsListed: ['React', 'TypeScript']
    });
    expect(jobs[0].postedDate).not.toBe('Unspecified');
  });

  it('does not label non-remote postings as remote when the feed has no work-mode detail', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          slug: 'office-role-1', title: 'Office Role', company_name: 'Example',
          description: 'Work from the office', remote: false,
          url: 'https://www.arbeitnow.com/jobs/office-role-1',
          tags: [], location: 'Berlin, Germany', created_at: 1795046400
        }]
      })
    });

    const jobs = await new ArbeitnowJobAdapter().search({ query: 'Office Role', country: 'GLOBAL' });
    expect(jobs[0].workplaceType).toBe('Unspecified');
  });
});

describe('PublicFeedsJobAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the bounded latest feed when a typo-specific Remotive query returns no hits', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ jobs: [] })
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          jobs: [{
            id: 202, title: 'Customer Support Specialist', company_name: 'Example',
            candidate_required_location: 'Worldwide', description: 'Support customers and resolve service requests.',
            url: 'https://remotive.com/remote-jobs/customer-support/support-specialist-202',
            publication_date: '2026-11-19', tags: ['Customer Support']
          }]
        })
      });

    const jobs = await new PublicFeedsJobAdapter().search({ query: 'Suport', country: 'GLOBAL' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/remote-jobs?limit=50');
    expect(jobs[0].title).toBe('Customer Support Specialist');
  });

  it('keeps Remotive provider tags as listed skills rather than required skills', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobs: [{
          id: 101,
          title: 'Frontend Engineer',
          company_name: 'Example',
          candidate_required_location: 'Worldwide',
          description: 'Build accessible web interfaces.',
          url: 'https://remotive.com/remote-jobs/software-dev/frontend-engineer-101',
          publication_date: '2026-11-19',
          tags: ['React', 'TypeScript']
        }]
      })
    });
    const jobs = await new PublicFeedsJobAdapter().search({ query: 'Frontend Engineer', country: 'GLOBAL' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].skillsRequired).toEqual([]);
    expect(jobs[0].skillsListed).toEqual(['React', 'TypeScript']);
    expect(jobs[0].eligibilityAssessment?.status).toBe('not-assessed');
  });
});

describe('JobicyJobAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the public cursor feed and preserves real posting links', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          jobs: [{
            id: 101, jobTitle: 'Frontend Engineer', companyName: 'Acme',
            jobGeo: 'Worldwide', jobDescription: '<p>React and TypeScript</p>',
            url: 'https://jobicy.com/jobs/101', pubDate: '2026-11-18'
          }],
          hasMore: true, nextCursor: 'cursor-page-2'
        })
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          jobs: [{
            id: 102, jobTitle: 'UI Engineer', companyName: 'Example',
            jobGeo: 'Worldwide', jobDescription: 'Build accessible interfaces',
            url: 'https://jobicy.com/jobs/102', pubDate: '2026-11-17'
          }],
          hasMore: false, nextCursor: null
        })
      });

    const adapter = new JobicyJobAdapter();
    const jobs = await adapter.search({ query: 'Frontend Engineer', country: 'GLOBAL' });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.url)).toEqual([
      'https://jobicy.com/jobs/101',
      'https://jobicy.com/jobs/102'
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('count=100');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('tag=');
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=cursor-page-2');
  });

  it('stops when a feed repeats a cursor and caps requests at three pages', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ jobs: [], hasMore: true, nextCursor: 'same-cursor' })
    });

    const adapter = new JobicyJobAdapter();
    await adapter.search({ query: 'Product Manager' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not call Jobicy without a role or skill query', async () => {
    const adapter = new JobicyJobAdapter();
    await expect(adapter.search({})).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('isPostedWithinDays', () => {
  const now = new Date('2026-11-19T12:00:00.000Z');

  it('includes dates inside the requested freshness window', () => {
    expect(isPostedWithinDays('2026-11-18', 7, now)).toBe(true);
    expect(isPostedWithinDays('2026-11-01', 30, now)).toBe(true);
    expect(isPostedWithinDays('19/11/2026', 7, now)).toBe(true);
  });

  it('excludes stale or unreadable dates instead of treating them as current', () => {
    expect(isPostedWithinDays('2026-09-01', 30, now)).toBe(false);
    expect(isPostedWithinDays('Unspecified', 30, now)).toBe(false);
  });

  it('allows all dates when the user selects any date', () => {
    expect(isPostedWithinDays('Unspecified', 0, now)).toBe(true);
  });
});


describe('saved portal shortcut resilience', () => {
  it('ignores malformed saved shortcuts instead of crashing while merging defaults', () => {
    expect(() => mergePortalShortcuts([
      { id: 'bad-template', name: 'Broken', searchUrlTemplate: undefined } as any,
      { id: 'bad-protocol', name: 'Unsafe', searchUrlTemplate: 'javascript:alert(1)' } as any
    ])).not.toThrow();
    expect(mergePortalShortcuts([
      { id: 'bad-template', name: 'Broken', searchUrlTemplate: undefined } as any
    ]).some((item) => item.id === 'bad-template')).toBe(false);
  });
});

describe('multi-term role matching', () => {
  it.each([
    ['fraud analyst', 'Fraud & Risk Analyst', true],
    ['fraud analyst', 'Senior Analyst, Fraud Prevention', true],
    ['data analyst', 'Senior Data & Reporting Analyst', true],
    ['software engineer', 'Software Engineer II', true],
    ['fraud analyst', 'Fraud Operations Associate', false],
    ['customer support', 'Customer Success Manager', false]
  ])('matches %s against %s => %s', (query, title, expected) => {
    expect(matchesJobSearchTerms(query, title)).toBe(expected);
  });

  it('matches terms across title, skills and description rather than requiring one exact phrase', () => {
    expect(matchesJobSearchTerms(
      'fraud analyst',
      'Risk Operations Specialist',
      ['Fraud Detection', 'Transaction Monitoring'],
      'Partner with analysts to investigate suspicious transactions'
    )).toBe(true);
  });

  it('does not match a role keyword as a substring inside an unrelated word', () => {
    expect(matchesJobSearchTerms('go developer', 'Ongoing developer role')).toBe(false);
    expect(matchesJobSearchTerms('react engineer', 'Reactive engineer role')).toBe(false);
  });

  it('keeps standalone C and R technical search terms instead of dropping them', () => {
    expect(matchesJobSearchTerms('R developer', 'R Developer')).toBe(true);
    expect(matchesJobSearchTerms('R developer', 'React developer')).toBe(false);
    expect(matchesJobSearchTerms('C developer', 'C developer')).toBe(true);
  });

  it('matches common singular and plural role wording without substring false positives', () => {
    expect(matchesJobSearchTerms('fraud analyst', 'Fraud & Risk Analysts')).toBe(true);
    expect(matchesJobSearchTerms('software engineers', 'Software Engineer')).toBe(true);
    expect(matchesJobSearchTerms('company', 'Companies')).toBe(true);
    expect(matchesJobSearchTerms('react engineer', 'Reactive Engineers')).toBe(false);
  });
});

describe('LiveJobSearchEngine provider isolation', () => {
  it('keeps successful results when another provider fails', async () => {
    const goodJob = {
      id: 'mock-fraud-1',
      title: 'Fraud & Risk Analyst',
      company: 'Example Payments',
      location: 'Worldwide',
      workplaceType: 'Remote' as const,
      salary: 'Undisclosed',
      postedDate: '2026-11-18',
      jobDescriptionRaw: 'Investigate suspicious transactions and fraud alerts.',
      url: 'https://example.com/jobs/fraud-analyst',
      source: 'Mock Public Feed',
      skillsRequired: ['Fraud Detection', 'Transaction Monitoring'],
      fitScore: null,
      matchedKeywords: [],
      missingKeywords: [],
      experienceLevel: 'Unspecified' as const
    };
    const failingProvider = {
      id: 'slow-feed', name: 'Slow Feed', isConfigured: true, requiresAuth: false,
      search: vi.fn(async () => { throw new Error('Slow Feed timed out after 15 seconds.'); })
    };
    const workingProvider = {
      id: 'working-feed', name: 'Working Feed', isConfigured: true, requiresAuth: false,
      search: vi.fn(async () => [goodJob])
    };

    const result = await new LiveJobSearchEngine([failingProvider, workingProvider]).executeLiveSearch(
      { query: 'fraud analyst', country: 'GLOBAL' }, null
    );

    expect(result.jobs.map((job) => job.title)).toEqual(['Fraud & Risk Analyst']);
    expect(result.jobs[0].fitStatusText).toBe('Insufficient profile data');
    expect(result.providerStatuses.find((status) => status.id === 'slow-feed')?.status).toBe('error');
    expect(result.providerStatuses.find((status) => status.id === 'working-feed')?.count).toBe(1);
    expect(result.error).toContain('Slow Feed timed out');
  });
});

describe('LiveJobSearchEngine skill classification', () => {
  it('searches provider-listed tags without relabelling them as required skills', async () => {
    const listedJob = {
      id: 'listed-frontend-1',
      title: 'Frontend Engineer',
      company: 'Example',
      location: 'Worldwide',
      workplaceType: 'Remote' as const,
      salary: 'Undisclosed',
      postedDate: '2026-11-19',
      jobDescriptionRaw: 'Build accessible interfaces.',
      url: 'https://example.com/jobs/frontend',
      source: 'Remotive Live',
      skillsRequired: [],
      skillsListed: ['React'],
      fitScore: null,
      matchedKeywords: [],
      missingKeywords: [],
      experienceLevel: 'Unspecified' as const
    };
    const provider = {
      id: 'listed-feed', name: 'Listed Feed', isConfigured: true, requiresAuth: false,
      search: vi.fn(async () => [listedJob])
    };
    const result = await new LiveJobSearchEngine([provider]).executeLiveSearch(
      { query: 'React', country: 'GLOBAL' }, null
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].skillsRequired).toEqual([]);
    expect(result.jobs[0].skillsListed).toEqual(['React']);
    expect(result.jobs[0].fitStatusText).toBe('Insufficient profile data');
  });
});

describe('mergeDiscoveredJobs', () => {
  const makeJob = (id: string, title: string) => ({
    id, title, company: 'Example Co', location: 'India', workplaceType: 'Remote' as const,
    salary: 'Undisclosed', postedDate: '2026-11-18', jobDescriptionRaw: 'Role details',
    url: 'https://example.com/jobs', source: 'User Import', skillsRequired: [],
    fitScore: null, matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified' as const
  });

  it('preserves previously saved jobs that do not match the current search', () => {
    const oldSaved = makeJob('saved-1', 'Accounts Executive');
    const currentMatch = makeJob('live-1', 'Fraud Analyst');
    expect(mergeDiscoveredJobs([oldSaved], [currentMatch]).map((job) => job.id))
      .toEqual(['saved-1', 'live-1']);
  });

  it('deduplicates the same employer and title across feeds', () => {
    const saved = makeJob('saved-1', 'Fraud Analyst');
    const duplicate = { ...makeJob('feed-1', 'Fraud Analyst'), source: 'Remotive Live' };
    expect(mergeDiscoveredJobs([saved], [duplicate])).toEqual([saved]);
  });

  it('handles empty discovery results without deleting local records', () => {
    const saved = makeJob('saved-1', 'Data Analyst');
    expect(mergeDiscoveredJobs([saved], [])).toEqual([saved]);
  });
});

describe('deduplicateJobs location identity', () => {
  it('keeps same-title openings from the same company when locations differ', () => {
    const base = {
      company: 'Example Co', workplaceType: 'Hybrid' as const, salary: 'Undisclosed',
      postedDate: '2026-11-18', jobDescriptionRaw: 'Role details', url: 'https://example.com/jobs',
      source: 'User Import', skillsRequired: [], fitScore: null, matchedKeywords: [],
      missingKeywords: [], experienceLevel: 'Unspecified' as const
    };
    const bangalore = { ...base, id: 'job-in', title: 'Fraud Analyst', location: 'Bengaluru, India' };
    const london = { ...base, id: 'job-uk', title: 'Fraud Analyst', location: 'London, UK' };
    expect(mergeDiscoveredJobs([], [bangalore, london])).toHaveLength(2);
  });
});


describe('job match criteria disclosure', () => {
  it('distinguishes explicit requirements from provider tags whose requirement status is unknown', () => {
    expect(getJobMatchBasisLabel({ skillsRequired: ['SQL'], skillsListed: ['Excel'] }))
      .toBe('Based on user-specified required skills');
    expect(getJobMatchBasisLabel({ skillsRequired: [], skillsListed: ['Excel'] }))
      .toBe('Provider-listed skills; requirement status unknown');
    expect(getJobMatchBasisLabel({ skillsRequired: [], skillsListed: [] }))
      .toBe('No job skill criteria specified');
  });

  it('uses the same non-empty criteria list for scoring and the displayed denominator', () => {
    expect(getJobMatchCriteria({
      skillsRequired: [' ', ''],
      skillsListed: ['React', '  ', 'TypeScript']
    })).toEqual({
      skills: ['React', 'TypeScript'],
      basis: 'provider-listed-unknown',
      label: 'Provider-listed skills; requirement status unknown'
    });
  });

  it('does not count empty required entries when valid required skills exist', () => {
    expect(getJobMatchCriteria({
      skillsRequired: ['SQL', ' '],
      skillsListed: ['Excel', 'Power BI']
    }).skills).toEqual(['SQL']);
  });
});

describe('honest keyword-overlap scoring', () => {
  const job = {
    id: 'job-1', title: 'Developer', company: 'Example', location: 'Remote',
    workplaceType: 'Remote' as const, salary: 'Unspecified', postedDate: 'Today',
    source: 'User Import', url: 'https://example.com/jobs/1',
    skillsRequired: ['Go', 'R', 'C'], fitScore: null, matchedKeywords: [], missingKeywords: [],
    experienceLevel: 'Unspecified' as const, jobDescriptionRaw: 'Requires Go, R and C.'
  };

  it('does not match short skills inside unrelated words', () => {
    const profile = {
      rawText: 'Candidate has ongoing project experience, worked with customer support, and I go to work; R is a grade and C is a course mark.',
      contactInfo: { name: 'Asha Rao', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: '', skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [],
      stats: { wordCount: 10, pageCount: 1, charCount: 50, lastParsedDate: '', sourceFileName: 'resume.txt' }
    };
    const result = calculateHonestMatch(job, profile as any);
    expect(result.matchedKeywords).toEqual([]);
    expect(result.missingKeywords).toEqual(['Go', 'R', 'C']);
    expect(result.score).toBe(0);
    expect(result.statusText).toContain('keyword overlap');
    expect(result.statusText).toContain('experience and eligibility not assessed');
  });

  it('does not count preferred skills as mandatory match criteria', () => {
    const preferredOnlyJob = {
      ...job,
      skillsRequired: [],
      skillsListed: [],
      skillsPreferred: ['SQL']
    };
    const result = calculateHonestMatch(preferredOnlyJob as any, {
      rawText: 'SQL experience',
      contactInfo: { name: 'Asha Rao', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: '', skills: { technical: ['SQL'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [],
      stats: { wordCount: 2, pageCount: 1, charCount: 10, lastParsedDate: '', sourceFileName: '' }
    } as any);
    expect(result.score).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
    expect(result.statusText).toContain('preferred skills are not treated as requirements');
  });

  it('reports provider-listed skills as unclassified overlap, not required qualifications', () => {
    const listedJob = {
      ...job,
      skillsRequired: [],
      skillsListed: ['Go', 'SQL']
    };
    const profile = {
      rawText: 'Candidate profile with relevant project experience.',
      contactInfo: { name: 'Asha Rao', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: '', skills: { technical: ['SQL'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [],
      stats: { wordCount: 14, pageCount: 1, charCount: 80, lastParsedDate: '', sourceFileName: 'resume.txt' }
    };
    const result = calculateHonestMatch(listedJob as any, profile as any);
    expect(result.matchedKeywords).toEqual(['SQL']);
    expect(result.missingKeywords).toEqual(['Go']);
    expect(result.score).toBe(50);
    expect(result.statusText).toContain('listed skills');
    expect(result.statusText).toContain('requirement status unknown');
  });

  it('matches short skills only when present as standalone tokens', () => {
    const profile = {
      rawText: 'Candidate profile with relevant project experience.',
      contactInfo: { name: 'Asha Rao', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: '', skills: { technical: ['Go', 'R', 'C'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [],
      stats: { wordCount: 14, pageCount: 1, charCount: 80, lastParsedDate: '', sourceFileName: 'resume.txt' }
    };
    const result = calculateHonestMatch(job, profile as any);
    expect(result.matchedKeywords).toEqual(['Go', 'R', 'C']);
    expect(result.score).toBe(100);
  });
});
