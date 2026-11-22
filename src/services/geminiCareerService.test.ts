import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGeminiChat, capGeminiResumeText, MAX_GEMINI_RESUME_TEXT_CHARS, getGeminiRetryDelayMs, getTailoringStrategies, isAbortError, isRetryableGeminiStatus, selectGeminiChatModel, validateOptimizedMasterResume } from './geminiCareerService';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('bounded resume structuring input', () => {
  it('caps the resume text sent for optional Gemini structuring at 8,000 characters', () => {
    const longResume = 'A'.repeat(12000);
    const bounded = capGeminiResumeText(longResume);
    expect(MAX_GEMINI_RESUME_TEXT_CHARS).toBe(8000);
    expect(bounded).toHaveLength(8000);
    expect(bounded).toBe(longResume.slice(0, 8000));
    expect(capGeminiResumeText('Short resume')).toBe('Short resume');
  });
});

describe('Gemini retry policy', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])('classifies %s as potentially transient', (status) => {
    expect(isRetryableGeminiStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent status %s', (status) => {
    expect(isRetryableGeminiStatus(status)).toBe(false);
    expect(getGeminiRetryDelayMs(status, '1', 1)).toBeNull();
  });

  it('honors a short Retry-After for 429', () => {
    expect(getGeminiRetryDelayMs(429, '2', 1)).toBe(2000);
  });

  it('does not blindly retry a 429 without Retry-After or after a long quota delay', () => {
    expect(getGeminiRetryDelayMs(429, null, 1)).toBeNull();
    expect(getGeminiRetryDelayMs(429, '60', 1)).toBeNull();
  });

  it('uses bounded exponential backoff with jitter for transient server failures', () => {
    expect(getGeminiRetryDelayMs(503, null, 1, 0)).toBe(400);
    expect(getGeminiRetryDelayMs(503, null, 1, 1)).toBe(600);
    expect(getGeminiRetryDelayMs(503, null, 2, 0)).toBe(800);
  });
});

describe('Gemini model selection', () => {
  it('prefers the current production GPT-OSS model over older catalog entries', () => {
    expect(selectGeminiChatModel([
      'whisper-large-v3',
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b'
    ])).toBe('openai/gpt-oss-120b');
  });

  it('uses GPT-OSS 20B when 120B is not enabled for the key', () => {
    expect(selectGeminiChatModel(['whisper-large-v3', 'openai/gpt-oss-20b']))
      .toBe('openai/gpt-oss-20b');
  });

  it('never chooses a speech model or a retired Llama model as fallback', () => {
    expect(selectGeminiChatModel(['whisper-large-v3', 'llama-3.3-70b-versatile'])).toBeNull();
  });
});

describe('Gemini chat request resilience', () => {
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

    const request = callGeminiChat('system', 'user', 'test-key', 'openai/gpt-oss-120b');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(request).resolves.toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 429 when the provider supplies no short Retry-After', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 429, headers: { get: () => null },
      text: async () => '{"error":{"message":"quota exceeded"}}'
    });
    await expect(callGeminiChat('system', 'user', 'test-key', 'openai/gpt-oss-120b'))
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
    await expect(callGeminiChat('system', 'user', 'test-key', 'openai/gpt-oss-120b'))
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
    const { validateJobVetting } = await import('./geminiCareerService');
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
    const { validateJobVetting } = await import('./geminiCareerService');
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
    const { validateOptimizedMasterResume } = await import('./geminiCareerService');
    const optimized = validateOptimizedMasterResume({
      sourceHeadline: 'Commerce Graduate',
      headline: 'Commerce Graduate | Data Analysis',
      sourceSummary: 'Student with project experience.',
      summary: 'Commerce graduate with practical sales analysis project experience.',
      experiences: [{ id: 'exp-1', bullets: [{ source: 'Prepared weekly reports.', proposed: 'Prepared weekly operational reports.' }] }],
      projects: [{ id: 'proj-1', sourceDescription: 'Used Excel to analyse sales.', description: 'Analysed sales trends using Excel.' }]
    }, source);

    expect(optimized.headline).toContain('Data Analysis');
    expect(optimized.experiences[0].bullets).toEqual(['Prepared weekly operational reports.']);
    expect(optimized.projects[0].description).toContain('sales trends');
    expect(optimized.rawText).toBe(source.rawText);
    expect(optimized.skills).toEqual(source.skills);
    expect(optimized.contactInfo).toEqual(source.contactInfo);
    expect(source.experiences[0].bullets).toEqual(['Prepared weekly reports.']);
    expect(() => validateOptimizedMasterResume({
      sourceHeadline: 'Changed source headline',
      headline: 'Invented headline'
    }, source)).toThrowError(/source headline/i);
  });

  it('rejects invented experience records and changes to the number of source bullets', async () => {
    const { validateOptimizedMasterResume } = await import('./geminiCareerService');
    expect(() => validateOptimizedMasterResume({
      experiences: [{ id: 'invented', bullets: ['Managed a team of ten.'] }]
    }, source)).toThrowError();
    expect(() => validateOptimizedMasterResume({
      experiences: [{ id: 'exp-1', bullets: [
        { source: 'Invented source statement.', proposed: 'Increased revenue by 40%.' }
      ] }]
    }, source)).toThrowError(/source bullet/i);
  });
});


