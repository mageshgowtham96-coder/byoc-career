import React, { useState, useRef } from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { useAuthLocale } from '../../i18n/authLocale';
import {
  extractResumeFile,
  parseRawResumeToStructured,
  validateExtractedSchema
} from '../../services/extractionService';
import { formatGroqError, parseResumeWithGroq, optimizeMasterResumeWithGroq } from '../../services/groqService';
import { createMasterResumeExportArtifact, dispatchExportFile, generateDocxResume, generatePdfResume, getResumeExportGuidance } from '../../services/exporterService';
import { safeRemoveItem, wipeCachedFormData } from '../../utils/storagePersistence';
import { ExtractionLoadingSkeleton } from './ExtractionLoadingSkeleton';
import { ChakraLogo } from '../ChakraLogo';
import { GuidedMasterResumeBuilder } from './GuidedMasterResumeBuilder';
import { createCareerDraftFromMasterResume } from '../../utils/guidedResumeMapper';
import { assessResumeReadiness } from '../../utils/resumeReadiness';
import { applyResumeIntakeReviewEdits } from '../../utils/resumeIntake';
import type { MasterResume, ExperienceItem } from '../../types';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit3,
  Sparkles,
  ClipboardCheck,
  FileCode,
  Layers,
  ArrowRight,
  PlusCircle,
  Wrench,
  Gauge
} from 'lucide-react';

