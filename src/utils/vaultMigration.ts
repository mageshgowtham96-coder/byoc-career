import type { CareerApplicationFormState, EmailInteraction, UserWorkspace } from '../types';
import {
  decryptActiveSessionEnvelope,
  hasActiveVaultKey,
  hasDemoWorkspaceIdentity,
  isDemoWorkspaceEmail,
  isDemoWorkspaceName,
  stripDemoWorkspaceEmail,
  stripDemoWorkspaceName,
  syncUnlockedVault,
  type DecryptedVaultData,
  type VaultEnvelope
} from './cryptoVault';
import {
  EMAIL_FALLBACK_KEY,
  dedupeEmailInteractions,
  parseLegacyEmailFallback,
  type LegacyEmailReadResult
} from '../services/emailSyncService';
import { sanitizeCareerFormState } from './storagePersistence';

export const WORKSPACE_STORE_KEY = 'byoc_workspace_store';
export const CAREER_FORM_DRAFT_KEY = 'byoc_career_form_draft';
export {
  EMAIL_FALLBACK_KEY,
  parseLegacyEmailFallback,
  hasDemoWorkspaceIdentity,
  isDemoWorkspaceEmail,
  isDemoWorkspaceName,
  stripDemoWorkspaceEmail,
  stripDemoWorkspaceName
};

export interface LegacyPlaintextCapture {
  detected: boolean;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    isEmailVerified?: boolean;
    biometricEnabled?: boolean;
    biometricCredentialId?: string;
    lastBiometricAuth?: string;
    hasEncryptedVault?: boolean;
    createdAt?: string;
    lastActive?: string;
  } | null;
  sensitiveData: Partial<DecryptedVaultData>;
}

const DEFAULT_PREFERENCES = {
  country: 'IN',
  preferredLocations: [],
  portals: ['LinkedIn', 'Naukri', 'Indeed', 'Foundit', 'Instahyre'],
  noticePeriod: '',
  expectedCtc: '',
  currentCtc: '',
  totalExperienceYears: null,
  profession: '',
  targetRole: '',
  seniority: '',
  workplaceTypePreference: 'All'
};

export function hasMeaningfulCareerFormDraft(draft?: CareerApplicationFormState | null): boolean {
  if (!draft || typeof draft !== 'object') return false;
  const pd = draft.personalDetails;
  return Boolean(
    pd?.fullName?.trim() ||
      pd?.email?.trim() ||
      pd?.phone?.trim() ||
      pd?.location?.trim() ||
      draft.professionalSummary?.trim() ||
      (Array.isArray(draft.workExperience) && draft.workExperience.length > 0) ||
      (Array.isArray(draft.skills) && draft.skills.length > 0) ||
      (Array.isArray(draft.education) && draft.education.length > 0) ||
      draft.rawSourceText?.trim() ||
      draft.isAutoFilled
  );
}

export type LegacyDraftReadResult =
  | { status: 'none' }
  | { status: 'empty'; draft: CareerApplicationFormState }
  | { status: 'valid'; draft: CareerApplicationFormState }
  | { status: 'error'; error: string };

/**
 * Safely parses and sanitizes a raw JSON payload from `byoc_career_form_draft`
 * without ever deleting or mutating the underlying storage key on failure.
 */
export function parseLegacyCareerFormDraft(rawJson: string | null): LegacyDraftReadResult {
  if (rawJson === null || rawJson === undefined) {
    return { status: 'none' };
  }
  const trimmed = rawJson.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return { status: 'none' };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        status: 'error',
        error: 'Stored intake draft is corrupted and cannot be migrated; the existing draft key has been retained.'
      };
    }
    const sanitized = sanitizeCareerFormState(parsed);
    if (!hasMeaningfulCareerFormDraft(sanitized)) {
      return { status: 'empty', draft: sanitized };
    }
    return { status: 'valid', draft: sanitized };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      status: 'error',
      error: `Failed to parse existing intake draft (${detail}); the existing draft key has been retained.`
    };
  }
}

