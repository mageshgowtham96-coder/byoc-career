import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  inspectPdf,
  mergePdfs,
  extractPdfPages,
  rotatePdfPage,
  reorderPdfPages,
  createPdfBlob
} from './pdfWorkspaceService';

beforeAll(() => {
  if (typeof File !== 'undefined' && !('arrayBuffer' in File.prototype)) {
    Object.defineProperty(File.prototype, 'arrayBuffer', {
      configurable: true,
      value: function arrayBuffer(this: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      }
    });
  }
});

async function makePdf(pageCount = 2): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([300 + index, 400]);
  const bytes = await pdf.save();
  const buffer = Uint8Array.from(bytes).buffer;
  return new File([buffer], 'sample.pdf', { type: 'application/pdf' });
}

describe('PDF workspace validation', () => {
  it('inspects page count and metadata locally', async () => {
    const result = await inspectPdf(await makePdf(3));
    expect(result.pageCount).toBe(3);
    expect(result.fileName).toBe('sample.pdf');
    expect(result.fileSize).toBeGreaterThan(0);
  });

  it('rejects empty files and non-PDF signatures', async () => {
    await expect(inspectPdf(new File([], 'empty.pdf'))).rejects.toThrow(/empty/i);
    await expect(inspectPdf(new File(['not a pdf'], 'fake.pdf'))).rejects.toThrow(/valid PDF/i);
  });

  it('rejects oversized files before parsing', async () => {
    const oversized = { name: 'large.pdf', size: 10 * 1024 * 1024 + 1, slice: () => new Blob(['%PDF-']) } as unknown as File;
    await expect(inspectPdf(oversized)).rejects.toThrow(/10 MB/i);
  });

  it('rejects malformed PDFs with a controlled error', async () => {
    await expect(inspectPdf(new File(['%PDF-1.7\\nnot really a document'], 'broken.pdf'))).rejects.toThrow(/could not be (opened|read)/i);
  });

  it('accepts the 250-page device safety boundary', async () => {
    const result = await inspectPdf(await makePdf(250));
    expect(result.pageCount).toBe(250);
  });

  it('rejects documents above the 250-page device safety ceiling', async () => {
    await expect(inspectPdf(await makePdf(251))).rejects.toThrow(/250 pages/i);
  });

  it('rejects non-PDF filenames even when their bytes resemble a PDF', async () => {
    const pdf = await makePdf(1);
    const wrongName = new File([await pdf.arrayBuffer()], 'document.txt');
    await expect(inspectPdf(wrongName)).rejects.toThrow(/\.pdf extension/i);
  });
});

describe('PDF page operations', () => {
  it('merges multiple PDFs in order', async () => {
    const result = await mergePdfs([await makePdf(2), await makePdf(1)]);
    const merged = await PDFDocument.load(result);
    expect(merged.getPageCount()).toBe(3);
  });

  it('extracts selected 1-based pages', async () => {
    const result = await extractPdfPages(await makePdf(3), [3, 1]);
    const extracted = await PDFDocument.load(result);
    expect(extracted.getPageCount()).toBe(2);
    expect(extracted.getPage(0).getWidth()).toBe(302);
  });

  it('rotates only the requested page', async () => {
    const result = await rotatePdfPage(await makePdf(2), 2, 90);
    const rotated = await PDFDocument.load(result);
    expect(rotated.getPage(0).getRotation().angle).toBe(0);
    expect(rotated.getPage(1).getRotation().angle).toBe(90);
  });

  it('rejects merged output above the 250-page device safety ceiling', async () => {
    await expect(mergePdfs([await makePdf(125), await makePdf(126)])).rejects.toThrow(/cannot exceed 250 pages/i);
  });

  it('rejects merging fewer than two documents', async () => {
    await expect(mergePdfs([await makePdf(1)])).rejects.toThrow(/at least two PDFs/i);
  });

  it('returns an application/pdf Blob for downloads', () => {
    expect(createPdfBlob(new Uint8Array([1, 2, 3])).type).toBe('application/pdf');
  });

  it('reorders pages and rejects duplicate or out-of-range selections', async () => {
    const result = await reorderPdfPages(await makePdf(3), [3, 1, 2]);
    const reordered = await PDFDocument.load(result);
    expect(reordered.getPage(0).getWidth()).toBe(302);
    await expect(reorderPdfPages(await makePdf(3), [1, 1])).rejects.toThrow(/each page once/i);
    await expect(extractPdfPages(await makePdf(2), [3])).rejects.toThrow(/between 1 and 2/i);
  });
});
