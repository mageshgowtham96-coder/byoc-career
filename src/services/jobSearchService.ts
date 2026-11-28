import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';

export interface JobSearchQueryParams {
  query?: string;
  profession?: string;
  targetRole?: string;
  skills?: string[];
  seniority?: string;
  location?: string;
  workplaceType?: 'All' | 'Remote' | 'Hybrid' | 'On-site';
  salary?: string;
  portal?: JobSourcePortal;
  page?: number;
  limit?: number;
}

export interface JobSearchResult {
  jobs: JobPosting[];
  totalFound: number;
  sourcesQueried: string[];
  locationNotice: string;
  lastUpdated: string;
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

export function buildLocationScopeNotice(location?: string): string {
  const cleanLocation = (location || '').trim();
  return cleanLocation
    ? `Location filter: showing locally stored or manually imported positions matching "${cleanLocation}". No external job feeds are queried.`
    : 'Only locally stored and manually imported positions are searched. No external job feeds are queried.';
}

/**
 * Local-only job search coordinator. It scores and filters positions already stored in the user's workspace.
 */
export class LiveJobSearchEngine {
  async executeLiveSearch(
    params: JobSearchQueryParams,
    masterResume: MasterResume | null,
    existingJobs: JobPosting[] = []
  ): Promise<JobSearchResult> {
    const normalizedParams: JobSearchQueryParams = {
      ...params,
      query: params.query?.trim() || undefined,
      location: params.location?.trim() || undefined
    };

    const providerStatuses: JobProviderStatus[] = [{
      id: 'local_store',
      name: 'Local Stored Positions',
      status: 'queried',
      count: existingJobs.length,
      detail: `${existingJobs.length} locally saved or manually imported position(s)`
    }];

    const scoredJobs = deduplicateJobs(existingJobs).map((job) => {
      const honestMatch = calculateHonestMatch(job, masterResume);
      return {
        ...job,
        fitScore: honestMatch.score,
        matchedKeywords: honestMatch.matchedKeywords,
        missingKeywords: honestMatch.missingKeywords
      };
    });

    const query = (normalizedParams.query || '').toLowerCase();
    const location = (normalizedParams.location || '').toLowerCase();
    const filtered = scoredJobs.filter((job) => {
      if (query) {
        const matchesQuery =
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          job.location.toLowerCase().includes(query) ||
          (job.skillsRequired || []).some((skill) => skill.toLowerCase().includes(query)) ||
          (job.jobDescriptionRaw || '').toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      if (location && !job.location.toLowerCase().includes(location)) return false;

      if (normalizedParams.workplaceType && normalizedParams.workplaceType !== 'All') {
        if (job.workplaceType.toLowerCase() !== normalizedParams.workplaceType.toLowerCase()) return false;
      }

      if (normalizedParams.portal && normalizedParams.portal !== 'All' && normalizedParams.portal !== 'User Import') {
        const portal = normalizedParams.portal.toLowerCase();
        const matchesPortal =
          (job.source || '').toLowerCase().includes(portal) ||
          (job.url || '').toLowerCase().includes(portal);
        if (!matchesPortal) return false;
      }

      return true;
    });

    filtered.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));

    return {
      jobs: filtered,
      totalFound: filtered.length,
      sourcesQueried: ['Local Stored Positions (User Import)'],
      locationNotice: buildLocationScopeNotice(normalizedParams.location),
      lastUpdated: new Date().toISOString()
    };
  }
}

export const jobSearchEngine = new LiveJobSearchEngine();
