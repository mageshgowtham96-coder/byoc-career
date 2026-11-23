import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateGeminiApiKey } from './geminiApiKeyService';

describe('validateGeminiApiKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a blank key without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateGeminiApiKey('  ')).rejects.toThrow(/enter your Gemini API key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the key with a minimal Gemini generation request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'READY' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateGeminiApiKey('AIza-test-key')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-3.6-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('AIza-test-key');
    expect(init.body).toContain('Reply with the single word READY');
  });

  it('returns a clear authentication error without exposing the supplied key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'API key not valid. Please pass a valid API key.' }
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    let capturedError: unknown;
    try { await validateGeminiApiKey('AIza-private-value'); } catch (error) { capturedError = error; }
    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toMatch(/Gemini API key was rejected/i);
    expect((capturedError as Error).message).not.toContain('AIza-private-value');
  });

  it('rejects a successful HTTP response with no generated text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateGeminiApiKey('AIza-test-key')).rejects.toThrow(/empty response/i);
  });
});
