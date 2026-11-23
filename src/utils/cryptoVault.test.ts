import { createHash } from 'node:crypto';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  VAULT_STORAGE_KEY,
  encryptVault,
  decryptVault,
  recoverVaultWithSecret,
  syncUnlockedVault,
  lockVaultSession,
  hasActiveVaultKey,
  deriveVaultKey,
  bufferToBase64,
  sha256Hex,
  sanitizeStoredVaultEnvelopeMetadata,
  writeStoredVaultEnvelope,
  readStoredVaultEnvelope,
  shouldPreferLocalVaultEnvelope,
  isValidVaultEnvelope,
  hasDemoWorkspaceIdentity,
  stripDemoWorkspaceName,
  stripDemoWorkspaceEmail,
  type DecryptedVaultData,
  type VaultEnvelope
} from './cryptoVault';
import {
  CAREER_FORM_DRAFT_KEY,
  WORKSPACE_STORE_KEY,
  extractLegacyPlaintextFromRawStore,
  mergeLegacyIntoDecryptedVault,
  mergeWorkspaceStoreState,
  migrateLegacyCareerFormDraft,
  migrateWorkspaceStoreState,
  sanitizeStoredWorkspaceStoreMetadata,
  scrubAndVerifyStoredWorkspace,
  scrubPlaintextWorkspaceStore
} from './vaultMigration';
import {
  DEFAULT_PORTAL_SHORTCUTS,
  LiveJobSearchEngine,
  buildPortalShortcutUrl,
  calculateHonestMatch,
  isWorldwideCountryCode,
  mergePortalShortcuts,
  sanitizeExternalHttpUrl
} from '../services/jobSearchService';
import { buildApplicationSnapshotRecord } from '../store/useWizardStore';
import { GeminiApiError, formatGeminiError } from '../services/geminiCareerService';

import type { MasterResume, JobPosting, TailoredArtifact, ApplicationRecord, ExperienceItem } from '../types';

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); })
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(global, 'window', { value: { localStorage: localStorageMock }, writable: true });

// Mock crypto.subtle for environments without Web Crypto
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({}),
    exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    importKey: vi.fn().mockResolvedValue({}),
    deriveKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
    decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(50)),
    digest: vi.fn(async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const hash = createHash('sha256').update(Buffer.from(data as Uint8Array)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer;
    }),
  },
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  })
};

Object.defineProperty(global, 'crypto', { value: mockCrypto, writable: true });

