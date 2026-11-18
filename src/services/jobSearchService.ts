import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';

export interface JobSearchQueryParams {
  query?: string;
  profession?: string;
  targetRole?: string;
  skills?: string[];
  seniority?: string;
  country?: string;
  location?: string;
  includeWorldwideRemote?: boolean;
  workplaceType?: 'All' | 'Remote' | 'Hybrid' | 'On-site';
  salary?: string;
  portal?: JobSourcePortal;
  page?: number;
  limit?: number;
}

export interface JobProviderStatus {
  id: string;
  name: string;
  status: 'queried' | 'unconfigured' | 'error' | 'skipped';
  count: number;
  detail: string;
}

export interface JobProviderAdapter {
  id: string;
  name: string;
  isConfigured: boolean;
  requiresAuth: boolean;
  authHelpUrl?: string;
  statusReason?: string;
  remoteOnly?: boolean;
  search(params: JobSearchQueryParams): Promise<JobPosting[]>;
}

export interface JobSearchResult {
  jobs: JobPosting[];
  totalFound: number;
  sourcesQueried: string[];
  providerStatuses: JobProviderStatus[];
  locationNotice: string;
  lastUpdated: string;
  error?: string;
}

export const ADZUNA_SUPPORTED_COUNTRIES = new Set(['IN', 'US', 'GB', 'CA', 'DE', 'SG']);

const COUNTRY_ELIGIBILITY_ALIASES: Record<string, string[]> = {
  IN: ['india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'gurugram', 'gurgaon', 'noida', 'chennai', 'delhi', 'apac', 'asia'],
  US: ['usa', 'u.s.', 'united states', 'america', 'north america', 'americas', 'us only', 'us-only'],
  GB: ['uk', 'u.k.', 'united kingdom', 'britain', 'england', 'london', 'europe', 'emea'],
  CA: ['canada', 'toronto', 'vancouver', 'montreal', 'north america', 'americas'],
  DE: ['germany', 'deutschland', 'berlin', 'munich', 'europe', 'eu', 'emea'],
  SG: ['singapore', 'apac', 'asia'],
  AE: ['uae', 'u.a.e.', 'united arab emirates', 'dubai', 'abu dhabi', 'mena', 'emea']
};

const COUNTRY_WIDE_REMOTE_MARKERS: Record<string, string[]> = {
  IN: ['india', 'india only', 'within india', 'apac', 'asia'],
  US: ['usa', 'u.s.', 'united states', 'us only', 'north america', 'americas'],
  GB: ['uk', 'u.k.', 'united kingdom', 'britain', 'england', 'europe', 'emea'],
  CA: ['canada', 'north america', 'americas'],
  DE: ['germany', 'deutschland', 'europe', 'eu', 'emea'],
  SG: ['singapore', 'apac', 'asia'],
  AE: ['uae', 'u.a.e.', 'united arab emirates', 'mena', 'emea']
};

const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ['bengaluru', 'bangalore'],
  bangalore: ['bengaluru', 'bangalore'],
  gurugram: ['gurugram', 'gurgaon'],
  gurgaon: ['gurugram', 'gurgaon']
};

