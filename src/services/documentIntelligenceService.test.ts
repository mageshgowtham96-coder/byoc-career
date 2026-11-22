import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePdfDocument, askPdfWithGemini, DOCUMENT_AI_MODEL } from './documentIntelligenceService';

const calls: any[] = [];
const responseText = {
  documentType: 'Resume',
  title: 'Asha Rao',
  summary: 'Finance analyst',
  sections: [{ heading: 'Experience', content: 'Risk analyst', items: ['Reviewed reports'] }],
  keyFacts: [{ label: 'Skill', value: 'Excel', evidence: 'Advanced Excel', page: 1 }],
  warnings: [],
  answer: 'Excel is listed.'
};

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async (args: unknown) => {
        calls.push(args);
        return { text: JSON.stringify(responseText) };
      })
    };
    constructor(_config: unknown) {}
  }
}));

function makePdf(size = 8): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46]);
  return {
    name: 'candidate.pdf',
    type: 'application/pdf',
    size,
    arrayBuffer: async () => bytes.buffer
  } as unknown as File;
}

describe('Gemini original-document understanding', () => {
  beforeEach(() => calls.splice(0, calls.length));

  it('sends the original PDF bytes to the multimodal model and parses document-shaped results', async () => {
    const file = makePdf();
    const result = await analyzePdfDocument(file, 'test-key');
    expect(result.documentType).toBe('Resume');
    expect(result.sections[0].heading).toBe('Experience');
    expect(result.keyFacts[0].value).toBe('Excel');
    expect(calls).toHaveLength(1);
    const request = calls[0];
    expect(request.model).toBe(DOCUMENT_AI_MODEL);
    expect(request.contents[0].inlineData.mimeType).toBe('application/pdf');
    expect(request.contents[0].inlineData.data).toBe(btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))));
  });

  it('uses the original PDF again for grounded questions rather than a capped extracted-text string', async () => {
    const file = makePdf();
    const answer = await askPdfWithGemini(file, 'Which skills are listed?', 'test-key');
    expect(answer).toBe('Excel is listed.');
    expect(calls).toHaveLength(1);
    expect(calls[0].contents[0].inlineData.mimeType).toBe('application/pdf');
    expect(calls[0].contents[1].text).toContain('Which skills are listed?');
  });

  it('rejects missing keys and oversized PDFs before calling the provider', async () => {
    await expect(analyzePdfDocument(makePdf(), '')).rejects.toThrow(/Gemini API key/i);
    await expect(analyzePdfDocument(makePdf(10 * 1024 * 1024 + 1), 'test-key')).rejects.toThrow(/10 MB/i);
    expect(calls).toHaveLength(0);
  });
});