describe('Crypto Vault Core', () => {
  it('does not let a stale localStorage envelope overwrite a newer IndexedDB envelope', () => {
    const baseEnvelope: VaultEnvelope = {
      version: 5,
      encrypted: true,
      kdf: { algorithm: 'PBKDF2', iterations: 100000, salt: 'c2FsdA==', hash: 'SHA-256' },
      recoveryKdf: { algorithm: 'PBKDF2', iterations: 100000, hash: 'SHA-256' },
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVydGV4dA==',
      meta: { id: 'timestamp-user', name: 'Timestamp User', email: 'time@example.com', biometricEnabled: false, updatedAt: '2026-11-19T10:00:00.000Z' }
    };
    const newerIndexedDb = { ...baseEnvelope, meta: { ...baseEnvelope.meta, updatedAt: '2026-11-20T10:00:00.000Z' } };
    const newerLocal = { ...baseEnvelope, meta: { ...baseEnvelope.meta, updatedAt: '2026-11-21T10:00:00.000Z' } };
    expect(shouldPreferLocalVaultEnvelope(baseEnvelope, newerIndexedDb)).toBe(false);
    expect(shouldPreferLocalVaultEnvelope(newerLocal, baseEnvelope)).toBe(true);
    expect(shouldPreferLocalVaultEnvelope(baseEnvelope, null)).toBe(true);
  });

  it('awaits and verifies the localStorage fallback when IndexedDB is unavailable', async () => {
    const envelope: VaultEnvelope = {
      version: 5,
      encrypted: true,
      kdf: { algorithm: 'PBKDF2', iterations: 100000, salt: 'c2FsdA==', hash: 'SHA-256' },
      recoveryKdf: { algorithm: 'PBKDF2', iterations: 100000, hash: 'SHA-256' },
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVydGV4dA==',
      meta: { id: 'fallback-user', name: 'Fallback User', email: 'fallback@example.com', biometricEnabled: false, updatedAt: new Date().toISOString() }
    };
    await expect(writeStoredVaultEnvelope(envelope, 'byoc-vault-fallback-test')).resolves.toBe(true);
    expect(readStoredVaultEnvelope('byoc-vault-fallback-test')).toEqual(envelope);
    expect(localStorageMock.getItem('byoc-vault-fallback-test')).toBe(JSON.stringify(envelope));
  });

  it('continues to accept legacy v3/v4 vault envelopes while requiring separate recovery KDF metadata for v5', () => {
    const base = {
      encrypted: true as const,
      kdf: { algorithm: 'PBKDF2' as const, iterations: 100000, salt: 'c2FsdA==', hash: 'SHA-256' as const },
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVydGV4dA==',
      meta: { id: 'user-1', name: 'Test User', email: 'test@example.com', biometricEnabled: false, updatedAt: '' }
    };
    expect(isValidVaultEnvelope({ ...base, version: 3 })).toBe(true);
    expect(isValidVaultEnvelope({ ...base, version: 4, passphraseWrappedVaultKey: 'wrapped' })).toBe(true);
    expect(isValidVaultEnvelope({
      ...base, version: 5,
      recoveryKdf: { algorithm: 'PBKDF2', iterations: 100000, hash: 'SHA-256' }
    })).toBe(true);
    expect(isValidVaultEnvelope({ ...base, version: 5 })).toBe(false);
  });


  it('opens a legacy v4 vault and upgrades its passphrase wrapper without changing career data', async () => {
    lockVaultSession();
    const data: DecryptedVaultData = {
      masterResume: null,
      jobs: [],
      selectedJobId: null,
      tailoredArtifacts: {},
      applications: [],
      candidatePreferences: {}
    };
    const rawMvk = new Uint8Array(32).buffer;
    const payloadBytes = new TextEncoder().encode(JSON.stringify(data));
    const payloadBuffer = payloadBytes.buffer.slice(payloadBytes.byteOffset, payloadBytes.byteOffset + payloadBytes.byteLength);
    (mockCrypto.subtle.decrypt as any)
      .mockResolvedValueOnce(rawMvk)
      .mockResolvedValueOnce(payloadBuffer);

    const legacyEnvelope: VaultEnvelope = {
      version: 4,
      encrypted: true,
      kdf: { algorithm: 'PBKDF2', iterations: 100000, salt: bufferToBase64(new Uint8Array(16)), hash: 'SHA-256' },
      iv: bufferToBase64(new Uint8Array(12)),
      ciphertext: bufferToBase64(new Uint8Array(32)),
      passphraseWrappedVaultKey: bufferToBase64(new Uint8Array(64)),
      wrappedVaultKey: bufferToBase64(new Uint8Array(64)),
      recoverySalt: bufferToBase64(new Uint8Array(16)),
      recoveryVerifier: 'legacy-verifier',
      meta: { id: 'test-user', name: 'Test User', email: 'test@example.com', biometricEnabled: false, updatedAt: '' }
    };

    const unlocked = await decryptVault(legacyEnvelope, 'legacy passphrase');
    expect(unlocked).toEqual(data);
    const upgraded = await syncUnlockedVault(data, legacyEnvelope.meta);
    expect(upgraded.version).toBe(5);
    expect(upgraded.kdf.iterations).toBe(600000);
    expect(upgraded.recoveryKdf?.iterations).toBe(100000);
    lockVaultSession();
  });

  it('creates v5 vaults with a stronger passphrase KDF and separately recorded recovery KDF', async () => {
    const data: DecryptedVaultData = {
      masterResume: null,
      jobs: [],
      selectedJobId: null,
      tailoredArtifacts: {},
      applications: [],
      candidatePreferences: {}
    };
    const { envelope } = await encryptVault(data, 'correct horse battery staple', {
      id: 'test-user', name: 'Test User', email: 'test@example.com',
      biometricEnabled: false, updatedAt: new Date().toISOString()
    }, 'BYOC-ABCD-EFGH-JKLM-NPQR');
    expect(envelope.version).toBe(5);
    expect(envelope.kdf.iterations).toBe(600000);
    expect(envelope.recoveryKdf?.iterations).toBe(100000);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
  });

  describe('bufferToBase64', () => {
    it('converts ArrayBuffer to base64 string', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
      const result = bufferToBase64(buffer);
      expect(result).toBe('SGVsbG8=');
    });

    it('handles Uint8Array input', () => {
      const arr = new Uint8Array([0, 1, 2, 3]);
      const result = bufferToBase64(arr);
      expect(result).toBe('AAECAw==');
    });
  });

  describe('sha256Hex', () => {
    it('produces deterministic SHA-256 hex output', async () => {
      const hash1 = await sha256Hex('test input');
      const hash2 = await sha256Hex('test input');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]+$/);
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await sha256Hex('input a');
      const hash2 = await sha256Hex('input b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('sanitize functions', () => {
    it('strips demo workspace name', () => {
      expect(stripDemoWorkspaceName('alex mercer')).toBe('');
      expect(stripDemoWorkspaceName('Alex Mercer')).toBe('');
      expect(stripDemoWorkspaceName('John Doe')).toBe('John Doe');
    });

    it('strips demo workspace email', () => {
      expect(stripDemoWorkspaceEmail('alex.mercer@leaddev.io')).toBe('');
      expect(stripDemoWorkspaceEmail('ALEX.MERCER@LEADDEV.IO')).toBe('');
      expect(stripDemoWorkspaceEmail('john@example.com')).toBe('john@example.com');
    });

    it('detects demo workspace identity', () => {
      expect(hasDemoWorkspaceIdentity({ name: 'alex mercer', email: 'test@test.com' })).toBe(true);
      expect(hasDemoWorkspaceIdentity({ name: 'John', email: 'alex.mercer@leaddev.io' })).toBe(true);
      expect(hasDemoWorkspaceIdentity({ name: 'Jane', email: 'jane@test.com' })).toBe(false);
      expect(hasDemoWorkspaceIdentity(null)).toBe(false);
    });
  });
});

