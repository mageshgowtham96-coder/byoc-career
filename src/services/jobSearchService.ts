import type { JobPosting, MasterResume, JobSourcePortal, PortalShortcut } from '../types';
import { callGeminiChat } from './geminiService';

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


export interface JobsEveryHourFeedJob { title?:string; company?:string; location?:string; remote?:boolean; salary?:string; posted?:string; url?:string; description?:string; jobDescription?:string; skills?:string[]; }
export interface JobsEveryHourFeed { jobs?:JobsEveryHourFeedJob[]; total?:number; name?:string; }
const JEH_CATEGORIES=['hardware-engineering','science-healthcare','retail-food-facilities','operations-administration','sales-business-development','skilled-trades','internships-first-jobs','software-development','accounting-finance','leadership','product-project-management','logistics-warehouse-transport','customer-service-support','cloud-devops-it','data-analytics','education-training','marketing-communications','legal-compliance','hr-recruiting','security','ai-machine-learning','jobs-by-language','writing-editing-translation','crypto-web3','design-creative'];
const jehFeedCache=new Map<string,{at:number,jobs:JobPosting[]}>();
const JEH_CACHE_MS=60*60*1000;
function readJobsFeedCache(url:string){const inMemory=jehFeedCache.get(url);if(inMemory)return inMemory;try{const raw=localStorage.getItem('byoc_jeh_feed_'+encodeURIComponent(url));if(raw){const parsed=JSON.parse(raw) as {at:number,jobs:JobPosting[]};jehFeedCache.set(url,parsed);return parsed;}}catch{/* storage may be unavailable */}return undefined;}
function writeJobsFeedCache(url:string,value:{at:number,jobs:JobPosting[]}){jehFeedCache.set(url,value);try{localStorage.setItem('byoc_jeh_feed_'+encodeURIComponent(url),JSON.stringify(value));}catch{/* storage quota/privacy mode */}}
function mapJobsEveryHourJob(raw:JobsEveryHourFeedJob,index:number):JobPosting {
 return {id:'jeh-'+index+'-'+(raw.url||raw.title||'job'),title:raw.title||'Untitled role',company:raw.company||'Company not listed',location:raw.location||'Location unspecified',workplaceType:raw.remote?'Remote':'Unspecified',salary:raw.salary||'Undisclosed',postedDate:raw.posted||'Recently posted',jobDescriptionRaw:raw.description||raw.jobDescription||'',url:sanitizeExternalHttpUrl(raw.url)||'#',source:'JobsEveryHour',skillsRequired:raw.skills||[],fitScore:null,fitStatusText:(raw.description||raw.jobDescription||'').trim().length<500?'Fetching or full JD required':undefined,matchedKeywords:[],missingKeywords:[],experienceLevel:'Unspecified'};
}
/** Searches cross-industry feeds; cached category requests are limited to one per hour. */
export class JobsEveryHourAdapter {
 async discover(query='',limit=60):Promise<JobPosting[]> {
  const q=query.toLowerCase().trim();
  const feeds=await Promise.all(['latest',...JEH_CATEGORIES].map(async slug=>{
   const url=slug==='latest'?'https://jobseveryhour.com/api/v1/latest.json':'https://jobseveryhour.com/api/v1/categories/'+slug+'.json';
   const cached=readJobsFeedCache(url);if(cached&&Date.now()-cached.at<JEH_CACHE_MS)return cached.jobs;
   try{const res=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('Feed status '+res.status);const data=await res.json() as JobsEveryHourFeed;const jobs=(data.jobs||[]).map(mapJobsEveryHourJob);writeJobsFeedCache(url,{at:Date.now(),jobs});return jobs;}catch{return cached?.jobs||[];}
  }));
  let all=feeds.flat();
  if(q){
   const skillSlug=q.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
   const skillUrl='https://jobseveryhour.com/api/v1/skills/'+skillSlug+'.json';
   const cached=readJobsFeedCache(skillUrl);
   let skillJobs=cached&&Date.now()-cached.at<JEH_CACHE_MS?cached.jobs:[];
   if(!skillJobs.length)try{const response=await fetch(skillUrl,{signal:AbortSignal.timeout(15000)});if(response.ok){const data=await response.json() as JobsEveryHourFeed;skillJobs=(data.jobs||[]).map(mapJobsEveryHourJob);writeJobsFeedCache(skillUrl,{at:Date.now(),jobs:skillJobs});}}catch{/* category results still searchable */}
   all=all.concat(skillJobs);
  }
  const unique=deduplicateJobs(all);
  return (q?unique.filter(j=>j.title.toLowerCase().includes(q)||j.company.toLowerCase().includes(q)||j.location.toLowerCase().includes(q)||j.jobDescriptionRaw.toLowerCase().includes(q)||q.split(' ').every(word=>j.title.toLowerCase().includes(word))):unique).slice(0,limit);

 }
}
export const jobsEveryHourAdapter=new JobsEveryHourAdapter();

