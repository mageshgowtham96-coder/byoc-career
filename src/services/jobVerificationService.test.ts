import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types';
import { parseGreenhouseJobUrl, scanJobRiskSignals, verifyJobPosting } from './jobVerificationService';

const baseJob: JobPosting = {
  id: 'job-1',
  title: 'Data Analyst',
  company: 'Acme Analytics',
  location: 'Chennai, India',
  workplaceType: 'Remote',
  salary: 'Undisclosed',
  postedDate: '2026-11-18',
  jobDescriptionRaw: 'Build reports using SQL and Power BI.',
  url: 'https://boards.greenhouse.io/acme/jobs/123456',
  source: 'Groq Browser Search',
  skillsRequired: ['SQL', 'Power BI'],
  fitScore: null,
  matchedKeywords: [],
  missingKeywords: [],
  experienceLevel: 'Unspecified'
};

const greenhouseRecord = {
  id: 123456,
  title: 'Data Analyst',
  company_name: 'Acme Analytics',
  first_published: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
  application_deadline: '2026-12-01T00:00:00Z',
  absolute_url: 'https://boards.greenhouse.io/acme/jobs/123456'
};

function mockGreenhouseJsonp(record: unknown) {
  let scriptElement: HTMLScriptElement | null = null;
  const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
    scriptElement = node as HTMLScriptElement;
    const callbackName = new URL(scriptElement.src).searchParams.get('callback');
    if (callbackName) {
      window.setTimeout(() => {
        const callback = (window as unknown as Record<string, unknown>)[callbackName];
        if (typeof callback === 'function') (callback as (value: unknown) => void)(record);
      }, 0);
    }
    return node;
  });
  return { appendSpy, getScript: () => scriptElement };
}

describe('parseGreenhouseJobUrl', () => {
  it('parses standard and job-boards Greenhouse posting URLs', () => {
    expect(parseGreenhouseJobUrl('https://boards.greenhouse.io/acme/jobs/123456')).toEqual({
      boardToken: 'acme',
      jobId: '123456'
    });
    expect(parseGreenhouseJobUrl('https://job-boards.greenhouse.io/acme/jobs/123456?gh_src=abc')).toEqual({
      boardToken: 'acme',
      jobId: '123456'
    });
  });

  it('parses the documented Greenhouse Job Board API URL and rejects malformed identifiers', () => {
    expect(parseGreenhouseJobUrl('https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456')).toEqual({
      boardToken: 'acme',
      jobId: '123456'
    });
    expect(parseGreenhouseJobUrl('https://boards.greenhouse.io/acme/jobs/not-a-number')).toBeNull();
    expect(parseGreenhouseJobUrl('https://example.com/acme/jobs/123456')).toBeNull();
  });
});

describe('verifyJobPosting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms an exact public ATS record but never claims employer identity is verified', async () => {
    const { appendSpy, getScript } = mockGreenhouseJsonp(greenhouseRecord);

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('confirmed');
    expect(evidence.provider).toBe('greenhouse');
    expect(evidence.postingId).toBe('123456');
    expect(evidence.officialTitle).toBe('Data Analyst');
    expect(evidence.officialCompany).toBe('Acme Analytics');
    expect(evidence.employerIdentityVerified).toBe(false);
    expect(evidence.evidenceUrl).toContain('/v1/boards/acme/jobs/123456');
    expect(appendSpy).toHaveBeenCalledOnce();

    const script = getScript();
    expect(script).toBeTruthy();
    const callbackName = new URL(script!.src).searchParams.get('callback');
    expect(callbackName).toMatch(/^byocGreenhouse_/);
    expect((window as unknown as Record<string, unknown>)[callbackName!]).toBeUndefined();
  });

  it('does not confirm a posting when the ATS title or company differs', async () => {
    mockGreenhouseJsonp({ ...greenhouseRecord, title: 'Senior Data Analyst' });

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('mismatch');
    expect(evidence.employerIdentityVerified).toBe(false);
  });

  it('does not confirm a public record when the company differs', async () => {
    mockGreenhouseJsonp({ ...greenhouseRecord, company_name: 'Different Company' });

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('mismatch');
    expect(evidence.officialCompany).toBe('Different Company');
  });

  it('marks an explicitly past application deadline as expired', async () => {
    mockGreenhouseJsonp({
      ...greenhouseRecord,
      application_deadline: '2026-11-01T00:00:00Z'
    });

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('expired');
    expect(evidence.applicationDeadline).toBe('2026-11-01T00:00:00Z');
  });

  it('reports no public record when the ATS returns no posting ID', async () => {
    mockGreenhouseJsonp({ error: 'Not found' });

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('not_found');
  });

  it('requires manual review for Lever instead of calling an unsupported cross-origin API', async () => {
    const leverJob = { ...baseJob, url: 'https://jobs.lever.co/acme/abc-123' };

    const evidence = await verifyJobPosting(leverJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('manual_review');
    expect(evidence.provider).toBe('lever');
    expect(evidence.explanation).toMatch(/manual/i);
  });

  it('times out cleanly when the JSONP callback never arrives', async () => {
    vi.useFakeTimers();
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => node);

    const resultPromise = verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));
    await vi.advanceTimersByTimeAsync(12_000);
    const evidence = await resultPromise;

    expect(evidence.status).toBe('check_failed');
    vi.useRealTimers();
  });

  it('returns check_failed when the Greenhouse JSONP request fails', async () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const script = node as HTMLScriptElement;
      window.setTimeout(() => script.onerror?.(new Event('error')), 0);
      return node;
    });

    const evidence = await verifyJobPosting(baseJob, new Date('2026-11-19T00:00:00Z'));

    expect(evidence.status).toBe('check_failed');
  });
});

describe('scanJobRiskSignals', () => {
  it('flags fee, financial-detail, off-platform messaging, and consumer email signals', () => {
    const flags = scanJobRiskSignals({
      ...baseJob,
      jobDescriptionRaw: 'Pay an application fee. Send bank account details on WhatsApp. Contact hiring@gmail.com.'
    });

    expect(flags).toEqual(expect.arrayContaining([
      expect.stringMatching(/fee/i),
      expect.stringMatching(/financial/i),
      expect.stringMatching(/WhatsApp|Telegram/i),
      expect.stringMatching(/consumer email/i)
    ]));
  });

  it('does not flag an explicit statement that no application fee is charged', () => {
    const flags = scanJobRiskSignals({
      ...baseJob,
      jobDescriptionRaw: 'No application fee is charged. Apply through the official company careers page.'
    });

    expect(flags.some((flag) => /fee/i.test(flag))).toBe(false);
  });
});
