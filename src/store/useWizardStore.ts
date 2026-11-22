import { create } from 'zustand';
const invalidateTailoredArtifacts = (
  artifacts: Record<string, TailoredArtifact>
): Record<string, TailoredArtifact> => Object.fromEntries(
  Object.entries(artifacts).map(([id, artifact]) => [id, {
    ...artifact,
    reviewConfirmed: false,
    summaryEvidence: [],
    coverLetterEvidence: [],
    interviewPrepQuestions: [],
    variants: (artifact.variants || []).map((variant) => ({
      ...variant,
      summaryEvidence: [],
      coverLetterEvidence: [],
      interviewPrepQuestions: []
    }))
  }])
);

import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  MasterResume,
  JobPosting,
  JobVerificationEvidence,
  TailoredArtifact,
  InterviewQuestion,
  ApplicationRecord,
  UserWorkspace,
  AppToast,
  ActiveTab,
  ApplicationStatus,
  UnsavedApplicationCandidate,
  ExperienceItem,
  CandidatePreferences,
  CareerApplicationFormState,
  EmailInteraction,
  PortalShortcut,
  ExportedMaterialRecord
} from '../types';
import {
  configureEncryptedEmailVault,
  syncAndProcessIncomingEmails
} from '../services/emailSyncService';
import {
  DEFAULT_PORTAL_SHORTCUTS,
  mergePortalShortcuts,
  sanitizeExternalHttpUrl
} from '../services/jobSearchService';
import {
  VAULT_STORAGE_KEY,
  hasActiveVaultKey,
  lockVaultSession,
  sanitizeStoredVaultEnvelopeMetadata,
  stripDemoWorkspaceEmail,
  stripDemoWorkspaceName,
  syncUnlockedVault,
  writeStoredVaultEnvelope,
  type DecryptedVaultData,
  type VaultEnvelope
} from '../utils/cryptoVault';
import { transitionVaultPersistenceStatus } from './vaultPersistenceStatus';
import {
  WORKSPACE_STORE_KEY,
  extractLegacyPlaintextFromRawStore,
  mergeWorkspaceStoreState,
  migrateWorkspaceStoreState,
  sanitizeStoredWorkspaceStoreMetadata,
  sanitizeWorkspaceUser,
  scrubAndVerifyStoredWorkspace,
  type LegacyPlaintextCapture
} from '../utils/vaultMigration';
import { sanitizeCareerFormState } from '../utils/storagePersistence';
import { hasCareerEvidence } from '../utils/resumeReadiness';

export const DEFAULT_CANDIDATE_PREFERENCES: CandidatePreferences = {
  country: 'IN',
  includeWorldwideRemote: true,
  preferredLocations: [],
  portals: ['Greenhouse', 'Workable', 'User Import'],
  portalShortcuts: DEFAULT_PORTAL_SHORTCUTS,
  noticePeriod: '',
  expectedCtc: '',
  currentCtc: '',
  totalExperienceYears: null,
  profession: '',
  targetRole: '',
  seniority: '',
  workplaceTypePreference: 'All'
};

export function sanitizeUserMetadata(user: UserWorkspace | null): UserWorkspace | null {
  return sanitizeWorkspaceUser(user);
}

function captureAndSanitizeLegacyStore(): LegacyPlaintextCapture | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      sanitizeStoredVaultEnvelopeMetadata(window.localStorage, VAULT_STORAGE_KEY);
      let raw = window.localStorage.getItem(WORKSPACE_STORE_KEY);
      const storeClean = sanitizeStoredWorkspaceStoreMetadata(window.localStorage, WORKSPACE_STORE_KEY);
      if (storeClean.status === 'updated' || storeClean.status === 'clean') {
        raw = storeClean.raw;
      }
      const capture = extractLegacyPlaintextFromRawStore(raw);
      return capture.detected ? capture : null;
    }
  } catch {
    // Ignore storage read restrictions
  }
  return null;
}

// Capture any unmigrated legacy plaintext store BEFORE Zustand partialize can overwrite it
let pendingLegacyCapture: LegacyPlaintextCapture | null = captureAndSanitizeLegacyStore();

export function getPendingLegacyCapture(): LegacyPlaintextCapture | null {
  return pendingLegacyCapture;
}

export function hasSensitiveLegacyData(capture: LegacyPlaintextCapture | null = pendingLegacyCapture): boolean {
  if (!capture || !capture.detected) return false;
  return Object.keys(capture.sensitiveData).length > 0;
}

export function refreshPendingLegacyCapture(): LegacyPlaintextCapture | null {
  const refreshed = captureAndSanitizeLegacyStore();
  if (refreshed !== null || typeof window !== 'undefined') {
    pendingLegacyCapture = refreshed;
  }
  return pendingLegacyCapture;
}

export function completeLegacyMigrationScrub(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const ok = scrubAndVerifyStoredWorkspace(window.localStorage, WORKSPACE_STORE_KEY);
      if (!ok) {
        return false;
      }
    }
    pendingLegacyCapture = null;
    return true;
  } catch {
    return false;
  }
}

interface ActionGateResult {
  allowed: boolean;
  reason?: string;
  targetTab?: ActiveTab;
}

interface RejectionCollisionCheck {
  isCollision: boolean;
  pastRecord?: ApplicationRecord;
}

type VaultDataWithPreviousResume = DecryptedVaultData & { previousMasterResume?: MasterResume | null };

interface WizardState {
  // Navigation & Tabs
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  settingsFocusSection: 'backup' | 'recovery-help' | null;
  setSettingsFocusSection: (section: 'backup' | 'recovery-help' | null) => void;

