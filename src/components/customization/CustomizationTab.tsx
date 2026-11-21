import React, { useState } from 'react';
import { openExternalPortalUrl, shouldUseNativeExternalBrowser } from '../../services/externalBrowser';
import { useWizardStore } from '../../store/useWizardStore';
import { useAuthLocale } from '../../i18n/authLocale';
import { getResumeExportGuidance } from '../../services/exporterService';
import { tailorResumeWithGroq, draftQuestionnaireAnswer, formatGroqError } from '../../services/groqService';
import { sanitizeExternalHttpUrl } from '../../services/jobSearchService';
import {
  partitionTailoredBullets,
  resolveTailoredResumeForExportAndPreview
} from '../../utils/tailoredBulletResolver';
import type { TailoredArtifact, TailoredVariant } from '../../types';
import { hasStructuredCareerEvidence } from '../../utils/resumeReadiness';
import {
  Wand2,
  Sparkles,
  ShieldCheck,
  Download,
  Share2,
  FileText,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  MessageSquare,
  BookmarkCheck,
  Send,
  ArrowRight,
  RefreshCw,
  Layers,
  Check,
  ShieldAlert,
  Wrench,
  Copy,
  Clock,
  Timer,
  Shield,
  FileCheck,
  ExternalLink
} from 'lucide-react';