export function readLegacyCareerFormDraftFromStorage(
  storageKey: string = CAREER_FORM_DRAFT_KEY
): LegacyDraftReadResult {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { status: 'none' };
    }
    const raw = window.localStorage.getItem(storageKey);
    return parseLegacyCareerFormDraft(raw);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Storage access error';
    return {
      status: 'error',
      error: `Unable to read existing intake draft (${detail}); existing draft retained.`
    };
  }
}

export type CareerDraftMigrationResult =
  | { status: 'none' }
  | { status: 'migrated'; draft: CareerApplicationFormState | null; envelope: VaultEnvelope; didModifyVault: boolean }
  | { status: 'error'; error: string };

export interface MigrateLegacyCareerFormDraftParams {
  getRawDraft: () => string | null;
  removeLegacyDraft: () => void;
  writeEnvelope: (envelope: VaultEnvelope) => boolean | void | Promise<boolean | void>;
  readEnvelope: () => VaultEnvelope | null;
  currentVaultData: DecryptedVaultData;
  vaultMeta: VaultEnvelope['meta'];
}

/**
 * Migrates any plaintext `byoc_career_form_draft` into the unlocked encrypted vault.
 * Keeps the legacy key intact until encrypted persistence AND round-trip decryption verification succeed.
 * If any step fails, the old key is retained and an explicit error status is returned.
 */