  // Local Dual-Stage Onboarding & Biometrics
  user: UserWorkspace | null;
  isAuthenticated: boolean;
  isBiometricLocked: boolean;
  vaultPersistenceError: string | null;
  setUser: (user: UserWorkspace | null) => void;
  unlockBiometric: () => void;
  lockBiometric: () => void;
  toggleBiometricEnrollment: (enable: boolean, credentialId?: string) => void;
  signOut: () => void;

  // API Config & Key Presence
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  isLiveApiMode: boolean;
  setIsLiveApiMode: (live: boolean) => void;

  // Master Resume Profile & Half-Built Builder
  masterResume: MasterResume | null;
  previousMasterResume: MasterResume | null;
  restorePreviousMasterResume: () => void;
  stagedParsedResume: MasterResume | null;
  careerFormDraft: CareerApplicationFormState | null;
  setCareerFormDraft: (draft: CareerApplicationFormState | null) => void;
  setStagedParsedResume: (resume: MasterResume | null) => void;
  confirmStagedResume: () => void;
  updateMasterResume: (updater: (prev: MasterResume) => MasterResume) => void;
  addExperienceMilestone: (exp: Omit<ExperienceItem, 'id'>) => void;
  removeExperienceMilestone: (id: string) => void;
  clearMasterResume: () => void;

  // Job Sourcing & Selection
  jobs: JobPosting[];
  selectedJobId: string | null;
  setJobs: (jobs: JobPosting[]) => void;
  addJob: (job: JobPosting) => void;
  setSelectedJobId: (id: string | null) => void;
  updateJobVetting: (jobId: string, vetting: JobPosting['vetting']) => void;
  updateJobVerification: (jobId: string, evidence: JobVerificationEvidence) => void;
  updateJobUrl: (jobId: string, url: string, source?: string) => boolean;
  isJobPreviouslyTracked: (company: string, role: string) => boolean;

  // Candidate Preferences & Portal Shortcuts
  candidatePreferences: CandidatePreferences;
  setCandidatePreferences: (prefs: Partial<CandidatePreferences>) => void;
  addPortalShortcut: (shortcut: { name: string; searchUrlTemplate: string; note?: string }) => boolean;
  removePortalShortcut: (id: string) => void;

  // Tailored Artifacts & Sibling Variants
  tailoredArtifacts: Record<string, TailoredArtifact>;
  saveTailoredArtifact: (jobId: string, artifact: TailoredArtifact) => void;
  saveInterviewPrepQuestions: (jobId: string, questions: InterviewQuestion[]) => void;
  setTailoredArtifactReviewConfirmed: (jobId: string, confirmed: boolean) => void;
  selectTailoredVariant: (jobId: string, variantId: string) => void;
  recordExportedMaterial: (jobId: string, record: Omit<ExportedMaterialRecord, 'id'>) => void;

  // Tracking Pipeline & Rejection Deduplication
  applications: ApplicationRecord[];
  applyForJob: (jobId: string, notes?: string, overrideRejection?: boolean, portalSource?: string) => ApplicationRecord | null;
  checkRejectionCollision: (company: string, role: string) => RejectionCollisionCheck;
  updateApplicationStatus: (id: string, status: ApplicationStatus, rejectionData?: { reason: string; notes: string }) => void;
  updateApplicationNotes: (id: string, notes: string) => void;
  deleteApplication: (id: string) => void;
  addInterviewStage: (applicationId: string, stageName: string, date: string, notes: string) => void;
  getFollowUpRequiredApplications: () => ApplicationRecord[];
  generateFollowUpEmailContent: (app: ApplicationRecord) => { subject: string; body: string };

  // Unsaved Applications Queue (External Discovery Engine)
  unsavedQueue: UnsavedApplicationCandidate[];
  addUnsavedQueueItem: (candidate: UnsavedApplicationCandidate) => void;
  approveUnsavedApplication: (id: string) => ApplicationRecord | null;
  dismissUnsavedApplication: (id: string) => void;

  // Client-Side Email Polling & Sync Engine (Encrypted Vault Backed)
  emailInteractions: EmailInteraction[];
  setEmailInteractions: (items: EmailInteraction[]) => void;
  isEmailSyncing: boolean;
  lastEmailSyncDate: string | null;
  runEmailSync: () => Promise<void>;

