import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  askPdfQuestion,
  extractPdfPages,
  findPdfText,
  mergePdfFiles,
  rotatePdfPage,
  validatePdfFile,
  type PdfTextDocument
} from './pdfWorkspaceService';

function fakeFile(name: string, size: number, type = 'application/pdf'): File {
  return { name, size, type } as File;
}

async function createPdf(pageCount: number): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) pdf.addPage([300, 400]);
  const bytes = await pdf.save();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    name: 'fixture.pdf',
    size: bytes.byteLength,
    type: 'application/pdf',
    arrayBuffer: async () => arrayBuffer
  } as unknown as File;
}

async function readPdfPageCount(blob: Blob): Promise<number> {
  const bytes = await blob.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
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

  it('does not send a scanned PDF to AI chat', async () => {
    await expect(askPdfQuestion({ ...document, isScanned: true }, 'Summarise this', 'test-key'))
      .rejects.toThrow(/scanned/i);
  });

  it('requires explicit provider credentials before AI chat', async () => {
    await expect(askPdfQuestion(document, 'Summarise this', ''))
      .rejects.toThrow(/Groq API key/i);
  });
});

describe('local PDF operations', () => {
  it('merges two valid PDFs in the supplied order', async () => {
    const merged = await mergePdfFiles([await createPdf(1), await createPdf(2)]);
    expect(await readPdfPageCount(merged)).toBe(3);
  });

  it('extracts only the requested page numbers and removes duplicates', async () => {
    const source = await createPdf(3);
    const extracted = await extractPdfPages(source, [3, 1, 3, 0, 4]);
    expect(await readPdfPageCount(extracted)).toBe(2);
  });

  it('rotates only the requested page', async () => {
    const source = await createPdf(2);
    const rotated = await rotatePdfPage(source, 2, 90);
    const pdf = await PDFDocument.load(await readBlob(rotated));
    expect(pdf.getPage(0).getRotation().angle).toBe(0);
    expect(pdf.getPage(1).getRotation().angle).toBe(90);
  });

  it('rejects merging fewer than two PDFs', async () => {
    await expect(mergePdfFiles([await createPdf(1)])).rejects.toThrow(/between 2 and 10/i);
  });

  it('rejects an invalid page number when rotating', async () => {
    await expect(rotatePdfPage(await createPdf(1), 0, 90)).rejects.toThrow(/valid page number/i);
  });
});