const COUNTRY_SPECIFIC_LOCATION_MARKERS: Record<string, string[]> = {
  IN: ['bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'gurugram', 'gurgaon', 'noida', 'chennai', 'delhi'],
  US: ['new york', 'san francisco', 'los angeles', 'seattle', 'austin', 'boston', 'chicago', 'denver'],
  GB: ['london', 'manchester', 'birmingham', 'edinburgh', 'glasgow'],
  CA: ['toronto', 'vancouver', 'montreal', 'ottawa', 'calgary'],
  DE: ['berlin', 'munich', 'hamburg', 'frankfurt'],
  AE: ['dubai', 'abu dhabi']
};

const GLOBAL_REMOTE_MARKERS = ['worldwide', 'anywhere', 'global', 'everywhere', 'any location', 'open to all locations'];

const EXCLUSIVE_REGION_MARKERS: Array<{ marker: RegExp; countries: string[] }> = [
  { marker: /\b(usa only|us only|u\.s\. only|united states only|us[- ]residents only|us[- ]based)\b/i, countries: ['US'] },
  { marker: /\b(uk only|united kingdom only)\b/i, countries: ['GB'] },
  { marker: /\b(canada only)\b/i, countries: ['CA'] },
  { marker: /\b(india only)\b/i, countries: ['IN'] },
  { marker: /\b(germany only)\b/i, countries: ['DE'] },
  { marker: /\b(latam|latin america|south america)\b/i, countries: [] },
  { marker: /\b(europe only|eu only|emea only)\b/i, countries: ['GB', 'DE', 'AE'] },
  { marker: /\b(north america)\b/i, countries: ['US', 'CA'] }
];

export function sanitizeExternalHttpUrl(rawUrl?: string): string | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed === '#') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const DEFAULT_PORTAL_SHORTCUTS: PortalShortcut[] = [
  {
    id: 'portal-glassdoor',
    name: 'Glassdoor',
    searchUrlTemplate: 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword={query}',
    note: 'Shortcut only — BYOC does not fetch live Glassdoor results without an authorized API. Browse externally & paste JD below.',
    isBuiltIn: true
  },
  {
    id: 'portal-linkedin',
    name: 'LinkedIn',
    searchUrlTemplate: 'https://www.linkedin.com/jobs/search/?keywords={query}',
    note: 'External search shortcut — paste copied JD & URL into BYOC.',
    isBuiltIn: true
  },
  {
    id: 'portal-indeed',
    name: 'Indeed',
    searchUrlTemplate: 'https://www.indeed.com/jobs?q={query}',
    note: 'External search shortcut — paste copied JD & URL into BYOC.',
    isBuiltIn: true
  },
  {
    id: 'portal-naukri',
    name: 'Naukri',
    searchUrlTemplate: 'https://www.naukri.com/{query}-jobs',
    note: 'India market external shortcut — paste copied JD & URL into BYOC.',
    isBuiltIn: true
  },
  {
    id: 'portal-foundit',
    name: 'Foundit',
    searchUrlTemplate: 'https://www.foundit.in/srp/results?query={query}',
    note: 'External search shortcut — paste copied JD & URL into BYOC.',
    isBuiltIn: true
  },
  {
    id: 'portal-instahyre',
    name: 'Instahyre',
    searchUrlTemplate: 'https://www.instahyre.com/candidate/opportunities/',
    note: 'External curated board shortcut — paste copied JD & URL into BYOC.',
    isBuiltIn: true
  }
];

export function mergePortalShortcuts(saved?: PortalShortcut[]): PortalShortcut[] {
  const byId = new Map<string, PortalShortcut>();
  for (const item of DEFAULT_PORTAL_SHORTCUTS) {
    byId.set(item.id, item);
  }
  if (Array.isArray(saved)) {
    for (const item of saved) {
      if (item && item.id && item.name && sanitizeExternalHttpUrl(item.searchUrlTemplate.replace('{query}', 'engineer'))) {
        const existing = byId.get(item.id);
        if (!existing || !existing.isBuiltIn || item.isBuiltIn) {
          byId.set(item.id, item);
        }
      }
    }
  }
  return Array.from(byId.values());
}

export function buildPortalShortcutUrl(template: string, query?: string): string | null {
  const cleanQuery = (query || '').trim() || 'software engineer';
  const usesSlug = /\/\{query\}-jobs/i.test(template);
  const replacement = usesSlug
    ? encodeURIComponent(cleanQuery.toLowerCase().replace(/\s+/g, '-'))
    : encodeURIComponent(cleanQuery);
  const hydrated = template.includes('{query}')
    ? template.replace(/\{query\}/g, replacement)
    : template;
  return sanitizeExternalHttpUrl(hydrated);
}

export function isWorldwideCountryCode(country?: string): boolean {
  const normalized = (country || '').trim().toUpperCase();
  return !normalized || normalized === 'GLOBAL' || normalized === 'WORLDWIDE' || normalized === 'ALL';
}

