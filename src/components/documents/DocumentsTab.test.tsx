import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { DocumentsTab } from './DocumentsTab';
import { extractResumeFile } from '../../services/extractionService';
import { inspectPdf } from '../../services/pdfWorkspaceService';

const {
  mockAnalyzePdfDocument, mockAskPdfWithGemini, mockGeminiApiKey,
  mockSaveBlobToDownloads, mockOpenSavedFileExternally, mockSetGeminiApiKey
} = vi.hoisted(() => ({
  mockAnalyzePdfDocument: vi.fn(),
  mockAskPdfWithGemini: vi.fn(),
  mockGeminiApiKey: { value: 'test-gemini-key' },
  mockSaveBlobToDownloads: vi.fn(),
  mockOpenSavedFileExternally: vi.fn(),
  mockSetGeminiApiKey: vi.fn()
}));

vi.mock('../../store/useWizardStore', () => ({
  useWizardStore: () => ({
    geminiApiKey: mockGeminiApiKey.value,
    setGeminiApiKey: mockSetGeminiApiKey,
    addToast: vi.fn()
  }),
  syncVaultFromStoreNow: vi.fn().mockResolvedValue(true)
}));
vi.mock('../../services/extractionService', () => ({ extractResumeFile: vi.fn() }));
vi.mock('../../services/documentIntelligenceService', () => ({
  analyzePdfDocument: mockAnalyzePdfDocument,
  askPdfWithGemini: mockAskPdfWithGemini
}));
vi.mock('../../services/pdfWorkspaceService', () => ({
  inspectPdf: vi.fn(),
  mergePdfs: vi.fn(),
  createPdfBlob: vi.fn(() => new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
  extractPdfPages: vi.fn(),
  rotatePdfPage: vi.fn(),
  reorderPdfPages: vi.fn()
}));
vi.mock('../../services/exporterService', () => ({
  saveBlobToDownloads: mockSaveBlobToDownloads,
  openSavedFileExternally: mockOpenSavedFileExternally
}));

describe('DocumentsTab dynamic document understanding', () => {
  let container: HTMLDivElement;
  let root: Root;
  let uploadedFile: File;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockGeminiApiKey.value = 'test-gemini-key';
    mockSaveBlobToDownloads.mockResolvedValue({ uri: 'content://downloads/byoc/resume.pdf', filename: 'resume.pdf' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:byoc-pdf') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(extractResumeFile).mockResolvedValue({
      success: true, rawText: 'Candidate skills: Excel and SQL.', wordCount: 5,
      pageCount: 1, charCount: 31, fileName: 'resume.pdf'
    });
    vi.mocked(inspectPdf).mockResolvedValue({
      fileName: 'resume.pdf', fileSize: 1024, pageCount: 1,
      title: 'Resume', author: '', subject: '', creator: ''
    });
    mockAnalyzePdfDocument.mockResolvedValue({
      documentType: 'Resume',
      title: 'Asha Rao — Resume',
      summary: 'A finance analyst with experience in reporting.',
      sections: [{ heading: 'Experience', content: 'Risk Analyst at Sample Bank', items: ['Reviewed fraud reports'] }],
      keyFacts: [{ label: 'Skill', value: 'Advanced Excel', evidence: 'Advanced Excel', page: 1 }],
      warnings: ['Employment dates need manual verification.']
    });
    mockAskPdfWithGemini.mockResolvedValue('The PDF lists Advanced Excel.');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    uploadedFile = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderAndUpload() {
    await act(async () => { root.render(<DocumentsTab />); });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [uploadedFile] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
  }

  it('does not send the PDF to Gemini automatically when uploaded', async () => {
    await renderAndUpload();
    expect(container.textContent).toContain('Local until you choose AI');
    expect(container.textContent).toContain('Analyze original PDF');
    expect(mockAnalyzePdfDocument).not.toHaveBeenCalled();
    expect(mockAskPdfWithGemini).not.toHaveBeenCalled();
  });

  it('renders sections and evidence returned for the uploaded document, not a fixed resume template', async () => {
    await renderAndUpload();
    const analyzeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Analyze original PDF'));
    await act(async () => { analyzeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockAnalyzePdfDocument).toHaveBeenCalledOnce();
    expect(mockAnalyzePdfDocument).toHaveBeenCalledWith(uploadedFile, 'test-gemini-key');
    expect(container.textContent).toContain('Asha Rao — Resume');
    expect(container.textContent).toContain('Detected document type: Resume');
    expect(container.textContent).toContain('Experience');
    expect(container.textContent).toContain('Reviewed fraud reports');
    expect(container.textContent).toContain('Advanced Excel');
    expect(container.textContent).toContain('Employment dates need manual verification.');
  });

  it('sends the original uploaded PDF for document questions, not extracted text', async () => {
    await renderAndUpload();
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, 'Which skills are listed?');
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })); });
    const askButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Ask Gemini'));
    await act(async () => { askButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockAskPdfWithGemini).toHaveBeenCalledOnce();
    expect(mockAskPdfWithGemini).toHaveBeenCalledWith(uploadedFile, 'Which skills are listed?', 'test-gemini-key');
    expect(container.textContent).toContain('The PDF lists Advanced Excel.');
  });

  it('keeps local PDF tools available when no Gemini key is configured', async () => {
    mockGeminiApiKey.value = '';
    await renderAndUpload();
    expect(container.textContent).toContain('Page tools');
    expect(container.textContent).toContain('Configure Gemini below');
    const analyzeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Analyze original PDF')) as HTMLButtonElement;
    expect(analyzeButton.disabled).toBe(true);
    expect(mockAnalyzePdfDocument).not.toHaveBeenCalled();
  });

  it('saves the Gemini key through the encrypted vault action', async () => {
    mockGeminiApiKey.value = '';
    await renderAndUpload();
    const keyInput = container.querySelector('#document-gemini-key') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(keyInput, 'new-gemini-key');
    await act(async () => { keyInput.dispatchEvent(new Event('input', { bubbles: true })); });
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Save key in encrypted vault'));
    await act(async () => { saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockSetGeminiApiKey).toHaveBeenCalledWith('new-gemini-key');
  });

  it('keeps Android native open/save actions available', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    await renderAndUpload();
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Save to Downloads/BYOC'));
    const openButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Open Separately'));
    await act(async () => { saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockSaveBlobToDownloads).toHaveBeenCalledOnce();
    await act(async () => { openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockOpenSavedFileExternally).toHaveBeenCalledWith('content://downloads/byoc/resume.pdf', 'application/pdf');
  });

  it('removes the selected document and revokes its temporary preview URL', async () => {
    await renderAndUpload();
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Remove'));
    await act(async () => { removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Your document workspace');
    expect(container.textContent).not.toContain('resume.pdf');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:byoc-pdf');
  });
});
