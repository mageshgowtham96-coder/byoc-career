import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting, MasterResume } from '../types';
import {
  LiveJobSearchEngine,
  buildPortalShortcutUrl,
  calculateHonestMatch,
  deduplicateJobs,
  mergePortalShortcuts,
  sanitizeExternalHttpUrl
} from './jobSearchService';

const makeJob = (overrides: Partial<JobPosting> = {}): JobPosting => ({
  id: 'job-1',
  title: 'Frontend Engineer',
  company: 'Example Co',
  location: 'Bengaluru, India',
  workplaceType: 'Hybrid',
  salary: 'Undisclosed',
  postedDate: '2026-11-28',
  jobDescriptionRaw: 'Build accessible React interfaces.',
  url: 'https://example.com/jobs/1',
  source: 'User Import',
  skillsRequired: ['React', 'TypeScript'],
  fitScore: null,
  matchedKeywords: [],
  missingKeywords: [],
  experienceLevel: 'Unspecified',
  ...overrides
});

const makeResume = (): MasterResume => ({
  rawText: 'Experienced React and TypeScript developer',
  contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: '',
  summary: '',
  skills: { technical: ['React', 'TypeScript'], soft: [], tools: [], domains: [] },
  experiences: [],
  education: [],
  projects: [],
  certifications: [],
  stats: { wordCount: 0, pageCount: 1, charCount: 0, lastParsedDate: '', sourceFileName: '' }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('local job search', () => {
  it('searches only stored/imported positions and never calls a remote provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const engine = new LiveJobSearchEngine();
    const result = await engine.executeLiveSearch({}, makeResume(), [
      makeJob(),
      makeJob({ id: 'job-2', title: 'Backend Engineer', company: 'Other Co', location: 'Chennai, India' })
    ]);

    expect(result.jobs).toHaveLength(2);
    expect(result.sourcesQueried).toEqual(['Local Stored Positions (User Import)']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters stored positions by keyword, location, and workplace type', async () => {
    const engine = new LiveJobSearchEngine();
    const result = await engine.executeLiveSearch(
      { query: 'React', location: 'bengaluru', workplaceType: 'Hybrid' },
      makeResume(),
      [
        makeJob(),
        makeJob({ id: 'job-2', title: 'Backend Engineer', company: 'Other Co', location: 'Chennai, India', workplaceType: 'On-site' })
      ]
    );

    expect(result.jobs.map((job) => job.id)).toEqual(['job-1']);
    expect(result.jobs[0].fitScore).toBe(100);
    expect(result.totalFound).toBe(1);
  });

  it('keeps matching evidence honest when the resume is unavailable', () => {
    const result = calculateHonestMatch(makeJob(), null);
    expect(result.score).toBeNull();
    expect(result.statusText).toBe('Insufficient profile data');
    expect(result.missingKeywords).toEqual(['React', 'TypeScript']);
  });

  it('calculates a verified skill overlap from the master resume', () => {
    const result = calculateHonestMatch(makeJob(), makeResume());
    expect(result.score).toBe(100);
    expect(result.matchedKeywords).toEqual(['React', 'TypeScript']);
    expect(result.missingKeywords).toEqual([]);
  });

  it('deduplicates by normalized company and title while preserving the first record', () => {
    const first = makeJob();
    const duplicate = makeJob({ id: 'duplicate', title: ' FRONTEND ENGINEER ', company: ' example co ' });
    expect(deduplicateJobs([first, duplicate])).toEqual([first]);
  });

  it('merges saved shortcuts without allowing a custom duplicate to replace a built-in', () => {
    const shortcuts = mergePortalShortcuts([
      { id: 'portal-linkedin', name: 'Replacement', searchUrlTemplate: 'https://example.com/?q={query}', isBuiltIn: false },
      { id: 'custom-board', name: 'Custom Board', searchUrlTemplate: 'https://jobs.example.com/?q={query}', isBuiltIn: false }
    ]);

    expect(shortcuts.find((item) => item.id === 'portal-linkedin')?.name).toBe('LinkedIn');
    expect(shortcuts.some((item) => item.id === 'custom-board')).toBe(true);
  });

  it('builds encoded portal search URLs and rejects unsafe templates', () => {
    expect(buildPortalShortcutUrl('https://example.com/jobs?q={query}', 'React Developer'))
      .toBe('https://example.com/jobs?q=React%20Developer');
    expect(buildPortalShortcutUrl('https://naukri.example/{query}-jobs', 'Senior React Engineer'))
      .toBe('https://naukri.example/senior-react-engineer-jobs');
    expect(buildPortalShortcutUrl('javascript:alert(1)', 'Engineer')).toBeNull();
  });

  it('accepts only HTTP and HTTPS external URLs', () => {
    expect(sanitizeExternalHttpUrl('https://example.com/job')).toBe('https://example.com/job');
    expect(sanitizeExternalHttpUrl('http://example.com/job')).toBe('http://example.com/job');
    expect(sanitizeExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalHttpUrl('ftp://example.com/job')).toBeNull();
    expect(sanitizeExternalHttpUrl('')).toBeNull();
  });
});
