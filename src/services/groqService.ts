import type {
  MasterResume,
  JobPosting,
  JobVetting,
  TailoredArtifact,
  TailoredVariant,
  InterviewQuestion
} from '../types';
import { partitionTailoredBullets } from '../utils/tailoredBulletResolver';

/**
 * MANDATORY EXPERIENCE ORIGINALITY LOCK & AUTHENTICITY FILTER
 * Injected in all prompt constructors to strictly prevent fabrication.
 */
export const SYSTEMIC_AUTHENTICITY_FILTER = `
STRICT SYSTEMIC EXPERIENCE ORIGINALITY LOCK:
You may ONLY reorder, emphasize, and rephrase existing evidence explicitly provided in the candidate's uploaded history.
You are strictly forbidden from fabricating or inventing company names, quantitative metrics, dates, degrees, or certifications.
All chosen variations must stay 100% true to the candidate's actual documented experience.
`;

/**
 * Typed error class for Groq API interactions
 */
export class GroqApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public recoveryHint?: string
  ) {
    super(message);
    this.name = 'GroqApiError';
  }
}

export function formatGroqError(err: unknown, fallbackMessage = 'Groq request failed.'): string {
  if (err instanceof GroqApiError) {
    return err.recoveryHint ? `${err.message} ${err.recoveryHint}` : err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallbackMessage;
}

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface GroqModelsResponse {
  data: Array<{
    id: string;
    object: string;
    active?: boolean;
  }>;
}

// Cached preferred model for the active session
let resolvedGroqModel: string | null = null;

/**
 * Discovers and validates active models from the live Groq model catalog
 */
export async function getAvailableGroqModels(apiKey: string): Promise<string[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new GroqApiError(
      'Groq API key is required to query available models.',
      401,
      'API_KEY_MISSING',
      'Please enter your personal Groq API key in the workspace settings or login gate.'
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401) {
        throw new GroqApiError(
          'Invalid Groq API key (401 Unauthorized).',
          401,
          'INVALID_API_KEY',
          'Please verify your API key at https://console.groq.com/keys and re-enter it.'
        );
      }
      if (res.status === 429) {
        throw new GroqApiError(
          'Groq API rate limit or quota exceeded (HTTP 429).',
          429,
          'RATE_LIMITED',
          'Wait 30 to 60 seconds before retrying, or check your Groq account tier.'
        );
      }
      if (res.status >= 500) {
        throw new GroqApiError(
          `Groq provider server error (HTTP ${res.status}).`,
          res.status,
          'PROVIDER_SERVER_ERROR',
          'Groq is temporarily unavailable. Retry in a few moments.'
        );
      }
      throw new GroqApiError(
        `Failed to retrieve models from Groq (HTTP ${res.status}).`,
        res.status,
        'MODEL_FETCH_FAILED',
        'Verify your key and network connectivity.'
      );
    }

    const data: GroqModelsResponse = await res.json();
    const modelIds = (data.data || []).map((m) => m.id);
    return modelIds;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof GroqApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GroqApiError(
        'Model discovery request timed out after 15 seconds.',
        408,
        'TIMEOUT',
        'Check your internet connection and try again.'
      );
    }
    throw new GroqApiError(
      err instanceof Error ? err.message : 'Unknown network failure during model discovery',
      undefined,
      'NETWORK_ERROR'
    );
  }
}

/**
 * Resolves the optimal available Groq chat model
 */
async function resolveOptimalModel(apiKey: string): Promise<string> {
  if (resolvedGroqModel) {
    return resolvedGroqModel;
  }

  const preferredHierarchy = [
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768'
  ];

  try {
    const available = await getAvailableGroqModels(apiKey);
    for (const preferred of preferredHierarchy) {
      if (available.includes(preferred)) {
        resolvedGroqModel = preferred;
        return preferred;
      }
    }
    // Fallback to first available chat model or default
    if (available.length > 0) {
      resolvedGroqModel = available[0];
      return available[0];
    }
  } catch (e) {
    // If discovery fails, default to primary recommended model
    console.warn('Dynamic model resolution fallback:', e);
  }

  resolvedGroqModel = 'llama-3.3-70b-versatile';
  return resolvedGroqModel;
}

/**
 * Core reliable Groq chat execution with 30s timeout and typed HTTP error handling
 */
