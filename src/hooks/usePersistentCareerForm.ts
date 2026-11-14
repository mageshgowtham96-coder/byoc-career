import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  ByocStructuredApplicationData,
  CareerApplicationFormState
} from '../types';
import {
  useCareerDataBinding,
  mapExtractionToFormState
} from './useCareerDataBinding';
import {
  sanitizeCareerFormState,
  isLocalStorageAvailable
} from '../utils/storagePersistence';
import {
  hasActiveVaultKey,
  readStoredVaultEnvelope,
  verifyActiveSessionEnvelopeRestorable,
  writeStoredVaultEnvelope
} from '../utils/cryptoVault';
import {
  CAREER_FORM_DRAFT_KEY,
  hasMeaningfulCareerFormDraft,
  migrateLegacyCareerFormDraft,
  parseLegacyCareerFormDraft
} from '../utils/vaultMigration';
import {
  buildVaultDataFromState,
  buildVaultMetaFromUser,
  syncVaultFromStoreNow,
  useWizardStore
} from '../store/useWizardStore';

export interface UsePersistentCareerFormOptions {
  storageKey?: string;
  debounceMs?: number;
  enableCrossTabSync?: boolean;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_STORAGE_KEY = CAREER_FORM_DRAFT_KEY;

function readLegacyKeySafely(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLegacyKeySafely(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(key);
  }
}

/**
 * Custom React hook that persists career application form drafts exclusively inside
 * the AES-256-GCM encrypted vault (`byoc_secure_vault_envelope` via `useWizardStore`),
 * while non-destructively migrating any legacy plaintext `byoc_career_form_draft` key.
 */
export function usePersistentCareerForm(options: UsePersistentCareerFormOptions = {}) {
  const {
    storageKey = DEFAULT_STORAGE_KEY,
    debounceMs = 250,
    enableCrossTabSync = true
  } = options;

  const [isHydrated, setIsHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isStorageDisabled] = useState(() => !isLocalStorageAvailable());

  // Initialize base data-binding hook
  const binding = useCareerDataBinding();
  const { formState, setFormState } = binding;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const skipNextSaveRef = useRef(false);

  const isAuthenticated = useWizardStore((s) => s.isAuthenticated);
  const user = useWizardStore((s) => s.user);
  const vaultDraft = useWizardStore((s) => s.careerFormDraft);
  const setCareerFormDraft = useWizardStore((s) => s.setCareerFormDraft);
  const addToast = useWizardStore((s) => s.addToast);

  const persistDraftToEncryptedVault = useCallback(
    async (draftToPersist: CareerApplicationFormState): Promise<boolean> => {
      const state = useWizardStore.getState();
      if (!state.isAuthenticated || !state.user || !hasActiveVaultKey()) {
        const lockErr = 'Vault is locked. Unlock with your passphrase to save draft encrypted at rest.';
        setSaveStatus('error');
        setStorageError(lockErr);
        return false;
      }

      const sanitized = sanitizeCareerFormState(draftToPersist);
      state.setCareerFormDraft(sanitized);

      const syncedOk = await syncVaultFromStoreNow();
      if (!syncedOk) {
        const errMsg = 'Failed to write encrypted career draft to local vault.';
        setSaveStatus('error');
        setStorageError(errMsg);
        addToast({
          type: 'error',
          title: 'Encrypted Save Failed',
          message: errMsg
        });
        return false;
      }

      try {
        await verifyActiveSessionEnvelopeRestorable();
        setSaveStatus('saved');
        setStorageError(null);
        setLastSaved(new Date().toISOString());
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Encrypted vault verification failed.';
        setSaveStatus('error');
        setStorageError(msg);
        addToast({
          type: 'error',
          title: 'Encrypted Save Verification Failed',
          message: msg
        });
        return false;
      }
    },
    [addToast]
  );

  /**
   * 1. Hydrate from decrypted vault payload and migrate any lingering legacy plaintext draft safely
   */
  useEffect(() => {
    let cancelled = false;

    const hydrateAndMigrate = async () => {
      const storeState = useWizardStore.getState();
      const currentVaultDraft = storeState.careerFormDraft;
      const rawLegacy = readLegacyKeySafely(storageKey);

      if (rawLegacy !== null) {
        const parsedLegacy = parseLegacyCareerFormDraft(rawLegacy);

        if (parsedLegacy.status === 'error') {
          if (!cancelled) {
            if (hasMeaningfulCareerFormDraft(currentVaultDraft)) {
              skipNextSaveRef.current = true;
              setFormState(sanitizeCareerFormState(currentVaultDraft));
            }
            setSaveStatus('error');
            setStorageError(parsedLegacy.error);
            addToast({
              type: 'error',
              title: 'Draft Migration Failed',
              message: parsedLegacy.error
            });
            setIsHydrated(true);
          }
          return;
        }

        if (parsedLegacy.status === 'valid' || parsedLegacy.status === 'empty') {
          const fallbackDraft = hasMeaningfulCareerFormDraft(currentVaultDraft)
            ? sanitizeCareerFormState(currentVaultDraft)
            : parsedLegacy.draft;

          if (!cancelled && hasMeaningfulCareerFormDraft(fallbackDraft)) {
            skipNextSaveRef.current = true;
            setFormState(fallbackDraft);
          }

          if (storeState.isAuthenticated && storeState.user && hasActiveVaultKey()) {
            const migrationRes = await migrateLegacyCareerFormDraft({
              getRawDraft: () => readLegacyKeySafely(storageKey),
              removeLegacyDraft: () => removeLegacyKeySafely(storageKey),
              writeEnvelope: (env) => writeStoredVaultEnvelope(env),
              readEnvelope: () => readStoredVaultEnvelope(),
              currentVaultData: buildVaultDataFromState(storeState),
              vaultMeta: buildVaultMetaFromUser(storeState.user)
            });

            if (cancelled) return;

            if (migrationRes.status === 'migrated') {
              if (migrationRes.draft) {
                skipNextSaveRef.current = true;
                setCareerFormDraft(migrationRes.draft);
                setFormState(migrationRes.draft);
                setLastSaved(migrationRes.draft.lastExtractedTimestamp || new Date().toISOString());
              }
              setSaveStatus('saved');
              setStorageError(null);
            } else if (migrationRes.status === 'error') {
              setSaveStatus('error');
              setStorageError(migrationRes.error);
              addToast({
                type: 'error',
                title: 'Draft Migration Failed',
                message: migrationRes.error
              });
            }
          } else if (!cancelled && parsedLegacy.status === 'valid') {
            setSaveStatus('error');
            setStorageError('Vault is locked; existing legacy draft retained until encrypted migration succeeds.');
          }

          if (!cancelled) {
            setIsHydrated(true);
          }
          return;
        }
      }

      // Standard encrypted-vault hydration path
      if (!cancelled) {
        if (hasMeaningfulCareerFormDraft(currentVaultDraft)) {
          const sanitizedVaultDraft = sanitizeCareerFormState(currentVaultDraft);
          skipNextSaveRef.current = true;
          setFormState(sanitizedVaultDraft);
          setLastSaved(sanitizedVaultDraft.lastExtractedTimestamp || new Date().toISOString());
          setSaveStatus('saved');
        }
        setIsHydrated(true);
      }
    };

    void hydrateAndMigrate();

    return () => {
      cancelled = true;
    };
  }, [storageKey, isAuthenticated, user, setFormState, setCareerFormDraft, addToast]);

  /**
   * 2. Keep local form state aligned if decrypted vault `careerFormDraft` updates externally
   */
  useEffect(() => {
    if (!enableCrossTabSync || !isHydrated) return;

    const unsubscribe = useWizardStore.subscribe((state, prevState) => {
      if (state.careerFormDraft !== prevState.careerFormDraft) {
        if (state.careerFormDraft) {
          const incoming = sanitizeCareerFormState(state.careerFormDraft);
          skipNextSaveRef.current = true;
          setFormState(incoming);
          setLastSaved(new Date().toISOString());
          setSaveStatus('saved');
        }
      }
    });

    return () => unsubscribe();
  }, [enableCrossTabSync, isHydrated, setFormState]);

  /**
   * 3. Automatic encrypted persistence on every form change with debouncing
   */
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!isHydrated) return;

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    // Avoid persisting empty baseline object until user enters data or auto-fills
    if (!hasMeaningfulCareerFormDraft(formState) && !hasMeaningfulCareerFormDraft(vaultDraft)) {
      return;
    }

    setSaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void persistDraftToEncryptedVault(formState);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [formState, vaultDraft, debounceMs, isHydrated, persistDraftToEncryptedVault]);

  /**
   * Immediate encrypted write without debounce
   */
  const forceSaveNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    return persistDraftToEncryptedVault(formState);
  }, [formState, persistDraftToEncryptedVault]);

  /**
   * Enhanced autoFill: maps incoming extracted data and writes immediately to encrypted vault
   */
  const autoFillAndPersist = useCallback(
    (payload: Partial<ByocStructuredApplicationData>, rawSourceText: string = '') => {
      const mapped = mapExtractionToFormState(payload, rawSourceText);
      skipNextSaveRef.current = true;
      setFormState(mapped);

      void persistDraftToEncryptedVault(mapped).then((ok) => {
        if (ok) {
          addToast({
            type: 'success',
            title: 'Auto-Fill Encrypted & Saved',
            message: `Encrypted ${mapped.workExperience.length} roles and ${mapped.skills.length} skills inside your vault.`
          });
        }
      });

      return mapped;
    },
    [setFormState, persistDraftToEncryptedVault, addToast]
  );

  /**
   * Clears encrypted draft from vault (and any residual legacy key) and resets form
   */
  const clearPersistedData = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setCareerFormDraft(null);
    const syncedOk = await syncVaultFromStoreNow();
    if (!syncedOk && hasActiveVaultKey()) {
      const errMsg = 'Failed to clear draft inside encrypted vault.';
      setSaveStatus('error');
      setStorageError(errMsg);
      addToast({ type: 'error', title: 'Draft Clear Failed', message: errMsg });
      return;
    }

    try {
      removeLegacyKeySafely(storageKey);
    } catch {
      // ignore if key didn't exist
    }

    skipNextSaveRef.current = true;
    binding.resetForm();
    setSaveStatus('idle');
    setLastSaved(null);
    setStorageError(null);
    addToast({
      type: 'info',
      title: 'Encrypted Draft Cleared',
      message: 'Intake form draft cleared from your encrypted vault.'
    });
  }, [storageKey, setCareerFormDraft, binding, addToast]);

  return {
    ...binding,
    autoFillFromExtraction: autoFillAndPersist,
    isHydrated,
    isStorageDisabled,
    saveStatus,
    lastSaved,
    storageError,
    forceSaveNow,
    clearPersistedData
  };
}