describe('role-aware tailoring strategies', () => {
  const job = { title: 'Customer Support Associate' } as any;

  it('does not offer an ATS-only tailoring strategy when no structured evidence is supplied', () => {
    const profile = {
      rawText: 'A complete resume that has not been structured yet.',
      headline: '',
      summary: '',
      skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [], projects: [], education: [], certifications: [], additionalEvidence: []
    } as any;
    expect(getTailoringStrategies(job, profile)).toEqual([]);
  });

  it('offers an additional-evidence strategy when the profile has volunteering or awards but no work history', () => {
    const profile = {
      rawText: 'Asha Rao asha@example.com +91 90000 00000',
      headline: '',
      summary: '',
      skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [],
      projects: [],
      education: [],
      certifications: [],
      additionalEvidence: ['Volunteering: Supported a local learning centre.']
    } as any;
    const strategies = getTailoringStrategies(job, profile);
    expect(strategies.map((strategy) => strategy.id)).toContain('variant-evidence');
    expect(strategies.some((strategy) => /ATS/i.test(strategy.badge))).toBe(true);
  });
  it('does not generate a job-tailored resume when the profile contains no candidate evidence', async () => {
    const { tailorResumeWithGemini } = await import('./geminiCareerService');
    const emptyProfile = {
      rawText: 'Asha Rao asha@example.com +91 90000 00000',
      headline: '',
      summary: '',
      skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [],
      projects: [],
      education: [],
      certifications: [],
      additionalEvidence: []
    } as any;
    expect(getTailoringStrategies(job, emptyProfile)).toEqual([]);
    await expect(tailorResumeWithGemini(job, emptyProfile, 'test-key')).rejects.toMatchObject({
      code: 'INSUFFICIENT_CANDIDATE_EVIDENCE'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});


describe('evidence-grounded interview preparation', () => {
  const resume = {
    rawText: 'Private raw document text must not be sent.',
    contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '+91 90000 00000', location: 'Chennai', linkedin: '', github: '', portfolio: '' },
    headline: 'Operations Analyst',
    summary: 'Commerce graduate with operations reporting project experience.',
    skills: { technical: ['Excel'], soft: ['Communication'], tools: ['SQL'], domains: ['Operations'] },
    experiences: [{
      id: 'exp-1', company: 'Community Co-op', role: 'Operations Intern', startDate: '2025', endDate: '2025',
      location: 'Chennai', bullets: ['Prepared weekly operational reports using Excel.'], isCurrent: false
    }],
    education: [], projects: [], certifications: [], additionalEvidence: [],
    stats: { wordCount: 40, pageCount: 1, charCount: 200, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: 'resume.docx' }
  } as any;
  const job = {
    id: 'job-1', title: 'Operations Analyst', company: 'Acme', skillsRequired: ['Excel'],
    jobDescriptionRaw: 'Prepare reports and maintain accurate records.'
  } as any;

  it('builds evidence references from structured fields only', async () => {
    const { buildInterviewEvidenceMap } = await import('./geminiCareerService');
    const evidence = buildInterviewEvidenceMap(resume);
    expect(Object.values(evidence)).toContain('Listed technical skill: Excel');
    expect(Object.values(evidence).some((item) => item.includes('Prepared weekly operational reports using Excel.'))).toBe(true);
    expect(Object.values(evidence).some((item) => item.includes('Private raw document text'))).toBe(false);
    expect(Object.values(evidence).some((item) => item.includes('asha@example.com'))).toBe(false);
  });

  it('resolves each generated evidence ID to the exact saved source text', async () => {
    const { buildInterviewEvidenceMap, validateInterviewPrepQuestions } = await import('./geminiCareerService');
    const evidence = buildInterviewEvidenceMap(resume);
    const evidenceId = Object.keys(evidence).find((id) => id.startsWith('experience:'))!;
    const parsed = {
      questions: [0, 1, 2].map((index) => ({
        question: `How did you approach this recorded task, example ${index + 1}?`,
        category: index === 0 ? 'Technical' : index === 1 ? 'Behavioral' : 'Role-Specific',
        suggestedTalkingPoints: ['Explain your own steps.', 'Describe what you learned.'],
        evidenceId
      }))
    };
    const validated = validateInterviewPrepQuestions(parsed, evidence);
    expect(validated).toHaveLength(3);
    expect(validated[0].authenticEvidenceRef).toBe(evidence[evidenceId]);
  });

  it('rejects invented evidence references and unsupported question categories', async () => {
    const { buildInterviewEvidenceMap, validateInterviewPrepQuestions } = await import('./geminiCareerService');
    const evidence = buildInterviewEvidenceMap(resume);
    const base = {
      question: 'How would you approach this responsibility?',
      category: 'Situational',
      suggestedTalkingPoints: ['Clarify the task.'],
      evidenceId: 'not-in-the-master-resume'
    };
    expect(() => validateInterviewPrepQuestions({ questions: [base, base, base] }, evidence))
      .toThrowError(/candidate evidence that does not exist/i);
    expect(() => validateInterviewPrepQuestions({
      questions: Array.from({ length: 3 }, () => ({ ...base, evidenceId: Object.keys(evidence)[0], category: 'Leadership' }))
    }, evidence)).toThrowError(/unsupported question category/i);
  });

  it('refuses personalized interview generation when only contact details are present', async () => {
    const { generateInterviewPrepQuestionsWithGemini } = await import('./geminiCareerService');
    const contactOnly = {
      ...resume,
      rawText: 'Asha Rao asha@example.com +91 90000 00000',
      summary: '',
      skills: { technical: [], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [], additionalEvidence: []
    };
    await expect(generateInterviewPrepQuestionsWithGemini(job, contactOnly, 'test-key'))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_CANDIDATE_EVIDENCE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('tailored artifact interview evidence integrity', () => {
  it('maps every tailored-kit interview question to exact structured candidate evidence', async () => {
    const { buildInterviewEvidenceMap, getTailoringStrategies, validateTailoredOutput } = await import('./geminiCareerService');
    const profile = {
      rawText: 'Do not use this unstructured source text.',
      contactInfo: { name: 'Asha Rao', email: 'asha@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: 'Operations Analyst',
      summary: 'Commerce graduate with reporting experience.',
      skills: { technical: ['Excel'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [], additionalEvidence: [],
      stats: { wordCount: 20, pageCount: 1, charCount: 100, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: '' }
    } as any;
    const job = {
      id: 'job-1', title: 'Operations Analyst', company: 'Acme', workplaceType: 'On-site',
      location: 'Chennai', skillsRequired: ['Excel'], jobDescriptionRaw: 'Prepare operational reports.'
    } as any;
    const evidence = buildInterviewEvidenceMap(profile);
    const evidenceId = 'skill:technical:0';
    const strategies = getTailoringStrategies(job, profile);
    const questions = [0, 1, 2].map((index) => ({
      question: `How would you explain this recorded skill in a real task, example ${index + 1}?`,
      category: 'Role-Specific',
      suggestedTalkingPoints: ['Explain the context honestly.'],
      evidenceId
    }));
    const parsed = {
      variants: strategies.map((strategy) => ({
        name: strategy.name, badge: strategy.badge, description: strategy.description,
        tailoredSummary: profile.summary, tailoredSummaryEvidenceIds: ['summary'], highlightedSkills: ['Excel'], optimizedBullets: [],
        coverLetter: 'I am interested in this role.', coverLetterEvidenceIds: ['skill:technical:0'], interviewPrepQuestions: questions
      }))
    };
    const artifact = validateTailoredOutput(parsed, job, profile);
    expect(artifact.interviewPrepQuestions[0].authenticEvidenceRef).toBe(evidence[evidenceId]);
    expect(artifact.variants.every((variant) => variant.interviewPrepQuestions[0].authenticEvidenceRef === evidence[evidenceId])).toBe(true);
  });

  it('requires valid source evidence references for tailored summaries and non-empty cover letters', async () => {
    const { getTailoringStrategies, validateTailoredOutput } = await import('./geminiCareerService');
    const profile = {
      rawText: '', contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: 'Commerce graduate with reporting experience.',
      skills: { technical: ['Excel'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [], additionalEvidence: [],
      stats: { wordCount: 2, pageCount: 1, charCount: 10, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: '' }
    } as any;
    const job = { id: 'job-1', title: 'Analyst', company: 'Acme', skillsRequired: [], jobDescriptionRaw: '' } as any;
    const strategies = getTailoringStrategies(job, profile);
    const questions = [0, 1, 2].map(() => ({
      question: 'How would you explain your approach to this task?',
      category: 'Behavioral',
      suggestedTalkingPoints: ['Explain your own contribution.'],
      evidenceId: 'summary'
    }));
    const variants = strategies.map((strategy) => ({
      name: strategy.name, badge: strategy.badge, description: strategy.description,
      tailoredSummary: profile.summary, highlightedSkills: ['Excel'], optimizedBullets: [],
      coverLetter: 'I used Excel for reporting work.', interviewPrepQuestions: questions
    }));
    expect(() => validateTailoredOutput({ variants }, job, profile))
      .toThrowError(/tailored summary must cite source evidence/i);

    const withSummaryEvidence = variants.map((variant) => ({
      ...variant,
      tailoredSummaryEvidenceIds: ['summary'],
      coverLetterEvidenceIds: ['invented-evidence-id']
    }));
    expect(() => validateTailoredOutput({ variants: withSummaryEvidence }, job, profile))
      .toThrowError(/cover letter references candidate evidence that does not exist/i);
  });

  it('rejects tailored-kit interview questions that cite invented evidence IDs', async () => {
    const { getTailoringStrategies, validateTailoredOutput } = await import('./geminiCareerService');
    const profile = {
      rawText: '', contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
      headline: '', summary: 'Commerce graduate.', skills: { technical: ['Excel'], soft: [], tools: [], domains: [] },
      experiences: [], education: [], projects: [], certifications: [], additionalEvidence: [],
      stats: { wordCount: 2, pageCount: 1, charCount: 10, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: '' }
    } as any;
    const job = { id: 'job-1', title: 'Analyst', company: 'Acme', skillsRequired: [], jobDescriptionRaw: '' } as any;
    const strategies = getTailoringStrategies(job, profile);
    const invalidQuestions = [0, 1, 2].map(() => ({
      question: 'How would you explain your approach to this task?',
      category: 'Behavioral',
      suggestedTalkingPoints: ['Explain your own contribution.'],
      evidenceId: 'invented-evidence-id'
    }));
    const parsed = {
      variants: strategies.map((strategy) => ({
        name: strategy.name, badge: strategy.badge, description: strategy.description,
        tailoredSummary: profile.summary, tailoredSummaryEvidenceIds: ['summary'], highlightedSkills: ['Excel'], optimizedBullets: [],
        coverLetter: '', coverLetterEvidenceIds: [], interviewPrepQuestions: invalidQuestions
      }))
    };
    expect(() => validateTailoredOutput(parsed, job, profile)).toThrowError(/candidate evidence that does not exist/i);
  });
});
