import type {
  EmailInteraction,
  UnsavedApplicationCandidate,
  ApplicationRecord,
  ApplicationStatus
} from '../types';

export const EMAIL_VAULT_DB_NAME = 'byoc_email_vault_db';
export const EMAIL_VAULT_STORE_NAME = 'emailInteractionVault';
export const EMAIL_FALLBACK_KEY = 'byoc_email_vault_fallback';

const DB_VERSION = 1;

export interface EncryptedEmailVaultAdapter {
  isUnlocked: () => boolean;
  getAll: () => EmailInteraction[];
  replaceAll: (items: EmailInteraction[]) => Promise<boolean> | boolean;
}

let activeVaultAdapter: EncryptedEmailVaultAdapter | null = null;

/**
 * Connects the email interaction vault strictly to the unlocked AES-256-GCM store session.
 */
export function configureEncryptedEmailVault(adapter: EncryptedEmailVaultAdapter | null): void {
  activeVaultAdapter = adapter;
}

export type LegacyEmailReadResult =
  | { status: 'none' }
  | { status: 'empty' }
  | { status: 'valid'; records: EmailInteraction[]; sources: Array<'indexeddb' | 'localstorage'> }
  | { status: 'error'; error: string };

function isEmailInteractionLike(value: unknown): value is EmailInteraction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.messageId === 'string';
}