async function callGroqChat(
  systemPrompt: string,
  userPrompt: string,
  apiKey?: string,
  overrideModel?: string
): Promise<string> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new GroqApiError(
      'Groq API key is missing. Please configure your BYOK credentials in Settings.',
      401,
      'API_KEY_REQUIRED',
      'Go to the Settings tab, enter your Groq API key, and test connectivity.'
    );
  }

  const model = overrideModel || (await resolveOptimalModel(apiKey));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15, // Low temperature for high factual fidelity
        max_tokens: 3800,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let parsedMessage = errorBody;
      try {
        const parsed = JSON.parse(errorBody);
        parsedMessage = parsed.error?.message || errorBody;
      } catch {
        // Keep raw text
      }

      switch (response.status) {
        case 400:
          throw new GroqApiError(
            `Groq 400 Bad Request: ${parsedMessage}`,
            400,
            'BAD_REQUEST',
            'Verify that the job description and resume content are valid text.'
          );
        case 401:
          throw new GroqApiError(
            'Invalid Groq API Key (HTTP 401 Unauthorized).',
            401,
            'UNAUTHORIZED',
            'Check your API key in Settings or generate a new one at console.groq.com.'
          );
        case 403:
          throw new GroqApiError(
            `Groq Access Forbidden (HTTP 403): ${parsedMessage}`,
            403,
            'FORBIDDEN'
          );
        case 404:
          resolvedGroqModel = null; // Invalidate cached model
          throw new GroqApiError(
            `Model ${model} not found or decommissioned (HTTP 404).`,
            404,
            'MODEL_NOT_FOUND',
            'The selected model is unavailable. Try again to rediscover current models.'
          );
        case 429:
          throw new GroqApiError(
            'Groq API rate limit or quota exceeded (HTTP 429).',
            429,
            'RATE_LIMITED',
            'Wait 30 to 60 seconds before retrying, or check your Groq account tier.'
          );
        default:
          if (response.status >= 500) {
            throw new GroqApiError(
              `Groq provider server error (HTTP ${response.status}).`,
              response.status,
              'PROVIDER_SERVER_ERROR',
              'Groq is experiencing high traffic. Retry in a few moments.'
            );
          }
          throw new GroqApiError(
            `Groq API error (${response.status}): ${parsedMessage}`,
            response.status,
            'API_ERROR'
          );
      }
    }

    const data: GroqChatResponse = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new GroqApiError(
        'Groq returned an empty response.',
        502,
        'EMPTY_RESPONSE',
        'Please retry the request.'
      );
    }
    return content;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof GroqApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GroqApiError(
        'Groq API call timed out after 30 seconds.',
        408,
        'TIMEOUT',
        'The model took too long to complete. Please check your network and retry.'
      );
    }
    throw new GroqApiError(
      err instanceof Error ? err.message : 'Unknown communication failure with Groq API.',
      undefined,
      'NETWORK_FAILURE',
      'Verify your network connection and test your API key in Settings.'
    );
  }
}

/**
 * Validates and sanitizes JobVetting schema returned by LLM
 */
function validateJobVetting(parsed: any): JobVetting {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GroqApiError('Job vetting output was not a valid JSON object.', 502, 'SCHEMA_ERROR');
  }

  const rawFit = Number(parsed.cultureFit);
  const cultureFit = isNaN(rawFit) ? 50 : Math.max(0, Math.min(100, Math.round(rawFit)));

  const redFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const greenFlags = Array.isArray(parsed.greenFlags)
    ? parsed.greenFlags.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const pros = Array.isArray(parsed.pros)
    ? parsed.pros.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const cons = Array.isArray(parsed.cons)
    ? parsed.cons.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  const strongAlignments = Array.isArray(parsed.gapAnalysis?.strongAlignments)
    ? parsed.gapAnalysis.strongAlignments.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const addressableGaps = Array.isArray(parsed.gapAnalysis?.addressableGaps)
    ? parsed.gapAnalysis.addressableGaps.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const criticalMissing = Array.isArray(parsed.gapAnalysis?.criticalMissing)
    ? parsed.gapAnalysis.criticalMissing.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  let recommendation: JobVetting['recommendation'] = 'Selective Apply';
  if (parsed.recommendation === 'Strong Match') recommendation = 'Strong Match';
  else if (parsed.recommendation === 'Proceed With Caution') recommendation = 'Proceed With Caution';

  return {
    cultureFit,
    redFlags: redFlags.length > 0 ? redFlags : ['No critical red flags identified in JD text.'],
    greenFlags: greenFlags.length > 0 ? greenFlags : ['Standard job requirements and expectations.'],
    growthTrajectory: String(parsed.growthTrajectory || 'Direct alignment with professional trajectory.'),
    salaryCompetitiveness: String(parsed.salaryCompetitiveness || 'Standard market compensation.'),
    pros: pros.length > 0 ? pros : ['Clear technological focus'],
    cons: cons.length > 0 ? cons : ['Competitive applicant pool'],
    gapAnalysis: {
      strongAlignments,
      addressableGaps,
      criticalMissing
    },
    recommendation,
    summaryVerdict: String(parsed.summaryVerdict || 'Evaluated against candidate qualifications.')
  };
}

