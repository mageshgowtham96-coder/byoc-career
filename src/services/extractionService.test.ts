import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocument, workerOptions } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: '' as string }
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument,
  GlobalWorkerOptions: workerOptions
}));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs'
}));

import { extractResumeFile } from './extractionService';

function makePdfFile(): File {
  return new File([new Uint8Array([37, 80, 68, 70])], 'resume.pdf', { type: 'application/pdf' });
}

function mockPdf(pages: string[][]) {
  const pdf = {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => ({
      getTextContent: vi.fn(async () => ({
        items: pages[pageNumber - 1].map((str, index) => ({ str, hasEOL: index === pages[pageNumber - 1].length - 1 }))
      })),
      cleanup: vi.fn()
    })),
    destroy: vi.fn(async () => undefined)
  };
  getDocument.mockReturnValue({ promise: Promise.resolve(pdf) });
  return pdf;
}

describe('PDF.js resume extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the locally bundled worker and extracts text with the exact PDF page count', async () => {
    const pdf = mockPdf([
      ['Alex Candidate', 'Software Engineer', 'TypeScript React Node.js'],
      ['Experience at Acme', 'Built reliable web applications', 'Education: Computer Science']
    ]);

    const result = await extractResumeFile(makePdfFile());

    expect(workerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs');
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.any(Uint8Array),
      useSystemFonts: true,
      isEvalSupported: false,
      cMapUrl: './cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './standard_fonts/'
    }));
    expect(result.success).toBe(true);
    expect(result.pageCount).toBe(2);
    expect(result.rawText).toContain('Alex Candidate');
    expect(result.rawText).toContain('Built reliable web applications');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('flags an image-only or empty-text PDF for Manual Paste Fallback', async () => {
    mockPdf([[]]);

    const result = await extractResumeFile(makePdfFile());

    expect(result.success).toBe(false);
    expect(result.isScannedImage).toBe(true);
    expect(result.wordCount).toBe(0);
    expect(result.pageCount).toBe(1);
    expect(result.error).toContain('Manual Paste Fallback');
    expect(result.error).toContain('cloud OCR is not used');
  });

  it('uses the scanned-image fallback for fewer than five extracted words', async () => {
    mockPdf([['Only four words here']]);

    const result = await extractResumeFile(makePdfFile());

    expect(result.success).toBe(false);
    expect(result.isScannedImage).toBe(true);
    expect(result.wordCount).toBe(4);
    expect(result.error).toContain('fewer than 5 readable words');
  });

  it('returns a clear password-protected PDF error without calling it a scan', async () => {
    const passwordError = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    getDocument.mockReturnValue({ promise: Promise.reject(passwordError) });

    const result = await extractResumeFile(makePdfFile());

    expect(result.success).toBe(false);
    expect(result.isScannedImage).toBe(false);
    expect(result.error).toContain('password-protected');
    expect(result.error).toContain('Manual Paste Fallback');
  });
});
