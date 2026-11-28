export interface MatchWarningInput {
  fitScore: number | null;
  skillsRequired?: string[];
}

/**
 * Returns an advisory only. A null score is called out only when the job
 * supplied no required skills; missing resume data is not mislabelled.
 */
export function getMatchWarningMessage({ fitScore, skillsRequired = [] }: MatchWarningInput): string | null {
  if (fitScore !== null && fitScore < 70) {
    return `Low Skill Overlap (< 70%): ${(Number.isInteger(fitScore) ? fitScore : fitScore.toFixed(1))}% match — review missing skills before investing time tailoring.`;
  }

  if (fitScore === null && skillsRequired.length === 0) {
    return 'Match unavailable: this job lists no required skills, so keyword overlap cannot be calculated. Review the posting manually before tailoring.';
  }

  return null;
}
