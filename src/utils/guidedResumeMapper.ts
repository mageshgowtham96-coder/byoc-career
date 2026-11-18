import type { CareerApplicationFormState, MasterResume } from '../types';

function parseDuration(duration: string): { startDate: string; endDate: string } {
  const match = duration.match(/^(.+?)\s*(?:–|—|-|\bto\b)\s*(.+)$/i);
  if (!match) return { startDate: '', endDate: '' };
  return { startDate: match[1].trim(), endDate: match[2].trim() };
}

/**
 * Converts only the facts the user entered into the existing MasterResume model.
 * It intentionally does not generate or infer achievements, metrics, or qualifications.
 */
export function buildMasterResumeFromCareerDraft(
  draft: CareerApplicationFormState,
  now: Date = new Date()
): MasterResume {
  const experiences = draft.workExperience
    .filter((experience) => Boolean(experience.role.trim() || experience.company.trim() || experience.keyResponsibilities.some((bullet) => bullet.trim())))
    .map((experience) => {
    const parsedDuration = parseDuration(experience.duration || '');
    const startDate = experience.startDate?.trim() || parsedDuration.startDate;
    const endDate = experience.endDate?.trim() || parsedDuration.endDate;
    const isCurrent =
      Boolean(experience.isCurrent) || /^(present|current|now)$/i.test(endDate.trim());

    return {
      id: experience.id,
      company: experience.company.trim(),
      role: experience.role.trim(),
      startDate,
      endDate: isCurrent && !endDate ? 'Present' : endDate,
      location: experience.location?.trim() || '',
      bullets: experience.keyResponsibilities.map((bullet) => bullet.trim()).filter(Boolean),
      ...(isCurrent ? { isCurrent: true } : {})
    };
  });

  const education = draft.education
    .filter((item) => Boolean(item.degree.trim() || item.institution.trim() || item.field?.trim() || item.year.trim()))
    .map((item) => ({
    id: item.id,
    institution: item.institution.trim(),
    degree: item.degree.trim(),
    field: item.field?.trim() || '',
    gradYear: item.year.trim(),
    ...(item.gpa?.trim() ? { gpa: item.gpa.trim() } : {})
  }));

  const projects = (draft.projects || [])
    .filter((project) => Boolean(project.title.trim() || project.description.trim()))
    .map((project) => ({
    ...project,
    technologies: [...project.technologies]
  }));
  const certifications = (draft.certifications || [])
    .filter((certification) => Boolean(certification.name.trim() || certification.issuer.trim()))
    .map((certification) => ({ ...certification }));

  const headline =
    draft.targetRole?.trim() ||
    draft.currentRole?.trim() ||
    experiences.find((experience) => experience.role)?.role ||
    '';

  const rawText = [
    draft.personalDetails.fullName,
    draft.personalDetails.email,
    draft.personalDetails.phone,
    draft.personalDetails.location,
    draft.personalDetails.linkedin,
    draft.personalDetails.github,
    draft.personalDetails.portfolio,
    draft.currentRole || '',
    headline,
    draft.professionalSummary,
    ...experiences.flatMap((experience) => [
      experience.role,
      experience.company,
      experience.startDate,
      experience.endDate,
      experience.location,
      ...experience.bullets
    ]),
    ...draft.skills,
    ...education.flatMap((item) => [item.degree, item.field, item.institution, item.gradYear, item.gpa || '']),
    ...projects.flatMap((project) => [project.title, project.description, ...project.technologies]),
    ...certifications.flatMap((certification) => [certification.name, certification.issuer, certification.issueDate])
  ].map((value) => String(value || '').trim()).filter(Boolean).join('\n');

  const wordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;

  return {
    rawText,
    contactInfo: {
      name: draft.personalDetails.fullName.trim(),
      email: draft.personalDetails.email.trim(),
      phone: draft.personalDetails.phone.trim(),
      location: draft.personalDetails.location.trim(),
      linkedin: draft.personalDetails.linkedin?.trim() || '',
      github: draft.personalDetails.github?.trim() || '',
      portfolio: draft.personalDetails.portfolio?.trim() || ''
    },
    headline,
    summary: draft.professionalSummary.trim(),
    skills: {
      technical: [...draft.skills],
      soft: [],
      tools: [],
      domains: []
    },
    experiences,
    education,
    projects,
    certifications,
    currentRole: draft.currentRole || '',
    sourceLanguage: draft.sourceLanguage || 'English',
    sourceLanguageOther: draft.sourceLanguageOther || '',
    roleFamily: draft.roleFamily || 'general',
    experienceLevel: draft.experienceLevel || 'Unspecified',
    translatedToEnglish: Boolean(draft.translatedToEnglish),
    originalLanguageSnapshot: draft.originalLanguageSnapshot || '',
    stats: {
      wordCount,
      pageCount: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 450)) : 0,
      charCount: rawText.length,
      lastParsedDate: now.toISOString(),
      sourceFileName: 'Guided Master Resume'
    }
  };
}


/** Converts an existing profile into an editable guided-builder draft without losing its facts. */
export function createCareerDraftFromMasterResume(profile: MasterResume): CareerApplicationFormState {
  const contactInfo = profile.contactInfo || { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' };
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  const educationItems = Array.isArray(profile.education) ? profile.education : [];
  const technicalSkills = Array.isArray(profile.skills?.technical) ? profile.skills.technical : [];
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const certifications = Array.isArray(profile.certifications) ? profile.certifications : [];
  return {
    personalDetails: {
      fullName: contactInfo.name || '',
      email: contactInfo.email || '',
      phone: contactInfo.phone || '',
      location: contactInfo.location || '',
      linkedin: contactInfo.linkedin || '',
      github: contactInfo.github || '',
      portfolio: contactInfo.portfolio || ''
    },
    targetRole: profile.headline,
    currentRole: profile.currentRole || '',
    roleFamily: 'general',
    experienceLevel: 'Unspecified',
    sourceLanguage: profile.sourceLanguage || 'English',
    sourceLanguageOther: profile.sourceLanguageOther || '',
    roleFamily: profile.roleFamily || 'general',
    experienceLevel: profile.experienceLevel || 'Unspecified',
    translatedToEnglish: Boolean(profile.translatedToEnglish),
    originalLanguageSnapshot: profile.originalLanguageSnapshot || '',
    professionalSummary: profile.summary,
    workExperience: experiences.map((item) => ({
      id: item.id,
      company: item.company,
      role: item.role,
      duration: [item.startDate, item.endDate].filter(Boolean).join(' – '),
      startDate: item.startDate,
      endDate: item.endDate,
      location: item.location,
      isCurrent: Boolean(item.isCurrent),
      keyResponsibilities: [...item.bullets]
    })),
    skills: [...technicalSkills],
    education: educationItems.map((item) => ({
      id: item.id,
      degree: item.degree,
      institution: item.institution,
      year: item.gradYear,
      field: item.field,
      gpa: item.gpa || ''
    })),
    projects: projects.map((item) => ({ ...item, technologies: [...(item.technologies || [])] })),
    certifications: certifications.map((item) => ({ ...item })),
    isAutoFilled: false,
    lastExtractedTimestamp: null,
    rawSourceText: profile.rawText
  };
}
