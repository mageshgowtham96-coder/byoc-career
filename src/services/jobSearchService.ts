import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';
import { expandTamilJobSearchQuery, translateTamilJobSearchQuery } from '../utils/roleSuggestions';

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
  US: ['usa', 'u.s.', 'united states', 'us only', 'anywhere in the us', 'anywhere in us', 'remote anywhere in the us', 'north america', 'americas'],
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

function getExplicitWorldwideLocationEvidence(location: string): string | null {
  // Require the location field itself to express worldwide scope. Do not let
  // "Global HQ, New York" or "Anywhere in the US" bypass country eligibility.
  const match = (location || '').trim().match(
    /^(?:remote\s*[-—,:]?\s*)?(?:worldwide|anywhere|everywhere|global|any location|open to all locations|open worldwide|anywhere in (?:the )?world)(?:\s*[-—,:]?\s*remote)?$/i
  );
  return match?.[0] || null;
}

const EXCLUSIVE_REGION_MARKERS: Array<{ marker: RegExp; countries: string[] }> = [
  { marker: /\b(anywhere|work from anywhere|remote anywhere)\s+in\s+(?:the\s+)?(?:us|usa|u\.s\.|united states)\b/i, countries: ['US'] },
  { marker: /\b(usa only|us only|u\.s\. only|united states only|us[- ]residents only|us[- ]based)\b/i, countries: ['US'] },
  { marker: /\b(uk only|united kingdom only)\b/i, countries: ['GB'] },
  { marker: /\b(canada only)\b/i, countries: ['CA'] },
  { marker: /\b(india only)\b/i, countries: ['IN'] },
  { marker: /\b(germany only)\b/i, countries: ['DE'] },
  { marker: /\b(latam|latin america|south america)\b/i, countries: [] },
  { marker: /\b(europe only|eu only|emea only)\b/i, countries: ['GB', 'DE', 'AE'] },
  { marker: /\b(north america)\b/i, countries: ['US', 'CA'] }
];

export function assessRemoteCountryEligibility(
  jobLocation: string,
  country?: string
): import('../types').JobEligibilityAssessment {
  const location = (jobLocation || '').trim();
  const locLower = location.toLowerCase();
  const market = (country || '').trim().toUpperCase();

  if (isWorldwideCountryCode(market)) {
    return {
      status: 'not-assessed',
      market: 'GLOBAL',
      evidence: 'No country-specific eligibility filter was applied.',
      source: 'search-scope'
    };
  }

  if (!locLower || /\b(location unspecified|unspecified|unknown location|location unknown)\b/i.test(locLower)) {
    return {
      status: 'not-stated',
      market,
      evidence: 'The published location does not state an eligible market.',
      source: 'published-location'
    };
  }

  for (const rule of EXCLUSIVE_REGION_MARKERS) {
    const match = location.match(rule.marker);
    if (!match) continue;
    const regionalMarker = /north america|europe only|eu only|emea only/i.test(match[0]);
    return {
      status: rule.countries.includes(market)
        ? (regionalMarker ? 'regionally-eligible' : 'explicitly-eligible')
        : 'explicitly-ineligible',
      market,
      evidence: match[0],
      source: 'published-location'
    };
  }

  const aliases = COUNTRY_ELIGIBILITY_ALIASES[market] || [];
  const matchedAlias = aliases.find((alias) => locLower.includes(alias));
  if (matchedAlias) {
    const regionalMarker = /^(apac|asia|europe|eu|emea|americas|north america|mena)$/i.test(matchedAlias);
    const index = locLower.indexOf(matchedAlias);
    return {
      status: regionalMarker ? 'regionally-eligible' : 'explicitly-eligible',
      market,
      evidence: location.slice(index, index + matchedAlias.length),
      source: 'published-location'
    };
  }

  const worldwideEvidence = getExplicitWorldwideLocationEvidence(location);
  if (worldwideEvidence) {
    return {
      status: 'explicitly-eligible',
      market,
      evidence: worldwideEvidence,
      source: 'published-location'
    };
  }

  return {
    status: 'not-stated',
    market,
    evidence: 'The published location does not explicitly name this market or worldwide eligibility.',
    source: 'published-location'
  };
}

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
  },
  {
    id: 'portal-google-jobs',
    name: 'Google Jobs',
    searchUrlTemplate: 'https://www.google.com/search?q={query}+jobs&ibp=htl;jobs',
    note: 'External Google Jobs search shortcut — paste copied JD & URL into BYOC.',
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
      const validTemplate = typeof item?.searchUrlTemplate === 'string'
        && Boolean(sanitizeExternalHttpUrl(item.searchUrlTemplate.replace('{query}', 'engineer')));
      if (item && typeof item.id === 'string' && item.id.trim()
        && typeof item.name === 'string' && item.name.trim() && validTemplate) {
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
  const originalQuery = (query || '').trim() || 'software engineer';
  const cleanQuery = expandTamilJobSearchQuery(originalQuery);
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
    const explicitlyWorldwide = includeWorldwideRemote && Boolean(getExplicitWorldwideLocationEvidence(jobLocation));

    // City eligibility comes from the published location only. A role mentioning a city in its description is not location evidence.
    // Country-wide remote postings remain valid for a city in that country; an explicit city elsewhere does not.
    if (!locationNamesCity && !countryWideRemote && !explicitlyWorldwide) {
      return false;
    }
  }

  const assessment = assessRemoteCountryEligibility(jobLocation, country);
  // A worldwide search intentionally has no country-specific eligibility gate.
  if (assessment.status === 'not-assessed' && isWorldwideCountryCode(country)) {
    return true;
  }
  if (assessment.status !== 'explicitly-eligible' && assessment.status !== 'regionally-eligible') {
    return false;
  }

  // A worldwide listing may be eligible in this market, but the user can explicitly exclude it.
  if (!includeWorldwideRemote && getExplicitWorldwideLocationEvidence(jobLocation)) {
    return false;
  }
  return true;
}

