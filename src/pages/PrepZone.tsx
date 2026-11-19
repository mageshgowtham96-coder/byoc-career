import React, { useState } from 'react';
import { useWizardStore } from '../store/useWizardStore';
import {
  GraduationCap,
  Code2,
  Briefcase,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  MessageSquareQuote,
  Target,
  DollarSign
} from 'lucide-react';
import { tailorResumeWithGroq, formatGroqError } from '../services/groqService';
import { buildDomainPracticeQuestions } from '../utils/domainPracticeQuestions';
import { hasStructuredCareerEvidence } from '../utils/resumeReadiness';

export const PrepZone: React.FC = () => {
  const {
    masterResume,
    selectedJobId,
    jobs,
    tailoredArtifacts,
    saveTailoredArtifact,
    groqApiKey,
    candidatePreferences,
    setActiveTab,
    addToast
  } = useWizardStore();

  const [activeTab, setActiveTabState] = useState<'domain' | 'rolespecific'>('domain');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Technical' | 'Behavioral' | 'Situational' | 'Role-Specific'>('All');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>('q-role-1');
  const [candidateNotes, setCandidateNotes] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGeneratingPrep, setIsGeneratingPrep] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const currentTailored = selectedJob ? tailoredArtifacts[selectedJob.id] || null : null;

  const hasStructuredEvidence = hasStructuredCareerEvidence(masterResume);
  const hasSkills = Boolean(masterResume && Object.values(masterResume.skills).some((items) => items.length > 0));
  const primaryDomain = selectedJob?.title || masterResume?.headline || masterResume?.experiences?.[0]?.role || 'Career profile';
  const domainQuestions = buildDomainPracticeQuestions(masterResume, selectedJob);

  const filteredDomainQuestions = domainQuestions.filter((q) =>
    selectedCategory === 'All' ? true : q.category === selectedCategory
  );

  const handleCopy = (key: string, text: string) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    addToast({ type: 'success', message: 'Copied interview talking point to clipboard.' });
  };

  const handleGenerateRolePrep = async () => {
    if (!selectedJob || !masterResume || !hasStructuredEvidence) {
      addToast({
        type: 'warning',
        message: 'Add and confirm structured career evidence in Intake, then select a target job before generating personalized interview questions.'
      });
      return;
    }
    setIsGeneratingPrep(true);
    setPrepError(null);
    try {
      if (currentTailored) {
        const questions = await generateInterviewPrepQuestionsWithGroq(selectedJob, masterResume, groqApiKey);
        saveInterviewPrepQuestions(selectedJob.id, questions);
        addToast({
          type: 'success',
          title: 'Evidence-Anchored Prep Refreshed',
          message: `Refreshed ${questions.length} role-specific questions. Your existing tailored resume and review status were preserved.`
        });
      } else {
        const artifact = await tailorResumeWithGroq(selectedJob, masterResume, groqApiKey);
        saveTailoredArtifact(selectedJob.id, artifact);
        addToast({
          type: 'success',
          title: 'Initial Tailored Kit Ready',
          message: `Generated ${artifact.interviewPrepQuestions.length} interview questions and the initial tailored application kit.`
        });
      }
    } catch (err: unknown) {
      const msg = formatGroqError(err, 'Unable to generate AI prep questions.');
      setPrepError(msg);
      addToast({ type: 'error', message: msg });
    } finally {
      setIsGeneratingPrep(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold tracking-wide uppercase flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" />
              Interview Mastery Suite
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Evidence-Anchored Preparation
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Prep-Zone & Interview Intelligence</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {hasStructuredEvidence
              ? 'Practice prompts adapt to your selected role and the structured evidence in your Master Resume.'
              : 'Generic practice only until you add and confirm structured career evidence in Intake.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-800/90 rounded-2xl border border-slate-700/80 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTabState('domain')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'domain'
                ? 'bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>General Career Practice</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTabState('rolespecific')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'rolespecific'
                ? 'bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Role-Specific Interview Kit</span>
          </button>
        </div>
      </div>

      {/* TAB 1: DOMAIN ROLE PRACTICE */}
      {activeTab === 'domain' && (
        <div className="space-y-5 animate-in fade-in">
          {/* Domain Overview Slab */}
          <div className="p-5 rounded-3xl bg-slate-800/90 border border-slate-700 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              {hasStructuredEvidence ? (
                <>
                  <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider block mb-1">
                    Active Career Profile
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>{primaryDomain || 'Master Profile Loaded'}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                        hasSkills
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      {hasSkills ? 'Skills listed in Master Resume' : 'Other career evidence recorded'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                    {hasSkills
                      ? 'Questions are based on your selected role and recorded skills, projects, education or experience.'
                      : 'Your profile includes other structured career evidence. Add skills if relevant; prompts without direct evidence remain generic.'}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block mb-1">
                    Generic Practice Mode
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>No Structured Career Evidence Yet</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono">
                      Generic Practice Only
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                    A profile may be present, but it does not yet contain structured career evidence for personalized prompts. These questions remain generic and do not describe your background. Add or review your profile in Intake to enable evidence-anchored preparation.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('intake')}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                  >
                    <span>Review Profile in Intake</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              {(['All', 'Role-Specific', 'Technical', 'Behavioral', 'Situational'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Question Flashcards Feed */}
          <div className="space-y-4">
            {filteredDomainQuestions.map((q) => {
              const isExpanded = expandedQuestionId === q.id;

              return (
                <div
                  key={q.id}
                  className={`rounded-3xl border transition-all text-left overflow-hidden ${
                    isExpanded
                      ? 'border-indigo-500/80 bg-slate-800/95 shadow-xl shadow-indigo-950/30'
                      : 'border-slate-800 bg-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <div
                    onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                    className="p-5 flex items-start justify-between gap-4 cursor-pointer"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-mono text-indigo-300 font-bold uppercase">
                          {q.category}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono text-sky-400">
                          {q.difficulty} Tier
                        </span>
                        {q.isGenericPractice ? (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300 font-semibold">
                            Generic Practice
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 font-semibold">
                            Profile Evidence Prompt
                          </span>
                        )}
                        <span className="text-xs font-mono text-slate-500">•</span>
                        <span className="text-xs font-semibold text-slate-300">{q.title}</span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-white leading-snug">
                        {q.question}
                      </h4>
                    </div>

                    <div className="shrink-0 pt-1 text-slate-400 hover:text-white">
                      <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-slate-700/60 space-y-4">
                      {/* Key Concepts */}
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                          Key Concepts
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {q.keyConcepts.map((concept, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-sky-300 text-xs font-mono"
                            >
                              {concept}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Suggested Response Framework */}
                      <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200">
                        <span className="font-bold text-indigo-300 block mb-1">
                          Recommended Answering Structure:
                        </span>
                        <p className="leading-relaxed">{q.suggestedFramework}</p>
                      </div>

                      {/* Evidence Anchor or Honest Missing-Evidence State */}
                      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 text-xs text-slate-300 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          {q.hasEvidence ? (
                            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              <span>Authentic Evidence Anchor (Your Background)</span>
                            </span>
                          ) : (
                            <span className="font-bold text-amber-300 flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 text-amber-400" />
                              <span>Master Resume Evidence Missing</span>
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={!q.hasEvidence}
                            aria-disabled={!q.hasEvidence}
                            title={
                              q.hasEvidence
                                ? 'Copy profile-backed talking point'
                                : 'Add relevant resume details in Intake to enable copying'
                            }
                            onClick={() => handleCopy(q.id, q.sampleEvidencePrompt)}
                            className={`text-[11px] flex items-center gap-1 font-mono transition ${
                              q.hasEvidence
                                ? 'text-sky-400 hover:text-sky-300 cursor-pointer'
                                : 'text-slate-500 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            {copiedKey === q.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === q.id ? 'Copied' : 'Copy Talking Point'}</span>
                          </button>
                        </div>
                        {q.hasEvidence ? (
                          <p className="leading-relaxed text-slate-200 italic font-sans bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                            {q.sampleEvidencePrompt}
                          </p>
                        ) : (
                          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="leading-relaxed text-slate-400 font-sans">
                              No recorded skill or experience details is available in your profile for this question. Configure your Master Resume in Intake before copying personalized talking points.
                            </p>
                            <button
                              type="button"
                              onClick={() => setActiveTab('intake')}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] font-semibold shrink-0 cursor-pointer self-start sm:self-auto"
                            >
                              Configure in Intake
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Interactive Answer Notepad / Self-Evaluator */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Your Talking Points / Self-Evaluation Notes:
                        </label>
                        <textarea
                          rows={3}
                          value={candidateNotes[q.id] || ''}
                          onChange={(e) =>
                            setCandidateNotes({ ...candidateNotes, [q.id]: e.target.value })
                          }
                          placeholder="Jot down how you will frame your past project milestones for this question..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs leading-relaxed focus:outline-none focus:border-indigo-500 font-sans"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ROLE-SPECIFIC INTERVIEW KIT */}
      {activeTab === 'rolespecific' && (
        <div className="space-y-5 animate-in fade-in">
          {selectedJob ? (
            <>
              {/* Selected Target Role Card */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-800 via-indigo-950/30 to-slate-800 border border-indigo-500/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono font-bold text-sky-400">
                      {selectedJob.company}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">{selectedJob.location}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">{selectedJob.salary}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {selectedJob.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    {hasStructuredEvidence
                      ? 'Role-specific preparation based on the selected job listing and your structured Master Resume evidence. Actual employer interview stages are not known.'
                      : 'Generic preparation based on the selected job listing. Add structured career evidence in Intake to personalize questions; actual employer interview stages are not known.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => setActiveTab('sourcing')}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  >
                    Change Target Job
                  </button>
                  <button
                    onClick={() => setActiveTab('customization')}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <span>View Tailored Kit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Evidence-Anchored AI Interview Questions (Groq) */}
              <div className="p-5 rounded-3xl bg-slate-800/90 border border-slate-700 space-y-3 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      <span>Evidence-Anchored AI Interview Questions ({selectedJob.company})</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Each question references a saved career-evidence item. Talking points are prompts for your review, not verified claims.
                    </p>
                  </div>

                  {hasStructuredEvidence && (
                    <button
                      type="button"
                      disabled={isGeneratingPrep || !groqApiKey.trim()}
                      onClick={() => void handleGenerateRolePrep()}
                      title={
                        !groqApiKey.trim()
                          ? 'Configure your Groq API key in Settings to generate AI prep questions'
                          : 'Synthesize role-specific questions via Groq'
                      }
                      className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isGeneratingPrep ? 'animate-spin' : ''}`} />
                      <span>
                        {isGeneratingPrep
                          ? 'Generating...'
                          : currentTailored && (currentTailored.interviewPrepQuestions?.length || 0) > 0
                          ? 'Refresh AI Questions'
                          : currentTailored ? 'Generate AI Questions' : 'Generate Interview Questions & Tailored Kit'}
                      </span>
                    </button>
                  )}
                </div>

                {prepError && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
                    <span>{prepError}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-rose-200 border border-rose-500/30 text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Check Groq Settings
                    </button>
                  </div>
                )}

                {currentTailored && (currentTailored.interviewPrepQuestions?.length || 0) > 0 ? (
                  <div className="space-y-3 pt-1">
                    {(currentTailored.interviewPrepQuestions || []).map((iq, idx) => {
                      const copyPayload = `${iq.question}\n\nTalking Points:\n${iq.suggestedTalkingPoints
                        .map((tp) => `- ${tp}`)
                        .join('\n')}\nEvidence: ${iq.authenticEvidenceRef}`;
                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold">
                                {iq.category}
                              </span>
                              <h5 className="text-xs sm:text-sm font-bold text-white leading-snug">
                                {iq.question}
                              </h5>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(`ai-prep-${idx}`, copyPayload)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono shrink-0 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === `ai-prep-${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedKey === `ai-prep-${idx}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>

                          <div className="space-y-1 pl-3 border-l-2 border-indigo-500/40">
                            {iq.suggestedTalkingPoints.map((pt, pIdx) => (
                              <p key={pIdx} className="text-xs text-slate-300 leading-relaxed">
                                • {pt}
                              </p>
                            ))}
                          </div>

                          <p className="text-[11px] text-emerald-300/90 font-mono">
                            Authentic Evidence Ref: {iq.authenticEvidenceRef}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>
                      {!hasStructuredEvidence
                        ? 'Add and confirm structured career evidence in Intake first so AI prep questions can be grounded in your actual profile.'
                        : !groqApiKey.trim()
                        ? 'No Groq API key configured. Add your key in Settings to generate AI prep questions, or use the illustrative preparation areas and General Career Practice below.'
                        : 'No AI prep questions generated for this role yet. Generate interview questions above or create a tailored kit in Customization.'}
                    </span>
                    {!hasStructuredEvidence ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('intake')}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 cursor-pointer self-start sm:self-auto"
                      >
                        Go to Intake
                      </button>
                    ) : !groqApiKey.trim() ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('settings')}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-semibold text-[11px] shrink-0 cursor-pointer self-start sm:self-auto"
                      >
                        Configure Groq Key
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Illustrative interview preparation areas; actual employer stages are not known. */}
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-sky-400" />
                    <span>Possible Interview Preparation Areas</span>
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Illustrative preparation only. BYOC does not know this employer's actual interview stages or timings.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-2 text-left">
                    <span className="text-[10px] font-mono uppercase font-bold text-sky-400">Area 01 · Varies by employer</span>
                    <h5 className="text-sm font-bold text-white">Introductory Conversation</h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Be ready to explain your background, interest in the {selectedJob.title} role, availability and questions about the responsibilities.
                    </p>
                    <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      <strong>Preparation:</strong> Give a concise overview using only details recorded in your Master Resume.
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-2 text-left">
                    <span className="text-[10px] font-mono uppercase font-bold text-indigo-400">Area 02 · Varies by employer</span>
                    <h5 className="text-sm font-bold text-white">Role-Related Tasks &amp; Knowledge</h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Review the requirements explicitly stated in the job listing and prepare to explain how you would approach relevant tasks.
                    </p>
                    <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      <strong>Focus:</strong> {selectedJob.skillsRequired.slice(0, 3).join(', ') || selectedJob.title}. Distinguish skills you have used from those you are still learning.
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-2 text-left">
                    <span className="text-[10px] font-mono uppercase font-bold text-purple-400">Area 03 · Varies by employer</span>
                    <h5 className="text-sm font-bold text-white">Situational &amp; Behavioral Discussion</h5>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Prepare examples of problem solving, learning, communication or handling a difficult task that are relevant to this role.
                    </p>
                    <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      <strong>Focus:</strong> Use the STAR structure where it fits, and be clear about your own contribution and the actual outcome.
                    </div>
                  </div>
                </div>
              </div>

              {/* Reverse-Interview Questions (To Ask the Interviewer) */}
              <div className="p-5 rounded-3xl bg-slate-800/90 border border-slate-700 space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <MessageSquareQuote className="w-4 h-4 text-emerald-400" />
                    <span>Questions to Ask the Interviewer</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Role Discovery Prompts
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Use these questions to clarify responsibilities, expectations, evaluation and available support:
                </p>

                <div className="space-y-2.5 pt-1">
                  {[
                    `"What are the main responsibilities and expected outcomes for the ${selectedJob.title} role in the first 90 days?"`,
                    `"How is performance evaluated for this role, and what training or support is available to someone joining the team?"`,
                    `"What are the most common challenges someone in this role should expect, and how does the team help address them?"`
                  ].map((qText, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-900/80 border border-slate-700/80 flex items-start justify-between gap-3"
                    >
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">{qText}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(`rev-${idx}`, qText)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono shrink-0 flex items-center gap-1 transition cursor-pointer"
                      >
                        {copiedKey === `rev-${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === `rev-${idx}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compensation & Negotiation Anchors */}
              <div className="p-5 rounded-3xl bg-slate-800/90 border border-slate-700 space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Compensation &amp; Offer Review Anchors</span>
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    Listing: {selectedJob.salary}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Target Base Range</span>
                    <p className="text-sm font-bold text-white">{candidatePreferences.expectedCtc || 'Not configured'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Clarify guaranteed base salary vs variable performance bonuses before final rounds.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Notice Period</span>
                    <p className="text-sm font-bold text-sky-400">{candidatePreferences.noticePeriod || 'Not configured'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Confirm start window, buyout rules, or transition timelines upfront.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Equity &amp; Benefits</span>
                    <p className="text-sm font-bold text-purple-300">Vesting &amp; Terms</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Verify vesting schedules, strike/valuation clarity, and relocation or remote stipends.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 rounded-3xl bg-slate-800/50 border border-slate-700 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                <Briefcase className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">No Target Role Currently Selected</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Select or paste a target role in Sourcing to unlock tailored interview round briefs and talking points.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('sourcing')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Explore Roles in Sourcing
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
