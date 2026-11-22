import type { JobPosting } from '../types';

export const DIRECT_EMPLOYER_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const DIRECT_EMPLOYER_REFRESH_STORAGE_KEY = 'byoc_direct_employer_jobs_last_refresh_v1';

export interface DirectEmployerBoard {
  id: string;
  company: string;
  provider: 'greenhouse' | 'workable';
  boardToken: string;
  careersUrl: string;
  market: 'IN';
}

/**
 * First-party employer boards, not aggregators.
 * Board slugs were seeded from the public India employer directories published
 * by Deriverge (CC BY 4.0, 20 Nov 2026):
 * https://deriverge.com/tools/companies-using-greenhouse/india/
 * https://deriverge.com/tools/companies-using-workable/india/
 * Each response is still validated at runtime; additions must be re-verified.
 */
export const DIRECT_EMPLOYER_BOARD_DIRECTORY: DirectEmployerBoard[] = [
  { id: 'direct_greenhouse_capco', company: 'Capco', provider: 'greenhouse', boardToken: 'capco', careersUrl: 'https://job-boards.greenhouse.io/capco', market: 'IN' },
  { id: 'direct_greenhouse_wpp', company: 'WPP', provider: 'greenhouse', boardToken: 'wpp', careersUrl: 'https://job-boards.greenhouse.io/wpp', market: 'IN' },
  { id: 'direct_greenhouse_vml', company: 'VML / WPP Enterprise Solutions', provider: 'greenhouse', boardToken: 'vmlenterprisesolutions', careersUrl: 'https://job-boards.greenhouse.io/vmlenterprisesolutions', market: 'IN' },
  { id: 'direct_greenhouse_payoneer', company: 'Payoneer', provider: 'greenhouse', boardToken: 'payoneer', careersUrl: 'https://job-boards.greenhouse.io/payoneer', market: 'IN' },
  { id: 'direct_greenhouse_tide', company: 'Tide', provider: 'greenhouse', boardToken: 'tide', careersUrl: 'https://job-boards.greenhouse.io/tide', market: 'IN' },
  { id: 'direct_greenhouse_inmobi', company: 'InMobi', provider: 'greenhouse', boardToken: 'inmobi', careersUrl: 'https://job-boards.greenhouse.io/inmobi', market: 'IN' },
  { id: 'direct_greenhouse_pubmatic', company: 'PubMatic', provider: 'greenhouse', boardToken: 'pubmatic', careersUrl: 'https://job-boards.greenhouse.io/pubmatic', market: 'IN' },
  { id: 'direct_greenhouse_zenoti', company: 'Zenoti', provider: 'greenhouse', boardToken: 'zenoti', careersUrl: 'https://job-boards.greenhouse.io/zenoti', market: 'IN' },
  { id: 'direct_workable_weekday', company: 'Weekday AI', provider: 'workable', boardToken: 'weekday-1', careersUrl: 'https://apply.workable.com/weekday-1', market: 'IN' },
  { id: 'direct_workable_rentokil', company: 'Rentokil Initial', provider: 'workable', boardToken: 'rentokil-initial', careersUrl: 'https://apply.workable.com/rentokil-initial', market: 'IN' },
  { id: 'direct_workable_capgemini_insurance', company: 'Capgemini Insurance', provider: 'workable', boardToken: 'capgemini-insurance', careersUrl: 'https://apply.workable.com/capgemini-insurance', market: 'IN' },
  { id: 'direct_workable_keywords', company: 'Keywords Studios', provider: 'workable', boardToken: 'keywords-intl1', careersUrl: 'https://apply.workable.com/keywords-intl1', market: 'IN' },
  { id: 'direct_workable_unison', company: 'Unison Group', provider: 'workable', boardToken: 'unisongroup', careersUrl: 'https://apply.workable.com/unisongroup', market: 'IN' }
];