export function matchesRemoteCountryAndLocation(
  jobLocation: string,
  _jobText: string,
  country?: string,
  optionalLocation?: string,
  includeWorldwideRemote = true
): boolean {
  const locLower = (jobLocation || '').toLowerCase();
  const cityFilter = (optionalLocation || '').trim().toLowerCase();

  if (cityFilter) {
    const normalizedCountry = (country || '').trim().toUpperCase();
    const cityAliases = CITY_ALIASES[cityFilter] || [cityFilter];
    const locationNamesCity = cityAliases.some((alias) => locLower.includes(alias));
    const knownSpecificCityInLocation = (COUNTRY_SPECIFIC_LOCATION_MARKERS[normalizedCountry] || [])
      .some((alias) => locLower.includes(alias));
    const countryWideRemote = !knownSpecificCityInLocation && (COUNTRY_WIDE_REMOTE_MARKERS[normalizedCountry] || [])
      .some((marker) => locLower.includes(marker));
    const explicitlyWorldwide = includeWorldwideRemote && GLOBAL_REMOTE_MARKERS.some((marker) => locLower.includes(marker));

    // City eligibility comes from the published location only. A role mentioning a city in its description is not location evidence.
    // Country-wide remote postings remain valid for a city in that country; an explicit city elsewhere does not.
    if (!locationNamesCity && !countryWideRemote && !explicitlyWorldwide) {
      return false;
    }
  }

  if (isWorldwideCountryCode(country)) {
    return true;
  }

  const normalizedCountry = (country || '').trim().toUpperCase();
  // Missing feed location data is not proof that a posting is eligible in a selected market.
  if (/\b(location unspecified|unspecified|unknown location|location unknown)\b/i.test(locLower)) {
    return false;
  }
  const aliases = COUNTRY_ELIGIBILITY_ALIASES[normalizedCountry] || [];

  // Exclude postings explicitly locked to a different region/country
  for (const rule of EXCLUSIVE_REGION_MARKERS) {
    if (rule.marker.test(locLower)) {
      return rule.countries.includes(normalizedCountry);
    }
  }

  if (aliases.some((alias) => locLower.includes(alias))) {
    return true;
  }

  // Only explicit all-location eligibility qualifies as global. A generic "Remote" label is insufficient.
  if (includeWorldwideRemote && GLOBAL_REMOTE_MARKERS.some((marker) => locLower.includes(marker))) {
    return true;
  }

  // Fail closed: a country-specific search must have explicit country/region eligibility evidence.
  // This prevents generic remote and unrecognized locations (e.g. Warsaw) from appearing in India results.
  return false;
}

/**
 * Standardizes raw location names into clean city/country formatting
 */
export function normalizeLocation(rawLocation?: string): string {
  if (!rawLocation) return 'Location Unspecified';
  const trimmed = rawLocation.trim();
  return trimmed.replace(/\s*,\s*/g, ', ').replace(/\s{2,}/g, ' ');
}

/**
 * Deduplicates job postings based on composite signature (normalized company + title)
 */
export function deduplicateJobs(jobs: JobPosting[]): JobPosting[] {
  const seenSignatures = new Set<string>();
  const uniqueList: JobPosting[] = [];

  for (const job of jobs) {
    const signature = `${(job.company || '').trim().toLowerCase()}::${(job.title || '').trim().toLowerCase()}`;
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      uniqueList.push(job);
    }
  }

  return uniqueList;
}

/**
 * Calculates authentic match score strictly from verifiable profile facts vs job criteria.
 * Returns null if master resume is missing or profile data is insufficient.
 */
