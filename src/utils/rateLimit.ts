/**
 * BYOC Passphrase Attempt Rate Limiting — Strengthened
 *
 * Purpose: Prevent rapid brute-force passphrase attempts on the local vault.
 * Strategy: 
 *   - Tracks failed attempts in localStorage with timestamps
 *   - Progressive delays: 3 failed attempts → 30s cooldown; 5 → 2min; 10 → 15min
 *   - Persists across refreshes and browser restarts (localStorage)
 *   - Emergency recovery phrase ALWAYS available regardless of lockout
 *   - Lockout applies ONLY to passphrase entry in UI, NOT to Recovery Phrase
 *
 * Security boundaries (client-side reality):
 *   - localStorage is NOT a strong security boundary — attacker with filesystem access can clear it
 *   - This is a usability barrier, not a cryptographic guarantee
 *   - The REAL security is AES-256-GCM encryption of the vault
 *   - Recovery phrase is the ultimate fail-safe; lockout NEVER blocks recovery
 *   - No plaintext passphrases stored anywhere
 */

const STORAGE_KEY = 'byoc_passphrase_attempts';
const MAX_ATTEMPTS_BEFORE_COOLDOWN = 3;

// Progressive delay tiers (milliseconds)
const COOLDOWN_TIERS = [
  { threshold: 3, delay: 30_000 },    // 3 attempts → 30 seconds
  { threshold: 5, delay: 120_000 },   // 5 attempts → 2 minutes
  { threshold: 10, delay: 900_000 },  // 10 attempts → 15 minutes
  { threshold: 11, delay: 3_600_000 } // 11+ attempts → 1 hour
];

const WINDOW_MS = 30 * 60 * 1000; // 30-minute sliding window for attempt tracking

/**
 * Calculate the current cooldown delay based on failed attempt count.
 */
function getCooldownDelay(failedCount: number): number {
  for (let index = COOLDOWN_TIERS.length - 1; index >= 0; index--) {
    const tier = COOLDOWN_TIERS[index];
    if (failedCount >= tier.threshold) {
      return tier.delay;
    }
  }
  return 0;
}

/**
 * Record a failed passphrase attempt in persistent storage.
 * Called from LocalAuthGate when decryption fails.
 */
export function recordFailedAttempt(): { 
  attempts: number; 
  cooldownEndsAt: number | null; 
  isLocked: boolean;
  nextAttemptAt: number | null;
  delayMs: number;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { attempts: 0, cooldownEndsAt: null, isLocked: false, nextAttemptAt: null, delayMs: 0 };
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
  const now = Date.now();
  attempts.push({ timestamp: now, success: false });

  // Keep only attempts within the sliding window
  const recentAttempts = attempts.filter(
    (a) => now - a.timestamp < WINDOW_MS
  );

  // Save recent attempts
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentAttempts));

  // Determine cooldown & lock state
  const failedAttempts = recentAttempts.filter((a) => !a.success);
  const failedCount = failedAttempts.length;
  
  let cooldownEndsAt: number | null = null;
  let isLocked = false;
  let nextAttemptAt: number | null = null;
  let delayMs = 0;

  if (failedCount >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
    // Calculate progressive delay
    delayMs = getCooldownDelay(failedCount);
    
    // Cooldown starts from the oldest attempt in the current tier
    const sortedFailed = [...failedAttempts].sort((a, b) => a.timestamp - b.timestamp);
    const oldestInTier = sortedFailed[sortedFailed.length - MAX_ATTEMPTS_BEFORE_COOLDOWN]?.timestamp || now;
    cooldownEndsAt = oldestInTier + delayMs;
    isLocked = now < cooldownEndsAt;
    nextAttemptAt = isLocked ? cooldownEndsAt : null;
  }

  return { 
    attempts: recentAttempts.length, 
    cooldownEndsAt, 
    isLocked, 
    nextAttemptAt,
    delayMs
  };
}

/**
 * Check whether the vault passphrase entry is currently locked out.
 * Returns { isLocked, cooldownEndsAt, secondsRemaining, attemptsInWindow, delayMs }.
 * Call BEFORE attempting decryption to show a friendly UI.
 */
export function checkPassphraseLockout(): { 
  isLocked: boolean; 
  cooldownEndsAt: number | null; 
  secondsRemaining: number; 
  attemptsInWindow: number;
  delayMs: number;
  maxDelayMs: number;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0, delayMs: 0, maxDelayMs: COOLDOWN_TIERS[COOLDOWN_TIERS.length - 1].delay };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0, delayMs: 0, maxDelayMs: COOLDOWN_TIERS[COOLDOWN_TIERS.length - 1].delay };
  }

  let attempts: { timestamp: number; success: boolean }[] = [];
  try {
    attempts = JSON.parse(raw);
  } catch {
    // Corrupted — treat as no lockout
    return { isLocked: false, cooldownEndsAt: null, secondsRemaining: 0, attemptsInWindow: 0, delayMs: 0, maxDelayMs: COOLDOWN_TIERS[COOLDOWN_TIERS.length - 1].delay };
  }

  // Count recent failed attempts (within sliding window)
  const now = Date.now();
  const recentAttempts = attempts.filter((a) => now - a.timestamp < WINDOW_MS);
  const failedAttempts = recentAttempts.filter((a) => !a.success);
  const failedCount = failedAttempts.length;

  // Determine cooldown end time
  let cooldownEndsAt: number | null = null;
  let isLocked = false;
  let delayMs = 0;

  if (failedCount >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
    delayMs = getCooldownDelay(failedCount);
    const sortedFailed = [...failedAttempts].sort((a, b) => a.timestamp - b.timestamp);
    const oldestInTier = sortedFailed[sortedFailed.length - MAX_ATTEMPTS_BEFORE_COOLDOWN]?.timestamp || now;
    cooldownEndsAt = oldestInTier + delayMs;
    isLocked = now < cooldownEndsAt;
  }

  const secondsRemaining = isLocked ? Math.ceil((cooldownEndsAt! - now) / 1000) : 0;

  return {
    isLocked,
    cooldownEndsAt,
    secondsRemaining,
    attemptsInWindow: failedCount,
    delayMs,
    maxDelayMs: COOLDOWN_TIERS[COOLDOWN_TIERS.length - 1].delay
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
 * Export the current attempt state for debugging.
 * Use: window.localStorage.getItem('byoc_passphrase_attempts')
 */
export function exportAttemptState(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

/**
 * Get a human-readable description of the current lockout state.
 */
export function getLockoutDescription(): string {
  const state = checkPassphraseLockout();
  
  if (!state.isLocked) {
    if (state.attemptsInWindow === 0) {
      return 'No failed attempts recorded.';
    }
    if (state.attemptsInWindow < MAX_ATTEMPTS_BEFORE_COOLDOWN) {
      const remaining = MAX_ATTEMPTS_BEFORE_COOLDOWN - state.attemptsInWindow;
      return `${remaining} attempt${remaining === 1 ? '' : 's'} remaining before cooldown.`;
    }
    return 'Cooldown active but expired. Next attempt allowed.';
  }

  const mins = Math.ceil(state.secondsRemaining / 60);
  if (mins < 1) {
    return `Locked for ${state.secondsRemaining} more seconds.`;
  }
  if (mins < 60) {
    return `Locked for ${mins} minute${mins === 1 ? '' : 's'}.`;
  }
  const hours = Math.ceil(mins / 60);
  return `Locked for ${hours} hour${hours === 1 ? '' : 's'}.`;
}
