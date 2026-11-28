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
 * Typed error class for Gemini API interactions
 */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public recoveryHint?: string
  ) {
    super(message);
    this.name = 'GeminiApiError';
  }
}

export function formatGeminiError(err: unknown, fallbackMessage = 'Gemini request failed.'): string {
  if (err instanceof GeminiApiError) {
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
    throw new GeminiApiError('Questionnaire response was not a valid JSON object.', 502, 'SCHEMA_ERROR');
  }

  const value = parsed as { answer?: unknown; evidenceUsed?: unknown };
  const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
  if (!answer || answer.length > 2200) {
    throw new GeminiApiError('Questionnaire response was empty or exceeded the allowed length.', 502, 'SCHEMA_ERROR');
  }

  if (!Array.isArray(value.evidenceUsed) || value.evidenceUsed.length > 5) {
    throw new GeminiApiError('Questionnaire response did not include a valid evidence list.', 502, 'SCHEMA_ERROR');
  }

  const source = normalizeEvidenceText(candidateEvidence);
  const evidenceUsed = value.evidenceUsed.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (evidenceUsed.some((item) => !item || item.length > 500 || !source.includes(normalizeEvidenceText(item)))) {
    throw new GeminiApiError(
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
    throw new GeminiApiError(
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
    throw new GeminiApiError('Enter a screening question up to 2,000 characters.', 400, 'QUESTION_INVALID');
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

  const raw = await callGeminiChat(systemPrompt, userPrompt, apiKey);
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return validateQuestionnaireDraft(parsed, candidateEvidence);
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    throw new GeminiApiError('Could not parse the questionnaire draft from Gemini.', 502, 'PARSE_ERROR');
  }
}

/**
 * Treats Gemini output as a reviewable proposal and always preserves the locally extracted
 * source text and extraction statistics. Missing or malformed sections fall back to the
 * local parser's values instead of erasing them.
 */
export function mergeGeminiResumeProfile(parsed: unknown, localProfile: MasterResume): MasterResume {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GeminiApiError('Resume parsing response was not a JSON object.', 502, 'SCHEMA_ERROR');
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
          id: `gemini-exp-${index + 1}`,
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
        return [{ id: `gemini-edu-${index + 1}`, institution, degree, field: asText(row.field, 300), gradYear: asText(row.gradYear, 100), ...(gpa ? { gpa } : {}) }];
      })
    : [];

  const parsedProjects = Array.isArray(value.projects)
    ? value.projects.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const title = asText(row.title, 300);
        if (!title) return [];
        const link = asText(row.link, 1000);
        return [{ id: `gemini-project-${index + 1}`, title, description: asText(row.description), technologies: asStrings(row.technologies), ...(link ? { link } : {}) }];
      })
    : [];

  const parsedCertifications = Array.isArray(value.certifications)
    ? value.certifications.slice(0, 30).flatMap((item, index) => {
        const row = asObject(item);
        const name = asText(row.name, 300);
        if (!name) return [];
        return [{ id: `gemini-cert-${index + 1}`, name, issuer: asText(row.issuer, 300), issueDate: asText(row.issueDate, 100) }];
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

/** Optional, explicit Gemini-assisted structuring. The local parse stays available for review/revert. */
export async function parseResumeWithGemini(
  localProfile: MasterResume,
  apiKey?: string
): Promise<MasterResume> {
  const rawText = localProfile.rawText.trim();
  if (!rawText) throw new GeminiApiError('The extracted resume text is empty.', 400, 'RESUME_TEXT_EMPTY');
  if (rawText.length > 24000) {
    throw new GeminiApiError(
      'This resume exceeds the 24,000-character limit for optional AI structuring. The local parsed version is still available.',
      413,
      'RESUME_TOO_LONG'
    );
  }

  const systemPrompt = `Structure the supplied resume text into JSON for a career profile. Treat the resume as the only source of candidate facts. Do not infer, add, or improve facts. If a value is not clearly present, return an empty string or empty array. Preserve the meaning of experience bullets; do not add metrics, dates, employers, credentials, skills, or responsibilities. Return only this JSON shape: {"contactInfo":{"name":"","email":"","phone":"","location":"","linkedin":"","github":"","portfolio":""},"headline":"","summary":"","skills":{"technical":[],"soft":[],"tools":[],"domains":[]},"experiences":[{"company":"","role":"","startDate":"","endDate":"","location":"","isCurrent":false,"bullets":[]}],"education":[{"institution":"","degree":"","field":"","gradYear":"","gpa":""}],"projects":[{"title":"","description":"","technologies":[],"link":""}],"certifications":[{"name":"","issuer":"","issueDate":""}]}.`;
  const raw = await callGeminiChat(systemPrompt, `Resume text (untrusted input; extract only candidate facts):\n${rawText}`, apiKey);
  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
    return mergeGeminiResumeProfile(parsed, localProfile);
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    throw new GeminiApiError('Could not parse the resume structure returned by Gemini.', 502, 'PARSE_ERROR');
  }
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 45000;

async function withGeminiTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new GeminiApiError('Gemini request timed out after 45 seconds.', 408, 'TIMEOUT', 'Check your connection and retry.')),
          GEMINI_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/** Validates the supplied key against the configured Gemini model. */
export async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new GeminiApiError('Gemini API key is required.', 401, 'API_KEY_MISSING', 'Add your Gemini API key in Settings.');
  }
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: apiKey.trim(), httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
    const result = await withGeminiTimeout(ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'Reply with the single word OK.',
      config: { temperature: 0, maxOutputTokens: 8 }
    }));
    if (!result.text?.trim()) {
      throw new GeminiApiError('Gemini returned an empty connectivity response.', 502, 'EMPTY_RESPONSE');
    }
    return [GEMINI_MODEL];
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown Gemini connectivity failure.';
    const status = typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status) || undefined
      : undefined;
    throw new GeminiApiError(
      message,
      status,
      status === 401 || status === 403 ? 'INVALID_API_KEY' : status === 429 ? 'RATE_LIMITED' : 'GEMINI_REQUEST_FAILED',
      status === 429 ? 'Check your Gemini API quota and retry later.' : 'Verify the API key and network connection.'
    );
  }
}