describe('Legacy Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractLegacyPlaintextFromRawStore', () => {
    it('detects legacy plaintext with sensitive data', () => {
      const rawStore = JSON.stringify({
        state: {
          geminiApiKey: 'AIza_test123',
          masterResume: { contactInfo: { name: 'Test User' } },
          jobs: [{ title: 'Engineer' }],
        }
      });
      const result = extractLegacyPlaintextFromRawStore(rawStore);
      expect(result.detected).toBe(true);
      expect(result.sensitiveData.geminiApiKey).toBe('AIza_test123');
    });

    it('detects and scrubs an old Groq credential without migrating it into the Gemini slot', () => {
      const rawStore = JSON.stringify({ state: { groqApiKey: 'gsk_legacy_value' } });
      const result = extractLegacyPlaintextFromRawStore(rawStore);
      expect(result.detected).toBe(true);
      expect(result.sensitiveData.geminiApiKey).toBeUndefined();
      const scrubbed = scrubPlaintextWorkspaceStore(rawStore);
      expect(scrubbed).toBeTruthy();
      expect(JSON.parse(scrubbed!).state).not.toHaveProperty('groqApiKey');
      expect(JSON.parse(scrubbed!).state).not.toHaveProperty('geminiApiKey');
    });

    it('returns empty for clean store', () => {
      const rawStore = JSON.stringify({ state: { activeTab: 'dashboard' } });
      const result = extractLegacyPlaintextFromRawStore(rawStore);
      expect(result.detected).toBe(false);
    });

    it('handles invalid JSON gracefully', () => {
      const result = extractLegacyPlaintextFromRawStore('not json');
      expect(result.detected).toBe(false);
    });
  });

  describe('sanitizeStoredWorkspaceStoreMetadata', () => {
    it('removes demo identity from stored metadata', () => {
      let stored = JSON.stringify({
        state: { user: { id: 'test-user', name: 'alex mercer', email: 'alex.mercer@leaddev.io' } }
      });
      const mockStorage = {
        getItem: vi.fn(() => stored),
        setItem: vi.fn((_key: string, value: string) => { stored = value; })
      };
      const result = sanitizeStoredWorkspaceStoreMetadata(mockStorage as any, 'test_key');
      expect(result.status).toBe('updated');
    });
  });
});