  // UI Toast System
  toasts: AppToast[];
  addToast: (toast: Omit<AppToast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Readiness Selectors & Action Gating
  hasMasterResume: () => boolean;
  hasSelectedJob: () => boolean;
  hasTailoredArtifact: () => boolean;
  getSelectedJob: () => JobPosting | null;
  checkActionGate: (action: 'tailor' | 'apply' | 'vet') => ActionGateResult;
}

export function buildVaultDataFromState(state: WizardState): VaultDataWithPreviousResume {
  return {
    geminiApiKey: state.geminiApiKey || '',
    masterResume: state.masterResume || null,
    previousMasterResume: state.previousMasterResume || null,
    careerFormDraft: state.careerFormDraft || null,
    emailInteractions: Array.isArray(state.emailInteractions) ? state.emailInteractions : [],
    jobs: state.jobs || [],
    selectedJobId: state.selectedJobId || null,
    tailoredArtifacts: state.tailoredArtifacts || {},
    applications: state.applications || [],
    unsavedQueue: state.unsavedQueue || [],
    candidatePreferences: state.candidatePreferences || { ...DEFAULT_CANDIDATE_PREFERENCES }
  };
}

export function buildVaultMetaFromUser(user: UserWorkspace): VaultEnvelope['meta'] {
  return {
    id: user.id,
    name: stripDemoWorkspaceName(user.name),
    email: stripDemoWorkspaceEmail(user.email),
    biometricEnabled: Boolean(user.biometricEnabled),
    biometricCredentialId: user.biometricCredentialId,
    updatedAt: new Date().toISOString()
  };
}

export function buildApplicationSnapshotRecord(params: {
  job: JobPosting;
  existingTailored?: TailoredArtifact | null;
  masterResumeSummary?: string;
  notes?: string;
  portalSource?: string;
}): ApplicationRecord {
  const { job, existingTailored, masterResumeSummary = '', notes = '', portalSource } = params;
  const nowIso = new Date().toISOString();

  const frozenSnapshot: TailoredArtifact = existingTailored
    ? JSON.parse(JSON.stringify(existingTailored))
    : {
        id: 'snap-' + Date.now(),
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        selectedVariantId: 'master-baseline',
        variants: [],
        tailoredSummary: masterResumeSummary,
        highlightedSkills: [...(job.skillsRequired || []), ...(job.skillsListed || [])],
        optimizedBullets: [],
        coverLetter: '',
        interviewPrepQuestions: [],
        generationTimestamp: nowIso,
        authenticityGuaranteed: false,
        exportedMaterials: []
      };

  const exportedMaterials: ExportedMaterialRecord[] | undefined =
    frozenSnapshot.exportedMaterials && frozenSnapshot.exportedMaterials.length > 0
      ? JSON.parse(JSON.stringify(frozenSnapshot.exportedMaterials))
      : undefined;

  const validUrl = sanitizeExternalHttpUrl(job.url);

  return {
    id: 'app-' + Date.now(),
    jobId: job.id,
    company: job.company,
    role: job.title,
    location: job.location,
    workplaceType: job.workplaceType,
    salary: job.salary,
    appliedDate: nowIso,
    status: 'Saved',
    jobDescriptionRaw: job.jobDescriptionRaw,
    tailoredResumeSnapshot: frozenSnapshot,
    notes,
    portalSource: portalSource || job.source || 'User Import',
    jobUrl: validUrl || undefined,
    skillsRequired: Array.isArray(job.skillsRequired) && job.skillsRequired.length > 0 ? [...job.skillsRequired] : undefined,
    skillsPreferred: Array.isArray(job.skillsPreferred) && job.skillsPreferred.length > 0 ? [...job.skillsPreferred] : undefined,
    skillsListed: Array.isArray(job.skillsListed) && job.skillsListed.length > 0 ? [...job.skillsListed] : undefined,
    eligibilityAssessment: job.eligibilityAssessment ? { ...job.eligibilityAssessment } : undefined,
    exportedMaterials,
    lastActivityDate: nowIso,
    interviewStages: [
      {
        id: 'stage-1',
        stageName: 'Kit Snapshot Created',
        date: nowIso,
        notes: existingTailored
          ? 'Tailored resume variant, answers, and materials frozen.'
          : 'Target job description and baseline profile snapshot frozen.',
        completed: true
      }
    ]
  };
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      // Navigation
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
      settingsFocusSection: null,
      setSettingsFocusSection: (section) => set({ settingsFocusSection: section }),

      // Local Dual-Stage Onboarding & Biometrics
      user: null,
      isAuthenticated: false,
      isBiometricLocked: false,
      vaultPersistenceError: null,
      setUser: (user) =>
        set({
          user: sanitizeUserMetadata(user)
        }),
      unlockBiometric: () => {
        if (!hasActiveVaultKey()) {
          return;
        }
        set({ isBiometricLocked: false });
        get().addToast({
          type: 'success',
          title: 'Biometric Access Granted',
          message: 'Hardware credential verified for active session.'
        });
      },
      lockBiometric: () => {
        set({ isBiometricLocked: true });
      },
      toggleBiometricEnrollment: (enable: boolean, credentialId?: string) => {
        const u = get().user;
        if (!u) return;
        if (enable && !credentialId && !u.biometricCredentialId) {
          get().addToast({
            type: 'warning',
            title: 'Enrollment Incomplete',
            message: 'A verified WebAuthn credential ID is required to enable biometric lock.'
          });
          return;
        }
        const updated: UserWorkspace = sanitizeUserMetadata({
          ...u,
          biometricEnabled: enable,
          biometricCredentialId: enable ? (credentialId || u.biometricCredentialId) : undefined,
          lastBiometricAuth: enable ? new Date().toISOString() : u.lastBiometricAuth
        })!;
        set({ user: updated, isBiometricLocked: false });
        get().addToast({
          type: 'info',
          title: enable ? 'Session Biometric Shield Enrolled' : 'Biometric Shield Disabled',
          message: enable
            ? 'In-session hardware screen lock enabled. Cold starts continue to require vault passphrase.'
            : 'Session biometric screen shield disabled.'
        });
      },
      signOut: () => {
        if (get().vaultPersistenceError) {
          get().addToast({
            type: 'error',
            title: 'Cannot Sign Out Yet',
            message: 'Your latest changes are not safely saved. Retry the vault save before signing out.'
          });
          return;
        }
        const currentUser = get().user;
        lockVaultSession();
        set({
          user: currentUser ? sanitizeUserMetadata({ ...currentUser, lastActive: new Date().toISOString() }) : null,
          isAuthenticated: false,
          isBiometricLocked: false,
          geminiApiKey: '',
          masterResume: null,
          previousMasterResume: null,
          stagedParsedResume: null,
          careerFormDraft: null,
          emailInteractions: [],
          jobs: [],
          selectedJobId: null,
          tailoredArtifacts: {},
          applications: [],
          unsavedQueue: [],
          candidatePreferences: { ...DEFAULT_CANDIDATE_PREFERENCES }
        });
      },

      // API
      geminiApiKey: '',
      setGeminiApiKey: (key) => set({ geminiApiKey: key }),
      isLiveApiMode: true,
      setIsLiveApiMode: () => set({ isLiveApiMode: true }),

      // Resume
      masterResume: null,
      previousMasterResume: null,
      restorePreviousMasterResume: () => {
        const previous = get().previousMasterResume;
        if (!previous) return;
        const current = get().masterResume;
        set({ masterResume: previous, previousMasterResume: current, tailoredArtifacts: invalidateTailoredArtifacts(get().tailoredArtifacts) });
        get().addToast({ type: 'success', title: 'Previous Resume Restored', message: 'Your previous Master Resume is active again. The replaced profile remains available as the next rollback snapshot.' });
      },
      stagedParsedResume: null,
      careerFormDraft: null,
      setCareerFormDraft: (draft) => set({ careerFormDraft: draft ? sanitizeCareerFormState(draft) : null }),
      setStagedParsedResume: (resume) => set({ stagedParsedResume: resume }),
      confirmStagedResume: () => {
        const staged = get().stagedParsedResume;
        if (staged) {
          set({
            previousMasterResume: get().masterResume || null,
            masterResume: staged,
            stagedParsedResume: null,
            tailoredArtifacts: invalidateTailoredArtifacts(get().tailoredArtifacts)
          });
          get().addToast({
            type: 'success',
            title: 'Master Resume Approved',
            message: `Approved ${staged.stats.wordCount} words of career evidence. Your Master Profile is ready to use.`
          });
        }
      },
      updateMasterResume: (updater) => {
        const current = get().masterResume;
        if (current) {
          const updated = updater(current);
          set({
            masterResume: updated,
            tailoredArtifacts: invalidateTailoredArtifacts(get().tailoredArtifacts)
          });
        }
      },
      addExperienceMilestone: (expData) => {
        const current = get().masterResume;
        if (!current) return;
        const newExp: ExperienceItem = {
          ...expData,
          id: 'exp-' + Date.now()
        };
        const addedWords = [
          newExp.role,
          newExp.company,
          ...newExp.bullets
        ]
          .join(' ')
          .split(/\s+/)
          .filter(Boolean).length;

        const updatedResume: MasterResume = {
          ...current,
          experiences: [newExp, ...current.experiences],
          stats: {
            ...current.stats,
            wordCount: current.stats.wordCount + addedWords
          }
        };
        set({
          masterResume: updatedResume,
          tailoredArtifacts: invalidateTailoredArtifacts(get().tailoredArtifacts)
        });
        get().addToast({
          type: 'success',
          title: 'Milestone Added',
          message: `Saved ${newExp.role} at ${newExp.company} into Master Profile.`
        });
      },
      removeExperienceMilestone: (id) => {
        const current = get().masterResume;
        if (!current) return;
        const updatedResume: MasterResume = {
          ...current,
          experiences: current.experiences.filter((e) => e.id !== id)
        };
        set({
          masterResume: updatedResume,
          tailoredArtifacts: invalidateTailoredArtifacts(get().tailoredArtifacts)
        });
      },
      clearMasterResume: () => {
        set({
          masterResume: null,
          previousMasterResume: null,
          stagedParsedResume: null,
          careerFormDraft: null,
          tailoredArtifacts: {}
        });
        void syncVaultFromStoreNow();
      },

      // Sourcing
      jobs: [],
      selectedJobId: null,
      setJobs: (jobs) => set((state) => ({
        jobs: jobs.map((job) => {
          const existing = state.jobs.find((item) => item.url && job.url && item.url === job.url);
          return existing
            ? { ...job, vetting: job.vetting || existing.vetting, verification: job.verification || existing.verification }
            : job;
        })
      })),
      addJob: (job) => {
        const exists = get().jobs.some((j) => j.id === job.id);
        if (!exists) {
          set((state) => ({ jobs: [job, ...state.jobs], selectedJobId: job.id }));
        } else {
          set({ selectedJobId: job.id });
        }
      },
      setSelectedJobId: (id) => set({ selectedJobId: id }),
      updateJobVetting: (jobId, vetting) => {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, vetting } : j))
        }));
      },
      updateJobVerification: (jobId, evidence) => {
        set((state) => ({
          jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, verification: evidence } : j))
        }));
      },
      updateJobUrl: (jobId, url, source) => {
        const cleanUrl = sanitizeExternalHttpUrl(url);
        if (!cleanUrl) {
          get().addToast({
            type: 'warning',
            title: 'Invalid Listing Link',
            message: 'Enter a valid http:// or https:// job posting URL.'
          });
          return false;
        }
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  url: cleanUrl,
                  source: source && source.trim() ? source.trim() : j.source
                }
              : j
          )
        }));
        get().addToast({
          type: 'success',
          title: 'Listing Link Saved',
          message: 'Saved posting URL to your encrypted job record.'
        });
        return true;
      },
      isJobPreviouslyTracked: (company: string, role: string) => {
        const compLower = company.toLowerCase().trim();
        const roleLower = role.toLowerCase().trim();
        return get().applications.some((app) => {
          const aComp = app.company.toLowerCase().trim();
          const aRole = app.role.toLowerCase().trim();
          return (
            (aComp === compLower || aComp.includes(compLower) || compLower.includes(aComp)) &&
            (aRole === roleLower || aRole.includes(roleLower) || roleLower.includes(aRole))
          );
        });
      },

      // Candidate Preferences & Portal Shortcuts (Neutral selectable preferences without invented facts)
      candidatePreferences: { ...DEFAULT_CANDIDATE_PREFERENCES },
      setCandidatePreferences: (prefs) =>
        set((state) => ({
          candidatePreferences: { ...state.candidatePreferences, ...prefs }
        })),
      addPortalShortcut: ({ name, searchUrlTemplate, note }) => {
        const cleanName = name.trim();
        const testTemplate = searchUrlTemplate.trim().replace(/\{query\}/gi, 'engineer');
        const valid = sanitizeExternalHttpUrl(testTemplate);
        if (!cleanName || !valid) {
          get().addToast({
            type: 'warning',
            title: 'Invalid Portal Shortcut',
            message: 'Enter a portal name and a valid https:// or http:// URL.'
          });
          return false;
        }
        const newShortcut: PortalShortcut = {
          id: 'portal-custom-' + Date.now(),
          name: cleanName,
          searchUrlTemplate: searchUrlTemplate.trim(),
          note: note?.trim() || 'User-added portal shortcut — browse externally and paste listing back into BYOC.',
          isBuiltIn: false
        };
        set((state) => ({
          candidatePreferences: {
            ...state.candidatePreferences,
            portalShortcuts: [...mergePortalShortcuts(state.candidatePreferences.portalShortcuts), newShortcut]
          }
        }));
        get().addToast({
          type: 'success',
          title: 'Portal Shortcut Saved',
          message: `Added ${cleanName} to your encrypted portal shortcuts.`
        });
        return true;
      },
      removePortalShortcut: (id) => {
        set((state) => ({
          candidatePreferences: {
            ...state.candidatePreferences,
            portalShortcuts: mergePortalShortcuts(state.candidatePreferences.portalShortcuts).filter(
              (p) => p.isBuiltIn || p.id !== id
            )
          }
        }));
      },

      // Tailored Artifacts & Sibling Variants
      tailoredArtifacts: {},
      saveTailoredArtifact: (jobId, artifact) => {
        set((state) => ({
          tailoredArtifacts: {
            ...state.tailoredArtifacts,
            [jobId]: { ...artifact, reviewConfirmed: false }
          }
        }));
        get().addToast({
          type: 'success',
          title: 'Application Kit Saved',
          message: `Ready for ${artifact.jobTitle} at ${artifact.company} in Customization.`
        });
      },
      saveInterviewPrepQuestions: (jobId, questions) => {
        const current = get().tailoredArtifacts[jobId];
        if (!current) return;
        set((state) => ({
          tailoredArtifacts: {
            ...state.tailoredArtifacts,
            [jobId]: {
              ...current,
              interviewPrepQuestions: questions,
              variants: current.variants.map((variant) => ({
                ...variant,
                interviewPrepQuestions: questions
              }))
            }
          }
        }));
      },
      setTailoredArtifactReviewConfirmed: (jobId, confirmed) => {
        const current = get().tailoredArtifacts[jobId];
        if (!current) return;
        set((state) => ({
          tailoredArtifacts: {
            ...state.tailoredArtifacts,
            [jobId]: { ...current, reviewConfirmed: confirmed }
          }
        }));
      },
      selectTailoredVariant: (jobId, variantId) => {
        const current = get().tailoredArtifacts[jobId];
        if (!current) return;
        const chosen = current.variants.find((v) => v.id === variantId);
        if (!chosen) return;

        const updated: TailoredArtifact = {
          ...current,
          selectedVariantId: variantId,
          reviewConfirmed: false,
          tailoredSummary: chosen.tailoredSummary,
          summaryEvidence: chosen.summaryEvidence,
          highlightedSkills: chosen.highlightedSkills,
          optimizedBullets: chosen.optimizedBullets,
          coverLetter: chosen.coverLetter,
          coverLetterEvidence: chosen.coverLetterEvidence,
          interviewPrepQuestions: chosen.interviewPrepQuestions
        };

        set((state) => ({
          tailoredArtifacts: {
            ...state.tailoredArtifacts,
            [jobId]: updated
          }
        }));

        get().addToast({
          type: 'info',
          title: 'Variation Activated',
          message: `Switched to ${chosen.name}.`
        });
      },
      recordExportedMaterial: (jobId, record) => {
        const current = get().tailoredArtifacts[jobId];
        if (!current) return;
        const nextEntry: ExportedMaterialRecord = {
          ...record,
          id: 'exp-' + Date.now()
        };
        const prevList = Array.isArray(current.exportedMaterials) ? current.exportedMaterials : [];
        const updated: TailoredArtifact = {
          ...current,
          exportedMaterials: [nextEntry, ...prevList].slice(0, 12)
        };
        set((state) => ({
          tailoredArtifacts: {
            ...state.tailoredArtifacts,
            [jobId]: updated
          }
        }));
      },

      // Tracking Pipeline & Rejection Deduplication
      applications: [],
      checkRejectionCollision: (company: string, role: string) => {
        const compLower = company.toLowerCase().trim();
        const roleLower = role.toLowerCase().trim();

        const match = get().applications.find((app) => {
          if (app.status !== 'Rejected') return false;
          const appComp = app.company.toLowerCase().trim();
          const appRole = app.role.toLowerCase().trim();
          return (
            (appComp === compLower || appComp.includes(compLower) || compLower.includes(appComp)) &&
            (appRole === roleLower || appRole.includes(roleLower) || roleLower.includes(appRole))
          );
        });

        return {
          isCollision: Boolean(match),
          pastRecord: match
        };
      },

      applyForJob: (jobId, notes = '', overrideRejection = false, portalSource) => {
        const job = get().jobs.find((j) => j.id === jobId);
        if (!job) {
          get().addToast({
            type: 'error',
            title: 'Application Error',
            message: 'Target job was not found in active listings.'
          });
          return null;
        }

        if (!overrideRejection) {
          const collision = get().checkRejectionCollision(job.company, job.title);
          if (collision.isCollision && collision.pastRecord) {
            get().addToast({
              type: 'warning',
              title: 'Previous Rejection History Located for this Role',
              message: `You previously recorded a rejection for ${job.title} at ${job.company} on ${new Date(
                collision.pastRecord.appliedDate
              ).toLocaleDateString()}. Check timeline logs to avoid wasteful repeated submissions.`
            });
            return null;
          }
        }

        const existingTailored = get().tailoredArtifacts[jobId];
        const newApp = buildApplicationSnapshotRecord({
          job,
          existingTailored,
          masterResumeSummary: get().masterResume?.summary || '',
          notes,
          portalSource
        });

        set((state) => ({
          applications: [newApp, ...state.applications]
        }));

        get().addToast({
          type: 'success',
          title: 'Snapshot Saved in Pipeline',
          message: `Saved snapshot for ${job.title} at ${job.company} (Status: Saved).`
        });

        return newApp;
      },

      updateApplicationStatus: (id, status, rejectionData) => {
        set((state) => ({
          applications: state.applications.map((app) => {
            if (app.id !== id) return app;
            return {
              ...app,
              status,
              lastActivityDate: new Date().toISOString(),
              rejectionDate: status === 'Rejected' ? new Date().toISOString() : app.rejectionDate,
              rejectionReason: rejectionData?.reason || app.rejectionReason,
              rejectionNotes: rejectionData?.notes || app.rejectionNotes
            };
          })
        }));
        get().addToast({
          type: 'info',
          title: 'Status Updated',
          message: `Application moved to ${status}.`
        });
      },

      updateApplicationNotes: (id, notes) => {
        set((state) => ({
          applications: state.applications.map((app) =>
            app.id === id ? { ...app, notes } : app
          )
        }));
      },

      deleteApplication: (id) => {
        set((state) => ({
          applications: state.applications.filter((app) => app.id !== id)
        }));
        get().addToast({
          type: 'info',
          message: 'Application archived from tracking board.'
        });
      },

      addInterviewStage: (applicationId, stageName, date, notes) => {
        set((state) => ({
          applications: state.applications.map((app) => {
            if (app.id !== applicationId) return app;
            const newStage = {
              id: 'stage-' + Date.now(),
              stageName,
              date,
              notes,
              completed: false
            };
            return {
              ...app,
              interviewStages: [...app.interviewStages, newStage]
            };
          })
        }));
      },

      getFollowUpRequiredApplications: () => {
        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        return get().applications.filter((app) => {
          if (app.status !== 'Applied') return false;
          const appliedTime = new Date(app.appliedDate).getTime();
          return now - appliedTime >= SEVEN_DAYS_MS || app.notes?.includes('[NeedsFollowUp]');
        });
      },

      generateFollowUpEmailContent: (app: ApplicationRecord) => {
        const candidateName = get().masterResume?.contactInfo.name || get().user?.name || '';
        const candidateEmail = get().masterResume?.contactInfo.email || get().user?.email || '';
        const prefs = get().candidatePreferences;
        const techSkills = get().masterResume?.skills.technical || [];
        const topSkillsLine =
          techSkills.length > 0
            ? `\n\nWith direct experience working with ${techSkills.slice(0, 3).join(', ')}, I remain very interested in contributing to ${app.company}.`
            : `\n\nI remain very interested in the opportunity to contribute to ${app.company}.`;

        const appliedFormatted = new Date(app.appliedDate).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

        const overviewLines: string[] = [];
        if (prefs.noticePeriod) overviewLines.push(`• Notice Period: ${prefs.noticePeriod}`);
        if (app.location && app.location !== 'Location Unspecified' && app.location !== 'Unspecified') {
          overviewLines.push(`• Location: ${app.location}`);
        } else if (prefs.preferredLocations.length > 0) {
          overviewLines.push(`• Preferred Location: ${prefs.preferredLocations.join(', ')}`);
        }
        if (prefs.expectedCtc) overviewLines.push(`• Expected Compensation: ${prefs.expectedCtc}`);

        const overviewBlock =
          overviewLines.length > 0 ? `\n\nCandidate Details:\n${overviewLines.join('\n')}` : '';

        return {
          subject: `Following up on Application — ${app.role}${candidateName ? ` (${candidateName})` : ''}`,
          body: `Dear ${app.company} Recruiting Team,\n\nI am writing to follow up on my application for the ${app.role} position, submitted on ${appliedFormatted}${app.portalSource ? ` via ${app.portalSource}` : ''}.${topSkillsLine}${overviewBlock}\n\nPlease let me know if there are any additional work samples or details I can provide to assist your review.\n\nRegards,\n${candidateName || 'Candidate'}${candidateEmail ? `\n${candidateEmail}` : ''}`
        };
      },

      // Unsaved Applications Queue (External Discovery Engine)
      unsavedQueue: [],
      addUnsavedQueueItem: (candidate) => {
        set((state) => ({
          unsavedQueue: [candidate, ...state.unsavedQueue.filter((q) => q.id !== candidate.id)]
        }));
      },

      approveUnsavedApplication: (id) => {
        const item = get().unsavedQueue.find((q) => q.id === id);
        if (!item) return null;

        const workplace =
          item.workplaceType === 'Remote' || item.workplaceType === 'Hybrid' || item.workplaceType === 'On-site'
            ? item.workplaceType
            : 'Unspecified';

        const newJob: JobPosting = {
          id: 'ext-' + Date.now(),
          title: item.role,
          company: item.company,
          location: 'Location Unspecified',
          workplaceType: workplace,
          salary: item.salary || 'Undisclosed',
          postedDate: new Date(item.dateReceived).toLocaleDateString(),
          jobDescriptionRaw: item.rawEmailBody,
          url: '#',
          source: item.infrastructure,
          skillsRequired: [],
          fitScore: null,
          matchedKeywords: [],
          missingKeywords: [],
          experienceLevel: 'Unspecified'
        };

        get().addJob(newJob);

        const newApp: ApplicationRecord = {
          id: 'app-ext-' + Date.now(),
          jobId: newJob.id,
          company: newJob.company,
          role: newJob.title,
          location: newJob.location,
          workplaceType: newJob.workplaceType,
          salary: newJob.salary,
          appliedDate: item.dateReceived,
          status: 'Applied',
          jobDescriptionRaw: newJob.jobDescriptionRaw,
          tailoredResumeSnapshot: {
            id: 'snap-ext-' + Date.now(),
            jobId: newJob.id,
            jobTitle: newJob.title,
            company: newJob.company,
            selectedVariantId: 'external-import',
            variants: [],
            tailoredSummary: get().masterResume?.summary || '',
            highlightedSkills: [],
            optimizedBullets: [],
            coverLetter: '',
            interviewPrepQuestions: [],
            generationTimestamp: item.dateReceived,
            authenticityGuaranteed: false
          },
          notes: `Discovered from external recruiting system: ${item.infrastructure}. Reference ID: ${item.detectedReferenceNumber || 'N/A'}.`,
          interviewStages: [
            {
              id: 'stg-ext',
              stageName: 'External Portal Registration',
              date: item.dateReceived,
              notes: `Registered via ${item.infrastructure}`,
              completed: true
            }
          ]
        };

        set((state) => ({
          applications: [newApp, ...state.applications],
          unsavedQueue: state.unsavedQueue.filter((q) => q.id !== id)
        }));

        get().addToast({
          type: 'success',
          title: 'External Role Ingested',
          message: `Added ${item.role} at ${item.company} into Tracking Pipeline.`
        });

        return newApp;
      },

      dismissUnsavedApplication: (id) => {
        set((state) => ({
          unsavedQueue: state.unsavedQueue.filter((q) => q.id !== id)
        }));
        get().addToast({
          type: 'info',
          message: 'Dismissed candidate from queue.'
        });
      },

      // Client-Side Email Polling & Sync Engine (Encrypted Vault Backed)
      emailInteractions: [],
      setEmailInteractions: (items) => set({ emailInteractions: items }),
      isEmailSyncing: false,
      lastEmailSyncDate: null,
      runEmailSync: async () => {
        set({ isEmailSyncing: true });
        try {
          const result = await syncAndProcessIncomingEmails(
            get().applications,
            (title, body) => {
              get().addToast({ type: 'info', title, message: body });
            },
            []
          );

          if (result.matchedTransitions.length > 0) {
            for (const t of result.matchedTransitions) {
              get().updateApplicationStatus(t.applicationId, t.newStatus);
            }
          }

          if (result.unsavedQueueItems.length > 0) {
            for (const item of result.unsavedQueueItems) {
              get().addUnsavedQueueItem(item);
            }
          }

          get().addToast({
            type: 'info',
            title: 'Recruiter Email Status: Offline',
            message: 'No external email account is authorized via OAuth. Local mail interaction vault is idle.'
          });

          set({ lastEmailSyncDate: new Date().toISOString() });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Sync check failed';
          get().addToast({ type: 'error', message: msg });
        } finally {
          set({ isEmailSyncing: false });
        }
      },

      // Toasts
      toasts: [],
      addToast: (toast) => {
        const id = 'toast-' + Math.random().toString(36).substring(2, 9);
        const newToast: AppToast = { ...toast, id };
        set((state) => ({ toasts: [...state.toasts, newToast] }));
        setTimeout(() => {
          get().removeToast(id);
        }, toast.duration || 4500);
      },
      removeToast: (id) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },

      // Readiness Selectors
      hasMasterResume: () => hasCareerEvidence(get().masterResume),
      hasSelectedJob: () => {
        const selectedId = get().selectedJobId;
        return Boolean(selectedId && get().jobs.some((j) => j.id === selectedId));
      },
      hasTailoredArtifact: () => {
        const selectedId = get().selectedJobId;
        if (!selectedId) return false;
        return Boolean(get().tailoredArtifacts[selectedId]);
      },
      getSelectedJob: () => {
        const selectedId = get().selectedJobId;
        if (!selectedId) return null;
        return get().jobs.find((j) => j.id === selectedId) || null;
      },

      // Action-Level Gating Check
      checkActionGate: (action: 'tailor' | 'apply' | 'vet'): ActionGateResult => {
        const hasResume = get().hasMasterResume();
        const hasJob = get().hasSelectedJob();

        if (action === 'vet') {
          if (!hasJob) {
            return {
              allowed: false,
              reason: 'Select or paste a target Job Description in Sourcing first.',
              targetTab: 'sourcing'
            };
          }
          return { allowed: true };
        }

        if (action === 'tailor') {
          if (!hasResume) {
            return {
              allowed: false,
              reason: 'Add your master resume in the Intake tab to unlock AI tailoring.',
              targetTab: 'intake'
            };
          }
          if (!hasJob) {
            return {
              allowed: false,
              reason: 'Pick a target position in Sourcing to tailor your kit against.',
              targetTab: 'sourcing'
            };
          }
          return { allowed: true };
        }

        if (action === 'apply') {
          if (!hasJob) {
            return {
              allowed: false,
              reason: 'Choose a target job opening from Sourcing first.',
              targetTab: 'sourcing'
            };
          }
          return { allowed: true };
        }

        return { allowed: true };
      }
    }),
    {
      name: WORKSPACE_STORE_KEY,
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(name) : null;
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          try {
            // Preserve unmigrated legacy plaintext store intact until encrypted vault migration verifies!
            if (name === WORKSPACE_STORE_KEY && pendingLegacyCapture?.detected && !hasActiveVaultKey()) {
              return;
            }
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem(name, value);
            }
          } catch {
            // Safe fallback on quota/storage restrictions
          }
        },
        removeItem: (name: string) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem(name);
            }
          } catch {
            // Safe fallback
          }
        }
      })),
      version: 4,
      migrate: (persistedState: any, version: number) => migrateWorkspaceStoreState(persistedState, version),
      merge: (persistedState: any, currentState: WizardState) => mergeWorkspaceStoreState(persistedState, currentState),
      // Strict non-sensitive metadata persistence only; career data & API keys live exclusively in AES-256-GCM vault
      partialize: (state) => ({
        activeTab: state.activeTab,
        user: sanitizeUserMetadata(state.user),
        isLiveApiMode: state.isLiveApiMode
      })
    }
  )
);

