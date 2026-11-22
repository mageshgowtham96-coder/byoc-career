import { describe, expect, it } from 'vitest';
import type { MasterResume } from '../types';
import { mergeDocumentUnderstanding } from './documentIntelligenceService';

const localProfile: MasterResume = {
  rawText: 'Jane Doe\nWorked at Acme as Analyst',
  contactInfo: { name: 'Jane Doe', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  headline: '',
  summary: '',
  skills: { technical: [], soft: [], tools: [], domains: [] },
  experiences: [],
  education: [],
  projects: [],
  certifications: [],
  additionalEvidence: [],
  stats: { wordCount: 7, pageCount: 1, charCount: 38, lastParsedDate: '2026-11-22', sourceFileName: 'resume.pdf' }
};

describe('document intelligence model', () => {
  it('keeps source metadata and adds document-specific sections and evidence', () => {
    const result = mergeDocumentUnderstanding({
      contactInfo: { name: 'Jane Doe', email: 'jane@example.com' },
      headline: 'Business Analyst',
      skills: { technical: ['SQL'], soft: [], tools: ['Excel'], domains: [] },
      experiences: [{ company: 'Acme', role: 'Analyst', startDate: '2022', endDate: '2024', bullets: ['Prepared monthly reports'] }],
      documentTitle: 'Jane Doe CV',
      documentType: 'Resume',
      documentSummary: 'A business analyst resume.',
      sections: [{
        id: 'experience',
        title: 'Work experience',
        status: 'found',
        summary: 'One role was identified.',
        items: ['Analyst at Acme'],
        confidence: 'high',
        evidence: [{ quote: 'Worked at Acme as Analyst', page: 1, field: 'experience' }]
      }],
      followUpQuestions: [{ id: 'q1', question: 'What month did this role end?', reason: 'Only the year is listed.', relatedSection: 'Work experience' }],
      warnings: []
    }, localProfile);

    expect(result.rawText).toBe(localProfile.rawText);
    expect(result.stats.sourceFileName).toBe('resume.pdf');
    expect(result.contactInfo.email).toBe('jane@example.com');
    expect(result.experiences[0].company).toBe('Acme');
    expect(result.documentInsights?.sections[0].evidence[0].page).toBe(1);
    expect(result.documentInsights?.followUpQuestions[0].question).toContain('month');
    expect(result.documentInsights?.provider).toBe('gemini');
  });

  it('does not fill absent fields with invented values', () => {
    const result = mergeDocumentUnderstanding({
      contactInfo: {},
      skills: {},
      experiences: [],
      education: [],
      projects: [],
      certifications: [],
      sections: [{ title: 'Education', status: 'not_found', confidence: 'low', items: [], evidence: [] }]
    }, localProfile);

    expect(result.contactInfo.email).toBe('');
    expect(result.experiences).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.documentInsights?.sections[0].status).toBe('not_found');
  });
});
