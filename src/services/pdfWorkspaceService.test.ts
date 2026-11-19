import { describe, expect, it } from 'vitest';
import { findPdfText, validatePdfFile, type PdfTextDocument } from './pdfWorkspaceService';

function fakeFile(name: string, size: number, type = 'application/pdf'): File {
  return { name, size, type } as File;
}

describe('PDF workspace input validation', () => {
  it('rejects empty files', () => {
    expect(validatePdfFile(fakeFile('empty.pdf', 0))).toContain('empty');
  });

  it('rejects files over the mobile size limit', () => {
    expect(validatePdfFile(fakeFile('large.pdf', 10 * 1024 * 1024 + 1))).toContain('10 MB');
  });

  it('rejects non-PDF files', () => {
    expect(validatePdfFile(fakeFile('resume.docx', 100, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toContain('PDF');
  });

  it('accepts a bounded PDF upload', () => {
    expect(validatePdfFile(fakeFile('resume.pdf', 1024))).toBeNull();
  });
});

describe('PDF page text search', () => {
  const document: PdfTextDocument = {
    name: 'candidate.pdf',
    pageCount: 3,
    pages: [
      { pageNumber: 1, text: 'Senior Fraud Analyst with SQL experience' },
      { pageNumber: 2, text: 'Built transaction monitoring dashboards' },
      { pageNumber: 3, text: 'Education and certifications' }
    ],
    fullText: '',
    isScanned: false
  };

  it('returns only pages containing the query, case-insensitively', () => {
    expect(findPdfText(document, 'FRAUD').map((page) => page.pageNumber)).toEqual([1]);
  });

  it('returns no results for empty or unmatched queries', () => {
    expect(findPdfText(document, '   ')).toEqual([]);
    expect(findPdfText(document, 'Kubernetes')).toEqual([]);
  });
});