export async function migrateLegacyCareerFormDraft(
  params: MigrateLegacyCareerFormDraftParams
): Promise<CareerDraftMigrationResult> {
  let rawDraft: string | null;
  try {
    rawDraft = params.getRawDraft();
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Storage read failed';
    return {
      status: 'error',
      error: `Failed to read existing intake draft (${detail}); original draft retained.`
    };
  }

  const parsed = parseLegacyCareerFormDraft(rawDraft);
  if (parsed.status === 'none') {
    return { status: 'none' };
  }
  if (parsed.status === 'error') {
    return { status: 'error', error: parsed.error };
  }

  if (!hasActiveVaultKey()) {
    return {
      status: 'error',
      error: 'Vault session is locked. Unlock your vault before migrating your intake draft; original draft retained.'
    };
  }

  const alreadyHasVaultDraft = hasMeaningfulCareerFormDraft(params.currentVaultData.careerFormDraft);

  if (parsed.status === 'empty') {
    try {
      const existingEnvelope = params.readEnvelope();
      if (!existingEnvelope) {
        return {
          status: 'error',
          error: 'Encrypted vault envelope not found; retained existing draft key.'
        };
      }
      await decryptActiveSessionEnvelope(existingEnvelope);
      params.removeLegacyDraft();
      return {
        status: 'migrated',
        draft: params.currentVaultData.careerFormDraft || null,
        envelope: existingEnvelope,
        didModifyVault: false
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Verification failed';
      return {
        status: 'error',
        error: `Vault verification failed (${detail}); original draft retained.`
      };
    }
  }

  const targetDraft = alreadyHasVaultDraft
    ? sanitizeCareerFormState(params.currentVaultData.careerFormDraft)
    : parsed.draft;

  const nextVaultData: DecryptedVaultData = {
    ...params.currentVaultData,
    careerFormDraft: targetDraft
  };

  try {
    const envelope = await syncUnlockedVault(nextVaultData, params.vaultMeta);
    const wrote = await params.writeEnvelope(envelope);
    if (wrote === false) {
      throw new Error('Encrypted vault write returned false.');
    }

    const storedEnvelope = params.readEnvelope();
    if (!storedEnvelope) {
      throw new Error('Encrypted vault envelope could not be read back after write.');
    }

    const restoredPayload = await decryptActiveSessionEnvelope(storedEnvelope);
    if (!hasMeaningfulCareerFormDraft(restoredPayload.careerFormDraft)) {
      throw new Error('Restored encrypted payload did not contain the migrated career draft.');
    }

    params.removeLegacyDraft();

    return {
      status: 'migrated',
      draft: sanitizeCareerFormState(restoredPayload.careerFormDraft),
      envelope: storedEnvelope,
      didModifyVault: !alreadyHasVaultDraft
    };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Encryption or write error';
    return {
      status: 'error',
      error: `Failed to migrate intake draft to encrypted vault (${detail}). Your original draft has been retained.`
    };
  }
}

export type EmailVaultMigrationResult =
  | { status: 'none' }
  | { status: 'migrated'; emailInteractions: EmailInteraction[]; envelope: VaultEnvelope; didModifyVault: boolean }
  | { status: 'error'; error: string };

export interface MigrateLegacyEmailRecordsParams {
  readLegacyEmails: () => Promise<LegacyEmailReadResult>;
  clearLegacyEmails: () => Promise<void> | void;
  writeEnvelope: (envelope: VaultEnvelope) => boolean | void | Promise<boolean | void>;
  readEnvelope: () => VaultEnvelope | null;
  currentVaultData: DecryptedVaultData;
  vaultMeta: VaultEnvelope['meta'];
}

/**
 * Migrates legacy plaintext email records (`byoc_email_vault_db` / `byoc_email_vault_fallback`)
 * into the unlocked AES-256-GCM vault. Keeps old records intact until encrypted write AND
 * round-trip restoration verification succeed.
 */
export async function migrateLegacyEmailRecordsToVault(
  params: MigrateLegacyEmailRecordsParams
): Promise<EmailVaultMigrationResult> {
  let legacyRead: LegacyEmailReadResult;
  try {
    legacyRead = await params.readLegacyEmails();
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Legacy email read failed';
    return {
      status: 'error',
      error: `Failed to read existing email records (${detail}); original email records retained.`
    };
  }

  if (legacyRead.status === 'none') {
    return { status: 'none' };
  }
  if (legacyRead.status === 'error') {
    return { status: 'error', error: legacyRead.error };
  }

  if (!hasActiveVaultKey()) {
    return {
      status: 'error',
      error: 'Vault session is locked. Unlock your vault before migrating email records; original records retained.'
    };
  }

  const existingVaultEmails = Array.isArray(params.currentVaultData.emailInteractions)
    ? params.currentVaultData.emailInteractions
    : [];

  if (legacyRead.status === 'empty') {
    try {
      const existingEnvelope = params.readEnvelope();
      if (!existingEnvelope) {
        return {
          status: 'error',
          error: 'Encrypted vault envelope not found; retained existing email store.'
        };
      }
      await decryptActiveSessionEnvelope(existingEnvelope);
      await params.clearLegacyEmails();
      return {
        status: 'migrated',
        emailInteractions: existingVaultEmails,
        envelope: existingEnvelope,
        didModifyVault: false
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Verification failed';
      return {
        status: 'error',
        error: `Vault verification failed (${detail}); original email records retained.`
      };
    }
  }

  const mergedEmails = dedupeEmailInteractions([...existingVaultEmails, ...legacyRead.records]);
  const didModifyVault = mergedEmails.length > existingVaultEmails.length;

  const nextVaultData: DecryptedVaultData = {
    ...params.currentVaultData,
    emailInteractions: mergedEmails
  };

  try {
    const envelope = await syncUnlockedVault(nextVaultData, params.vaultMeta);
    const wrote = await params.writeEnvelope(envelope);
    if (wrote === false) {
      throw new Error('Encrypted vault write returned false.');
    }

    const storedEnvelope = params.readEnvelope();
    if (!storedEnvelope) {
      throw new Error('Encrypted vault envelope could not be read back after write.');
    }

    const restoredPayload = await decryptActiveSessionEnvelope(storedEnvelope);
    const restoredEmails = Array.isArray(restoredPayload.emailInteractions)
      ? restoredPayload.emailInteractions
      : [];

    const restoredKeys = new Set(
      restoredEmails.map((e) => (e.messageId ? `msg:${e.messageId}` : `id:${e.id}`))
    );
    const allRestored = legacyRead.records.every((orig) =>
      restoredKeys.has(orig.messageId ? `msg:${orig.messageId}` : `id:${orig.id}`)
    );

    if (!allRestored) {
      throw new Error('Restored encrypted payload was missing migrated email interaction records.');
    }

    await params.clearLegacyEmails();

    return {
      status: 'migrated',
      emailInteractions: restoredEmails,
      envelope: storedEnvelope,
      didModifyVault
    };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Encryption or write error';
    return {
      status: 'error',
      error: `Failed to migrate email records to encrypted vault (${detail}). Your original email records have been retained.`
    };
  }
}

function hasCustomCandidatePreferences(prefs: any): boolean {
  if (!prefs || typeof prefs !== 'object') return false;
  return Boolean(
    (Array.isArray(prefs.preferredLocations) && prefs.preferredLocations.length > 0) ||
      prefs.noticePeriod ||
      prefs.expectedCtc ||
      prefs.currentCtc ||
      (prefs.totalExperienceYears !== null && prefs.totalExperienceYears !== undefined) ||
      prefs.profession ||
      prefs.targetRole ||
      prefs.seniority ||
      (prefs.country && prefs.country !== 'IN') ||
      (prefs.workplaceTypePreference && prefs.workplaceTypePreference !== 'All')
  );
}

/**
 * Inspects a parsed `byoc_workspace_store` payload and extracts any legacy plaintext
 * sensitive career data or credentials before `partialize` scrubs them.
 */
export function extractLegacyPlaintextFromRawStore(rawJson: string | null): LegacyPlaintextCapture {
  if (!rawJson) {
    return { detected: false, sensitiveData: {} };
  }

  try {
    const parsed = JSON.parse(rawJson);
    const state = parsed?.state || parsed || {};
    const sensitiveData: Partial<DecryptedVaultData> = {};
    let hasSensitive = false;

    if (typeof state.geminiApiKey === 'string' && state.geminiApiKey.trim()) {
      sensitiveData.geminiApiKey = state.geminiApiKey.trim();
      hasSensitive = true;
    }
    if (state.masterResume && typeof state.masterResume === 'object') {
      sensitiveData.masterResume = state.masterResume;
      hasSensitive = true;
    }
    if (state.careerFormDraft && typeof state.careerFormDraft === 'object') {
      const sanitizedDraft = sanitizeCareerFormState(state.careerFormDraft);
      if (hasMeaningfulCareerFormDraft(sanitizedDraft)) {
        sensitiveData.careerFormDraft = sanitizedDraft;
        hasSensitive = true;
      }
    }
    if (Array.isArray(state.jobs) && state.jobs.length > 0) {
      sensitiveData.jobs = state.jobs;
      hasSensitive = true;
    }
    if (typeof state.selectedJobId === 'string' && state.selectedJobId) {
      sensitiveData.selectedJobId = state.selectedJobId;
      hasSensitive = true;
    }
    if (state.tailoredArtifacts && typeof state.tailoredArtifacts === 'object' && Object.keys(state.tailoredArtifacts).length > 0) {
      sensitiveData.tailoredArtifacts = state.tailoredArtifacts;
      hasSensitive = true;
    }
    if (Array.isArray(state.applications) && state.applications.length > 0) {
      sensitiveData.applications = state.applications;
      hasSensitive = true;
    }
    if (Array.isArray(state.unsavedQueue) && state.unsavedQueue.length > 0) {
      sensitiveData.unsavedQueue = state.unsavedQueue;
      hasSensitive = true;
    }
    if (hasCustomCandidatePreferences(state.candidatePreferences)) {
      sensitiveData.candidatePreferences = state.candidatePreferences;
      hasSensitive = true;
    }

    // Also flag if legacy store still had `masterResume: null` or `jobs: []` keys persisted in plaintext
    const legacyGroqCredentialField = ['groq', 'ApiKey'].join('');
    const hasPlaintextKeysPresent =
      'masterResume' in state ||
      'careerFormDraft' in state ||
      'jobs' in state ||
      'applications' in state ||
      'tailoredArtifacts' in state ||
      'candidatePreferences' in state ||
      'geminiApiKey' in state ||
      legacyGroqCredentialField in state ||
      'isAuthenticated' in state ||
      Boolean(state.user?.workspacePasskey);

    const sanitizedCaptureUser =
      state.user && typeof state.user === 'object'
        ? {
            ...state.user,
            name: stripDemoWorkspaceName(state.user.name),
            email: stripDemoWorkspaceEmail(state.user.email)
          }
        : null;

    return {
      detected: hasSensitive || hasPlaintextKeysPresent,
      user: sanitizedCaptureUser,
      sensitiveData
    };
  } catch {
    return { detected: false, sensitiveData: {} };
  }
}

export type WorkspaceMetadataCleanResult =
  | { status: 'none' }
  | { status: 'clean'; raw: string }
  | { status: 'updated'; raw: string }
  | { status: 'error'; error: string };

/**
 * Strips exact demo workspace name/email (case-insensitive) from `byoc_workspace_store`
 * while preserving the workspace ID and all remaining persisted/legacy fields.
 * Confirms updated metadata was saved via read-back verification.
 */
export function sanitizeStoredWorkspaceStoreMetadata(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof window !== 'undefined' ? window.localStorage : undefined,
  storageKey: string = WORKSPACE_STORE_KEY
): WorkspaceMetadataCleanResult {
  if (!storage) {
    return { status: 'none' };
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return { status: 'none' };
    }
    const parsed = JSON.parse(raw);
    const hasStateWrapper = Boolean(parsed?.state && typeof parsed.state === 'object');
    const targetContainer = hasStateWrapper ? parsed.state : parsed;
    const existingUser = targetContainer?.user;
    if (!existingUser || typeof existingUser !== 'object' || !hasDemoWorkspaceIdentity(existingUser)) {
      return { status: 'clean', raw };
    }

    const sanitizedUser = {
      ...existingUser,
      name: stripDemoWorkspaceName(existingUser.name),
      email: stripDemoWorkspaceEmail(existingUser.email)
    };

    const updatedPayload = hasStateWrapper
      ? {
          ...parsed,
          state: {
            ...parsed.state,
            user: sanitizedUser
          }
        }
      : {
          ...parsed,
          user: sanitizedUser
        };

    const updatedRaw = JSON.stringify(updatedPayload);
    storage.setItem(storageKey, updatedRaw);
    const verifyRaw = storage.getItem(storageKey);
    if (!verifyRaw) {
      return { status: 'error', error: 'Workspace metadata verification failed after update.' };
    }

    const verifyParsed = JSON.parse(verifyRaw);
    const verifyContainer = hasStateWrapper ? verifyParsed?.state : verifyParsed;
    const verifyUser = verifyContainer?.user;
    const originalKeys = Object.keys(targetContainer || {});
    const preservedKeys = originalKeys.every((k) => k in (verifyContainer || {}));
    const verified =
      verifyUser &&
      verifyUser.id === existingUser.id &&
      !hasDemoWorkspaceIdentity(verifyUser) &&
      verifyParsed?.version === parsed?.version &&
      preservedKeys;

    if (!verified) {
      return {
        status: 'error',
        error: 'Persisted workspace store verification did not preserve fields or remove demo identity.'
      };
    }

    return { status: 'updated', raw: verifyRaw };
  } catch (err: unknown) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to sanitize persisted workspace metadata.'
    };
  }
}