const INDIA_LOCATION_MARKERS = [
  'india', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'pune',
  'mumbai', 'gurugram', 'gurgaon', 'noida', 'new delhi', 'kolkata',
  'ahmedabad', 'jaipur', 'kochi', 'cochin', 'trivandrum', 'thiruvananthapuram'
];

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanText(value: unknown, maxLength = 8000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isIndiaLocation(value: string): boolean {
  const normalized = value.normalize('NFKC').toLowerCase();
  return INDIA_LOCATION_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return 'Unspecified';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : 'Unspecified';
}

function mapWorkplaceType(value: unknown, location: string): JobPosting['workplaceType'] {
  // Do not infer work mode from generic description prose; use only structured
  // ATS workplace metadata or the published location field.
  const evidence = `${value === true ? 'remote' : String(value || '')} ${location}`.toLowerCase();
  if (/remote|work from home|wfh/.test(evidence)) return 'Remote';
  if (/hybrid/.test(evidence)) return 'Hybrid';
  if (/on[_ -]?site|in[- ]office|office based/.test(evidence)) return 'On-site';
  return 'Unspecified';
}

function createPosting(
  board: DirectEmployerBoard,
  rawId: unknown,
  rawTitle: unknown,
  rawLocation: unknown,
  rawDescription: unknown,
  rawUrl: unknown,
  rawDate: unknown,
  rawWorkplace?: unknown,
  rawApplicationDeadline?: unknown
): JobPosting | null {
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const url = safeUrl(rawUrl);
  const location = typeof rawLocation === 'string' ? rawLocation.trim() : '';
  const description = cleanText(rawDescription);
  if (!title || !url || !location || !isIndiaLocation(location)) return null;
  // Only an explicit employer-published past deadline proves expiry.
  // Missing or malformed deadlines are never guessed to be expired.
  if (typeof rawApplicationDeadline === 'string' && rawApplicationDeadline.trim()) {
    const deadline = Date.parse(rawApplicationDeadline);
    if (Number.isFinite(deadline) && deadline < Date.now()) return null;
  }

  return {
    id: `${board.id}-${String(rawId || url)}`,
    title,
    company: board.company,
    location,
    workplaceType: mapWorkplaceType(rawWorkplace, location),
    salary: 'Undisclosed',
    postedDate: normalizeDate(rawDate),
    jobDescriptionRaw: description,
    url,
    source: `${board.company} Careers (${board.provider === 'greenhouse' ? 'Greenhouse' : 'Workable'})`,
    skillsRequired: [],
    skillsListed: [],
    fitScore: null,
    matchedKeywords: [],
    missingKeywords: [],
    experienceLevel: 'Unspecified'
  };
}

function fetchJsonp(url: string, providerName: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.head) {
      reject(new Error(`${providerName} public board requires a browser session.`));
      return;
    }
    const callbackName = `byocBoard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const registry = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.onerror = null;
      script.remove();
      delete registry[callbackName];
    };
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${providerName} public board timed out.`));
    }, 15000);
    registry[callbackName] = (payload: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
    };
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${providerName} public board could not be reached.`));
    };
    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

function fetchGreenhouseBoard(boardToken: string): Promise<unknown> {
  return fetchJsonp(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
    'Greenhouse'
  );
}

function fetchWorkableBoard(boardToken: string): Promise<unknown> {
  return fetchJsonp(
    `https://www.workable.com/api/accounts/${encodeURIComponent(boardToken)}?details=true`,
    'Workable'
  );
}

function workableLocation(item: Record<string, any>): string {
  const locations = Array.isArray(item.locations) ? item.locations : [];
  const entries = locations.map((location: unknown) => {
    if (!isRecord(location)) return '';
    return [
      location.city,
      location.state || location.region,
      location.country_name || location.country || (location.country_code === 'IN' ? 'India' : '')
    ].filter((part) => typeof part === 'string' && part.trim()).join(', ');
  }).filter(Boolean);
  const primary = isRecord(item.location)
    ? (item.location.location_str || [item.location.city, item.location.state, item.location.country].filter(Boolean).join(', '))
    : item.location;
  const country = typeof item.country === 'string' ? (item.country.toUpperCase() === 'IN' ? 'India' : item.country) : (item.country_code === 'IN' ? 'India' : '');
  const city = typeof item.city === 'string' ? item.city : '';
  const state = typeof item.state === 'string' ? item.state : '';
  const fallback = [city, state, country].filter(Boolean).join(', ');
  return Array.from(new Set([primary, fallback, ...entries].filter((value) => typeof value === 'string' && value.trim())))
    .join(' / ');
}

