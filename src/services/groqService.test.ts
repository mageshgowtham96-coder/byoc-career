import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroqChat, getGroqRetryDelayMs, isAbortError, isRetryableGroqStatus, selectGroqChatModel, validateOptimizedMasterResume } from './groqService';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Groq retry policy', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])('classifies %s as potentially transient', (status) => {
    expect(isRetryableGroqStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent status %s', (status) => {
    expect(isRetryableGroqStatus(status)).toBe(false);
    expect(getGroqRetryDelayMs(status, '1', 1)).toBeNull();
  });

  it('honors a short Retry-After for 429', () => {
    expect(getGroqRetryDelayMs(429, '2', 1)).toBe(2000);
  });

  it('does not blindly retry a 429 without Retry-After or after a long quota delay', () => {
    expect(getGroqRetryDelayMs(429, null, 1)).toBeNull();
    expect(getGroqRetryDelayMs(429, '60', 1)).toBeNull();
  });

  it('uses bounded exponential backoff with jitter for transient server failures', () => {
    expect(getGroqRetryDelayMs(503, null, 1, 0)).toBe(400);
    expect(getGroqRetryDelayMs(503, null, 1, 1)).toBe(600);
    expect(getGroqRetryDelayMs(503, null, 2, 0)).toBe(800);
  });
});

describe('Groq model selection', () => {
  it('prefers the current production GPT-OSS model over older catalog entries', () => {
    expect(selectGroqChatModel([
      'whisper-large-v3',
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b'
    ])).toBe('openai/gpt-oss-120b');
  });

  it('uses GPT-OSS 20B when 120B is not enabled for the key', () => {
    expect(selectGroqChatModel(['whisper-large-v3', 'openai/gpt-oss-20b']))
      .toBe('openai/gpt-oss-20b');
  });

  it('never chooses a speech model or a retired Llama model as fallback', () => {
    expect(selectGroqChatModel(['whisper-large-v3', 'llama-3.3-70b-versatile'])).toBeNull();
  });
});

