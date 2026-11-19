import { degrees, PDFDocument } from 'pdf-lib';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 250;

export interface PdfInspection {
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string;
  author: string;
  subject: string;
  creator: string;
}

async function loadValidatedPdf(file: File): Promise<PDFDocument> {
  if (!file || typeof file.size !== 'number') throw new Error('Choose a PDF file first.');
  if (file.size === 0) throw new Error('The PDF file is empty.');
  if (file.size > MAX_PDF_BYTES) throw new Error('PDF files must be 10 MB or smaller on this device.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a file with a .pdf extension.');
  const signature = await file.slice(0, 5).text();
  if (signature !== '%PDF-') throw new Error('This does not appear to be a valid PDF file.');
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  } catch {
    throw new Error('This PDF could not be opened. It may be malformed, encrypted, or use an unsupported feature.');
  }
  const pageCount = document.getPageCount();
  if (pageCount < 1) throw new Error('The PDF contains no pages.');
  if (pageCount > MAX_PDF_PAGES) throw new Error(`This PDF has ${pageCount} pages. The device-safe limit is ${MAX_PDF_PAGES} pages.`);
  return document;
}

function validatePageNumbers(pageNumbers: number[], pageCount: number, requireAll = false): void {
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) throw new Error('Select at least one page.');
  if (pageNumbers.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error(`Page numbers must be between 1 and ${pageCount}.`);
  }
  if (new Set(pageNumbers).size !== pageNumbers.length) throw new Error('Select each page once; duplicate page numbers are not allowed.');
  if (requireAll && (pageNumbers.length !== pageCount || pageNumbers.some((page) => !pageNumbers.includes(page)))) {
    throw new Error('Reordering must include every page exactly once.');
  }
}

export async function inspectPdf(file: File): Promise<PdfInspection> {
  const pdf = await loadValidatedPdf(file);
  return {
    fileName: file.name,
    fileSize: file.size,
    pageCount: pdf.getPageCount(),
    title: pdf.getTitle() || '',
    author: pdf.getAuthor() || '',
    subject: pdf.getSubject() || '',
    creator: pdf.getCreator() || ''
  };
}

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  if (!Array.isArray(files) || files.length < 2) throw new Error('Choose at least two PDFs to merge.');
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await loadValidatedPdf(file);
    const indexes = source.getPageIndices();
    if (output.getPageCount() + indexes.length > MAX_PDF_PAGES) {
      throw new Error(`Merged PDFs cannot exceed ${MAX_PDF_PAGES} pages.`);
    }
    const pages = await output.copyPages(source, indexes);
    pages.forEach((page) => output.addPage(page));
  }
  return output.save();
}

export async function extractPdfPages(file: File, pageNumbers: number[]): Promise<Uint8Array> {
  const source = await loadValidatedPdf(file);
  validatePageNumbers(pageNumbers, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pageNumbers.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  return output.save();
}

export async function rotatePdfPage(
  file: File,
  pageNumber: number,
  rotation: 90 | 180 | 270
): Promise<Uint8Array> {
  const pdf = await loadValidatedPdf(file);
  validatePageNumbers([pageNumber], pdf.getPageCount());
  const page = pdf.getPage(pageNumber - 1);
  page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
  return pdf.save();
}

export async function reorderPdfPages(file: File, pageNumbers: number[]): Promise<Uint8Array> {
  const source = await loadValidatedPdf(file);
  validatePageNumbers(pageNumbers, source.getPageCount(), true);
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pageNumbers.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  return output.save();
}

export function createPdfBlob(bytes: Uint8Array): Blob {
  const safeBuffer = Uint8Array.from(bytes).buffer;
  return new Blob([safeBuffer], { type: 'application/pdf' });
}
