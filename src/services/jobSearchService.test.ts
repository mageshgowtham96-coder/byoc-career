import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroqBrowserSearchJobAdapter, identifyJobPortalSource, isLiveDiscoveredJobSource } from './jobSearchService';

const fetchMock = vi.fn();

function responseWith(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      choices: [{ message: { content } }]
    })
  } as Response;
}

describe('GroqBrowserSearchJobAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the documented low-effort Browser Search request and sends only job-search terms', async () => {
    fetchMock.mockResolvedValue(responseWith(JSON.stringify({
      jobs: [{
        title: 'Data Analyst',
        company: 'Acme Analytics',
        location: 'Chennai, India',
        workplaceType: 'Remote',
        salary: 'Undisclosed',
        postedDate: '2026-11-18',
        description: 'Build SQL reports for the operations team.',
        url: 'https://jobs.lever.co/acme/123',
        skillsRequired: ['SQL', 'Power BI']
      }]
    })));

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    const jobs = await adapter.search({
      query: 'Data Analyst',
      skills: ['SQL', 'Power BI'],
      country: 'IN',
      location: 'Chennai',
      workplaceType: 'Remote'
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Data Analyst',
      company: 'Acme Analytics',
      url: 'https://jobs.lever.co/acme/123',
      source: 'Employer Careers · Groq Search (unverified)',
      fitScore: null
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-groq-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.tool_choice).toBe('required');
    expect(body.tools).toEqual([{ type: 'browser_search' }]);
    expect(body.reasoning_effort).toBe('low');
    expect(body.citation_options).toBe('enabled');
    expect(body.messages[0].content).toContain('Data Analyst');
    expect(body.messages[0].content).toContain('LinkedIn Jobs');
    expect(body.messages[0].content).toContain('Naukri');
    expect(body.messages[0].content).toContain('Do not search GitHub');
    expect(body.messages[0].content).toContain('Chennai');
    expect(body.messages[0].content).toContain('Relevant skills: SQL, Power BI');
    expect(body.messages[0].content).not.toContain('asha@example.com');
    expect(body.messages[0].content).not.toContain('Master Resume');
  });

  it('does not call Groq when there is no role or skill query', async () => {
    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');

    await expect(adapter.search({})).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON instead of importing guessed listings', async () => {
    fetchMock.mockResolvedValue(responseWith('Here are some jobs:'));

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    await expect(adapter.search({ query: 'Data Analyst' })).rejects.toThrow(/unreadable result/i);
  });

  it('drops listings with unsafe or missing posting URLs', async () => {
    fetchMock.mockResolvedValue(responseWith(JSON.stringify({
      jobs: [
        { title: 'Unsafe', company: 'Example', url: 'javascript:alert(1)' },
        { title: 'Missing URL', company: 'Example' }
      ]
    })));

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    await expect(adapter.search({ query: 'Data Analyst' })).resolves.toEqual([]);
  });

  it('reports quota limits clearly', async () => {
    fetchMock.mockResolvedValue(responseWith('', 429));

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    await expect(adapter.search({ query: 'Data Analyst' })).rejects.toThrow(/quota or rate limit/i);
  });
});

describe('identifyJobPortalSource', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/123', 'LinkedIn'],
    ['https://in.indeed.com/viewjob?jk=abc', 'Indeed'],
    ['https://www.naukri.com/job-listings/example', 'Naukri'],
    ['https://www.foundit.in/job/example', 'Foundit'],
    ['https://www.glassdoor.com/job-listing/example', 'Glassdoor'],
    ['https://www.instahyre.com/jobs/example', 'Instahyre'],
    ['https://jobs.lever.co/example/123', 'Employer Careers'],
    ['https://notlinkedin.com/jobs/123', 'Employer Careers']
  ])('classifies %s as %s', (url, expected) => {
    expect(identifyJobPortalSource(url)).toBe(expected);
  });
});

describe('isLiveDiscoveredJobSource', () => {
  it.each([
    ['Remotive Live', true],
    ['Remote OK Live', true],
    ['Jobicy Live', true],
    ['LinkedIn · Groq Search (unverified)', true],
    ['Employer Careers · Groq Search (unverified)', true],
    ['User Import', false],
    ['Company Careers', false]
  ])('classifies %s as discovered=%s', (source, expected) => {
    expect(isLiveDiscoveredJobSource(source)).toBe(expected);
  });
});
