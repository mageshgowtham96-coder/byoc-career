import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { DocumentsTab } from './DocumentsTab';
import { extractResumeFile } from '../../services/extractionService';
import { inspectPdf } from '../../services/pdfWorkspaceService';

const { mockAskPdfQuestion, mockGroqApiKey, mockSaveBlobToDownloads, mockOpenSavedFileExternally } = vi.hoisted(() => ({
  mockAskPdfQuestion: vi.fn(),
  mockGroqApiKey: { value: 'test-groq-key' },
  mockSaveBlobToDownloads: vi.fn(),
  mockOpenSavedFileExternally: vi.fn()
}));

vi.mock('../../store/useWizardStore', () => ({
  useWizardStore: () => ({ groqApiKey: mockGroqApiKey.value, addToast: vi.fn() })
}));
vi.mock('../../services/extractionService', () => ({
  extractResumeFile: vi.fn()
}));
vi.mock('../../services/pdfWorkspaceService', () => ({
  inspectPdf: vi.fn(),
  mergePdfs: vi.fn(),
  createPdfBlob: vi.fn(() => new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
  extractPdfPages: vi.fn(),
  rotatePdfPage: vi.fn(),
  reorderPdfPages: vi.fn()
}));
vi.mock('../../services/pdfQuestionService', () => ({
  askPdfQuestion: mockAskPdfQuestion
}));
vi.mock('../../services/exporterService', () => ({
  saveBlobToDownloads: mockSaveBlobToDownloads,
  openSavedFileExternally: mockOpenSavedFileExternally
}));

describe('DocumentsTab privacy and explicit AI interaction', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockGroqApiKey.value = 'test-groq-key';
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
    mockAskPdfQuestion.mockResolvedValue('The document lists Excel and SQL.');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not send document content to Groq when the workspace opens', async () => {
    await act(async () => { root.render(<DocumentsTab />); });
    expect(container.textContent).toContain('Local by default');
    expect(container.textContent).toContain('sent to Groq only when you submit a question');
    expect(mockAskPdfQuestion).not.toHaveBeenCalled();
  });

  it('sends extracted text only after the user submits a question', async () => {
    await act(async () => { root.render(<DocumentsTab />); });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, 'Which skills are listed?');
    await act(async () => { textarea.dispatchEvent(new Event('input', { bubbles: true })); });

    const askButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Ask Groq'));
    expect(askButton).toBeTruthy();
    await act(async () => { askButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockAskPdfQuestion).toHaveBeenCalledOnce();
    expect(mockAskPdfQuestion).toHaveBeenCalledWith('Which skills are listed?', 'Candidate skills: Excel and SQL.', 'test-groq-key');
    expect(container.textContent).toContain('The document lists Excel and SQL.');
  });
  it('keeps document chat unavailable without a Groq key while local PDF tools remain visible', async () => {
    mockGroqApiKey.value = '';
    await act(async () => { root.render(<DocumentsTab />); });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toContain('Page tools');
    expect(container.textContent).toContain('Configure Groq in Settings');
    expect(mockAskPdfQuestion).not.toHaveBeenCalled();
  });

  it('shows a readable text preview and native open/save actions on Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    await act(async () => { root.render(<DocumentsTab />); });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('Candidate skills: Excel and SQL.');
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Save to Downloads/BYOC'));
    const openButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Open Separately'));
    expect(saveButton).toBeTruthy();
    expect(openButton).toBeTruthy();

    await act(async () => { saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockSaveBlobToDownloads).toHaveBeenCalledOnce();
    await act(async () => { openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockOpenSavedFileExternally).toHaveBeenCalledWith('content://downloads/byoc/resume.pdf', 'application/pdf');
  });

  it('removes the selected document and revokes its temporary preview URL', async () => {
    await act(async () => { root.render(<DocumentsTab />); });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Remove'));
    await act(async () => { removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Your document workspace');
    expect(container.textContent).not.toContain('resume.pdf');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:byoc-pdf');
  });

});
