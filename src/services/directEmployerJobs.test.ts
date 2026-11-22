import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types';
import {
  DIRECT_EMPLOYER_BOARD_DIRECTORY,
  DIRECT_EMPLOYER_REFRESH_INTERVAL_MS,
  DIRECT_EMPLOYER_REFRESH_STORAGE_KEY,
  fetchDirectEmployerBoard,
  isDirectEmployerRefreshDue,
  isRetiredAggregatedFeedJob,
  reconcileDirectEmployerJobs
} from './directEmployerJobs';

const oldJob = (id: string, source: string): JobPosting => ({
  id, title: 'Data Analyst', company: 'Example', location: 'Chennai, India',
  workplaceType: 'Unspecified', salary: 'Undisclosed', postedDate: '2026-11-01',
  jobDescriptionRaw: 'SQL reports', url: 'https://example.com/jobs/1', source,
  skillsRequired: [], fitScore: null, matchedKeywords: [], missingKeywords: [],
  experienceLevel: 'Unspecified'
});

describe('12-hour direct employer refresh policy', () => {
  const memory = (initial: string | null = null) => {
    let value = initial;
    return {
      getItem: vi.fn(() => value),
      setItem: vi.fn((_key: string, next: string) => { value = next; }),
      value: () => value
    };
  };

  it('refreshes immediately when there is no prior successful refresh', () => {
    expect(isDirectEmployerRefreshDue(100000, memory())).toBe(true);
  });

  it('does not refresh before 12 hours and becomes due at exactly 12 hours', () => {
    const storage = memory('100000');
    expect(isDirectEmployerRefreshDue(100000 + DIRECT_EMPLOYER_REFRESH_INTERVAL_MS - 1, storage)).toBe(false);
    expect(isDirectEmployerRefreshDue(100000 + DIRECT_EMPLOYER_REFRESH_INTERVAL_MS, storage)).toBe(true);
  });

  it('treats corrupt and future timestamps as due instead of suppressing refresh', () => {
    expect(isDirectEmployerRefreshDue(100000, memory('not-a-time'))).toBe(true);
    expect(isDirectEmployerRefreshDue(100000, memory('200000'))).toBe(true);
  });

  it('does not mutate storage or throw when storage is unavailable', () => {
    expect(isDirectEmployerRefreshDue(100000, null)).toBe(true);
  });
});

describe('retired feed cleanup and safe board reconciliation', () => {
  it('identifies old aggregator listings for removal', () => {
    expect(isRetiredAggregatedFeedJob(oldJob('old-1', 'Remotive Live'))).toBe(true);
    expect(isRetiredAggregatedFeedJob(oldJob('manual-1', 'User Import'))).toBe(false);
  });

  it('removes closed jobs only from boards successfully refreshed and retains failed-board cache', () => {
    const growwOld = oldJob('direct_greenhouse_groww-1', 'Groww Careers (Greenhouse)');
    const meeshoOld = oldJob('direct_lever_meesho-2', 'Meesho Careers (Lever)');
    const manual = oldJob('manual-1', 'User Import');
    const currentGroww = oldJob('direct_greenhouse_groww-3', 'Groww Careers (Greenhouse)');

    const result = reconcileDirectEmployerJobs(
      [growwOld, meeshoOld, manual, oldJob('old-2', 'Jobicy Live')],
      [currentGroww],
      ['direct_greenhouse_groww']
    );

    expect(result.map((job) => job.id)).toEqual(expect.arrayContaining([
      'direct_greenhouse_groww-3', 'direct_lever_meesho-2', 'manual-1'
    ]));
    expect(result.map((job) => job.id)).not.toContain('direct_greenhouse_groww-1');
    expect(result.map((job) => job.id)).not.toContain('old-2');
  });
});

describe('public employer board adapters', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps a live Lever India posting without an API key', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{
        id: 'lever-123', text: 'Customer Support Associate',
        categories: { location: 'Bengaluru, India' },
        descriptionPlain: 'Support customers.',
        hostedUrl: 'https://jobs.lever.co/meesho/lever-123',
        createdAt: 1795046400000
      }]
    } as Response);

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'lever')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 'direct_lever_meesho-lever-123',
      company: 'Meesho',
      title: 'Customer Support Associate',
      location: 'Bengaluru, India',
      source: 'Meesho Careers (Lever)'
    });
  });

  it('maps a Greenhouse board through its documented JSONP endpoint and cleans up its callback', async () => {
    let script: HTMLScriptElement | null = null;
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      script = node as HTMLScriptElement;
      const callbackName = new URL(script.src).searchParams.get('callback');
      window.setTimeout(() => {
        const callback = callbackName
          ? (window as unknown as Record<string, unknown>)[callbackName]
          : undefined;
        if (typeof callback === 'function') {
          (callback as (payload: unknown) => void)({
            jobs: [{
              id: 77, title: 'Data Analyst',
              location: { name: 'Chennai, India' },
              content: '<p>Build reports with SQL.</p>',
              absolute_url: 'https://boards.greenhouse.io/groww/jobs/77',
              first_published: '2026-11-20T10:00:00Z'
            }]
          });
        }
      }, 0);
      return node;
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'greenhouse')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 'direct_greenhouse_groww-77',
      title: 'Data Analyst',
      company: 'Groww',
      location: 'Chennai, India',
      url: 'https://boards.greenhouse.io/groww/jobs/77'
    });
    expect(script?.src).toContain('/v1/boards/groww/jobs?content=true&callback=');
    const callbackName = new URL(script!.src).searchParams.get('callback')!;
    expect((window as unknown as Record<string, unknown>)[callbackName]).toBeUndefined();
  });

  it('drops a posting only when the employer explicitly supplies an expired application deadline', async () => {
    let script: HTMLScriptElement | null = null;
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      script = node as HTMLScriptElement;
      const callbackName = new URL(script.src).searchParams.get('callback');
      window.setTimeout(() => {
        const callback = callbackName
          ? (window as unknown as Record<string, unknown>)[callbackName]
          : undefined;
        if (typeof callback === 'function') {
          (callback as (payload: unknown) => void)({
            jobs: [{
              id: 78, title: 'Expired Analyst',
              location: { name: 'Bengaluru, India' },
              content: 'Old opening',
              absolute_url: 'https://boards.greenhouse.io/groww/jobs/78',
              application_deadline: '2000-01-01T00:00:00Z'
            }]
          });
        }
      }, 0);
      return node;
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'greenhouse')!;
    await expect(fetchDirectEmployerBoard(board)).resolves.toEqual([]);
  });

  it('rejects non-India locations, unsafe URLs and malformed records', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: '1', text: 'Analyst', categories: { location: 'London, UK' }, hostedUrl: 'https://jobs.lever.co/meesho/1' },
        { id: '2', text: 'Analyst', categories: { location: 'Chennai, India' }, hostedUrl: 'javascript:alert(1)' },
        { id: '3', text: 'Analyst', categories: { location: 'Chennai, India' }, hostedUrl: 'https://jobs.lever.co/meesho/3' }
      ]
    } as Response);

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'lever')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toContain('-3');
  });
});

