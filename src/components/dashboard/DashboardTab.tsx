import React from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { useAuthLocale } from '../../i18n/authLocale';
import { ChakraLogo } from '../ChakraLogo';
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  Shield,
  FileKey2,
  BookOpen,
  X
} from 'lucide-react';
import type { ApplicationRecord } from '../../types';
import { calculateHonestMatch } from '../../services/jobSearchService';
import { hasActiveVaultKey, readStoredVaultEnvelope } from '../../utils/cryptoVault';
import { getCandidateDiscoverySignals } from '../../utils/resumeReadiness';

export const DashboardTab: React.FC = () => {
  const { t } = useAuthLocale();
  const {
    user,
    masterResume,
    selectedJobId,
    jobs,
    applications,
    tailoredArtifacts,
    setActiveTab,
    setSettingsFocusSection,
    geminiApiKey,
    candidatePreferences,
    setJobs,
    getFollowUpRequiredApplications,
    generateFollowUpEmailContent,
    addToast
  } = useWizardStore();

  const [activeFollowUpApp, setActiveFollowUpApp] = React.useState<ApplicationRecord | null>(null);
  const [copiedFollowUp, setCopiedFollowUp] = React.useState(false);
  const [isRefreshingJobs, setIsRefreshingJobs] = React.useState(false);

  const handleLiveJobRefresh = async (manual = false) => {
    const resumeDiscoverySignals = getCandidateDiscoverySignals(masterResume);
    const hasSearchSignals = Boolean(
      candidatePreferences.targetRole?.trim() ||
        candidatePreferences.profession?.trim() ||
        resumeDiscoverySignals.length > 0
    );

    if (!hasSearchSignals) {
      if (manual) {
        addToast({
          type: 'info',
          title: 'Keywords Needed for Live Sync',
          message: t('Add your skills in Intake or target role in Settings to discover live openings.')
        });
      }
      return;
    }

    setIsRefreshingJobs(true);
    try {
      const { jobSearchEngine, isWorldwideCountryCode } = await import('../../services/jobSearchService');
      const optionalLocation = isWorldwideCountryCode(candidatePreferences.country)
        ? undefined
        : candidatePreferences.preferredLocations?.[0]?.trim() || undefined;
      const searchRes = await jobSearchEngine.executeLiveSearch(
        {
          country: candidatePreferences.country,
          location: optionalLocation,
          profession: candidatePreferences.profession,
          targetRole: candidatePreferences.targetRole,
          skills: resumeDiscoverySignals,
          workplaceType: candidatePreferences.workplaceTypePreference
        },
        masterResume,
        jobs
      );
      if (searchRes.jobs.length > 0) {
        setJobs(searchRes.jobs);
      }
      if (manual) {
        if (searchRes.error) {
          addToast({
            type: 'warning',
            title: 'Live Feed Warning',
            message: `${searchRes.error} (Queried: ${searchRes.sourcesQueried.join(', ')})`
          });
        } else if (searchRes.jobs.length > 0) {
          addToast({
            type: 'success',
            title: 'Live Openings Updated',
            message: `Synced ${searchRes.jobs.length} position(s). Sources: ${searchRes.sourcesQueried.join(', ')}.`
          });
        } else {
          addToast({
            type: 'info',
            message: `No additional live openings matched (${searchRes.sourcesQueried.join(', ')}).`
          });
        }
      }
    } catch (err: unknown) {
      if (manual) {
        addToast({
          type: 'warning',
          message:
            err instanceof Error
              ? `${err.message} You can paste any JD in Sourcing.`
              : 'Live job feeds could not be reached right now. You can paste any JD in Sourcing.'
        });
      }
    } finally {
      setIsRefreshingJobs(false);
    }
  };

  // Live auto-discovery of jobs on mount if list is sparse and user has configured signals
  React.useEffect(() => {
    if (jobs.length === 0) {
      void handleLiveJobRefresh(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const selectedJobMatch = selectedJob ? calculateHonestMatch(selectedJob, masterResume) : null;
  const hasResume = Boolean(masterResume && (masterResume.rawText.length > 20 || masterResume.experiences.length > 0 || masterResume.education.length > 0 || masterResume.projects.length > 0 || masterResume.skills.technical.length > 0 || masterResume.skills.soft.length > 0 || masterResume.skills.tools.length > 0));
  const hasJob = Boolean(selectedJob);
  const hasTailored = Boolean(selectedJobId && tailoredArtifacts[selectedJobId]);
  const storedVaultEnvelope = readStoredVaultEnvelope();
  const isVaultEncryptedActive = Boolean(storedVaultEnvelope && hasActiveVaultKey());

  // Metric stats
  const totalApps = applications.length;
  const activeInterviews = applications.filter((a) => a.status === 'Interview' || a.status === 'Screening').length;
  const skillsCount = masterResume?.skills.technical.length || 0;
  const upgradeJobsCount = jobs.filter((j) => j.isRoleUpgrade).length;
  const followUpApps = getFollowUpRequiredApplications();

  const nextActionTab = !hasResume
    ? 'intake'
    : !hasJob
    ? 'sourcing'
    : !hasTailored
    ? 'customization'
    : 'tracking';
  const nextActionLabel = !hasResume
    ? 'Ingest Master Resume'
    : !hasJob
    ? 'Source Target Role'
    : !hasTailored
    ? 'Build Tailored Kit'
    : 'Review Pipeline';

  return (
    <div className="space-y-6 pb-8">
      {/* Hero Welcome Slab */}
      <section className="relative rounded-2xl bg-[#0F172A] border border-slate-800 p-6 sm:p-8 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-sky-500/10 to-indigo-600/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-2.5 flex-wrap">
              <span className="text-sky-400 font-semibold uppercase tracking-wider">{t('Local Encrypted Vault')}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className={geminiApiKey ? 'text-emerald-400' : 'text-amber-400'}>
                {t(geminiApiKey ? 'Gemini BYOK Ready' : 'Gemini BYOK Key Pending')}
              </span>
              {user?.biometricEnabled && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-indigo-300">{t('Session Guard Configured')}</span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              BYOC
            </h1>
            <p className="text-sm font-semibold text-sky-400 mt-0.5">
              Build Your Own Career
            </p>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
              {user?.name ? `${t('Welcome back')}, ${user.name}. ` : ''}{t('Your workspace is decrypted in volatile memory. Ingest your Master Resume, source openings, audit fit gaps honestly, and generate grounded tailored kits.')}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab(nextActionTab)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-2"
              >
                <span>{t(nextActionLabel)}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prepzone')}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs transition cursor-pointer"
              >
                {t('Open Prep-Zone')}
              </button>
            </div>
          </div>

          <div className="shrink-0 hidden sm:flex items-center justify-center">
            <ChakraLogo size={72} spin={false} glow={true} />
          </div>
        </div>
      </section>

      {/* Automated 7-Day Follow-Up Prompting Banner */}
      {followUpApps.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0F172A] border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-amber-200">
                  7-Day Follow-Up Ready
                </h4>
                <span className="text-[10px] font-bold font-mono tracking-wide text-amber-400 tabular-nums">
                  {followUpApps.length} Role{followUpApps.length > 1 ? 's' : ''} Pending Update
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                <strong>{followUpApps[0].company} ({followUpApps[0].role})</strong> has remained in Applied status for 7+ days. Draft an outreach email grounded in your profile preferences.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveFollowUpApp(followUpApps[0])}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
            >
              Generate Follow-Up
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tracking')}
              className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-semibold transition cursor-pointer"
            >
              {t('View Pipeline')}
            </button>
          </div>
        </div>
      )}

      {/* Role Upgrade Spotlight Banner */}
      {upgradeJobsCount > 0 && (
        <div className="p-4 rounded-2xl bg-[#0F172A] border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-200 tabular-nums">
                Step-Up Opportunities Detected ({upgradeJobsCount})
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Your recorded accomplishments align with higher-scope roles discovered in Sourcing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('sourcing')}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0"
          >
            {t('View Roles')}
          </button>
        </div>
      )}

      {/* Guided Hub Readiness Selector */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>{t('Career Workflow Readiness')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('Select any stage below to review or update your active workspace.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLiveJobRefresh(true)}
            disabled={isRefreshingJobs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingJobs ? 'animate-spin text-sky-400' : ''}`} />
            <span>{t(isRefreshingJobs ? 'Syncing...' : 'Live Job Sync')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('intake')}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              hasResume
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider">Milestone 01</span>
              {hasResume ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <h3 className="text-sm font-bold text-white mb-1">{t('Master Resume Intake')}</h3>
            <p className="text-[11px] text-slate-400 tabular-nums">
              {hasResume
                ? `Ingested: ${masterResume?.stats.wordCount} words (${masterResume?.experiences.length} roles)`
                : t('Upload PDF/DOCX or paste resume text')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sourcing')}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              hasJob
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider">Milestone 02</span>
              {hasJob ? (
                <CheckCircle2 className="w-4 h-4 text-sky-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <h3 className="text-sm font-bold text-white mb-1">{t('Target Job Sourcing')}</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {hasJob
                ? `${selectedJob?.title} @ ${selectedJob?.company}`
                : t('Select or paste a target job')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('customization')}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              hasTailored
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider">Milestone 03</span>
              {hasTailored ? (
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <h3 className="text-sm font-bold text-white mb-1">{t('Tailored Kit & Variants')}</h3>
            <p className="text-[11px] text-slate-400">
              {hasTailored
                ? t('Tailored resume, 3 variants & letter ready')
                : t('Synthesize kit for target position')}
            </p>
          </button>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{t('Tracked Apps')}</span>
          <p className="text-2xl font-black text-white font-mono tabular-nums mt-1">{totalApps}</p>
          <span className="text-[10px] text-slate-500">{t('Encrypted Pipeline')}</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{t('Live Stages')}</span>
          <p className="text-2xl font-black text-sky-400 font-mono tabular-nums mt-1">{activeInterviews}</p>
          <span className="text-[10px] text-slate-500">{t('Interviews & Screens')}</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{t('Skills in Master Resume')}</span>
          <p className="text-2xl font-black text-indigo-400 font-mono tabular-nums mt-1">{skillsCount}</p>
          <span className="text-[10px] text-slate-500">{t('From Master Resume')}</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{t('Target Match')}</span>
          <p className="text-xl font-black text-emerald-400 font-mono tabular-nums mt-1">
            {selectedJob
              ? hasResume && selectedJobMatch && selectedJobMatch.score !== null
                ? `${selectedJobMatch.score}%`
                : t('Insufficient profile data')
              : t('No Target')}
          </p>
          <span className="text-[10px] text-slate-500">
            {!selectedJob
              ? t('Select a target role')
              : !hasResume
              ? t('Add Master Resume')
              : selectedJobMatch?.score === null
              ? t('No job skill criteria specified')
              : t('Profile Evidence Index')}
          </span>
        </div>
      </section>

      {/* Vault & Recovery Shortcut Card */}
      <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-white">Vault &amp; Recovery</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-mono font-semibold">
                {isVaultEncryptedActive ? 'AES-256-GCM Active' : 'AES-256-GCM Vault'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Encrypted at rest with AES-256-GCM. Emergency recovery phrases are sealed offline during setup and never shown here.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSettingsFocusSection('backup');
              setActiveTab('settings');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
          >
            <FileKey2 className="w-3.5 h-3.5" />
            <span>Encrypted Backup</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsFocusSection('recovery-help');
              setActiveTab('settings');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Recovery Help</span>
          </button>
        </div>
      </section>

      {/* Active Target Spotlight or Next Action Prompt */}
      {selectedJob ? (
        <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider block">
                Active Target Position
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {selectedJob.title} — <span className="text-slate-400">{selectedJob.company}</span>
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('vetting')}
                className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Review Vetting
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('customization')}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Customize Kit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            {selectedJob.jobDescriptionRaw}
          </p>
        </section>
      ) : (
        <section className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">
              Ready to target your next opportunity?
            </h3>
            <p className="text-xs text-slate-400">
              Search live public feeds by role and region, or paste any custom job specification.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('sourcing')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md cursor-pointer"
            >
              Explore Opportunities
            </button>
          </div>
        </section>
      )}

      {/* Follow-Up Outreach Generator Modal */}
      {activeFollowUpApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-[#0F172A] border border-amber-500/40 rounded-2xl p-6 shadow-2xl relative text-left">
            <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                  7-Day Follow-Up Outreach
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {activeFollowUpApp.company}
                </h3>
                <span className="text-xs text-slate-400">
                  {activeFollowUpApp.role} · Applied on {new Date(activeFollowUpApp.appliedDate).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close follow-up modal"
                onClick={() => {
                  setActiveFollowUpApp(null);
                  setCopiedFollowUp(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const emailContent = generateFollowUpEmailContent(activeFollowUpApp);
              return (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Subject Line
                    </label>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono text-xs select-all">
                      {emailContent.subject}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Outreach Message (Grounded in Candidate Preferences)
                    </label>
                    <textarea
                      rows={9}
                      readOnly
                      value={emailContent.body}
                      className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs leading-relaxed font-sans resize-none select-all focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Includes your saved availability & compensation preferences
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(`${emailContent.subject}\n\n${emailContent.body}`);
                        setCopiedFollowUp(true);
                        setTimeout(() => setCopiedFollowUp(false), 2000);
                        addToast({ type: 'success', message: 'Full follow-up email copied to clipboard!' });
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md"
                    >
                      <span>{copiedFollowUp ? 'Copied to Clipboard!' : 'Copy Outreach Email'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