// Serialized vault sync queue prevents concurrent writes from clobbering latest store state
let vaultSyncChain: Promise<boolean> = Promise.resolve(true);

function applyVaultPersistenceTransition(succeeded: boolean): void {
  const current = useWizardStore.getState();
  const transition = transitionVaultPersistenceStatus(current.vaultPersistenceError, succeeded);

  if (transition.error !== current.vaultPersistenceError) {
    useWizardStore.setState({ vaultPersistenceError: transition.error });
  }

  if (transition.notifyFailure) {
    current.addToast({
      type: 'error',
      title: 'Encrypted Vault Save Failed',
      message: 'Your latest changes may exist only in memory. Keep BYOC open and retry saving before closing.'
    });
  } else if (transition.notifyRecovered) {
    current.addToast({
      type: 'success',
      title: 'Vault Saving Restored',
      message: 'Your latest changes are now encrypted and saved on this device.'
    });
  }
}

export function syncVaultFromStoreNow(): Promise<boolean> {
  vaultSyncChain = vaultSyncChain
    .catch(() => false)
    .then(async () => {
      const state = useWizardStore.getState();
      if (!state.isAuthenticated || !state.user || !hasActiveVaultKey()) {
        return false;
      }
      const envelope = await syncUnlockedVault(
        buildVaultDataFromState(state),
        buildVaultMetaFromUser(state.user)
      );
      const saved = await writeStoredVaultEnvelope(envelope);
      applyVaultPersistenceTransition(saved);
      return saved;
    })
    .catch((err) => {
      console.warn('Encrypted vault sync skipped:', err);
      applyVaultPersistenceTransition(false);
      return false;
    });
  return vaultSyncChain;
}