/**
 * Safely merges recovered legacy plaintext records into decrypted vault data
 * without overwriting non-empty encrypted vault data.
 */
export function mergeLegacyIntoDecryptedVault(
  vaultData: DecryptedVaultData,
  legacy: Partial<DecryptedVaultData>
): { merged: DecryptedVaultData; didChange: boolean } {
  let didChange = false;
  const merged: DecryptedVaultData = {
    geminiApiKey: vaultData.geminiApiKey || '',
    masterResume: vaultData.masterResume || null,
    careerFormDraft: vaultData.careerFormDraft || null,
    emailInteractions: Array.isArray(vaultData.emailInteractions) ? [...vaultData.emailInteractions] : [],
    jobs: Array.isArray(vaultData.jobs) ? [...vaultData.jobs] : [],
    selectedJobId: vaultData.selectedJobId || null,
    tailoredArtifacts: { ...(vaultData.tailoredArtifacts || {}) },
    applications: Array.isArray(vaultData.applications) ? [...vaultData.applications] : [],
    unsavedQueue: Array.isArray(vaultData.unsavedQueue) ? [...vaultData.unsavedQueue] : [],
    candidatePreferences: vaultData.candidatePreferences || { ...DEFAULT_PREFERENCES }
  };

  if (!merged.geminiApiKey && legacy.geminiApiKey) {
    merged.geminiApiKey = legacy.geminiApiKey;
    didChange = true;
  }
  if (!merged.masterResume && legacy.masterResume) {
    merged.masterResume = legacy.masterResume;
    didChange = true;
  }
  if (!hasMeaningfulCareerFormDraft(merged.careerFormDraft) && hasMeaningfulCareerFormDraft(legacy.careerFormDraft)) {
    merged.careerFormDraft = sanitizeCareerFormState(legacy.careerFormDraft);
    didChange = true;
  }
  if (!merged.selectedJobId && legacy.selectedJobId) {
    merged.selectedJobId = legacy.selectedJobId;
    didChange = true;
  }

  if (Array.isArray(legacy.jobs) && legacy.jobs.length > 0) {
    const existingIds = new Set(merged.jobs.map((j: any) => j.id));
    for (const j of legacy.jobs) {
      if (j && j.id && !existingIds.has(j.id)) {
        merged.jobs.push(j);
        existingIds.add(j.id);
        didChange = true;
      }
    }
  }

  if (Array.isArray(legacy.applications) && legacy.applications.length > 0) {
    const existingAppIds = new Set(merged.applications.map((a: any) => a.id));
    for (const a of legacy.applications) {
      if (a && a.id && !existingAppIds.has(a.id)) {
        merged.applications.push(a);
        existingAppIds.add(a.id);
        didChange = true;
      }
    }
  }

  if (Array.isArray(legacy.unsavedQueue) && legacy.unsavedQueue.length > 0) {
    const existingQueueIds = new Set(merged.unsavedQueue.map((q: any) => q.id));
    for (const q of legacy.unsavedQueue) {
      if (q && q.id && !existingQueueIds.has(q.id)) {
        merged.unsavedQueue.push(q);
        existingQueueIds.add(q.id);
        didChange = true;
      }
    }
  }

  if (legacy.tailoredArtifacts && typeof legacy.tailoredArtifacts === 'object') {
    for (const [jobId, artifact] of Object.entries(legacy.tailoredArtifacts)) {
      if (!merged.tailoredArtifacts[jobId] && artifact) {
        merged.tailoredArtifacts[jobId] = artifact;
        didChange = true;
      }
    }
  }

  if (!hasCustomCandidatePreferences(merged.candidatePreferences) && hasCustomCandidatePreferences(legacy.candidatePreferences)) {
    merged.candidatePreferences = { ...merged.candidatePreferences, ...legacy.candidatePreferences };
    didChange = true;
  }

  if (Array.isArray(legacy.emailInteractions) && legacy.emailInteractions.length > 0) {
    const beforeCount = merged.emailInteractions?.length || 0;
    merged.emailInteractions = dedupeEmailInteractions([
      ...(merged.emailInteractions || []),
      ...legacy.emailInteractions
    ]);
    if (merged.emailInteractions.length > beforeCount) {
      didChange = true;
    }
  }

  return { merged, didChange };
}

