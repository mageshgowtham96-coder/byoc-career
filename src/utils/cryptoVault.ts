/**
 * BYOC Cryptographic Secure Vault Engine (v4 + v3 backward compatibility)
 *
 * Standard Web Cryptography API implementation providing:
 * 1. AES-256-GCM authenticated encryption at rest.
 * 2. PBKDF2-HMAC-SHA256 key derivation with 600,000 iterations for user passphrases; recovery phrases use a separately recorded 100,000-iteration KDF because they are randomly generated high-entropy secrets.
 * 3. Cryptographically secure 128-bit random salts and 96-bit unique IVs.
 * 4. Random 256-bit Master Vault Key (MVK) wrapped separately by:
 *    - Passphrase-derived KEK (`passphraseWrappedVaultKey`)
 *    - High-entropy Emergency Recovery Phrase KEK (`wrappedVaultKey`)
 *    Enabling post-unlock re-encryption of mutations without retaining raw passphrases.
 * 5. Wrong-passphrase and ciphertext tamper detection.
 */

import type { CareerApplicationFormState, EmailInteraction } from '../types';

export const VAULT_STORAGE_KEY = 'byoc_secure_vault_envelope';
export const VAULT_PASSPHRASE_KDF_ITERATIONS = 600_000;
export const VAULT_RECOVERY_KDF_ITERATIONS = 100_000;
export const DEMO_WORKSPACE_NAME = 'alex mercer';
export const DEMO_WORKSPACE_EMAIL = 'alex.mercer@leaddev.io';

export function isDemoWorkspaceName(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === DEMO_WORKSPACE_NAME;
}

export function isDemoWorkspaceEmail(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === DEMO_WORKSPACE_EMAIL;
}

export function stripDemoWorkspaceName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return isDemoWorkspaceName(value) ? '' : value;
}

export function stripDemoWorkspaceEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return isDemoWorkspaceEmail(value) ? '' : value;
}

export function hasDemoWorkspaceIdentity(
  identity: { name?: unknown; email?: unknown } | null | undefined
): boolean {
  if (!identity || typeof identity !== 'object') return false;
  return isDemoWorkspaceName(identity.name) || isDemoWorkspaceEmail(identity.email);
}

export interface VaultEnvelope {
  version: 3 | 4 | 5;
  encrypted: true;
  kdf: {
    algorithm: 'PBKDF2';
    iterations: number;
    salt: string; // Base64 16 bytes
    hash: 'SHA-256';
  };
  iv: string; // Base64 12 bytes for payload ciphertext
  ciphertext: string; // Base64 AES-256-GCM ciphertext + 16-byte auth tag
  passphraseWrappedVaultKey?: string; // v4: 12-byte IV + AES-GCM wrapped MVK under passphrase KEK
  wrappedVaultKey?: string; // 12-byte IV + AES-GCM wrapped MVK under recovery KEK
  recoverySalt?: string; // Salt for recovery key derivation
  recoveryKdf?: { algorithm: 'PBKDF2'; iterations: number; hash: 'SHA-256' }; // v5: independent recovery phrase KDF parameters
  recoveryVerifier?: string; // SHA-256 hash of recovery token for quick validation
  meta: {
    id: string;
    name: string;
    email: string;
    biometricEnabled: boolean;
    biometricCredentialId?: string;
    updatedAt: string;
  };
}

export interface DecryptedVaultData {
  groqApiKey?: string;
  geminiApiKey?: string;
  masterResume: any | null;
  careerFormDraft?: CareerApplicationFormState | null;
  emailInteractions?: EmailInteraction[];
  jobs: any[];
  selectedJobId: string | null;
  tailoredArtifacts: Record<string, any>;
  applications: any[];
  unsavedQueue: any[];
  candidatePreferences: any;
}

interface ActiveVaultSession {
  mvk: CryptoKey;
  kdf: VaultEnvelope['kdf'];
  passphraseWrappedVaultKey: string;
  wrappedVaultKey?: string;
  recoverySalt?: string;
  recoveryVerifier?: string;
  recoveryKdf?: VaultEnvelope['recoveryKdf'];
}

