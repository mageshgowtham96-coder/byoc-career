import React, { useEffect, useRef, useState } from 'react';
import { useWizardStore, syncVaultFromStoreNow } from '../../store/useWizardStore';
import {
  VAULT_STORAGE_KEY,
  lockVaultSession,
  readStoredVaultEnvelope
} from '../../utils/cryptoVault';
import { WORKSPACE_STORE_KEY } from '../../utils/vaultMigration';
import { emailVault } from '../../services/emailSyncService';
import { safeRemoveItem } from '../../utils/storagePersistence';
import { getAvailableGroqModels, selectGroqChatModel, formatGroqError } from '../../services/groqService';
import {
  Settings,
  Zap,
  Key,
  Shield,
  Download,
  Trash2,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Cpu,
  Fingerprint,
  Mail,
  RefreshCw,
  Database,
  BookOpen,
  FileKey2,
  X
} from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const {
    groqApiKey,
    setGroqApiKey,
    setIsLiveApiMode,
    user,
    toggleBiometricEnrollment,
    emailInteractions,
    runEmailSync,
    isEmailSyncing,
    lastEmailSyncDate,
    settingsFocusSection,
    setSettingsFocusSection,
    signOut,
    addToast
  } = useWizardStore();

  const [inputKey, setInputKey] = useState(groqApiKey);
  const [showKey, setShowKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showPlaintextBackupConfirm, setShowPlaintextBackupConfirm] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [activeDocSection, setActiveDocSection] = useState<'quickstart' | 'security' | 'formats'>(
    settingsFocusSection === 'recovery-help' ? 'security' : 'quickstart'
  );
  const backupSectionRef = useRef<HTMLElement>(null);
  const docsSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setInputKey(groqApiKey);
  }, [groqApiKey]);

  useEffect(() => {
    if (settingsFocusSection === 'backup') {
      backupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSettingsFocusSection(null);
    } else if (settingsFocusSection === 'recovery-help') {
      setActiveDocSection('security');
      docsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSettingsFocusSection(null);
    }
  }, [settingsFocusSection, setSettingsFocusSection]);

  const handleSaveKey = async () => {
    const trimmed = inputKey.trim();
    setGroqApiKey(trimmed);
    setIsLiveApiMode(Boolean(trimmed));
    const synced = await syncVaultFromStoreNow();

    if (trimmed) {
      addToast({
        type: 'success',
        title: 'Groq API Key Saved',
        message: synced
          ? 'Encrypted in your private device vault. Live Groq inference active.'
          : 'Groq key active for this session.'
      });
    } else {
      addToast({
        type: 'info',
        message: 'Groq API Key cleared from vault. Local non-AI tools remain available.'
      });
    }
  };

  const handleTestGroq = async () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setTestResult({ success: false, msg: 'Please enter a Groq API key first.' });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    try {
      const models = await getAvailableGroqModels(trimmed);
      const selectedModel = selectGroqChatModel(models);
      if (!selectedModel) {
        throw new Error('The key is valid, but no supported BYOC chat model is available to it. Check your Groq model access and plan.');
      }
      setGroqApiKey(trimmed);
      setIsLiveApiMode(true);
      await syncVaultFromStoreNow();
      setTestResult({
        success: true,
        msg: `Connection verified. BYOC can use ${selectedModel}; ${models.length} model IDs are visible to this key. Key saved cleanly into your encrypted vault.`
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        msg: formatGroqError(err, 'Connection failed. Check your API key and network status.')
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleExportWorkspaceJson = () => {
    const fullState = useWizardStore.getState();
    const sanitizedUser = fullState.user
      ? {
          id: fullState.user.id,
          name: fullState.user.name,
          email: fullState.user.email,
          biometricEnabled: Boolean(fullState.user.biometricEnabled),
          hasEncryptedVault: Boolean(fullState.user.hasEncryptedVault),
          createdAt: fullState.user.createdAt,
          lastActive: fullState.user.lastActive
        }
      : null;

    const backupData = {
      schemaVersion: 4,
      user: sanitizedUser,
      masterResume: fullState.masterResume,
      jobs: fullState.jobs,
      selectedJobId: fullState.selectedJobId,
      tailoredArtifacts: fullState.tailoredArtifacts,
      applications: fullState.applications,
      unsavedQueue: fullState.unsavedQueue,
      candidatePreferences: fullState.candidatePreferences,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BYOC_Workspace_Snapshot_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowPlaintextBackupConfirm(false);
    addToast({
      type: 'success',
      message: 'Unencrypted career snapshot exported (API keys & passkeys omitted). Keep the file private or delete it when no longer needed.'
    });
  };

  const handleExportEncryptedVault = async () => {
    const synced = await syncVaultFromStoreNow();
    if (!synced) {
      addToast({
        type: 'error',
        title: 'Encrypted Backup Not Exported',
        message: 'BYOC could not confirm that the latest changes were saved. Retry the vault save before exporting a current backup.'
      });
      return;
    }
    const envelope = readStoredVaultEnvelope();
    if (!envelope) {
      addToast({
        type: 'warning',
        title: 'Vault Envelope Unavailable',
        message: 'No encrypted vault envelope found in local storage.'
      });
      return;
    }

    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BYOC_Encrypted_Vault_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      type: 'success',
      title: 'Encrypted Vault Exported',
      message: 'Ciphertext envelope saved (.json). Requires your passphrase or recovery phrase to restore.'
    });
  };

  const handleConfirmWipe = async () => {
    setIsWiping(true);
    try {
      lockVaultSession();
      await emailVault.clear();
      safeRemoveItem(WORKSPACE_STORE_KEY);
      safeRemoveItem(VAULT_STORAGE_KEY);
      safeRemoveItem('byoc_email_vault_fallback');
      safeRemoveItem('byoc_career_form_draft');
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(WORKSPACE_STORE_KEY);
        window.localStorage.removeItem(VAULT_STORAGE_KEY);
        window.localStorage.removeItem('byoc_email_vault_fallback');
        window.localStorage.removeItem('byoc_career_form_draft');
      }
      window.location.reload();
    } catch (err: unknown) {
      setIsWiping(false);
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to purge local storage.'
      });
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-sky-400" />
          <span>System &amp; Workspace Settings</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Manage AI provider access, private device backups, biometric screen shield, and documentation.
        </p>
      </div>

      {/* Groq Intelligence Configuration */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Groq API &amp; Model Orchestration</h3>
              <p className="text-xs text-slate-400">
                Direct browser-to-Groq inference (GPT-OSS 120B / 20B)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium self-start sm:self-auto">
            {groqApiKey ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Groq Key Configured</span>
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <Key className="w-3.5 h-3.5" />
                <span>Key Required for AI</span>
              </span>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="settings-groq-key" className="block text-xs font-semibold text-slate-300 mb-1.5">
            Groq API Key (Stored Exclusively Inside Encrypted Vault)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                id="settings-groq-key"
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#070B14] border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-sky-500 pr-10"
              />
              <button
                type="button"
                aria-label={showKey ? 'Hide Groq API Key' : 'Show Groq API Key'}
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveKey}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                Save Key
              </button>
              <button
                type="button"
                onClick={handleTestGroq}
                disabled={isTestingKey}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
              >
                {isTestingKey ? 'Pinging...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{testResult.msg}</span>
          </div>
        )}

        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Groq remains available for existing career workflows. Gemini is enabled for explicit, user-triggered PDF document understanding in the Documents tab. The original PDF is sent directly to Google only after the user requests analysis or asks a question; its key is stored in the encrypted device vault.
          </span>
          <span className="text-emerald-400 font-mono text-[11px] shrink-0">Live BYOK Architecture</span>
        </div>
      </section>

      {/* Hardware Biometric Security Shield */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">In-Session Hardware Screen Shield</h3>
              <p className="text-xs text-slate-400">
                WebAuthn / Touch ID / Biometrics protect active unlocked sessions
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-mono font-semibold ${
              user?.biometricEnabled ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {user?.biometricEnabled ? 'Shield Enrolled' : 'Disabled'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div>
            <span className="text-xs font-bold text-white block">Session Hardware Lock</span>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Locks quick screen access during an active session. Reopening BYOC still requires your Secret Passphrase.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (!user?.biometricEnabled) {
                try {
                  const { registerWebAuthnCredential } = await import('../../utils/webauthn');
                  const reg = await registerWebAuthnCredential(user?.name || 'BYOC User', user?.email || 'user@byoc.app');
                  if (reg.success && reg.credentialId) {
                    toggleBiometricEnrollment(true, reg.credentialId);
                  } else {
                    addToast({
                      type: 'warning',
                      title: 'Biometric Enrollment Unsuccessful',
                      message: reg.error || 'Hardware authentication cancelled or unsupported on this platform.'
                    });
                  }
                } catch (e: unknown) {
                  addToast({
                    type: 'error',
                    message: e instanceof Error ? e.message : 'Biometric registration failed'
                  });
                }
              } else {
                toggleBiometricEnrollment(false);
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto ${
              user?.biometricEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {user?.biometricEnabled ? 'Disable Shield' : 'Enroll Biometrics'}
          </button>
        </div>
      </section>

      {/* Client-Side Email Vault */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Local Email Interaction Vault</h3>
              <p className="text-xs text-slate-400">
                Private device vault storage ({emailInteractions.length} stored) · OAuth external inbox sync is not connected
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => runEmailSync()}
            disabled={isEmailSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isEmailSyncing ? 'animate-spin' : ''}`} />
            <span>{isEmailSyncing ? 'Checking...' : 'Check Local Email Vault'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          No inbox is connected, so this check does not fetch new email. It checks access to records already stored in the encrypted local vault; Gmail/Workspace OAuth is not connected.
          {lastEmailSyncDate && (
            <span className="block text-[11px] font-mono text-slate-500 mt-1 tabular-nums">
              Last Checked: {new Date(lastEmailSyncDate).toLocaleTimeString()}
            </span>
          )}
        </p>
      </section>

      {/* Encrypted Vault Identity & Lock */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Encrypted Local Vault</h3>
            <p className="text-xs text-slate-400">All sensitive career records are encrypted on-device at rest</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3.5 rounded-xl bg-[#070B14] border border-slate-800">
            <span className="text-[11px] text-slate-400 font-mono block">Workspace Identity</span>
            <span className="font-bold text-white mt-1 block">{user?.name?.trim() || 'Local Workspace'}</span>
            <span className="text-slate-400 text-[11px]">{user?.email?.trim() || 'No email set'}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#070B14] border border-slate-800">
            <span className="text-[11px] text-slate-400 font-mono block">Device Privacy</span>
            <span className="font-bold text-emerald-400 mt-1 block">
              {user?.hasEncryptedVault ? 'Private Device Lock · Protected' : 'Vault Protected'}
            </span>
            <span className="text-slate-500 text-[11px] tabular-nums">
              Created {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Lock Workspace Vault</span>
          </button>
        </div>
      </section>

      {/* Data Backup, Encrypted Envelope Export & Wipe */}
      <section ref={backupSectionRef} className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Data Portability, Encrypted Backup &amp; Reset</h3>
            <p className="text-xs text-slate-400">
              Export either an encrypted vault envelope (for cross-device restoration) or a redacted readable snapshot
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-amber-200">
              Automatic Android cloud backup and device-to-device app-data transfer are disabled. Export the encrypted vault before uninstalling BYOC or moving to another device, and keep your recovery phrase somewhere safe. Readable snapshots are not encrypted.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportEncryptedVault}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
          >
            <FileKey2 className="w-3.5 h-3.5" />
            <span>Export Encrypted Vault (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPlaintextBackupConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export Readable Snapshot (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowWipeModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition cursor-pointer sm:ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe Local Data</span>
          </button>
        </div>
      </section>

      {/* Built-In Help & Documentation Hub */}
      <section ref={docsSectionRef} className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Help &amp; Documentation</h3>
              <p className="text-xs text-slate-400">Built-in workspace workflow guide, encryption architecture, and format support</p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#070B14] border border-slate-800 self-start sm:self-auto">
            {([
              { id: 'quickstart', label: 'Workflow' },
              { id: 'security', label: 'Encryption & Recovery' },
              { id: 'formats', label: 'Formats & AI' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDocSection(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeDocSection === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#070B14] border border-slate-800 text-xs text-slate-300 space-y-2.5 leading-relaxed">
          {activeDocSection === 'quickstart' && (
            <>
              <p className="font-semibold text-white">5-Stage Career Execution Pipeline</p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                <li><strong className="text-slate-200">Intake:</strong> Upload your master resume or paste raw text, verify extracted milestones in the Review Gate, and approve into your vault.</li>
                <li><strong className="text-slate-200">Sourcing:</strong> Paste job descriptions from any board or query the public Remotive, Remote OK, and Jobicy remote feeds. These are not an exhaustive global index; Adzuna needs server-side credentials, and LinkedIn/Glassdoor/Naukri/Indeed/Foundit/Instahyre remain shortcuts rather than live feeds.</li>
                <li><strong className="text-slate-200">Vetting:</strong> Compare stated job requirements with your career evidence via Groq. Company culture and salary-market competitiveness are not independently verified.</li>
                <li><strong className="text-slate-200">Customize:</strong> Generate role-relevant resume versions from available evidence, review generated wording, export PDF/DOCX/TXT, and use questionnaire chips.</li>
                <li><strong className="text-slate-200">Tracking &amp; Prep-Zone:</strong> Save immutable application snapshots, track interview stages, and practice domain-grounded prompts.</li>
              </ol>
            </>
          )}

          {activeDocSection === 'security' && (
            <>
              <p className="font-semibold text-white">Private Device Lock &amp; Recovery</p>
              <ul className="space-y-1.5 text-slate-400">
                <li>• <strong className="text-slate-200">Encrypted At Rest:</strong> Your Master Resume, intake drafts, email records, saved jobs, tailored kits, applications, preferences, and API keys are stored only inside BYOC's encrypted on-device vault.</li>
                <li>• <strong className="text-slate-200">Key Wrapping:</strong> Your Secret Passphrase and Emergency Recovery Phrase (<span className="font-mono text-sky-400">BYOC-XXXX-...</span>) protect access to your encrypted workspace. Keep both private and store your recovery phrase somewhere safe.</li>
                <li>• <strong className="text-slate-200">Offline Recovery:</strong> If you forget your passphrase, switch to Emergency Recovery on the unlock screen, verify your recovery phrase, and set a new passphrase without losing any stored data.</li>
                <li>• <strong className="text-slate-200">Portable Backups:</strong> Export your encrypted vault envelope above to back up your ciphertext offline or import it onto another browser.</li>
              </ul>
            </>
          )}

          {activeDocSection === 'formats' && (
            <>
              <p className="font-semibold text-white">Supported Document Formats &amp; BYOK Behavior</p>
              <ul className="space-y-1.5 text-slate-400">
                <li>• <strong className="text-slate-200">Supported Local Extraction:</strong> Processes <span className="font-mono text-slate-200">.txt</span>, <span className="font-mono text-slate-200">.md</span>, standard compressed XML <span className="font-mono text-slate-200">.docx</span>, and basic selectable-text <span className="font-mono text-slate-200">.pdf</span> files up to 10MB 100% locally on-device.</li>
                <li>• <strong className="text-slate-200">Unsupported Formats (No OCR):</strong> Raster image OCR (PNG/JPG/scanned PDFs), encrypted PDFs, and complex CID/custom-font PDF glyph maps remain unsupported. When readable text cannot be extracted, BYOC directs you to the Manual Paste Fallback box.</li>
                <li>• <strong className="text-slate-200">Groq BYOK (Active AI Provider):</strong> Create a free or paid key at <span className="font-mono text-sky-400">console.groq.com</span> and paste it above. The Documents tab accepts a Gemini API key for direct multimodal PDF understanding. Gemini is called only after explicit user action; quotas and data-use terms differ by account tier. Without a Groq key (or if Groq is unreachable/rate-limited), all local vault, sourcing, offline baseline export, Assisted-Apply, and tracking workflows remain functional offline.</li>
              </ul>
            </>
          )}
        </div>
      </section>

      {showPlaintextBackupConfirm && (
        <div role="dialog" aria-modal="true" aria-labelledby="plaintext-backup-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#0F172A] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><AlertCircle className="h-5 w-5" /></div>
              <h3 id="plaintext-backup-title" className="text-base font-bold text-white">Export readable, unencrypted data?</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              This JSON file can be read by anyone who obtains it. It contains your career profile, saved jobs, tailored resume content and application records. API keys and passkeys are omitted. Prefer the encrypted vault export unless you specifically need a readable copy.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" onClick={() => setShowPlaintextBackupConfirm(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={handleExportWorkspaceJson} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500">Export readable snapshot</button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal for Wiping Local Data (Zero window.confirm) */}
      {showWipeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wipe-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md bg-[#0F172A] border border-rose-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="wipe-modal-title" className="text-base font-bold text-white">
                    Wipe Entire Local Workspace?
                  </h3>
                  <p className="text-xs text-rose-300 font-mono">Permanent On-Device Purge</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                onClick={() => setShowWipeModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This permanently removes your encrypted vault envelope, workspace metadata, IndexedDB email logs, master resume, saved jobs, applications, and API keys from this browser. Export an Encrypted Vault backup first if you plan to restore later.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowWipeModal(false)}
                disabled={isWiping}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWipe}
                disabled={isWiping}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isWiping ? 'Purging...' : 'Confirm Wipe Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

