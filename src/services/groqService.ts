import type {
  MasterResume,
  JobPosting,
  JobVetting,
  TailoredArtifact,
  TailoredVariant,
  InterviewQuestion
} from '../types';
import { partitionTailoredBullets } from '../utils/tailoredBulletResolver';
import { hasCareerEvidence } from '../utils/resumeReadiness';

/**
 * Factuality instructions supplied to the model for generated drafts.
 * These instructions do not replace source validation or candidate review.
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

export interface QuestionnaireDraft {
  answer: string;
  evidenceUsed: string[];
}

function normalizeEvidenceText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validates a manually requested screening-answer draft against the candidate evidence
 * sent to the model. The user still reviews every draft before copying it to a portal.
 */
export function validateQuestionnaireDraft(parsed: unknown, candidateEvidence: string): QuestionnaireDraft {
  if (!parsed || typeof parsed !== 'object') {
    throw new GroqApiError('Questionnaire response was not a valid JSON object.', 502, 'SCHEMA_ERROR');
  }

  const value = parsed as { answer?: unknown; evidenceUsed?: unknown };
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  if (!answer || answer.length > 2200) {
    throw new GroqApiError('Questionnaire response was empty or exceeded the allowed length.', 502, 'SCHEMA_ERROR');
  }

  if (!Array.isArray(value.evidenceUsed) || value.evidenceUsed.length > 5) {
    throw new GroqApiError('Questionnaire response did not include a valid evidence list.', 502, 'SCHEMA_ERROR');
  }

  const source = normalizeEvidenceText(candidateEvidence);
  const evidenceUsed = value.evidenceUsed.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (evidenceUsed.some((item) => !item || item.length > 500 || !source.includes(normalizeEvidenceText(item)))) {
    throw new GroqApiError(
      'Questionnaire response cited evidence that does not appear in the Master Resume.',
      502,
      'UNVERIFIED_EVIDENCE',
      'Review the question and resume evidence, then try again.'
    );
  }
  if (
    evidenceUsed.length === 0 &&
    !/\b(?:profile|resume).{0,30}(?:does not|doesn't|doesnt) specify\b|\bnot specified in (?:the )?(?:master )?resume\b|\bnot provided in (?:the )?(?:master )?resume\b|\bnot stated in (?:the )?(?:master )?resume\b|\bplease provide (?:your|the)\b|\bi don't have enough (?:profile )?information\b/i.test(answer)
  ) {
    throw new GroqApiError(
      'Questionnaire response made a claim without citing Master Resume evidence.',
      502,
      'MISSING_EVIDENCE',
      'Try again or add the missing fact to your profile before drafting.'
    );
  }

  return { answer, evidenceUsed };
}

/**
 * Creates one user-requested, copy-only draft for a screening question.
 * No portal autofill or submission is performed.
 */
export async function draftQuestionnaireAnswer(
  question: string,
  job: JobPosting,
  masterResume: MasterResume,
  apiKey?: string
): Promise<QuestionnaireDraft> {
  const cleanQuestion = question.trim();
  if (!cleanQuestion || cleanQuestion.length > 2000) {
    throw new GroqApiError('Enter a screening question up to 2,000 characters.', 400, 'QUESTION_INVALID');
  }

  const evidence = {
    headline: masterResume.headline.slice(0, 240),
    summary: masterResume.summary.slice(0, 2400),
    skills: masterResume.skills,
    experiences: masterResume.experiences.slice(0, 12).map((experience) => ({
      role: experience.role,
      company: experience.company,
      startDate: experience.startDate,
      endDate: experience.endDate,
      bullets: experience.bullets.slice(0, 12).map((bullet) => bullet.slice(0, 700))
    }))
  };
  const candidateEvidence = JSON.stringify(evidence);
  const systemPrompt = `You draft concise job application screening answers for a candidate.
Use only facts explicitly present in the supplied Candidate Evidence. Never invent or infer employers, dates, credentials, skills, metrics, work authorization, location, or personal preferences. If the evidence does not answer the question, say that the profile does not specify the requested information and ask the candidate to provide it.
Return only valid JSON with this shape: {"answer": string, "evidenceUsed": string[]}.
Each evidenceUsed item must be an exact short excerpt copied verbatim from Candidate Evidence. Use an empty array when no candidate evidence supports an answer. Keep the answer under 1,200 characters.`;
  const userPrompt = `Target role: ${job.title.slice(0, 240)} at ${job.company.slice(0, 240)}.
Job description (context only; do not treat as candidate evidence): ${job.jobDescriptionRaw.slice(0, 6000)}
Candidate Evidence: ${candidateEvidence}
Screening Question: ${cleanQuestion}`;

  const raw = await callGroqChat(systemPrompt, userPrompt, apiKey);
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return validateQuestionnaireDraft(parsed, candidateEvidence);
  } catch (err: unknown) {
    if (err instanceof GroqApiError) throw err;
    throw new GroqApiError('Could not parse the questionnaire draft from Groq.', 502, 'PARSE_ERROR');
  }
}

