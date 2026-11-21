import React, { useState, useRef, useEffect } from 'react';
import { AUTH_COPY, AUTH_LANGUAGES, type AuthLocale, useAuthLocale, translateUiText } from '../i18n/authLocale';
import {
  useWizardStore,
  DEFAULT_CANDIDATE_PREFERENCES,
  getPendingLegacyCapture,
  hasSensitiveLegacyData,
  completeLegacyMigrationScrub,
  restoreVaultDataToStore,
  syncVaultFromStoreNow,
  buildVaultDataFromState,
  buildVaultMetaFromUser,
  sanitizeUserMetadata
} from '../store/useWizardStore';
import { ChakraLogo } from './ChakraLogo';
import { copyToClipboardSafely } from '../utils/copyToClipboardSafely';
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Fingerprint,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Shield,
  Upload,
  AlertTriangle
} from 'lucide-react';
import {
  encryptVault,
  decryptVault,
  recoverVaultWithSecret,
  readStoredVaultEnvelope,
  writeStoredVaultEnvelope,
  verifyActiveSessionEnvelopeRestorable,
  isValidVaultEnvelope,
  hasDemoWorkspaceIdentity,
  sanitizeStoredVaultEnvelopeMetadata,
  sanitizeVaultMeta,
  stripDemoWorkspaceEmail,
  stripDemoWorkspaceName,
  type DecryptedVaultData,
  type VaultEnvelope
} from '../utils/cryptoVault';
import {
  CAREER_FORM_DRAFT_KEY,
  EMAIL_FALLBACK_KEY,
  hasMeaningfulCareerFormDraft,
  mergeLegacyIntoDecryptedVault,
  migrateLegacyCareerFormDraft,
  migrateLegacyEmailRecordsToVault,
  parseLegacyEmailFallback,
  readLegacyCareerFormDraftFromStorage
} from '../utils/vaultMigration';
import {
  clearLegacyEmailStores,
  dedupeEmailInteractions,
  readLegacyEmailRecords
} from '../services/emailSyncService';