export interface ExtractedJobDetails { title:string;company:string;location:string;workplaceType:JobPosting['workplaceType'];skillsRequired:string[];jobDescriptionRaw:string; }
export function parseJobPageMarkdown(markdown:string):ExtractedJobDetails|null {
 const normalized=markdown.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 if(normalized.length<250||(/sign in|login required|captcha|access denied|verify you are human/i.test(normalized)&&normalized.length<1800))return null;
 const lines=markdown.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const title=lines.find(x=>x.startsWith('# '))?.replace(/^#+\s*/,'')||'Job Listing';
 const company=lines.find(x=>/^company:|^employer:/i.test(x))?.replace(/^[^:]+:/,'').trim()||'Company not listed';
 const location=lines.find(x=>/^location:/i.test(x))?.replace(/^location:/i,'').trim()||'Location unspecified';
 const description=markdown.replace(/\n{3,}/g,'\n\n').trim();
 const keywords=['JavaScript','TypeScript','Python','Java','SQL','Excel','Communication','Sales','Customer Service','Accounting','Nursing','Project Management','Logistics','Marketing','Leadership','React','Node.js','AWS','Healthcare','Teaching'];
 const skills=keywords.filter(k=>normalized.toLowerCase().includes(k.toLowerCase()));
 return {title,company,location,workplaceType:/remote/i.test(normalized)?'Remote':/hybrid/i.test(normalized)?'Hybrid':/on.site/i.test(normalized)?'On-site':'Unspecified',skillsRequired:skills,jobDescriptionRaw:description};
}
export async function fetchAndExtractJobFromUrl(jobUrl:string,geminiApiKey?:string):Promise<JobPosting> {
 const clean=sanitizeExternalHttpUrl(jobUrl);if(!clean)throw new Error('Please enter a valid HTTP(S) job listing URL.');
 const response=await fetch('https://r.jina.ai/'+encodeURIComponent(clean),{signal:AbortSignal.timeout(20000),headers:{Accept:'text/plain'}});
 if(!response.ok)throw new Error('Automatic page reading failed ('+response.status+'). Paste the job description manually instead.');
 const markdown=await response.text();let parsed=parseJobPageMarkdown(markdown);
 if(!parsed)throw new Error('Listing is blocked, login-walled, or lacks enough job details. Paste the job description manually.');
 if(geminiApiKey?.trim())try{
  const raw=await callGeminiChat('Extract posting metadata and skills. Return JSON fields title, company, location, workplaceType (Remote, Hybrid, On-site, Unspecified), skillsRequired array only. Do not invent details. The original full page text is preserved separately.',markdown.slice(0,24000),geminiApiKey);
  const model=JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,'').trim()) as Partial<ExtractedJobDetails>;
  if(model.title||model.company||model.location||model.workplaceType||Array.isArray(model.skillsRequired))parsed={...parsed,...model,jobDescriptionRaw:parsed.jobDescriptionRaw,skillsRequired:Array.isArray(model.skillsRequired)?model.skillsRequired:parsed.skillsRequired};
 }catch{/* Local extraction fallback */}
 return {id:'url-import-'+Date.now(),title:parsed.title,company:parsed.company,location:parsed.location,workplaceType:parsed.workplaceType,salary:'Undisclosed',postedDate:'Imported just now',jobDescriptionRaw:parsed.jobDescriptionRaw,url:clean,source:'URL Auto-Import',skillsRequired:parsed.skillsRequired,fitScore:null,matchedKeywords:[],missingKeywords:[],experienceLevel:'Unspecified'};
}

export const jobSearchEngine = new LiveJobSearchEngine();