// Volatile memory-only vault session handle (never persisted to disk)
let activeVaultSession: ActiveVaultSession | null = null;

function getSubtleCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Cryptography API is unavailable in this environment.');
}

export function hasActiveVaultKey(): boolean {
  return activeVaultSession !== null;
}

export function lockVaultSession(): void {
  activeVaultSession = null;
}

// Utility: ArrayBuffer <-> Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isValidVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<VaultEnvelope>;
  return (
    (v.version === 3 || v.version === 4 || v.version === 5) &&
    v.encrypted === true &&
    Boolean(v.kdf?.salt) &&
    v.kdf?.algorithm === 'PBKDF2' &&
    Number.isInteger(v.kdf?.iterations) && (v.kdf?.iterations ?? 0) >= 100000 && (v.kdf?.iterations ?? 0) <= 600000 &&
    (v.version !== 5 || (v.recoveryKdf?.algorithm === 'PBKDF2' && Number.isInteger(v.recoveryKdf.iterations) && v.recoveryKdf.iterations >= 100000 && v.recoveryKdf.iterations <= 600000)) &&
    typeof v.iv === 'string' &&
    typeof v.ciphertext === 'string' &&
    Boolean(v.meta?.id)
  );
}

export function sanitizeVaultMeta(meta: VaultEnvelope['meta']): VaultEnvelope['meta'] {
  return {
    ...meta,
    name: stripDemoWorkspaceName(meta.name),
    email: stripDemoWorkspaceEmail(meta.email)
  };
}

export function readStoredVaultEnvelope(storageKey: string = VAULT_STORAGE_KEY): VaultEnvelope | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidVaultEnvelope(parsed)) return null;
    return hasDemoWorkspaceIdentity(parsed.meta)
      ? { ...parsed, meta: sanitizeVaultMeta(parsed.meta) }
      : parsed;
  } catch {
    return null;
  }
}

export function writeStoredVaultEnvelope(
  envelope: VaultEnvelope,
  storageKey: string = VAULT_STORAGE_KEY
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('LocalStorage unavailable for persisting encrypted vault.');
  }
  const sanitizedEnvelope: VaultEnvelope = hasDemoWorkspaceIdentity(envelope.meta)
    ? { ...envelope, meta: sanitizeVaultMeta(envelope.meta) }
    : envelope;
  const serialized = JSON.stringify(sanitizedEnvelope);
  window.localStorage.setItem(storageKey, serialized);
  const verify = window.localStorage.getItem(storageKey);
  if (!verify) {
    throw new Error('Encrypted vault write verification failed.');
  }
  return true;
}

export type VaultEnvelopeMetaCleanResult =
  | { status: 'none' }
  | { status: 'clean'; envelope: VaultEnvelope }
  | { status: 'updated'; envelope: VaultEnvelope }
  | { status: 'error'; envelope: VaultEnvelope; error: string };

/**
 * Removes demo workspace identity from persisted encrypted vault envelope metadata
 * while preserving the workspace ID and all encrypted ciphertext/key-wrapping fields.
 * Reports success only after verifying the updated envelope was saved.
 */
