import { describe, expect, it } from 'vitest';
import type { MasterResume } from '../types';
import { applyResumeIntakeReviewEdits } from './resumeIntake';

const profile: MasterResume = {
  rawText: 'Original resume text',
  contactInfo: { name: 'Original Name', email: 'old@example.com', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: 'Original headline',
  summary: 'Original summary',
  skills: { technical: ['SQL'], soft: [], tools: [], domains: [] },
  experiences: [{ id: 'exp-1', role: 'Analyst', company: 'Example Co', startDate: '2023', endDate: 'Present', location: '', bullets: ['Reviewed cases'], isCurrent: true }],
  education: [],
  projects: [],
  certifications: [],
  stats: { wordCount: 10, pageCount: 1, charCount: 50, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: 'resume.docx' }
};

describe('resume intake review edits', () => {
  it('applies the latest user-reviewed contact and summary edits before AI structuring', () => {
    const result = applyResumeIntakeReviewEdits(profile, {
      name: 'Corrected Name',
      email: 'new@example.com',
      headline: 'Corrected headline',
      summary: 'Corrected summary'
    });

    expect(result.contactInfo.name).toBe('Corrected Name');
    expect(result.contactInfo.email).toBe('new@example.com');
    expect(result.headline).toBe('Corrected headline');
    expect(result.summary).toBe('Corrected summary');
    expect(result.experiences).toEqual(profile.experiences);
    expect(result.rawText).toBe(profile.rawText);
    expect(profile.contactInfo.name).toBe('Original Name');
  });

  it('allows the user to explicitly clear incorrect extracted values', () => {
    const result = applyResumeIntakeReviewEdits(profile, {
      name: '  ', email: '', headline: '', summary: ''
    });
    expect(result.contactInfo.name).toBe('');
    expect(result.contactInfo.email).toBe('');
    expect(result.headline).toBe('');
    expect(result.summary).toBe('');
  });
});
