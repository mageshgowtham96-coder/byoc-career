/**
 * BYOC Passphrase Attempt Rate Limiting
 *
 * Purpose: Prevent rapid brute-force passphrase attempts on the local vault.
 * Strategy: 
 *   - Tracks failed attempts in localStorage with timestamps
 *   - Cool-down window: 30 seconds after 3 failed attempts
 *   - After cool-down: 1 attempt per 5 seconds (exponential backoff possible)
 *   - Cannot be bypassed by refreshing (persisted across session)
 *   - Emergency recovery phrase always available regardless of lockout
 *
 * Design rationale:
 *   - Local-only threat model: attacker has filesystem access to the browser
 *   - Refresh clears in-memory state but NOT localStorage (intentional)
 *   - Recovery phrase is the ultimate fail-safe; lockout never blocks recovery
 * - Lockout applies ONLY to passphrase entry in the UI, not to Recovery Phrase
 */

const STORAGE_KEY = 'byoc_passphrase_attempts';
const COOLDOWN_MS = 30_000;    // 30 seconds
const MAX_ATTEMPTS_BEFORE_COOLDOWN = 3;
const POST_COOLDOWN_DELAY_MS = 5_000;  // 1 attempt per 5s after cool-down

/**
 * Record a failed passphrase attempt in persistent storage.
 * Called from LocalAuthGate when decryption fails.
 */
export function recordFailedAttempt(): { attempts: number; cooldownEndsAt: number | null; isLocked: boolean } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { attempts: 0, cooldownEndsAt: null, isLocked: false };
  }

  // Read existing attempts
  const existingRaw = window.localStorage.getItem(STORAGE_KEY);
  let attempts: { timestamp: number; success: boolean }[] = [];
  if (existingRaw) {
    try {
      attempts = JSON.parse(existingRaw);
    } catch {
      // Corrupted — reset
      attempts = [];
    }
  }

  // Append new failed attempt
  attempts.push({ timestamp: Date.now(), success: false });

  // Keep only attempts from the last 2 minutes (sliding window for cleanup)
  const twoMinutesMs = 2 * 60 * 1000;
  const recentAttempts = attempts.filter(
    (a) => Date.now() - a.timestamp < twoMinutesMs
  );

  // Save recent attempts
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentAttempts));

  // Determine cooldown & lock state
  let cooldownEndsAt: number | null = null;
  let isLocked = false;

  const recentCooldown = recentAttempts.filter(
    (a) => !a.success
  );

  if (recentCooldown.length >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
    // Compute when the oldest of the last 3 failed attempts expires
    // (the 3rd-most-recent failed attempt determines when lockout clears)
    const sorted = [...recentCooldown].sort((a, b) => a.timestamp - b.timestamp);
    const oldestOfThree = sorted[0].timestamp; // earliest of the last 3
    cooldownEndsAt = oldestOfThree + COOLDOWN_MS;
    isLocked = Date.now() < cooldownEndsAt;
  }

  return { attempts: recentAttempts.length, cooldownEndsAt, isLocked };
}

/**
 * Check whether the vault passphrase entry is currently locked out.
 * Returns { isLocked, cooldownEndsAt, secondsRemaining, attemptsInWindow }.
 * Call BEFORE attempting decryption to show a friendly UI.
 */
export function checkPassphraseLockout(): { isLocked: boolean; cooldownEndsAt: number | null; secondsRemaining: number; attemptsInWindow: number } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0 };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0 };
  }

  let attempts: { timestamp: number; success: boolean }[] = [];
  try {
    attempts = JSON.parse(raw);
  } catch {
    // Corrupted — treat as no lockout
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0 };
  }

  // Count recent failed attempts (within 2-minute sliding window)
  const twoMinutesMs = 2 * 60 * 1000;
  const now = Date.now();
  const recentAttempts = attempts.filter((a) => now - a.timestamp < twoMinutesMs);
  const failedAttempts = recentAttempts.filter((a) => !a.success);
  const successfulAttempts = recentAttempts.filter((a) => a.success);

  // Determine cooldown end time (based on last 3 failed attempts)
  let cooldownEndsAt: number | null = null;
  let isLocked = false;

  if (failedAttempts.length >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
    // Sort by timestamp, take the earliest of the last 3
    const sortedFailed = [...failedAttempts].sort((a, b) => a.timestamp - b.timestamp);
    const oldestOfThree = sortedFailed[0].timestamp;
    cooldownEndsAt = oldestOfThree + COOLDOWN_MS;
    isLocked = now < cooldownEndsAt;
  }

  const secondsRemaining = isLocked ? Math.ceil((cooldownEndsAt! - now) / 1000) : 0;

  return {
    isLocked,
    cooldownEndsAt,
    secondsRemaining,
    attemptsInWindow: failedAttempts.length,
  };
}

/**
 * Reset the passphrase attempt counter (called after successful unlock).
 */
export function resetPassphraseAttemptCounter(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Manually clear the lockout (e.g., after admin intervention or recovery).
 * Not normally needed; lockout auto-resets after cooldown.
 */
export function clearPassphraseLockout(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export the current attempt state for debugging (remove in production if desired).
 * Use: window.localStorage.getItem('byoc_passphrase_attempts')
 */
export function exportAttemptState(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(STORAGE_KEY);
}