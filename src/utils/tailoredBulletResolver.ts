import type {
  CertificationItem,
  EducationItem,
  ExperienceItem,
  MasterResume,
  ProjectItem,
  TailoredArtifact,
  TailoredBullet
} from '../types';

export interface VerifiedBulletMatchResult {
  matched: boolean;
  experienceIndex: number | null;
  bulletIndex: number | null;
  bullet: TailoredBullet;
}

export interface ResolvedExperienceBullet {
  text: string;
  originalBullet: string;
  isTailored: boolean;
  matchRationale?: string;
}

export interface ResolvedExperienceEntry {
  experience: ExperienceItem;
  bullets: ResolvedExperienceBullet[];
}

export interface ResolvedTailoredResume {
  contactInfo: MasterResume['contactInfo'];
  contactLinks: string[];
  headline: string;
  summary: string;
  skills: string[];
  experiences: ResolvedExperienceEntry[];
  education: EducationItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  additionalEvidence: string[];
  coverLetter: string;
  verifiedReplacements: TailoredBullet[];
  unmappedBullets: TailoredBullet[];
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Verifies a single AI-returned bullet against MasterResume without any
 * index-based or first-experience fallbacks. Accepts a replacement ONLY when
 * both the experience identity and exact originalBullet text are verified.
 */
export function verifyTailoredBulletAgainstMaster(
  rawBullet: unknown,
  masterResume: MasterResume | null | undefined,
  defaultRationale = ''
): VerifiedBulletMatchResult {
  const b = (rawBullet && typeof rawBullet === 'object' ? rawBullet : {}) as Record<string, unknown>;

  const rawExpId = asTrimmedString(b.experienceId);
  const rawCompany = asTrimmedString(b.company);
  const rawRole = asTrimmedString(b.role);
  const rawOriginal = asTrimmedString(b.originalBullet);
  const rawTailored = asTrimmedString(b.tailoredBullet);
  const rawRationale = asTrimmedString(b.matchRationale);

  const buildUnmapped = (reason: string): VerifiedBulletMatchResult => ({
    matched: false,
    experienceIndex: null,
    bulletIndex: null,
    bullet: {
      experienceId: rawExpId,
      company: rawCompany,
      role: rawRole,
      originalBullet: rawOriginal,
      tailoredBullet: rawTailored,
      matchRationale: rawRationale,
      verified: false,
      unmappedReason: reason
    }
  });

  if (b.verified === false) {
    return buildUnmapped(asTrimmedString(b.unmappedReason) || 'Flagged as unmapped against master resume.');
  }

  if (!masterResume || !Array.isArray(masterResume.experiences) || masterResume.experiences.length === 0) {
    return buildUnmapped('Master resume contains no verified experience entries.');
  }

  if (!rawOriginal) {
    return buildUnmapped('Missing source originalBullet text.');
  }

  if (!rawTailored) {
    return buildUnmapped('Missing tailoredBullet text.');
  }

  if (!rawExpId && !rawCompany && !rawRole) {
    return buildUnmapped('Missing experience identifier (experienceId, company, or role).');
  }

  const candidates: Array<{ experienceIndex: number; bulletIndex: number; exp: ExperienceItem }> = [];

  masterResume.experiences.forEach((exp, expIdx) => {
    const expId = (exp.id || '').trim();
    const expCompany = (exp.company || '').trim();
    const expRole = (exp.role || '').trim();

    // Require experienceId or company when experience has a company, so role-only
    // guesses cannot misattribute across named employers.
    if (!rawExpId && !rawCompany && expCompany.length > 0) {
      return;
    }

    if (rawExpId && expId !== rawExpId) {
      return;
    }
    if (rawCompany && expCompany.toLowerCase() !== rawCompany.toLowerCase()) {
      return;
    }
    if (rawRole && expRole.toLowerCase() !== rawRole.toLowerCase()) {
      return;
    }

    const bulletIndex = Array.isArray(exp.bullets)
      ? exp.bullets.findIndex((src) => typeof src === 'string' && src.trim() === rawOriginal)
      : -1;

    if (bulletIndex !== -1) {
      candidates.push({ experienceIndex: expIdx, bulletIndex, exp });
    }
  });

  if (candidates.length === 0) {
    return buildUnmapped(
      'Could not verify both the target experience and exact originalBullet text in the master resume.'
    );
  }

  if (candidates.length > 1) {
    return buildUnmapped(
      'Ambiguous experience match: multiple master resume experiences matched with identical bullet text.'
    );
  }

  const winner = candidates[0];
  return {
    matched: true,
    experienceIndex: winner.experienceIndex,
    bulletIndex: winner.bulletIndex,
    bullet: {
      experienceId: winner.exp.id,
      company: winner.exp.company,
      role: winner.exp.role,
      originalBullet: winner.exp.bullets[winner.bulletIndex],
      tailoredBullet: rawTailored,
      matchRationale: rawRationale || defaultRationale,
      verified: true
    }
  };
}

/**
 * Partitions raw or stored bullets into verified replacements vs unmapped entries
 * using the exact same verification rule.
 */
export function partitionTailoredBullets(
  rawBullets: unknown,
  masterResume: MasterResume | null | undefined,
  defaultRationale = ''
): { allValidated: TailoredBullet[]; verified: TailoredBullet[]; unmapped: TailoredBullet[] } {
  if (!Array.isArray(rawBullets)) {
    return { allValidated: [], verified: [], unmapped: [] };
  }

  const allValidated: TailoredBullet[] = [];
  const verified: TailoredBullet[] = [];
  const unmapped: TailoredBullet[] = [];
  const seenTargets = new Set<string>();

  for (const item of rawBullets) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const hasAnyContent =
      asTrimmedString(obj.originalBullet) ||
      asTrimmedString(obj.tailoredBullet) ||
      asTrimmedString(obj.company) ||
      asTrimmedString(obj.role) ||
      asTrimmedString(obj.experienceId);
    if (!hasAnyContent) continue;

    const check = verifyTailoredBulletAgainstMaster(obj, masterResume, defaultRationale);
    if (check.matched && check.experienceIndex !== null && check.bulletIndex !== null) {
      const targetKey = `${check.experienceIndex}:${check.bulletIndex}`;
      if (seenTargets.has(targetKey)) {
        const duplicateUnmapped: TailoredBullet = {
          ...check.bullet,
          verified: false,
          unmappedReason: 'Duplicate replacement targeting the same original bullet; earlier verified bullet kept.'
        };
        allValidated.push(duplicateUnmapped);
        unmapped.push(duplicateUnmapped);
      } else {
        seenTargets.add(targetKey);
        allValidated.push(check.bullet);
        verified.push(check.bullet);
      }
    } else {
      allValidated.push(check.bullet);
      unmapped.push(check.bullet);
    }
  }

