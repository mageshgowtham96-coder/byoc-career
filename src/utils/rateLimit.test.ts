import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordFailedAttempt, checkPassphraseLockout, resetPassphraseAttemptCounter, clearPassphraseLockout, exportAttemptState, getLockoutDescription } from './rateLimit';

describe('Passphrase Rate Limiting', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('byoc_passphrase_attempts');
    }
    vi.clearAllMocks();
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
      expect(result.attempts).toBe(4);
    });

    it('respects 30-minute sliding window cleanup', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now() - 45 * 60 * 1000, success: false },
            { timestamp: Date.now() - 45 * 60 * 1000, success: false }
          ])
        );
      }
      const result = recordFailedAttempt();
      expect(result.attempts).toBe(1);
    });

    it('calculates progressive delays correctly', () => {
      // 3 attempts → 30s
      for (let i = 0; i < 3; i++) recordFailedAttempt();
      let result = recordFailedAttempt();
      expect(result.delayMs).toBe(30000);

      // Clear and test 5 attempts → 2min
      clearPassphraseLockout();
      for (let i = 0; i < 5; i++) recordFailedAttempt();
      result = recordFailedAttempt();
      expect(result.delayMs).toBe(120000);

      // Clear and test 10 attempts → 15min
      clearPassphraseLockout();
      for (let i = 0; i < 10; i++) recordFailedAttempt();
      result = recordFailedAttempt();
      expect(result.delayMs).toBe(900000);

      // Clear and test 11 attempts → 1hr
      clearPassphraseLockout();
      for (let i = 0; i < 11; i++) recordFailedAttempt();
      result = recordFailedAttempt();
      expect(result.delayMs).toBe(3600000);
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
      expect(result.delayMs).toBe(0);
    });

    it('returns locked when 3+ failed attempts within cooldown', () => {
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
      const result = checkPassphraseLockout();
      expect(result.isLocked).toBe(true);
      expect(result.attemptsInWindow).toBe(3);
      expect(result.cooldownEndsAt).toBeDefined();
      expect(result.secondsRemaining).toBeGreaterThan(0);
      expect(result.delayMs).toBe(30000);
    });

    it('calculates correct seconds remaining', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        const fixedNow = Date.now();
        const oldTimestamp = fixedNow - 60000;
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: oldTimestamp, success: false },
            { timestamp: oldTimestamp, success: false },
            { timestamp: oldTimestamp, success: false }
          ])
        );
        // Mock Date.now for test
        const originalNow = global.Date.now;
        // @ts-expect-error testing only
        global.Date.now = () => fixedNow + 15000;
        try {
          const result = checkPassphraseLockout();
          expect(result.secondsRemaining).toBe(15);
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
      const originalWindow = global.window;
      global.window = undefined;
      try {
        const result = exportAttemptState();
        expect(result).toBeNull();
      } finally {
        global.window = originalWindow;
      }
    });
  });

  describe('getLockoutDescription', () => {
    it('returns descriptive text for different states', () => {
      // No attempts
      clearPassphraseLockout();
      expect(getLockoutDescription()).toBe('No failed attempts recorded.');

      // Below threshold
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'byoc_passphrase_attempts',
          JSON.stringify([
            { timestamp: Date.now(), success: false }
          ])
        );
      }
      expect(getLockoutDescription()).toContain('2 attempts remaining');

      // Locked
      clearPassphraseLockout();
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
      const desc = getLockoutDescription();
      expect(desc).toContain('Locked');
    });
  });
});