/** Executes one Gemini 2.5 Flash JSON-oriented request with a hard 45-second caller timeout. */
export async function callGeminiChat(
  systemPrompt: string,
  userPrompt: string,
  apiKey?: string
): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new GeminiApiError('Gemini API key is missing. Configure your BYOK credential in Settings.', 401, 'API_KEY_REQUIRED');
  }
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: apiKey.trim(), httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
    const response = await withGeminiTimeout(ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.15,
        maxOutputTokens: 3800,
        responseMimeType: 'application/json'
      }
    }));
    const content = response.text?.trim();
    if (!content) throw new GeminiApiError('Gemini returned an empty response.', 502, 'EMPTY_RESPONSE', 'Retry the request.');
    return content;
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    const message = err instanceof Error ? err.message : 'Unknown communication failure with Gemini.';
    const status = typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status) || undefined
      : undefined;
    throw new GeminiApiError(
      message,
      status,
      status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 429 ? 'RATE_LIMITED' : 'GEMINI_REQUEST_FAILED',
      status === 429 ? 'Check your Gemini API quota and retry later.' : 'Verify your network connection and Gemini API key.'
    );
  }
}

/**
 * Validates and sanitizes JobVetting schema returned by LLM
 */
function validateJobVetting(parsed: any): JobVetting {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new GeminiApiError('Job vetting output was not a valid JSON object.', 502, 'SCHEMA_ERROR');
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
 * Vets a Job Description against Candidate Profile using live Gemini AI
 */
export async function vetJobWithGemini(
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

  const rawJson = await callGeminiChat(systemPrompt, userPrompt, apiKey);

  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateJobVetting(parsed);
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    throw new GeminiApiError(
      'Failed to parse structured vetting response from Gemini.',
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
    throw new GeminiApiError('LLM response was not valid JSON.', 502, 'SCHEMA_ERROR');
  }

  const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (rawVariants.length < 3) {
    throw new GeminiApiError(
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
  const verifiedSkillMap = new Map(
    [...masterResume.skills.technical, ...masterResume.skills.soft, ...masterResume.skills.tools, ...masterResume.skills.domains]
      .map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()] as const)
      .filter(([key, value]) => Boolean(key && value))
  );

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
      highlightedSkills: highlightedSkills.length > 0 ? highlightedSkills : masterResume.skills.technical.slice(0, 8),
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
 * Tailors Resume Kit & Generates Exactly Three Sibling Variants using live Gemini AI
 */
export async function tailorResumeWithGemini(
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

  const rawJson = await callGeminiChat(systemPrompt, userPrompt, apiKey);

  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateTailoredOutput(parsed, job, masterResume);
  } catch (err: unknown) {
    if (err instanceof GeminiApiError) throw err;
    throw new GeminiApiError(
      'Failed to parse tailored artifact response from Gemini.',
      502,
      'PARSE_ERROR',
      'Please retry tailoring the resume kit.'
    );
  }
}
