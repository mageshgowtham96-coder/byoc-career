import { describe, expect, it } from 'vitest';
import { getGroqRetryDelayMs, isRetryableGroqStatus } from './groqService';

describe('Groq retry policy', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])('classifies %s as potentially transient', (status) => {
    expect(isRetryableGroqStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent status %s', (status) => {
    expect(isRetryableGroqStatus(status)).toBe(false);
    expect(getGroqRetryDelayMs(status, '1', 1)).toBeNull();
  });

  it('honors a short Retry-After for 429', () => {
    expect(getGroqRetryDelayMs(429, '2', 1)).toBe(2000);
  });

  it('does not blindly retry a 429 without Retry-After or after a long quota delay', () => {
    expect(getGroqRetryDelayMs(429, null, 1)).toBeNull();
    expect(getGroqRetryDelayMs(429, '60', 1)).toBeNull();
  });

  it('uses bounded exponential backoff with jitter for transient server failures', () => {
    expect(getGroqRetryDelayMs(503, null, 1, 0)).toBe(400);
    expect(getGroqRetryDelayMs(503, null, 1, 1)).toBe(600);
    expect(getGroqRetryDelayMs(503, null, 2, 0)).toBe(800);
  });
});
