import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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
import {
  generateDocxResume,
  generatePdfResume,
  generatePlainTextResume
} from '../services/exporterService';
import {
  partitionTailoredBullets,
  resolveTailoredResumeForExportAndPreview,
  verifyTailoredBulletAgainstMaster
} from '../utils/tailoredBulletResolver';
import { INITIAL_CAREER_FORM_STATE, mapFormStateToMasterResume } from '../hooks/useCareerDataBinding';
import type { EmailInteraction, MasterResume, UserWorkspace } from '../types';

const SAMPLE_META: VaultEnvelope['meta'] = {
  id: 'usr-test-001',
  name: 'Nandini Rao',
  email: 'nandini.rao@example.org',
  biometricEnabled: false,
  updatedAt: '2026-11-12T00:00:00.000Z'
};

const SAMPLE_PAYLOAD: DecryptedVaultData = {
  groqApiKey: 'gsk_TEST_ONLY_NOT_A_REAL_KEY',
  geminiApiKey: '',
  masterResume: {
    rawText: 'Senior Systems Designer with experience in distributed telemetry and Web Cryptography.',
    contactInfo: {
      name: 'Nandini Rao',
      email: 'nandini.rao@example.org',
      phone: '+91-9000000000',
      location: 'Bengaluru, IN',
      linkedin: '',
      github: '',
      portfolio: ''
    },
    headline: 'Principal Platform Architect',
    summary: 'Architected local-first encrypted workflows.',
    skills: {
      technical: ['TypeScript', 'WebCrypto', 'Distributed Systems'],
      soft: ['Mentorship'],
      tools: ['Node.js'],
      domains: ['Security']
    },
    experiences: [
      {
        id: 'exp-1',
        company: 'Northstar Systems',
        role: 'Principal Platform Architect',
        startDate: '2021',
        endDate: 'Present',
        location: 'Bengaluru',
        isCurrent: true,
        bullets: ['Built local AES-256-GCM encryption boundaries.']
      }
    ],
    education: [],
    projects: [],
    certifications: [],
    stats: {
      wordCount: 42,
      pageCount: 1,
      charCount: 310,
      lastParsedDate: '2026-11-12T00:00:00.000Z',
      sourceFileName: 'nandini_resume.pdf'
    }
  },
  jobs: [
    {
      id: 'job-1',
      title: 'Staff Security Engineer',
      company: 'Acme Cloud',
      location: 'Remote',
      workplaceType: 'Remote',
      salary: 'Undisclosed',
      postedDate: '2026-11-10',
      jobDescriptionRaw: 'Requires TypeScript and WebCrypto expertise.',
      url: 'https://example.org/jobs/1',
      source: 'Custom Paste',
      skillsRequired: ['TypeScript', 'WebCrypto'],
      fitScore: 100,
      matchedKeywords: ['TypeScript', 'WebCrypto'],
      missingKeywords: [],
      experienceLevel: 'Senior'
    }
  ],
  selectedJobId: 'job-1',
  tailoredArtifacts: {},
  applications: [
    {
      id: 'app-1',
      jobId: 'job-1',
      company: 'Acme Cloud',
      role: 'Staff Security Engineer',
      status: 'Applied',
      appliedDate: '2026-11-11T00:00:00.000Z',
      resumeVersion: 'Master v1',
      tailoredResumeSnapshot: 'Snapshot text',
      jdSnapshot: 'Requires TypeScript and WebCrypto expertise.',
      notes: 'Applied directly'
    }
  ],
  unsavedQueue: [],
  candidatePreferences: {
    country: 'IN',
    preferredLocations: ['Bengaluru'],
    portals: ['LinkedIn'],
    noticePeriod: '30 Days',
    expectedCtc: '50 LPA',
    currentCtc: '40 LPA',
    totalExperienceYears: 8,
    profession: 'Security Engineering',
    targetRole: 'Staff Security Engineer',
    seniority: 'Staff',
    workplaceTypePreference: 'Remote'
  }
};

describe('BYOC Cryptographic Vault Engine (v4 + v3 compatibility)', () => {
  beforeEach(() => {
    lockVaultSession();
  });

  it('encrypts sensitive career data & API keys with v4 MVK, hides plaintext, and decrypts faithfully', async () => {
    const passphrase = 'correct-horse-battery-staple!';
    const { envelope, generatedRecoveryPhrase } = await encryptVault(SAMPLE_PAYLOAD, passphrase, SAMPLE_META);

    assert.equal(envelope.version, 4);
    assert.equal(envelope.encrypted, true);
    assert.ok(generatedRecoveryPhrase && generatedRecoveryPhrase.startsWith('BYOC-'));
    assert.equal(hasActiveVaultKey(), true);
    assert.ok(envelope.passphraseWrappedVaultKey);
    assert.ok(envelope.wrappedVaultKey);

    const serialized = JSON.stringify(envelope);
    assert.equal(serialized.includes('gsk_TEST_ONLY_NOT_A_REAL_KEY'), false);
    assert.equal(serialized.includes('Northstar Systems'), false);

    lockVaultSession();
    assert.equal(hasActiveVaultKey(), false);

    const decrypted = await decryptVault(envelope, passphrase);
    assert.equal(hasActiveVaultKey(), true);
    assert.equal(decrypted.groqApiKey, SAMPLE_PAYLOAD.groqApiKey);
    assert.equal(decrypted.masterResume?.contactInfo?.name, 'Nandini Rao');
    assert.equal(decrypted.jobs.length, 1);
    assert.equal(decrypted.applications.length, 1);
  });

  it('rejects wrong passphrase and tampered ciphertext', async () => {
    const { envelope } = await encryptVault(SAMPLE_PAYLOAD, 'strong-passphrase-123', SAMPLE_META);
    lockVaultSession();

    await assert.rejects(
      () => decryptVault(envelope, 'wrong-passphrase-123'),
      /Invalid vault passphrase/i
    );
    assert.equal(hasActiveVaultKey(), false);

    const flippedChar = envelope.ciphertext[0] === 'A' ? 'B' : 'A';
    const tampered: VaultEnvelope = {
      ...envelope,
      ciphertext: flippedChar + envelope.ciphertext.slice(1)
    };
    await assert.rejects(
      () => decryptVault(tampered, 'strong-passphrase-123'),
      /Invalid vault passphrase/i
    );
  });

  it('re-encrypts mutations offline via in-memory MVK with a fresh IV and fails closed when locked', async () => {
    const passphrase = 'session-mvk-passphrase';
    const { envelope } = await encryptVault(SAMPLE_PAYLOAD, passphrase, SAMPLE_META);

    const updatedPayload: DecryptedVaultData = {
      ...SAMPLE_PAYLOAD,
      groqApiKey: 'gsk_TEST_ONLY_NOT_A_REAL_KEY',
      jobs: [
        ...SAMPLE_PAYLOAD.jobs,
        { ...SAMPLE_PAYLOAD.jobs[0], id: 'job-2', title: 'Lead AppSec Architect' }
      ]
    };

    const syncedEnvelope = await syncUnlockedVault(updatedPayload, SAMPLE_META);
    assert.equal(syncedEnvelope.version, 4);
    assert.notEqual(syncedEnvelope.iv, envelope.iv);

    lockVaultSession();
    await assert.rejects(
      () => syncUnlockedVault(updatedPayload, SAMPLE_META),
      /Vault session is locked/i
    );

    const restored = await decryptVault(syncedEnvelope, passphrase);
    assert.equal(restored.groqApiKey, 'gsk_TEST_ONLY_NOT_A_REAL_KEY');
    assert.equal(restored.jobs.length, 2);
  });

  it('recovers vault using Emergency Recovery Phrase and rejects wrong phrase', async () => {
    const { envelope, generatedRecoveryPhrase } = await encryptVault(
      SAMPLE_PAYLOAD,
      'passphrase-to-recover',
      SAMPLE_META
    );
    assert.ok(generatedRecoveryPhrase);
    lockVaultSession();

    await assert.rejects(
      () => recoverVaultWithSecret(envelope, 'BYOC-AAAA-BBBB-CCCC-DDDD'),
      /Invalid emergency recovery phrase/i
    );
    assert.equal(hasActiveVaultKey(), false);

    const recovered = await recoverVaultWithSecret(envelope, generatedRecoveryPhrase);
    assert.equal(hasActiveVaultKey(), true);
    assert.equal(recovered.groqApiKey, SAMPLE_PAYLOAD.groqApiKey);
    assert.equal(recovered.jobs[0].company, 'Acme Cloud');
  });

  it('remains backward-compatible with legacy v3 envelopes and upgrades cleanly on sync', async () => {
    const passphrase = 'legacy-v3-passphrase';
    const salt = new Uint8Array(16);
    globalThis.crypto.getRandomValues(salt);
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);

    const key = await deriveVaultKey(passphrase, salt);
    const cipherBuf = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(SAMPLE_PAYLOAD))
    );

    const legacyEnvelope: VaultEnvelope = {
      version: 3,
      encrypted: true,
      kdf: {
        algorithm: 'PBKDF2',
        iterations: 100000,
        salt: bufferToBase64(salt),
        hash: 'SHA-256'
      },
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(cipherBuf),
      recoveryVerifier: await sha256Hex('BYOC-TEST-TEST-TEST-TEST'),
      meta: SAMPLE_META
    };

    const decrypted = await decryptVault(legacyEnvelope, passphrase);
    assert.equal(decrypted.groqApiKey, SAMPLE_PAYLOAD.groqApiKey);
    assert.equal(hasActiveVaultKey(), true);

    const upgraded = await syncUnlockedVault(decrypted, SAMPLE_META);
    assert.equal(upgraded.version, 4);
    assert.ok(upgraded.passphraseWrappedVaultKey);

    lockVaultSession();
    const reDecrypted = await decryptVault(upgraded, passphrase);
    assert.equal(reDecrypted.jobs[0].id, 'job-1');
  });
});

