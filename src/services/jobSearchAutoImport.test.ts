import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAndExtractJobFromUrl, JobsEveryHourAdapter, parseJobPageMarkdown } from './jobSearchService';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('automatic job URL extraction',()=>{
 const markdown=`# Senior Nurse
Company: Care Example
Location: Chennai, India

## Responsibilities
Provide patient care and coordinate clinical services. Required skills include communication and nursing experience. This is a hybrid position with several responsibilities and qualifications described in this detailed job posting. Candidates should demonstrate patient care, documentation, teamwork, clinical assessment and collaboration. This role requires relevant education and licensure.`;
 it('parses the reader markdown and local fallback details',()=>{
  const parsed=parseJobPageMarkdown(markdown);
  expect(parsed?.title).toBe('Senior Nurse');
  expect(parsed?.company).toBe('Care Example');
  expect(parsed?.skillsRequired).toContain('Nursing');
  expect(parsed?.jobDescriptionRaw.length).toBeGreaterThan(200);
 });
 it('rejects login-wall and too-short content to trigger manual fallback',()=>{
  expect(parseJobPageMarkdown('Sign in to continue. Login required.')).toBeNull();
  expect(parseJobPageMarkdown('Short page')).toBeNull();
 });
 it('retrieves reader text and returns an unscored job awaiting resume calculation',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,text:async()=>markdown});
  vi.stubGlobal('fetch',fetchMock);
  const job=await fetchAndExtractJobFromUrl('https://jobs.example.com/posting/123');
  expect(fetchMock).toHaveBeenCalledWith('https://r.jina.ai/https%3A%2F%2Fjobs.example.com%2Fposting%2F123',expect.objectContaining({signal:expect.anything()}));
  expect(job.jobDescriptionRaw).toContain('Provide patient care');
  expect(job.fitScore).toBeNull();
  expect(job.source).toBe('URL Auto-Import');
 });
 it('reuses cached extracted jobs for repeated identical URLs',async()=>{\n  const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,text:async()=>markdown});vi.stubGlobal('fetch',fetchMock);\n  const first=await fetchAndExtractJobFromUrl('https://jobs.example.com/posting/cache-test');\n  const second=await fetchAndExtractJobFromUrl('https://jobs.example.com/posting/cache-test');\n  expect(second.id).toBe(first.id);expect(fetchMock).toHaveBeenCalledTimes(1);\n });\n it('throws a manual paste fallback error for blocked Jina responses',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,text:async()=> 'Sign in to continue. Login required.'}));
  await expect(fetchAndExtractJobFromUrl('https://linkedin.com/jobs/view/1')).rejects.toThrow(/paste the job description manually/i);
 });
});
describe('JobsEveryHour adapter',()=>{
 it('indexes all-category results with no score until the full description is fetched',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({jobs:[{title:'Registered Nurse',company:'Clinic',location:'Chennai',url:'https://jobs.example/nurse',remote:false,posted:'Today'}]})}));
  const adapter=new JobsEveryHourAdapter();
  const jobs=await adapter.discover('nurse',40);
  expect(jobs.some(j=>j.title==='Registered Nurse')).toBe(true);
  const found=jobs.find(j=>j.title==='Registered Nurse')!;
  expect(found.fitScore).toBeNull();
  expect(found.fitStatusText).toBe('Fetching or full JD required');
  expect(found.source).toBe('JobsEveryHour');
 });
});
