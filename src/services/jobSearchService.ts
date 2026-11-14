import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';

export interface JobSearchQueryParams {
  query?: string;
  profession?: string;
  targetRole?: string;
  skills?: string[];
  seniority?: string;
  country?: string;
  location?: string;
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

const GLOBAL_REMOTE_MARKERS = ['worldwide', 'anywhere', 'global', 'remote', 'everywhere', 'any location'];

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
        byId.set(item.id, item);
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
  jobText: string,
  country?: string,
  optionalLocation?: string
): boolean {
  const locLower = (jobLocation || '').toLowerCase();
  const cityFilter = (optionalLocation || '').trim().toLowerCase();

  if (cityFilter) {
    const combinedText = `${locLower} ${(jobText || '').toLowerCase()}`;
    const isExplicitlyAnywhere =
      /\b(worldwide|anywhere|global)\b/i.test(locLower);
    if (!combinedText.includes(cityFilter) && !isExplicitlyAnywhere) {
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

  // Keep genuinely worldwide/unrestricted remote jobs
  if (GLOBAL_REMOTE_MARKERS.some((marker) => locLower.includes(marker))) {
    return true;
  }

  // Fallback: if location text is just a short label with no exclusive lock matching another country,
  // check known foreign-country-only strings to avoid showing e.g. "Australia" or "Brazil" for India.
  const otherCountryAliases = Object.entries(COUNTRY_ELIGIBILITY_ALIASES)
    .filter(([code]) => code !== normalizedCountry)
    .flatMap(([, list]) => list);

  if (otherCountryAliases.some((other) => locLower.includes(other))) {
    return false;
  }

  return true;
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
        const plainDesc = (item.description || '').replace(/<[^>]+>/g, ' ').substring(0, 4000);
        const title = item.title || 'Untitled Role';

        if (
          !matchesRemoteCountryAndLocation(
            parsedLocation,
            `${title} ${plainDesc}`,
            params.country,
            params.location
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

function stripJobHtml(value: unknown, maxLength = 5000): string {
  return typeof value === 'string'
    ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
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
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location
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
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location
    ));
  }
}

export function buildLocationScopeNotice(country?: string, location?: string): string {
  const cleanLoc = (location || '').trim();
  if (isWorldwideCountryCode(country)) {
    return 'Worldwide remote mode: Remotive, Remote OK, and Jobicy public remote feeds are queried; results depend on each feed and are not an exhaustive global job index.';
  }
  const code = (country || '').trim().toUpperCase();
  const base = `Target region ${code}: Remotive, Remote OK, and Jobicy return remote postings only; BYOC filters locally by region eligibility (${code} / Worldwide).`;
  if (cleanLoc) {
    return `${base} Local keyword filter applied for "${cleanLoc}". City-specific non-remote boards require a configured regional API or pasted custom JDs.`;
  }
  return base;
}

/**
 * Central Multi-Provider Live Job Search Coordinator
 */
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
    existingJobs: JobPosting[] = []
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

    for (const provider of this.providers) {
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
        const matchesLoc = matchesRemoteCountryAndLocation(
          job.location,
          `${job.title} ${job.jobDescriptionRaw}`,
          normalizedParams.country,
          normalizedParams.location
        );
        if (!matchesLoc) return false;
      }

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All') {
        if (job.workplaceType.toLowerCase() !== normalizedParams.workplaceType.toLowerCase()) return false;
      }

      if (normalizedParams.portal && normalizedParams.portal !== 'All') {
        const isLiveSource = ['remotive live', 'remote ok live', 'jobicy live'].includes((job.source || '').toLowerCase());
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
      locationNotice: buildLocationScopeNotice(normalizedParams.country, normalizedParams.location),
      lastUpdated: new Date().toISOString(),
      error: providerErrors.length > 0 ? providerErrors.join(' ') : undefined
    };
  }
}

export const jobSearchEngine = new LiveJobSearchEngine();
