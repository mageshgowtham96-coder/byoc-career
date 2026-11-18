import { describe, expect, it } from 'vitest';
import { sanitizeCareerFormState } from './storagePersistence';

describe('sanitizeCareerFormState guided builder fields', () => {
  it('preserves guided role, language, project, certification, and source fields', () => {
    const result = sanitizeCareerFormState({
      personalDetails: { fullName: 'Asha', email: 'asha@example.com', phone: '123', location: 'Chennai', linkedin: 'https://linkedin.com/in/asha', github: 'https://github.com/asha', portfolio: 'https://asha.example.com' },
      workExperience: [{ id: 'exp-1', company: 'Example', role: 'Analyst', duration: '2022–Present', startDate: '2022', endDate: 'Present', location: 'Chennai', isCurrent: true, keyResponsibilities: ['Built reports'] }],
      education: [{ id: 'edu-1', degree: 'BSc', institution: 'Example University', year: '2022', field: 'Statistics', gpa: '8.4' }],
      targetRole: 'Data Analyst',
      currentRole: 'Reporting Intern',
      sourceLanguageOther: 'Odia',
      roleFamily: 'data-analytics',
      experienceLevel: 'Entry',
      sourceLanguage: 'Tamil',
      translatedToEnglish: true,
      originalLanguageSnapshot: '{"summary":"மாதிரி"}',
      projects: [{
        id: 'project-1',
        title: 'Sales dashboard',
        description: 'Built a dashboard',
        technologies: ['SQL', 'Power BI'],
        link: 'https://example.com/project'
      }],
      certifications: [{
        id: 'cert-1',
        name: 'Power BI Associate',
        issuer: 'Example Institute',
        issueDate: '2025'
      }]
    });

    expect(result.personalDetails.linkedin).toBe('https://linkedin.com/in/asha');
    expect(result.personalDetails.github).toBe('https://github.com/asha');
    expect(result.personalDetails.portfolio).toBe('https://asha.example.com');
    expect(result.workExperience[0].startDate).toBe('2022');
    expect(result.workExperience[0].isCurrent).toBe(true);
    expect(result.education[0].field).toBe('Statistics');
    expect(result.education[0].gpa).toBe('8.4');
    expect(result.targetRole).toBe('Data Analyst');
    expect(result.currentRole).toBe('Reporting Intern');
    expect(result.sourceLanguageOther).toBe('Odia');
    expect(result.roleFamily).toBe('data-analytics');
    expect(result.experienceLevel).toBe('Entry');
    expect(result.sourceLanguage).toBe('Tamil');
    expect(result.translatedToEnglish).toBe(true);
    expect(result.originalLanguageSnapshot).toContain('மாதிரி');
    expect(result.projects || []).toEqual([{
      id: 'project-1',
      title: 'Sales dashboard',
      description: 'Built a dashboard',
      technologies: ['SQL', 'Power BI'],
      link: 'https://example.com/project'
    }]);
    expect(result.certifications || []).toEqual([{
      id: 'cert-1',
      name: 'Power BI Associate',
      issuer: 'Example Institute',
      issueDate: '2025'
    }]);
  });

  it('supplies safe defaults for existing drafts created before the guided builder', () => {
    const result = sanitizeCareerFormState({ professionalSummary: 'Experienced teacher' });

    expect(result.targetRole).toBe('');
    expect(result.roleFamily).toBe('general');
    expect(result.experienceLevel).toBe('Unspecified');
    expect(result.sourceLanguage).toBe('English');
    expect(result.translatedToEnglish).toBe(false);
    expect(result.projects).toEqual([]);
    expect(result.certifications).toEqual([]);
  });

  it('drops malformed project and certification records', () => {
    const result = sanitizeCareerFormState({
      projects: [null, { id: 'p', title: 'Valid project', description: '', technologies: 'not-an-array' }],
      certifications: [null, { id: 'c', name: 'Valid certificate' }]
    });

    expect(result.projects || []).toHaveLength(1);
    expect((result.projects || [])[0].technologies).toEqual([]);
    expect(result.certifications || []).toHaveLength(1);
    expect((result.certifications || [])[0].issuer).toBe('');
  });
});
