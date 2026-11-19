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
  hasDemoWorkspaceIdentity,
  stripDemoWorkspaceName,
  stripDemoWorkspaceEmail,
  type DecryptedVaultData,
  type VaultEnvelope
} from './cryptoVault';
import {
  CAREER_FORM_DRAFT_KEY,
  EMAIL_FALLBACK_KEY,
  WORKSPACE_STORE_KEY,
  extractLegacyPlaintextFromRawStore,
  mergeLegacyIntoDecryptedVault,
  mergeWorkspaceStoreState,
  migrateLegacyCareerFormDraft,
  migrateLegacyEmailRecordsToVault,
  migrateWorkspaceStoreState,
  parseLegacyEmailFallback,
  sanitizeStoredWorkspaceStoreMetadata,
  scrubAndVerifyStoredWorkspace,
  scrubPlaintextWorkspaceStore
} from './vaultMigration';
import {
  configureEncryptedEmailVault,
  emailVault
} from '../services/emailSyncService';
import {
  AdzunaJobAdapter,
  DEFAULT_PORTAL_SHORTCUTS,
  JobicyJobAdapter,
  LiveJobSearchEngine,
  PublicFeedsJobAdapter,
  RemoteOkJobAdapter,
  buildPortalShortcutUrl,
  calculateHonestMatch,
  isWorldwideCountryCode,
  mergePortalShortcuts,
  sanitizeExternalHttpUrl
} from '../services/jobSearchService';
import { buildApplicationSnapshotRecord } from '../store/useWizardStore';
import {
  GroqApiError,
  formatGroqError,
  getAvailableGroqModels,
  tailorResumeWithGroq,
  validateTailoredOutput,
  validateQuestionnaireDraft,
  mergeGroqResumeProfile,
  parseResumeWithGroq,
  vetJobWithGroq
} from '../services/groqService';
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
          groqApiKey: 'gsk_test123',
          masterResume: { contactInfo: { name: 'Test User' } },
          jobs: [{ title: 'Engineer' }],
        }
      });
      const result = extractLegacyPlaintextFromRawStore(rawStore);
      expect(result.detected).toBe(true);
      expect(result.sensitiveData.groqApiKey).toBe('gsk_test123');
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
      expect(snapshot.tailoredResumeSnapshot.authenticityGuaranteed).toBe(true);
    });
  });
});

describe('Groq Service Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GroqApiError', () => {
    it('creates error with all properties', () => {
      const err = new GroqApiError('Test error', 401, 'UNAUTHORIZED', 'Check your API key');
      expect(err.message).toBe('Test error');
      expect(err.status).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.recoveryHint).toBe('Check your API key');
    });
  });

  describe('formatGroqError', () => {
    it('formats GroqApiError with recovery hint', () => {
      const err = new GroqApiError('Auth failed', 401, 'UNAUTHORIZED', 'Check your key');
      expect(formatGroqError(err)).toBe('Auth failed Check your key');
    });

    it('formats generic Error', () => {
      expect(formatGroqError(new Error('Generic error'))).toBe('Generic error');
    });

    it('handles unknown errors', () => {
      expect(formatGroqError('string error')).toBe('Groq request failed.');
      expect(formatGroqError(null)).toBe('Groq request failed.');
    });
  });
});

describe('Email Vault Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configures encrypted email vault correctly', () => {
    const mockStore = {
      getState: vi.fn(() => ({
        isAuthenticated: true,
        user: { id: '1', name: 'Test', email: 'test@test.com' },
        hasActiveVaultKey: vi.fn().mockReturnValue(true)
      })),
      subscribe: vi.fn()
    };
    
    configureEncryptedEmailVault({
      isUnlocked: () => true,
      getAll: () => [],
      replaceAll: vi.fn().mockResolvedValue(undefined)
    });
    
    expect(emailVault).toBeDefined();
  });
});
describe('vault key extractability', () => {
  it('keeps PBKDF2-derived wrapping keys non-exportable', async () => {
    await deriveVaultKey('test passphrase', new Uint8Array(16));
    const deriveCall = (mockCrypto.subtle.deriveKey as any).mock.calls.at(-1);
    expect(deriveCall?.[3]).toBe(false);
  });
});