describe('Job Search Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateHonestMatch', () => {
    it('returns insufficient profile data for null resume', () => {
      const job: JobPosting = {
        id: '1', title: 'Engineer', company: 'Test', location: 'Remote',
        workplaceType: 'Remote', salary: '$100k', postedDate: '2024-01-01',
        jobDescriptionRaw: 'TypeScript React Node.js',
        url: 'https://example.com', source: 'Test', skillsRequired: ['TypeScript', 'React'],
        fitScore: null, matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified'
      };
      const result = calculateHonestMatch(job, null);
      expect(result.score).toBeNull();
      expect(result.statusText).toBe('Insufficient profile data');
      expect(result.matchedKeywords).toEqual([]);
      expect(result.missingKeywords).toEqual(['TypeScript', 'React']);
    });

    it('calculates correct match for matching skills', () => {
      const job: JobPosting = {
        id: '1', title: 'Engineer', company: 'Test', location: 'Remote',
        workplaceType: 'Remote', salary: '$100k', postedDate: '2024-01-01',
        jobDescriptionRaw: 'TypeScript React Node.js',
        url: 'https://example.com', source: 'Test', skillsRequired: ['TypeScript', 'React', 'Node.js'],
        fitScore: null, matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified'
      };
      const resume: MasterResume = {
        rawText: 'TypeScript React Python', contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
        headline: '', summary: '',
        skills: { technical: ['TypeScript', 'React', 'Python'], soft: [], tools: [], domains: [] },
        experiences: [], education: [], projects: [], certifications: [],
        stats: { wordCount: 0, pageCount: 1, charCount: 0, lastParsedDate: '', sourceFileName: '' }
      };
      const result = calculateHonestMatch(job, resume);
      expect(result.score).toBe(67); // 2/3 skills match
      expect(result.matchedKeywords).toContain('TypeScript');
      expect(result.matchedKeywords).toContain('React');
      expect(result.missingKeywords).toContain('Node.js');
    });

    it('handles case-insensitive matching', () => {
      const job: JobPosting = {
        id: '1', title: 'Engineer', company: 'Test', location: 'Remote',
        workplaceType: 'Remote', salary: '$100k', postedDate: '2024-01-01',
        jobDescriptionRaw: 'TYPESCRIPT react',
        url: 'https://example.com', source: 'Test', skillsRequired: ['TypeScript', 'React'],
        fitScore: null, matchedKeywords: [], missingKeywords: [], experienceLevel: 'Unspecified'
      };
      const resume: MasterResume = {
        rawText: 'TypeScript React Python', contactInfo: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
        headline: '', summary: '',
        skills: { technical: ['typescript', 'REACT'], soft: [], tools: [], domains: [] },
        experiences: [], education: [], projects: [], certifications: [],
        stats: { wordCount: 0, pageCount: 1, charCount: 0, lastParsedDate: '', sourceFileName: '' }
      };
      const result = calculateHonestMatch(job, resume);
      expect(result.matchedKeywords.length).toBe(2);
    });
  });

  describe('mergePortalShortcuts', () => {
    it('deduplicates by id keeping built-in', () => {
      const shortcuts = [
        { id: 'portal-1', name: 'Test', searchUrlTemplate: 'https://example.com/jobs?q={query}', isBuiltIn: true },
        { id: 'portal-1', name: 'Test Dup', searchUrlTemplate: 'https://duplicate.example/jobs?q={query}', isBuiltIn: false }
      ];
      const result = mergePortalShortcuts(shortcuts);
      const matching = result.filter((item) => item.id === 'portal-1');
      expect(matching).toHaveLength(1);
      expect(matching[0].isBuiltIn).toBe(true);
    });
  });

  describe('sanitizeExternalHttpUrl', () => {
    it('accepts valid https URLs', () => {
      expect(sanitizeExternalHttpUrl('https://example.com/job')).toBe('https://example.com/job');
      expect(sanitizeExternalHttpUrl('http://example.com/job')).toBe('http://example.com/job');
    });

    it('rejects invalid URLs', () => {
      expect(sanitizeExternalHttpUrl('ftp://example.com')).toBeNull();
      expect(sanitizeExternalHttpUrl('javascript:alert(1)')).toBeNull();
      expect(sanitizeExternalHttpUrl('')).toBeNull();
    });
  });
});