describe('Groq chat request resilience', () => {
  it('retries one transient 503 and returns the successful response', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 503, headers: { get: () => null },
        text: async () => '{"error":{"message":"temporarily unavailable"}}'
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] })
      });

    const request = callGroqChat('system', 'user', 'test-key', 'openai/gpt-oss-120b');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(request).resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 429 when the provider supplies no short Retry-After', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 429, headers: { get: () => null },
      text: async () => '{"error":{"message":"quota exceeded"}}'
    });
    await expect(callGroqChat('system', 'user', 'test-key', 'openai/gpt-oss-120b'))
      .rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects truncated output rather than returning an incomplete draft', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: '{"partial":' }, finish_reason: 'length' }] })
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: '{"partial":' }, finish_reason: 'length' }] })
      });
    await expect(callGroqChat('system', 'user', 'test-key', 'openai/gpt-oss-120b'))
      .rejects.toMatchObject({ code: 'OUTPUT_TRUNCATED' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('browser error normalization', () => {
  it('recognizes AbortError DOMExceptions and plain named error objects', () => {
    expect(isAbortError(new DOMException('Request aborted', 'AbortError'))).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError(new Error('ordinary error'))).toBe(false);
  });
});

describe('evidence-bounded job vetting', () => {
  it('does not invent a culture score when the model omits an evidence-backed profile alignment estimate', async () => {
    const { validateJobVetting } = await import('./groqService');
    const result = validateJobVetting({
      cultureFit: 97,
      recommendation: 'Strong Match',
      salaryCompetitiveness: 'Above market',
      growthTrajectory: 'Excellent growth',
      redFlags: [],
      greenFlags: [],
      pros: [],
      cons: [],
      gapAnalysis: {}
    });
    expect(result.profileAlignmentEstimate).toBeNull();
    expect(result.salaryCompetitiveness.toLowerCase()).toContain('not assessed');
    expect(result.growthTrajectory).toContain('AI interpretation');
  });

  it('accepts only an explicitly named profile alignment estimate and clamps its range', async () => {
    const { validateJobVetting } = await import('./groqService');
    const result = validateJobVetting({ profileAlignmentEstimate: 150, recommendation: 'Selective Apply' });
    expect(result.profileAlignmentEstimate).toBe(100);
  });
});


describe('optional Master Resume optimization validation', () => {
  const source = {
    rawText: 'Unmodified original source text',
    contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    headline: 'Commerce Graduate',
    summary: 'Student with project experience.',
    skills: { technical: ['SQL'], soft: [], tools: ['Excel'], domains: [] },
    experiences: [{
      id: 'exp-1', company: 'Local Co-op', role: 'Intern', startDate: '2025', endDate: '2025',
      location: '', bullets: ['Prepared weekly reports.'], isCurrent: false
    }],
    education: [],
    projects: [{ id: 'proj-1', title: 'Sales Analysis', description: 'Used Excel to analyse sales.', technologies: ['Excel'] }],
    certifications: [],
    additionalEvidence: ['Tamil — Native'],
    stats: { wordCount: 20, pageCount: 1, charCount: 120, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: 'resume.docx' }
  } as any;

  it('changes only requested presentation fields and preserves the original profile evidence', async () => {
    const { validateOptimizedMasterResume } = await import('./groqService');
    const optimized = validateOptimizedMasterResume({
      headline: 'Commerce Graduate | Data Analysis',
      summary: 'Commerce graduate with practical sales analysis project experience.',
      experiences: [{ id: 'exp-1', bullets: ['Prepared weekly operational reports.'] }],
      projects: [{ id: 'proj-1', description: 'Analysed sales trends using Excel.' }]
    }, source);

    expect(optimized.headline).toContain('Data Analysis');
    expect(optimized.experiences[0].bullets).toEqual(['Prepared weekly operational reports.']);
    expect(optimized.projects[0].description).toContain('sales trends');
    expect(optimized.rawText).toBe(source.rawText);
    expect(optimized.skills).toEqual(source.skills);
    expect(optimized.contactInfo).toEqual(source.contactInfo);
    expect(source.experiences[0].bullets).toEqual(['Prepared weekly reports.']);
  });

  it('rejects invented experience records and changes to the number of source bullets', async () => {
    const { validateOptimizedMasterResume } = await import('./groqService');
    expect(() => validateOptimizedMasterResume({
      experiences: [{ id: 'invented', bullets: ['Managed a team of ten.'] }]
    }, source)).toThrowError();
    expect(() => validateOptimizedMasterResume({
      experiences: [{ id: 'exp-1', bullets: ['Prepared reports.', 'Increased revenue by 40%.'] }]
    }, source)).toThrowError();
  });
});


describe('optional Master Resume optimization integrity', () => {
  const source = {
    rawText: 'Original source document text',
    contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    headline: 'Commerce Graduate',
    summary: 'Commerce graduate with a retail analysis project.',
    skills: { technical: [], soft: [], tools: ['Excel'], domains: ['SQL'] },
    experiences: [{
      id: 'exp-1', company: 'Sample Bank', role: 'Intern', startDate: '2025', endDate: '2025',
      location: '', bullets: ['Reviewed monthly transaction reports.']
    }],
    education: [{ id: 'edu-1', institution: 'City University', degree: 'B.Com', field: '', gradYear: '2025' }],
    projects: [], certifications: [], additionalEvidence: ['Languages: Tamil — Native'],
    stats: { wordCount: 20, pageCount: 1, charCount: 100, lastParsedDate: '2026-01-01T00:00:00.000Z', sourceFileName: 'asha.docx' }
  };

  it('keeps source profile structure and applies only bullet rewrites mapped to exact source evidence', () => {
    const optimized = validateMasterResumeOptimization({
      headline: 'Commerce Graduate | Data Analysis',
      summary: 'Commerce graduate with practical retail analysis project experience.',
      optimizedBullets: [
        { experienceId: 'exp-1', company: 'Sample Bank', role: 'Intern', originalBullet: 'Reviewed monthly transaction reports.', tailoredBullet: 'Reviewed monthly transaction reports to support operational analysis.' },
        { experienceId: 'exp-1', company: 'Sample Bank', role: 'Intern', originalBullet: 'Invented source bullet', tailoredBullet: 'Created a 40% efficiency improvement.' }
      ]
    }, source as any);

    expect(optimized.rawText).toBe(source.rawText);
    expect(optimized.skills).toEqual(source.skills);
    expect(optimized.education).toEqual(source.education);
    expect(optimized.additionalEvidence).toEqual(source.additionalEvidence);
    expect(optimized.experiences[0].bullets).toEqual([
      'Reviewed monthly transaction reports to support operational analysis.'
    ]);
    expect(optimized.experiences[0].bullets).not.toContain('Created a 40% efficiency improvement.');
  });

  it('rejects malformed optimization output instead of silently replacing the Master Resume', () => {
    expect(() => validateMasterResumeOptimization({ summary: 'Only a summary' }, source as any))
      .toThrow(/valid optimization response/i);
  });
});