describe('Vault Migration & Plaintext Scrubbing', () => {
  it('detects legacy plaintext fields, merges without overwriting encrypted data, and scrubs workspace metadata cleanly', () => {
    const rawLegacyStore = JSON.stringify({
      state: {
        activeTab: 'sourcing',
        isAuthenticated: true,
        isLiveApiMode: true,
        groqApiKey: 'gsk_TEST_ONLY_NOT_A_REAL_KEY',
        user: {
          id: 'usr-legacy-1',
          name: 'Dev User',
          email: 'dev@example.org',
          workspacePasskey: '1234',
          biometricEnabled: false
        },
        masterResume: { rawText: 'Legacy resume text', contactInfo: { name: 'Dev User' } },
        jobs: [{ id: 'legacy-job-1', title: 'Platform Lead', company: 'LegacyCorp' }],
        applications: [{ id: 'legacy-app-1', company: 'LegacyCorp', role: 'Platform Lead' }],
        candidatePreferences: {
          country: 'IN',
          preferredLocations: ['Pune'],
          portals: ['LinkedIn'],
          noticePeriod: '15 Days',
          expectedCtc: '35 LPA',
          currentCtc: '28 LPA',
          totalExperienceYears: 6,
          profession: 'Backend',
          targetRole: 'Platform Lead',
          seniority: 'Lead',
          workplaceTypePreference: 'Hybrid'
        }
      },
      version: 2
    });

    const capture = extractLegacyPlaintextFromRawStore(rawLegacyStore);
    assert.equal(capture.detected, true);
    assert.equal(capture.sensitiveData.groqApiKey, 'gsk_TEST_ONLY_NOT_A_REAL_KEY');
    assert.equal(capture.sensitiveData.jobs?.length, 1);

    const mergedExisting = mergeLegacyIntoDecryptedVault(SAMPLE_PAYLOAD, capture.sensitiveData);
    assert.equal(mergedExisting.didChange, true);
    // Preserves existing non-empty encrypted values instead of clobbering
    assert.equal(mergedExisting.merged.groqApiKey, SAMPLE_PAYLOAD.groqApiKey);
    // Appends non-duplicate legacy jobs & applications
    assert.equal(mergedExisting.merged.jobs.length, 2);
    assert.equal(mergedExisting.merged.applications.length, 2);

    const scrubbedRaw = scrubPlaintextWorkspaceStore(rawLegacyStore);
    assert.ok(scrubbedRaw);
    const scrubbed = JSON.parse(scrubbedRaw);
    assert.equal(scrubbed.version, 4);
    assert.equal(scrubbed.state.activeTab, 'sourcing');
    assert.equal(scrubbed.state.user.hasEncryptedVault, true);
    assert.equal('workspacePasskey' in scrubbed.state.user, false);
    assert.equal('groqApiKey' in scrubbed.state, false);
    assert.equal('masterResume' in scrubbed.state, false);
    assert.equal('jobs' in scrubbed.state, false);
    assert.equal('applications' in scrubbed.state, false);
    assert.equal('isAuthenticated' in scrubbed.state, false);
  });
});