export function sanitizeStoredVaultEnvelopeMetadata(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof window !== 'undefined' ? window.localStorage : undefined,
  storageKey: string = VAULT_STORAGE_KEY
): VaultEnvelopeMetaCleanResult {
  if (!storage) {
    return { status: 'none' };
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { status: 'none' };
    }
    const parsed = JSON.parse(raw);
    if (!isValidVaultEnvelope(parsed)) {
      return { status: 'none' };
    }
    if (!hasDemoWorkspaceIdentity(parsed.meta)) {
      return { status: 'clean', envelope: parsed };
    }

    const updatedEnvelope: VaultEnvelope = {
      ...parsed,
      meta: sanitizeVaultMeta(parsed.meta)
    };

    storage.setItem(storageKey, JSON.stringify(updatedEnvelope));
    const verifyRaw = storage.getItem(storageKey);
    if (!verifyRaw) {
      return {
        status: 'error',
        envelope: updatedEnvelope,
        error: 'Encrypted vault envelope verification failed after metadata update.'
      };
    }

    const verifyParsed = JSON.parse(verifyRaw);
    const verified =
      isValidVaultEnvelope(verifyParsed) &&
      verifyParsed.meta.id === parsed.meta.id &&
      verifyParsed.ciphertext === parsed.ciphertext &&
      verifyParsed.iv === parsed.iv &&
      !hasDemoWorkspaceIdentity(verifyParsed.meta);

    if (!verified) {
      return {
        status: 'error',
        envelope: updatedEnvelope,
        error: 'Persisted encrypted vault metadata did not match sanitized verification check.'
      };
    }

    return { status: 'updated', envelope: verifyParsed };
  } catch (err: unknown) {
    return {
      status: 'error',
      envelope: {
        version: 4,
        encrypted: true,
        kdf: { algorithm: 'PBKDF2', iterations: VAULT_PASSPHRASE_KDF_ITERATIONS, salt: '', hash: 'SHA-256' },
        recoveryKdf: { algorithm: 'PBKDF2', iterations: VAULT_RECOVERY_KDF_ITERATIONS, hash: 'SHA-256' },
        iv: '',
        ciphertext: '',
        meta: { id: '', name: '', email: '', biometricEnabled: false, updatedAt: '' }
      },
      error: err instanceof Error ? err.message : 'Failed to sanitize encrypted vault envelope metadata.'
    };
  }
}

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (KEK) using the iteration count recorded in the envelope
 */
export async function deriveVaultKey(
  passphrase: string,
  saltBytes: Uint8Array,
  iterations: number = VAULT_PASSPHRASE_KDF_ITERATIONS
): Promise<CryptoKey> {
  const webCrypto = getSubtleCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return webCrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates an unambiguous Base32 Emergency Recovery Phrase (e.g. BYOC-XXXX-XXXX-XXXX-XXXX)
 */
export function generateRecoveryPhrase(): string {
  const webCrypto = getSubtleCrypto();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  let token = 'BYOC';
  for (let i = 0; i < 4; i++) {
    let group = '-';
    for (let j = 0; j < 4; j++) {
      group += chars[bytes[i * 4 + j] % chars.length];
    }
    token += group;
  }
  return token;
}

/**
 * Hashes a string with SHA-256 (used for non-reversible recovery phrase validation)
 */
export async function sha256Hex(text: string): Promise<string> {
  const webCrypto = getSubtleCrypto();
  const enc = new TextEncoder();
  const hashBuffer = await webCrypto.subtle.digest('SHA-256', enc.encode(text.trim()));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function wrapRawMasterKey(
  rawMasterKey: ArrayBuffer,
  wrappingKey: CryptoKey
): Promise<string> {
  const webCrypto = getSubtleCrypto();
  const wrapIV = new Uint8Array(12);
  webCrypto.getRandomValues(wrapIV);
  const wrappedBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIV },
    wrappingKey,
    rawMasterKey
  );
  const packed = new Uint8Array(wrapIV.length + wrappedBuffer.byteLength);
  packed.set(wrapIV, 0);
  packed.set(new Uint8Array(wrappedBuffer), wrapIV.length);
  return bufferToBase64(packed);
}

async function unwrapRawMasterKey(
  packedBase64: string,
  unwrappingKey: CryptoKey
): Promise<ArrayBuffer> {
  const webCrypto = getSubtleCrypto();
  const packed = base64ToBuffer(packedBase64);
  if (packed.byteLength <= 12) {
    throw new Error('Corrupted wrapped vault key length.');
  }
  const iv = new Uint8Array(packed.buffer, packed.byteOffset, 12);
  const wrappedBytes = new Uint8Array(packed.buffer, packed.byteOffset + 12, packed.byteLength - 12);
  return webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    unwrappingKey,
    wrappedBytes as BufferSource
  );
}

