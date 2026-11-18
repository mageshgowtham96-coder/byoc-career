import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroqChat } from './groqService';
import { translateCareerDraftToEnglish } from './careerTranslationService';
import type { CareerApplicationFormState } from '../types';

vi.mock('./groqService', () => ({
  callGroqChat: vi.fn()
}));

const draft: CareerApplicationFormState = {
  personalDetails: {
    fullName: 'அஷா',
    email: 'asha@example.com',
    phone: '123',
    location: 'சென்னை'
  },
  targetRole: 'தரவு ஆய்வாளர்',
  currentRole: 'தரவு பயிற்சியாளர்',
  roleFamily: 'data-analytics',
  experienceLevel: 'Entry',
  sourceLanguage: 'Tamil',
  professionalSummary: 'தரவை ஆராய விரும்பும் தொடக்கநிலை நிபுணர்.',
  workExperience: [{
    id: 'exp-1',
    company: 'ABC Technologies',
    role: 'தரவு பயிற்சியாளர்',
    duration: '2024–Present',
    startDate: '2024',
    endDate: 'Present',
    keyResponsibilities: ['வாராந்திர அறிக்கைகளை உருவாக்கினேன்']
  }],
  skills: ['SQL', 'Power BI'],
  education: [{
    id: 'edu-1',
    degree: 'புள்ளியியல் இளங்கலை',
    institution: 'சென்னை பல்கலைக்கழகம்',
    year: '2024',
    field: 'புள்ளியியல்'
  }],
  projects: [{
    id: 'project-1',
    title: 'விற்பனை அறிக்கை',
    description: 'கல்லூரி திட்டத்திற்காக அறிக்கை உருவாக்கினேன்.',
    technologies: ['SQL', 'Power BI']
  }],
  certifications: [{
    id: 'cert-1',
    name: 'Power BI சான்றிதழ்',
    issuer: 'Microsoft',
    issueDate: '2025'
  }],
  isAutoFilled: false,
  lastExtractedTimestamp: null,
  rawSourceText: ''
};

describe('translateCareerDraftToEnglish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('translates only resume text fields and preserves personal/contact and factual fields', async () => {
    vi.mocked(callGroqChat).mockResolvedValue(JSON.stringify({
      targetRole: 'Data Analyst',
      currentRole: 'Data Intern',
      professionalSummary: 'Early-career professional interested in data analysis.',
      workExperience: [{ role: 'Data Intern', keyResponsibilities: ['Created weekly reports'] }],
      education: [{ degree: "Bachelor's degree in Statistics", field: 'Statistics' }],
      projects: [{ title: 'Sales Report', description: 'Created a report for a college project.' }],
      certifications: [{ name: 'Power BI Certificate' }]
    }));

    const translated = await translateCareerDraftToEnglish(draft, 'Tamil', 'test-groq-key');

    expect(translated.targetRole).toBe('Data Analyst');
    expect(translated.currentRole).toBe('Data Intern');
    expect(translated.professionalSummary).toContain('data analysis');
    expect(translated.personalDetails).toEqual(draft.personalDetails);
    expect(translated.workExperience[0].company).toBe('ABC Technologies');
    expect(translated.workExperience[0].keyResponsibilities).toEqual(['Created weekly reports']);
    expect(translated.workExperience[0].startDate).toBe('2024');
    expect(translated.education[0].institution).toBe('சென்னை பல்கலைக்கழகம்');
    expect(translated.skills).toEqual(draft.skills);
    expect(translated.projects[0].technologies).toEqual(['SQL', 'Power BI']);
    expect(translated.certifications[0].issuer).toBe('Microsoft');
    expect(translated.translatedToEnglish).toBe(true);
    expect(translated.originalLanguageSnapshot).toContain('தரவு');
  });

  it('rejects incomplete or malformed translation output without returning a partial draft', async () => {
    vi.mocked(callGroqChat).mockResolvedValue(JSON.stringify({
      targetRole: 'Data Analyst',
      professionalSummary: 'Translated'
    }));

    await expect(translateCareerDraftToEnglish(draft, 'Tamil', 'test-groq-key')).rejects.toThrow(/translation response/i);
  });

  it('does not make a Groq request when the API key is missing', async () => {
    await expect(translateCareerDraftToEnglish(draft, 'Tamil', '')).rejects.toThrow(/API key/i);
    expect(callGroqChat).not.toHaveBeenCalled();
  });

  it('rejects oversized translation input before sending it to Groq', async () => {
    const oversized = { ...draft, professionalSummary: 'தமிழ்'.repeat(20000) };

    await expect(translateCareerDraftToEnglish(oversized, 'Tamil', 'test-groq-key')).rejects.toThrow(/shorter draft/i);
    expect(callGroqChat).not.toHaveBeenCalled();
  });
});
