import type { MasterResume } from '../types';

export interface ResumeReadiness {
  completenessPercent: number;
  missingSections: string[];
}

/** Shared, de-duplicated signals from all structured candidate evidence sources. */
export function getCandidateDiscoverySignals(resume: MasterResume | null | undefined): string[] {
  if (!resume) return [];
  const values = [
    ...(resume.skills?.technical || []), ...(resume.skills?.soft || []),
    ...(resume.skills?.tools || []), ...(resume.skills?.domains || []),
    ...(resume.education || []).flatMap((item) => [item.degree, item.field, item.institution]),
    ...(resume.projects || []).flatMap((item) => [item.title, item.description, ...(item.technologies || [])]),
    ...(resume.certifications || []).flatMap((item) => [item.name, item.issuer]),
    ...(resume.additionalEvidence || [])
  ];
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (typeof value !== 'string' || !value.trim()) return false;
    const key = value.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((value) => value.trim());
}

/** Returns true when the profile contains any user-provided career evidence. */
export function hasCareerEvidence(resume: MasterResume | null | undefined): boolean {
  if (!resume) return false;
  const hasSkills = Object.values(resume.skills || {}).some((items) => Array.isArray(items) && items.some((item) => item.trim()));
  return Boolean(
    resume.rawText?.trim() ||
    resume.headline?.trim() ||
    resume.summary?.trim() ||
    hasSkills ||
    resume.experiences?.length ||
    resume.education?.length ||
    resume.projects?.length ||
    resume.certifications?.length ||
    resume.additionalEvidence?.length
  );
}

/**
 * Returns true only when evidence is present in fields actually supplied to
 * candidate-specific AI workflows. Unparsed rawText and contact/headline alone
 * must not be treated as enough evidence for generated claims.
 */
export function hasStructuredCareerEvidence(resume: MasterResume | null | undefined): boolean {
  if (!resume) return false;
  const hasSkills = Object.values(resume.skills || {}).some((items) =>
    Array.isArray(items) && items.some((item) => item.trim())
  );
  return Boolean(
    resume.summary?.trim() ||
    hasSkills ||
    resume.experiences?.length ||
    resume.education?.length ||
    resume.projects?.length ||
    resume.certifications?.length ||
    resume.additionalEvidence?.length
  );
}

/**
 * Readiness measures whether the profile has enough useful evidence to create
 * a resume. It does not measure employability and does not require paid work
 * history: education, projects and other user-provided evidence can establish
 * readiness for students, freshers and career changers.
 */
export function assessResumeReadiness(resume: MasterResume | null | undefined): ResumeReadiness {
  if (!resume) return { completenessPercent: 0, missingSections: ['Career profile'] };

  let score = 0;
  const missingSections: string[] = [];
  const hasName = Boolean(resume.contactInfo?.name?.trim());
  const hasReachableContact = Boolean(
    resume.contactInfo?.email?.trim() || resume.contactInfo?.phone?.trim()
  );
  if (hasName && hasReachableContact) score += 20;
  else {
    if (!hasName) missingSections.push('name');
    if (!hasReachableContact) missingSections.push('email or phone');
  }

  if ((resume.summary || '').trim().length > 30) score += 20;
  else missingSections.push('summary or career objective');

  const experiences = Array.isArray(resume.experiences) ? resume.experiences : [];
  const projects = Array.isArray(resume.projects) ? resume.projects : [];
  const education = Array.isArray(resume.education) ? resume.education : [];
  // Count structured, reviewable evidence here; raw text alone is retained for recovery
  // but must not make a profile look complete when the parser has not identified its contents.
  const hasCareerEvidence = experiences.length > 0 || projects.length > 0 || education.length > 0 ||
    (Array.isArray(resume.certifications) && resume.certifications.length > 0) ||
    (Array.isArray(resume.additionalEvidence) && resume.additionalEvidence.length > 0);
  if (hasCareerEvidence) score += 25;
  else missingSections.push('career history, projects, education, certifications or other profile evidence');

  const hasContributionEvidence = experiences.some((experience) =>
    Array.isArray(experience.bullets) && experience.bullets.some((bullet) => bullet.trim())
  ) || projects.some((project) =>
    Boolean(project.title?.trim() && project.description?.trim())
  ) || (Array.isArray(resume.additionalEvidence) && resume.additionalEvidence.some((item) =>
    item.trim().length > 40 && !/^(languages|professional memberships|memberships):/i.test(item.trim())
  ));
  if (hasContributionEvidence) score += 15;
  else if (hasCareerEvidence) missingSections.push('specific contribution or project details');

  const competencies = new Set([
    ...(resume.skills?.technical || []),
    ...(resume.skills?.soft || []),
    ...(resume.skills?.tools || []),
    ...(resume.skills?.domains || [])
  ].map((skill) => skill.trim().toLowerCase()).filter(Boolean));
  if (competencies.size >= 3) score += 20;
  else missingSections.push('three or more relevant skills or competencies');

  return { completenessPercent: Math.min(100, score), missingSections };
}