export function calculateHonestMatch(
  job: JobPosting,
  masterResume: MasterResume | null
): {
  score: number | null;
  statusText: string;
  matchedKeywords: string[];
  missingKeywords: string[];
} {
  if (!masterResume || (!masterResume.rawText && masterResume.experiences.length === 0)) {
    return {
      score: null,
      statusText: 'Insufficient profile data',
      matchedKeywords: [],
      missingKeywords: job.skillsRequired || []
    };
  }

  const candidateSkills = [
    ...(masterResume.skills?.technical || []),
    ...(masterResume.skills?.tools || []),
    ...(masterResume.skills?.soft || []),
    ...(masterResume.skills?.domains || [])
  ].map((s) => s.toLowerCase());

  const rawResumeText = (masterResume.rawText || '').toLowerCase();

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  const requiredSkills = job.skillsRequired || [];
  if (requiredSkills.length === 0) {
    return {
      score: null,
      statusText: 'No job skill criteria specified',
      matchedKeywords: [],
      missingKeywords: []
    };
  }

  for (const skill of requiredSkills) {
    const sLower = skill.toLowerCase();
    const isMatched =
      candidateSkills.some((cs) => cs.includes(sLower) || sLower.includes(cs)) ||
      rawResumeText.includes(sLower);

    if (isMatched) {
      matchedKeywords.push(skill);
    } else {
      missingKeywords.push(skill);
    }
  }

  const rawRatio = matchedKeywords.length / requiredSkills.length;
  const calculatedScore = Math.min(100, Math.max(0, Math.round(rawRatio * 100)));

  return {
    score: calculatedScore,
    statusText: `${calculatedScore}% Verified Match`,
    matchedKeywords,
    missingKeywords
  };
}

/**
 * Adzuna Live Job Search Adapter
 * Requires private server-side App ID and App Key; disabled in pure client-side builds
 * so no shared or private job-provider credentials are ever embedded in browser code.
 */
export class AdzunaJobAdapter implements JobProviderAdapter {
  id = 'adzuna';
  name = 'Adzuna Jobs API';
  requiresAuth = true;
  authHelpUrl = 'https://developer.adzuna.com/';
  statusReason =
    'Disabled in client-only mode: Adzuna requires server-side App ID and App Key credentials (no backend proxy is configured).';

  get isConfigured(): boolean {
    return false;
  }

  async search(_params: JobSearchQueryParams): Promise<JobPosting[]> {
    return [];
  }
}

/**
 * Public Open Remote Job Feed Adapter (Remotive API)
 * Note: Remotive only exposes remote listings and accepts search keywords (?search=).
 * Country and optional location filters are applied locally against candidate_required_location.
 */
export class PublicFeedsJobAdapter implements JobProviderAdapter {
  id = 'public_open_jobs';
  name = 'Remotive Live';
  requiresAuth = false;
  remoteOnly = true;

  get isConfigured(): boolean {
    return true;
  }