export function dedupeEmailInteractions(records: EmailInteraction[]): EmailInteraction[] {
  const merged: EmailInteraction[] = [];
  const seenKeys = new Set<string>();

  for (const item of records) {
    if (!item || typeof item !== 'object') continue;
    const dedupeKey = item.messageId ? `msg:${item.messageId}` : `id:${item.id}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      merged.push(item);
    }
  }

  return merged;
}

/**
 * Safely parses legacy `byoc_email_vault_fallback` JSON without mutating storage.
 */
export function parseLegacyEmailFallback(
  rawJson: string | null | undefined
): { status: 'none' } | { status: 'empty' } | { status: 'valid'; records: EmailInteraction[] } | { status: 'error'; error: string } {
  if (rawJson === null || rawJson === undefined) {
    return { status: 'none' };
  }
  const trimmed = rawJson.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return { status: 'none' };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return {
        status: 'error',
        error: 'Stored email fallback data is corrupted and cannot be migrated; existing fallback key has been retained.'
      };
    }
    const validRecords = parsed.filter(isEmailInteractionLike);
    if (parsed.length > 0 && validRecords.length === 0) {
      return {
        status: 'error',
        error: 'Stored email fallback entries have an unrecognized format; existing fallback key has been retained.'
      };
    }
    if (validRecords.length === 0) {
      return { status: 'empty' };
    }
    return { status: 'valid', records: dedupeEmailInteractions(validRecords) };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      status: 'error',
      error: `Failed to parse existing email fallback records (${detail}); existing fallback key has been retained.`
    };
  }
}

async function readLegacyIndexedDbEmails(): Promise<
  | { status: 'none' }
  | { status: 'empty' }
  | { status: 'valid'; records: EmailInteraction[] }
  | { status: 'error'; error: string }
> {
  if (typeof indexedDB === 'undefined') {
    return { status: 'none' };
  }

  try {
    if (typeof indexedDB.databases === 'function') {
      const existingDbs = await indexedDB.databases();
      const hasLegacyDb = existingDbs.some((db) => db.name === EMAIL_VAULT_DB_NAME);
      if (!hasLegacyDb) {
        return { status: 'none' };
      }
    }

    const records = await new Promise<EmailInteraction[]>((resolve, reject) => {
      let abortedNewDb = false;
      const request = indexedDB.open(EMAIL_VAULT_DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        if (e.oldVersion === 0) {
          abortedNewDb = true;
          request.transaction?.abort();
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(EMAIL_VAULT_STORE_NAME)) {
          db.close();
          resolve([]);
          return;
        }
        try {
          const tx = db.transaction(EMAIL_VAULT_STORE_NAME, 'readonly');
          const store = tx.objectStore(EMAIL_VAULT_STORE_NAME);
          const getReq = store.getAll();
          getReq.onsuccess = () => {
            const list = Array.isArray(getReq.result) ? getReq.result.filter(isEmailInteractionLike) : [];
            db.close();
            resolve(list);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error || new Error('IndexedDB read failed'));
          };
        } catch (txErr) {
          db.close();
          reject(txErr);
        }
      };

      request.onerror = () => {
        if (abortedNewDb) {
          resolve([]);
        } else {
          reject(request.error || new Error('Failed to open legacy IndexedDB email store'));
        }
      };
    });

    if (records.length === 0) {
      return { status: 'none' };
    }
    return { status: 'valid', records: dedupeEmailInteractions(records) };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'IndexedDB access error';
    return {
      status: 'error',
      error: `Failed to read legacy IndexedDB email vault (${detail}); existing records retained.`
    };
  }
}

/**
 * Non-destructively reads legacy plaintext email records from both IndexedDB (`byoc_email_vault_db`)
 * and `localStorage['byoc_email_vault_fallback']`.
 */
export async function readLegacyEmailRecords(): Promise<LegacyEmailReadResult> {
  let fallbackResult: ReturnType<typeof parseLegacyEmailFallback> = { status: 'none' };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      fallbackResult = parseLegacyEmailFallback(window.localStorage.getItem(EMAIL_FALLBACK_KEY));
    }
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'Storage access error';
    return {
      status: 'error',
      error: `Unable to read existing email fallback records (${detail}); existing records retained.`
    };
  }

  if (fallbackResult.status === 'error') {
    return fallbackResult;
  }

  const idbResult = await readLegacyIndexedDbEmails();
  if (idbResult.status === 'error') {
    return idbResult;
  }

  const combined: EmailInteraction[] = [];
  const sources: Array<'indexeddb' | 'localstorage'> = [];

  if (idbResult.status === 'valid') {
    combined.push(...idbResult.records);
    sources.push('indexeddb');
  }
  if (fallbackResult.status === 'valid') {
    combined.push(...fallbackResult.records);
    sources.push('localstorage');
  }

  if (combined.length > 0) {
    return {
      status: 'valid',
      records: dedupeEmailInteractions(combined),
      sources
    };
  }

  if (fallbackResult.status === 'empty' || idbResult.status === 'empty') {
    return { status: 'empty' };
  }

  return { status: 'none' };
}

/**
 * Removes legacy plaintext email stores (`byoc_email_vault_db` and `byoc_email_vault_fallback`).
 * Should only be called AFTER encrypted vault write and restoration verification succeed (or on explicit user wipe).
 */
export async function clearLegacyEmailStores(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(EMAIL_FALLBACK_KEY);
  }

  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve) => {
      try {
        const delReq = indexedDB.deleteDatabase(EMAIL_VAULT_DB_NAME);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve();
        delReq.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

/**
 * Encrypted Email Interaction Vault Wrapper.
 * Active reads/writes route strictly through the unlocked AES-256-GCM vault session
 * (failing closed when locked — zero plaintext localStorage or IndexedDB writes).
 */
class EncryptedEmailInteractionVault {
  async getAll(): Promise<EmailInteraction[]> {
    if (!activeVaultAdapter || !activeVaultAdapter.isUnlocked()) {
      throw new Error('Encrypted vault session is locked. Unlock your vault to access email records.');
    }
    return [...activeVaultAdapter.getAll()];
  }

  async save(interaction: EmailInteraction): Promise<void> {
    if (!activeVaultAdapter || !activeVaultAdapter.isUnlocked()) {
      throw new Error('Encrypted vault session is locked. Unlock your vault before saving email records.');
    }
    const existing = activeVaultAdapter.getAll();
    const updated = [interaction, ...existing.filter((i) => i.id !== interaction.id && i.messageId !== interaction.messageId)];
    const ok = await activeVaultAdapter.replaceAll(updated);
    if (!ok) {
      throw new Error('Failed to persist email interaction inside encrypted vault.');
    }
  }

  async clear(): Promise<void> {
    if (activeVaultAdapter && activeVaultAdapter.isUnlocked()) {
      await activeVaultAdapter.replaceAll([]);
    }
    await clearLegacyEmailStores();
  }
}

export const emailVault = new EncryptedEmailInteractionVault();

// Empty live default: zero synthetic recruiting emails in production
export const SAMPLE_RECRUITING_EMAILS: Array<Omit<EmailInteraction, 'id' | 'status'>> = [];

export interface EmailSyncResult {
  newInteractions: EmailInteraction[];
  matchedTransitions: Array<{
    applicationId: string;
    company: string;
    newStatus: ApplicationStatus;
    emailSubject: string;
  }>;
  unsavedQueueItems: UnsavedApplicationCandidate[];
}

/**
 * Contextual Email Matching & Anti-Spam Verification Engine
 * Operates on verified incoming email streams, with zero synthetic injection in production.
 */
export async function syncAndProcessIncomingEmails(
  savedApplications: ApplicationRecord[],
  onNotification?: (title: string, body: string) => void,
  incomingEmails: Array<Omit<EmailInteraction, 'id' | 'status'>> = []
): Promise<EmailSyncResult> {
  const existingStored = await emailVault.getAll();
  const existingMessageIds = new Set(existingStored.map((e) => e.messageId));

  const newInteractions: EmailInteraction[] = [];
  const matchedTransitions: EmailSyncResult['matchedTransitions'] = [];
  const unsavedQueueItems: UnsavedApplicationCandidate[] = [];

  // Match strictly against provided incoming email stream
  for (const rawEmail of incomingEmails) {
    if (existingMessageIds.has(rawEmail.messageId)) {
      continue;
    }

    const emailId = 'email-' + Math.random().toString(36).substring(2, 9);
    const textToAnalyze = `${rawEmail.subject} ${rawEmail.body}`.toLowerCase();

    // 1. Anti-Spam Semantic Filter
    // Look for verified recruiting action keywords
    const isRecruitingAction =
      /interview|invitation|application received|confirmation|status update|moving forward|schedule a call|offer/i.test(
        textToAnalyze
      );

    if (!isRecruitingAction && !rawEmail.isRecruitingInfrastructure) {
      // Flag as unrelated spam; discard or ignore
      continue;
    }

    // 2. Check if company matches an existing saved application
    const matchedApp = savedApplications.find((app) => {
      const appComp = app.company.toLowerCase();
      const detComp = rawEmail.detectedCompany.toLowerCase();
      return (
        appComp.includes(detComp) ||
        detComp.includes(appComp) ||
        textToAnalyze.includes(appComp)
      );
    });

    if (matchedApp) {
      // Auto-transition pipeline state if keywords indicate progression
      let newStatus: ApplicationStatus = matchedApp.status;

      if (/interview|schedule|technical round|onsite|video call/i.test(textToAnalyze)) {
        newStatus = 'Interview';
      } else if (/screening|reviewing your application|under review/i.test(textToAnalyze)) {
        if (matchedApp.status === 'Applied' || matchedApp.status === 'Saved') {
          newStatus = 'Screening';
        }
      } else if (/offer|congratulations|formal offer/i.test(textToAnalyze)) {
        newStatus = 'Offer';
      }

      const interaction: EmailInteraction = {
        ...rawEmail,
        id: emailId,
        matchedApplicationId: matchedApp.id,
        detectedStatusTransition: newStatus,
        status: 'matched_transitioned'
      };

      await emailVault.save(interaction);
      newInteractions.push(interaction);

      if (newStatus !== matchedApp.status) {
        matchedTransitions.push({
          applicationId: matchedApp.id,
          company: matchedApp.company,
          newStatus,
          emailSubject: rawEmail.subject
        });

        // Trigger native browser notification if permitted
        if (onNotification) {
          onNotification(
            `Pipeline Update: ${matchedApp.company}`,
            `Status automatically shifted to ${newStatus} based on verified email confirmation.`
          );
        }
      }
    } else {
      // 3. External Application Discovery (Unsaved Applications Queue)
      // If from Workday, Greenhouse, Lever, Ashby or contains an explicit Job ID regex
      const jobIdMatch = rawEmail.body.match(/\b(?:REQ|JOB|GH|WD|REF)[-_#]?\d{3,6}\b/i);
      const isAuthoritative = rawEmail.isRecruitingInfrastructure || Boolean(jobIdMatch);

      if (isAuthoritative) {
        const interaction: EmailInteraction = {
          ...rawEmail,
          id: emailId,
          status: 'unsaved_external_queue'
        };

        await emailVault.save(interaction);
        newInteractions.push(interaction);

        unsavedQueueItems.push({
          id: 'unsaved-' + Date.now() + Math.random().toString(36).substring(2, 6),
          company: rawEmail.detectedCompany,
          role: rawEmail.detectedRole || 'Unspecified Role',
          sourceEmailId: emailId,
          detectedReferenceNumber: rawEmail.detectedJobIdRef || jobIdMatch?.[0],
          infrastructure: rawEmail.infrastructureName || 'Recruiting Portal',
          dateReceived: rawEmail.receivedDate,
          snippet: rawEmail.snippet,
          rawEmailBody: rawEmail.body,
          workplaceType: /remote/i.test(rawEmail.body)
            ? 'Remote'
            : /hybrid/i.test(rawEmail.body)
            ? 'Hybrid'
            : 'Unspecified'
        });
      }
    }
  }

  return {
    newInteractions,
    matchedTransitions,
    unsavedQueueItems
  };
}
