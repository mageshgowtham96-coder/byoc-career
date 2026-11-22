import type { JobPosting } from '../types';

export const DIRECT_EMPLOYER_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const DIRECT_EMPLOYER_REFRESH_STORAGE_KEY = 'byoc_direct_employer_jobs_last_refresh_v1';

export interface DirectEmployerBoard {
  id: string;
  company: string;
  provider: 'greenhouse' | 'lever';
  boardToken: string;
  careersUrl: string;
  market: 'IN';
}

/**
 * First-party employer boards, not aggregators.
 * Initial India directory entries are sourced from the public careers endpoints
 * documented by the employer ATS platforms. Additions must be verified before
 * they are included here.
 */
export const DIRECT_EMPLOYER_BOARD_DIRECTORY: DirectEmployerBoard[] = [
  {
    id: 'direct_greenhouse_groww',
    company: 'Groww',
    provider: 'greenhouse',
    boardToken: 'groww',
    careersUrl: 'https://boards.greenhouse.io/groww',
    market: 'IN'
  },
  {
    id: 'direct_lever_meesho',
    company: 'Meesho',
    provider: 'lever',
    boardToken: 'meesho',
    careersUrl: 'https://jobs.lever.co/meesho',
    market: 'IN'
  }
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

function mapWorkplaceType(value: unknown, location: string, description: string): JobPosting['workplaceType'] {
  const source = String(value || '').toLowerCase();
  const evidence = `${source} ${location} ${description.slice(0, 1200)}`.toLowerCase();
  if (/remote|work from home|wfh/.test(evidence)) return 'Remote';
  if (/hybrid/.test(evidence)) return 'Hybrid';
  if (/on[- ]?site|in[- ]office|office based/.test(evidence)) return 'On-site';
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
    workplaceType: mapWorkplaceType(rawWorkplace, location, description),
    salary: 'Undisclosed',
    postedDate: normalizeDate(rawDate),
    jobDescriptionRaw: description,
    url,
    source: `${board.company} Careers (${board.provider === 'greenhouse' ? 'Greenhouse' : 'Lever'})`,
    skillsRequired: [],
    skillsListed: [],
    fitScore: null,
    matchedKeywords: [],
    missingKeywords: [],
    experienceLevel: 'Unspecified'
  };
}

function fetchGreenhouseBoard(boardToken: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.head) {
      reject(new Error('Greenhouse public board requires a browser session.'));
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
      reject(new Error('Greenhouse public board timed out.'));
    }, 15000);

    registry[callbackName] = (payload: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
        reject(new Error('Greenhouse returned an invalid public board response.'));
        return;
      }
      resolve(payload);
    };

    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Greenhouse public board could not be reached.'));
    };
    script.src = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true&callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

async function fetchLeverBoard(boardToken: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error(`Lever public board returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Lever returned an invalid public board response.');
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Lever public board timed out.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchDirectEmployerBoard(board: DirectEmployerBoard): Promise<JobPosting[]> {
  if (board.provider === 'greenhouse') {
    const payload = await fetchGreenhouseBoard(board.boardToken);
    const jobs = isRecord(payload) && Array.isArray(payload.jobs) ? payload.jobs : [];
    return jobs.map((item: unknown) => {
      if (!isRecord(item)) return null;
      const location = isRecord(item.location) ? item.location.name : '';
      return createPosting(
        board, item.id, item.title, location, item.content,
        item.absolute_url, item.updated_at || item.first_published,
        undefined, item.application_deadline
      );
    }).filter((job): job is JobPosting => job !== null);
  }

  const payload = await fetchLeverBoard(board.boardToken);
  return (Array.isArray(payload) ? payload : []).map((item: unknown) => {
    if (!isRecord(item)) return null;
    const categories = isRecord(item.categories) ? item.categories : {};
    const description = [
      item.descriptionPlain,
      ...(Array.isArray(item.lists) ? item.lists.map((list: unknown) => isRecord(list) ? cleanText(list.text) + ' ' + cleanText(list.content) : '') : []),
      item.additional
    ].filter(Boolean).join('\n');
    return createPosting(
      board, item.id, item.text, categories.location,
      description, item.hostedUrl, typeof item.createdAt === 'number' ? item.createdAt : undefined,
      item.workplaceType, item.applyBy
    );
  }).filter((job): job is JobPosting => job !== null);
}

export interface DirectEmployerRefreshStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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
  if (!storage) return true;
  try {
    const stored = storage.getItem(DIRECT_EMPLOYER_REFRESH_STORAGE_KEY);
    if (!stored) return true;
    const last = Number(stored);
    if (!Number.isFinite(last) || last <= 0 || last > now) return true;
    return now - last >= DIRECT_EMPLOYER_REFRESH_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function markDirectEmployerRefreshCompleted(
  now = Date.now(),
  storage: DirectEmployerRefreshStorage | null = getDefaultStorage()
): void {
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
