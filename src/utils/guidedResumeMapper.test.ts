import { describe, expect, it } from 'vitest';
import { buildMasterResumeFromCareerDraft, createCareerDraftFromMasterResume } from './guidedResumeMapper';
import type { CareerApplicationFormState } from '../types';

const baseDraft: CareerApplicationFormState = {
  personalDetails: {
    fullName: 'Asha',
    email: 'asha@example.com',
    phone: '123',
    location: 'Chennai',
    linkedin: 'https://linkedin.com/in/asha',
    github: 'https://github.com/asha',
    portfolio: ''
  },
  targetRole: 'Data Analyst',
  roleFamily: 'data-analytics',
  experienceLevel: 'Entry',
  sourceLanguage: 'English',
  professionalSummary: 'Careful analyst who enjoys making data useful.',
  workExperience: [{
    id: 'exp-1',
    company: 'Example Co',
    role: 'Reporting Intern',
    duration: 'Jan 2024 – Present',
    startDate: 'Jan 2024',
    endDate: 'Present',
    location: 'Chennai',
    isCurrent: true,
    keyResponsibilities: ['Built weekly reports', 'Checked data quality']
  }],
  skills: ['SQL', 'Excel', 'Power BI'],
  education: [{
    id: 'edu-1',
    degree: 'BSc',
    institution: 'Example University',
    year: '2024',
    field: 'Statistics',
    gpa: '8.4'
  }],
  projects: [{
    id: 'project-1',
    title: 'Sales Dashboard',
    description: 'Created a dashboard for a college project.',
    technologies: ['SQL', 'Power BI']
  }],
  certifications: [{
    id: 'cert-1',
    name: 'Power BI Associate',
    issuer: 'Example Institute',
    issueDate: '2025'
  }],
  isAutoFilled: false,
  lastExtractedTimestamp: null,
  rawSourceText: ''
};

describe('buildMasterResumeFromCareerDraft', () => {
  it('maps user-provided details into the existing MasterResume shape', () => {
    const profile = buildMasterResumeFromCareerDraft(baseDraft, new Date('2026-01-02T03:04:05.000Z'));

    expect(profile.contactInfo.name).toBe('Asha');
    expect(profile.contactInfo.linkedin).toBe('https://linkedin.com/in/asha');
    expect(profile.headline).toBe('Data Analyst');
    expect(profile.summary).toBe(baseDraft.professionalSummary);
    expect(profile.experiences[0]).toMatchObject({
      id: 'exp-1',
      company: 'Example Co',
      role: 'Reporting Intern',
      startDate: 'Jan 2024',
      endDate: 'Present',
      isCurrent: true,
      bullets: ['Built weekly reports', 'Checked data quality']
    });
    expect(profile.education[0]).toMatchObject({
      institution: 'Example University',
      degree: 'BSc',
      field: 'Statistics',
      gradYear: '2024',
      gpa: '8.4'
    });
    expect(profile.projects).toEqual(baseDraft.projects);
    expect(profile.certifications).toEqual(baseDraft.certifications);
    expect(profile.stats.lastParsedDate).toBe('2026-01-02T03:04:05.000Z');
  });

  it('does not invent achievements, numbers, or experience for an early-career user', () => {
    const studentDraft = {
      ...baseDraft,
      workExperience: [],
      professionalSummary: '',
      targetRole: 'Junior Analyst'
    };
    const profile = buildMasterResumeFromCareerDraft(studentDraft, new Date('2026-01-02T00:00:00.000Z'));

    expect(profile.experiences).toEqual([]);
    expect(profile.summary).toBe('');
    expect(profile.rawText).not.toMatch(/\b\d+%|increased revenue|managed a team/i);
    expect(profile.headline).toBe('Junior Analyst');
  });

  it('round-trips an existing profile into an editable draft without dropping its content', () => {
    const profile = buildMasterResumeFromCareerDraft(baseDraft, new Date('2026-01-02T00:00:00.000Z'));
    const draft = createCareerDraftFromMasterResume(profile);

    expect(draft.personalDetails.fullName).toBe(profile.contactInfo.name);
    expect(draft.targetRole).toBe(profile.headline);
    expect(draft.professionalSummary).toBe(profile.summary);
    expect(draft.workExperience[0].keyResponsibilities).toEqual(profile.experiences[0].bullets);
    expect(draft.skills).toEqual(profile.skills.technical);
    expect(draft.projects).toEqual(profile.projects);
    expect(draft.certifications).toEqual(profile.certifications);
  });

  it('parses a simple duration range only when explicit dates are not provided', () => {
    const draft = {
      ...baseDraft,
      workExperience: [{
        ...baseDraft.workExperience[0],
        startDate: '',
        endDate: '',
        isCurrent: false,
        duration: '2021 – 2023'
      }]
    };
    const profile = buildMasterResumeFromCareerDraft(draft, new Date('2026-01-02T00:00:00.000Z'));

    expect(profile.experiences[0].startDate).toBe('2021');
    expect(profile.experiences[0].endDate).toBe('2023');
  });
});