export function restoreVaultDataToStore(
  data: DecryptedVaultData,
  userOverride?: UserWorkspace | null
): void {
  const currentUser = userOverride ?? useWizardStore.getState().user;
  useWizardStore.setState({
    user: sanitizeUserMetadata(currentUser),
    geminiApiKey: data.geminiApiKey || '',
    isLiveApiMode: Boolean(data.geminiApiKey),
    masterResume: data.masterResume || null,
    previousMasterResume: (data as VaultDataWithPreviousResume).previousMasterResume || null,
    careerFormDraft: data.careerFormDraft ? sanitizeCareerFormState(data.careerFormDraft) : null,
    emailInteractions: Array.isArray(data.emailInteractions) ? data.emailInteractions : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    selectedJobId: data.selectedJobId || null,
    tailoredArtifacts: data.tailoredArtifacts || {},
    applications: Array.isArray(data.applications) ? data.applications : [],
    unsavedQueue: Array.isArray(data.unsavedQueue) ? data.unsavedQueue : [],
    candidatePreferences: data.candidatePreferences
      ? {
          ...DEFAULT_CANDIDATE_PREFERENCES,
          ...data.candidatePreferences,
          portalShortcuts: mergePortalShortcuts(data.candidatePreferences.portalShortcuts)
        }
      : { ...DEFAULT_CANDIDATE_PREFERENCES },
    isLiveApiMode: Boolean(data.geminiApiKey)
  });
}