describe('Zero Fabricated Defaults & Honest Matching', () => {
  it('returns empty array when searching public feeds without role, profession, query, or skills', async () => {
    const adapter = new PublicFeedsJobAdapter();
    const res = await adapter.search({});
    assert.deepEqual(res, []);
  });

  it('returns null match score when Master Resume is missing or job skill criteria are empty', () => {
    const resNoResume = calculateHonestMatch(SAMPLE_PAYLOAD.jobs[0] as any, null);
    assert.equal(resNoResume.score, null);
    assert.equal(resNoResume.statusText, 'Insufficient profile data');
    assert.deepEqual(resNoResume.matchedKeywords, []);

    const jobWithoutSkills = { ...SAMPLE_PAYLOAD.jobs[0], skillsRequired: [] };
    const resNoSkills = calculateHonestMatch(jobWithoutSkills as any, SAMPLE_PAYLOAD.masterResume);
    assert.equal(resNoSkills.score, null);
    assert.equal(resNoSkills.statusText, 'No job skill criteria specified');
  });

  it('maps empty intake form state without synthetic company/date/wordCount defaults', () => {
    const mapped = mapFormStateToMasterResume(INITIAL_CAREER_FORM_STATE);
    assert.equal(mapped.headline, '');
    assert.deepEqual(mapped.experiences, []);
    assert.equal(mapped.stats.wordCount, 0);
    assert.equal(mapped.stats.pageCount, 0);
  });

  it('excludes remote listings with unknown locations from a country-specific search', async () => {
    const { matchesRemoteCountryAndLocation } = await import('../services/jobSearchService');
    assert.equal(matchesRemoteCountryAndLocation('Location Unspecified', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('Worldwide', 'Software Engineer', 'IN'), true);
    assert.equal(matchesRemoteCountryAndLocation('Worldwide', 'Software Engineer', 'IN', undefined, false), false);
    assert.equal(matchesRemoteCountryAndLocation('Worldwide', 'Software Engineer', 'IN', undefined, true), true);
    assert.equal(matchesRemoteCountryAndLocation('Location Unspecified', 'Software Engineer', 'GLOBAL'), true);
    assert.equal(matchesRemoteCountryAndLocation('Warsaw (Remote)', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('Palo Alto (Remote)', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('Kansas (Remote)', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('Netherlands (Remote)', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('Remote', 'Software Engineer', 'IN'), false);
    assert.equal(matchesRemoteCountryAndLocation('India (Remote)', 'Software Engineer', 'IN'), true);
    assert.equal(matchesRemoteCountryAndLocation('APAC (Remote)', 'Software Engineer', 'IN'), true);
    assert.equal(matchesRemoteCountryAndLocation('Anywhere (Remote)', 'Software Engineer', 'IN'), true);
  });

  it('uses the published location—not description mentions—for city eligibility', async () => {
    const { matchesRemoteCountryAndLocation } = await import('../services/jobSearchService');
    assert.equal(matchesRemoteCountryAndLocation('Hyderabad, India (Remote)', 'Bengaluru mentioned in the description', 'IN', 'Bengaluru', false), false);
    assert.equal(matchesRemoteCountryAndLocation('India (Remote)', 'No city in the description', 'IN', 'Bengaluru', false), true);
    assert.equal(matchesRemoteCountryAndLocation('Bangalore (Remote)', 'Role description', 'IN', 'Bengaluru', false), true);
    assert.equal(matchesRemoteCountryAndLocation('Worldwide (Remote)', 'Role description', 'IN', 'Bengaluru', false), false);
    assert.equal(matchesRemoteCountryAndLocation('Worldwide (Remote)', 'Role description', 'IN', 'Bengaluru', true), true);
  });
});

describe('Encrypted Intake Career Form Draft & Lossless Migration', () => {
  beforeEach(() => {
    lockVaultSession();
  });

  const LEGACY_DRAFT = {
    personalDetails: {
      fullName: 'Meera Krishnan',
      email: 'meera.krishnan@example.org',
      phone: '+91-9876543210',
      location: 'Chennai, IN'
    },
    professionalSummary: 'Staff Privacy Engineer building zero-knowledge telemetry pipelines.',
    workExperience: [
      {
        id: 'exp-legacy-1',
        company: 'ClearVault Labs',
        role: 'Staff Privacy Engineer',
        duration: '2022 - Present',
        keyResponsibilities: ['Designed AES-GCM client draft storage.']
      }
    ],
    skills: ['TypeScript', 'WebCrypto', 'Privacy Engineering'],
    education: [{ id: 'edu-1', degree: 'B.Tech CS', institution: 'NIT Trichy', year: '2017' }],
    isAutoFilled: true,
    lastExtractedTimestamp: '2026-11-12T10:00:00.000Z',
    rawSourceText: 'MEERA KRISHNAN\nStaff Privacy Engineer\nRAW_RESUME_SENSITIVE_MARKER_991'
  };

  it('encrypts careerFormDraft inside vault envelope and restores it cleanly after lock/unlock', async () => {
    const passphrase = 'draft-vault-passphrase-1';
    const { envelope } = await encryptVault(
      { ...SAMPLE_PAYLOAD, careerFormDraft: LEGACY_DRAFT },
      passphrase,
      SAMPLE_META
    );

    const serializedEnvelope = JSON.stringify(envelope);
    assert.equal(serializedEnvelope.includes('RAW_RESUME_SENSITIVE_MARKER_991'), false);
    assert.equal(serializedEnvelope.includes('Meera Krishnan'), false);
    assert.equal(serializedEnvelope.includes('+91-9876543210'), false);

    lockVaultSession();
    const restored = await decryptVault(envelope, passphrase);
    assert.equal(restored.careerFormDraft?.personalDetails.fullName, 'Meera Krishnan');
    assert.equal(restored.careerFormDraft?.personalDetails.phone, '+91-9876543210');
    assert.match(restored.careerFormDraft?.rawSourceText || '', /RAW_RESUME_SENSITIVE_MARKER_991/);
  });

  it('migrates legacy plaintext byoc_career_form_draft and removes old key only after encrypted write and restoration verify pass', async () => {
    const passphrase = 'migrate-draft-pass-2';
    const mockStorage = new Map<string, string>([
      [CAREER_FORM_DRAFT_KEY, JSON.stringify(LEGACY_DRAFT)]
    ]);
    let storedEnvelope: VaultEnvelope | null = null;
    const events: string[] = [];

    const { envelope } = await encryptVault({ ...SAMPLE_PAYLOAD, careerFormDraft: null }, passphrase, SAMPLE_META);
    storedEnvelope = envelope;

    const result = await migrateLegacyCareerFormDraft({
      getRawDraft: () => mockStorage.get(CAREER_FORM_DRAFT_KEY) ?? null,
      removeLegacyDraft: () => {
        events.push('removed');
        mockStorage.delete(CAREER_FORM_DRAFT_KEY);
      },
      writeEnvelope: (env) => {
        events.push('written');
        storedEnvelope = env;
        return true;
      },
      readEnvelope: () => {
        events.push('read_verify');
        return storedEnvelope;
      },
      currentVaultData: { ...SAMPLE_PAYLOAD, careerFormDraft: null },
      vaultMeta: SAMPLE_META
    });

    assert.equal(result.status, 'migrated');
    assert.equal(mockStorage.has(CAREER_FORM_DRAFT_KEY), false);
    assert.deepEqual(events, ['written', 'read_verify', 'removed']);
    assert.ok(storedEnvelope);

    // Ensure full post-lock decryption restores the migrated draft intact
    lockVaultSession();
    const unlocked = await decryptVault(storedEnvelope, passphrase);
    assert.equal(unlocked.careerFormDraft?.personalDetails.fullName, 'Meera Krishnan');
    assert.equal(unlocked.careerFormDraft?.rawSourceText, LEGACY_DRAFT.rawSourceText);
  });

  it('retains old byoc_career_form_draft and returns explicit error if encrypted write fails, verification fails, draft is malformed, or vault is locked', async () => {
    const passphrase = 'fail-safe-pass-3';
    const legacyJson = JSON.stringify(LEGACY_DRAFT);

    // 1. Encrypted write failure -> old key must remain untouched
    const mockWriteFailStorage = new Map<string, string>([[CAREER_FORM_DRAFT_KEY, legacyJson]]);
    const { envelope } = await encryptVault({ ...SAMPLE_PAYLOAD, careerFormDraft: null }, passphrase, SAMPLE_META);

    const writeFailRes = await migrateLegacyCareerFormDraft({
      getRawDraft: () => mockWriteFailStorage.get(CAREER_FORM_DRAFT_KEY) ?? null,
      removeLegacyDraft: () => mockWriteFailStorage.delete(CAREER_FORM_DRAFT_KEY),
      writeEnvelope: () => {
        throw new Error('QuotaExceededError: disk full');
      },
      readEnvelope: () => envelope,
      currentVaultData: { ...SAMPLE_PAYLOAD, careerFormDraft: null },
      vaultMeta: SAMPLE_META
    });

    assert.equal(writeFailRes.status, 'error');
    assert.match(writeFailRes.error, /QuotaExceededError|original draft has been retained/i);
    assert.equal(mockWriteFailStorage.get(CAREER_FORM_DRAFT_KEY), legacyJson);

    // 2. Restoration verification failure (corrupted readback) -> old key must remain untouched
    const mockVerifyFailStorage = new Map<string, string>([[CAREER_FORM_DRAFT_KEY, legacyJson]]);
    const verifyFailRes = await migrateLegacyCareerFormDraft({
      getRawDraft: () => mockVerifyFailStorage.get(CAREER_FORM_DRAFT_KEY) ?? null,
      removeLegacyDraft: () => mockVerifyFailStorage.delete(CAREER_FORM_DRAFT_KEY),
      writeEnvelope: () => true,
      readEnvelope: () => ({ ...envelope, ciphertext: 'INVALID_BASE64!' }),
      currentVaultData: { ...SAMPLE_PAYLOAD, careerFormDraft: null },
      vaultMeta: SAMPLE_META
    });

    assert.equal(verifyFailRes.status, 'error');
    assert.equal(mockVerifyFailStorage.get(CAREER_FORM_DRAFT_KEY), legacyJson);

    // 3. Malformed legacy JSON -> old key must remain untouched
    const mockMalformedStorage = new Map<string, string>([[CAREER_FORM_DRAFT_KEY, '{broken-json']]);
    const malformedRes = await migrateLegacyCareerFormDraft({
      getRawDraft: () => mockMalformedStorage.get(CAREER_FORM_DRAFT_KEY) ?? null,
      removeLegacyDraft: () => mockMalformedStorage.delete(CAREER_FORM_DRAFT_KEY),
      writeEnvelope: () => true,
      readEnvelope: () => envelope,
      currentVaultData: { ...SAMPLE_PAYLOAD, careerFormDraft: null },
      vaultMeta: SAMPLE_META
    });

    assert.equal(malformedRes.status, 'error');
    assert.equal(mockMalformedStorage.get(CAREER_FORM_DRAFT_KEY), '{broken-json');

    // 4. Vault locked -> old key must remain untouched
    lockVaultSession();
    const mockLockedStorage = new Map<string, string>([[CAREER_FORM_DRAFT_KEY, legacyJson]]);
    const lockedRes = await migrateLegacyCareerFormDraft({
      getRawDraft: () => mockLockedStorage.get(CAREER_FORM_DRAFT_KEY) ?? null,
      removeLegacyDraft: () => mockLockedStorage.delete(CAREER_FORM_DRAFT_KEY),
      writeEnvelope: () => true,
      readEnvelope: () => envelope,
      currentVaultData: { ...SAMPLE_PAYLOAD, careerFormDraft: null },
      vaultMeta: SAMPLE_META
    });

    assert.equal(lockedRes.status, 'error');
    assert.match(lockedRes.error, /locked/i);
    assert.equal(mockLockedStorage.get(CAREER_FORM_DRAFT_KEY), legacyJson);
  });
});

describe('Encrypted Email Interaction Vault & Lossless Migration', () => {
  beforeEach(() => {
    lockVaultSession();
    configureEncryptedEmailVault(null);
  });

  const SAMPLE_EMAIL: EmailInteraction = {
    id: 'email-legacy-1',
    messageId: 'msg-unique-771',
    from: 'recruiting@northstar.example',
    fromName: 'Northstar Talent',
    to: 'nandini.rao@example.org',
    subject: 'Technical Interview Invitation — Staff Security Engineer',
    receivedDate: '2026-11-11T09:00:00.000Z',
    snippet: 'We would like to invite you to schedule a technical round.',
    body: 'SENSITIVE_RECRUITER_THREAD_MARKER_882 Please schedule your interview.',
    detectedCompany: 'Northstar',
    detectedRole: 'Staff Security Engineer',
    isRecruitingInfrastructure: true,
    infrastructureName: 'Greenhouse',
    status: 'unsaved_external_queue'
  };

  it('encrypts emailInteractions inside vault envelope, hides plaintext, and fails closed when locked', async () => {
    const passphrase = 'email-vault-passphrase-1';
    const { envelope } = await encryptVault(
      { ...SAMPLE_PAYLOAD, emailInteractions: [SAMPLE_EMAIL] },
      passphrase,
      SAMPLE_META
    );

    const serialized = JSON.stringify(envelope);
    assert.equal(serialized.includes('SENSITIVE_RECRUITER_THREAD_MARKER_882'), false);
    assert.equal(serialized.includes('recruiting@northstar.example'), false);

    // Locked adapter fails closed
    await assert.rejects(() => emailVault.getAll(), /locked/i);
    await assert.rejects(() => emailVault.save(SAMPLE_EMAIL), /locked/i);

    // Unlocked adapter reads and writes in-memory encrypted vault
    let storedItems: EmailInteraction[] = [SAMPLE_EMAIL];
    configureEncryptedEmailVault({
      isUnlocked: () => hasActiveVaultKey(),
      getAll: () => storedItems,
      replaceAll: (items) => {
        storedItems = items;
        return true;
      }
    });

    const loaded = await emailVault.getAll();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].messageId, 'msg-unique-771');

    lockVaultSession();
    await assert.rejects(() => emailVault.getAll(), /locked/i);
    const restored = await decryptVault(envelope, passphrase);
    assert.equal(restored.emailInteractions?.length, 1);
    assert.match(restored.emailInteractions?.[0].body || '', /SENSITIVE_RECRUITER_THREAD_MARKER_882/);
  });

  it('migrates legacy email fallback records and clears legacy store only after encrypted write + verify succeed', async () => {
    const passphrase = 'migrate-email-pass-2';
    const legacyFallback = new Map<string, string>([
      [EMAIL_FALLBACK_KEY, JSON.stringify([SAMPLE_EMAIL])]
    ]);
    let storedEnvelope: VaultEnvelope | null = null;
    const events: string[] = [];

    const { envelope } = await encryptVault(
      { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      passphrase,
      SAMPLE_META
    );
    storedEnvelope = envelope;

    const result = await migrateLegacyEmailRecordsToVault({
      readLegacyEmails: async () => {
        const parsed = parseLegacyEmailFallback(legacyFallback.get(EMAIL_FALLBACK_KEY) ?? null);
        if (parsed.status === 'valid') {
          return { status: 'valid', records: parsed.records, sources: ['localstorage'] };
        }
        return parsed;
      },
      clearLegacyEmails: async () => {
        events.push('cleared');
        legacyFallback.delete(EMAIL_FALLBACK_KEY);
      },
      writeEnvelope: (env) => {
        events.push('written');
        storedEnvelope = env;
        return true;
      },
      readEnvelope: () => {
        events.push('read_verify');
        return storedEnvelope;
      },
      currentVaultData: { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      vaultMeta: SAMPLE_META
    });

    assert.equal(result.status, 'migrated');
    assert.equal(legacyFallback.has(EMAIL_FALLBACK_KEY), false);
    assert.deepEqual(events, ['written', 'read_verify', 'cleared']);
    assert.ok(storedEnvelope);

    lockVaultSession();
    const unlocked = await decryptVault(storedEnvelope, passphrase);
    assert.equal(unlocked.emailInteractions?.length, 1);
    assert.equal(unlocked.emailInteractions?.[0].messageId, 'msg-unique-771');
  });

  it('retains legacy email fallback records on write failure, verification failure, malformed JSON, or locked vault', async () => {
    const passphrase = 'email-fail-safe-3';
    const rawFallback = JSON.stringify([SAMPLE_EMAIL]);
    const { envelope } = await encryptVault(
      { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      passphrase,
      SAMPLE_META
    );

    // 1. Write error retains fallback
    const mapWriteFail = new Map<string, string>([[EMAIL_FALLBACK_KEY, rawFallback]]);
    const writeFail = await migrateLegacyEmailRecordsToVault({
      readLegacyEmails: async () => ({
        status: 'valid',
        records: [SAMPLE_EMAIL],
        sources: ['localstorage']
      }),
      clearLegacyEmails: () => {
        mapWriteFail.delete(EMAIL_FALLBACK_KEY);
      },
      writeEnvelope: () => {
        throw new Error('QuotaExceededError');
      },
      readEnvelope: () => envelope,
      currentVaultData: { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      vaultMeta: SAMPLE_META
    });
    assert.equal(writeFail.status, 'error');
    assert.equal(mapWriteFail.get(EMAIL_FALLBACK_KEY), rawFallback);

    // 2. Verification error retains fallback
    const mapVerifyFail = new Map<string, string>([[EMAIL_FALLBACK_KEY, rawFallback]]);
    const verifyFail = await migrateLegacyEmailRecordsToVault({
      readLegacyEmails: async () => ({
        status: 'valid',
        records: [SAMPLE_EMAIL],
        sources: ['localstorage']
      }),
      clearLegacyEmails: () => {
        mapVerifyFail.delete(EMAIL_FALLBACK_KEY);
      },
      writeEnvelope: () => true,
      readEnvelope: () => ({ ...envelope, ciphertext: 'BAD_CIPHERTEXT' }),
      currentVaultData: { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      vaultMeta: SAMPLE_META
    });
    assert.equal(verifyFail.status, 'error');
    assert.equal(mapVerifyFail.get(EMAIL_FALLBACK_KEY), rawFallback);

    // 3. Malformed fallback JSON -> parse returns error & retains raw value
    const malformed = parseLegacyEmailFallback('{invalid-email-json');
    assert.equal(malformed.status, 'error');

    // 4. Locked vault -> retains fallback
    lockVaultSession();
    const mapLocked = new Map<string, string>([[EMAIL_FALLBACK_KEY, rawFallback]]);
    const lockedRes = await migrateLegacyEmailRecordsToVault({
      readLegacyEmails: async () => ({
        status: 'valid',
        records: [SAMPLE_EMAIL],
        sources: ['localstorage']
      }),
      clearLegacyEmails: () => {
        mapLocked.delete(EMAIL_FALLBACK_KEY);
      },
      writeEnvelope: () => true,
      readEnvelope: () => envelope,
      currentVaultData: { ...SAMPLE_PAYLOAD, emailInteractions: [] },
      vaultMeta: SAMPLE_META
    });
    assert.equal(lockedRes.status, 'error');
    assert.match(lockedRes.error, /locked/i);
    assert.equal(mapLocked.get(EMAIL_FALLBACK_KEY), rawFallback);
  });
});

describe('Demo Workspace Metadata Cleanup & Reload/Migration Integrity', () => {
  beforeEach(() => {
    lockVaultSession();
  });

  function createMemoryStorage(initial: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(initial));
    return {
      map,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      }
    };
  }

  it('strips exact demo identity case-insensitively across legacy capture, Zustand metadata, and envelope metadata while leaving candidate career records untouched', async () => {
    const passphrase = 'demo-cleanup-passphrase-1';
    const candidateResume = {
      ...SAMPLE_PAYLOAD.masterResume,
      rawText: 'Alex Mercer - Lead Developer',
      contactInfo: {
        ...SAMPLE_PAYLOAD.masterResume.contactInfo,
        name: 'Alex Mercer',
        email: 'alex.mercer@leaddev.io'
      }
    };
    const candidateEmail: EmailInteraction = {
      id: 'email-candidate-1',
      messageId: 'msg-cand-1',
      from: 'talent@example.com',
      fromName: 'Talent Team',
      to: 'alex.mercer@leaddev.io',
      subject: 'Interview Follow-up for Alex Mercer',
      receivedDate: '2026-11-12T08:00:00.000Z',
      snippet: 'Hi Alex Mercer',
      body: 'Body addressed to alex.mercer@leaddev.io',
      detectedCompany: 'Acme',
      detectedRole: 'Staff Engineer',
      isRecruitingInfrastructure: false,
      status: 'matched_transitioned'
    };

    const legacyStoreJson = JSON.stringify({
      state: {
        activeTab: 'dashboard',
        isAuthenticated: false,
        groqApiKey: 'gsk_TEST_ONLY_NOT_A_REAL_KEY',
        user: {
          id: 'ws-preserved-999',
          name: '  aLeX MeRcEr ',
          email: 'ALEX.MERCER@LeadDev.IO',
          workspacePasskey: 'legacy-pin',
          biometricEnabled: false,
          createdAt: '2026-10-01T00:00:00.000Z',
          lastActive: '2026-11-12T00:00:00.000Z'
        },
        masterResume: candidateResume,
        applications: SAMPLE_PAYLOAD.applications
      },
      version: 2
    });

    // 1. Legacy workspace store sanitization preserves ID and all career data
    const storage = createMemoryStorage({ [WORKSPACE_STORE_KEY]: legacyStoreJson });
    const cleanStoreRes = sanitizeStoredWorkspaceStoreMetadata(storage, WORKSPACE_STORE_KEY);
    assert.equal(cleanStoreRes.status, 'updated');

    const persistedStore = JSON.parse(storage.getItem(WORKSPACE_STORE_KEY)!);
    assert.equal(persistedStore.version, 2);
    assert.equal(persistedStore.state.user.id, 'ws-preserved-999');
    assert.equal(persistedStore.state.user.name, '');
    assert.equal(persistedStore.state.user.email, '');
    assert.equal(persistedStore.state.masterResume.contactInfo.name, 'Alex Mercer');
    assert.equal(persistedStore.state.masterResume.contactInfo.email, 'alex.mercer@leaddev.io');
    assert.equal(persistedStore.state.groqApiKey, 'gsk_TEST_ONLY_NOT_A_REAL_KEY');

    // Non-exact names are never stripped
    assert.equal(stripDemoWorkspaceName('Alex Mercer Jr'), 'Alex Mercer Jr');
    assert.equal(stripDemoWorkspaceEmail('alex.mercer2@leaddev.io'), 'alex.mercer2@leaddev.io');

    // 2. Legacy capture & scrub preserve ID and keep workspace identity blank
    const capture = extractLegacyPlaintextFromRawStore(storage.getItem(WORKSPACE_STORE_KEY));
    assert.equal(capture.detected, true);
    assert.equal(capture.user?.id, 'ws-preserved-999');
    assert.equal(capture.user?.name, '');
    assert.equal(capture.user?.email, '');
    assert.equal(capture.sensitiveData.masterResume.contactInfo.name, 'Alex Mercer');

    const scrubbedOk = scrubAndVerifyStoredWorkspace(storage, WORKSPACE_STORE_KEY);
    assert.equal(scrubbedOk, true);
    const scrubbedParsed = JSON.parse(storage.getItem(WORKSPACE_STORE_KEY)!);
    assert.equal(scrubbedParsed.version, 4);
    assert.equal(scrubbedParsed.state.user.id, 'ws-preserved-999');
    assert.equal(scrubbedParsed.state.user.name, '');
    assert.equal(scrubbedParsed.state.user.email, '');

    // 3. Existing v4 Zustand hydration (merge) & migrate cannot restore demo identity
    const mergedV4 = mergeWorkspaceStoreState(
      {
        activeTab: 'settings',
        user: {
          id: 'ws-preserved-999',
          name: 'Alex Mercer',
          email: 'alex.mercer@leaddev.io',
          isEmailVerified: false,
          biometricEnabled: false,
          hasEncryptedVault: true,
          createdAt: '2026-10-01T00:00:00.000Z',
          lastActive: '2026-11-12T00:00:00.000Z'
        }
      },
      { activeTab: 'dashboard', user: null as UserWorkspace | null }
    );
    assert.equal(mergedV4.user?.id, 'ws-preserved-999');
    assert.equal(mergedV4.user?.name, '');
    assert.equal(mergedV4.user?.email, '');

    const migratedV2 = migrateWorkspaceStoreState(
      {
        activeTab: 'intake',
        user: {
          id: 'ws-preserved-999',
          name: 'ALEX MERCER',
          email: 'Alex.Mercer@leaddev.io',
          workspacePasskey: '1234',
          isEmailVerified: false,
          biometricEnabled: false,
          createdAt: '2026-10-01T00:00:00.000Z',
          lastActive: '2026-11-12T00:00:00.000Z'
        }
      },
      2
    );
    assert.equal(migratedV2.user?.id, 'ws-preserved-999');
    assert.equal(migratedV2.user?.name, '');
    assert.equal(migratedV2.user?.email, '');
    assert.equal('workspacePasskey' in (migratedV2.user || {}), false);

    // 4. Encrypted vault envelope metadata cleanup preserves ciphertext, IV, ID, and all encrypted data
    const { envelope, generatedRecoveryPhrase } = await encryptVault(
      {
        ...SAMPLE_PAYLOAD,
        masterResume: candidateResume,
        emailInteractions: [candidateEmail]
      },
      passphrase,
      {
        id: 'ws-preserved-999',
        name: 'Real Owner',
        email: 'owner@example.org',
        biometricEnabled: false,
        updatedAt: '2026-11-12T00:00:00.000Z'
      }
    );
    const envelopeWithDemoMeta: VaultEnvelope = {
      ...envelope,
      meta: {
        ...envelope.meta,
        name: 'Alex Mercer',
        email: 'ALEX.MERCER@LEADDEV.IO'
      }
    };

    const envStorage = createMemoryStorage({
      [VAULT_STORAGE_KEY]: JSON.stringify(envelopeWithDemoMeta)
    });
    const envCleanRes = sanitizeStoredVaultEnvelopeMetadata(envStorage, VAULT_STORAGE_KEY);
    assert.equal(envCleanRes.status, 'updated');

    const cleanedEnvelope = JSON.parse(envStorage.getItem(VAULT_STORAGE_KEY)!) as VaultEnvelope;
    assert.equal(cleanedEnvelope.meta.id, 'ws-preserved-999');
    assert.equal(cleanedEnvelope.meta.name, '');
    assert.equal(cleanedEnvelope.meta.email, '');
    assert.equal(cleanedEnvelope.ciphertext, envelopeWithDemoMeta.ciphertext);
    assert.equal(cleanedEnvelope.iv, envelopeWithDemoMeta.iv);
    assert.equal(hasDemoWorkspaceIdentity(cleanedEnvelope.meta), false);

    // Original passphrase & recovery phrase still decrypt untouched career data
    lockVaultSession();
    const decrypted = await decryptVault(cleanedEnvelope, passphrase);
    assert.equal(decrypted.masterResume?.contactInfo?.name, 'Alex Mercer');
    assert.equal(decrypted.masterResume?.contactInfo?.email, 'alex.mercer@leaddev.io');
    assert.equal(decrypted.emailInteractions?.[0].to, 'alex.mercer@leaddev.io');
    assert.equal(decrypted.applications.length, 1);

    lockVaultSession();
    assert.ok(generatedRecoveryPhrase);
    const recovered = await recoverVaultWithSecret(cleanedEnvelope, generatedRecoveryPhrase);
    assert.equal(recovered.masterResume?.contactInfo?.name, 'Alex Mercer');

    // Simulated reload re-running cleaners reports clean with no demo identity anywhere in metadata
    assert.equal(sanitizeStoredWorkspaceStoreMetadata(storage, WORKSPACE_STORE_KEY).status, 'clean');
    assert.equal(sanitizeStoredVaultEnvelopeMetadata(envStorage, VAULT_STORAGE_KEY).status, 'clean');
  });

  it('refuses to report persistent metadata clean when write/readback verification fails', () => {
    const staleDemoStore = JSON.stringify({
      state: {
        activeTab: 'dashboard',
        user: {
          id: 'ws-1',
          name: 'Alex Mercer',
          email: 'alex.mercer@leaddev.io',
          isEmailVerified: false,
          biometricEnabled: false,
          createdAt: '2026-11-01T00:00:00.000Z',
          lastActive: '2026-11-12T00:00:00.000Z'
        },
        jobs: [{ id: 'j-1' }]
      },
      version: 2
    });

    // Storage silently ignores writes -> readback still contains demo identity -> returns error
    const staleStorage = {
      getItem: () => staleDemoStore,
      setItem: () => {
        // Simulate silent write failure / stale readback
      }
    };
    const storeFail = sanitizeStoredWorkspaceStoreMetadata(staleStorage, WORKSPACE_STORE_KEY);
    assert.equal(storeFail.status, 'error');
    assert.equal(scrubAndVerifyStoredWorkspace(staleStorage, WORKSPACE_STORE_KEY), false);

    const staleEnvelope = JSON.stringify({
      version: 4,
      encrypted: true,
      kdf: { algorithm: 'PBKDF2', iterations: 100000, salt: 'c2FsdA==', hash: 'SHA-256' },
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVy',
      meta: {
        id: 'ws-1',
        name: 'Alex Mercer',
        email: 'alex.mercer@leaddev.io',
        biometricEnabled: false,
        updatedAt: '2026-11-12T00:00:00.000Z'
      }
    });
    const staleEnvStorage = {
      getItem: () => staleEnvelope,
      setItem: () => {}
    };
    const envFail = sanitizeStoredVaultEnvelopeMetadata(staleEnvStorage, VAULT_STORAGE_KEY);
    assert.equal(envFail.status, 'error');

    // Throwing storage also fails safely with error / false
    const throwingStorage = {
      getItem: () => staleDemoStore,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    assert.equal(sanitizeStoredWorkspaceStoreMetadata(throwingStorage, WORKSPACE_STORE_KEY).status, 'error');
    assert.equal(scrubAndVerifyStoredWorkspace(throwingStorage, WORKSPACE_STORE_KEY), false);
  });

  it('cleans unwrapped legacy { user } workspace metadata and keeps sw.js cache busted/bypassed for dev modules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const unwrappedLegacy = JSON.stringify({
      user: {
        id: 'ws-unwrapped-77',
        name: 'Alex Mercer',
        email: 'alex.mercer@leaddev.io',
        createdAt: '2026-10-01T00:00:00.000Z',
        lastActive: '2026-11-12T00:00:00.000Z'
      },
      jobs: [{ id: 'j-keep-1' }],
      version: 1
    });

    const storage = createMemoryStorage({ [WORKSPACE_STORE_KEY]: unwrappedLegacy });
    const res = sanitizeStoredWorkspaceStoreMetadata(storage, WORKSPACE_STORE_KEY);
    assert.equal(res.status, 'updated');

    const cleaned = JSON.parse(storage.getItem(WORKSPACE_STORE_KEY)!);
    assert.equal(cleaned.user.id, 'ws-unwrapped-77');
    assert.equal(cleaned.user.name, '');
    assert.equal(cleaned.user.email, '');
    assert.equal(cleaned.jobs.length, 1);

    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');
    assert.equal(swSource.includes("CACHE_NAME = 'byoc-cache-v2'"), false);
    assert.match(swSource, /CACHE_NAME\s*=\s*'byoc-cache-v3'/);
    assert.match(swSource, /\/src\//);
    assert.match(swSource, /\.tsx/);
  });
});

describe('Local Resume Extraction (.docx PKZIP/Deflate & Honest Format/OCR Guards)', () => {
  it('extracts clean multi-paragraph resume text from a real compressed .docx archive', async () => {
    const { Document, Packer, Paragraph } = await import('docx');
    const { extractResumeFile } = await import('../services/extractionService');

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph('Nandini Rao'),
            new Paragraph('Principal Security Architect'),
            new Paragraph('nandini.rao@example.org'),
            new Paragraph('Summary'),
            new Paragraph('Built local AES-256-GCM cryptographic storage pipelines with TypeScript and Node.js.'),
            new Paragraph('Experience'),
            new Paragraph('Northstar Systems - Staff Security Engineer 2021 - Present'),
            new Paragraph('- Designed client-side vault key wrapping and offline recovery verification.')
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const docxFile = new File([new Uint8Array(buffer)], 'nandini_resume.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    const extracted = await extractResumeFile(docxFile);
    assert.equal(extracted.success, true);
    assert.ok(extracted.wordCount >= 20);
    assert.match(extracted.rawText, /Nandini Rao/);
    assert.match(extracted.rawText, /AES-256-GCM cryptographic storage pipelines/);
    assert.equal(extracted.parsedProfile?.contactInfo.email, 'nandini.rao@example.org');
    assert.ok(extracted.parsedProfile?.skills.technical.includes('TypeScript'));
  });

  it('rejects raster images honestly without OCR and rejects unreadable binary .pdf streams cleanly', async () => {
    const { extractResumeFile } = await import('../services/extractionService');

    const fakePng = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'scan.png', {
      type: 'image/png'
    });
    const pngRes = await extractResumeFile(fakePng);
    assert.equal(pngRes.success, false);
    assert.equal(pngRes.isScannedImage, true);
    assert.match(pngRes.error || '', /OCR is not supported/i);

    const unreadablePdf = new File(
      [new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length 10 >>\nstream\n\x01\x02\x03\x04\x05\nendstream\nendobj\n%%EOF')],
      'scanned.pdf',
      { type: 'application/pdf' }
    );
    const pdfRes = await extractResumeFile(unreadablePdf);
    assert.equal(pdfRes.success, false);
    assert.equal(pdfRes.isScannedImage, true);
    assert.match(pdfRes.error || '', /Manual Paste Fallback/i);
  });
});

describe('API Layer: Job Search Location, Provider Honesty & Adzuna Fail-Safe (Mocked Fetch)', () => {
  it('keeps Adzuna unconfigured with no embedded/global credentials and excludes unintegrated portals from sourcesQueried', async () => {
    const adapter = new AdzunaJobAdapter();
    assert.equal(adapter.isConfigured, false);
    assert.deepEqual(await adapter.search({ query: 'TypeScript', country: 'IN' }), []);

    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        __BYOC_ADZUNA_APP_ID: 'should-be-ignored',
        __BYOC_ADZUNA_APP_KEY: 'should-be-ignored'
      };
      assert.equal(adapter.isConfigured, false);
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = origWindow;
      }
    }
  });

  it('handles GLOBAL Worldwide mode vs country/location filtering on Remotive without sending invalid country codes', async () => {
    const requestedUrls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          jobs: [
            {
              id: 101,
              title: 'Senior TypeScript Engineer',
              company_name: 'Global Remote Co',
              candidate_required_location: 'Worldwide',
              salary: '$140k',
              publication_date: '2026-11-10T00:00:00Z',
              description: '<p>Build local-first Bengaluru or worldwide TypeScript apps.</p>',
              url: 'https://remotive.com/job/101',
              tags: ['TypeScript', 'WebCrypto']
            },
            {
              id: 102,
              title: 'TypeScript Systems Engineer',
              company_name: 'US Only Corp',
              candidate_required_location: 'USA Only',
              salary: '$150k',
              publication_date: '2026-11-10T00:00:00Z',
              description: '<p>TypeScript systems role.</p>',
              url: 'https://remotive.com/job/102',
              tags: ['TypeScript']
            },
            {
              id: 103,
              title: 'Frontend TypeScript Lead',
              company_name: 'Bengaluru Cloud',
              candidate_required_location: 'India',
              salary: 'Undisclosed',
              publication_date: '2026-11-10T00:00:00Z',
              description: '<p>Remote team operating out of Bengaluru, India.</p>',
              url: 'https://remotive.com/job/103',
              tags: ['TypeScript']
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      assert.equal(isWorldwideCountryCode('GLOBAL'), true);
      assert.equal(isWorldwideCountryCode('IN'), false);

      const engine = new LiveJobSearchEngine();

      // 1. Worldwide mode retains all remote listings and never sends country=global
      const globalRes = await engine.executeLiveSearch(
        { query: 'TypeScript', country: 'GLOBAL', location: 'ShouldBeCleared' },
        SAMPLE_PAYLOAD.masterResume,
        []
      );
      assert.equal(globalRes.error, undefined);
      assert.equal(globalRes.jobs.length, 3);
      assert.deepEqual(globalRes.sourcesQueried, ['Local Stored Positions', 'Remotive Live', 'Remote OK Live', 'Jobicy Live']);
      assert.match(globalRes.locationNotice, /Worldwide remote mode/i);
      assert.equal(requestedUrls[0].includes('global'), false);

      // 2. Country=IN excludes "USA Only" while keeping Worldwide & India listings
      const inRes = await engine.executeLiveSearch(
        { query: 'TypeScript', country: 'IN', location: 'Bengaluru' },
        SAMPLE_PAYLOAD.masterResume,
        []
      );
      assert.equal(inRes.jobs.some((j) => j.company === 'US Only Corp'), false);
      assert.equal(inRes.jobs.some((j) => j.company === 'Bengaluru Cloud'), true);
      assert.equal(inRes.jobs.some((j) => j.company === 'Global Remote Co'), true);

      const adzunaStatus = inRes.providerStatuses.find((s) => s.id === 'adzuna');
      assert.equal(adzunaStatus?.status, 'unconfigured');
      assert.equal(inRes.sourcesQueried.includes('LinkedIn'), false);
      assert.equal(inRes.sourcesQueried.includes('Adzuna Jobs API'), false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('maps free Remote OK and Jobicy public feeds without inventing fields or losing source URLs', async () => {
    const origFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('remoteok.com')) {
        return new Response(JSON.stringify([
          { legal: 'metadata row' },
          { id: 77, position: 'Security Engineer', company: 'Remote Co', location: 'Worldwide', description: '<p>TypeScript <script>fake()</script> systems role</p>', url: 'https://remoteok.com/l/77', date: '2026-11-12', tags: ['TypeScript'] },
          { id: 78, position: 'Missing URL', company: 'No Link Inc', location: 'Worldwide', description: 'Should be omitted', url: 'javascript:alert(1)' }
        ]), { status: 200 });
      }
      return new Response(JSON.stringify({ jobs: [
        { id: 88, jobTitle: 'Product Analyst', companyName: 'Jobicy Co', jobGeo: 'Anywhere', jobDescription: '<p>SQL analysis &amp; reporting; recruiterâ€™s note â€” support</p>', url: 'https://jobicy.com/jobs/88', pubDate: '2026-11-13T12:00:00Z', salaryMin: 50000, salaryMax: 70000, salaryCurrency: 'USD', salaryPeriod: 'yearly', jobIndustry: ['Analytics'] },
        { id: 89, jobTitle: 'No source link', companyName: 'Jobicy Co', jobGeo: 'Anywhere', jobDescription: 'Omitted', url: 'data:text/plain,unsafe' }
      ] }), { status: 200 });
    }) as typeof fetch;

    try {
      const remoteOk = await new RemoteOkJobAdapter().search({ query: 'engineer', country: 'GLOBAL' });
      const jobicy = await new JobicyJobAdapter().search({ query: 'analyst', country: 'GLOBAL' });
      assert.equal(remoteOk.length, 1);
      assert.equal(remoteOk[0].url, 'https://remoteok.com/l/77');
      assert.equal(remoteOk[0].jobDescriptionRaw, 'TypeScript systems role');
      assert.equal(jobicy.length, 1);
      assert.equal(jobicy[0].url, 'https://jobicy.com/jobs/88');
      assert.equal(jobicy[0].jobDescriptionRaw, 'SQL analysis & reporting; recruiter’s note — support');
      assert.equal(jobicy[0].salary, '50,000–70,000 USD / yearly');
      assert.deepEqual(jobicy[0].skillsRequired, []);
      assert.ok(urls[1].includes('count=50'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('keeps remote listings from outside the selected India market out of live results', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify([
      { id: 601, position: 'Software Engineer', company: 'Warsaw Co', location: 'Warsaw (Remote)', description: 'Role', url: 'https://remoteok.com/l/601' },
      { id: 602, position: 'Software Engineer', company: 'Palo Alto Co', location: 'Palo Alto (Remote)', description: 'Role', url: 'https://remoteok.com/l/602' },
      { id: 603, position: 'Software Engineer', company: 'Kansas Co', location: 'Kansas (Remote)', description: 'Role', url: 'https://remoteok.com/l/603' },
      { id: 604, position: 'Software Engineer', company: 'Netherlands Co', location: 'Netherlands (Remote)', description: 'Role', url: 'https://remoteok.com/l/604' },
      { id: 605, position: 'Software Engineer', company: 'India Co', location: 'India (Remote)', description: 'Role', url: 'https://remoteok.com/l/605' },
      { id: 606, position: 'Software Engineer', company: 'Worldwide Co', location: 'Worldwide (Remote)', description: 'Role', url: 'https://remoteok.com/l/606' }
    ]), { status: 200 })) as typeof fetch;

    try {
      const jobs = await new RemoteOkJobAdapter().search({ query: 'software engineer', country: 'IN' });
      assert.deepEqual(jobs.map((job) => job.company).sort(), ['India Co', 'Worldwide Co']);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('does not call remote-only providers for Hybrid or On-site searches', async () => {
    const origFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response('Unexpected feed request', { status: 500 });
    }) as typeof fetch;

    try {
      const engine = new LiveJobSearchEngine();
      for (const workplaceType of ['Hybrid', 'On-site'] as const) {
        const result = await engine.executeLiveSearch(
          { query: 'software engineer', country: 'IN', workplaceType },
          null,
          []
        );
        assert.equal(result.sourcesQueried.length, 1);
        assert.deepEqual(
          result.providerStatuses.filter((status) => ['public_open_jobs', 'remote_ok', 'jobicy'].includes(status.id)).map((status) => status.status),
          ['skipped', 'skipped', 'skipped']
        );
      }
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('surfaces Remotive 429, timeout, and network errors cleanly without discarding saved local jobs', async () => {
    const origFetch = globalThis.fetch;
    const engine = new LiveJobSearchEngine();

    try {
      // 1. Rate-limit (HTTP 429)
      globalThis.fetch = (async () => new Response('Rate limited', { status: 429 })) as typeof fetch;
      const rateLimitRes = await engine.executeLiveSearch(
        { query: 'TypeScript', country: 'IN' },
        SAMPLE_PAYLOAD.masterResume,
        SAMPLE_PAYLOAD.jobs as any
      );
      assert.match(rateLimitRes.error || '', /HTTP 429|rate limit/i);
      assert.equal(rateLimitRes.jobs.length, 1);
      assert.equal(rateLimitRes.sourcesQueried.includes('Remotive Live'), false);

      // 2. Timeout (AbortError)
      globalThis.fetch = (async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }) as typeof fetch;
      const timeoutRes = await engine.executeLiveSearch(
        { query: 'TypeScript', country: 'GLOBAL' },
        SAMPLE_PAYLOAD.masterResume,
        SAMPLE_PAYLOAD.jobs as any
      );
      assert.match(timeoutRes.error || '', /timed out/i);
      assert.equal(timeoutRes.jobs.length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('API Layer: Groq Error Handling & Recovery Hints (Mocked Fetch)', () => {
  it('surfaces missing key, 401, 429, timeout, and unreachable errors with recovery hints via formatGroqError', async () => {
    await assert.rejects(
      () => getAvailableGroqModels(''),
      (err: unknown) => err instanceof GroqApiError && err.code === 'API_KEY_MISSING' && Boolean(err.recoveryHint)
    );

    await assert.rejects(
      () => vetJobWithGroq(SAMPLE_PAYLOAD.jobs[0] as any, SAMPLE_PAYLOAD.masterResume as any, ''),
      (err: unknown) => err instanceof GroqApiError && err.code === 'API_KEY_REQUIRED' && Boolean(err.recoveryHint)
    );

    const origFetch = globalThis.fetch;
    try {
      // 1. Invalid key (401)
      globalThis.fetch = (async () => new Response('Unauthorized', { status: 401 })) as typeof fetch;
      await assert.rejects(
        () => getAvailableGroqModels('gsk_invalid'),
        (err: unknown) => {
          assert.ok(err instanceof GroqApiError);
          assert.equal(err.status, 401);
          assert.match(formatGroqError(err), /console\.groq\.com/i);
          return true;
        }
      );

      // 2. Rate limit (429) on chat tailoring
      let callCount = 0;
      globalThis.fetch = (async (url: RequestInfo | URL) => {
        callCount++;
        if (String(url).includes('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile', object: 'model' }] }), {
            status: 200
          });
        }
        return new Response(JSON.stringify({ error: { message: 'Too many requests' } }), { status: 429 });
      }) as typeof fetch;

      await assert.rejects(
        () => tailorResumeWithGroq(SAMPLE_PAYLOAD.jobs[0] as any, SAMPLE_PAYLOAD.masterResume as any, 'gsk_valid'),
        (err: unknown) => {
          assert.ok(err instanceof GroqApiError);
          assert.equal(err.status, 429);
          assert.match(formatGroqError(err), /Wait 30 to 60 seconds/i);
          return true;
        }
      );
      assert.ok(callCount >= 1);

      // 3. Timeout & network unreachable on model probe
      globalThis.fetch = (async () => {
        const abortErr = new Error('Timed out');
        abortErr.name = 'AbortError';
        throw abortErr;
      }) as typeof fetch;
      await assert.rejects(
        () => getAvailableGroqModels('gsk_valid'),
        (err: unknown) => err instanceof GroqApiError && err.code === 'TIMEOUT'
      );

      globalThis.fetch = (async () => {
        throw new Error('Failed to fetch');
      }) as typeof fetch;
      await assert.rejects(
        () => getAvailableGroqModels('gsk_valid'),
        (err: unknown) => err instanceof GroqApiError && err.code === 'NETWORK_ERROR'
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Evidence-Referenced Questionnaire Draft Validation', () => {
  const candidateEvidence = JSON.stringify({
    summary: 'Operations analyst with experience improving reporting workflows.',
    experiences: [{ company: 'Northstar', bullets: ['Reduced monthly reporting time by 30%.'] }]
  });

  it('accepts a concise answer whose quoted evidence is an exact resume excerpt', () => {
    const result = validateQuestionnaireDraft(
      {
        answer: 'I improved a reporting workflow and reduced monthly reporting time by 30%.',
        evidenceUsed: ['Reduced monthly reporting time by 30%.']
      },
      candidateEvidence
    );
    assert.equal(result.evidenceUsed.length, 1);
    assert.equal(result.answer.includes('30%'), true);
  });

  it('rejects fabricated evidence references and empty answers', () => {
    assert.throws(
      () => validateQuestionnaireDraft({ answer: 'Managed a global team of 20.', evidenceUsed: ['Managed a global team of 20.'] }, candidateEvidence),
      /does not appear in the Master Resume/i
    );
    assert.throws(
      () => validateQuestionnaireDraft({ answer: '  ', evidenceUsed: [] }, candidateEvidence),
      /empty or exceeded/i
    );
    assert.throws(
      () => validateQuestionnaireDraft({ answer: 'I have 10 years of experience.', evidenceUsed: [] }, candidateEvidence),
      /without citing Master Resume evidence/i
    );
    assert.match(
      validateQuestionnaireDraft(
        { answer: 'The Master Resume does not specify this information. Please provide your answer before using this draft.', evidenceUsed: [] },
        candidateEvidence
      ).answer,
      /does not specify/i
    );
  });
});

describe('Optional Groq Resume Structuring Safety', () => {
  it('preserves extracted source text and stats, and keeps local sections when the AI omits them', () => {
    const local = SAMPLE_PAYLOAD.masterResume as MasterResume;
    const structured = mergeGroqResumeProfile(
      {
        headline: 'Platform Architect',
        summary: 'Structured summary for candidate review.',
        skills: { technical: ['TypeScript'] },
        experiences: [{ company: 'Northstar Systems', role: 'Platform Architect', bullets: ['Built local AES-256-GCM encryption boundaries.'] }]
      },
      local
    );

    assert.equal(structured.rawText, local.rawText);
    assert.deepEqual(structured.stats, local.stats);
    assert.deepEqual(structured.skills.soft, local.skills.soft);
    assert.deepEqual(structured.education, local.education);
    assert.equal(structured.experiences[0].company, 'Northstar Systems');
    assert.equal(structured.experiences[0].id, 'groq-exp-1');
  });

  it('rejects a malformed AI profile instead of replacing the local parse', () => {
    assert.throws(() => mergeGroqResumeProfile(null, SAMPLE_PAYLOAD.masterResume as MasterResume), /not a JSON object/i);
  });

  it('sends resume text only after the explicit service call and keeps the parsed result reviewable', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body?: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ headline: 'Platform Architect', experiences: [] }) } }]
      }), { status: 200 });
    }) as typeof fetch;

    try {
      const local = SAMPLE_PAYLOAD.masterResume as MasterResume;
      const result = await parseResumeWithGroq(local, 'gsk_TEST_ONLY_NOT_A_REAL_KEY');
      assert.equal(result.rawText, local.rawText);
      assert.equal(result.stats.sourceFileName, local.stats.sourceFileName);
      assert.equal(result.headline, 'Platform Architect');
      assert.equal(result.experiences[0].company, local.experiences[0].company);
      assert.equal(requests.some((request) => request.url.includes('/chat/completions')), true);
      assert.equal(requests.some((request) => request.body?.includes(local.rawText)), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Portal Shortcuts, URL Sanitization, User Import Filter & Application Snapshots', () => {
  it('sanitizes external HTTP/HTTPS URLs and rejects unsafe or placeholder links', () => {
    assert.equal(sanitizeExternalHttpUrl('https://www.glassdoor.com/Job/123'), 'https://www.glassdoor.com/Job/123');
    assert.equal(sanitizeExternalHttpUrl('  http://example.org/apply  '), 'http://example.org/apply');
    assert.equal(sanitizeExternalHttpUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeExternalHttpUrl('data:text/html,<h1>x</h1>'), null);
    assert.equal(sanitizeExternalHttpUrl('#'), null);
    assert.equal(sanitizeExternalHttpUrl(''), null);
    assert.equal(sanitizeExternalHttpUrl('not a url'), null);
  });

  it('provides Glassdoor built-in shortcut, interpolates queries cleanly, and merges valid custom shortcuts safely', () => {
    const glassdoor = DEFAULT_PORTAL_SHORTCUTS.find((p) => p.name === 'Glassdoor');
    assert.ok(glassdoor);
    assert.equal(glassdoor.isBuiltIn, true);
    assert.match(glassdoor.note || '', /Shortcut only/i);

    const glassdoorUrl = buildPortalShortcutUrl(glassdoor.searchUrlTemplate, 'Staff Security Engineer');
    assert.equal(glassdoorUrl, 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword=Staff%20Security%20Engineer');

    const naukri = DEFAULT_PORTAL_SHORTCUTS.find((p) => p.name === 'Naukri');
    assert.ok(naukri);
    assert.equal(
      buildPortalShortcutUrl(naukri.searchUrlTemplate, 'React Lead'),
      'https://www.naukri.com/react-lead-jobs'
    );

    const merged = mergePortalShortcuts([
      {
        id: 'custom-wellfound',
        name: 'Wellfound',
        searchUrlTemplate: 'https://wellfound.com/jobs?q={query}',
        isBuiltIn: false
      },
      {
        id: 'bad-xss',
        name: 'Bad',
        searchUrlTemplate: 'javascript:alert(1)',
        isBuiltIn: false
      }
    ]);

    assert.equal(merged.some((p) => p.id === 'custom-wellfound'), true);
    assert.equal(merged.some((p) => p.id === 'bad-xss'), false);
    assert.equal(merged.some((p) => p.id === 'portal-glassdoor'), true);
  });

  it('filters "User Import" portal to include Glassdoor/pasted jobs while excluding Remotive Live', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('remoteok.com')
        ? [{ id: 502, position: 'TypeScript Remote Engineer', company: 'Remote OK Org', location: 'Worldwide', description: 'TypeScript role', url: 'https://remoteok.com/l/502', tags: ['TypeScript'] }]
        : url.includes('jobicy.com')
          ? { jobs: [{ id: 503, jobTitle: 'TypeScript Remote Analyst', companyName: 'Jobicy Org', jobGeo: 'Anywhere', jobDescription: 'TypeScript role', url: 'https://jobicy.com/jobs/503' }] }
          : {
          jobs: [
            {
              id: 501,
              title: 'Remote Platform Engineer',
              company_name: 'Remotive Org',
              candidate_required_location: 'Worldwide',
              salary: '$130k',
              publication_date: '2026-11-10T00:00:00Z',
              description: '<p>TypeScript platform role.</p>',
              url: 'https://remotive.com/job/501',
              tags: ['TypeScript']
            }
          ]
        };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    try {
      const engine = new LiveJobSearchEngine();
      const glassdoorJob = {
        ...SAMPLE_PAYLOAD.jobs[0],
        id: 'imported-gd-1',
        title: 'TypeScript Security Architect',
        company: 'Glassdoor Paste Corp',
        source: 'Glassdoor',
        url: 'https://www.glassdoor.com/job-listing/example'
      };

      const res = await engine.executeLiveSearch(
        { query: 'TypeScript', country: 'GLOBAL', portal: 'User Import' },
        SAMPLE_PAYLOAD.masterResume,
        [glassdoorJob as any]
      );

      assert.equal(res.jobs.length, 1);
      assert.equal(res.jobs[0].id, 'imported-gd-1');
      assert.equal(res.jobs[0].source, 'Glassdoor');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('builds frozen ApplicationRecord snapshots carrying URL, portal source, skills, and exported materials safely', () => {
    const tailoredSnapshot = {
      id: 'art-1',
      jobId: 'job-1',
      jobTitle: 'Staff Security Engineer',
      company: 'Acme Cloud',
      selectedVariantId: 'var-a',
      variants: [],
      tailoredSummary: 'Tailored cryptographic engineering summary.',
      highlightedSkills: ['TypeScript', 'WebCrypto'],
      optimizedBullets: [
        {
          experienceId: 'exp-1',
          company: 'Northstar Systems',
          role: 'Principal Platform Architect',
          originalBullet: 'Built local AES-256-GCM encryption boundaries.',
          tailoredBullet: 'Architected local AES-256-GCM client-side key-wrapping boundaries.',
          matchRationale: 'Matches WebCrypto requirement'
        }
      ],
      coverLetter: 'Dear Hiring Team...',
      interviewPrepQuestions: [
        {
          question: 'How did you design key wrapping?',
          category: 'Architecture' as const,
          suggestedTalkingPoints: ['Explain PBKDF2 to AES-KW wrapping flow'],
          authenticEvidenceRef: 'Northstar Systems: Built local AES-256-GCM encryption boundaries.'
        }
      ],
      generationTimestamp: '2026-11-12T00:00:00.000Z',
      authenticityGuaranteed: true,
      exportedMaterials: [
        {
          id: 'exp-1',
          format: 'PDF' as const,
          fileName: 'Acme_Resume.pdf',
          exportedAt: '2026-11-12T01:00:00.000Z',
          variantName: 'Technical Architect'
        }
      ]
    };

    const fullApp = buildApplicationSnapshotRecord({
      job: {
        ...SAMPLE_PAYLOAD.jobs[0],
        source: 'Glassdoor',
        url: 'https://www.glassdoor.com/job-listing/999'
      } as any,
      existingTailored: tailoredSnapshot,
      notes: 'Submitted after verifying links.'
    });

    assert.equal(fullApp.status, 'Saved');
    assert.equal(fullApp.portalSource, 'Glassdoor');
    assert.equal(fullApp.jobUrl, 'https://www.glassdoor.com/job-listing/999');
    assert.deepEqual(fullApp.skillsRequired, ['TypeScript', 'WebCrypto']);
    assert.equal(fullApp.exportedMaterials?.length, 1);
    assert.equal(fullApp.exportedMaterials?.[0].fileName, 'Acme_Resume.pdf');

    // Legacy / missing link ("#") produces undefined jobUrl and baseline snapshot
    const baselineApp = buildApplicationSnapshotRecord({
      job: {
        ...SAMPLE_PAYLOAD.jobs[0],
        url: '#',
        skillsRequired: []
      } as any,
      existingTailored: null,
      masterResumeSummary: 'Original candidate summary'
    });

    assert.equal(baselineApp.jobUrl, undefined);
    assert.equal(baselineApp.skillsRequired, undefined);
    assert.equal(baselineApp.exportedMaterials, undefined);
    assert.equal(
      typeof baselineApp.tailoredResumeSnapshot !== 'string' &&
        baselineApp.tailoredResumeSnapshot.tailoredSummary,
      'Original candidate summary'
    );
  });
});

describe('Tailored Bullet Verification & Complete Master Resume Preservation Across Preview and Exports', () => {
  const RICH_MASTER_RESUME: MasterResume = {
    rawText: 'Nandini Rao — Principal Security Architect',
    contactInfo: {
      name: 'Nandini Rao',
      email: 'nandini.rao@example.org',
      phone: '+91-9000000000',
      location: 'Bengaluru, IN',
      linkedin: 'https://linkedin.com/in/nandini-rao',
      github: 'https://github.com/nandinirao',
      portfolio: 'https://nandinirao.dev'
    },
    headline: 'Principal Security & Distributed Systems Architect',
    summary: 'Architecting zero-knowledge client cryptography and low-latency APIs.',
    skills: {
      technical: ['TypeScript', 'WebCrypto', 'Rust', 'Go'],
      soft: ['Technical Mentorship'],
      tools: ['Docker', 'Kubernetes'],
      domains: ['Applied Cryptography']
    },
    experiences: [
      {
        id: 'exp-northstar',
        company: 'Northstar Systems',
        role: 'Principal Security Architect',
        startDate: '2022',
        endDate: 'Present',
        location: 'Bengaluru',
        isCurrent: true,
        bullets: [
          'Built local AES-256-GCM encryption boundaries.',
          'Led 6 engineers across key management and offline recovery.'
        ]
      },
      {
        id: 'exp-helios',
        company: 'Helios Cloud',
        role: 'Senior Backend Engineer',
        startDate: '2019',
        endDate: '2022',
        location: 'Hyderabad',
        isCurrent: false,
        bullets: [
          'Reduced RPC tail latency by 38% across multi-region clusters.',
          'Migrated legacy session store to zero-downtime stateless tokens.'
        ]
      }
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'IIIT Hyderabad',
        degree: 'M.Tech',
        field: 'Computer Science',
        gradYear: '2019',
        gpa: '9.4/10'
      }
    ],
    projects: [
      {
        id: 'proj-1',
        title: 'CipherVault CLI',
        description: 'Zero-dependency WebCrypto envelope inspector for browser and Node backups.',
        technologies: ['TypeScript', 'WebCrypto'],
        link: 'https://github.com/nandinirao/ciphervault'
      }
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'Certified Information Systems Security Professional (CISSP)',
        issuer: 'ISC2',
        issueDate: '2023'
      }
    ],
    stats: {
      wordCount: 95,
      pageCount: 1,
      charCount: 680,
      lastParsedDate: '2026-11-12T00:00:00.000Z',
      sourceFileName: 'nandini_rich_resume.pdf'
    }
  };

  it('rejects index/first-experience fallbacks and flags unmapped AI bullets without fabricating source or experience metadata', () => {
    const rawGroqOutput = {
      variants: [
        {
          id: 'variant-a',
          name: 'Variant A',
          badge: 'Leadership & Scale',
          description: 'Leadership angle',
          tailoredSummary: 'Tailored executive security summary.',
          highlightedSkills: ['TypeScript', 'WebCrypto', 'InventedCloudPlatform'],
          optimizedBullets: [
            // 1. Valid exact match targeting second experience (index 1, NOT 0)
            {
              experienceId: 'exp-helios',
              company: 'Helios Cloud',
              role: 'Senior Backend Engineer',
              originalBullet: 'Reduced RPC tail latency by 38% across multi-region clusters.',
              tailoredBullet: 'Cut multi-region RPC p99 tail latency by 38% for high-throughput security services.',
              matchRationale: 'Matches performance & distributed scale requirement.'
            },
            // 2. Unmapped: missing experienceId, company, role, and originalBullet (previously fell back to exp[bIdx]/exp[0] & bullets[0])
            {
              tailoredBullet: 'Invented unanchored bullet that must never overwrite Northstar or Helios.'
            },
            // 3. Unmapped: non-existent originalBullet claimed under Northstar
            {
              experienceId: 'exp-northstar',
              company: 'Northstar Systems',
              role: 'Principal Security Architect',
              originalBullet: 'Fabricated bullet text not in master resume.',
              tailoredBullet: 'Should be flagged unmapped and ignored.'
            },
            // 4. Unmapped: conflicting experienceId vs company
            {
              experienceId: 'exp-northstar',
              company: 'Helios Cloud',
              originalBullet: 'Built local AES-256-GCM encryption boundaries.',
              tailoredBullet: 'Conflicting experience details must not pass.'
            }
          ],
          coverLetter: 'Dear Hiring Manager,',
          interviewPrepQuestions: []
        },
        { id: 'variant-b', optimizedBullets: [], interviewPrepQuestions: [] },
        { id: 'variant-c', optimizedBullets: [], interviewPrepQuestions: [] }
      ]
    };

    const artifact = validateTailoredOutput(rawGroqOutput, SAMPLE_PAYLOAD.jobs[0] as any, RICH_MASTER_RESUME);
    const { verified, unmapped } = partitionTailoredBullets(artifact.optimizedBullets, RICH_MASTER_RESUME);

    assert.equal(artifact.authenticityGuaranteed, false);
    assert.deepEqual(artifact.highlightedSkills, ['TypeScript', 'WebCrypto']);
    assert.equal(verified.length, 1);
    assert.equal(verified[0].experienceId, 'exp-helios');
    assert.equal(verified[0].verified, true);
    assert.equal(
      verified[0].tailoredBullet,
      'Cut multi-region RPC p99 tail latency by 38% for high-throughput security services.'
    );

    assert.equal(unmapped.length, 3);
    // Item 2 must have NO fabricated company/role/experienceId/originalBullet
    assert.equal(unmapped[0].verified, false);
    assert.equal(unmapped[0].experienceId, '');
    assert.equal(unmapped[0].company, '');
    assert.equal(unmapped[0].role, '');
    assert.equal(unmapped[0].originalBullet, '');
    assert.ok(unmapped[0].unmappedReason);

    // Non-matching or missing experience must never fall back to experiences[0]
    const directCheck = verifyTailoredBulletAgainstMaster(
      { tailoredBullet: 'Standalone unmapped text' },
      RICH_MASTER_RESUME
    );
    assert.equal(directCheck.matched, false);
    assert.equal(directCheck.bullet.verified, false);
    assert.equal(directCheck.bullet.company, '');
    assert.equal(directCheck.bullet.originalBullet, '');
  });

  it('preserves every original experience, unmatched bullet, education, projects, certifications, and contact links identically in preview, TXT, PDF, and DOCX', async () => {
    const zlib = await import('node:zlib');

    const artifact = validateTailoredOutput(
      {
        variants: [
          {
            id: 'variant-a',
            tailoredSummary: 'Targeted Staff Security Architect summary.',
            highlightedSkills: ['TypeScript', 'WebCrypto'],
            optimizedBullets: [
              // Only replace 1 bullet in exp-helios; leave the other 3 master bullets untouched!
              {
                experienceId: 'exp-helios',
                company: 'Helios Cloud',
                role: 'Senior Backend Engineer',
                originalBullet: 'Reduced RPC tail latency by 38% across multi-region clusters.',
                tailoredBullet: 'Engineered 38% p99 latency reduction across multi-region Helios Cloud RPC clusters.',
                matchRationale: 'Highlights distributed latency tuning.'
              },
              // Unmapped bullet must NOT appear in preview or any export
              {
                company: 'Ghost Corp',
                originalBullet: 'Nonexistent bullet text.',
                tailoredBullet: 'UNMAPPED_HALLUCINATED_BULLET_MARKER'
              }
            ],
            coverLetter: 'Sincerely, Nandini Rao',
            interviewPrepQuestions: []
          },
          { id: 'variant-b', optimizedBullets: [], interviewPrepQuestions: [] },
          { id: 'variant-c', optimizedBullets: [], interviewPrepQuestions: [] }
        ]
      },
      SAMPLE_PAYLOAD.jobs[0] as any,
      RICH_MASTER_RESUME
    );

    // 1. Shared preview / export resolution
    const resolved = resolveTailoredResumeForExportAndPreview(artifact, RICH_MASTER_RESUME);
    assert.equal(resolved.experiences.length, 2);
    assert.deepEqual(
      resolved.experiences[0].bullets.map((b) => ({ text: b.text, isTailored: b.isTailored })),
      [
        { text: 'Built local AES-256-GCM encryption boundaries.', isTailored: false },
        { text: 'Led 6 engineers across key management and offline recovery.', isTailored: false }
      ]
    );
    assert.deepEqual(
      resolved.experiences[1].bullets.map((b) => ({ text: b.text, isTailored: b.isTailored })),
      [
        {
          text: 'Engineered 38% p99 latency reduction across multi-region Helios Cloud RPC clusters.',
          isTailored: true
        },
        {
          text: 'Migrated legacy session store to zero-downtime stateless tokens.',
          isTailored: false
        }
      ]
    );
    assert.equal(resolved.unmappedBullets.length, 1);
    assert.equal(resolved.contactLinks.length, 3);

    const expectedPreservedStrings = [
      'https://linkedin.com/in/nandini-rao',
      'https://github.com/nandinirao',
      'https://nandinirao.dev',
      'Built local AES-256-GCM encryption boundaries.',
      'Led 6 engineers across key management and offline recovery.',
      'Engineered 38% p99 latency reduction across multi-region Helios Cloud RPC clusters.',
      'Migrated legacy session store to zero-downtime stateless tokens.',
      'CipherVault CLI',
      'https://github.com/nandinirao/ciphervault',
      'IIIT Hyderabad',
      '9.4/10',
      'Certified Information Systems Security Professional (CISSP)',
      'ISC2'
    ];

    // 2. TXT Export
    const txt = generatePlainTextResume(artifact, RICH_MASTER_RESUME);
    for (const s of expectedPreservedStrings) {
      assert.equal(txt.includes(s), true, `TXT export missing expected content: ${s}`);
    }
    assert.equal(txt.includes('UNMAPPED_HALLUCINATED_BULLET_MARKER'), false);

    // 3. DOCX Export (extract real word/document.xml text via extractResumeFile)
    const docxBlob = await generateDocxResume(artifact, RICH_MASTER_RESUME);
    const docxBytes = new Uint8Array(await docxBlob.arrayBuffer());
    const { extractResumeFile } = await import('../services/extractionService');
    const docxFile = new File([docxBytes], 'tailored.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const parsedDocx = await extractResumeFile(docxFile);
    assert.equal(parsedDocx.success, true);
    for (const s of expectedPreservedStrings) {
      assert.equal(parsedDocx.rawText.includes(s), true, `DOCX export missing expected content: ${s}`);
    }
    assert.equal(parsedDocx.rawText.includes('UNMAPPED_HALLUCINATED_BULLET_MARKER'), false);

    // 4. PDF Export (load via pdf-lib and decompress PDF content streams to verify all sections & links)
    const pdfBlob = await generatePdfResume(artifact, RICH_MASTER_RESUME);
    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    const { PDFDocument } = await import('pdf-lib');
    const loadedPdf = await PDFDocument.load(pdfBuffer);
    assert.ok(loadedPdf.getPageCount() >= 1);

    const pdfLatin1 = pdfBuffer.toString('latin1');
    let decompressedStreams = pdfLatin1;
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(pdfLatin1)) !== null) {
      const rawStream = Buffer.from(match[1], 'latin1');
      try {
        decompressedStreams += '\n' + zlib.inflateSync(rawStream).toString('latin1');
      } catch {
        // Not a zlib stream; ignore
      }
    }

    // Reconstruct PDF text runs (<hex> Tj used by pdf-lib StandardFonts and (...) Tj literals) so wrapped lines match reliably
    const pdfStrings: string[] = [];
    const textOpRegex = /(?:\(([^()]*(?:\\.[^()]*)*)\)|<([0-9A-Fa-f]+)>)\s*Tj/g;
    let textOpMatch: RegExpExecArray | null;
    while ((textOpMatch = textOpRegex.exec(decompressedStreams)) !== null) {
      if (textOpMatch[1] !== undefined) {
        pdfStrings.push(textOpMatch[1].replace(/\\([()\\])/g, '$1'));
      } else if (textOpMatch[2] !== undefined && textOpMatch[2].length % 2 === 0) {
        pdfStrings.push(Buffer.from(textOpMatch[2], 'hex').toString('latin1'));
      }
    }
    const normalizedPdfText = pdfStrings.join(' ').replace(/\s+/g, ' ');

    assert.equal(pdfStrings.length > 0, true, 'PDF export produced readable text runs');
    for (const s of expectedPreservedStrings) {
      assert.equal(normalizedPdfText.includes(s), true, `PDF export missing expected content: ${s}`);
    }
    assert.equal(normalizedPdfText.includes('UNMAPPED_HALLUCINATED_BULLET_MARKER'), false);
  });
});