/**
 * Vets a Job Description against Candidate Profile using live Groq AI
 */
export async function vetJobWithGroq(
  job: JobPosting,
  masterResume: MasterResume | null,
  apiKey?: string
): Promise<JobVetting> {
  const hasResume = Boolean(masterResume && masterResume.experiences.length > 0);

  const systemPrompt = `You are an elite executive career strategist and job vetting analyst.
${SYSTEMIC_AUTHENTICITY_FILTER}
Analyze the provided job description and candidate profile. Evaluate cultural alignment, compensation transparency, red flags, green flags, and requirement gaps with brutal realism.
You must respond with valid JSON strictly matching this schema:
{
  "cultureFit": number (0-100),
  "redFlags": string[],
  "greenFlags": string[],
  "growthTrajectory": string,
  "salaryCompetitiveness": string,
  "pros": string[],
  "cons": string[],
  "gapAnalysis": {
    "strongAlignments": string[],
    "addressableGaps": string[],
    "criticalMissing": string[]
  },
  "recommendation": "Strong Match" | "Selective Apply" | "Proceed With Caution",
  "summaryVerdict": string
}`;

  const userPrompt = `Job Title: ${job.title}
Company: ${job.company}
Workplace: ${job.workplaceType}
Location: ${job.location}
Salary: ${job.salary || 'Not specified'}
Job Description:
${job.jobDescriptionRaw}

Candidate Master Profile:
${hasResume ? JSON.stringify({
  headline: masterResume?.headline,
  summary: masterResume?.summary,
  skills: masterResume?.skills,
  experience: masterResume?.experiences.map(e => ({ role: e.role, company: e.company, bullets: e.bullets }))
}) : 'No candidate resume uploaded yet. Perform objective JD market vetting.'}`;

  const rawJson = await callGroqChat(systemPrompt, userPrompt, apiKey);

  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateJobVetting(parsed);
  } catch (err: unknown) {
    if (err instanceof GroqApiError) throw err;
    throw new GroqApiError(
      'Failed to parse structured vetting response from Groq.',
      502,
      'PARSE_ERROR',
      'Please retry the vetting evaluation.'
    );
  }
}

/**
 * Validates and sanitizes 3 distinct sibling variants from LLM output
 */
export function validateTailoredOutput(parsed: any, job: JobPosting, masterResume: MasterResume): TailoredArtifact {
  if (!parsed || typeof parsed !== 'object') {
    throw new GroqApiError('LLM response was not valid JSON.', 502, 'SCHEMA_ERROR');
  }

  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (rawVariants.length < 3) {
    throw new GroqApiError(
      `Model returned only ${rawVariants.length} variants instead of the required 3 distinct sibling variants.`,
      502,
      'INSUFFICIENT_VARIANTS',
      'Please retry tailoring to generate all 3 sibling variations.'
    );
  }

  const defaultBadges = [
    { id: 'variant-a', name: 'Variant A: Leadership & Metric Outcomes', badge: 'Leadership & Scale' },
    { id: 'variant-b', name: 'Variant B: Technical Depth & Systems Architecture', badge: 'Systems & Reliability' },
    { id: 'variant-c', name: 'Variant C: Direct ATS Keyword Alignment', badge: 'ATS Match & Delivery' }
  ];

  const validatedVariants: TailoredVariant[] = defaultBadges.map((def, idx) => {
    const rv = rawVariants[idx] || {};

    const { allValidated: optimizedBullets } = partitionTailoredBullets(
      rv.optimizedBullets,
      masterResume,
      `Aligned with ${job.company} requirements.`
    );

    const interviewPrepQuestions: InterviewQuestion[] = Array.isArray(rv.interviewPrepQuestions)
      ? rv.interviewPrepQuestions.map((q: any) => ({
          question: String(q.question || 'Describe your relevant technical contributions.'),
          category: (['Technical', 'Behavioral', 'Architecture', 'Leadership'].includes(q.category)
            ? q.category
            : 'Technical') as InterviewQuestion['category'],
          suggestedTalkingPoints: Array.isArray(q.suggestedTalkingPoints)
            ? q.suggestedTalkingPoints.map((tp: any) => String(tp))
            : ['Cite documented milestones from master profile'],
          authenticEvidenceRef: String(q.authenticEvidenceRef || 'Master Resume Record')
        }))
      : [];

    return {
      id: def.id,
      name: String(rv.name || def.name),
      badge: String(rv.badge || def.badge),
      description: String(rv.description || `Specialized tailoring focusing on ${def.badge}.`),
      tailoredSummary: String(rv.tailoredSummary || masterResume.summary || ''),
      highlightedSkills: Array.isArray(rv.highlightedSkills)
        ? rv.highlightedSkills.map((s: any) => String(s))
        : masterResume.skills.technical.slice(0, 8),
      optimizedBullets,
      coverLetter: String(rv.coverLetter || ''),
      interviewPrepQuestions
    };
  });

  const active = validatedVariants[0];

  return {
    id: 'tailored-' + Date.now(),
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    selectedVariantId: active.id,
    variants: validatedVariants,
    tailoredSummary: active.tailoredSummary,
    highlightedSkills: active.highlightedSkills,
    optimizedBullets: active.optimizedBullets,
    coverLetter: active.coverLetter,
    interviewPrepQuestions: active.interviewPrepQuestions,
    generationTimestamp: new Date().toISOString(),
    authenticityGuaranteed: true
  };
}