/**
 * Encrypts vault payload with a fresh 256-bit Master Vault Key (MVK),
 * wrapped separately under both the user's Passphrase KEK and Emergency Recovery KEK.
 * Retains MVK in volatile memory for automatic session mutation syncing.
 */
export async function encryptVault(
  data: DecryptedVaultData,
  passphrase: string,
  meta: VaultEnvelope['meta'],
  recoveryPhrase?: string
): Promise<{ envelope: VaultEnvelope; generatedRecoveryPhrase?: string }> {
  const webCrypto = getSubtleCrypto();

  // 1. Generate random 256-bit Master Vault Key (MVK)
  const mvk = await webCrypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawMvk = await webCrypto.subtle.exportKey('raw', mvk);

  // 2. Wrap MVK under passphrase-derived KEK
  const salt = new Uint8Array(16);
  webCrypto.getRandomValues(salt);
  const passphraseKek = await deriveVaultKey(passphrase, salt, VAULT_PASSPHRASE_KDF_ITERATIONS);
  const passphraseWrappedVaultKey = await wrapRawMasterKey(rawMvk, passphraseKek);

  // 3. Wrap MVK under recovery-phrase-derived KEK
  const activeRecoveryPhrase = (recoveryPhrase || generateRecoveryPhrase()).trim().toUpperCase();
  const recoverySalt = new Uint8Array(16);
  webCrypto.getRandomValues(recoverySalt);
  const recoveryKek = await deriveVaultKey(activeRecoveryPhrase, recoverySalt, VAULT_RECOVERY_KDF_ITERATIONS);
  const wrappedVaultKey = await wrapRawMasterKey(rawMvk, recoveryKek);
  const recoveryVerifier = await sha256Hex(activeRecoveryPhrase);

  // 4. Encrypt payload directly with MVK + unique 96-bit IV
  const iv = new Uint8Array(12);
  webCrypto.getRandomValues(iv);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(data));
  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    mvk,
    encodedPayload
  );

  const kdf: VaultEnvelope['kdf'] = {
    algorithm: 'PBKDF2',
    iterations: VAULT_PASSPHRASE_KDF_ITERATIONS,
    salt: bufferToBase64(salt),
    hash: 'SHA-256'
  };

  const envelope: VaultEnvelope = {
    version: 5,
    encrypted: true,
    kdf,
    recoveryKdf: { algorithm: 'PBKDF2', iterations: VAULT_RECOVERY_KDF_ITERATIONS, hash: 'SHA-256' },
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    passphraseWrappedVaultKey,
    wrappedVaultKey,
    recoverySalt: bufferToBase64(recoverySalt),
    recoveryVerifier,
    meta: {
      ...sanitizeVaultMeta(meta),
      updatedAt: new Date().toISOString()
    }
  };

  activeVaultSession = {
    mvk,
    kdf,
    passphraseWrappedVaultKey,
    wrappedVaultKey,
    recoverySalt: envelope.recoverySalt,
    recoveryVerifier,
    recoveryKdf: envelope.recoveryKdf
  };

  return {
    envelope,
    generatedRecoveryPhrase: recoveryPhrase ? undefined : activeRecoveryPhrase
  };
}

/**
 * Decrypts a v3, v4 or v5 VaultEnvelope with the user's passphrase and establishes
 * the volatile in-memory MVK session for subsequent store writes.
 */
