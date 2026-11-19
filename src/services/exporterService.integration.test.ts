import { describe, expect, it } from 'vitest';
import type { MasterResume } from '../types';
import { createMasterResumeExportArtifact, generateDocxResume, generatePdfResume } from './exporterService';
import { extractResumeFile } from './extractionService';

const createApprovedMasterResume = (name = 'Asha Rao'): MasterResume => ({
  rawText: 'Original uploaded resume text stays in the structured encrypted profile.',
  contactInfo: { name, email: 'asha@example.com', phone: '+91 90000 00000', location: 'Chennai, India', linkedin: '', github: '', portfolio: '' },
  headline: 'Commerce Graduate | Data Analysis',
  summary: 'Commerce graduate with project experience in data analysis and reporting.',
  skills: { technical: ['SQL'], soft: ['Communication'], tools: ['Excel'], domains: ['Data Analysis'] },
  experiences: [{
    id: 'exp-1', company: 'Community Co-op', role: 'Operations Intern', startDate: '2025', endDate: '2025',
    location: 'Chennai', bullets: ['Prepared weekly operational reports using Excel.'], isCurrent: false
  }],
  education: [{ id: 'edu-1', institution: 'City University', degree: 'Bachelor of Commerce', field: 'Commerce', gradYear: '2026' }],
  projects: [{ id: 'proj-1', title: 'Retail Sales Analysis', description: 'Reviewed monthly sales trends using Excel and SQL.', technologies: ['Excel', 'SQL'] }],
  certifications: [],
  additionalEvidence: ['Languages: Tamil — Native; English — Professional working proficiency.'],
  stats: { wordCount: 60, pageCount: 1, charCount: 400, lastParsedDate: '2026-11-20T00:00:00.000Z', sourceFileName: 'asha-resume.docx' }
});

describe('Master Resume document export integration', () => {
  it('exports a real DOCX and re-imports its Unicode and career content without using raw-text storage', async () => {
    const resume = createApprovedMasterResume('ஆஷா ராவ்');
    const artifact = createMasterResumeExportArtifact(resume);
    const docx = await generateDocxResume(artifact, resume);
    expect(docx.size).toBeGreaterThan(0);

    const docxBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Could not read generated DOCX blob.'));
      reader.readAsArrayBuffer(docx);
    });
    // JSDOM's File does not expose arrayBuffer(); model the browser File contract used by the extractor.
    const file = {
      name: 'asha-master-resume.docx',
      size: docxBytes.byteLength,
      arrayBuffer: async () => docxBytes
    } as unknown as File;
    const imported = await extractResumeFile(file);
    expect(imported.success, imported.error || 'DOCX re-import failed without an error message').toBe(true);
    expect(imported.rawText).toContain('ஆஷா ராவ்');
    expect(imported.rawText).toContain('Commerce graduate with project experience');
    expect(imported.rawText).toContain('Prepared weekly operational reports');
    expect(imported.rawText).toContain('Retail Sales Analysis');
    expect(imported.rawText).toContain('Tamil — Native');
    expect(resume.rawText).toBe('Original uploaded resume text stays in the structured encrypted profile.');
    expect(artifact.jobId).toBe('master-resume');
  });

  it('exports a readable PDF for standard-font-supported text', async () => {
    const resume = createApprovedMasterResume();
    const artifact = createMasterResumeExportArtifact(resume);
    const pdf = await generatePdfResume(artifact, resume);
    expect(pdf.size).toBeGreaterThan(0);
    expect(pdf.type).toBe('application/pdf');
  });

  it('refuses lossy PDF export for unsupported scripts while leaving DOCX export available', async () => {
    const resume = createApprovedMasterResume('தமிழ் வேட்பாளர்');
    const artifact = createMasterResumeExportArtifact(resume);
    await expect(generatePdfResume(artifact, resume)).rejects.toThrow(/DOCX to preserve every character/i);
    const docx = await generateDocxResume(artifact, resume);
    expect(docx.size).toBeGreaterThan(0);
  });
});