export async function fetchDirectEmployerBoard(board: DirectEmployerBoard): Promise<JobPosting[]> {
  if (board.provider === 'greenhouse') {
    const payload = await fetchGreenhouseBoard(board.boardToken);
    if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
      throw new Error('Greenhouse returned an invalid public board response.');
    }
    return payload.jobs.map((item: unknown) => {
      if (!isRecord(item)) return null;
      const location = isRecord(item.location) ? item.location.name : '';
      return createPosting(
        board, item.id, item.title, location, item.content,
        item.absolute_url, item.updated_at || item.first_published,
        undefined, item.application_deadline
      );
    }).filter((job): job is JobPosting => job !== null);
  }

  const payload = await fetchWorkableBoard(board.boardToken);
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new Error('Workable returned an invalid public board response.');
  }
  return payload.jobs.map((item: unknown) => {
    if (!isRecord(item)) return null;
    const location = workableLocation(item);
    const description = item.full_description || item.description || '';
    const rawUrl = item.application_url || item.url || item.shortlink;
    return createPosting(
      board, item.shortcode || item.id || rawUrl, item.title, location,
      description, rawUrl, item.published_on || item.created_at,
      item.workplace_type || item.telecommuting
    );
  }).filter((job): job is JobPosting => job !== null);
}


export interface DirectEmployerRefreshStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

let lastSuccessfulRefreshInMemory: number | null = null;

function getDefaultStorage(): DirectEmployerRefreshStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isDirectEmployerRefreshDue(
  now = Date.now(),
  storage: DirectEmployerRefreshStorage | null = getDefaultStorage()
): boolean {
  if (!storage) {
    return lastSuccessfulRefreshInMemory === null
      || now < lastSuccessfulRefreshInMemory
      || now - lastSuccessfulRefreshInMemory >= DIRECT_EMPLOYER_REFRESH_INTERVAL_MS;
  }
  try {
    const stored = storage.getItem(DIRECT_EMPLOYER_REFRESH_STORAGE_KEY);
    if (!stored) return true;
    const last = Number(stored);
    if (!Number.isFinite(last) || last <= 0 || last > now) return true;
    return now - last >= DIRECT_EMPLOYER_REFRESH_INTERVAL_MS;
  } catch {
    return lastSuccessfulRefreshInMemory === null
      || now < lastSuccessfulRefreshInMemory
      || now - lastSuccessfulRefreshInMemory >= DIRECT_EMPLOYER_REFRESH_INTERVAL_MS;
  }
}

export function markDirectEmployerRefreshCompleted(
  now = Date.now(),
  storage: DirectEmployerRefreshStorage | null = getDefaultStorage()
): void {
  lastSuccessfulRefreshInMemory = now;
  try {
    storage?.setItem(DIRECT_EMPLOYER_REFRESH_STORAGE_KEY, String(now));
  } catch {
    // A failed metadata write must not make job discovery fail.
  }
}

const RETIRED_FEED_NAMES = new Set([
  'remotive live', 'remote ok live', 'jobicy live', 'arbeitnow live',
  'adzuna jobs api'
]);

export function isRetiredAggregatedFeedJob(job: Pick<JobPosting, 'source'>): boolean {
  return RETIRED_FEED_NAMES.has((job.source || '').trim().toLowerCase());
}

/**
 * Reconcile only boards that returned a successful response. If a board request
 * fails, its previously cached jobs are retained rather than being erased.
 * Jobs missing from a successful public board response are no longer published.
 */
export function reconcileDirectEmployerJobs(
  existingJobs: JobPosting[],
  refreshedJobs: JobPosting[],
  successfulBoardIds: string[]
): JobPosting[] {
  const successful = new Set(successfulBoardIds);
  const liveIds = new Set(refreshedJobs.map((job) => job.id));
  const retained = existingJobs.filter((job) => {
    if (isRetiredAggregatedFeedJob(job)) return false;
    const board = DIRECT_EMPLOYER_BOARD_DIRECTORY.find((item) => job.id.startsWith(`${item.id}-`));
    if (!board || !successful.has(board.id)) return true;
    return liveIds.has(job.id);
  });
  const merged = new Map<string, JobPosting>();
  for (const job of [...retained, ...refreshedJobs]) merged.set(job.id, job);
  return Array.from(merged.values());
}