export const CustomizationTab: React.FC = () => {
  const { t } = useAuthLocale();
  const {
    masterResume,
    selectedJobId,
    jobs,
    tailoredArtifacts,
    saveTailoredArtifact,
    setTailoredArtifactReviewConfirmed,
    selectTailoredVariant,
    recordExportedMaterial,
    updateJobUrl,
    applyForJob,
    updateApplicationStatus,
    checkRejectionCollision,
    candidatePreferences,
    groqApiKey,
    setActiveTab,
    addToast
  } = useWizardStore();

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const currentArtifact = selectedJobId ? tailoredArtifacts[selectedJobId] : null;
  const validListingUrl = sanitizeExternalHttpUrl(selectedJob?.url);
  const resolvedPreview =
    currentArtifact && masterResume
      ? resolveTailoredResumeForExportAndPreview(currentArtifact, masterResume)
      : null;

  const [isGenerating, setIsGenerating] = useState(false);
  const [tailoringError, setTailoringError] = useState<string | null>(null);
  const [screeningQuestion, setScreeningQuestion] = useState('');
  const [screeningAnswer, setScreeningAnswer] = useState<{
    jobId: string;
    answer: string;
    evidenceUsed: string[];
  } | null>(null);
  const [isDraftingAnswer, setIsDraftingAnswer] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'resume' | 'coverLetter' | 'interview'>('resume');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Assisted-Apply Review Drawer & Inline URL Editor State
  const [showQuestionnaireDrawer, setShowQuestionnaireDrawer] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showEditUrlForm, setShowEditUrlForm] = useState(false);
  const [draftListingUrl, setDraftListingUrl] = useState('');
  const [humanReviewedConfirmed, setHumanReviewedConfirmed] = useState(false);

  const writeClipboardText = async (value: string): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(value); return true; }
      catch { /* Continue to the local document-copy fallback. */ }
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    finally { textarea.remove(); }
    return copied;
  };

  const handleCopyChip = async (key: string, value: string) => {
    if (!value.trim()) return;
    if (currentArtifact?.variants.length && !currentArtifact.reviewConfirmed) {
      addToast({ type: 'warning', title: 'Factual Review Required', message: 'Review the AI-generated wording and confirm its claims against your Master Resume and the supplied job description before copying.' });
      return;
    }
    const copied = await writeClipboardText(value);
    if (!copied) {
      setCopiedField(null);
      addToast({ type: 'error', title: 'Copy Failed', message: 'Clipboard access was unavailable. Please select and copy the text manually.' });
      return;
    }
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
    addToast({ type: 'success', message: `Copied: ${value.length > 35 ? value.substring(0, 35) + '...' : value}` });
  };

  const handleCreateOfflineBaselineKit = () => {
    if (!masterResume || !hasResume || !selectedJob) {
      addToast({
        type: 'warning',
        message: 'Load a Master Resume in Intake and select a target job in Sourcing first.'
      });
      return;
    }

    const baselineArtifact: TailoredArtifact = {
      id: 'baseline-' + Date.now(),
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      company: selectedJob.company,
      selectedVariantId: 'master-baseline',
      variants: [],
      tailoredSummary: masterResume.summary || '',
      highlightedSkills:
        selectedJob.matchedKeywords.length > 0
          ? selectedJob.matchedKeywords
          : masterResume.skills.technical.slice(0, 10),
      optimizedBullets: [],
      coverLetter: '',
      interviewPrepQuestions: [],
      generationTimestamp: new Date().toISOString(),
      authenticityGuaranteed: false,
      exportedMaterials: []
    };

    saveTailoredArtifact(selectedJob.id, baselineArtifact);
  };

  // Action Gating Checks
  const hasResume = hasStructuredCareerEvidence(masterResume);
  const hasJob = Boolean(selectedJob);
  const exportGuidance = currentArtifact && masterResume && currentArtifact.reviewConfirmed
    ? getResumeExportGuidance(currentArtifact, masterResume)
    : null;

  const handleGenerateTailoring = async () => {
    if (!hasResume) {
      addToast({
        type: 'warning',
        title: 'Action Gated',
        message: 'Add structured career evidence in the Intake tab before generating tailored materials. Use the guided builder or optional AI structuring to review your profile first.'
      });
      return;
    }
    if (!hasJob) {
      addToast({
        type: 'warning',
        title: 'Action Gated',
        message: 'Pick a target position in Sourcing to tailor your kit against.'
      });
      return;
    }

    setIsGenerating(true);
    setTailoringError(null);
    try {
      const artifact = await tailorResumeWithGroq(
        selectedJob!,
        masterResume!,
        groqApiKey
      );
      saveTailoredArtifact(selectedJob!.id, artifact);
      addToast({
        type: 'success',
        title: 'Tailored Kit Synthesized',
        message: `${artifact.variants.length} evidence-relevant draft variation${artifact.variants.length === 1 ? '' : 's'} generated. Review all generated wording before use.`
      });
    } catch (err: unknown) {
      const msg = formatGroqError(err, 'Tailoring generation failed.');
      setTailoringError(msg);
      addToast({ type: 'error', message: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDraftScreeningAnswer = async () => {
    if (!masterResume || !hasResume || !selectedJob || !groqApiKey) {
      addToast({
        type: 'warning',
        title: 'Questionnaire Draft Unavailable',
        message: !masterResume
          ? 'Add a Master Resume first.'
          : !selectedJob
          ? 'Select a target job first.'
          : 'Add your Groq API key in Settings to draft an answer.'
      });
      return;
    }
    if (!screeningQuestion.trim() || screeningQuestion.length > 2000) {
      setQuestionnaireError('Enter a screening question up to 2,000 characters.');
      return;
    }

    setIsDraftingAnswer(true);
    setQuestionnaireError(null);
    setScreeningAnswer(null);
    try {
      const result = await draftQuestionnaireAnswer(screeningQuestion, selectedJob, masterResume, groqApiKey);
      setScreeningAnswer({ jobId: selectedJob.id, ...result });
    } catch (err: unknown) {
      const message = formatGroqError(err, 'Could not draft a screening answer.');
      setQuestionnaireError(message);
      addToast({ type: 'error', message });
    } finally {
      setIsDraftingAnswer(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!currentArtifact || !masterResume || !hasResume || !selectedJob) {
      addToast({
        type: 'warning',
        message: 'Prepare or generate an application kit before exporting.'
      });
      return;
    }

    if (!currentArtifact.reviewConfirmed) {
      addToast({
        type: 'warning',
        title: 'Factual Review Required',
        message: 'Review the summary, skills, rewritten bullets and cover letter. Confirm candidate claims against your Master Profile and job-specific claims against the supplied job description before exporting.'
      });
      return;
    }

    setIsExporting(format);
    const sanitizedName = (masterResume.contactInfo.name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedCompany = (selectedJob.company || 'Opportunity').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedName}_${sanitizedCompany}_Resume.${format}`;
    const activeVariant = currentArtifact.variants.find((v) => v.id === currentArtifact.selectedVariantId);

    try {
      // Keep PDF/DOCX export libraries out of the initial app bundle. They are
      // loaded only when the user explicitly exports a resume.
      const {
        generatePlainTextResume,
        generatePdfResume,
        generateDocxResume,
        dispatchExportFile
      } = await import('../../services/exporterService');
      let dispatched = false;
      if (format === 'txt') {
        const text = generatePlainTextResume(currentArtifact, masterResume);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        dispatched = await dispatchExportFile(blob, fileName, 'text/plain');
      } else if (format === 'pdf') {
        const blob = await generatePdfResume(currentArtifact, masterResume);
        dispatched = await dispatchExportFile(blob, fileName, 'application/pdf');
      } else if (format === 'docx') {
        const blob = await generateDocxResume(currentArtifact, masterResume);
        dispatched = await dispatchExportFile(
          blob,
          fileName,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
      }

      if (dispatched) {
        recordExportedMaterial(selectedJob.id, {
          format: format.toUpperCase() as 'PDF' | 'DOCX' | 'TXT',
          fileName,
          exportedAt: new Date().toISOString(),
          variantId: currentArtifact.selectedVariantId,
          variantName: activeVariant?.name || 'Master Baseline'
        });
        addToast({
          type: 'success',
          title: 'Export Dispatched',
          message: `Saved ${fileName} and recorded export in your Assisted-Apply kit.`
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      addToast({ type: 'error', message: msg });
    } finally {
      setIsExporting(null);
    }
  };

  const handleSaveSnapshotOnly = () => {
    if (!selectedJob) {
      addToast({
        type: 'warning',
        message: 'Choose a target job opening from Sourcing first.'
      });
      return;
    }

    const app = applyForJob(selectedJob.id, 'Saved tailored kit snapshot (Pending submission).');
    if (app) {
      setActiveTab('tracking');
    }
  };

  const handleMarkAsApplied = () => {
    if (!selectedJob) {
      addToast({
        type: 'warning',
        message: 'Choose a target job opening from Sourcing first.'
      });
      return;
    }

    // Check Rejection Deduplication Guard
    const check = checkRejectionCollision(selectedJob.company, selectedJob.title);
    if (check.isCollision && check.pastRecord) {
      addToast({
        type: 'warning',
        title: 'Previous Rejection History Located for this Role',
        message: `A previous rejection was logged for ${selectedJob.title} at ${selectedJob.company} on ${new Date(
          check.pastRecord.appliedDate
        ).toLocaleDateString()}. Check timeline logs in Tracking.`
      });
      return;
    }

    // Freeze snapshot and save into applications pipeline
    const app = applyForJob(
      selectedJob.id,
      `Submitted manually on ${selectedJob.source || 'external portal'} via BYOC Assisted-Apply.`
    );
    if (app) {
      updateApplicationStatus(app.id, 'Applied');
      addToast({
        type: 'success',
        title: 'Application Recorded in Tracking',
        message: `Recorded as Applied for ${selectedJob.title} at ${selectedJob.company} with frozen snapshot.`
      });
      setActiveTab('tracking');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Wand2 className="w-6 h-6 text-sky-400" />
            <span>AI Kit Customization & Sibling Variants</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Role-relevant resume versions selected from available career evidence, plus source-mapped bullet replacements. Review all AI-written prose before use.
          </p>
        </div>

        {/* Target Job Pill */}
        {selectedJob ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs self-start sm:self-auto">
            <span className="text-slate-400">Target:</span>
            <span className="font-bold text-white">{selectedJob.title}</span>
            <span className="text-sky-400 font-mono">@{selectedJob.company}</span>
          </div>
        ) : null}
      </div>

      {/* Action-Level Gating Banners */}
      {!hasResume && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-200">
                Add your master resume in the Intake tab to unlock AI tailoring
              </h4>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Add source career milestones so BYOC can check replacement bullets against your recorded experience.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('intake')}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0"
          >
            Go to Intake
          </button>
        </div>
      )}

      {hasResume && !hasJob && (
        <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-sky-200">
                Pick a target position in Sourcing to tailor your kit against
              </h4>
              <p className="text-[11px] text-sky-300/80 mt-0.5">
                Tailoring synthesizes keywords and emphasis specific to a selected job description.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('sourcing')}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0"
          >
            Select Job in Sourcing
          </button>
        </div>
      )}

      {/* Primary Action Hero Slab */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-800/90 border border-slate-700 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Bullet & Skill Evidence Checks
              </span>
              <span className="text-xs text-slate-400 hidden xs:inline">
                AI drafts require your review
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              {currentArtifact
                ? currentArtifact.variants && currentArtifact.variants.length > 0
                  ? `${currentArtifact.variants.length} Role-Relevant Variations Ready`
                  : 'Offline Baseline Kit Ready'
                : 'Create Role-Relevant Resume Variations'}
            </h3>
            <p className="text-xs text-slate-400 max-w-xl mt-1 leading-relaxed">
              Generates only the framing angles supported by your profile evidence and target role. Replacement bullets and listed skills are checked against your Master Resume; AI-written summaries, cover letters, and talking points still require your review before use. 
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">No request is sent until you choose Generate. The selected job details and structured Master Resume evidence (summary, skills, experience, education, projects, certifications and additional evidence) are sent to Groq using your configured key. Contact details and unstructured source-document text are excluded.</p>
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
            <button
              onClick={handleGenerateTailoring}
              disabled={isGenerating}
              title={
                !hasResume
                  ? 'Add structured career evidence in the Intake tab to unlock AI tailoring'
                  : !hasJob
                  ? 'Pick a target position in Sourcing to tailor your kit against'
                  : 'Generate role-relevant resume variations'
              }
              className={`flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-xl transition active:scale-95 cursor-pointer ${
                !hasResume || !hasJob
                  ? 'bg-slate-700/80 hover:bg-slate-700 text-slate-300 border border-amber-500/30 shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-400 shadow-indigo-600/30'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${!hasResume || !hasJob ? 'text-amber-400' : 'text-sky-300'} ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Generating role-relevant variations...' : currentArtifact ? 'Regenerate role-relevant variations' : 'Generate role-relevant resume variations'}</span>
            </button>
            {!hasResume && (
              <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Add structured career evidence in Intake to unlock AI tailoring
              </span>
            )}
            {hasResume && !hasJob && (
              <span className="text-[11px] text-sky-400 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Pick a target position in Sourcing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tailoring Error Banner */}
      {tailoringError && (
        <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-800/40 flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-rose-200">
              Tailoring Generation Unsuccessful
            </h4>
            <p className="text-[11px] text-rose-300/80 mt-0.5 font-mono">
              {tailoringError}
            </p>
          </div>
          <button
            onClick={handleGenerateTailoring}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer shrink-0"
          >
            Retry Tailoring
          </button>
        </div>
      )}

      {/* Role-relevant resume variation comparison */}
      {currentArtifact && currentArtifact.variants && currentArtifact.variants.length > 0 && (
        <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-indigo-400 block">
                Multi-Option Customizer
              </span>
              <h4 className="text-sm font-bold text-white">
                Compare & Select Preferred Version
              </h4>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {currentArtifact.variants.length} Variations Generated
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-1">
            {currentArtifact.variants.map((variant) => {
              const isSelectedVariant = currentArtifact.selectedVariantId === variant.id;
              const variantPartition = partitionTailoredBullets(variant.optimizedBullets, masterResume);

              return (
                <div
                  key={variant.id}
                  onClick={() => selectTailoredVariant(selectedJob!.id, variant.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between ${
                    isSelectedVariant
                      ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500/60'
                      : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-sky-300">
                        {variant.badge}
                      </span>
                      {isSelectedVariant && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 font-mono">
                          <Check className="w-3.5 h-3.5" /> Active Choice
                        </span>
                      )}
                    </div>

                    <h5 className="text-xs font-bold text-white mb-1">{variant.name}</h5>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">
                      {variant.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {variantPartition.verified.length} Evidence-backed Tailored Bullet
                      {variantPartition.verified.length === 1 ? '' : 's'}
                      {variantPartition.unmapped.length > 0
                        ? ` · ${variantPartition.unmapped.length} Unmapped`
                        : ''}
                    </span>
                    <span className={isSelectedVariant ? 'text-indigo-300 font-bold' : 'text-slate-400'}>
                      {isSelectedVariant ? 'Selected' : 'Tap to Choose'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tailored Artifact Viewer & Exporters */}
      {currentArtifact ? (
        <div className="space-y-5">
          {/* Sub Navigation */}
          <div className="flex items-center gap-2 p-1 bg-slate-800/90 rounded-2xl border border-slate-700">
            <button
              onClick={() => setActiveSubTab('resume')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSubTab === 'resume'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Tailored Resume</span>
            </button>
            <button
              onClick={() => setActiveSubTab('coverLetter')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSubTab === 'coverLetter'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Cover Letter</span>
            </button>
            <button
              onClick={() => setActiveSubTab('interview')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeSubTab === 'interview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Interview Prep</span>
            </button>
          </div>

          {/* Sub Tab: Tailored Resume */}
          {activeSubTab === 'resume' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-mono text-indigo-400 block">
                    Targeted Executive Summary (Active Variation)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    AI draft — review before use
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  {currentArtifact.tailoredSummary}
                </p>
                {currentArtifact.variants.length === 0 ? (
                  <p className="mt-2 text-[10px] text-slate-500">Master Profile wording — no AI rewrite applied.</p>
                ) : currentArtifact.summaryEvidence && currentArtifact.summaryEvidence.length > 0 ? (
                  <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
                    <span className="text-[9px] uppercase font-mono font-bold text-emerald-300">Linked Master Profile evidence — review aid, not proof</span>
                    {currentArtifact.summaryEvidence.map((reference) => (
                      <p key={reference.id} className="text-[10px] leading-relaxed text-slate-400">{reference.text}</p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-amber-300">No source links attached to this saved draft. Verify every factual statement manually.</p>
                )}
              </div>

              {/* Skills */}
              <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700">
                <span className="text-[10px] uppercase font-mono text-sky-400 block mb-2">
                  Core Competencies (Included in Exports)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(resolvedPreview ? resolvedPreview.skills : currentArtifact.highlightedSkills).map((s, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-medium"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Evidence-backed Experience Bullet Replacements */}
              <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700">
                <span className="text-[10px] uppercase font-mono text-emerald-400 block mb-3">
                  Evidence-backed Bullet Replacements ({resolvedPreview ? resolvedPreview.verifiedReplacements.length : 0})
                </span>

                {resolvedPreview && resolvedPreview.verifiedReplacements.length > 0 ? (
                  <div className="space-y-4">
                    {resolvedPreview.verifiedReplacements.map((bullet, i) => (
                      <div key={i} className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-bold text-white">{bullet.role} — {bullet.company}</span>
                          <span className="text-[10px] font-mono text-emerald-400">Source-backed</span>
                        </div>

                        <div className="text-xs text-emerald-300 font-medium pl-3 border-l-2 border-emerald-500 leading-relaxed">
                          {bullet.tailoredBullet}
                        </div>

                        <div className="text-[11px] text-slate-500 pl-3 border-l-2 border-slate-700 leading-relaxed">
                          <span className="text-slate-600 block text-[9px] uppercase font-mono">Original:</span>
                          {bullet.originalBullet}
                        </div>

                        {bullet.matchRationale && (
                          <div className="text-[10px] text-indigo-300/80 bg-indigo-500/10 px-2.5 py-1 rounded-lg">
                            <strong>Rationale:</strong> {bullet.matchRationale}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No evidence-backed bullet replacements active; all original master resume bullets are retained unchanged in preview and exports.
                  </p>
                )}
              </div>

              {/* Unmapped AI Bullets Flag (Never merged into resume or exports) */}
              {resolvedPreview && resolvedPreview.unmappedBullets.length > 0 && (
                <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-mono text-amber-300 font-bold">
                      Unmapped AI Suggestions ({resolvedPreview.unmappedBullets.length})
                    </span>
                    <span className="text-[10px] font-mono text-amber-200/80">
                      Flagged · Excluded from Preview &amp; TXT/PDF/DOCX Exports
                    </span>
                  </div>
                  <div className="space-y-3">
                    {resolvedPreview.unmappedBullets.map((bullet, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-900/70 border border-amber-500/20 space-y-1.5">
                        <div className="text-[11px] text-amber-200 font-semibold">
                          {bullet.role || bullet.company
                            ? [bullet.role, bullet.company].filter(Boolean).join(' — ')
                            : 'Unmapped Experience'}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{bullet.tailoredBullet || '(Empty tailored text)'}</p>
                        {bullet.originalBullet && (
                          <p className="text-[11px] text-slate-500">
                            <span className="font-mono uppercase text-[9px] text-slate-600 mr-1">Claimed source:</span>
                            {bullet.originalBullet}
                          </p>
                        )}
                        <p className="text-[10px] text-amber-300/90">
                          {bullet.unmappedReason || 'Could not verify source bullet and experience against master resume.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Complete Export-Parity Preview */}
              {resolvedPreview && (
                <div className="p-5 rounded-3xl bg-slate-800/80 border border-slate-700 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-mono text-indigo-300 block">
                      Complete Resume Preview (Matches TXT / PDF / DOCX Exports)
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      All Original Sections &amp; Unmatched Bullets Preserved
                    </span>
                  </div>

                  {resolvedPreview.contactLinks.length > 0 && (
                    <div className="text-[11px] text-sky-300 font-mono break-all bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-800">
                      Links: {resolvedPreview.contactLinks.join('  |  ')}
                    </div>
                  )}

                  <div className="space-y-3">
                    {resolvedPreview.experiences.map(({ experience, bullets }, expIdx) => (
                      <div key={experience.id || expIdx} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white">
                            {experience.role} — {experience.company}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {[experience.startDate, experience.endDate].filter(Boolean).join(' - ')}
                            {experience.location ? ` | ${experience.location}` : ''}
                          </span>
                        </div>
                        <ul className="space-y-1.5 text-xs">
                          {bullets.map((b, bIdx) => (
                            <li key={bIdx} className="flex items-start gap-2 leading-relaxed">
                              <span
                                className={`shrink-0 mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                                  b.isTailored
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}
                              >
                                {b.isTailored ? 'Tailored' : 'Original'}
                              </span>
                              <span className={b.isTailored ? 'text-emerald-200' : 'text-slate-300'}>
                                {b.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {resolvedPreview.projects.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">
                        Projects ({resolvedPreview.projects.length})
                      </span>
                      {resolvedPreview.projects.map((p, idx) => (
                        <div key={p.id || idx} className="text-xs text-slate-300">
                          <span className="font-semibold text-white">{p.title}</span>
                          {p.technologies?.length > 0 && (
                            <span className="text-slate-400"> ({p.technologies.join(', ')})</span>
                          )}
                          {p.link && <span className="text-sky-400 font-mono text-[11px] ml-1.5">{p.link}</span>}
                          {p.description && <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {resolvedPreview.education.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">
                        Education ({resolvedPreview.education.length})
                      </span>
                      {resolvedPreview.education.map((edu, idx) => (
                        <div key={edu.id || idx} className="text-xs text-slate-300">
                          {edu.field ? `${edu.degree} in ${edu.field}` : edu.degree} — {edu.institution}
                          {edu.gradYear ? ` (${edu.gradYear})` : ''}
                          {edu.gpa ? ` · GPA: ${edu.gpa}` : ''}
                        </div>
                      ))}
                    </div>
                  )}

                  {resolvedPreview.certifications.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-slate-800">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block">
                        Certifications ({resolvedPreview.certifications.length})
                      </span>
                      {resolvedPreview.certifications.map((cert, idx) => (
                        <div key={cert.id || idx} className="text-xs text-slate-300">
                          {cert.name}
                          {[cert.issuer, cert.issueDate].filter(Boolean).length > 0
                            ? ` — ${[cert.issuer, cert.issueDate].filter(Boolean).join(', ')}`
                            : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: Cover Letter */}
          {activeSubTab === 'coverLetter' && (
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-800/80 border border-slate-700 space-y-3">
              {currentArtifact.variants.length > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  AI-generated draft: verify every personal claim and detail against your Master Resume before copying or exporting.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-mono text-sky-400 block">
                  Tailored Cover Letter
                </span>
                <button
                  type="button"
                  disabled={!currentArtifact.coverLetter || (currentArtifact.variants.length > 0 && !currentArtifact.reviewConfirmed)}
                  onClick={() => handleCopyChip('coverLetterTab', currentArtifact.coverLetter || '')}
                  className="px-3 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                >
                  {copiedField === 'coverLetterTab' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'coverLetterTab' ? 'Copied Cover Letter' : 'Copy Cover Letter'}</span>
                </button>
              </div>
              {currentArtifact.coverLetter ? (
                <div className="whitespace-pre-line text-xs text-slate-300 leading-relaxed bg-slate-900/70 p-4 rounded-2xl border border-slate-800 font-sans">
                  {currentArtifact.coverLetter}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                  No AI cover letter generated in this baseline offline kit. Configure your Groq key and click &quot;Generate role-relevant resume variations&quot; above if you want a role-tailored cover letter draft.
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: Interview Prep */}
          {activeSubTab === 'interview' && (
            <div className="p-5 sm:p-6 rounded-3xl bg-slate-800/80 border border-slate-700 space-y-4">
              {currentArtifact.variants.length > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  AI-generated interview material: verify every personal claim and suggested talking point against your own experience.
                </p>
              )}
              <span className="text-[10px] uppercase font-mono text-indigo-400 block mb-1">
                AI Interview Prep Drafts — Review Required
              </span>

              {currentArtifact.interviewPrepQuestions.map((q, i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold">
                      {q.category}
                    </span>
                    <h4 className="text-xs font-bold text-white">{q.question}</h4>
                  </div>

                  <div className="space-y-1.5 pl-3 border-l-2 border-indigo-500/40">
                    {q.suggestedTalkingPoints.map((point, pIdx) => (
                      <p key={pIdx} className="text-xs text-slate-300 leading-relaxed">
                        • {point}
                      </p>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-500 pt-1">
                    <strong>Evidence Ref:</strong> {q.authenticEvidenceRef}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Exporter Engine & Assisted-Apply Kit */}
          <div className="p-5 rounded-3xl bg-slate-800/90 border border-slate-700 shadow-lg space-y-5">
            <label className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(currentArtifact.reviewConfirmed)}
                onChange={(event) => setTailoredArtifactReviewConfirmed(currentArtifact.jobId, event.target.checked)}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="text-[11px] leading-relaxed text-slate-300">
                I reviewed this resume version and checked each claim against the linked Master Profile evidence and supplied job description. Evidence links are review aids, not proof; AI wording is not independent verification.
              </span>
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Download className="w-4 h-4 text-sky-400" />
                  <span>Step 1 — Prepared Resume Exports &amp; Cover Letter</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Generates local .PDF, .DOCX, or .TXT files (with mobile Web Share support) for portal upload.
                </p>
                {exportGuidance && !exportGuidance.pdfSupported && (
                  <p role="status" className="mt-2 max-w-xl rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
                    {t('Some characters in your resume are not supported by the built-in PDF fonts. Choose DOCX to preserve every character. PDF export is paused to prevent text loss.')} {t('Recommended for Tamil and other scripts')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting !== null || !hasResume || !currentArtifact.reviewConfirmed || exportGuidance?.pdfSupported === false}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <span>{isExporting === 'pdf' ? 'Building...' : t('Export .PDF')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('docx')}
                  disabled={isExporting !== null || !currentArtifact.reviewConfirmed}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>{isExporting === 'docx' ? 'Building...' : t('Export .DOCX')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('txt')}
                  disabled={isExporting !== null || !currentArtifact.reviewConfirmed}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
                >
                  {t('Export .TXT')}
                </button>

                {currentArtifact.coverLetter && (
                  <button
                    type="button"
                    onClick={() => handleCopyChip('coverLetterKit', currentArtifact.coverLetter)}
                    disabled={!currentArtifact.reviewConfirmed}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedField === 'coverLetterKit' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
                    <span>{copiedField === 'coverLetterKit' ? 'Copied' : 'Copy Cover Letter'}</span>
                  </button>
                )}
              </div>
            </div>

            {currentArtifact.coverLetter && (
              <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3 space-y-1.5">
                <span className="text-[9px] uppercase font-mono font-bold text-sky-300">Cover-letter source evidence</span>
                {currentArtifact.coverLetterEvidence && currentArtifact.coverLetterEvidence.length > 0 ? (
                  currentArtifact.coverLetterEvidence.map((reference) => (
                    <p key={reference.id} className="text-[10px] leading-relaxed text-slate-400">{reference.text}</p>
                  ))
                ) : (
                  <p className="text-[10px] text-amber-300">No source links attached to this saved cover letter. Verify every factual statement manually.</p>
                )}
              </div>
            )}

            {currentArtifact.exportedMaterials && currentArtifact.exportedMaterials.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 block">
                  Recorded Material Exports ({currentArtifact.exportedMaterials.length}) — Carried Into Tracking Snapshot
                </span>
                <div className="flex flex-wrap gap-2">
                  {currentArtifact.exportedMaterials.slice(0, 6).map((mat) => (
                    <span
                      key={mat.id}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center gap-1.5"
                    >
                      <span className="text-sky-400 font-bold">{mat.format}</span>
                      <span className="truncate max-w-[200px]">{mat.fileName}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Assisted-Apply Workflow (Never Auto-Apply) */}
            <div className="pt-5 border-t border-slate-700/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>Step 2 &amp; 3 — Assisted-Apply Review &amp; Manual Portal Submission</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Open the original job link yourself, copy your authentic answers, review screening fields, and submit directly on the employer site. BYOC never runs automated logins or submits on your behalf.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowQuestionnaireDrawer(!showQuestionnaireDrawer)}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{showQuestionnaireDrawer ? 'Hide Answer Tools' : 'Show Answer Tools'}</span>
                </button>
              </div>

              {/* Profile-backed Candidate Answer Chips */}
              {showQuestionnaireDrawer && (
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-indigo-500/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                      <span>Questionnaire Draft &amp; Profile-backed Answer Chips</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      One-Click Copy for Portal Forms
                    </span>
                  </div>

                  <div className="rounded-xl border border-sky-500/25 bg-slate-950/60 p-3 sm:p-4 space-y-3">
                    <div>
                      <h5 className="text-xs font-bold text-white">Draft an answer to a portal question</h5>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Runs only when you click Draft Answer. The first call in a session may check available models before drafting. Review the draft and cited resume evidence; BYOC never fills or submits portal forms.
                      </p>
                    </div>
                    <textarea
                      value={screeningQuestion}
                      onChange={(event) => setScreeningQuestion(event.target.value.slice(0, 2000))}
                      maxLength={2000}
                      rows={3}
                      placeholder="Paste one screening question here…"
                      aria-label="Screening question"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">{screeningQuestion.length}/2000 characters · Nothing is generated automatically</span>
                      <button
                        type="button"
                        onClick={() => void handleDraftScreeningAnswer()}
                        disabled={isDraftingAnswer || !screeningQuestion.trim() || !hasResume || !selectedJob || !groqApiKey}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isDraftingAnswer ? 'Drafting…' : 'Draft Answer'}
                      </button>
                    </div>
                    {questionnaireError && <p role="alert" className="text-xs text-rose-300">{questionnaireError}</p>}
                    {screeningAnswer && screeningAnswer.jobId === selectedJob?.id && (
                      <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-sky-300">AI draft — review before use</label>
                        <textarea
                          readOnly
                          value={screeningAnswer.answer}
                          rows={4}
                          aria-label="Draft screening answer"
                          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-relaxed text-slate-100"
                        />
                        {screeningAnswer.evidenceUsed.length > 0 ? (
                          <div className="text-[10px] text-slate-400">
                            <span className="font-semibold text-emerald-300">Resume evidence cited:</span>
                            <ul className="mt-1 list-disc space-y-1 pl-4">
                              {screeningAnswer.evidenceUsed.map((evidence, index) => <li key={`${index}-${evidence}`}>{evidence}</li>)}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-300">No exact resume evidence was cited. Verify this draft carefully and add the missing detail yourself before using it.</p>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyChip('questionnaire-answer', screeningAnswer.answer)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
                        >
                          {copiedField === 'questionnaire-answer' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedField === 'questionnaire-answer' ? 'Copied' : 'Copy draft'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {/* Notice Period Chip */}
                    <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block uppercase font-mono">Notice Period</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {candidatePreferences.noticePeriod || 'Not configured in profile'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={!candidatePreferences.noticePeriod}
                        onClick={() => handleCopyChip('notice', candidatePreferences.noticePeriod || '')}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {copiedField === 'notice' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'notice' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Total Experience Chip */}
                    <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block uppercase font-mono">Total Relevant Experience</span>
                        <span className="text-xs font-bold text-white truncate block">
                          {candidatePreferences.totalExperienceYears !== null && candidatePreferences.totalExperienceYears !== undefined
                            ? `${candidatePreferences.totalExperienceYears} Years`
                            : 'Not configured in profile'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={candidatePreferences.totalExperienceYears === null || candidatePreferences.totalExperienceYears === undefined}
                        onClick={() => handleCopyChip('exp', `${candidatePreferences.totalExperienceYears} Years`)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {copiedField === 'exp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'exp' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Expected CTC Chip */}
                    <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 block uppercase font-mono">Expected Compensation</span>
                        <span className="text-xs font-bold text-emerald-400 truncate block">
                          {candidatePreferences.expectedCtc || 'Not configured in profile'}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={!candidatePreferences.expectedCtc}
                        onClick={() => handleCopyChip('ctc', candidatePreferences.expectedCtc || '')}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {copiedField === 'ctc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'ctc' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Base / Location Chip */}
                    {(() => {
                      const verifiedLocation = masterResume?.contactInfo.location?.trim() || '';
                      return (
                        <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block uppercase font-mono">Candidate Location</span>
                            <span className="text-xs font-bold text-white truncate block">
                              {verifiedLocation || 'Not configured in Master Resume'}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={!verifiedLocation}
                            onClick={() => handleCopyChip('location', verifiedLocation)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'location' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedField === 'location' ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Contact Email & Phone Chips */}
                    {(() => {
                      const verifiedEmail = masterResume?.contactInfo.email?.trim() || '';
                      const verifiedPhone = masterResume?.contactInfo.phone?.trim() || '';
                      return (
                        <>
                          <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-400 block uppercase font-mono">Email on Master Resume</span>
                              <span className="text-xs font-bold text-white truncate block">
                                {verifiedEmail || 'Not configured in Master Resume'}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={!verifiedEmail}
                              onClick={() => handleCopyChip('email', verifiedEmail)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              {copiedField === 'email' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedField === 'email' ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-400 block uppercase font-mono">Phone on Master Resume</span>
                              <span className="text-xs font-bold text-white truncate block">
                                {verifiedPhone || 'Not configured in Master Resume'}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={!verifiedPhone}
                              onClick={() => handleCopyChip('phone', verifiedPhone)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              {copiedField === 'phone' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedField === 'phone' ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </>
                      );
                    })()}

                    {/* LinkedIn / GitHub / Portfolio if present */}
                    {(masterResume?.contactInfo.linkedin || masterResume?.contactInfo.github || masterResume?.contactInfo.portfolio) && (
                      <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2 sm:col-span-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 block uppercase font-mono">Profile Link on Master Resume</span>
                          <span className="text-xs font-bold text-sky-300 truncate block">
                            {masterResume.contactInfo.linkedin || masterResume.contactInfo.github || masterResume.contactInfo.portfolio}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyChip(
                              'profileLink',
                              masterResume.contactInfo.linkedin || masterResume.contactInfo.github || masterResume.contactInfo.portfolio
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          {copiedField === 'profileLink' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedField === 'profileLink' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}

                    {/* Core Skills Chip */}
                    {(() => {
                      const verifiedSkills = currentArtifact.highlightedSkills.slice(0, 10).join(', ') || masterResume?.skills.technical.slice(0, 8).join(', ') || '';
                      return (
                        <div className="p-2.5 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2 sm:col-span-2">
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block uppercase font-mono">Highlighted Skills in Master Resume</span>
                            <span className="text-xs font-bold text-sky-300 truncate block">
                              {verifiedSkills || 'No skills listed in Master Resume'}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={!verifiedSkills}
                            onClick={() => handleCopyChip('skills', verifiedSkills)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-300 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            {copiedField === 'skills' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedField === 'skills' ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Original Listing Launch & Inline URL Attach */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Target Posting Link ({selectedJob?.source || 'User Import'})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {validListingUrl
                        ? validListingUrl
                        : 'No external listing URL attached yet — attach the original URL to launch directly before marking Applied.'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {validListingUrl && (
                      <a
                        href={validListingUrl}
                        onClick={(event) => {
                          if (shouldUseNativeExternalBrowser()) {
                            event.preventDefault();
                            void openExternalPortalUrl(validListingUrl).catch((error) => console.error('Portal launch failed:', error));
                          }
                        }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Original Listing</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDraftListingUrl(validListingUrl || '');
                        setShowEditUrlForm(!showEditUrlForm);
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                    >
                      {validListingUrl ? 'Update Link' : 'Attach Listing URL'}
                    </button>
                  </div>
                </div>

                {showEditUrlForm && selectedJob && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (updateJobUrl(selectedJob.id, draftListingUrl)) {
                        setShowEditUrlForm(false);
                      }
                    }}
                    className="flex items-center gap-2 pt-2 border-t border-slate-800"
                  >
                    <input
                      type="url"
                      value={draftListingUrl}
                      onChange={(e) => setDraftListingUrl(e.target.value)}
                      placeholder="https://www.glassdoor.com/job-listing/..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-white text-xs focus:outline-none focus:border-sky-500"
                      required
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                    >
                      Save
                    </button>
                  </form>
                )}
              </div>

              {/* Human Review Confirmation & Tracking Commitment */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={humanReviewedConfirmed}
                    onChange={(e) => setHumanReviewedConfirmed(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>I reviewed my exported files, portal questions, and authentic answers.</span>
                </label>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSaveSnapshotOnly}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow-md transition cursor-pointer"
                  >
                    <BookmarkCheck className="w-4 h-4 text-sky-400" />
                    <span>Save Snapshot (Saved)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkAsApplied}
                    disabled={!humanReviewedConfirmed}
                    title={
                      humanReviewedConfirmed
                        ? 'Save immutable snapshot and record as Applied in Tracking'
                        : 'Confirm you reviewed your application details first'
                    }
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>I Submitted on Portal (Mark Applied)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-800/40 border border-slate-800 text-center space-y-3">
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
            No tailored artifact synthesized yet. Click &quot;Generate role-relevant resume variations&quot; above (with a Groq key), or prepare an offline baseline kit using only your authentic Master Profile to export documents and launch Assisted-Apply without AI.
          </p>
          {hasResume && hasJob && (
            <button
              type="button"
              onClick={handleCreateOfflineBaselineKit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-bold transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Prepare Offline Baseline Kit (No AI)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
