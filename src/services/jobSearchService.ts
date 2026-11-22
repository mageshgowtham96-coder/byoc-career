import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';
import { expandTamilJobSearchQuery, translateTamilJobSearchQuery } from '../utils/roleSuggestions';
import {
  DIRECT_EMPLOYER_BOARD_DIRECTORY,
  fetchDirectEmployerBoard,
  isDirectEmployerRefreshDue,
  isRetiredAggregatedFeedJob,
  markDirectEmployerRefreshAttempted,
  markDirectEmployerRefreshCompleted,
  reconcileDirectEmployerJobs
} from './directEmployerJobs';

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
  /** Complete locally retained collection after successful-board reconciliation. */
  cachedJobs?: JobPosting[];
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
  const matchedTerms = terms.filter((term, index) => matchesSearchTerm(haystack, term, index === terms.length - 1)).length;
  // A long role phrase is a bundle of search hints, not an exact-phrase requirement.
  // Two meaningful overlapping terms are enough for multi-word queries; one-token
  // searches remain useful for broad discovery and live typeahead.
  return matchedTerms >= Math.min(2, terms.length);
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

export function buildLocationScopeNotice(country?: string, location?: string, includeWorldwideRemote = true): string {
  const cleanLoc = (location || '').trim();
  if (isWorldwideCountryCode(country)) {
    return 'Direct employer discovery checks configured public Greenhouse and Workable career boards. The initial directory is India-focused and is not an exhaustive global job index.';
  }
  const code = (country || '').trim().toUpperCase();
  const eligibility = includeWorldwideRemote ? `${code} / explicitly worldwide` : `${code} only`;
  const base = `Target region ${code}: BYOC checks public employer career boards directly and filters listings using published locations.`;
  if (cleanLoc) {
    return `${base} The initial employer directory is limited; roles with missing or ambiguous locations are not assumed to be in the selected city.`;
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
  return normalized.includes('careers (greenhouse)')
    || normalized.includes('careers (workable)')
    || normalized.includes('careers (ashby)')
    || normalized.includes('careers (smartrecruiters)');
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

class DirectEmployerBoardAdapter implements JobProviderAdapter {
  id: string;
  name: string;
  isConfigured = true;
  requiresAuth = false;

  constructor(private board: (typeof DIRECT_EMPLOYER_BOARD_DIRECTORY)[number]) {
    this.id = board.id;
    this.name = `${board.company} Careers`;
  }

  search(): Promise<JobPosting[]> {
    return fetchDirectEmployerBoard(this.board);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export class LiveJobSearchEngine {
  constructor(private providers: JobProviderAdapter[] = DIRECT_EMPLOYER_BOARD_DIRECTORY.map(
    (board) => new DirectEmployerBoardAdapter(board)
  )) {}

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

    const refreshDue = isDirectEmployerRefreshDue();
    if (refreshDue) markDirectEmployerRefreshAttempted();
    const queriedSources: string[] = ['Local Stored Positions'];
    const providerStatuses: JobProviderStatus[] = [{
      id: 'local_store',
      name: 'Local Stored Positions',
      status: 'queried',
      count: existingJobs.length,
      detail: `${existingJobs.length} locally saved or pasted position(s)`
    }];

    // Refresh direct employer boards no more than once per 12 hours. When the app
    // is opened after the interval, this foreground search performs the refresh.
    // Between refreshes, searches use the encrypted local job cache.
    const providerResults: Array<{ jobs: JobPosting[]; queried: boolean; error?: string; status: JobProviderStatus }> = await mapWithConcurrency(this.providers, 2, async (provider) => {
      if (!refreshDue) {
        return {
          jobs: [] as JobPosting[],
          queried: false,
          status: {
            id: provider.id, name: provider.name, status: 'skipped' as const, count: 0,
            detail: 'Using locally cached employer postings; the next live refresh is due after the 12-hour interval.'
          }
        };
      }
      if (provider.id.startsWith('direct_')
        && !isWorldwideCountryCode(normalizedParams.country)
        && normalizedParams.country !== 'IN') {
        return {
          jobs: [] as JobPosting[],
          queried: false,
          status: {
            id: provider.id, name: provider.name, status: 'skipped' as const, count: 0,
            detail: 'This public employer-board directory currently covers India only; no listings are inferred for another market.'
          }
        };
      }

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
        const detail = error instanceof Error ? error.message : `${provider.name} request failed.`;
        const rateLimited = /HTTP 429|rate limit exceeded/i.test(detail);
        return {
          jobs: [] as JobPosting[],
          queried: false,
          // One feed's rate limit is a provider-status detail, not a failed search.
          error: rateLimited ? undefined : detail,
          status: {
            id: provider.id, name: provider.name, status: rateLimited ? 'skipped' as const : 'error' as const, count: 0,
            detail: rateLimited ? `${provider.name} is temporarily rate-limited; results from other feeds and saved jobs are unaffected.` : detail
          }
        };
      }
    });

    const providerErrors: string[] = [];
    for (const result of providerResults) {
      providerStatuses.push(result.status);
      if (result.queried) queriedSources.push(result.status.name);
      if (result.error) providerErrors.push(result.error);
    }

    const refreshedJobs = providerResults.flatMap((result) => result.jobs);
    const configuredBoardIds = new Set(DIRECT_EMPLOYER_BOARD_DIRECTORY.map((board) => board.id));
    const successfulBoardIds = providerResults
      .filter((result) => result.status.status === 'queried' && configuredBoardIds.has(result.status.id))
      .map((result) => result.status.id);
    if (refreshDue && successfulBoardIds.length > 0) {
      markDirectEmployerRefreshCompleted();
    }
    const reconciledJobs = !refreshDue
      ? existingJobs.filter((job) => !isRetiredAggregatedFeedJob(job))
      : successfulBoardIds.length > 0
        ? reconcileDirectEmployerJobs(existingJobs, refreshedJobs, successfulBoardIds)
        : deduplicateJobs([
            ...existingJobs.filter((job) => !isRetiredAggregatedFeedJob(job)),
            ...refreshedJobs
          ]);
    const uniqueJobs = deduplicateJobs(reconciledJobs);
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

      if (isLiveDiscoveredJobSource(job.source) && !matchesRemoteCountryAndLocation(
        job.location, `${job.title} ${job.jobDescriptionRaw}`, normalizedParams.country,
        normalizedParams.location, normalizedParams.includeWorldwideRemote
      )) return false;

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
      cachedJobs: reconciledJobs,
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