export async function decryptVault(
  envelope: VaultEnvelope,
  passphrase: string
): Promise<DecryptedVaultData> {
  const webCrypto = getSubtleCrypto();
  if (!isValidVaultEnvelope(envelope)) {
    throw new Error('Unsupported or corrupted vault envelope format.');
  }

  const saltBytes = base64ToBuffer(envelope.kdf.salt);
  const ivBytes = base64ToBuffer(envelope.iv);
  const ciphertextBytes = base64ToBuffer(envelope.ciphertext);
  const passphraseKek = await deriveVaultKey(passphrase, saltBytes, envelope.kdf.iterations);

  try {
    let mvk: CryptoKey;
    let passphraseWrappedVaultKey = envelope.passphraseWrappedVaultKey;

    if ((envelope.version === 4 || envelope.version === 5) && envelope.passphraseWrappedVaultKey) {
      const rawMvk = await unwrapRawMasterKey(envelope.passphraseWrappedVaultKey, passphraseKek);
      mvk = await webCrypto.subtle.importKey(
        'raw',
        rawMvk,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );
    } else {
      // Legacy v3: passphrase-derived key directly encrypted the ciphertext AND was wrapped by recovery key
      mvk = passphraseKek;
      const rawV3Key = await webCrypto.subtle.exportKey('raw', passphraseKek);
      passphraseWrappedVaultKey = await wrapRawMasterKey(rawV3Key, passphraseKek);
    }

    const decryptedBuffer = await webCrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as BufferSource },
      mvk,
      ciphertextBytes as BufferSource
    );

    const parsed = JSON.parse(new TextDecoder().decode(decryptedBuffer)) as DecryptedVaultData;

    // Versioned upgrade: after a successful legacy unlock, re-wrap the same MVK
    // with a stronger passphrase KDF. The existing recovery wrapper remains
    // compatible and carries its own KDF parameters in the v5 envelope.
    let activeKdf = envelope.kdf;
    if (envelope.kdf.iterations < VAULT_PASSPHRASE_KDF_ITERATIONS) {
      const rawMvk = await webCrypto.subtle.exportKey('raw', mvk);
      const upgradedSalt = new Uint8Array(16);
      webCrypto.getRandomValues(upgradedSalt);
      const upgradedKek = await deriveVaultKey(passphrase, upgradedSalt, VAULT_PASSPHRASE_KDF_ITERATIONS);
      passphraseWrappedVaultKey = await wrapRawMasterKey(rawMvk, upgradedKek);
      activeKdf = {
        algorithm: 'PBKDF2',
        iterations: VAULT_PASSPHRASE_KDF_ITERATIONS,
        salt: bufferToBase64(upgradedSalt),
        hash: 'SHA-256'
      };
    }
    const activeRecoveryKdf = envelope.recoveryKdf || {
      algorithm: 'PBKDF2' as const,
      iterations: envelope.kdf.iterations,
      hash: 'SHA-256' as const
    };

    activeVaultSession = {
      mvk,
      kdf: activeKdf,
      passphraseWrappedVaultKey: passphraseWrappedVaultKey!,
      wrappedVaultKey: envelope.wrappedVaultKey,
      recoverySalt: envelope.recoverySalt,
      recoveryVerifier: envelope.recoveryVerifier,
      recoveryKdf: activeRecoveryKdf
    };

    return parsed;
  } catch {
    throw new Error('Invalid vault passphrase or corrupted ciphertext.');
  }
}

/**
 * Recovers vault contents using the Emergency Recovery Phrase (supports v3, v4 and v5)
 * and establishes the active MVK session.
 */
export async function recoverVaultWithSecret(
  envelope: VaultEnvelope,
  recoveryPhrase: string
): Promise<DecryptedVaultData> {
  const webCrypto = getSubtleCrypto();
  if (!isValidVaultEnvelope(envelope) || !envelope.wrappedVaultKey || !envelope.recoverySalt) {
    throw new Error('This vault does not have emergency key wrapping enabled.');
  }

  const cleanPhrase = recoveryPhrase.trim().toUpperCase();
  const phraseHash = await sha256Hex(cleanPhrase);

  if (envelope.recoveryVerifier && envelope.recoveryVerifier !== phraseHash) {
    throw new Error('Invalid emergency recovery phrase.');
  }

  const recoverySaltBytes = base64ToBuffer(envelope.recoverySalt);
  const recoveryKek = await deriveVaultKey(cleanPhrase, recoverySaltBytes, envelope.recoveryKdf?.iterations ?? envelope.kdf.iterations);

  let rawMvk: ArrayBuffer;
  try {
    rawMvk = await unwrapRawMasterKey(envelope.wrappedVaultKey, recoveryKek);
  } catch {
    throw new Error('Recovery phrase verification failed during key unwrapping.');
  }

  const mvk = await webCrypto.subtle.importKey(
    'raw',
    rawMvk,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );

  const ivBytes = base64ToBuffer(envelope.iv);
  const ciphertextBytes = base64ToBuffer(envelope.ciphertext);

  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    mvk,
    ciphertextBytes as BufferSource
  );

  const parsed = JSON.parse(new TextDecoder().decode(decryptedBuffer)) as DecryptedVaultData;

  activeVaultSession = {
    mvk,
    kdf: envelope.kdf,
    passphraseWrappedVaultKey: envelope.passphraseWrappedVaultKey || '',
    wrappedVaultKey: envelope.wrappedVaultKey,
    recoverySalt: envelope.recoverySalt,
    recoveryVerifier: envelope.recoveryVerifier,
    recoveryKdf: envelope.recoveryKdf || { algorithm: 'PBKDF2', iterations: envelope.kdf.iterations, hash: 'SHA-256' }
  };

  return parsed;
}