describe('Application Snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildApplicationSnapshotRecord', () => {
    it('creates snapshot with correct structure', () => {
      const job: JobPosting = {
        id: 'job-1', title: 'Senior Engineer', company: 'Acme Corp',
        location: 'San Francisco', workplaceType: 'Remote', salary: '$150k',
        postedDate: '2024-01-15', jobDescriptionRaw: 'We need a senior engineer...',
        url: 'https://acme.com/jobs/1', source: 'Company Careers',
        skillsRequired: ['TypeScript', 'React', 'Node.js'],
        fitScore: 85, matchedKeywords: ['TypeScript', 'React'], missingKeywords: ['Node.js'], experienceLevel: 'Unspecified'
      };
      const snapshot = buildApplicationSnapshotRecord({ job, masterResumeSummary: 'Experienced engineer' });
      
      expect(snapshot.id).toMatch(/^app-\d+$/);
      expect(snapshot.company).toBe('Acme Corp');
      expect(snapshot.role).toBe('Senior Engineer');
      expect(snapshot.status).toBe('Saved');
      expect(snapshot.jobDescriptionRaw).toBe(job.jobDescriptionRaw);
      expect(snapshot.tailoredResumeSnapshot.jobTitle).toBe('Senior Engineer');
      expect(snapshot.tailoredResumeSnapshot.authenticityGuaranteed).toBe(false);
    });
  });
});

describe('Gemini Service Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GeminiApiError', () => {
    it('creates error with all properties', () => {
      const err = new GeminiApiError('Test error', 401, 'UNAUTHORIZED', 'Check your API key');
      expect(err.message).toBe('Test error');
      expect(err.status).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.recoveryHint).toBe('Check your API key');
    });
  });

  describe('formatGeminiError', () => {
    it('formats GeminiApiError with recovery hint', () => {
      const err = new GeminiApiError('Auth failed', 401, 'UNAUTHORIZED', 'Check your key');
      expect(formatGeminiError(err)).toBe('Auth failed Check your key');
    });

    it('formats generic Error', () => {
      expect(formatGeminiError(new Error('Generic error'))).toBe('Generic error');
    });

    it('handles unknown errors', () => {
      expect(formatGeminiError('string error')).toBe('Gemini request failed.');
      expect(formatGeminiError(null)).toBe('Gemini request failed.');
    });
  });
});

describe('vault key extractability', () => {
  it('keeps PBKDF2-derived wrapping keys non-exportable', async () => {
    await deriveVaultKey('test passphrase', new Uint8Array(16));
    const deriveCall = (mockCrypto.subtle.deriveKey as any).mock.calls.at(-1);
    expect(deriveCall?.[3]).toBe(false);
  });
});
