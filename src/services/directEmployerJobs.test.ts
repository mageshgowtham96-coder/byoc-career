import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types';
import {
  DIRECT_EMPLOYER_BOARD_DIRECTORY,
  DIRECT_EMPLOYER_REFRESH_INTERVAL_MS,
  DIRECT_EMPLOYER_REFRESH_RETRY_INTERVAL_MS,
  DIRECT_EMPLOYER_REFRESH_STORAGE_KEY,
  fetchDirectEmployerBoard,
  isDirectEmployerRefreshDue,
  isRetiredAggregatedFeedJob,
  markDirectEmployerRefreshAttempted,
  markDirectEmployerRefreshCompleted,
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
    const values = new Map<string, string>();
    if (initial !== null) values.set(DIRECT_EMPLOYER_REFRESH_STORAGE_KEY, initial);
    return {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, next: string) => { values.set(key, next); }),
      value: (key = DIRECT_EMPLOYER_REFRESH_STORAGE_KEY) => values.get(key) ?? null
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

  it('backs off for 30 minutes after a fully failed refresh attempt', () => {
    const now = 1_800_000_000_000;
    const storage = memory();
    markDirectEmployerRefreshAttempted(now, storage);
    expect(isDirectEmployerRefreshDue(now + DIRECT_EMPLOYER_REFRESH_RETRY_INTERVAL_MS - 1, storage)).toBe(false);
    expect(isDirectEmployerRefreshDue(now + DIRECT_EMPLOYER_REFRESH_RETRY_INTERVAL_MS, storage)).toBe(true);
  });

  it('uses a session-memory fallback when browser storage is unavailable', () => {
    const now = 1_900_000_000_000;
    expect(isDirectEmployerRefreshDue(now, null)).toBe(true);
    markDirectEmployerRefreshCompleted(now, null);
    expect(isDirectEmployerRefreshDue(now + DIRECT_EMPLOYER_REFRESH_INTERVAL_MS - 1, null)).toBe(false);
    expect(isDirectEmployerRefreshDue(now + DIRECT_EMPLOYER_REFRESH_INTERVAL_MS, null)).toBe(true);
  });
});

describe('retired feed cleanup and safe board reconciliation', () => {
  it('identifies old aggregator listings for removal', () => {
    expect(isRetiredAggregatedFeedJob(oldJob('old-1', 'Remotive Live'))).toBe(true);
    expect(isRetiredAggregatedFeedJob(oldJob('manual-1', 'User Import'))).toBe(false);
  });

  it('removes closed jobs only from boards successfully refreshed and retains failed-board cache', () => {
    const growwOld = oldJob('direct_greenhouse_capco-1', 'Capco Careers (Greenhouse)');
    const meeshoOld = oldJob('direct_workable_weekday-2', 'Weekday AI Careers (Workable)');
    const manual = oldJob('manual-1', 'User Import');
    const currentGroww = oldJob('direct_greenhouse_capco-3', 'Capco Careers (Greenhouse)');

    const result = reconcileDirectEmployerJobs(
      [growwOld, meeshoOld, manual, oldJob('old-2', 'Jobicy Live')],
      [currentGroww],
      ['direct_greenhouse_capco']
    );

    expect(result.map((job) => job.id)).toEqual(expect.arrayContaining([
      'direct_greenhouse_capco-3', 'direct_workable_weekday-2', 'manual-1'
    ]));
    expect(result.map((job) => job.id)).not.toContain('direct_greenhouse_capco-1');
    expect(result.map((job) => job.id)).not.toContain('old-2');
  });
});

function mockSandboxedJsonpPayload(payload: unknown) {
  let frame: HTMLIFrameElement | null = null;
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
    frame = node as HTMLIFrameElement;
    const tokenMatch = frame.srcdoc.match(/__byocJsonp:\s*("[^"]+")/);
    if (!tokenMatch) throw new Error('Sandboxed JSONP message token was not found.');
    const token = JSON.parse(tokenMatch[1]) as string;
    const appended = append(node);
    const source = frame.contentWindow;
    window.setTimeout(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source,
        data: { __byocJsonp: token, payload }
      }));
    }, 0);
    return appended;
  });
  return { getFrame: () => frame };
}

