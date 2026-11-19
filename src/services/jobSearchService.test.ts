import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArbeitnowJobAdapter, isLiveDiscoveredJobSource, isPostedWithinDays, JobicyJobAdapter } from './jobSearchService';

const fetchMock = vi.fn();

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
      skillsRequired: ['React', 'TypeScript']
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
    expect(String(fetchMock.mock.calls[0][0])).toContain('tag=Frontend+Engineer');
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
