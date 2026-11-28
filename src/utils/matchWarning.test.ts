import { describe, expect, it } from 'vitest';
import { getMatchWarningMessage } from './matchWarning';

describe('getMatchWarningMessage', () => {
  it('warns below 70 percent and includes the calculated percentage', () => {
    expect(getMatchWarningMessage({ fitScore: 42, skillsRequired: ['React'] }))
      .toContain('Low Skill Overlap (< 70%): 42% match');
  });

  it('warns at zero percent without blocking progression', () => {
    expect(getMatchWarningMessage({ fitScore: 0, skillsRequired: ['React'] }))
      .toContain('0% match');
  });

  it('does not warn at or above 70 percent', () => {
    expect(getMatchWarningMessage({ fitScore: 70, skillsRequired: ['React'] })).toBeNull();
    expect(getMatchWarningMessage({ fitScore: 91, skillsRequired: ['React'] })).toBeNull();
  });

  it('warns when no required skills exist and the score is unavailable', () => {
    expect(getMatchWarningMessage({ fitScore: null, skillsRequired: [] }))
      .toContain('no required skills');
  });

  it('does not confuse a missing resume score with missing job criteria', () => {
    expect(getMatchWarningMessage({ fitScore: null, skillsRequired: ['React'] })).toBeNull();
  });
});