export const IntakeTab: React.FC = () => {
  const { t } = useAuthLocale();
  const {
    masterResume,
    previousMasterResume,
    restorePreviousMasterResume,
    careerFormDraft,
    setCareerFormDraft,
    groqApiKey,
    stagedParsedResume,
    setStagedParsedResume,
    confirmStagedResume,
    clearMasterResume,
    updateMasterResume,
    addExperienceMilestone,
    hasMasterResume,
    setActiveTab,
    addToast
  } = useWizardStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFileName, setProcessingFileName] = useState('Resume_Document.pdf');
  const [scannedFallbackActive, setScannedFallbackActive] = useState(false);
  const [manualPasteText, setManualPasteText] = useState('');
  const [editableStagedSummary, setEditableStagedSummary] = useState('');
  const [editableHeadline, setEditableHeadline] = useState('');
  const [editableName, setEditableName] = useState('');
  const [editableEmail, setEditableEmail] = useState('');
  const [localStagedProfile, setLocalStagedProfile] = useState<MasterResume | null>(stagedParsedResume);
  const [isAiStructuring, setIsAiStructuring] = useState(false);
  const [aiStructuringError, setAiStructuringError] = useState<string | null>(null);
  const [isOptimizingMaster, setIsOptimizingMaster] = useState(false);
  const [optimizedMasterPreview, setOptimizedMasterPreview] = useState<MasterResume | null>(null);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const masterResumeExportGuidance = masterResume
    ? getResumeExportGuidance(createMasterResumeExportArtifact(masterResume), masterResume)
    : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualPasteRef = useRef<HTMLTextAreaElement>(null);

  // Clear Master Resume Confirmation State
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showReplaceMasterConfirm, setShowReplaceMasterConfirm] = useState(false);

  // Half-Built Resume Builder State
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [showGuidedBuilder, setShowGuidedBuilder] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newDates, setNewDates] = useState('');
  const [newBullet1, setNewBullet1] = useState('');
  const [newBullet2, setNewBullet2] = useState('');
  const [newSkillInput, setNewSkillInput] = useState('');

  // Transactional Clear Master Resume Action Handler
  const handleClearMasterResume = () => {
    // 1. Execute deep structural reset in store & force persistent storage sync
    clearMasterResume();
    setCareerFormDraft(null);
    safeRemoveItem('byoc_career_form_draft');
    wipeCachedFormData({ wipeAllKeys: true });

    // 2. Clean out local input, upload ref, and form draft states
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setManualPasteText('');
    setScannedFallbackActive(false);
    setEditableStagedSummary('');
    setEditableHeadline('');
    setEditableName('');
    setEditableEmail('');
    setLocalStagedProfile(null);
    setAiStructuringError(null);
    setShowReplaceMasterConfirm(false);
    setShowBuilderModal(false);
    setShowClearConfirmModal(false);
    setNewRole('');
    setNewCompany('');
    setNewDates('');
    setNewBullet1('');
    setNewBullet2('');
    setNewSkillInput('');

    // 3. Verify that global readiness selector flags immediately shift to false
    const stillHasResume = hasMasterResume();
    if (stillHasResume) {
      console.warn('Readiness check: hasMasterResume is still reporting true after purge');
    }

    // 4. Dynamically trigger prominent real-time visual success toast
    addToast({
      type: 'success',
      title: 'Master Resume State Cleanly Purged',
      message: 'All resume profile arrays, extraction metadata, and cached drafting collections reset to baseline.',
      duration: 5000
    });
  };

  const resumeReadiness = assessResumeReadiness(masterResume);
  const completenessScore = resumeReadiness.completenessPercent;
  const isHalfBuilt = Boolean(masterResume && completenessScore < 85);

  const handleFileDrop = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsProcessing(true);
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    setProcessingFileName(file.name);
    setScannedFallbackActive(false);

    try {
      const result = await extractResumeFile(file);

      if (!result.success || result.isScannedImage) {
        setScannedFallbackActive(true);
        addToast({
          type: 'warning',
          title: result.isScannedImage ? 'Scanned Document Detected' : 'Document Ingestion Alert',
          message: result.error || 'No selectable text stream was found. Please paste your resume text below in the manual fallback.'
        });
      } else if (result.parsedProfile) {
        setStagedParsedResume(result.parsedProfile);
        setLocalStagedProfile(result.parsedProfile);
        setShowReplaceMasterConfirm(false);
        setAiStructuringError(null);
        setEditableStagedSummary(result.parsedProfile.summary);
        setEditableHeadline(result.parsedProfile.headline);
        setEditableName(result.parsedProfile.contactInfo.name || '');
        setEditableEmail(result.parsedProfile.contactInfo.email || '');
        addToast({
          type: 'info',
          title: 'Review Required',
          message: `Parsed ${result.wordCount} words. Review & approve before saving to Master Profile.`
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      addToast({
        type: 'error',
        title: 'Parsing Error',
        message: msg
      });
      setScannedFallbackActive(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualPasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPasteText.trim().length < 30) {
      addToast({
        type: 'warning',
        message: 'Please paste a complete resume with at least 30 characters.'
      });
      return;
    }

    setIsProcessing(true);
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    setProcessingFileName('Manual_Text_Paste.txt');

    setTimeout(() => {
      try {
        const words = manualPasteText.trim().split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const pages = Math.max(1, Math.ceil(wordCount / 450));

        const parsed = parseRawResumeToStructured(
          manualPasteText,
          'Manual_Text_Paste.txt',
          wordCount,
          pages,
          manualPasteText.length
        );

        setStagedParsedResume(parsed);
        setLocalStagedProfile(parsed);
        setShowReplaceMasterConfirm(false);
        setAiStructuringError(null);
        setEditableStagedSummary(parsed.summary);
        setEditableHeadline(parsed.headline);
        setEditableName(parsed.contactInfo.name || '');
        setEditableEmail(parsed.contactInfo.email || '');
        setScannedFallbackActive(false);
        setManualPasteText('');

        addToast({
          type: 'info',
          title: 'Manual Text Parsed',
          message: `Parsed ${wordCount} words. Please review in the Confirmation slab below.`
        });
      } finally {
        setIsProcessing(false);
      }
    }, 350);
  };

  const handleAiStructureResume = async () => {
    if (!stagedParsedResume || !groqApiKey || isAiStructuring) return;
    setIsAiStructuring(true);
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    setAiStructuringError(null);
    try {
      const reviewEdits = {
        name: editableName,
        email: editableEmail,
        headline: editableHeadline,
        summary: editableStagedSummary
      };
      const reviewedSource = applyResumeIntakeReviewEdits(stagedParsedResume, reviewEdits);
      const structured = await parseResumeWithGroq(reviewedSource, groqApiKey);
      // AI output may misread contact or headline fields; explicit user corrections win.
      const reviewedStructured = applyResumeIntakeReviewEdits(structured, reviewEdits);
      setStagedParsedResume(reviewedStructured);
      setEditableStagedSummary(reviewedStructured.summary);
      setEditableHeadline(reviewedStructured.headline);
      setEditableName(reviewedStructured.contactInfo.name || '');
      setEditableEmail(reviewedStructured.contactInfo.email || '');
      addToast({
        type: 'info',
        title: 'AI Structure Ready for Review',
        message: 'Your local parse is preserved. Compare every field with the original resume before approving.'
      });
    } catch (err: unknown) {
      const message = formatGroqError(err, 'AI resume structuring failed.');
      setAiStructuringError(message);
      addToast({ type: 'error', title: 'AI Structuring Failed', message });
    } finally {
      setIsAiStructuring(false);
    }
  };

  const handleOptimizeMasterResume = async () => {
    if (!stagedParsedResume || !groqApiKey || isOptimizingMaster) return;
    setIsOptimizingMaster(true);
    setOptimizationError(null);
    setOptimizedMasterPreview(null);
    try {
      const reviewedSource = applyResumeIntakeReviewEdits(stagedParsedResume, {
        name: editableName,
        email: editableEmail,
        headline: editableHeadline,
        summary: editableStagedSummary
      });
      const optimized = await optimizeMasterResumeWithGroq(reviewedSource, groqApiKey);
      setOptimizedMasterPreview(optimized);
    } catch (err: unknown) {
      const message = formatGroqError(err, 'Master Resume optimization failed.');
      setOptimizationError(message);
      addToast({ type: 'error', title: 'Optimization Failed', message });
    } finally {
      setIsOptimizingMaster(false);
    }
  };

  const handleAcceptOptimizedMaster = () => {
    if (!optimizedMasterPreview) return;
    setStagedParsedResume(optimizedMasterPreview);
    setEditableStagedSummary(optimizedMasterPreview.summary);
    setEditableHeadline(optimizedMasterPreview.headline);
    setEditableName(optimizedMasterPreview.contactInfo.name || '');
    setEditableEmail(optimizedMasterPreview.contactInfo.email || '');
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    addToast({
      type: 'success',
      title: 'Optimized Draft Applied',
      message: 'Review the updated profile and confirm it to save as your Master Resume. The original source text remains unchanged.'
    });
  };

  const handleExportMasterResume = async (format: 'docx' | 'pdf') => {
    if (!masterResume || isExportingMaster) return;
    setIsExportingMaster(true);
    try {
      const artifact = createMasterResumeExportArtifact(masterResume);
      const blob = format === 'docx'
        ? await generateDocxResume(artifact, masterResume)
        : await generatePdfResume(artifact, masterResume);
      const extension = format === 'docx' ? 'docx' : 'pdf';
      const mimeType = format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';
      const safeName = (masterResume.contactInfo.name || 'Master_Resume').replace(/[^a-z0-9_-]+/gi, '_');
      const exported = await dispatchExportFile(blob, `${safeName}_Master_Resume.${extension}`, mimeType);
      if (exported) {
        addToast({ type: 'success', title: 'Master Resume Exported', message: `Your approved Master Resume was exported as ${extension.toUpperCase()}.` });
      } else {
        addToast({ type: 'info', title: 'Export Cancelled', message: 'The share or download action was cancelled.' });
      }
    } catch (err: unknown) {
      addToast({ type: 'error', title: 'Master Resume Export Failed', message: err instanceof Error ? err.message : 'Could not export the Master Resume.' });
    } finally {
      setIsExportingMaster(false);
    }
  };

  const handleRevertToLocalParse = () => {
    if (!localStagedProfile) return;
    setStagedParsedResume(localStagedProfile);
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    setEditableStagedSummary(localStagedProfile.summary);
    setEditableHeadline(localStagedProfile.headline);
    setEditableName(localStagedProfile.contactInfo.name || '');
    setEditableEmail(localStagedProfile.contactInfo.email || '');
    setAiStructuringError(null);
  };

  const commitStagedResume = () => {
    if (!stagedParsedResume) return;

    const finalStaged: MasterResume = {
      ...(localStagedProfile || stagedParsedResume),
      contactInfo: {
        ...stagedParsedResume.contactInfo,
        name: editableName.trim(),
        email: editableEmail.trim()
      },
      headline: editableHeadline.trim(),
      summary: editableStagedSummary.trim(),
      additionalEvidence: [...((localStagedProfile || stagedParsedResume).additionalEvidence || [])]
    };

    useWizardStore.setState({ stagedParsedResume: finalStaged });
    confirmStagedResume();
    setCareerFormDraft(null);
    setShowReplaceMasterConfirm(false);
  };

  const handleGuidedBuilderComplete = (profile: MasterResume) => {
    setOptimizedMasterPreview(null);
    setStagedParsedResume(profile);
    setLocalStagedProfile(profile);
    setEditableStagedSummary(profile.summary);
    setEditableHeadline(profile.headline);
    setEditableName(profile.contactInfo.name || '');
    setEditableEmail(profile.contactInfo.email || '');
    setAiStructuringError(null);
    setOptimizedMasterPreview(null);
    setOptimizationError(null);
    setShowGuidedBuilder(false);
    addToast({
      type: 'success',
      title: 'Master Resume Draft Ready',
      message: 'Review the details below. Your active profile will change only after you confirm.'
    });
  };

  const handleApproveStaged = () => {
    if (!stagedParsedResume) return;
    if (masterResume) {
      setShowReplaceMasterConfirm(true);
      return;
    }
    commitStagedResume();
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.trim() || !newCompany.trim()) {
      addToast({ type: 'warning', message: 'Role and Company are required.' });
      return;
    }

    const bullets: string[] = [];
    if (newBullet1.trim()) bullets.push(newBullet1.trim());
    if (newBullet2.trim()) bullets.push(newBullet2.trim());

    if (bullets.length === 0) {
      addToast({ type: 'warning', message: 'Enter at least one impact bullet from your actual experience.' });
      return;
    }

    const [rawStart = '', rawEnd = ''] = newDates.split('-').map((s) => s.trim());

    addExperienceMilestone({
      company: newCompany.trim(),
      role: newRole.trim(),
      startDate: rawStart,
      endDate: rawEnd,
      location: masterResume?.contactInfo.location || '',
      bullets
    });

    setNewRole('');
    setNewCompany('');
    setNewDates('');
    setNewBullet1('');
    setNewBullet2('');
    setShowBuilderModal(false);
  };

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillInput.trim() || !masterResume) return;

    const skillsToAdd = newSkillInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    updateMasterResume((prev) => ({
      ...prev,
      skills: {
        ...prev.skills,
        technical: Array.from(new Set([...prev.skills.technical, ...skillsToAdd]))
      }
    }));

    setNewSkillInput('');
    addToast({ type: 'success', message: `Added ${skillsToAdd.join(', ')} to verified skills.` });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-sky-400" />
            <span>Master Resume Intake & Structural Builder</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Ingest PDF, DOCX, TXT, or MD files up to 10MB into your client-side vault.
          </p>
          {masterResumeExportGuidance && !masterResumeExportGuidance.pdfSupported && (
            <p role="status" className="mt-2 max-w-2xl rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
              {t('Some characters in your resume are not supported by the built-in PDF fonts. Choose DOCX to preserve every character. PDF export is paused to prevent text loss.')} {t('Recommended for Tamil and other scripts')}
            </p>
          )}
        </div>

        {masterResume && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowBuilderModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold transition cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Build or Improve Master Resume</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportMasterResume('docx')}
              disabled={isExportingMaster}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 text-xs font-semibold disabled:opacity-50"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{isExportingMaster ? 'Exporting…' : t('Export .DOCX')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportMasterResume('pdf')}
              disabled={isExportingMaster || masterResumeExportGuidance?.pdfSupported === false}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 text-xs font-semibold disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('Export .PDF')}</span>
            </button>
            <button
              onClick={() => setShowClearConfirmModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold transition cursor-pointer"
              title="Purge master resume and drafting collections"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Master Resume</span>
            </button>
          </div>
        )}
      </div>

      {/* Half-Built Resume Alert & Interactive Upgrade Bar */}
      {isHalfBuilt && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-amber-200">
                  Master Resume Profile Completeness: {completenessScore}%
                </h4>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Details to Review
                </span>
              </div>
              <p className="text-[11px] text-amber-300/80 mt-1">
                This score measures structured profile information, not employability, and does not require paid work history. You may want to add: {resumeReadiness.missingSections.join(', ')}. Include only details that reflect your real experience.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowBuilderModal(true)}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0 shadow-sm"
          >
            Review and Improve Profile
          </button>
        </div>
      )}

      {/* Mandatory Review Gate (If Staged File Exists) */}
      {stagedParsedResume && (
        <div className="rounded-2xl border-2 border-indigo-500 bg-slate-800/95 p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-2">
            <ClipboardCheck className="w-4 h-4 text-indigo-400" />
            <span>Mandatory Review Gate — Confirm Before Saving</span>
          </div>

          <h3 className="text-lg font-bold text-white">
            Review Ingested Evidence Slab
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            Check the extracted information. You can edit every section before approving it; BYOC will not change your active Master Profile until you confirm.
          </p>
          <button
            type="button"
            onClick={() => {
              setOptimizedMasterPreview(null);
              setCareerFormDraft(createCareerDraftFromMasterResume(stagedParsedResume));
              setShowGuidedBuilder(true);
            }}
            className="mb-5 inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/20"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit all extracted details
          </button>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Word Count</span>
              <p className="text-lg font-bold text-white mt-0.5">{stagedParsedResume.stats.wordCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Est. Pages</span>
              <p className="text-lg font-bold text-white mt-0.5">{stagedParsedResume.stats.pageCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Milestones</span>
              <p className="text-lg font-bold text-sky-400 mt-0.5">{stagedParsedResume.experiences.length}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Source File</span>
              <p className="text-xs font-semibold text-slate-300 mt-1 truncate">{stagedParsedResume.stats.sourceFileName}</p>
            </div>
          </div>

          {/* Missing Mandatory Fields Alert Banner */}
          {(() => {
            const validation = validateExtractedSchema(stagedParsedResume);
            if (validation.missingMandatoryFields.length === 0) return null;
            return (
              <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Information Not Automatically Detected ({validation.missingMandatoryFields.length})</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  The document reader did not confidently identify: <strong>{validation.missingMandatoryFields.join(', ')}</strong>. Review these details and add or correct anything relevant before confirming your career profile. Work history is not required when other career evidence applies.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {validation.missingMandatoryFields.map((field, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[10px] font-mono"
                    >
                      Review: {field}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mb-5 rounded-2xl border border-sky-500/25 bg-slate-900/70 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-sky-200">Optional AI Resume Structuring (Groq)</h4>
                <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-400">
                  Local extraction already ran. Nothing is sent automatically. If you click this, the extracted resume text (up to 24,000 characters) is sent to Groq using your API key to propose structured fields. It may include your name, email, phone, links and other personal details present in the document. AI can misread or invent details: compare everything with the source below before approving. The local parse remains available to restore.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleAiStructureResume()}
                  disabled={!groqApiKey || isAiStructuring || isProcessing || stagedParsedResume.rawText.length > 24000}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isAiStructuring ? 'Structuring…' : 'Structure with Groq'}
                </button>
                {localStagedProfile && stagedParsedResume !== localStagedProfile && (
                  <button
                    type="button"
                    onClick={handleRevertToLocalParse}
                    disabled={isAiStructuring}
                    className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Restore Local Parse
                  </button>
                )}
              </div>
            </div>
            {!groqApiKey && <p className="text-[11px] text-amber-300">Add a Groq key in Settings to enable this optional action. The local parser works without an AI key.</p>}
            {stagedParsedResume.rawText.length > 24000 && <p className="text-[11px] text-amber-300">This extracted resume is over the AI structuring limit. Continue with the local parse.</p>}
            {aiStructuringError && <p role="alert" className="text-[11px] text-rose-300">{aiStructuringError}</p>}
            <details className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">View extracted source text locally</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-slate-400">{stagedParsedResume.rawText}</pre>
            </details>
          </div>

          {/* Optional Master Resume optimization: compare before accepting. */}
          <div className="mb-5 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-violet-200">Optional Master Resume Optimization</h4>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Ask Groq to improve wording and clarity using your structured profile only. Dedicated contact fields and original uploaded text are excluded; personal details typed into free-text bullets, project descriptions or other evidence may still be sent. This is optional and never replaces your source automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleOptimizeMasterResume()}
                disabled={!groqApiKey || isOptimizingMaster || isAiStructuring || isProcessing}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isOptimizingMaster ? 'Optimizing…' : 'Suggest improvements'}
              </button>
            </div>
            {!groqApiKey && <p className="text-[11px] text-amber-300">This additional feature uses your existing Groq key. The local Master Resume workflow remains available without it.</p>}
            {optimizationError && <p role="alert" className="text-[11px] text-rose-300">{optimizationError}</p>}
            {optimizedMasterPreview && (
              <div className="space-y-3 rounded-xl border border-violet-400/25 bg-slate-950/60 p-3">
                <p className="text-[11px] font-bold text-violet-200">Compare the proposed wording with your current draft</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Current headline</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{editableHeadline || 'Not provided'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-violet-300">Suggested headline</p><p className="mt-1 whitespace-pre-wrap text-xs text-white">{optimizedMasterPreview.headline || 'Not provided'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Current summary</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{editableStagedSummary || 'Not provided'}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-violet-300">Suggested summary</p><p className="mt-1 whitespace-pre-wrap text-xs text-white">{optimizedMasterPreview.summary || 'Not provided'}</p></div>
                </div>
                {optimizedMasterPreview.projects.map((project) => {
                  const original = stagedParsedResume.projects.find((item) => item.id === project.id);
                  if (!original || original.description === project.description) return null;
                  return (
                    <div key={project.id} className="grid gap-2 border-t border-slate-800 pt-2 sm:grid-cols-2">
                      <div><p className="text-[10px] font-bold uppercase text-slate-500">{original.title} — Current description</p><p className="mt-1 text-[11px] text-slate-400">{original.description || 'Not provided'}</p></div>
                      <div><p className="text-[10px] font-bold uppercase text-violet-300">{project.title} — Suggested description</p><p className="mt-1 text-[11px] text-white">{project.description || 'Not provided'}</p></div>
                    </div>
                  );
                })}
                {optimizedMasterPreview.experiences.map((experience) => {
                  const original = stagedParsedResume.experiences.find((item) => item.id === experience.id);
                  if (!original) return null;
                  return experience.bullets.map((bullet, index) => (
                    <div key={experience.id + '-' + index} className="grid gap-2 border-t border-slate-800 pt-2 sm:grid-cols-2">
                      <p className="text-[11px] text-slate-400">{original.bullets[index] || '—'}</p>
                      <p className="text-[11px] text-white">{bullet}</p>
                    </div>
                  ));
                })}
                <p className="text-[10px] leading-relaxed text-amber-200">AI wording is a suggestion, not proof. Check every factual statement. Accepting applies it only to this staged draft; your active Master Resume changes only after the separate confirmation below.</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setOptimizedMasterPreview(null)} className="rounded-lg border border-slate-600 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-slate-800">Discard suggestion</button>
                  <button type="button" onClick={handleAcceptOptimizedMaster} className="rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-violet-500">Use suggested wording</button>
                </div>
              </div>
            )}
          </div>

          {/* Editable Fields in Review Gate */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Candidate Full Name
                </label>
                <input
                  type="text"
                  value={editableName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditableName(value);
                    setLocalStagedProfile((current) => current ? { ...current, contactInfo: { ...current.contactInfo, name: value } } : current);
                    setOptimizedMasterPreview(null);
                  }}
                  placeholder="Candidate Full Name"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editableEmail}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditableEmail(value);
                    setLocalStagedProfile((current) => current ? { ...current, contactInfo: { ...current.contactInfo, email: value } } : current);
                    setOptimizedMasterPreview(null);
                  }}
                  placeholder="candidate@domain.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="review-additional-evidence" className="block text-xs font-semibold text-slate-300 mb-1">
                Other career evidence — review each line
              </label>
              <p className="mb-2 text-[11px] text-slate-400">Each line is a separate item. Edit its wording or category, or delete the line if it does not describe your experience.</p>
              <textarea id="review-additional-evidence" rows={Math.max(3, Math.min(10, (localStagedProfile || stagedParsedResume).additionalEvidence?.length || 3))}
                value={((localStagedProfile || stagedParsedResume).additionalEvidence || []).join('\n')}
                onChange={(event) => {
                  const additionalEvidence = event.target.value.split('\n').map((item) => item.trim()).filter(Boolean);
                  setLocalStagedProfile((current) => current ? { ...current, additionalEvidence } : current);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Headline / Title
              </label>
              <input
                type="text"
                value={editableHeadline}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditableHeadline(value);
                  setLocalStagedProfile((current) => current ? { ...current, headline: value } : current);
                  setOptimizedMasterPreview(null);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Professional Summary (Review & Edit)
              </label>
              <textarea
                rows={3}
                value={editableStagedSummary}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditableStagedSummary(value);
                  setLocalStagedProfile((current) => current ? { ...current, summary: value } : current);
                  setOptimizedMasterPreview(null);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Extracted Skills & Competencies ({stagedParsedResume.skills.technical.length})
              </label>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-900/60 border border-slate-700">
                {stagedParsedResume.skills.technical.map((skill, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons for Review Gate */}
          {showReplaceMasterConfirm && masterResume ? (
            <div role="alert" className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-100">A Master Resume already exists. Replacing it will make this reviewed profile the active Master Resume; BYOC will not merge the two profiles automatically.</p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReplaceMasterConfirm(false)}
                  className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Keep Current Master
                </button>
                <button
                  type="button"
                  onClick={commitStagedResume}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500"
                >
                  Replace Master Resume
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {!showReplaceMasterConfirm && (
              <button
                onClick={handleApproveStaged}
                className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>{masterResume ? 'Review Master Resume Replacement' : 'Approve & Save to Master Profile'}</span>
              </button>
            )}
            <button
              onClick={() => {
                setStagedParsedResume(null);
                setLocalStagedProfile(null);
                setShowReplaceMasterConfirm(false);
              }}
              className="w-full sm:w-auto py-3 px-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Active Document Extraction Loading Skeleton & Progress Indicator */}
      {isProcessing && (
        <ExtractionLoadingSkeleton
          fileName={processingFileName}
          isProcessing={isProcessing}
        />
      )}

      {/* Upload Zone & Manual Paste Fallback */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Upload Dropzone */}
        <div className="md:col-span-7">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isProcessing) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (!isProcessing) handleFileDrop(e.dataTransfer.files);
            }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
              isProcessing
                ? 'border-indigo-500/70 bg-indigo-950/30 cursor-wait shadow-xl shadow-indigo-500/10'
                : isDragging
                ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01] cursor-pointer'
                : 'border-slate-700/80 bg-slate-800/60 hover:bg-slate-800/90 hover:border-slate-600 cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              disabled={isProcessing}
              onChange={(e) => {
                const input = e.currentTarget;
                // handleFileDrop reads the file synchronously before its first await,
                // so clearing the input afterwards lets the same file be picked again.
                void handleFileDrop(input.files);
                input.value = '';
              }}
            />

            {isProcessing ? (
              <div className="flex flex-col items-center justify-center py-2 space-y-3 animate-in fade-in">
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-sky-400 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ChakraLogo size={28} spin={true} glow={true} />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400 animate-bounce" />
                    <span>Extracting Document Structure...</span>
                  </h4>
                  <p className="text-xs text-indigo-300 font-mono font-semibold truncate max-w-xs mx-auto">
                    {processingFileName}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Reconstructing coordinates, milestones & skill vectors
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                  <UploadCloud className="w-7 h-7" />
                </div>

                <h3 className="text-sm sm:text-base font-bold text-white mb-1">
                  Tap to Upload or Drag Resume File
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mb-3">
                  Accepts .docx, .txt, .md, and basic selectable-text .pdf files up to 10MB (100% local, no raster OCR).
                </p>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 text-[10px] font-mono">
                    PDF
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 text-[10px] font-mono">
                    DOCX
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 text-[10px] font-mono">
                    TXT
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-700/60 text-slate-300 text-[10px] font-mono">
                    MD
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Manual Paste Fallback / Scanned Image Window */}
        <div className="md:col-span-5">
          <div className={`rounded-3xl border p-5 h-full flex flex-col justify-between ${
            scannedFallbackActive
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-slate-700/80 bg-slate-800/60'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-sky-400" />
                  <span>Manual Paste Fallback</span>
                </span>
                {scannedFallbackActive && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Extraction Unsupported
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                If your PDF is image-scanned, encrypted, or uses custom font encoding (raster OCR is not included), paste raw resume text here directly.
              </p>

              <textarea
                ref={manualPasteRef}
                rows={5}
                value={manualPasteText}
                onChange={(e) => setManualPasteText(e.target.value)}
                placeholder="Paste full resume text here (Name, Experience bullets, Skills, Education)..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500 resize-none font-mono"
              />
            </div>

            <button
              type="button"
              onClick={handleManualPasteSubmit}
              disabled={!manualPasteText.trim()}
              className="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Parse Pasted Content</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Master Resume Profile Slab */}
      {masterResume ? (
        <div className="rounded-3xl border border-slate-700 bg-slate-800/80 p-5 sm:p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-700/80">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{masterResume.contactInfo.name}</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] font-mono font-bold">
                  Saved in Vault
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                  {completenessScore}% Complete
                </span>
              </div>
              <p className="text-xs text-sky-400 font-medium mt-0.5">{masterResume.headline}</p>
              <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {[masterResume.contactInfo.email, masterResume.contactInfo.phone, masterResume.contactInfo.location]
                  .filter((v): v is string => Boolean(v && v.trim()))
                  .map((val, idx, arr) => (
                    <React.Fragment key={`${val}-${idx}`}>
                      <span>{val}</span>
                      {idx < arr.length - 1 && <span>•</span>}
                    </React.Fragment>
                  ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {previousMasterResume && (
                <button type="button" onClick={restorePreviousMasterResume} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-xs font-semibold transition">
                  Restore Previous Resume
                </button>
              )}
              <button
                onClick={() => setShowGuidedBuilder(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-200 text-xs font-semibold transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Guided Editor</span>
              </button>
                            <button
                onClick={() => setShowBuilderModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
                <span>Add Milestone</span>
              </button>
              <button
                onClick={() => setActiveTab('sourcing')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <span>Proceed to Sourcing</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Summary */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Executive Summary
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              {masterResume.summary}
            </p>
          </div>

          {/* Experience Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Experience History ({masterResume.experiences.length})
              </h4>
              <button
                onClick={() => setShowBuilderModal(true)}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
              >
                + Add Experience
              </button>
            </div>
            <div className="space-y-3">
              {masterResume.experiences.map((exp) => (
                <div key={exp.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <span className="text-sm font-bold text-white">{exp.role} — <span className="text-slate-400">{exp.company}</span></span>
                    <span className="text-[11px] font-mono text-slate-400">{exp.startDate} - {exp.endDate}</span>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {exp.bullets.map((b, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Skills Badges & Quick Skill Adder */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Technical Skills ({masterResume.skills.technical.length})
            </h4>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {masterResume.skills.technical.map((s, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-sky-300 text-xs font-mono"
                >
                  {s}
                </span>
              ))}
            </div>

            <form onSubmit={handleAddSkill} className="flex gap-2 max-w-md">
              <input
                type="text"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                placeholder="Add skill (e.g. Docker, GraphQL, Kubernetes)"
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold"
              >
                Add Skill
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-800/40 border border-slate-700/60 text-center space-y-3 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Start your Master Resume</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              You do not need an existing resume or a computer. Build your profile step by step, include projects or study if you are new to work, or upload/paste a resume you already have.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidedBuilder(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-500"
          >
            <Sparkles className="h-4 w-4" />
            Build my Master Resume step by step
          </button>
          <button
            type="button"
            onClick={() => {
              manualPasteRef.current?.focus();
              manualPasteRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
          >
            <span>Focus Manual Paste Fallback</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      )}

      {/* Clear Master Resume Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-800 border border-rose-500/40 rounded-3xl p-6 shadow-2xl relative text-left">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Purge Master Resume State?
                </h3>
                <p className="text-xs text-rose-300/80 font-mono">
                  Hard Structural Reset
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              This action executes a complete structural purge of your active Master Resume, wiping all parsed skills, milestones, extraction provenance trackers, and active drafting kits from local memory and device storage. Previously submitted application snapshots in Tracking remain safely preserved.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-700/80">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearMasterResume}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Master Resume</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Half-Built Resume Builder Modal */}
      {showBuilderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl relative text-left my-8">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-indigo-400" />
              <span>Master Resume Builder</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Add verified career milestones directly into your master profile to eliminate gaps.
            </p>

            <form onSubmit={handleAddMilestone} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Role Title *</label>
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Company / Organization *</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="e.g. Cloud Matrix Labs"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Timeframe (Start - End)</label>
                <input
                  type="text"
                  value={newDates}
                  onChange={(e) => setNewDates(e.target.value)}
                  placeholder="e.g. 2021 - Present"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Impact Bullet #1</label>
                <textarea
                  rows={2}
                  value={newBullet1}
                  onChange={(e) => setNewBullet1(e.target.value)}
                  placeholder="e.g. Spearheaded micro-frontend migration cutting bundle payload by 35%..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Impact Bullet #2</label>
                <textarea
                  rows={2}
                  value={newBullet2}
                  onChange={(e) => setNewBullet2(e.target.value)}
                  placeholder="e.g. Mentored 4 engineers on automated testing and zero-downtime releases..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowBuilderModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Commit Milestone to Master Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGuidedBuilder && (
        <GuidedMasterResumeBuilder
          initialDraft={careerFormDraft || (stagedParsedResume ? createCareerDraftFromMasterResume(stagedParsedResume) : masterResume ? createCareerDraftFromMasterResume(masterResume) : null)}
          groqApiKey={groqApiKey}
          isEditingExisting={Boolean(masterResume || stagedParsedResume)}
          onDraftChange={setCareerFormDraft}
          onComplete={handleGuidedBuilderComplete}
          onCancel={() => setShowGuidedBuilder(false)}
        />
      )}
    </div>
  );
};