/**
 * Standardizes raw location names into clean city/country formatting
 */
/** Matches every meaningful search term across a listing without requiring an exact phrase. */
export function matchesJobSearchTerms(
  query: string | undefined,
  ...fields: Array<string | string[] | undefined>
): boolean {
  const normalizedQuery = translateTamilJobSearchQuery(query || '').toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}+#]+/gu, ' ').trim();
  if (!normalizedQuery) return true;
  // Keep standalone C and R searchable; discard other one-letter noise.
  const terms = Array.from(new Set(normalizedQuery.split(/\s+/).filter((term) =>
    term.length > 1 || term === 'c' || term === 'r'
  )));
  if (terms.length === 0) return true;
  const haystack = fields.flatMap((field) => Array.isArray(field) ? field : [field || ''])
    .join(' ').toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}+#]+/gu, ' ');
  return terms.every((term, index) => matchesSearchTerm(haystack, term, index === terms.length - 1));
}

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
    const signature = `${(job.company || '').trim().toLowerCase()}::${(job.title || '').trim().toLowerCase()}::${(job.location || '').trim().toLowerCase()}`;
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      uniqueList.push(job);
    }
  }

  return uniqueList;
}

/**
 * Merge newly discovered matches into the saved local collection without deleting
 * older saved jobs merely because they do not match the current search query.
 */
export function mergeDiscoveredJobs(existingJobs: JobPosting[], discoveredJobs: JobPosting[]): JobPosting[] {
  return deduplicateJobs([...existingJobs, ...discoveredJobs]);
}

