import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLiveDiscoveredJobSource, isPostedWithinDays, JobicyJobAdapter } from './jobSearchService';

const fetchMock = vi.fn();

function responseWith(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content } }]
    })
  } as Response;
}

describe('identifyJobPortalSource', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/123', 'LinkedIn'],
    ['https://in.indeed.com/viewjob?jk=abc', 'Indeed'],
    ['https://www.naukri.com/job-listings/example', 'Naukri'],
    ['https://www.foundit.in/job/example', 'Foundit'],
    ['https://www.glassdoor.com/job-listing/example', 'Glassdoor'],
    ['https://www.instahyre.com/jobs/example', 'Instahyre'],
    ['https://jobs.lever.co/example/123', 'Employer Careers'],
    ['https://notlinkedin.com/jobs/123', 'Employer Careers']
  ])('classifies %s as %s', (url, expected) => {
    expect(identifyJobPortalSource(url)).toBe(expected);
  });
});

describe('isLiveDiscoveredJobSource', () => {
  it.each([
    ['Remotive Live', true],
    ['Remote OK Live', true],
    ['Jobicy Live', true],
    ['User Import', false],
    ['Company Careers', false]
    ['User Import', false],
    ['Company Careers', false]
  ])('classifies %s as discovered=%s', (source, expected) => {
    expect(isLiveDiscoveredJobSource(source)).toBe(expected);
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
  });

  it('excludes stale or unreadable dates instead of treating them as current', () => {
    expect(isPostedWithinDays('2026-09-01', 30, now)).toBe(false);
    expect(isPostedWithinDays('Unspecified', 30, now)).toBe(false);
  });

  it('allows all dates when the user selects any date', () => {
    expect(isPostedWithinDays('Unspecified', 0, now)).toBe(true);
  });
});