  async search(params: JobSearchQueryParams): Promise<JobPosting[]> {
    const fallbackSkill = params.skills && params.skills.length > 0 ? params.skills[0] : '';
    const query = (params.query || params.targetRole || params.profession || fallbackSkill || '').trim().toLowerCase();

    if (!query) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=15`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Remotive Live rate limit exceeded (HTTP 429). Wait a moment before retrying.');
        }
        throw new Error(`Remotive Live returned HTTP ${res.status}.`);
      }

      const data = await res.json();
      const rawJobs = Array.isArray(data?.jobs) ? data.jobs : [];
      const results: JobPosting[] = [];

      for (const item of rawJobs) {
        const parsedLocation = normalizeLocation(item.candidate_required_location || 'Remote');
        const plainDesc = stripJobHtml(item.description, 4000);
        const title = item.title || 'Untitled Role';

        if (
          !matchesRemoteCountryAndLocation(
            parsedLocation,
            `${title} ${plainDesc}`,
            params.country,
            params.location,
            params.includeWorldwideRemote
          )
        ) {
          continue;
        }

        results.push({
          id: `remotive-${item.id}`,
          title,
          company: item.company_name || 'Employer Unspecified',
          location: parsedLocation,
          workplaceType: 'Remote',
          salary: item.salary || 'Undisclosed',
          postedDate: item.publication_date ? new Date(item.publication_date).toLocaleDateString() : 'Unspecified',
          jobDescriptionRaw: plainDesc,
          url: item.url || '#',
          source: 'Remotive Live',
          skillsRequired: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
          fitScore: null,
          matchedKeywords: [],
          missingKeywords: [],
          experienceLevel: 'Unspecified'
        });
      }

      return results;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Remotive Live timed out after 15 seconds. Saved local positions remain available.');
      }
      if (err instanceof Error) {
        throw new Error(
          err.message.startsWith('Remotive Live')
            ? err.message
            : `Remotive Live could not be reached (${err.message}).`
        );
      }
      throw new Error('Remotive Live could not be reached.');
    }
  }
}

const WINDOWS_1252_SPECIAL_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f
};

function repairMojibakeText(value: string): string {
  if (!/(?:Ã|Â|â€|ï»¿)/.test(value)) return value;
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) {
      bytes.push(codePoint);
    } else if (WINDOWS_1252_SPECIAL_BYTES[codePoint] !== undefined) {
      bytes.push(WINDOWS_1252_SPECIAL_BYTES[codePoint]);
    } else {
      return value;
    }
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    const mojibakeMarkers = (text: string) => (text.match(/(?:Ã|Â|â€|ï»¿)/g) || []).length;
    return mojibakeMarkers(repaired) < mojibakeMarkers(value) ? repaired : value;
  } catch {
    return value;
  }
}

function stripJobHtml(value: unknown, maxLength = 5000): string {
  return typeof value === 'string'
    ? repairMojibakeText(value)
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
      .slice(0, maxLength)
    : '';
}

function formatFeedDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Unspecified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unspecified' : date.toLocaleDateString();
}

function parseSalaryRange(min: unknown, max: unknown, currency: unknown, period: unknown): string {
  const low = typeof min === 'number' && Number.isFinite(min) ? min : null;
  const high = typeof max === 'number' && Number.isFinite(max) ? max : null;
  if (low === null && high === null) return 'Undisclosed';
  const amount = low !== null && high !== null
    ? `${low.toLocaleString()}–${high.toLocaleString()}`
    : `${(low ?? high)!.toLocaleString()}`;
  const suffix = [typeof currency === 'string' ? currency : '', typeof period === 'string' ? period : '']
    .filter(Boolean).join(' / ');
  return suffix ? `${amount} ${suffix}` : amount;
}

function createRemoteFeedJob(item: any, sourceId: string, sourceName: string, fields: {
  id: unknown; title: unknown; company: unknown; location: unknown; description: unknown; url: unknown;
  date?: unknown; salary?: string; tags?: unknown;
}): JobPosting | null {
  const title = typeof fields.title === 'string' ? fields.title.trim() : '';
  const company = typeof fields.company === 'string' ? fields.company.trim() : '';
  const url = sanitizeExternalHttpUrl(typeof fields.url === 'string' ? fields.url : '');
  if (!title || !company || !url) return null;

  const location = normalizeLocation(typeof fields.location === 'string' ? fields.location : '');
  const description = stripJobHtml(fields.description);
  const tags = Array.isArray(fields.tags)
    ? fields.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0).slice(0, 12)
    : [];
  const stableId = String(fields.id ?? url);

  return {
    id: `${sourceId}-${stableId}`,
    title,
    company,
    location,
    workplaceType: 'Remote',
    salary: fields.salary || 'Undisclosed',
    postedDate: formatFeedDate(fields.date),
    jobDescriptionRaw: description,
    url,
    source: sourceName,
    skillsRequired: tags,
    fitScore: null,
    matchedKeywords: [],
    missingKeywords: [],
    experienceLevel: 'Unspecified'
  };
}

async function fetchJsonWithTimeout(url: string, sourceName: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      if (response.status === 429) throw new Error(`${sourceName} rate limit exceeded (HTTP 429).`);
      throw new Error(`${sourceName} returned HTTP ${response.status}.`);
    }
    return await response.json();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`${sourceName} timed out after 15 seconds.`);
    if (error instanceof Error && error.message.startsWith(sourceName)) throw error;
    throw new Error(`${sourceName} could not be reached (${error instanceof Error ? error.message : 'network error'}).`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Public, unauthenticated global remote feed. Listings link back to Remote OK as required by its feed guidance. */
export class RemoteOkJobAdapter implements JobProviderAdapter {
  id = 'remote_ok';
  name = 'Remote OK Live';
  requiresAuth = false;
  remoteOnly = true;

  get isConfigured(): boolean { return true; }

  async search(params: JobSearchQueryParams): Promise<JobPosting[]> {
    if (!(params.query || params.targetRole || params.profession || params.skills?.length)) return [];
    const payload = await fetchJsonWithTimeout('https://remoteok.com/api', this.name);
    const items = Array.isArray(payload) ? payload.filter((item: any) => item && typeof item === 'object' && item.id) : [];
    return items.map((item: any) => createRemoteFeedJob(item, this.id, this.name, {
      id: item.id,
      title: item.position || item.title,
      company: item.company,
      location: item.location || 'Location Unspecified',
      description: item.description,
      url: item.url,
      date: item.date,
      salary: item.salary_min || item.salary_max
        ? parseSalaryRange(item.salary_min, item.salary_max, item.salary_currency, item.salary_period)
        : 'Undisclosed',
      tags: item.tags
    })).filter((job: JobPosting | null): job is JobPosting => !!job && matchesRemoteCountryAndLocation(
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location, params.includeWorldwideRemote
    ));
  }
}

/** Public, no-key Jobicy feed. The free endpoint deliberately preserves Jobicy listing URLs for attribution and applications. */
export class JobicyJobAdapter implements JobProviderAdapter {
  id = 'jobicy';
  name = 'Jobicy Live';
  requiresAuth = false;
  remoteOnly = true;

  get isConfigured(): boolean { return true; }

  async search(params: JobSearchQueryParams): Promise<JobPosting[]> {
    if (!(params.query || params.targetRole || params.profession || params.skills?.length)) return [];
    const payload = await fetchJsonWithTimeout('https://jobicy.com/api/jobs?count=50', this.name);
    const items = Array.isArray(payload?.jobs) ? payload.jobs : [];
    return items.map((item: any) => createRemoteFeedJob(item, this.id, this.name, {
      id: item.id,
      title: item.jobTitle,
      company: item.companyName,
      location: item.jobGeo || 'Location Unspecified',
      description: item.jobDescription || item.jobExcerpt,
      url: item.url,
      date: item.pubDate,
      salary: parseSalaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency, item.salaryPeriod),
      tags: []
    })).filter((job: JobPosting | null): job is JobPosting => !!job && matchesRemoteCountryAndLocation(
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location, params.includeWorldwideRemote
    ));
  }
}

export function buildLocationScopeNotice(country?: string, location?: string, includeWorldwideRemote = true): string {
  const cleanLoc = (location || '').trim();
  if (isWorldwideCountryCode(country)) {
    return 'Worldwide remote mode: Remotive, Remote OK, and Jobicy public remote feeds are queried; results depend on each feed and are not an exhaustive global job index.';
  }
  const code = (country || '').trim().toUpperCase();
  const eligibility = includeWorldwideRemote ? `${code} / explicitly worldwide` : `${code} only`;
  const base = `Target region ${code}: Remotive, Remote OK, and Jobicy return remote postings only; BYOC filters locally for ${eligibility} eligibility.`;
  if (cleanLoc) {
    return `${base} The location filter uses the listing's published location, not city mentions in its description. City-specific non-remote boards require a configured regional source or pasted custom JDs.`;
  }
  return base;
}