/**
 * Search terms should respect token boundaries but tolerate common singular/plural
 * forms in job titles and descriptions (e.g. analyst/analysts, company/companies).
 * Skill scoring intentionally continues to use exact token matching.
 */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function matchesSearchTerm(text: string, term: string, allowPartial = false): boolean {
  if (containsSkillToken(text, term)) return true;
  if (term.length <= 2) return false;

  const tokens = text.split(/[^\p{L}\p{M}\p{N}+#]+/u).filter(Boolean);
  // Partial tokens support live typeahead searches such as "Supp" -> "Support".
  if (allowPartial && term.length >= 3 && tokens.some((token) => token.startsWith(term))) return true;

  const variants = new Set<string>();
  if (term.endsWith('ies') && term.length > 4) {
    variants.add(term.slice(0, -3) + 'y');
  } else if (/(ches|shes|xes|zes|sses)$/.test(term)) {
    variants.add(term.slice(0, -2));
  } else if (term.endsWith('s') && !term.endsWith('ss')) {
    variants.add(term.slice(0, -1));
  }

  if (term.endsWith('y') && term.length > 2) {
    variants.add(term.slice(0, -1) + 'ies');
  } else if (/(s|x|z|ch|sh)$/.test(term)) {
    variants.add(term + 'es');
  } else {
    variants.add(term + 's');
  }

  if (Array.from(variants).some((variant) => containsSkillToken(text, variant))) return true;
  return term.length >= 4 && tokens.some((token) => editDistanceAtMostOne(term, token));
}

/**
 * Keyword overlap is a discovery aid, not proof of qualification or eligibility.
 * Matching uses token boundaries so short skills such as Go, R and C do not
 * match inside unrelated words. Experience depth and eligibility are assessed
 * separately by the user; this function does not claim to verify them.
 */
function containsSkillToken(text: string, skill: string): boolean {
  const normalizedSkill = skill.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedSkill) return false;
  const escaped = normalizedSkill.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const matcher = new RegExp('(^|[^\\p{L}\\p{M}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{M}\\p{N}])', 'iu');
  return matcher.test(text);
}

/**
 * Describes the provenance of the skill criteria behind a keyword-overlap score.
 * Feed tags are not classified by providers as mandatory or preferred requirements.
 */
export interface JobMatchCriteria {
  skills: string[];
  basis: 'user-required' | 'provider-listed-unknown' | 'none';
  label: string;
}

/**
 * Resolve the exact criteria used for both scoring and UI disclosure.
 * Empty/malformed entries are ignored so the displayed denominator cannot
 * drift from the denominator used by calculateHonestMatch.
 */
export function getJobMatchCriteria(
  job: Pick<JobPosting, 'skillsRequired' | 'skillsListed'>
): JobMatchCriteria {
  const required = (Array.isArray(job.skillsRequired) ? job.skillsRequired : [])
    .filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0);
  if (required.length > 0) {
    return {
      skills: required,
      basis: 'user-required',
      label: 'Based on user-specified required skills'
    };
  }

  const listed = (Array.isArray(job.skillsListed) ? job.skillsListed : [])
    .filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0);
  if (listed.length > 0) {
    return {
      skills: listed,
      basis: 'provider-listed-unknown',
      label: 'Provider-listed skills; requirement status unknown'
    };
  }

  return { skills: [], basis: 'none', label: 'No job skill criteria specified' };
}

export function getJobMatchBasisLabel(
  job: Pick<JobPosting, 'skillsRequired' | 'skillsListed'>
): string {
  return getJobMatchCriteria(job).label;
}

