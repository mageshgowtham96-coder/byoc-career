import React, { useState } from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { sanitizeExternalHttpUrl } from '../../services/jobSearchService';
import type { ApplicationRecord, ApplicationStatus } from '../../types';
import {
  KanbanSquare,
  Building2,
  Calendar,
  Clock,
  Trash2,
  ExternalLink,
  FileText,
  Lock,
  Plus,
  CheckCircle,
  Eye,
  X,
  MessageSquare,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  MapPin,
  DollarSign,
  Mail,
  RefreshCw,
  Inbox,
  AlertTriangle,
  History,
  ShieldAlert
} from 'lucide-react';

export const TrackingTab: React.FC = () => {
  const {
    applications,
    unsavedQueue,
    approveUnsavedApplication,
    dismissUnsavedApplication,
    updateApplicationStatus,
    updateApplicationNotes,
    deleteApplication,
    addInterviewStage,
    runEmailSync,
    isEmailSyncing,
    lastEmailSyncDate,
    generateFollowUpEmailContent,
    addToast
  } = useWizardStore();

  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'snapshot' | 'rawJd' | 'followup'>('details');
  const [copiedFollowUpModal, setCopiedFollowUpModal] = useState(false);

  // Interview stage creation state
  const [stageName, setStageName] = useState('');
  const [stageDate, setStageDate] = useState('');
  const [stageNotes, setStageNotes] = useState('');

  // Rejection reason input state
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionNotesInput, setRejectionNotesInput] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const statuses: ApplicationStatus[] = [
    'Saved',
    'Applied',
    'Screening',
    'Interview',
    'Offer',
    'Rejected'
  ];

  const handleStatusChange = (appId: string, status: ApplicationStatus) => {
    if (status === 'Rejected') {
      setShowRejectionForm(true);
      return;
    }
    updateApplicationStatus(appId, status);
    if (selectedApp && selectedApp.id === appId) {
      setSelectedApp({ ...selectedApp, status });
    }
  };

  const handleConfirmRejection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    updateApplicationStatus(selectedApp.id, 'Rejected', {
      reason: rejectionReasonInput.trim() || 'Role cancelled or mismatch',
      notes: rejectionNotesInput.trim()
    });

    const updated = useWizardStore.getState().applications.find((a) => a.id === selectedApp.id);
    if (updated) setSelectedApp(updated);

    setShowRejectionForm(false);
    setRejectionReasonInput('');
    setRejectionNotesInput('');
  };

  const handleAddInterview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !stageName.trim()) return;

    addInterviewStage(
      selectedApp.id,
      stageName.trim(),
      stageDate || new Date().toISOString().split('T')[0],
      stageNotes.trim()
    );

    const updated = useWizardStore.getState().applications.find((a) => a.id === selectedApp.id);
    if (updated) setSelectedApp(updated);

    setStageName('');
    setStageDate('');
    setStageNotes('');
    addToast({ type: 'success', message: 'Interview round logged.' });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <KanbanSquare className="w-6 h-6 text-sky-400" />
            <span>Application Pipeline & Vault</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Immutable application snapshots with offline-cached job specifications and rejection deduplication.
          </p>
        </div>

        {/* Email Vault Check Action & OAuth Disclosure */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Mailbox Sync: Not Connected (No OAuth)</span>
          </div>
          <button
            type="button"
            onClick={() => runEmailSync()}
            disabled={isEmailSyncing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isEmailSyncing ? 'animate-spin' : ''}`} />
            <span>{isEmailSyncing ? 'Checking...' : 'Check Local Email Vault'}</span>
          </button>
        </div>
      </div>

      {/* Email-derived applications awaiting user review */}
      {unsavedQueue.length > 0 && (
        <div className="p-5 rounded-3xl bg-indigo-950/30 border border-indigo-500/40 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Unmatched Applications from Email</span>
                  <span className="px-2 py-0.2 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-mono">
                    {unsavedQueue.length} to Review
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  These email-derived roles did not match a saved application. Review each record before adding it to your pipeline.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {unsavedQueue.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 flex flex-col justify-between text-left space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="font-mono text-sky-400 font-bold">{item.company}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] text-slate-400">
                      {item.infrastructure} {item.detectedReferenceNumber ? `• ${item.detectedReferenceNumber}` : ''}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">{item.role}</h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                    {item.snippet}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => dismissUnsavedApplication(item.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 text-xs font-medium transition cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => approveUnsavedApplication(item.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve & Ingest</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Kanban / Application Pipeline */}
      {applications.length === 0 ? (
        <div className="p-10 rounded-3xl bg-slate-800/40 border border-slate-800 text-center max-w-md mx-auto my-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <KanbanSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">
            Pipeline Empty
          </h3>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Move jobs from Sourcing or Tailoring by clicking &quot;Mark as Applied&quot; to record your first immutable snapshot.
          </p>
        </div>
      ) : (
        /* Status Board Columns */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statuses.map((status) => {
            const appsInStatus = applications.filter((a) => a.status === status);

            return (
              <div
                key={status}
                className="p-4 rounded-3xl bg-slate-800/60 border border-slate-800 flex flex-col h-full"
              >
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        status === 'Offer'
                          ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                          : status === 'Interview'
                          ? 'bg-sky-400'
                          : status === 'Screening'
                          ? 'bg-indigo-400'
                          : status === 'Applied'
                          ? 'bg-blue-400'
                          : status === 'Saved'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                      }`}
                    />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      {status}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-300">
                    {appsInStatus.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                  {appsInStatus.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => setSelectedApp(app)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer group shadow-sm text-left ${
                        app.status === 'Rejected'
                          ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/60'
                          : 'bg-slate-900/80 border-slate-700/80 hover:border-indigo-500/60 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-sky-400 truncate">
                          {app.company}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {new Date(app.appliedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-2 leading-tight group-hover:text-indigo-300 transition">
                        {app.role}
                      </h4>

                      {/* 7+ Days Follow-Up Badge */}
                      {app.status === 'Applied' && (Date.now() - new Date(app.appliedDate).getTime() >= 7 * 24 * 60 * 60 * 1000 || app.notes?.includes('[NeedsFollowUp]')) && (
                        <div className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-lg mb-2 flex items-center justify-between font-mono">
                          <span className="flex items-center gap-1 font-bold">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>7+ Days: Follow-Up Ready</span>
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">{app.portalSource || 'Direct'}</span>
                        </div>
                      )}

                      {app.status === 'Rejected' && (
                        <div className="text-[10px] text-rose-300 mb-2 flex items-center gap-1 font-mono">
                          <History className="w-3 h-3" />
                          <span>Retained Rejection Log</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800 gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono truncate">
                          <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>{app.portalSource || 'Direct'}</span>
                        </span>
                        <span className="text-slate-400 group-hover:text-white flex items-center gap-0.5 shrink-0">
                          View Kit <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Application Snapshot & Raw JD Inspector Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-3xl p-5 sm:p-6 shadow-2xl relative text-left my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-700 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono font-bold text-sky-400">
                    {selectedApp.company}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    Applied: {new Date(selectedApp.appliedDate).toLocaleDateString()}
                  </span>
                  {selectedApp.portalSource && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-mono text-indigo-300">
                      {selectedApp.portalSource}
                    </span>
                  )}
                  {selectedApp.status === 'Rejected' && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold">
                      Historical Rejection
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">{selectedApp.role}</h3>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    {selectedApp.location || 'Location Unspecified'} ({selectedApp.workplaceType || 'Unspecified'})
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <DollarSign className="w-3 h-3" />
                    {selectedApp.salary || 'Undisclosed'}
                  </span>
                  {(() => {
                    const safeUrl = sanitizeExternalHttpUrl(selectedApp.jobUrl);
                    return safeUrl ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open Original Listing</span>
                      </a>
                    ) : null;
                  })()}
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedApp(null);
                  setShowRejectionForm(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-700/60 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-xl my-4 shrink-0 border border-slate-700/60">
              <button
                onClick={() => setActiveModalTab('details')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeModalTab === 'details' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Status & Stages
              </button>
              <button
                onClick={() => setActiveModalTab('snapshot')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  activeModalTab === 'snapshot' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Frozen Snapshot</span>
              </button>
              <button
                onClick={() => setActiveModalTab('rawJd')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeModalTab === 'rawJd' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cached Raw JD
              </button>
              <button
                onClick={() => setActiveModalTab('followup')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  activeModalTab === 'followup' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mail className="w-3 h-3 text-amber-400" />
                <span>Outreach Email</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {activeModalTab === 'details' && (
                <div className="space-y-4">
                  {/* Status Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Current Pipeline Stage
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {statuses.map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(selectedApp.id, st)}
                          className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer text-center ${
                            selectedApp.status === st
                              ? st === 'Rejected'
                                ? 'bg-rose-600 text-white shadow-md'
                                : 'bg-indigo-600 text-white shadow-md'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-700/60'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedApp.skillsRequired && selectedApp.skillsRequired.length > 0 && (
                    <div>
                      <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Role Skills Snapshot
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedApp.skillsRequired.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-mono"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rejection Details Form if marking as Rejected */}
                  {showRejectionForm && (
                    <form onSubmit={handleConfirmRejection} className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 space-y-3">
                      <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Log Rejection Details for Deduplication Guard</span>
                      </div>
                      <input
                        type="text"
                        value={rejectionReasonInput}
                        onChange={(e) => setRejectionReasonInput(e.target.value)}
                        placeholder="Rejection Reason (e.g. Budget Freeze, Mismatch, Position Closed)"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-rose-400"
                      />
                      <textarea
                        rows={2}
                        value={rejectionNotesInput}
                        onChange={(e) => setRejectionNotesInput(e.target.value)}
                        placeholder="Additional feedback or notes for future deduplication reference..."
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-rose-500/30 text-white text-xs focus:outline-none focus:border-rose-400"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRejectionForm(false)}
                          className="px-3 py-1 text-xs text-slate-400"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                        >
                          Confirm Rejection Log
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Past rejection log if already rejected */}
                  {selectedApp.status === 'Rejected' && selectedApp.rejectionReason && (
                    <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-xs space-y-1">
                      <span className="font-bold text-rose-300">Retained Rejection Record:</span>
                      <p className="text-slate-300">Reason: {selectedApp.rejectionReason}</p>
                      {selectedApp.rejectionNotes && <p className="text-slate-400">Notes: {selectedApp.rejectionNotes}</p>}
                    </div>
                  )}

                  {/* Notes Editor */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Personal Interview & Strategy Notes
                    </label>
                    <textarea
                      rows={3}
                      value={selectedApp.notes}
                      onChange={(e) => {
                        updateApplicationNotes(selectedApp.id, e.target.value);
                        setSelectedApp({ ...selectedApp, notes: e.target.value });
                      }}
                      placeholder="Add hiring manager notes, recruiter contact info, salary discussions..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Interview Stages Log */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Interview Stages ({selectedApp.interviewStages.length})
                    </label>
                    <div className="space-y-2 mb-3">
                      {selectedApp.interviewStages.map((stage) => (
                        <div key={stage.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs">
                          <div className="flex items-center justify-between font-bold text-white mb-1">
                            <span>{stage.stageName}</span>
                            <span className="text-[10px] font-mono text-slate-400">{stage.date}</span>
                          </div>
                          {stage.notes && <p className="text-slate-400">{stage.notes}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Add Interview Stage Form */}
                    <form onSubmit={handleAddInterview} className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2.5">
                      <span className="text-[11px] font-bold text-slate-300 block">Log Upcoming Interview</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={stageName}
                          onChange={(e) => setStageName(e.target.value)}
                          placeholder="Round (e.g. Technical System Design)"
                          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                          required
                        />
                        <input
                          type="date"
                          value={stageDate}
                          onChange={(e) => setStageDate(e.target.value)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <input
                        type="text"
                        value={stageNotes}
                        onChange={(e) => setStageNotes(e.target.value)}
                        placeholder="Interviewer names, focus areas, topics..."
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                      >
                        Add Round
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Immutable Frozen Snapshot */}
              {activeModalTab === 'snapshot' && (() => {
                const materials =
                  selectedApp.exportedMaterials && selectedApp.exportedMaterials.length > 0
                    ? selectedApp.exportedMaterials
                    : selectedApp.tailoredResumeSnapshot?.exportedMaterials || [];
                const snapshotSummary = selectedApp.tailoredResumeSnapshot?.tailoredSummary || '';
                const snapshotSkills = selectedApp.tailoredResumeSnapshot?.highlightedSkills || [];
                const snapshotCover = selectedApp.tailoredResumeSnapshot?.coverLetter || '';

                return (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>
                        This record contains an immutable frozen JSON snapshot. Any future modifications to your master resume will never alter what you submitted here.
                      </span>
                    </div>

                    {materials.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-slate-300 mb-1.5">
                          Recorded Resume Exports ({materials.length})
                        </h4>
                        <div className="space-y-1.5">
                          {materials.map((mat) => (
                            <div
                              key={mat.id}
                              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono text-[10px] font-bold mr-2">
                                  {mat.format}
                                </span>
                                <span className="text-white font-mono text-[11px] truncate">{mat.fileName}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono shrink-0">
                                {new Date(mat.exportedAt).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-slate-300">Frozen Tailored Summary</h4>
                        {snapshotSummary && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(snapshotSummary);
                              addToast({ type: 'success', message: 'Copied frozen summary.' });
                            }}
                            className="text-[11px] text-sky-400 hover:text-sky-300 font-mono cursor-pointer"
                          >
                            Copy Summary
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 bg-slate-900 p-3 rounded-xl border border-slate-800 leading-relaxed">
                        {snapshotSummary || 'No summary captured in this snapshot.'}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-300 mb-1">Frozen Highlighted Skills</h4>
                      <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-slate-900 border border-slate-800">
                        {snapshotSkills.length > 0 ? (
                          snapshotSkills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-xs font-mono">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">No skills snapshot captured.</span>
                        )}
                      </div>
                    </div>

                    {snapshotCover && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-bold text-slate-300">Frozen Cover Letter</h4>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(snapshotCover);
                              addToast({ type: 'success', message: 'Copied frozen cover letter.' });
                            }}
                            className="text-[11px] text-sky-400 hover:text-sky-300 font-mono cursor-pointer"
                          >
                            Copy Cover Letter
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-xl border border-slate-800 whitespace-pre-line leading-relaxed">
                          {snapshotCover}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Cached Raw JD */}
              {activeModalTab === 'rawJd' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
                    <span>Cached Raw Text (Permanent Offline Fallback)</span>
                    <span className="font-mono text-[10px] text-sky-400">{selectedApp.jobDescriptionRaw.length} chars</span>
                  </div>
                  <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {selectedApp.jobDescriptionRaw}
                  </pre>
                </div>
              )}

              {/* Automated Outreach / 7-Day Follow-Up Tab */}
              {activeModalTab === 'followup' && (() => {
                const email = generateFollowUpEmailContent(selectedApp);
                return (
                  <div className="space-y-3.5 text-xs">
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>7-Day Automated Outreach: Grounded in your Notice Period & CTC preferences</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Outreach Subject:
                      </label>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs select-all">
                        {email.subject}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Cold Follow-Up Body (Ready to Send):
                      </label>
                      <textarea
                        rows={8}
                        readOnly
                        value={email.body}
                        className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-sans leading-relaxed resize-none select-all focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Source: {selectedApp.portalSource || 'Direct'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${email.subject}\n\n${email.body}`);
                          setCopiedFollowUpModal(true);
                          setTimeout(() => setCopiedFollowUpModal(false), 2000);
                          addToast({ type: 'success', message: 'Follow-up email copied to clipboard!' });
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md"
                      >
                        <span>{copiedFollowUpModal ? 'Copied to Clipboard!' : 'Copy Follow-Up Email'}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 mt-3 border-t border-slate-700/80 flex items-center justify-between gap-2 shrink-0 flex-wrap">
              {confirmArchiveId === selectedApp.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300 font-medium">Remove from pipeline?</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteApplication(selectedApp.id);
                      setConfirmArchiveId(null);
                      setSelectedApp(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
                  >
                    Confirm Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmArchiveId(null)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmArchiveId(selectedApp.id)}
                  className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Archive Application</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedApp(null);
                  setShowRejectionForm(false);
                  setConfirmArchiveId(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
