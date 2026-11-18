import type { CareerApplicationFormState } from '../types';
import { callGroqChat } from './groqService';

interface TranslatedCareerText {
  targetRole: string;
  currentRole: string;
  professionalSummary: string;
  workExperience: Array<{ role: string; keyResponsibilities: string[] }>;
  education: Array<{ degree: string; field: string }>;
  projects: Array<{ title: string; description: string }>;
  certifications: Array<{ name: string }>;
}

const MAX_TRANSLATION_INPUT_CHARS = 18000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requireString(value: unknown): value is string {
  return typeof value === 'string';
}

function assertFaithfulText(source: string, translated: string): void {
  if (source.trim() && !translated.trim()) {
    throw new Error('Groq omitted text from the translation. Your original draft has not changed.');
  }
  const sourceNumbers = source.match(/\\d+(?:[.,]\\d+)?%?/g) || [];
  const translatedNumbers = translated.match(/\\d+(?:[.,]\\d+)?%?/g) || [];
  if (sourceNumbers.join('|') !== translatedNumbers.join('|')) {
    throw new Error('Groq changed a number or metric during translation. Your original draft has not changed.');
  }
}

function parseTranslatedCareerText(raw: string, draft: CareerApplicationFormState): TranslatedCareerText {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
  }

  const workExperience = Array.isArray(parsed.workExperience) ? parsed.workExperience : null;
  const education = Array.isArray(parsed.education) ? parsed.education : null;
  const projects = Array.isArray(parsed.projects) ? parsed.projects : null;
  const certifications = Array.isArray(parsed.certifications) ? parsed.certifications : null;

  if (
    !requireString(parsed.targetRole) ||
    !requireString(parsed.currentRole) ||
    !requireString(parsed.professionalSummary) ||
    !workExperience ||
    !education ||
    !projects ||
    !certifications ||
    workExperience.length !== draft.workExperience.length ||
    education.length !== draft.education.length ||
    projects.length !== (draft.projects || []).length ||
    certifications.length !== (draft.certifications || []).length
  ) {
    throw new Error('Groq returned an incomplete translation response. Your original draft has not changed.');
  }

  assertFaithfulText(draft.targetRole || '', parsed.targetRole);
  assertFaithfulText(draft.currentRole || '', parsed.currentRole);
  assertFaithfulText(draft.professionalSummary, parsed.professionalSummary);

  const translatedWork = workExperience.map((item, index) => {
    if (!isRecord(item) || !requireString(item.role) || !Array.isArray(item.keyResponsibilities)) {
      throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
    }
    const originalBullets = draft.workExperience[index].keyResponsibilities;
    if (
      item.keyResponsibilities.length !== originalBullets.length ||
      !item.keyResponsibilities.every(requireString)
    ) {
      throw new Error('Groq returned an incomplete translation response. Your original draft has not changed.');
    }
    assertFaithfulText(draft.workExperience[index].role, item.role);
    item.keyResponsibilities.forEach((bullet, bulletIndex) => {
      assertFaithfulText(originalBullets[bulletIndex], bullet);
    });
    return { role: item.role, keyResponsibilities: item.keyResponsibilities as string[] };
  });

  const translatedEducation = education.map((item) => {
    if (!isRecord(item) || !requireString(item.degree) || !requireString(item.field)) {
      throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
    }
    const index = education.indexOf(item);
    assertFaithfulText(draft.education[index].degree, item.degree);
    assertFaithfulText(draft.education[index].field || '', item.field);
    return { degree: item.degree, field: item.field };
  });

  const translatedProjects = projects.map((item) => {
    if (!isRecord(item) || !requireString(item.title) || !requireString(item.description)) {
      throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
    }
    const index = projects.indexOf(item);
    const original = (draft.projects || [])[index];
    assertFaithfulText(original.title, item.title);
    assertFaithfulText(original.description, item.description);
    return { title: item.title, description: item.description };
  });

  const translatedCertifications = certifications.map((item) => {
    if (!isRecord(item) || !requireString(item.name)) {
      throw new Error('Groq returned an invalid translation response. Your original draft has not changed.');
    }
    const index = certifications.indexOf(item);
    assertFaithfulText((draft.certifications || [])[index].name, item.name);
    return { name: item.name };
  });

  return {
    targetRole: parsed.targetRole,
    currentRole: parsed.currentRole,
    professionalSummary: parsed.professionalSummary,
    workExperience: translatedWork,
    education: translatedEducation,
    projects: translatedProjects,
    certifications: translatedCertifications
  };
}