export const LocalAuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { locale, setLocale } = useAuthLocale();
  const t = (key: keyof typeof AUTH_COPY.en) => AUTH_COPY[locale][key] || AUTH_COPY.en[key];
  const ui = (source: string) => translateUiText(locale, source);
  const {
    user,
    isAuthenticated,
    setUser,
    setIsLiveApiMode,
    addToast
  } = useWizardStore();

  const storedEnvelope = readStoredVaultEnvelope();
  const legacyCapture = getPendingLegacyCapture();
  const legacyDraftCapture = readLegacyCareerFormDraftFromStorage();
  const legacyEmailFallbackCapture = (() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return parseLegacyEmailFallback(window.localStorage.getItem(EMAIL_FALLBACK_KEY));
      }
    } catch {
      // Ignore storage restriction
    }
    return { status: 'none' } as const;
  })();
  const hasLegacyDraft = legacyDraftCapture.status === 'valid';
  const [hasAsyncLegacyEmails, setHasAsyncLegacyEmails] = useState(
    legacyEmailFallbackCapture.status === 'valid'
  );
  const hasLegacyEmails = legacyEmailFallbackCapture.status === 'valid' || hasAsyncLegacyEmails;
  const hasLegacySensitive = hasSensitiveLegacyData(legacyCapture) || hasLegacyDraft || hasLegacyEmails;
  const needsLegacyEncryptionMigration = !storedEnvelope && hasLegacySensitive;
  const hasExistingWorkspace = Boolean(storedEnvelope || user || hasLegacySensitive);

  const [step, setStep] = useState<'details' | 'unlock' | 'migrate'>(
    needsLegacyEncryptionMigration
      ? 'migrate'
      : hasExistingWorkspace
      ? 'unlock'
      : 'details'
  );

  // Registration & Migration form states (never prefill demo identity; preserve blank for existing workspace)
  const [name, setName] = useState(() => {
    if (!needsLegacyEncryptionMigration) return '';
    if (legacyCapture?.user) return stripDemoWorkspaceName(legacyCapture.user.name);
    if (user) return stripDemoWorkspaceName(user.name);
    if (legacyDraftCapture.status === 'valid') {
      return stripDemoWorkspaceName(legacyDraftCapture.draft.personalDetails.fullName);
    }
    return '';
  });
  const [email, setEmail] = useState(() => {
    if (!needsLegacyEncryptionMigration) return '';
    if (legacyCapture?.user) return stripDemoWorkspaceEmail(legacyCapture.user.email);
    if (user) return stripDemoWorkspaceEmail(user.email);
    if (legacyDraftCapture.status === 'valid') {
      return stripDemoWorkspaceEmail(legacyDraftCapture.draft.personalDetails.email);
    }
    return '';
  });
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(
    needsLegacyEncryptionMigration ? (legacyCapture?.sensitiveData.groqApiKey || '') : ''
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [enableBiometricOnSignup, setEnableBiometricOnSignup] = useState(false);
  const [error, setError] = useState(
    legacyDraftCapture.status === 'error'
      ? legacyDraftCapture.error
      : legacyEmailFallbackCapture.status === 'error'
      ? legacyEmailFallbackCapture.error
      : ''
  );

  // Processing & inline confirmation states
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewWorkspaceConfirm, setShowNewWorkspaceConfirm] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPassphraseInput, setNewPassphraseInput] = useState('');
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);

  // Newly generated recovery phrase display (post-signup / post-migration)
  const [createdRecoveryPhrase, setCreatedRecoveryPhrase] = useState<string | null>(null);
  const [hasCopiedRecovery, setHasCopiedRecovery] = useState(false);
  const [hasConfirmedRecovery, setHasConfirmedRecovery] = useState(false);
  const [envelopeVersion, setEnvelopeVersion] = useState(0);

  const backupImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (createdRecoveryPhrase) {
      setHasCopiedRecovery(false);
      setHasConfirmedRecovery(false);
    }
  }, [createdRecoveryPhrase]);

  useEffect(() => {
    if (isAuthenticated) return;
    let cancelled = false;
    sanitizeStoredVaultEnvelopeMetadata();
    if (user && hasDemoWorkspaceIdentity(user)) {
      setUser(sanitizeUserMetadata(user));
    }
    void readLegacyEmailRecords().then((res) => {
      if (cancelled) return;
      if (res.status === 'valid') {
        setHasAsyncLegacyEmails(true);
        if (!readStoredVaultEnvelope()) {
          setStep((prev) => (prev === 'details' ? 'migrate' : prev));
        }
      } else if (res.status === 'error') {
        setError((prev) => prev || res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, setUser]);

  if (isAuthenticated && user) {
    return <>{children}</>;
  }

  const activeEnvelope = readStoredVaultEnvelope();
  const displayProfileName =
    stripDemoWorkspaceName(user?.name) ||
    stripDemoWorkspaceName(activeEnvelope?.meta?.name) ||
    stripDemoWorkspaceName(legacyCapture?.user?.name) ||
    'Workspace';
  const displayProfileEmail =
    stripDemoWorkspaceEmail(user?.email) ||
    stripDemoWorkspaceEmail(activeEnvelope?.meta?.email) ||
    stripDemoWorkspaceEmail(legacyCapture?.user?.email) ||
    '';

  const emptyVaultPayload = (groqKey: string = ''): DecryptedVaultData => ({
    groqApiKey: groqKey,
    geminiApiKey: '',
    masterResume: null,
    emailInteractions: [],
    jobs: [],
    selectedJobId: null,
    tailoredArtifacts: {},
    applications: [],
    unsavedQueue: [],
    candidatePreferences: { ...DEFAULT_CANDIDATE_PREFERENCES }
  });

  /**
   * Initialize New Encrypted Vault OR Encrypt & Migrate Legacy Plaintext Workspace
   */
  const handleInitializeOrMigrateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanName = stripDemoWorkspaceName(name).trim();
    const cleanEmail = stripDemoWorkspaceEmail(email).trim();

    if (step === 'details') {
      if (!cleanName) {
        setError('Please provide your full name.');
        return;
      }
      if (cleanEmail && !cleanEmail.includes('@')) {
        setError('Please provide a valid email address or leave it blank.');
        return;
      }
    } else if (cleanEmail && !cleanEmail.includes('@')) {
      setError('Please provide a valid contact email or leave it blank.');
      return;
    }

    if (passphrase.length < 8) {
      setError('Your Secret Passphrase must be at least 8 characters.');
      return;
    }

    setIsProcessing(true);

    try {
      const workspaceId =
        step === 'migrate'
          ? (legacyCapture?.user?.id || user?.id || 'ws-' + Math.random().toString(36).substring(2, 9))
          : 'ws-' + Math.random().toString(36).substring(2, 9);

      let biometricEnabled = false;
      let biometricCredentialId: string | undefined = undefined;
      if (enableBiometricOnSignup) {
        const { registerWebAuthnCredential } = await import('../utils/webauthn');
        const reg = await registerWebAuthnCredential(
          cleanName || 'BYOC Workspace',
          cleanEmail || 'local-vault@byoc.internal'
        );
        if (reg.success && reg.credentialId) {
          biometricEnabled = true;
          biometricCredentialId = reg.credentialId;
        } else {
          addToast({
            type: 'warning',
            title: 'Biometric Enrollment Skipped',
            message: reg.error || 'You can enroll hardware biometrics anytime from Settings.'
          });
        }
      }

      const meta: VaultEnvelope['meta'] = {
        id: workspaceId,
        name: cleanName,
        email: cleanEmail,
        biometricEnabled,
        biometricCredentialId,
        updatedAt: new Date().toISOString()
      };

      let initialVaultData = emptyVaultPayload(apiKeyInput.trim());
      if (step === 'migrate' && legacyCapture?.detected) {
        const merged = mergeLegacyIntoDecryptedVault(initialVaultData, legacyCapture.sensitiveData);
        initialVaultData = merged.merged;
        if (apiKeyInput.trim()) {
          initialVaultData.groqApiKey = apiKeyInput.trim();
        }
      }

      // Preserve any existing plaintext intake form draft inside the new encrypted vault
      const currentDraftState = readLegacyCareerFormDraftFromStorage();
      if (currentDraftState.status === 'valid' && !hasMeaningfulCareerFormDraft(initialVaultData.careerFormDraft)) {
        initialVaultData.careerFormDraft = currentDraftState.draft;
      }

      // Preserve any legacy email interaction records (IndexedDB / localStorage fallback)
      const legacyEmailRead = await readLegacyEmailRecords();
      if (legacyEmailRead.status === 'valid') {
        initialVaultData.emailInteractions = dedupeEmailInteractions([
          ...(initialVaultData.emailInteractions || []),
          ...legacyEmailRead.records
        ]);
      }

      const { envelope, generatedRecoveryPhrase } = await encryptVault(
        initialVaultData,
        passphrase,
        meta
      );

      // Verify persistent encrypted write AND round-trip payload restoration before scrubbing old keys
      await writeStoredVaultEnvelope(envelope);
      await verifyActiveSessionEnvelopeRestorable((restored) => {
        if (currentDraftState.status === 'valid' && !hasMeaningfulCareerFormDraft(restored.careerFormDraft)) {
          return false;
        }
        if (legacyEmailRead.status === 'valid') {
          const restoredEmails = Array.isArray(restored.emailInteractions) ? restored.emailInteractions : [];
          const restoredKeys = new Set(
            restoredEmails.map((item) => (item.messageId ? `msg:${item.messageId}` : `id:${item.id}`))
          );
          const allEmailsPresent = legacyEmailRead.records.every((orig) =>
            restoredKeys.has(orig.messageId ? `msg:${orig.messageId}` : `id:${orig.id}`)
          );
          if (!allEmailsPresent) return false;
        }
        return Boolean(restored);
      });

      const newUser = sanitizeUserMetadata({
        id: workspaceId,
        name: cleanName,
        email: cleanEmail,
        isEmailVerified: false,
        biometricEnabled,
        biometricCredentialId,
        hasEncryptedVault: true,
        createdAt: legacyCapture?.user?.createdAt || new Date().toISOString(),
        lastActive: new Date().toISOString()
      })!;

      restoreVaultDataToStore(initialVaultData, newUser);
      setIsLiveApiMode(true);

      // Scrub legacy plaintext only after encrypted vault write & restoration verification succeeded
      if (step === 'migrate' || legacyCapture?.detected) {
        completeLegacyMigrationScrub();
      }
      if (currentDraftState.status === 'valid' || currentDraftState.status === 'empty') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CAREER_FORM_DRAFT_KEY);
          }
        } catch {
          // Retain silently if removal fails; encrypted copy already verified
        }
      } else if (currentDraftState.status === 'error') {
        addToast({
          type: 'error',
          title: 'Intake Draft Migration Failed',
          message: currentDraftState.error
        });
      }

      if (legacyEmailRead.status === 'valid' || legacyEmailRead.status === 'empty') {
        try {
          await clearLegacyEmailStores();
          setHasAsyncLegacyEmails(false);
        } catch {
          // Retain silently if removal fails; encrypted copy already verified
        }
      } else if (legacyEmailRead.status === 'error') {
        addToast({
          type: 'error',
          title: 'Email Vault Migration Failed',
          message: legacyEmailRead.error
        });
      }

      setPassphrase('');
      setEnvelopeVersion((v) => v + 1);

      if (generatedRecoveryPhrase) {
        setCreatedRecoveryPhrase(generatedRecoveryPhrase);
      } else {
        useWizardStore.setState({ isAuthenticated: true, isBiometricLocked: false });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Encryption initialization failed';
      setError(`Failed to initialize secure vault: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Offline Local Vault Unlock (Strictly AES-256-GCM decryption)
   */
  const handleUnlockExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passphrase.trim()) {
      setError('Enter your Secret Passphrase to unlock.');
      return;
    }

    const envelope = readStoredVaultEnvelope();
    if (!envelope) {
      setError(
        'Encrypted vault envelope is missing on this device. Import an encrypted backup or initialize a new workspace.'
      );
      return;
    }

    setIsProcessing(true);

    try {
      let decrypted = await decryptVault(envelope, passphrase.trim());
      let mergedLegacy = false;

      if (legacyCapture?.detected && hasSensitiveLegacyData(legacyCapture)) {
        const merged = mergeLegacyIntoDecryptedVault(decrypted, legacyCapture.sensitiveData);
        decrypted = merged.merged;
        mergedLegacy = merged.didChange;
      }

      const cleanedEnvelopeMeta = sanitizeVaultMeta(envelope.meta);
      const restoredUser = sanitizeUserMetadata({
        id: user?.id || cleanedEnvelopeMeta.id,
        name: stripDemoWorkspaceName(user?.name) || cleanedEnvelopeMeta.name,
        email: stripDemoWorkspaceEmail(user?.email) || cleanedEnvelopeMeta.email,
        isEmailVerified: Boolean(user?.isEmailVerified),
        biometricEnabled: Boolean(user?.biometricEnabled ?? cleanedEnvelopeMeta.biometricEnabled),
        biometricCredentialId: user?.biometricCredentialId ?? cleanedEnvelopeMeta.biometricCredentialId,
        lastBiometricAuth: user?.lastBiometricAuth,
        hasEncryptedVault: true,
        createdAt: user?.createdAt || cleanedEnvelopeMeta.updatedAt,
        lastActive: new Date().toISOString()
      })!;

      const draftMigration = await migrateLegacyCareerFormDraft({
        getRawDraft: () =>
          typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem(CAREER_FORM_DRAFT_KEY)
            : null,
        removeLegacyDraft: () => {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CAREER_FORM_DRAFT_KEY);
          }
        },
        writeEnvelope: async (env) => writeStoredVaultEnvelope(env),
        readEnvelope: () => readStoredVaultEnvelope(),
        currentVaultData: decrypted,
        vaultMeta: buildVaultMetaFromUser(restoredUser)
      });

      if (draftMigration.status === 'migrated' && draftMigration.draft) {
        decrypted = { ...decrypted, careerFormDraft: draftMigration.draft };
      } else if (draftMigration.status === 'error') {
        addToast({
          type: 'error',
          title: 'Intake Draft Migration Failed',
          message: draftMigration.error
        });
      }

      const emailMigration = await migrateLegacyEmailRecordsToVault({
        readLegacyEmails: () => readLegacyEmailRecords(),
        clearLegacyEmails: () => clearLegacyEmailStores(),
        writeEnvelope: async (env) => writeStoredVaultEnvelope(env),
        readEnvelope: () => readStoredVaultEnvelope(),
        currentVaultData: decrypted,
        vaultMeta: buildVaultMetaFromUser(restoredUser)
      });

      if (emailMigration.status === 'migrated') {
        decrypted = { ...decrypted, emailInteractions: emailMigration.emailInteractions };
        setHasAsyncLegacyEmails(false);
      } else if (emailMigration.status === 'error') {
        addToast({
          type: 'error',
          title: 'Email Vault Migration Failed',
          message: emailMigration.error
        });
      }

      restoreVaultDataToStore(decrypted, restoredUser);
      useWizardStore.setState({ isAuthenticated: true, isBiometricLocked: false });

      if (hasDemoWorkspaceIdentity(envelope.meta)) {
        sanitizeStoredVaultEnvelopeMetadata();
      }

      if (mergedLegacy || legacyCapture?.detected) {
        const syncedOk = await syncVaultFromStoreNow();
        if (syncedOk) {
          completeLegacyMigrationScrub();
        }
      }

      setPassphrase('');
      addToast({
        type: 'success',
        title: 'Private Device Lock Unlocked',
        message: restoredUser.name ? `Welcome back, ${restoredUser.name}.` : 'Welcome back.'
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Decryption failed';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Import Encrypted Vault Envelope Backup (.json)
   */
  const handleImportEncryptedEnvelope = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    try {
      const rawText = await files[0].text();
      const parsed = JSON.parse(rawText);
      const candidateEnvelope = parsed?.envelope ? parsed.envelope : parsed;
      if (!isValidVaultEnvelope(candidateEnvelope)) {
        setError('Invalid encrypted backup file. Choose a valid BYOC vault backup.');
        return;
      }
      const sanitizedEnvelope: VaultEnvelope = {
        ...candidateEnvelope,
        meta: sanitizeVaultMeta(candidateEnvelope.meta)
      };
      await writeStoredVaultEnvelope(sanitizedEnvelope);
      sanitizeStoredVaultEnvelopeMetadata();
      setUser(
        sanitizeUserMetadata({
          id: sanitizedEnvelope.meta.id,
          name: sanitizedEnvelope.meta.name,
          email: sanitizedEnvelope.meta.email,
          isEmailVerified: false,
          biometricEnabled: sanitizedEnvelope.meta.biometricEnabled,
          biometricCredentialId: sanitizedEnvelope.meta.biometricCredentialId,
          hasEncryptedVault: true,
          createdAt: sanitizedEnvelope.meta.updatedAt,
          lastActive: new Date().toISOString()
        })
      );
      setStep('unlock');
      setEnvelopeVersion((v) => v + 1);
      addToast({
        type: 'success',
        title: 'Encrypted Vault Imported',
        message: 'Enter your Secret Passphrase or Emergency Recovery Phrase to unlock.'
      });
    } catch {
      setError('Unable to parse backup file. Ensure it is a valid BYOC encrypted envelope JSON.');
    }
  };

  /**
   * Emergency Vault Recovery Flow (Passphrase reset via Recovery Phrase)
   */
  const handleExecuteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!recoveryInput.trim()) {
      setError('Please provide your Emergency Recovery Phrase.');
      return;
    }
    if (newPassphraseInput.length < 8) {
      setError('Your new Secret Passphrase must be at least 8 characters.');
      return;
    }

    setIsProcessing(true);
    try {
      const envelope = readStoredVaultEnvelope();
      if (!envelope) {
        throw new Error('No encrypted vault envelope found on this device.');
      }

      let recoveredData = await recoverVaultWithSecret(envelope, recoveryInput.trim());

      if (legacyCapture?.detected && hasSensitiveLegacyData(legacyCapture)) {
        const merged = mergeLegacyIntoDecryptedVault(recoveredData, legacyCapture.sensitiveData);
        recoveredData = merged.merged;
      }

      const meta = sanitizeVaultMeta(envelope.meta);
      const { envelope: newEnvelope } = await encryptVault(
        recoveredData,
        newPassphraseInput,
        meta,
        recoveryInput.trim()
      );

      await writeStoredVaultEnvelope(newEnvelope);

      const restoredUser = sanitizeUserMetadata({
        id: user?.id || meta.id,
        name: stripDemoWorkspaceName(user?.name) || meta.name,
        email: stripDemoWorkspaceEmail(user?.email) || meta.email,
        isEmailVerified: Boolean(user?.isEmailVerified),
        biometricEnabled: Boolean(user?.biometricEnabled ?? meta.biometricEnabled),
        biometricCredentialId: user?.biometricCredentialId ?? meta.biometricCredentialId,
        hasEncryptedVault: true,
        createdAt: user?.createdAt || meta.updatedAt,
        lastActive: new Date().toISOString()
      })!;

      restoreVaultDataToStore(recoveredData, restoredUser);
      useWizardStore.setState({ isAuthenticated: true, isBiometricLocked: false });

      const draftMigration = await migrateLegacyCareerFormDraft({
        getRawDraft: () =>
          typeof window !== 'undefined' && window.localStorage
            ? window.localStorage.getItem(CAREER_FORM_DRAFT_KEY)
            : null,
        removeLegacyDraft: () => {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(CAREER_FORM_DRAFT_KEY);
          }
        },
        writeEnvelope: async (env) => writeStoredVaultEnvelope(env),
        readEnvelope: () => readStoredVaultEnvelope(),
        currentVaultData: buildVaultDataFromState(useWizardStore.getState()),
        vaultMeta: buildVaultMetaFromUser(restoredUser)
      });

      if (draftMigration.status === 'migrated' && draftMigration.draft) {
        useWizardStore.getState().setCareerFormDraft(draftMigration.draft);
      } else if (draftMigration.status === 'error') {
        addToast({
          type: 'error',
          title: 'Intake Draft Migration Failed',
          message: draftMigration.error
        });
      }

      const emailMigration = await migrateLegacyEmailRecordsToVault({
        readLegacyEmails: () => readLegacyEmailRecords(),
        clearLegacyEmails: () => clearLegacyEmailStores(),
        writeEnvelope: async (env) => writeStoredVaultEnvelope(env),
        readEnvelope: () => readStoredVaultEnvelope(),
        currentVaultData: buildVaultDataFromState(useWizardStore.getState()),
        vaultMeta: buildVaultMetaFromUser(restoredUser)
      });

      if (emailMigration.status === 'migrated') {
        useWizardStore.getState().setEmailInteractions(emailMigration.emailInteractions);
        setHasAsyncLegacyEmails(false);
      } else if (emailMigration.status === 'error') {
        addToast({
          type: 'error',
          title: 'Email Vault Migration Failed',
          message: emailMigration.error
        });
      }

      if (legacyCapture?.detected) {
        completeLegacyMigrationScrub();
      }

      setRecoveryInput('');
      setNewPassphraseInput('');
      setShowRecoveryModal(false);
      addToast({
        type: 'success',
        title: 'Emergency Vault Recovery Complete',
        message: 'New passphrase set and workspace restored.'
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Recovery failed';
      setError(`Recovery unsuccessful: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      key={envelopeVersion}
      lang={locale}
      dir={locale === "ur" ? "rtl" : "ltr"}
      className="byoc-auth-screen min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none"
    >
      <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" /><div className="auth-scanline" />
      <div className="auth-language"><span>{t("language")}</span><select aria-label="Choose language" value={locale} onChange={(e) => setLocale(e.target.value as AuthLocale)}>{AUTH_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.native}</option>)}</select></div>
      <div className="auth-layout"><section className="auth-hero" aria-label="BYOC introduction"><div className="auth-eyebrow"><span className="auth-live-dot" />YOUR CAREER, YOUR NEXT STEP</div><div className="auth-hero-logo"><ChakraLogo size={104} spin={false} glow={true} /></div><p className="auth-kicker">BYOC <span>// BUILD YOUR OWN CAREER</span></p><h1>{t("title")}</h1><p className="auth-hero-subtitle">{t("subtitle")}</p><div className="auth-phase-rail"><span>01 INGEST</span><i /><span>02 SOURCE</span><i /><span>03 TAILOR</span><i /><span>04 APPLY</span><i /><span>05 GROW</span></div><div className="auth-privacy"><ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" /><span>{t("privacy")}</span></div></section>

      <div className="auth-panel w-full max-w-md bg-[#0F172A]/90 border border-sky-400/20 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-center">
        <div className="flex justify-center mb-4">
          <ChakraLogo size={64} spin={false} glow={true} />
        </div>

        <div className="mb-6">
          <p className="text-[11px] font-mono text-sky-400 tracking-wider uppercase mb-1.5 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>{ui('Private Device Lock')}</span>
          </p>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            BYOC
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {ui('Build Your Own Career')}
          </p>
        </div>

        {/* Post-Signup / Post-Migration Recovery Secret Modal */}
        {createdRecoveryPhrase && (
          <div className="space-y-4 text-left p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/40">
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {ui('Emergency Recovery Phrase Generated')}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {ui('Write these words down and keep them somewhere private and safe. They are your backup key. If you forget your passphrase, these words are the only way to open your saved career information again. BYOC cannot reset it for you.')}
            </p>
            <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/30 font-mono text-sm text-center text-sky-300 select-all font-bold tracking-wider">
              {createdRecoveryPhrase}
            </div>
            <button
              type="button"
              onClick={async () => {
                setHasCopiedRecovery(false);
                const copied = await copyToClipboardSafely(createdRecoveryPhrase);
                if (copied) {
                  setHasCopiedRecovery(true);
                  addToast({ type: 'success', message: ui('Recovery phrase copied to clipboard.') });
                } else {
                  addToast({ type: 'error', message: ui('Clipboard access failed. Select and copy the recovery phrase manually.') });
                }
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {hasCopiedRecovery ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{hasCopiedRecovery ? ui('Copied to Clipboard') : ui('Copy Recovery Phrase')}</span>
            </button>
            <label className="flex items-start gap-2 text-xs text-slate-200 leading-relaxed cursor-pointer">
              <input type="checkbox" checked={hasConfirmedRecovery} onChange={(event) => setHasConfirmedRecovery(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-500" />
              <span>{ui('I have saved these backup words somewhere safe. I understand I will need them if I forget my passphrase.')}</span>
            </label>
            <button
              type="button"
              disabled={!hasConfirmedRecovery}
              onClick={() => {
                setCreatedRecoveryPhrase(null);
                useWizardStore.setState({ isAuthenticated: true, isBiometricLocked: false });
              }}
              className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-bold text-xs transition cursor-pointer"
            >
              {ui('I Have Saved My Recovery Phrase → Enter Workspace')}
            </button>
          </div>
        )}

        {!createdRecoveryPhrase && (
          <>
            {/* Mode Switcher */}
            {(hasExistingWorkspace || step === 'details') && !needsLegacyEncryptionMigration && (user || activeEnvelope) && (
              <div className="flex p-1 bg-slate-950 rounded-xl mb-5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setStep('unlock');
                    setShowNewWorkspaceConfirm(false);
                    setError('');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    step === 'unlock'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Unlock Vault
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (step === 'details') return;
                    setShowNewWorkspaceConfirm(true);
                    setError('');
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    step === 'details'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  New Workspace
                </button>
              </div>
            )}

            {/* Inline New Workspace Confirmation (replaces window.confirm) */}
            {showNewWorkspaceConfirm && (
              <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2.5">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Initialize a New Encrypted Vault?</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Initializing a new workspace creates a fresh encrypted vault envelope on this device. Export any needed backup first before replacing your current vault.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewWorkspaceConfirm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewWorkspaceConfirm(false);
                      setName('');
                      setEmail('');
                      setPassphrase('');
                      setApiKeyInput('');
                      setStep('details');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    Continue Setup
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Legacy Encryption Upgrade Banner */}
            {step === 'migrate' && (
              <div className="mb-4 p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-left space-y-1.5">
                <div className="flex items-center gap-2 text-sky-300 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Encrypt Existing Workspace Data</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Your existing workspace data is ready to be protected on this device with zero data loss:
                  {legacyCapture?.sensitiveData.masterResume ? ' Master Resume' : ''}
                  {hasLegacyDraft ? ' · Intake Form Draft' : ''}
                  {hasLegacyEmails ? ' · Email Records' : ''}
                  {legacyCapture?.sensitiveData.jobs?.length ? ` · ${legacyCapture.sensitiveData.jobs.length} Jobs` : ''}
                  {legacyCapture?.sensitiveData.applications?.length ? ` · ${legacyCapture.sensitiveData.applications.length} Applications` : ''}
                  {legacyCapture?.sensitiveData.groqApiKey ? ' · API Key' : ''}.
                </p>
              </div>
            )}

            {/* Registration OR Legacy Migration Form */}
            {(step === 'details' || step === 'migrate') && (
              <form onSubmit={handleInitializeOrMigrateVault} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t('name')} {step === 'details' ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={step === 'migrate' ? 'Optional — enter your full name' : 'Your full name'}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
                    required={step === 'details'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t('email')} (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Optional — you@domain.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500"
                    required={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t('passphrase')} * (Min 8 Characters)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Create a Secret Passphrase"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Your passphrase protects this private workspace and is never stored on this device.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Groq API Key (Optional)
                    </label>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      Get Free Key &rarr;
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="gsk_... (Can be added later in Settings)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-sky-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Encrypted inside your vault envelope. Offline unlock never requires Groq.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="bioEnroll"
                    checked={enableBiometricOnSignup}
                    onChange={(e) => setEnableBiometricOnSignup(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="bioEnroll" className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
                    <Fingerprint className="w-3.5 h-3.5 text-sky-400" />
                    <span>Enable session hardware biometric shield</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer mt-2 disabled:opacity-60"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-sky-200 animate-spin" />
                      <span>Securing your private workspace...</span>
                    </>
                  ) : (
                    <>
                      <span>{step === 'migrate' ? 'Encrypt & Migrate Workspace' : t('create')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Unlock Existing Workspace Screen */}
            {step === 'unlock' && (
              <form onSubmit={handleUnlockExisting} className="space-y-4 text-left">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-sky-500/20 border border-indigo-500/40 flex items-center justify-center text-sky-300 font-bold text-sm shrink-0">
                      {displayProfileName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{displayProfileName}</div>
                      {displayProfileEmail && (
                        <div className="text-xs text-slate-400 truncate">{displayProfileEmail}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                    {activeEnvelope ? 'Offline Ready' : 'Vault Missing'}
                  </span>
                </div>

                {/* Missing Vault Envelope Hard Lock Recovery State */}
                {!activeEnvelope ? (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-3">
                    <div className="flex items-start gap-2 text-rose-300 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <div>
                        <p className="font-bold">Encrypted Vault Envelope Missing</p>
                        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                          The encrypted vault envelope (<span className="font-mono">byoc_secure_vault_envelope</span>) is absent on this browser. Access remains locked. Import your encrypted vault backup to restore access, or initialize a new workspace above.
                        </p>
                      </div>
                    </div>

                    <input
                      ref={backupImportRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => handleImportEncryptedEnvelope(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => backupImportRef.current?.click()}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Encrypted Vault Backup (.json)</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {user?.biometricEnabled && (
                      <p className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
                        <Fingerprint className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>
                          Session biometrics enabled. A Secret Passphrase is still required when reopening BYOC.
                        </span>
                      </p>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-300">
                          Secret Passphrase
                        </label>
                        <button
                          type="button"
                          onClick={() => { setShowRecoveryModal(true); setError(''); }}
                          className="text-[11px] text-sky-400 hover:text-sky-300 transition cursor-pointer"
                        >
                          Forgot Passphrase?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassphrase ? 'text' : 'password'}
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Enter your Secret Passphrase"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500 pr-10"
                          autoFocus
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                          aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Decrypts offline without contacting external servers.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer disabled:opacity-60"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-sky-300 animate-spin" />
                          <span>Unlocking your private workspace...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>{t('unlock')}</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>
            )}
          </>
        )}

        {/* Emergency Recovery Modal */}
        {showRecoveryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-left">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Emergency Vault Recovery</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleExecuteRecovery} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Emergency Recovery Phrase
                  </label>
                  <input
                    type="text"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="BYOC-XXXX-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-sky-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Generated when this encrypted vault was initialized.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    New Secret Passphrase (Min 8 Characters)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassphrase ? 'text' : 'password'}
                      value={newPassphraseInput}
                      onChange={(e) => setNewPassphraseInput(e.target.value)}
                      placeholder="Set new passphrase"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-sky-500 pr-9"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassphrase(!showNewPassphrase)}
                      aria-label={showNewPassphrase ? 'Hide new passphrase' : 'Show new passphrase'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                    >
                      {showNewPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-bold text-xs transition cursor-pointer shadow-md"
                >
                  {isProcessing ? 'Verifying Recovery Key...' : 'Recover & Set New Passphrase'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
