import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askPdfQuestion } from './pdfQuestionService';
import { callGroqChat } from './groqService';

vi.mock('./groqService', () => ({
  callGroqChat: vi.fn()
}));

describe('PDF question privacy and bounds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an API key and never calls the provider without one', async () => {
    await expect(askPdfQuestion('What is the role?', 'Resume text', '')).rejects.toThrow(/Groq API key/i);
    expect(callGroqChat).not.toHaveBeenCalled();
  });

  it('rejects blank and oversized questions', async () => {
    await expect(askPdfQuestion(' ', 'Resume text', 'test-key')).rejects.toThrow(/question/i);
    await expect(askPdfQuestion('x'.repeat(2001), 'Resume text', 'test-key')).rejects.toThrow(/2,000/i);
    expect(callGroqChat).not.toHaveBeenCalled();
  });

  it('rejects empty and over-limit extracted text', async () => {
    await expect(askPdfQuestion('Summarise', ' ', 'test-key')).rejects.toThrow(/readable text/i);
    await expect(askPdfQuestion('Summarise', 'x'.repeat(18001), 'test-key')).rejects.toThrow(/18,000/i);
    expect(callGroqChat).not.toHaveBeenCalled();
  });

  it('sends document text only after explicit question invocation and returns the answer', async () => {
    vi.mocked(callGroqChat).mockResolvedValue(JSON.stringify({ answer: 'The document lists SQL.' }));
    await expect(askPdfQuestion('Which skills are listed?', 'Skills: SQL', 'test-key')).resolves.toBe('The document lists SQL.');
    expect(callGroqChat).toHaveBeenCalledOnce();
    expect(callGroqChat.mock.calls[0][1]).toContain('Skills: SQL');
    expect(callGroqChat.mock.calls[0][1]).toContain('Which skills are listed?');
  });

  it('rejects malformed or empty model output', async () => {
    vi.mocked(callGroqChat).mockResolvedValue('not json');
    await expect(askPdfQuestion('Summarise', 'Document text', 'test-key')).rejects.toThrow(/valid answer/i);
    vi.mocked(callGroqChat).mockResolvedValue(JSON.stringify({ answer: ' ' }));
    await expect(askPdfQuestion('Summarise', 'Document text', 'test-key')).rejects.toThrow(/valid answer/i);
  });

  it('does not swallow provider errors', async () => {
    vi.mocked(callGroqChat).mockRejectedValue(new Error('rate limited'));
    await expect(askPdfQuestion('Summarise', 'Document text', 'test-key')).rejects.toThrow('rate limited');
  });
});