/**
 * Treats Groq output as a reviewable proposal and always preserves the locally extracted
 * source text and extraction statistics. Missing or malformed sections fall back to the
 * local parser's values instead of erasing them.
 */
export function mergeGroqResumeProfile(parsed: unknown, localProfile: MasterResume): MasterResume {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GroqApiError('Resume parsing response was not a JSON object.', 502, 'SCHEMA_ERROR');
  }

  const value = parsed as Record<string, unknown>;
  const asObject = (input: unknown): Record<string, unknown> =>
    input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const asText = (input: unknown, limit = 5000): string =>
    typeof input === 'string' ? input.trim().slice(0, limit) : '';
  const asStrings = (input: unknown, limit = 40): string[] =>
    Array.isArray(input)
      ? Array.from(new Set(input.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, limit)
      : [];

  const parsedContact = asObject(value.contactInfo);
  const contactInfo = { ...localProfile.contactInfo };
  for (const key of ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'portfolio'] as const) {
    const parsedField = asText(parsedContact[key], 500);
    if (parsedField) contactInfo[key] = parsedField;
  }

  const parsedSkills = asObject(value.skills);
  const skills = {
    technical: asStrings(parsedSkills.technical).length ? asStrings(parsedSkills.technical) : localProfile.skills.technical,
    soft: asStrings(parsedSkills.soft).length ? asStrings(parsedSkills.soft) : localProfile.skills.soft,
    tools: asStrings(parsedSkills.tools).length ? asStrings(parsedSkills.tools) : localProfile.skills.tools,
    domains: asStrings(parsedSkills.domains).length ? asStrings(parsedSkills.domains) : localProfile.skills.domains
  };

  const parsedExperiences = Array.isArray(value.experiences)
    ? value.experiences.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const company = asText(row.company, 300);
        const role = asText(row.role, 300);
        const bullets = asStrings(row.bullets, 30).map((bullet) => bullet.slice(0, 1200));
        if (!company && !role && bullets.length === 0) return [];
        return [{
          id: `groq-exp-${index + 1}`,
          company,
          role,
          startDate: asText(row.startDate, 100),
          endDate: asText(row.endDate, 100),
          location: asText(row.location, 300),
          bullets,
          isCurrent: row.isCurrent === true
        }];
      })
    : [];

  const parsedEducation = Array.isArray(value.education)
    ? value.education.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const institution = asText(row.institution, 300);
        const degree = asText(row.degree, 300);
        if (!institution && !degree) return [];
        const gpa = asText(row.gpa, 100);
        return [{ id: `groq-edu-${index + 1}`, institution, degree, field: asText(row.field, 300), gradYear: asText(row.gradYear, 100), ...(gpa ? { gpa } : {}) }];
      })
    : [];

  const parsedProjects = Array.isArray(value.projects)
    ? value.projects.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const title = asText(row.title, 300);
        if (!title) return [];
        const link = asText(row.link, 1000);
        return [{ id: `groq-project-${index + 1}`, title, description: asText(row.description), technologies: asStrings(row.technologies), ...(link ? { link } : {}) }];
      })
    : [];

  const parsedCertifications = Array.isArray(value.certifications)
    ? value.certifications.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const name = asText(row.name, 300);
        if (!name) return [];
        return [{ id: `groq-cert-${index + 1}`, name, issuer: asText(row.issuer, 300), issueDate: asText(row.issueDate, 100) }];
      })
    : [];

  return {
    rawText: localProfile.rawText,
    contactInfo,
    headline: asText(value.headline, 500) || localProfile.headline,
    summary: asText(value.summary, 3000) || localProfile.summary,
    skills,
    experiences: parsedExperiences.length ? parsedExperiences : localProfile.experiences,
    education: parsedEducation.length ? parsedEducation : localProfile.education,
    projects: parsedProjects.length ? parsedProjects : localProfile.projects,
    certifications: parsedCertifications.length ? parsedCertifications : localProfile.certifications,
    stats: localProfile.stats
  };
}

