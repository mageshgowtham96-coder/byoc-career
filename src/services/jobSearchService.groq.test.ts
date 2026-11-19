import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqBrowserSearchJobAdapter } from './jobSearchService';

describe('GroqBrowserSearchJobAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only role and coarse search filters, then maps valid direct links', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              jobs: [{
                title: 'Frontend Engineer',
                company: 'Example Employer',
                location: 'Chennai, India',
                workplaceType: 'Hybrid',
                salary: 'Undisclosed',
                postedDate: '2026-11-18',
                description: '<p>Build React applications</p>',
                url: 'https://careers.example.com/jobs/123',
                skillsRequired: ['React', 'TypeScript']
              }]
            })
          }
        }]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    const jobs = await adapter.search({
      query: 'Frontend Engineer',
      country: 'IN',
      location: 'Chennai',
      workplaceType: 'Hybrid'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe('openai/gpt-oss-20b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.tools).toEqual([{ type: 'browser_search' }]);
    expect(body.citation_options).toBe('enabled');
    expect(body.messages[0].content).toContain('Frontend Engineer');
    expect(body.messages[0].content).toContain('Chennai');
    expect(body.messages[0].content).not.toContain('Master Resume');
    expect(body.messages[0].content).not.toContain('candidate email');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe('https://careers.example.com/jobs/123');
    expect(jobs[0].source).toContain('verify before applying');
    expect(jobs[0].jobDescriptionRaw).toBe('Build React applications');
  });

  it('parses the JSON payload when Groq appends browser citations after it', async () => {
    const result = {
      jobs: [{
        title: 'Data Analyst',
        company: 'Example Employer',
        location: 'India',
        workplaceType: 'Remote',
        url: 'https://careers.example.com/jobs/456',
        description: 'Analyze reporting data'
      }]
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: `${JSON.stringify(result)}\\nSource evidence 〖1†L2-L4〗`
          }
        }]
      })
    }));

    const adapter = new GroqBrowserSearchJobAdapter('test-groq-key');
    await expect(adapter.search({ query: 'Data Analyst' })).resolves.toHaveLength(1);
  });

  it('rejects non-HTTP URLs and incomplete job records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              jobs: [
                { title: 'Bad URL', company: 'Example', url: 'javascript:alert(1)' },
                { title: 'Missing URL', company: 'Example' },
                { title: 'Valid', company: 'Example', url: 'https://example.com/job/1' }
              ]
            })
          }
        }]
      })
    }));

    const jobs = await new GroqBrowserSearchJobAdapter('test-key').search({ query: 'Engineer' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].url).toBe('https://example.com/job/1');
  });

  it('fails closed when the model response is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Not JSON' } }] })
    }));

    await expect(new GroqBrowserSearchJobAdapter('test-key').search({ query: 'Engineer' }))
      .rejects.toThrow('unreadable result');
  });
});