/**
 * Re-encrypts updated vault payload using the retained in-memory Master Vault Key (MVK)
 * and a fresh unique 96-bit IV. Fails closed if the vault is locked.
 */
export async function syncUnlockedVault(
  data: DecryptedVaultData,
  meta: VaultEnvelope['meta']
): Promise<VaultEnvelope> {
  if (!activeVaultSession) {
    throw new Error('Vault session is locked. Unlock with passphrase before persisting.');
  }
  const webCrypto = getSubtleCrypto();

  const iv = new Uint8Array(12);
  webCrypto.getRandomValues(iv);
  const encodedPayload = new TextEncoder().encode(JSON.stringify(data));
  const ciphertextBuffer = await webCrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    activeVaultSession.mvk,
    encodedPayload
  );

  return {
    version: 5,
    encrypted: true,
    kdf: activeVaultSession.kdf,
    recoveryKdf: activeVaultSession.recoveryKdf || { algorithm: 'PBKDF2', iterations: activeVaultSession.kdf.iterations, hash: 'SHA-256' },
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    passphraseWrappedVaultKey: activeVaultSession.passphraseWrappedVaultKey,
    wrappedVaultKey: activeVaultSession.wrappedVaultKey,
    recoverySalt: activeVaultSession.recoverySalt,
    recoveryVerifier: activeVaultSession.recoveryVerifier,
    meta: {
      ...sanitizeVaultMeta(meta),
      updatedAt: new Date().toISOString()
    }
  };
}

/**
 * Decrypts a VaultEnvelope using the active volatile Master Vault Key (MVK)
 * to confirm ciphertext integrity and payload restorability without extra PBKDF2 work.
 */
export async function decryptActiveSessionEnvelope(
  envelope: VaultEnvelope
): Promise<DecryptedVaultData> {
  if (!activeVaultSession) {
    throw new Error('Vault session is locked; cannot verify encrypted payload restoration.');
  }
  if (!isValidVaultEnvelope(envelope)) {
    throw new Error('Stored vault envelope failed structural validation.');
  }
  const webCrypto = getSubtleCrypto();
  const ivBytes = base64ToBuffer(envelope.iv);
  const ciphertextBytes = base64ToBuffer(envelope.ciphertext);
  const decryptedBuffer = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    activeVaultSession.mvk,
    ciphertextBytes as BufferSource
  );
  return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as DecryptedVaultData;
}

/**
 * Reads back the persisted encrypted vault envelope from storage, decrypts it with
 * the active MVK, and verifies that the restored payload satisfies the optional predicate.
 */
export async function verifyActiveSessionEnvelopeRestorable(
  predicate?: (data: DecryptedVaultData) => boolean,
  storageKey: string = VAULT_STORAGE_KEY
): Promise<DecryptedVaultData> {
  const stored = readStoredVaultEnvelope(storageKey);
  if (!stored) {
    throw new Error('Encrypted vault envelope could not be read back from local storage.');
  }
  const restored = await decryptActiveSessionEnvelope(stored);
  if (predicate && !predicate(restored)) {
    throw new Error('Restored encrypted vault payload verification failed.');
  }
  return restored;
}

