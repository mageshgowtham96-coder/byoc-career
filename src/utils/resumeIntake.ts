import type { MasterResume } from '../types';

export interface ResumeIntakeReviewEdits {
  name: string;
  email: string;
  headline: string;
  summary: string;
}

/**
 * Applies the values currently visible in the intake review form to an immutable
 * profile copy before optional AI structuring. The user's corrections must be
 * part of the input, not silently replaced by the earlier local parse.
 */
export function applyResumeIntakeReviewEdits(
  profile: MasterResume,
  edits: ResumeIntakeReviewEdits
): MasterResume {
  return {
    ...profile,
    contactInfo: {
      ...profile.contactInfo,
      name: edits.name.trim() || profile.contactInfo.name,
      email: edits.email.trim() || profile.contactInfo.email
    },
    headline: edits.headline.trim() || profile.headline,
    summary: edits.summary.trim() || profile.summary
  };
}