// Route live email interaction vault operations strictly through AES-256-GCM vault session
configureEncryptedEmailVault({
  isUnlocked: () => {
    const state = useWizardStore.getState();
    return Boolean(state.isAuthenticated && state.user && hasActiveVaultKey());
  },
  getAll: () => useWizardStore.getState().emailInteractions || [],
  replaceAll: async (items) => {
    useWizardStore.setState({ emailInteractions: items });
    return syncVaultFromStoreNow();
  }
});

// Subscribe to store mutations while unlocked and auto-persist into AES-256-GCM encrypted vault
useWizardStore.subscribe((state, prevState) => {
  if (!state.isAuthenticated || !state.user || !hasActiveVaultKey()) {
    return;
  }
  const changed =
    state.geminiApiKey !== prevState.geminiApiKey ||
    state.geminiApiKey !== prevState.geminiApiKey ||
    state.masterResume !== prevState.masterResume ||
    state.previousMasterResume !== prevState.previousMasterResume ||
    state.careerFormDraft !== prevState.careerFormDraft ||
    state.emailInteractions !== prevState.emailInteractions ||
    state.jobs !== prevState.jobs ||
    state.selectedJobId !== prevState.selectedJobId ||
    state.tailoredArtifacts !== prevState.tailoredArtifacts ||
    state.applications !== prevState.applications ||
    state.unsavedQueue !== prevState.unsavedQueue ||
    state.candidatePreferences !== prevState.candidatePreferences ||
    state.user !== prevState.user;

  if (changed) {
    void syncVaultFromStoreNow();
  }
});