/**
 * Tailors Resume Kit & Generates Exactly Three Sibling Variants using live Groq AI
 */
export async function tailorResumeWithGroq(
  job: JobPosting,
  masterResume: MasterResume,
  apiKey?: string
): Promise<TailoredArtifact> {
  const systemPrompt = `You are an ATS optimization specialist and executive career strategist.
${SYSTEMIC_AUTHENTICITY_FILTER}
Synthesize exactly THREE distinct sibling variations of the application kit grounded purely in the candidate's verified history:
- Variant A (Leadership & Scale): Emphasizes measurable business outcomes, scale, and team delivery from actual milestones.
- Variant B (Systems & Reliability): Emphasizes technical craftsmanship, distributed architectures, code quality, and low-latency systems.
- Variant C (ATS Match & Delivery): Emphasizes direct semantic alignment with the job requirements and velocity with zero fluff.

Respond ONLY with valid JSON strictly matching this schema:
{
  "variants": [
    {
      "id": "variant-a",
      "name": "Variant A: High-Impact Metric & Leadership",
      "badge": "Leadership & Scale",
      "description": string,
      "tailoredSummary": string,
      "highlightedSkills": string[],
      "optimizedBullets": [
        {
          "experienceId": string,
          "company": string,
          "role": string,
          "originalBullet": string,
          "tailoredBullet": string,
          "matchRationale": string
        }
      ],
      "coverLetter": string,
      "interviewPrepQuestions": [
        {
          "question": string,
          "category": "Technical" | "Behavioral" | "Architecture" | "Leadership",
          "suggestedTalkingPoints": string[],
          "authenticEvidenceRef": string
        }
      ]
    },
    {
      "id": "variant-b",
      "name": "Variant B: Deep Technical & Architecture",
      "badge": "Systems & Reliability",
      "description": string,
      "tailoredSummary": string,
      "highlightedSkills": string[],
      "optimizedBullets": [ ... ],
      "coverLetter": string,
      "interviewPrepQuestions": [ ... ]
    },
    {
      "id": "variant-c",
      "name": "Variant C: Direct ATS Keyword Velocity",
      "badge": "ATS Match & Delivery",
      "description": string,
      "tailoredSummary": string,
      "highlightedSkills": string[],
      "optimizedBullets": [ ... ],
      "coverLetter": string,
      "interviewPrepQuestions": [ ... ]
    }
  ]
}`;

  const userPrompt = `Target Job:
Title: ${job.title}
Company: ${job.company}
Workplace: ${job.workplaceType}
Location: ${job.location}
Skills Required: ${(job.skillsRequired || []).join(', ')}
Raw Job Description:
${job.jobDescriptionRaw}

Candidate Master Profile Evidence:
${JSON.stringify({
  contactName: masterResume.contactInfo?.name,
  headline: masterResume.headline,
  summary: masterResume.summary,
  skills: masterResume.skills,
  experiences: masterResume.experiences
})}`;

  const rawJson = await callGroqChat(systemPrompt, userPrompt, apiKey);

  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateTailoredOutput(parsed, job, masterResume);
  } catch (err: unknown) {
    if (err instanceof GroqApiError) throw err;
    throw new GroqApiError(
      'Failed to parse tailored artifact response from Groq.',
      502,
      'PARSE_ERROR',
      'Please retry tailoring the resume kit.'
    );
  }
}