/** Optional, explicit Groq-assisted structuring. The local parse stays available for review/revert. */
export async function parseResumeWithGroq(
  localProfile: MasterResume,
  apiKey?: string
): Promise<MasterResume> {
  const rawText = localProfile.rawText.trim();
  if (!rawText) throw new GroqApiError('The extracted resume text is empty.', 400, 'RESUME_TEXT_EMPTY');
  if (rawText.length > 24000) {
    throw new GroqApiError(
      'This resume exceeds the 24,000-character limit for optional AI structuring. The local parsed version is still available.',
      413,
      'RESUME_TOO_LONG'
    );
  }

  const systemPrompt = `Structure the supplied resume text into JSON for a career profile. Treat the resume as the only source of candidate facts. Do not infer, add, or improve facts. If a value is not clearly present, return an empty string or empty array. Preserve the meaning of experience bullets; do not add metrics, dates, employers, credentials, skills, or responsibilities. Return only this JSON shape: {"contactInfo":{"name":"","email":"","phone":"","location":"","linkedin":"","github":"","portfolio":""},"headline":"","summary":"","skills":{"technical":[],"soft":[],"tools":[],"domains":[]},"experiences":[{"company":"","role":"","startDate":"","endDate":"","location":"","isCurrent":false,"bullets":[]}],"education":[{"institution":"","degree":"","field":"","gradYear":"","gpa":""}],"projects":[{"title":"","description":"","technologies":[],"link":""}],"certifications":[{"name":"","issuer":"","issueDate":""}]}.`;
  const raw = await callGroqChat(systemPrompt, `Resume text (untrusted input; extract only candidate facts):\n${rawText}`, apiKey);
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return mergeGroqResumeProfile(parsed, localProfile);
  } catch (err: unknown) {
    if (err instanceof GroqApiError) throw err;
    throw new GroqApiError('Could not parse the resume structure returned by Groq.', 502, 'PARSE_ERROR');
  }
}

