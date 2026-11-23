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


  it('understands a flawed, non-standard resume as dynamic sections and asks only for genuinely missing facts', () => {
    const flawedSource = `PRIYA S.
priya.s@example.com
Fraud ops analyst. UPI/card alerts, disputes, case notes.
EMPLOYMENT
Fraud Ops Analyst | NorthStar Payments | 2022 - Current
- reviewed suspicious txn alerts and wrote case notes
Customer Service Associate - CityPay | 2020 to 2022
Handled chargebacks and account misuse reports.
PROJECTS / OTHER
UPI dispute tracker - Excel
Made a simple tracker for pending cases. No measured savings recorded.
AWARD
Team appreciation - 2021
LANGUAGES
Kannada (native), English - working level`;
    const sourceProfile = { ...localProfile, rawText: flawedSource, stats: { ...localProfile.stats, sourceFileName: 'flawed-layout-resume.txt' } };
    const understood = mergeDocumentUnderstanding({
      contactInfo: { name: 'Priya S.', email: 'priya.s@example.com' },
      headline: 'Fraud Operations Analyst',
      summary: 'Fraud operations candidate with transaction-alert and dispute-handling evidence.',
      skills: { technical: ['Excel', 'SQL (basic)'], soft: [], tools: ['Excel'], domains: ['Fraud Operations', 'UPI', 'Chargebacks'] },
      experiences: [
        { company: 'NorthStar Payments', role: 'Fraud Ops Analyst', startDate: '2022', endDate: '', bullets: ['reviewed suspicious txn alerts and wrote case notes'] },
        { company: 'CityPay', role: 'Customer Service Associate', startDate: '2020', endDate: '2022', bullets: ['Handled chargebacks and account misuse reports.'] }
      ],
      projects: [{ title: 'UPI dispute tracker', description: 'Made a simple tracker for pending cases. No measured savings recorded.', technologies: ['Excel'] }],
      documentTitle: 'Priya S. — Career Profile',
      documentType: 'Resume with project and award sections',
      sections: [
        { id: 'employment', title: 'Employment history', status: 'found', summary: 'Two roles are listed with inconsistent date formatting.', items: ['Fraud Ops Analyst — NorthStar Payments', 'Customer Service Associate — CityPay'], confidence: 'high', evidence: [{ quote: 'Fraud Ops Analyst | NorthStar Payments | 2022 - Current', page: 1, field: 'experience' }] },
        { id: 'projects-other', title: 'Projects / Other', status: 'found', summary: 'A small Excel tracker is described without measured impact.', items: ['UPI dispute tracker'], confidence: 'high', evidence: [{ quote: 'Made a simple tracker for pending cases.', page: 1, field: 'project' }] },
        { id: 'awards', title: 'Awards', status: 'found', summary: 'One team appreciation award is listed.', items: ['Team appreciation — 2021'], confidence: 'medium', evidence: [{ quote: 'Team appreciation - 2021', page: 1, field: 'award' }] },
        { id: 'languages', title: 'Languages', status: 'found', summary: 'Two languages and proficiency descriptions are listed.', items: ['Kannada — native', 'English — working level'], confidence: 'high', evidence: [{ quote: 'Kannada (native), English - working level', page: 1, field: 'languages' }] }
      ],
      followUpQuestions: [
        { id: 'q-date', question: 'Can you confirm the month your NorthStar Payments role started?', reason: 'Only the year is provided.', relatedSection: 'Employment history' }
      ],
      warnings: ['The source uses inconsistent date separators and abbreviations.']
    }, sourceProfile);

    expect(understood.rawText).toBe(flawedSource);
    expect(understood.stats.sourceFileName).toBe('flawed-layout-resume.txt');
    expect(understood.experiences).toHaveLength(2);
    expect(understood.experiences[0].endDate).toBe('');
    expect(understood.projects[0].description).toContain('No measured savings recorded');
    expect(understood.documentInsights?.sections.map((section) => section.title)).toEqual([
      'Employment history', 'Projects / Other', 'Awards', 'Languages'
    ]);
    expect(understood.documentInsights?.followUpQuestions).toHaveLength(1);
    expect(understood.documentInsights?.warnings[0]).toMatch(/inconsistent date/i);
    expect(JSON.stringify(understood)).not.toContain('increased revenue by');
  });

  it('normalizes arbitrary section fields and preserves them as candidate evidence', () => {
    const result = mergeDocumentUnderstanding({
      contactInfo: { name: 'Jane Doe' },
      sections: [{
        id: 'community',
        title: 'Community Impact',
        status: 'found',
        summary: 'Community work listed in the source.',
        fields: [
          {
            label: 'Initiative',
            value: 'Started a neighbourhood reading circle',
            evidence: [{ quote: 'Started a neighbourhood reading circle', field: 'Initiative' }]
          },
          {
            label: 'Participants',
            value: '30 local students',
            evidence: [{ quote: 'Supported 30 local students', field: 'Participants' }]
          }
        ],
        items: [],
        confidence: 'high',
        evidence: []
      }]
    }, localProfile);

    expect(result.documentInsights?.sections[0].fields).toHaveLength(2);
    expect(result.documentInsights?.sections[0].fields[0]).toMatchObject({
      label: 'Initiative',
      value: 'Started a neighbourhood reading circle'
    });
    expect(result.additionalEvidence).toContain('Community Impact — Initiative: Started a neighbourhood reading circle');
    expect(result.additionalEvidence).toContain('Community Impact — Participants: 30 local students');
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