/**
 * Central Multi-Provider Live Job Search Coordinator
 */
/**
 * Groq-hosted browser discovery. Only role/skill and coarse location filters are sent;
 * candidate resumes, contact details, and application history are never included.
 * Returned listings are discovery candidates, not independently verified vacancies.
 */
export class GroqBrowserSearchJobAdapter implements JobProviderAdapter {
  id = 'groq_browser_search';
  name = 'Groq Browser Search';
  requiresAuth = true;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(params: JobSearchQueryParams): Promise<JobPosting[]> {
    const roleQuery = (params.query || params.targetRole || params.profession || params.skills?.slice(0, 5).join(' ') || '').trim();
    if (!roleQuery) return [];

    const searchContext = [
      `Role or skills: ${roleQuery}`,
      params.country && !isWorldwideCountryCode(params.country) ? `Country: ${params.country}` : 'Country: worldwide',
      params.location ? `Preferred location: ${params.location}` : '',
      params.workplaceType && params.workplaceType !== 'All' ? `Workplace type: ${params.workplaceType}` : ''
    ].filter(Boolean).join('\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{
            role: 'user',
            content: `Search the live web for up to 12 current job vacancies matching these constraints. Prefer direct employer career pages and official ATS postings (Greenhouse, Lever, Ashby, Workday, SmartRecruiters). Do not use recruiter reposts where an employer posting is available. Never invent a vacancy, company, date, or URL. Include only listings where you found a direct job-posting URL. Do not claim that a listing is verified or guaranteed active. Return ONLY a JSON object with this exact shape: {"jobs":[{"title":"string","company":"string","location":"string","workplaceType":"Remote|Hybrid|On-site|Unspecified","salary":"string","postedDate":"string","description":"string","url":"https://...","skillsRequired":["string"]}]}. If no reliable listings are found, return {"jobs":[]}. Search constraints:\n${searchContext}`
          }],
          temperature: 0.1,
          max_tokens: 5000,
          tool_choice: 'required',
          tools: [{ type: 'browser_search' }]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error('Groq Browser Search quota or rate limit reached. Try again later or check your Groq account limits.');
        throw new Error(`Groq Browser Search returned HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Groq Browser Search returned no listing data.');
      }

      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error('Groq Browser Search returned an unreadable result. No jobs were imported.');
      }

      if (!parsed || !Array.isArray(parsed.jobs)) {
        throw new Error('Groq Browser Search response did not match the expected job-list format.');
      }

      return parsed.jobs.slice(0, 12).flatMap((item: any, index: number) => {
        const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 240) : '';
        const company = typeof item?.company === 'string' ? item.company.trim().slice(0, 180) : '';
        const url = sanitizeExternalHttpUrl(typeof item?.url === 'string' ? item.url : '');
        if (!title || !company || !url) return [];

        const workplace = ['Remote', 'Hybrid', 'On-site'].includes(item.workplaceType)
          ? item.workplaceType
          : 'Unspecified';
        const skills = Array.isArray(item.skillsRequired)
          ? item.skillsRequired.filter((skill: unknown): skill is string => typeof skill === 'string' && skill.trim()).slice(0, 12)
          : [];
        return [{
          id: `groq-search-${encodeURIComponent(url).slice(-90)}-${index}`,
          title,
          company,
          location: normalizeLocation(typeof item.location === 'string' ? item.location : ''),
          workplaceType: workplace,
          salary: typeof item.salary === 'string' ? item.salary.slice(0, 120) : 'Undisclosed',
          postedDate: typeof item.postedDate === 'string' ? item.postedDate.slice(0, 80) : 'Unspecified',
          jobDescriptionRaw: stripJobHtml(item.description, 4000),
          url,
          source: 'Groq Browser Search — verify before applying',
          skillsRequired: skills,
          fitScore: null,
          matchedKeywords: [],
          missingKeywords: [],
          experienceLevel: 'Unspecified' as const
        }];
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Groq Browser Search timed out after 45 seconds.');
      }
      throw error instanceof Error ? error : new Error('Groq Browser Search failed.');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class LiveJobSearchEngine {
  private providers: JobProviderAdapter[] = [
    new PublicFeedsJobAdapter(),
    new RemoteOkJobAdapter(),
    new JobicyJobAdapter(),
    new AdzunaJobAdapter()
  ];

  async executeLiveSearch(
    params: JobSearchQueryParams,
    masterResume: MasterResume | null,
    existingJobs: JobPosting[] = [],
    groqApiKey?: string
  ): Promise<JobSearchResult> {
    const normalizedParams: JobSearchQueryParams = {
      ...params,
      country: isWorldwideCountryCode(params.country) ? 'GLOBAL' : params.country?.trim().toUpperCase(),
      location: isWorldwideCountryCode(params.country) ? undefined : params.location?.trim() || undefined
    };

    const gatheredJobs: JobPosting[] = [...existingJobs];
    const queriedSources: string[] = ['Local Stored Positions'];
    const providerStatuses: JobProviderStatus[] = [
      {
        id: 'local_store',
        name: 'Local Stored Positions',
        status: 'queried',
        count: existingJobs.length,
        detail: `${existingJobs.length} locally saved or pasted position(s)`
      }
    ];
    const providerErrors: string[] = [];

    const activeProviders = groqApiKey?.trim()
      ? [...this.providers, new GroqBrowserSearchJobAdapter(groqApiKey)]
      : this.providers;

    for (const provider of activeProviders) {
      if (!provider.isConfigured) {
        providerStatuses.push({
          id: provider.id,
          name: provider.name,
          status: 'unconfigured',
          count: 0,
          detail: provider.statusReason || 'Provider not configured.'
        });
        continue;
      }

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All' && normalizedParams.workplaceType !== 'Remote' && provider.remoteOnly) {
        providerStatuses.push({
          id: provider.id,
          name: provider.name,
          status: 'skipped',
          count: 0,
          detail: `Skipped: ${provider.name} only serves Remote positions (filter is set to ${normalizedParams.workplaceType}).`
        });
        continue;
      }

      try {
        const providerJobs = await provider.search(normalizedParams);
        queriedSources.push(provider.name);
        gatheredJobs.push(...providerJobs);
        providerStatuses.push({
          id: provider.id,
          name: provider.name,
          status: 'queried',
          count: providerJobs.length,
          detail: `Returned ${providerJobs.length} matching listing(s). Source links lead to ${provider.name.replace(' Live', '')}.`
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : `${provider.name} request failed.`;
        providerErrors.push(message);
        providerStatuses.push({
          id: provider.id,
          name: provider.name,
          status: 'error',
          count: 0,
          detail: message
        });
      }
    }

    const uniqueJobs = deduplicateJobs(gatheredJobs);

    const scoredJobs = uniqueJobs.map((job) => {
      const honestMatch = calculateHonestMatch(job, masterResume);
      return {
        ...job,
        fitScore: honestMatch.score,
        matchedKeywords: honestMatch.matchedKeywords,
        missingKeywords: honestMatch.missingKeywords
      };
    });

    const qLower = (normalizedParams.query || '').toLowerCase().trim();
    const locLower = (normalizedParams.location || '').toLowerCase().trim();
    const filtered = scoredJobs.filter((job) => {
      if (qLower) {
        const matchesQuery =
          job.title.toLowerCase().includes(qLower) ||
          job.company.toLowerCase().includes(qLower) ||
          job.location.toLowerCase().includes(qLower) ||
          (job.skillsRequired && job.skillsRequired.some((s) => s.toLowerCase().includes(qLower))) ||
          (job.jobDescriptionRaw && job.jobDescriptionRaw.toLowerCase().includes(qLower));
        if (!matchesQuery) return false;
      }

      if (locLower) {
        const isLiveFeedJob = ['remotive live', 'remote ok live', 'jobicy live', 'groq browser search — verify before applying'].includes((job.source || '').toLowerCase());
        const matchesLoc = !isLiveFeedJob || matchesRemoteCountryAndLocation(
          job.location,
          `${job.title} ${job.jobDescriptionRaw}`,
          normalizedParams.country,
          normalizedParams.location,
          normalizedParams.includeWorldwideRemote
        );
        if (!matchesLoc) return false;
      }

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All') {
        if (job.workplaceType.toLowerCase() !== normalizedParams.workplaceType.toLowerCase()) return false;
      }

      if (normalizedParams.portal && normalizedParams.portal !== 'All') {
        const isLiveSource = ['remotive live', 'remote ok live', 'jobicy live', 'groq browser search — verify before applying'].includes((job.source || '').toLowerCase());
        const matchesPortal =
          normalizedParams.portal === 'User Import'
            ? !isLiveSource
            : (job.source && job.source.toLowerCase().includes(normalizedParams.portal.toLowerCase())) ||
              (job.url && job.url.toLowerCase().includes(normalizedParams.portal.toLowerCase()));
        if (!matchesPortal) return false;
      }

      return true;
    });

    filtered.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));

    return {
      jobs: filtered,
      totalFound: filtered.length,
      sourcesQueried: queriedSources,
      providerStatuses,
      locationNotice: buildLocationScopeNotice(normalizedParams.country, normalizedParams.location, normalizedParams.includeWorldwideRemote),
      lastUpdated: new Date().toISOString(),
      error: providerErrors.length > 0 ? providerErrors.join(' ') : undefined
    };
  }
}

export const jobSearchEngine = new LiveJobSearchEngine();