describe('public employer board adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps a live Workable India posting through a sandboxed public JSONP endpoint', async () => {
    const sandbox = mockSandboxedJsonpPayload({
      name: 'Weekday AI',
      jobs: [{
        id: 'job-123', shortcode: 'wk123',
        title: 'Customer Support Associate',
        city: 'Bengaluru', state: 'Karnataka', country: 'India',
        workplace_type: 'hybrid',
        department: 'Customer Experience', industry: 'Customer Support', function: 'Support',
        experience: 'Entry-level', education: 'High school', employment_type: 'Full-time',
        application_url: 'https://apply.workable.com/weekday-1/j/wk123',
        published_on: '2026-11-20T10:00:00Z'
      }]
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'workable')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 'direct_workable_weekday-wk123',
      company: 'Weekday AI',
      title: 'Customer Support Associate',
      location: 'Bengaluru, Karnataka, India',
      workplaceType: 'Hybrid',
      jobDescriptionRaw: '',
      metadataSummary: 'Customer Experience · Customer Support · Support · Entry-level · High school · Full-time',
      experienceLevel: 'Entry',
      fitScore: null,
      fitStatusText: 'Full description not downloaded (low-data refresh)',
      source: 'Weekday AI Careers (Workable)'
    });
    expect(sandbox.getFrame()?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(sandbox.getFrame()?.srcdoc).toContain('www.workable.com/api/accounts/weekday-1?callback=');
    expect(sandbox.getFrame()?.srcdoc).not.toContain('details=true');
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('appends nested India country codes when Workable supplies only a location string', async () => {
    mockSandboxedJsonpPayload({
      name: 'Weekday AI',
      jobs: [{
        id: 'wk-nested',
        title: 'Operations Associate',
        location: { location_str: 'Coimbatore', country_code: 'IN' },
        application_url: 'https://apply.workable.com/weekday-1/j/wk-nested'
      }]
    });
    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'workable')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].location).toBe('Coimbatore, India');
  });

  it('rejects non-India locations, unsafe URLs and malformed Workable records', async () => {
    mockSandboxedJsonpPayload({
      name: 'Weekday AI',
      jobs: [
        { id: '0', title: 'Analyst', city: 'Indianapolis', state: 'Indiana', country: 'USA', application_url: 'https://apply.workable.com/weekday-1/j/0' },
        { id: '1', title: 'Analyst', city: 'London', country: 'United Kingdom', application_url: 'https://apply.workable.com/weekday-1/j/1' },
        { id: '2', title: 'Analyst', city: 'Chennai', country: 'India', application_url: 'javascript:alert(1)' },
        { id: '3', title: 'Analyst', city: 'Chennai', country: 'India', application_url: 'https://apply.workable.com/weekday-1/j/3' },
        null
      ]
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'workable')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toContain('-3');
  });

  it('maps a Greenhouse board through its documented JSONP endpoint inside a sandbox', async () => {
    const sandbox = mockSandboxedJsonpPayload({
      jobs: [{
        id: 77, title: 'Data Analyst',
        location: { name: 'Chennai, India' },
        departments: [{ name: 'Data & Analytics' }],
        absolute_url: 'https://boards.greenhouse.io/capco/jobs/77',
        first_published: '2026-11-20T10:00:00Z'
      }]
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'greenhouse' && item.boardToken === 'capco')!;
    const jobs = await fetchDirectEmployerBoard(board);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 'direct_greenhouse_capco-77',
      title: 'Data Analyst',
      company: 'Capco',
      location: 'Chennai, India',
      jobDescriptionRaw: '',
      metadataSummary: 'Data & Analytics',
      fitScore: null,
      fitStatusText: 'Full description not downloaded (low-data refresh)',
      url: 'https://boards.greenhouse.io/capco/jobs/77'
    });
    expect(sandbox.getFrame()?.srcdoc).toContain('/v1/boards/capco/jobs?callback=');
    expect(sandbox.getFrame()?.srcdoc).not.toContain('content=true');
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('drops a Greenhouse posting only when the employer explicitly supplies an expired application deadline', async () => {
    mockSandboxedJsonpPayload({
      jobs: [{
        id: 78, title: 'Expired Analyst',
        location: { name: 'Bengaluru, India' },
        content: 'Old opening',
        absolute_url: 'https://boards.greenhouse.io/capco/jobs/78',
        application_deadline: '2000-01-01T00:00:00Z'
      }]
    });

    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => item.provider === 'greenhouse' && item.boardToken === 'capco')!;
    await expect(fetchDirectEmployerBoard(board)).resolves.toEqual([]);
  });
});

