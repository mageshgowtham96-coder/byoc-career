import type { MasterResume } from '../types';

export interface ResumeReadiness {
  completenessPercent: number;
  missingSections: string[];
}

/** Scores only evidence present in the user's profile; it never invents missing career facts. */
export function assessResumeReadiness(resume: MasterResume | null | undefined): ResumeReadiness {
  if (!resume) return { completenessPercent: 0, missingSections: ['Master Resume'] };

  let score = 0;
  const missingSections: string[] = [];
  const hasNameAndEmail = Boolean(resume.contactInfo?.name?.trim() && resume.contactInfo?.email?.includes('@'));
  if (hasNameAndEmail) score += 20;
  else missingSections.push('name and valid email');

  if ((resume.summary || '').trim().length > 30) score += 20;
  else missingSections.push('professional summary');

  const experiences = Array.isArray(resume.experiences) ? resume.experiences : [];
  if (experiences.length > 0) score += 25;
  else missingSections.push('work experience');

  if (experiences.some((experience) => Array.isArray(experience.bullets) && experience.bullets.filter((bullet) => bullet.trim()).length >= 2)) {
    score += 15;
  } else if (experiences.length > 0) {
    missingSections.push('at least two specific contribution bullets for one role');
  }

  const competencies = new Set([
    ...(resume.skills?.technical || []),
    ...(resume.skills?.soft || []),
    ...(resume.skills?.tools || []),
    ...(resume.skills?.domains || [])
  ].map((skill) => skill.trim().toLowerCase()).filter(Boolean));
  if (competencies.size >= 3) score += 20;
  else missingSections.push('three or more core competencies');

  return { completenessPercent: Math.min(100, score), missingSections };
}