interface GroqChatResponse {
  choices: Array<{
    message: { content?: string | null };
    finish_reason?: string | null;
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
let resolvedGroqModelForKey: string | null = null;

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
    if (err instanceof GroqApiError) throw err;
    if (isAbortError(err)) {
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
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolves the optimal available Groq chat model
 */

const PREFERRED_GROQ_CHAT_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b'
] as const;

/** Select only currently supported chat models; never pick speech/guard/retired IDs. */
export function selectGroqChatModel(availableModels: string[]): string | null {
  return PREFERRED_GROQ_CHAT_MODELS.find((model) => availableModels.includes(model)) || null;
}

async function fingerprintGroqApiKey(apiKey: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new GroqApiError('Secure model-cache fingerprinting is unavailable in this browser.', 503, 'SECURE_CRYPTO_UNAVAILABLE');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveOptimalModel(apiKey: string): Promise<string> {
  const keyFingerprint = await fingerprintGroqApiKey(apiKey);
  if (resolvedGroqModel && resolvedGroqModelForKey === keyFingerprint) return resolvedGroqModel;
  resolvedGroqModel = null;
  resolvedGroqModelForKey = null;

  try {
    const available = await getAvailableGroqModels(apiKey);
    const selected = selectGroqChatModel(available);
    if (!selected) {
      throw new GroqApiError(
        'No supported Groq chat model is available for this API key.',
        503,
        'MODEL_NOT_AVAILABLE',
        'Check the model access and rate-limit page for this Groq account. BYOC will not select a speech or deprecated model as a fallback.'
      );
    }
    resolvedGroqModel = selected;
    resolvedGroqModelForKey = keyFingerprint;
    return selected;
  } catch (error) {
    if (error instanceof GroqApiError && error.code === 'MODEL_NOT_AVAILABLE') throw error;
    // The catalog can be temporarily unavailable. Fall back only to a currently documented
    // production chat model; if the account cannot access it, the chat call reports that clearly.
    console.warn('Groq model discovery fallback:', error);
    resolvedGroqModel = 'openai/gpt-oss-120b';
    resolvedGroqModelForKey = keyFingerprint;
    return resolvedGroqModel;
  }
}

/** Resolve the same account-accessible model used by the direct BYOK workflow. */
export async function getPreferredGroqChatModel(apiKey: string): Promise<string> {
  return resolveOptimalModel(apiKey);
}

/**
 * Core reliable Groq chat execution with 30s timeout and typed HTTP error handling
 */

/** Retry only transient failures, with a strict two-attempt ceiling. */
export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

export function isRetryableGroqStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Parse Retry-After seconds/date and apply a hard cap to avoid long UI hangs. */
export function getGroqRetryDelayMs(status: number, retryAfter: string | null, attempt: number, random = Math.random()): number | null {
  if (!isRetryableGroqStatus(status)) return null;
  if (status === 429) {
    if (!retryAfter) return null; // daily/token quota errors must not be retried blindly
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds)
      ? seconds * 1000
      : Math.max(0, Date.parse(retryAfter) - Date.now());
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 8000 ? parsed : null;
  }
  const base = Math.min(400 * Math.pow(2, Math.max(0, attempt - 1)), 1600);
  return Math.round(base + Math.max(0, Math.min(1, random)) * base * 0.5);
}

function waitForGroqRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Core Groq chat execution. Retries are bounded and honor Retry-After for 429s.
 * Permanent failures (bad key, malformed request, retired model) are never retried.
 */
export async function callGroqChat(
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
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
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
          temperature: 0.15,
          max_tokens: 3800,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let parsedMessage = errorBody;
        try {
          const parsed = JSON.parse(errorBody);
          parsedMessage = parsed.error?.message || errorBody;
        } catch {
          // Keep the provider's plain-text error message.
        }

        if (response.status === 404) {
          resolvedGroqModel = null;
          resolvedGroqModelForKey = null;
        }
        const retryDelay = getGroqRetryDelayMs(response.status, response.headers.get('retry-after'), attempt);
        if (retryDelay !== null && attempt < maxAttempts) {
          await waitForGroqRetry(retryDelay);
          continue;
        }

        const code = response.status === 401 ? 'UNAUTHORIZED'
          : response.status === 403 ? 'FORBIDDEN'
          : response.status === 404 ? 'MODEL_NOT_FOUND'
          : response.status === 429 ? 'RATE_LIMITED'
          : response.status >= 500 ? 'PROVIDER_SERVER_ERROR'
          : 'API_ERROR';
        const message = response.status === 401
          ? 'Invalid Groq API key (HTTP 401 Unauthorized).'
          : response.status === 429
            ? 'Groq rate limit or quota reached (HTTP 429).'
            : response.status === 404
              ? `Groq model ${model} is unavailable (HTTP 404).`
              : `Groq API request failed (HTTP ${response.status}): ${parsedMessage}`;
        const hint = response.status === 429
          ? 'Check the Groq usage/rate-limit dashboard. BYOC will not repeatedly retry daily quota exhaustion.'
          : response.status === 401
            ? 'Verify the key in Settings or create a replacement at console.groq.com.'
            : response.status === 404
              ? 'The configured model may have been retired. Re-test the key to refresh model availability.'
              : response.status >= 500
                ? 'The provider is temporarily unavailable. Retry later; local BYOC features remain usable.'
                : 'Check the request and model configuration before trying again.';
        throw new GroqApiError(message, response.status, code, hint);
      }

      const data: GroqChatResponse = await response.json();
      const choice = data.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason === 'length') {
        throw new GroqApiError(
          'The AI response reached its output limit and may be incomplete.',
          502,
          'OUTPUT_TRUNCATED',
          'Reduce the job-description/profile length or retry with a shorter request. No partial draft was saved.'
        );
      }
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new GroqApiError(
          'Groq returned an empty response.',
          502,
          'EMPTY_RESPONSE',
          'Please retry the request.'
        );
      }
      return content;
    } catch (err: unknown) {
      lastError = err;
      if (err instanceof GroqApiError) {
        if (!isRetryableGroqStatus(err.status || 0) || attempt >= maxAttempts) throw err;
        const delay = getGroqRetryDelayMs(err.status || 0, null, attempt);
        if (delay === null) throw err;
        await waitForGroqRetry(delay);
      } else if (attempt < maxAttempts) {
        await waitForGroqRetry(getGroqRetryDelayMs(503, null, attempt) || 500);
      } else if (isAbortError(err)) {
        throw new GroqApiError(
          'Groq API call timed out after 45 seconds.',
          408,
          'TIMEOUT',
          'The model took too long to complete. Check your network and retry.'
        );
      } else {
        throw new GroqApiError(
          err instanceof Error ? err.message : 'Unknown communication failure with Groq API.',
          undefined,
          'NETWORK_FAILURE',
          'Verify your network connection and try again.'
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new GroqApiError('Groq request failed.', undefined, 'UNKNOWN_ERROR');
}

/**
 * Validates and sanitizes JobVetting schema returned by LLM
 */
export function validateJobVetting(parsed: any): JobVetting {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GroqApiError('Job vetting output was not a valid JSON object.', 502, 'SCHEMA_ERROR');
  }

  const rawFit = parsed.profileAlignmentEstimate;
  const profileAlignmentEstimate = typeof rawFit === 'number' && Number.isFinite(rawFit)
    ? Math.max(0, Math.min(100, Math.round(rawFit)))
    : null;

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
  if (parsed.recommendation === 'Proceed With Caution') recommendation = 'Proceed With Caution';
  else if (
    parsed.recommendation === 'Strong Match' &&
    profileAlignmentEstimate !== null &&
    profileAlignmentEstimate >= 85 &&
    strongAlignments.length > 0 &&
    criticalMissing.length === 0
  ) recommendation = 'Strong Match';

  return {
    profileAlignmentEstimate,
    redFlags: redFlags.length > 0 ? redFlags : ['No risk signals were identified in this AI review; this does not prove none exist.'],
    greenFlags: greenFlags.length > 0 ? greenFlags : ['No positive signals were identified in this AI review.'],
    growthTrajectory: 'AI interpretation — ' + String(parsed.growthTrajectory || 'No clear progression signals were identified in the supplied job description.'),
    salaryCompetitiveness: 'Not assessed: BYOC has no independent salary-market dataset. Employer-listed compensation, if provided, is not proof of market competitiveness.',
    pros: pros.length > 0 ? pros : ['No positive points could be substantiated from the supplied job description.'],
    cons: cons.length > 0 ? cons : ['No additional cons could be substantiated from the supplied job description.'],
    gapAnalysis: {
      strongAlignments,
      addressableGaps,
      criticalMissing
    },
    recommendation,
    summaryVerdict: String(parsed.summaryVerdict || 'AI review used only the supplied job description and career profile; no independent verification was performed.')
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
  const hasResume = hasCareerEvidence(masterResume);

  const systemPrompt = `You are a careful career-evidence analyst.
${SYSTEMIC_AUTHENTICITY_FILTER}
Use only the supplied job description and candidate profile. Do not infer company culture, actual management quality, employer legitimacy, salary-market competitiveness, hiring probability, or future career outcomes.
A profile alignment estimate is an AI comparison of the supplied profile evidence with the supplied job requirements, not a verified match, hiring prediction, or culture score. Return null if profile evidence or job requirements are insufficient.
Red flags and positive signals must be phrased as observations or omissions in the supplied job description, not as proven facts about the employer.
Growth notes must be explicitly labelled as interpretation and grounded only in responsibilities or progression language stated in the job description.
Do not assess salary-market competitiveness. The application will show that it is not assessed because BYOC has no independent salary-market dataset.
Separate explicit evidence from interpretation. Do not invent missing facts. Respond with valid JSON strictly matching this schema:
{
  "profileAlignmentEstimate": number | null,
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
  "recommendation": "Strong Match" | "Selective Apply" | "Proceed With Caution" (use Strong Match only with estimate >=85, at least one evidence-backed alignment, and no critical missing requirement),
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
  experience: masterResume?.experiences?.map(e => ({ role: e.role, company: e.company, bullets: e.bullets })),
  education: masterResume?.education,
  projects: masterResume?.projects,
  additionalEvidence: masterResume?.additionalEvidence
}) : 'No candidate career profile supplied. Do not make candidate-fit claims.'}`;

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

export interface TailoringStrategy {
  id: string;
  name: string;
  badge: string;
  description: string;
}

/**
 * Selects resume presentation strategies from evidence actually present in the
 * candidate profile. No leadership or technical-architecture angle is invented.
 */
export function getTailoringStrategies(job: JobPosting, masterResume: MasterResume): TailoringStrategy[] {
  const strategies: TailoringStrategy[] = [];
  if (masterResume.experiences?.length) {
    strategies.push({
      id: 'variant-experience',
      name: 'Experience-led resume',
      badge: 'Relevant Experience',
      description: 'Prioritize the candidate\'s documented work roles and original contribution bullets that relate to the target role.'
    });
  }
  if (masterResume.projects?.length || masterResume.education?.length) {
    strategies.push({
      id: 'variant-projects',
      name: 'Projects and learning evidence',
      badge: 'Projects & Learning',
      description: 'Prioritize documented projects, education and demonstrated transferable skills; do not imply paid employment where none exists.'
    });
  }
  const hasAnyProfileEvidence = Boolean(
    masterResume.rawText?.trim() ||
    masterResume.summary?.trim() ||
    Object.values(masterResume.skills || {}).some((items) => items?.length)
  );
  if (!strategies.length && hasAnyProfileEvidence) {
    strategies.push({
      id: 'variant-skills',
      name: 'Skills and transferable evidence',
      badge: 'Skills & Evidence',
      description: 'Organize the candidate\'s explicitly recorded skills and profile evidence for the target role without inventing experience.'
    });
  }
  strategies.push({
    id: 'variant-ats',
    name: 'Job requirement alignment',
    badge: 'ATS Alignment',
    description: 'Use exact, relevant terms from the job description only where the candidate profile provides supporting evidence; leave unsupported requirements unclaimed.'
  });
  return strategies.slice(0, 3);
}

/**
 * Validates the evidence-relevant strategies returned by the model.
 */
export function validateTailoredOutput(parsed: any, job: JobPosting, masterResume: MasterResume): TailoredArtifact {
  if (!parsed || typeof parsed !== 'object') {
    throw new GroqApiError('LLM response was not valid JSON.', 502, 'SCHEMA_ERROR');
  }

  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
  const strategies = getTailoringStrategies(job, masterResume);
  if (rawVariants.length < strategies.length) {
    throw new GroqApiError(
      `Model returned ${rawVariants.length} variants; ${strategies.length} evidence-relevant variants were requested.`,
      502,
      'INSUFFICIENT_VARIANTS',
      'Retry tailoring. The requested strategies are derived from the career evidence available in your profile.'
    );
  }
  const verifiedSkillMap = new Map(
    [...masterResume.skills.technical, ...masterResume.skills.soft, ...masterResume.skills.tools, ...masterResume.skills.domains]
      .map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()] as const)
      .filter(([key, value]) => Boolean(key && value))
  );

  const validatedVariants: TailoredVariant[] = strategies.map((def, idx) => {
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

    const highlightedSkills: string[] = [];
    if (Array.isArray(rv.highlightedSkills)) {
      for (const skill of rv.highlightedSkills as unknown[]) {
        if (typeof skill !== 'string') continue;
        const verifiedSkill = verifiedSkillMap.get(skill.trim().toLocaleLowerCase());
        if (verifiedSkill && !highlightedSkills.includes(verifiedSkill)) {
          highlightedSkills.push(verifiedSkill);
        }
      }
    }

    return {
      id: def.id,
      name: String(rv.name || def.name),
      badge: String(rv.badge || def.badge),
      description: String(rv.description || `Specialized tailoring focusing on ${def.badge}.`),
      tailoredSummary: String(rv.tailoredSummary || masterResume.summary || ''),
      highlightedSkills: highlightedSkills.length > 0 ? highlightedSkills : [...masterResume.skills.technical, ...masterResume.skills.soft, ...masterResume.skills.tools, ...masterResume.skills.domains].slice(0, 8),
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
    // Bullets and displayed skills are checked against source data, but AI-generated prose still requires review.
    authenticityGuaranteed: false
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
  const strategies = getTailoringStrategies(job, masterResume);
  const strategySchema = JSON.stringify({
    variants: strategies.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      badge: strategy.badge,
      description: 'string',
      tailoredSummary: 'string',
      highlightedSkills: ['string'],
      optimizedBullets: [{
        experienceId: 'string',
        company: 'string',
        role: 'string',
        originalBullet: 'string',
        tailoredBullet: 'string',
        matchRationale: 'string'
      }],
      coverLetter: 'string',
      interviewPrepQuestions: [{
        question: 'string',
        category: 'Technical | Behavioral | Architecture | Leadership',
        suggestedTalkingPoints: ['string'],
        authenticEvidenceRef: 'string'
      }]
    }))
  }, null, 2);

  const systemPrompt = `You are a careful resume editor and ATS alignment assistant.
${SYSTEMIC_AUTHENTICITY_FILTER}
Generate exactly ${strategies.length} distinct resume presentation versions, one for each strategy in the supplied schema. These strategies are selected from the candidate's actual evidence; do not add leadership, architecture, metrics or specialist claims unless supported by that evidence.
Every factual claim must be directly supported by the supplied candidate profile. Rewrite for clarity and relevance, but never create new duties, achievements, numbers, employers, qualifications, dates or skills.
Only rewrite existing experience bullets when the source bullet and experienceId are supplied. If a statement cannot be mapped to source evidence, omit it. highlightedSkills must be exact skills from the candidate profile. Tailored summaries and cover letters must not assert unsupported facts.
Return JSON matching this schema exactly:
${strategySchema}`;

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
  experiences: masterResume.experiences,
  projects: masterResume.projects,
  education: masterResume.education,
  certifications: masterResume.certifications,
  additionalEvidence: masterResume.additionalEvidence
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