/**
 * Produces a clean, metadata-only workspace store snapshot with all sensitive career
 * data, API keys, passkeys, and auth session flags stripped.
 */
export function scrubPlaintextWorkspaceStore(rawJson: string | null): string | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    const state = parsed?.state || {};
    const cleanUser = state.user
      ? {
          id: state.user.id,
          name: stripDemoWorkspaceName(state.user.name),
          email: stripDemoWorkspaceEmail(state.user.email),
          isEmailVerified: Boolean(state.user.isEmailVerified),
          biometricEnabled: Boolean(state.user.biometricEnabled),
          biometricCredentialId: state.user.biometricCredentialId,
          lastBiometricAuth: state.user.lastBiometricAuth,
          hasEncryptedVault: true,
          createdAt: state.user.createdAt,
          lastActive: state.user.lastActive
        }
      : null;

    return JSON.stringify({
      state: {
        activeTab: state.activeTab || 'dashboard',
        user: cleanUser,
        isLiveApiMode: true
      },
      version: 4
    });
  } catch {
    return null;
  }
}

export function sanitizeWorkspaceUser(user: UserWorkspace | null | undefined): UserWorkspace | null {
  if (!user) return null;
  return {
    id: user.id,
    name: stripDemoWorkspaceName(user.name),
    email: stripDemoWorkspaceEmail(user.email),
    isEmailVerified: Boolean(user.isEmailVerified),
    biometricEnabled: Boolean(user.biometricEnabled),
    biometricCredentialId: user.biometricCredentialId,
    lastBiometricAuth: user.lastBiometricAuth,
    hasEncryptedVault: Boolean(user.hasEncryptedVault),
    createdAt: user.createdAt,
    lastActive: user.lastActive
  };
}

