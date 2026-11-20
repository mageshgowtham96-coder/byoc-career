import type { JobPosting, MasterResume } from '../types';

/**
 * Suggestions are derived from the candidate's own profile and locally cached
 * listings, with a small generic title vocabulary as a discovery fallback.
 * They are prompts only: arbitrary text remains searchable and is never gated
 * by this list.
 */
const COMMON_ROLE_PATTERNS = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer',
  'Full Stack Developer', 'Mobile Developer', 'Data Analyst',
  'Data Scientist', 'Business Analyst', 'Product Analyst',
  'Product Manager', 'Project Manager', 'Project Coordinator',
  'Customer Support Specialist', 'Customer Success Manager',
  'Technical Support Engineer', 'Operations Analyst',
  'Operations Associate', 'Quality Assurance Engineer',
  'QA Engineer', 'UX Designer', 'UI Designer',
  'Marketing Specialist', 'Digital Marketing Manager',
  'Sales Representative', 'Account Manager', 'Finance Analyst',
  'Financial Analyst', 'Human Resources Generalist', 'Recruiter',
  'Cybersecurity Analyst', 'DevOps Engineer', 'Cloud Engineer',
  'Technical Writer', 'Research Associate', 'Content Specialist'
] as const;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
}

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

function tokenMatch(queryToken: string, candidateToken: string, allowPartial = false): number {
  if (candidateToken === queryToken) return 5;
  if (allowPartial && candidateToken.startsWith(queryToken) && queryToken.length >= 2) return 4;
  if (editDistanceAtMostOne(queryToken, candidateToken)) return 1;
  return 0;
}

function candidateScore(queryTokens: string[], candidate: string): number {
  const candidateTokens = normalize(candidate).split(/\s+/).filter(Boolean);
  if (!candidateTokens.length) return 0;
  const initials = candidateTokens.map((token) => token[0]).join('');
  if (queryTokens.length === 1 && initials === queryTokens[0]) return 5;
  let score = 0;
  for (let index = 0; index < queryTokens.length; index += 1) {
    const queryToken = queryTokens[index];
    const best = Math.max(0, ...candidateTokens.map((token) => tokenMatch(queryToken, token, index === queryTokens.length - 1)));
    if (!best) return 0;
    score += best;
  }
  return score;
}

function getResumeCandidates(resume?: MasterResume | null): string[] {
  if (!resume) return [];
  return [
    resume.headline,
    resume.currentRole,
    resume.roleFamily,
    ...(resume.experiences || []).map((item) => item?.role),
    ...(resume.skills?.technical || []),
    ...(resume.skills?.soft || []),
    ...(resume.skills?.tools || []),
    ...(resume.skills?.domains || []),
    ...(resume.projects || []).flatMap((item) => [item?.title, ...(item?.technologies || [])]),
    ...(resume.certifications || []).map((item) => item?.name)
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function getCachedJobCandidates(jobs: JobPosting[]): string[] {
  return jobs.flatMap((job) => [
    job?.title,
    ...(job?.skillsRequired || []),
    ...(job?.skillsPreferred || []),
    ...(job?.skillsListed || [])
  ]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export function getRoleSuggestions(
  query: string,
  resume?: MasterResume | null,
  cachedJobs: JobPosting[] = [],
  limit = 7
): string[] {
  const normalized = normalize(query);
  if (normalized.length < 2) return [];
  const queryTokens = normalized.split(/\s+/).filter((token) => token.length > 1 || token === 'c' || token === 'r');
  if (!queryTokens.length) return [];

  const candidates = [
    ...getResumeCandidates(resume),
    ...getCachedJobCandidates(cachedJobs),
    ...COMMON_ROLE_PATTERNS
  ];
  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const clean = candidate.trim().replace(/\s+/g, ' ');
    const key = normalize(clean);
    if (key && !unique.has(key)) unique.set(key, clean);
  }

  return Array.from(unique.values())
    .map((label, index) => ({ label, index, score: candidateScore(queryTokens, label) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((item) => item.label);
}