export function calculateHonestMatch(
  job: JobPosting,
  masterResume: MasterResume | null
): {
  score: number | null;
  statusText: string;
  matchedKeywords: string[];
  missingKeywords: string[];
} {
  const criteria = getJobMatchCriteria(job);
  const criteriaSkills = criteria.skills;
  // Public feed tags are useful discovery hints, but providers do not classify them
  // as required or preferred. Score them only with an explicit uncertainty label.
  const criteriaLabel = criteria.basis === 'user-required'
    ? 'user-specified required skills'
    : 'feed-listed skills (requirement status unknown)';

  if (!masterResume) {
    return {
      score: null,
      statusText: 'Insufficient profile data',
      matchedKeywords: [],
      missingKeywords: criteriaSkills
    };
  }

  const nonEmptyStrings = (values: unknown[]): string[] =>
    values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const candidateSkills = nonEmptyStrings([
    ...(masterResume.skills?.technical || []),
    ...(masterResume.skills?.tools || []),
    ...(masterResume.skills?.soft || []),
    ...(masterResume.skills?.domains || [])
  ]);
  const experienceEvidence = (masterResume.experiences || []).flatMap((experience) => [
    experience?.role, experience?.company, ...(experience?.bullets || [])
  ]);
  const educationEvidence = (masterResume.education || []).flatMap((education) => [
    education?.institution, education?.degree, education?.field, education?.gradYear, education?.gpa || ''
  ]);
  const projectEvidence = (masterResume.projects || []).flatMap((project) => [
    project?.title, project?.description, ...(project?.technologies || [])
  ]);
  const certificationEvidence = (masterResume.certifications || []).flatMap((certification) => [
    certification?.name, certification?.issuer, certification?.issueDate
  ]);
  const additionalEvidence = masterResume.additionalEvidence || [];
  const profileEvidence = nonEmptyStrings([
    masterResume.rawText,
    masterResume.summary,
    masterResume.headline,
    ...candidateSkills,
    ...experienceEvidence,
    ...educationEvidence,
    ...projectEvidence,
    ...certificationEvidence,
    ...additionalEvidence
  ]);

  // Guided profiles may legitimately have no paid-work history. Education,
  // projects, certifications and other user-authored evidence still count.
  // Blank placeholder rows do not count as evidence.
  if (profileEvidence.length === 0) {
    return {
      score: null,
      statusText: 'Insufficient profile data',
      matchedKeywords: [],
      missingKeywords: criteriaSkills
    };
  }

  const evidenceText = profileEvidence.join(' ');

  if (criteriaSkills.length === 0) {
    return {
      score: null,
      statusText: nonEmptyStrings(job.skillsPreferred || []).length > 0
        ? 'No required or feed-listed skill criteria specified; preferred skills are not treated as requirements'
        : 'No job skill criteria specified',
      matchedKeywords: [],
      missingKeywords: []
    };
  }

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const skill of criteriaSkills) {
    const normalizedSkill = skill.trim().toLowerCase();
    // One- and two-character skills are too ambiguous in ordinary prose (Go, R, C).
    // Count them only when the user explicitly listed the exact skill in a structured
    // skills field. Longer phrases can be reported as keyword overlap from source text.
    const matched = normalizedSkill.length <= 2
      ? candidateSkills.some((candidateSkill) => candidateSkill.trim().toLowerCase() === normalizedSkill)
      : containsSkillToken(evidenceText, skill);
    if (matched) matchedKeywords.push(skill);
    else missingKeywords.push(skill);
  }

  const calculatedScore = Math.round((matchedKeywords.length / criteriaSkills.length) * 100);
  const statusText = calculatedScore + '% keyword overlap against ' + criteriaLabel + ' — experience and eligibility not assessed';
  return {
    score: calculatedScore,
    statusText,
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
    const query = translateTamilJobSearchQuery((params.query || params.targetRole || params.profession || fallbackSkill || '').trim()).toLowerCase();

    if (!query) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=50`,
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
      let rawJobs = Array.isArray(data?.jobs) ? data.jobs : [];

      // A strict provider-side keyword search can return zero results for a minor
      // typo or a short partial token. In that case, retry once against the bounded
      // latest feed and let the shared local typo-tolerant matcher decide relevance.
      if (rawJobs.length === 0) {
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 15000);
        try {
          const fallbackResponse = await fetch(
            'https://remotive.com/api/remote-jobs?limit=50',
            { signal: fallbackController.signal }
          );
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            rawJobs = Array.isArray(fallbackData?.jobs) ? fallbackData.jobs : [];
          }
        } catch {
          // Preserve the empty result from the primary query if the bounded fallback is unavailable.
        } finally {
          clearTimeout(fallbackTimeout);
        }
      }

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
          postedDate: item.publication_date || 'Unspecified',
          jobDescriptionRaw: plainDesc,
          url: item.url || '#',
          source: 'Remotive Live',
          skillsRequired: [],
          skillsListed: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [],
          eligibilityAssessment: assessRemoteCountryEligibility(parsedLocation, params.country),
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
  date?: unknown; salary?: string; tags?: unknown; workplaceType?: JobPosting['workplaceType']; country?: string;
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
    workplaceType: fields.workplaceType || 'Remote',
    salary: fields.salary || 'Undisclosed',
    postedDate: formatFeedDate(fields.date),
    jobDescriptionRaw: description,
    url,
    source: sourceName,
    skillsRequired: [],
    skillsListed: tags,
    eligibilityAssessment: assessRemoteCountryEligibility(location, fields.country),
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
      tags: item.tags,
      country: params.country
    })).filter((job: JobPosting | null): job is JobPosting => !!job && matchesRemoteCountryAndLocation(
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location, params.includeWorldwideRemote
    ));
  }
}

/** Public, no-key Arbeitnow feed. Europe-focused listings retain the original Arbeitnow posting URL. */
export class ArbeitnowJobAdapter implements JobProviderAdapter {
  id = 'arbeitnow';
  name = 'Arbeitnow Live';
  requiresAuth = false;
  remoteOnly = false;

  get isConfigured(): boolean { return true; }

  async search(params: JobSearchQueryParams): Promise<JobPosting[]> {
    if (!(params.query || params.targetRole || params.profession || params.skills?.length)) return [];
    // The official public feed has no keyword parameter; fetch one bounded page and filter locally.
    const payload = await fetchJsonWithTimeout('https://www.arbeitnow.com/api/job-board-api?page=1', this.name);
    const items = Array.isArray(payload?.data) ? payload.data : [];
    return items.map((item: any) => {
      const createdAt = typeof item.created_at === 'number'
        ? new Date(item.created_at * 1000).toISOString()
        : item.created_at;
      return createRemoteFeedJob(item, this.id, this.name, {
        id: item.slug || item.id,
        title: item.title,
        company: item.company_name,
        location: item.location || 'Location Unspecified',
        description: item.description,
        url: item.url,
        date: createdAt,
        tags: item.tags,
        workplaceType: item.remote === true ? 'Remote' : 'Unspecified',
        country: params.country
      });
    }).filter((job: JobPosting | null): job is JobPosting => !!job && matchesRemoteCountryAndLocation(
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

    // Jobicy's public feed contains the most recent seven days and supports cursor pagination.
    // Avoid its exact-tag filter: multi-word role phrases often do not match feed tags. Fetch a bounded sample and match locally.
    const baseUrl = new URL('https://jobicy.com/api/jobs');
    baseUrl.searchParams.set('count', '100');

    const items: any[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 3; page += 1) {
      const pageUrl = new URL(baseUrl.toString());
      if (cursor) pageUrl.searchParams.set('cursor', cursor);
      const payload = await fetchJsonWithTimeout(pageUrl.toString(), this.name);
      if (Array.isArray(payload?.jobs)) items.push(...payload.jobs);
      const nextCursor = typeof payload?.nextCursor === 'string' ? payload.nextCursor : '';
      if (!payload?.hasMore || !nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    return items.map((item: any) => createRemoteFeedJob(item, this.id, this.name, {
      id: item.id,
      title: item.jobTitle,
      company: item.companyName,
      location: item.jobGeo || 'Location Unspecified',
      description: item.jobDescription || item.jobExcerpt,
      url: item.url,
      date: item.pubDate,
      salary: parseSalaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency, item.salaryPeriod),
      tags: [],
      country: params.country
    })).filter((job: JobPosting | null): job is JobPosting => !!job && matchesRemoteCountryAndLocation(
      job.location, `${job.title} ${job.jobDescriptionRaw}`, params.country, params.location, params.includeWorldwideRemote
    ));
  }
}

export function buildLocationScopeNotice(country?: string, location?: string, includeWorldwideRemote = true): string {
  const cleanLoc = (location || '').trim();
  if (isWorldwideCountryCode(country)) {
    return 'Worldwide mode queries Remotive, Remote OK, Jobicy, and Arbeitnow public feeds; results depend on each feed and are not an exhaustive global job index.';
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
/** Identifies the actual job-board host so discovery results can be filtered by portal. */
export function identifyJobPortalSource(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    const portals: Array<{ domain: string; label: string }> = [
      { domain: 'linkedin.com', label: 'LinkedIn' },
      { domain: 'indeed.com', label: 'Indeed' },
      { domain: 'indeed.co.in', label: 'Indeed' },
      { domain: 'naukri.com', label: 'Naukri' },
      { domain: 'foundit.in', label: 'Foundit' },
      { domain: 'glassdoor.com', label: 'Glassdoor' },
      { domain: 'instahyre.com', label: 'Instahyre' }
    ];
    const match = portals.find(({ domain }) => host === domain || host.endsWith(`.${domain}`));
    return match?.label ?? 'Employer Careers';
  } catch {
    return 'Employer Careers';
  }
}

/** True for jobs discovered from a public live feed, not user-entered records. */
export function isLiveDiscoveredJobSource(source?: string): boolean {
  const normalized = (source || '').toLowerCase();
  return ['remotive live', 'remote ok live', 'jobicy live', 'arbeitnow live'].includes(normalized);
}

/** Returns true only when a published date can be parsed and falls inside the selected freshness window. */
function parsePostedDate(postedDate: string): Date | null {
  const value = (postedDate || '').trim();
  if (!value || /^(unspecified|unknown|just now)$/i.test(value)) return null;
  const direct = new Date(value);
  if (Number.isFinite(direct.getTime())) return direct;

  // Handle common device-locale date strings (DD/MM/YYYY and DD-MM-YYYY).
  const localDate = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localDate) {
    const first = Number(localDate[1]);
    const second = Number(localDate[2]);
    const year = Number(localDate[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) return parsed;
  }
  return null;
}

export function isPostedWithinDays(postedDate: string, days: number, now = new Date()): boolean {
  if (!Number.isFinite(days) || days <= 0) return true;
  const parsed = parsePostedDate(postedDate);
  if (!parsed) return false;
  const ageMs = now.getTime() - parsed.getTime();
  return ageMs >= -24 * 60 * 60 * 1000 && ageMs <= days * 24 * 60 * 60 * 1000;
}

export function formatJobPostedDate(postedDate: string): string {
  const parsed = parsePostedDate(postedDate);
  return parsed ? parsed.toLocaleDateString() : (postedDate || 'Unspecified');
}

export class LiveJobSearchEngine {
  constructor(private providers: JobProviderAdapter[] = [
    new PublicFeedsJobAdapter(),
    new RemoteOkJobAdapter(),
    new JobicyJobAdapter(),
    new ArbeitnowJobAdapter(),
    new AdzunaJobAdapter()
  ]) {}

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
    const providerStatuses: JobProviderStatus[] = [{
      id: 'local_store',
      name: 'Local Stored Positions',
      status: 'queried',
      count: existingJobs.length,
      detail: `${existingJobs.length} locally saved or pasted position(s)`
    }];

    // Run independent public feeds concurrently. One slow/unavailable provider must not delay
    // successful results from the other providers; each adapter retains its own request timeout.
    const providerResults: Array<{ jobs: JobPosting[]; queried: boolean; error?: string; status: JobProviderStatus }> = await Promise.all(this.providers.map(async (provider) => {
      if (!provider.isConfigured) {
        return {
          jobs: [] as JobPosting[],
          queried: false,
          error: undefined as string | undefined,
          status: {
            id: provider.id, name: provider.name, status: 'unconfigured' as const, count: 0,
            detail: provider.statusReason || 'Provider not configured.'
          }
        };
      }

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All' &&
          normalizedParams.workplaceType !== 'Remote' && provider.remoteOnly) {
        return {
          jobs: [] as JobPosting[],
          queried: false,
          status: {
            id: provider.id, name: provider.name, status: 'skipped' as const, count: 0,
            detail: `Skipped: ${provider.name} only serves Remote positions (filter is set to ${normalizedParams.workplaceType}).`
          }
        };
      }

      try {
        const jobs = await provider.search(normalizedParams);
        return {
          jobs,
          queried: true,
          error: undefined as string | undefined,
          status: {
            id: provider.id, name: provider.name, status: 'queried' as const, count: jobs.length,
            detail: `Returned ${jobs.length} matching listing(s). Source links lead to ${provider.name.replace(' Live', '')}.`
          }
        };
      } catch (error: unknown) {
        return {
          jobs: [] as JobPosting[],
          queried: false,
          error: error instanceof Error ? error.message : `${provider.name} request failed.`,
          status: {
            id: provider.id, name: provider.name, status: 'error' as const, count: 0,
            detail: error instanceof Error ? error.message : `${provider.name} request failed.`
          }
        };
      }
    }));

    const providerErrors: string[] = [];
    for (const result of providerResults) {
      providerStatuses.push(result.status);
      if (result.queried) queriedSources.push(result.status.name);
      if (result.error) providerErrors.push(result.error);
      gatheredJobs.push(...result.jobs);
    }

    const uniqueJobs = deduplicateJobs(gatheredJobs);
    const scoredJobs = uniqueJobs.map((job) => {
      const honestMatch = calculateHonestMatch(job, masterResume);
      return {
        ...job,
        fitScore: honestMatch.score,
        fitStatusText: honestMatch.statusText,
        matchedKeywords: honestMatch.matchedKeywords,
        missingKeywords: honestMatch.missingKeywords
      };
    });

    const locLower = (normalizedParams.location || '').toLowerCase().trim();
    const filtered = scoredJobs.filter((job) => {
      if (!matchesJobSearchTerms(normalizedParams.query || normalizedParams.targetRole || normalizedParams.profession,
        job.title, job.company, job.location, [...job.skillsRequired, ...(job.skillsPreferred || []), ...(job.skillsListed || [])], job.jobDescriptionRaw)) return false;

      if (locLower) {
        const source = (job.source || '').toLowerCase();
        const isLiveFeedJob = ['remotive live', 'remote ok live', 'jobicy live', 'arbeitnow live'].includes(source);
        if (isLiveFeedJob && !matchesRemoteCountryAndLocation(
          job.location, `${job.title} ${job.jobDescriptionRaw}`, normalizedParams.country,
          normalizedParams.location, normalizedParams.includeWorldwideRemote
        )) return false;
      }

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All' &&
          job.workplaceType.toLowerCase() !== normalizedParams.workplaceType.toLowerCase()) return false;

      if (normalizedParams.portal && normalizedParams.portal !== 'All') {
        const source = (job.source || '').toLowerCase();
        const isLiveSource = isLiveDiscoveredJobSource(job.source);
        const matchesPortal = normalizedParams.portal === 'User Import'
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
