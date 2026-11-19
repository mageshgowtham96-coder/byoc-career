import { describe, expect, it } from 'vitest';
import { getRoleSpecificQuestions } from './roleQuestions';

describe('getRoleSpecificQuestions', () => {
  it('returns technology-specific prompts for entry-level candidates', () => {
    const questions = getRoleSpecificQuestions('technology', 'Entry');

    expect(questions.join(' ')).toMatch(/project|coursework|internship/i);
    expect(questions.join(' ')).toMatch(/tools|language|framework/i);
  });

  it('adds scope and leadership prompts for senior candidates', () => {
    const questions = getRoleSpecificQuestions('operations', 'Senior');

    expect(questions.join(' ')).toMatch(/team|strategy|scope/i);
    expect(questions.join(' ')).toMatch(/process|operations/i);
  });

  it('supports career changers without assuming prior industry experience', () => {
    const questions = getRoleSpecificQuestions('general', 'Career Changer');

    expect(questions.join(' ')).toMatch(/transferable/i);
    expect(questions.join(' ')).toMatch(/volunteer|project|coursework/i);
  });

  it('falls back safely for an unknown role family', () => {
    const questions = getRoleSpecificQuestions('unknown-role', 'Unspecified');

    expect(questions.length).toBeGreaterThan(2);
    expect(questions.join(' ')).toMatch(/actually|work|project/i);
  });
});
