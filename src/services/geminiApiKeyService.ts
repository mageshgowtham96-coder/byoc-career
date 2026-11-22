const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function validateGeminiApiKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('Enter your Gemini API key to activate BYOC.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(GEMINI_GENERATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word READY.' }] }],
        generationConfig: { maxOutputTokens: 8 }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Gemini API key was rejected or does not have permission to use this model.');
      }
      if (response.status === 429) {
        throw new Error('Gemini rate limit or quota reached. Check your Google AI Studio project and try again later.');
      }
      if (response.status >= 500) {
        throw new Error(`Gemini is temporarily unavailable (HTTP ${response.status}). Try again later.`);
      }
      throw new Error(`Gemini connection check failed (HTTP ${response.status}). Check the key and model access.`);
    }

    const payload: unknown = await response.json();
    const candidates = payload && typeof payload === 'object' && 'candidates' in payload
      ? (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates
      : undefined;
    const generatedText = candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();

    if (!generatedText) throw new Error('Gemini returned an empty response. The key could not be verified.');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini connection check timed out after 15 seconds.');
    }
    throw error instanceof Error ? error : new Error('Gemini connection check failed.');
  } finally {
    clearTimeout(timeout);
  }
}