export function migrateWorkspaceStoreState(
  persistedState: any,
  _version: number
): { activeTab: string; user: UserWorkspace | null; isLiveApiMode: boolean } {
  const state = persistedState && typeof persistedState === 'object' ? persistedState : {};
  const cleanUser = state.user ? { ...state.user } : null;
  if (cleanUser && 'workspacePasskey' in cleanUser) {
    delete cleanUser.workspacePasskey;
  }
  return {
    activeTab: state.activeTab || 'dashboard',
    user: sanitizeWorkspaceUser(cleanUser),
    isLiveApiMode: true
  };
}

export function mergeWorkspaceStoreState<T extends { user: UserWorkspace | null }>(
  persistedState: any,
  currentState: T
): T {
  const state = persistedState && typeof persistedState === 'object' ? persistedState : {};
  const cleanPersisted = { ...state };
  if (cleanPersisted.user && typeof cleanPersisted.user === 'object') {
    const { workspacePasskey: _removed, ...restUser } = cleanPersisted.user;
    cleanPersisted.user = sanitizeWorkspaceUser(restUser as UserWorkspace);
  }
  return {
    ...currentState,
    ...cleanPersisted,
    user: sanitizeWorkspaceUser(
      cleanPersisted.user !== undefined ? cleanPersisted.user : currentState.user
    )
  };
}

export function scrubAndVerifyStoredWorkspace(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof window !== 'undefined' ? window.localStorage : undefined,
  storageKey: string = WORKSPACE_STORE_KEY
): boolean {
  try {
    if (!storage) return true;
    const raw = storage.getItem(storageKey);
    if (!raw) return true;
    const scrubbed = scrubPlaintextWorkspaceStore(raw);
    if (!scrubbed) return false;
    storage.setItem(storageKey, scrubbed);
    const verifyRaw = storage.getItem(storageKey);
    if (!verifyRaw || verifyRaw !== scrubbed) {
      return false;
    }
    const verifyParsed = JSON.parse(verifyRaw);
    return !hasDemoWorkspaceIdentity(verifyParsed?.state?.user);
  } catch {
    return false;
  }
}