  return { allValidated, verified, unmapped };
}

/**
 * Shared resolution for BOTH the UI preview and TXT/PDF/DOCX exporters.
 * Retains every original experience entry, unmatched original bullet,
 * education, projects, certifications, and contact links intact.
 */
export function resolveTailoredResumeForExportAndPreview(
  artifact: TailoredArtifact,
  masterResume: MasterResume
): ResolvedTailoredResume {
  const { verified, unmapped } = partitionTailoredBullets(artifact.optimizedBullets, masterResume);

  const replacementMap = new Map<string, TailoredBullet>();
  for (const bullet of verified) {
    const check = verifyTailoredBulletAgainstMaster(bullet, masterResume);
    if (check.matched && check.experienceIndex !== null && check.bulletIndex !== null) {
      const key = `${check.experienceIndex}:${check.bulletIndex}`;
      if (!replacementMap.has(key)) {
        replacementMap.set(key, check.bullet);
      }
    }
  }

  const experiences: ResolvedExperienceEntry[] = (masterResume.experiences || []).map((exp, expIdx) => {
    const origBullets = Array.isArray(exp.bullets) ? exp.bullets : [];
    const resolvedBullets: ResolvedExperienceBullet[] = origBullets.map((origText, bIdx) => {
      const match = replacementMap.get(`${expIdx}:${bIdx}`);
      if (match) {
        return {
          text: match.tailoredBullet,
          originalBullet: origText,
          isTailored: true,
          matchRationale: match.matchRationale
        };
      }
      return {
        text: origText,
        originalBullet: origText,
        isTailored: false
      };
    });

    return {
      experience: exp,
      bullets: resolvedBullets
    };
  });

  // Preserve highlighted skills plus all unique master technical/tools/domains skills
  const skillSet = new Map<string, string>();
  const addSkill = (s: string) => {
    const clean = (s || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!skillSet.has(key)) {
      skillSet.set(key, clean);
    }
  };

  (artifact.highlightedSkills || []).forEach(addSkill);
  (masterResume.skills?.technical || []).forEach(addSkill);
  (masterResume.skills?.tools || []).forEach(addSkill);
  (masterResume.skills?.domains || []).forEach(addSkill);

  const contactLinks = [
    masterResume.contactInfo?.linkedin,
    masterResume.contactInfo?.github,
    masterResume.contactInfo?.portfolio
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean);

  return {
    contactInfo: masterResume.contactInfo,
    contactLinks,
    headline: (masterResume.headline || '').trim(),
    summary: (artifact.tailoredSummary || '').trim() || masterResume.summary || '',
    skills: Array.from(skillSet.values()),
    experiences,
    education: Array.isArray(masterResume.education) ? masterResume.education : [],
    projects: Array.isArray(masterResume.projects) ? masterResume.projects : [],
    certifications: Array.isArray(masterResume.certifications) ? masterResume.certifications : [],
    additionalEvidence: Array.isArray(masterResume.additionalEvidence) ? masterResume.additionalEvidence : [],
    coverLetter: (artifact.coverLetter || '').trim(),
    verifiedReplacements: verified,
    unmappedBullets: unmapped
  };
}
