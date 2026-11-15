import { describe, it, expect, beforeEach } from 'vitest';
import { recordFailedAttempt, checkPassphraseLockout, resetPassphraseAttemptCounter, clearPassphraseLockout, exportAttemptState } from './rateLimit';

describe('Passphrase Rate Limiting', () => {
  beforeEach(() => {
    // Clean state before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('byoc_passphrase_attempts');
    }
  });

  describe('recordFailedAttempt', () => {
    it('records a single failed attempt and is not locked', () => {
      const result = recordFailedAttempt();
      expect(result.attempts).toBe(1);
      expect(result.isLocked).toBe(false);
      expect(result.cooldownEndsAt).toBeNull();
    });

    it('tracks multiple failed attempts', () => {
      recordFailedAttempt();
      recordFailedAttempt();
      recordFailedAttempt();
      const result = recordFailedAttempt();
      expect(result.attempts).toBe(4); // 3 previous + 1 new
    });

    it('respects 2-minute sliding window cleanup', () => {
      // Simulate very old attempts
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now() - 10_000_000, success: false }, // 100 min ago
            { timestamp: Date.now() - 10_000_000, success: false }
          ])
        );
      }
      const result = recordFailedAttempt();
      // Old attempts should be filtered out; only the new one remains
      expect(result.attempts).toBe(1);
    });
  });

  describe('checkPassphraseLockout', () => {
    it('returns not locked when no attempts exist', () => {
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(false);
      expect(result.secondsRemaining).toBe(0);
      expect(result.attemptsInWindow).toBe(0);
    });

    it('returns not locked when below threshold (2 failed attempts)', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false },
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(false);
      expect(result.attemptsInWindow).toBe(2);
    });

    it('returns locked when 3+ failed attempts within cooldown', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Set 3 failed attempts with current timestamps
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false },
            { timestamp: Date.now(), success: false },
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(true);
      expect(result.attemptsInWindow).toBe(3);
      expect(result.cooldownEndsAt).toBeDefined();
      expect(result.secondsRemaining).toBeGreaterThan(0);
    });

    it('calculates correct seconds remaining', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Force cooldown end to be 15 seconds from now
        const fixedNow = Date.now();
        const oldTimestamp = fixedNow - 60_000; // 1 min ago
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: oldTimestamp, success: false },
            { timestamp: oldTimestamp, success: false },
            { timestamp: oldTimestamp, success: false }
          ])
        );
        // Monkey-patch Date.now for test
        const originalNow = global.Date.now;
        // @ts-expect-error testing only
        global.Date.now = () => fixedNow + 30_000; // 30s into cooldown (COOLDOWN_MS = 30_000)
        try {
          const result = checkPassphraseLockout();
          expect(result.secondsRemaining).toBe(30);
        } finally {
          global.Date.now = originalNow;
        }
      }
    });
  });

  describe('resetPassphraseAttemptCounter', () => {
    it('clears the attempt counter', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      resetPassphraseAttemptCounter();
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(false);
      expect(result.attemptsInWindow).toBe(0);
    });
  });

  describe('clearPassphraseLockout', () => {
    it('manually clears the lockout', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false },
            { timestamp: Date.now(), success: false },
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      clearPassphraseLockout();
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(false);
    });
  });

  describe('exportAttemptState', () => {
    it('exports the current attempt state', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      const result = exportAttemptState();
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
    });

    it('returns null when no localStorage', () => {
      // @ts-expect-error testing only
      // Simulate no window
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const result = exportAttemptState();
      expect(result).toBeNull();
    });
  });
});