/**
 * Translates only user-authored resume text fields. Contact details, company and
 * institution names, dates, technical skills, technologies, and issuers stay local
 * and unchanged. The caller must present this result for review before applying it.
 */
export async function translateCareerDraftToEnglish(
  draft: CareerApplicationFormState,
  sourceLanguage: string,
  apiKey: string
): Promise<CareerApplicationFormState> {
  if (!apiKey.trim()) {
    throw new Error('A Groq API key is required for optional translation.');
  }
  if (!sourceLanguage.trim() || sourceLanguage.toLowerCase() === 'english') {
    throw new Error('Choose the source language before requesting translation.');
  }

  const payload = {
    targetRole: draft.targetRole || '',
    currentRole: draft.currentRole || '',
    professionalSummary: draft.professionalSummary,
    workExperience: draft.workExperience.map((item) => ({
      role: item.role,
      keyResponsibilities: item.keyResponsibilities
    })),
    education: draft.education.map((item) => ({
      degree: item.degree,
      field: item.field || ''
    })),
    projects: (draft.projects || []).map((item) => ({
      title: item.title,
      description: item.description
    })),
    certifications: (draft.certifications || []).map((item) => ({
      name: item.name
    }))
  };

  const userPrompt = [
    `Translate the following resume text from ${sourceLanguage} into clear, professional English.`,
    'Translate only the supplied text. Do not add, remove, infer, embellish, or invent facts, achievements, metrics, responsibilities, skills, or qualifications.',
    'Preserve the JSON structure and array lengths exactly. Preserve all numbers and factual meaning.',
    'Company names, institution names, contact details, dates, technical skills, technologies, certification issuers, and links are deliberately excluded and must not be added.',
    'Return one valid JSON object with exactly these keys: targetRole, currentRole, professionalSummary, workExperience, education, projects, certifications.',
    JSON.stringify(payload)
  ].join('\n\n');

  if (userPrompt.length > MAX_TRANSLATION_INPUT_CHARS) {
    throw new Error('This draft is too long for one safe translation request. Shorten it or translate a smaller draft.');
  }

  const raw = await callGroqChat(
    'You are a careful resume translator. Preserve facts exactly. Return valid JSON only.',
    userPrompt,
    apiKey
  );
  const translated = parseTranslatedCareerText(raw, draft);
  const originalLanguageSnapshot =
    draft.originalLanguageSnapshot || JSON.stringify({ sourceLanguage, draft });

  return {
    ...draft,
    targetRole: translated.targetRole,
    currentRole: translated.currentRole,
    professionalSummary: translated.professionalSummary,
    workExperience: draft.workExperience.map((item, index) => ({
      ...item,
      role: translated.workExperience[index].role,
      keyResponsibilities: translated.workExperience[index].keyResponsibilities
    })),
    education: draft.education.map((item, index) => ({
      ...item,
      degree: translated.education[index].degree,
      field: translated.education[index].field
    })),
    projects: (draft.projects || []).map((item, index) => ({
      ...item,
      title: translated.projects[index].title,
      description: translated.projects[index].description
    })),
    certifications: (draft.certifications || []).map((item, index) => ({
      ...item,
      name: translated.certifications[index].name
    })),
    sourceLanguage: draft.sourceLanguage || sourceLanguage,
    sourceLanguageOther: draft.sourceLanguageOther || '',
    translatedToEnglish: true,
    originalLanguageSnapshot
  };
}
