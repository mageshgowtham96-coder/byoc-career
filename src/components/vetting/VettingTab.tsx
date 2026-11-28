import React, { useState, useEffect } from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { vetJobWithGemini, formatGeminiError } from '../../services/geminiService';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search
} from 'lucide-react';

export const VettingTab: React.FC = () => {
  const {
    activeTab,
    selectedJobId,
    jobs,
    masterResume,
    updateJobVetting,
    geminiApiKey,
    setActiveTab,
    addToast
  } = useWizardStore();

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const [isVettingLoading, setIsVettingLoading] = useState(false);
  const [vettingError, setVettingError] = useState<string | null>(null);

  const runVetting = async () => {
    if (!selectedJob) return;

    setIsVettingLoading(true);
    setVettingError(null);
    try {
      const vetting = await vetJobWithGemini(
        selectedJob,
        masterResume,
        geminiApiKey
      );
      updateJobVetting(selectedJob.id, vetting);
      addToast({
        type: 'success',
        title: 'Vetting Report Generated',
        message: `Recommendation: ${vetting.recommendation}`
      });
    } catch (err: unknown) {
      const msg = formatGeminiError(err, 'Vetting evaluation failed.');
      setVettingError(msg);
      addToast({ type: 'error', message: msg });
    } finally {
      setIsVettingLoading(false);
    }
  };

  // Auto-run vetting only when user opens the Role Vetting tab
  useEffect(() => {
    if (activeTab === 'vetting' && selectedJob && !selectedJob.vetting) {
      void runVetting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedJobId]);

  // Action Gate Check
  if (!selectedJob) {
    return (
      <div className="space-y-6 pb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sky-400" />
            <span>Opportunity Vetting & Risk Audit</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Honest culture, compensation, and requirement gap audit grounded in your Master Resume.
          </p>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-[#0F172A] border border-slate-800 text-center max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">
            No Opportunity Selected
          </h3>
          <p className="text-xs text-slate-400 mb-5 leading-relaxed">
            Select a live opening or paste a target Job Description in Sourcing first to run culture risk analysis and skill gap auditing.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('sourcing')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center gap-2 mx-auto"
          >
            <span>Browse Opportunities in Sourcing</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const vetting = selectedJob.vetting;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sky-400" />
            <span>Opportunity Vetting Audit</span>
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
            <span className="font-bold text-white">{selectedJob.title}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-sky-400 font-mono">{selectedJob.company}</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400">{selectedJob.workplaceType}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void runVetting()}
            disabled={isVettingLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVettingLoading ? 'animate-spin' : ''}`} />
            <span>Re-Vet</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('customization')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tailor Kit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isVettingLoading ? (
        <div className="p-10 sm:p-12 rounded-2xl bg-[#0F172A] border border-slate-800 text-center">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Running Structural & Cultural Audit...</h3>
          <p className="text-xs text-slate-400">Evaluating role risks, compensation clarity, and verified resume alignment.</p>
        </div>
      ) : vetting ? (
        <div className="space-y-5">
          {/* Executive Verdict Banner */}
          <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1.5">
                  Overall Audit Verdict
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wide border ${
                      vetting.recommendation === 'Strong Match'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : vetting.recommendation === 'Selective Apply'
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    }`}
                  >
                    {vetting.recommendation}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    Culture Alignment:{' '}
                    <strong className="text-sky-400 font-mono tabular-nums">{vetting.cultureFit}%</strong>
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                  {vetting.summaryVerdict}
                </p>
              </div>

              {/* Fit Index Box */}
              <div className="shrink-0 flex items-center gap-3 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Fit Index</span>
                  <span className="text-2xl font-black text-white font-mono tabular-nums">
                    {vetting.cultureFit}/100
                  </span>
                </div>
                <div className="w-12 h-12 rounded-full border-4 border-slate-700 flex items-center justify-center font-bold text-xs text-sky-400 font-mono tabular-nums relative">
                  <div
                    className="absolute inset-0 rounded-full border-4 border-indigo-500"
                    style={{ clipPath: `polygon(0 0, 100% 0, 100% ${vetting.cultureFit}%, 0 ${vetting.cultureFit}%)` }}
                  />
                  <span>{vetting.cultureFit}%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Red Flags & Green Flags Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
              <div className="flex items-center gap-2 mb-3 text-rose-400 font-bold text-xs uppercase tracking-wider tabular-nums">
                <AlertTriangle className="w-4 h-4" />
                <span>Friction & Risk Signals ({vetting.redFlags.length})</span>
              </div>
              <ul className="space-y-2">
                {vetting.redFlags.map((flag, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800/90">
                    <span className="text-rose-400 font-mono font-bold text-xs shrink-0 mt-0.5">!</span>
                    <span className="leading-snug">{flag}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800">
              <div className="flex items-center gap-2 mb-3 text-emerald-400 font-bold text-xs uppercase tracking-wider tabular-nums">
                <CheckCircle2 className="w-4 h-4" />
                <span>Positive Signals ({vetting.greenFlags.length})</span>
              </div>
              <ul className="space-y-2">
                {vetting.greenFlags.map((flag, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800/90">
                    <span className="text-emerald-400 font-mono font-bold text-xs shrink-0 mt-0.5">✓</span>
                    <span className="leading-snug">{flag}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Gap Analysis Slab */}
          <section className="p-5 sm:p-6 rounded-2xl bg-[#0F172A] border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              <span>Skill & Evidence Gap Breakdown</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Comparison of your verified Master Resume evidence against job requirements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/20">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide block mb-2.5">
                  Strong Alignments
                </span>
                <ul className="space-y-1.5">
                  {vetting.gapAnalysis.strongAlignments.length > 0 ? (
                    vetting.gapAnalysis.strongAlignments.map((skill, i) => (
                      <li key={i} className="text-xs text-emerald-200 font-mono flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0">✓</span>
                        <span>{skill}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-500">None highlighted</li>
                  )}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-sky-500/20">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wide block mb-2.5">
                  Addressable Gaps
                </span>
                <ul className="space-y-1.5">
                  {vetting.gapAnalysis.addressableGaps.length > 0 ? (
                    vetting.gapAnalysis.addressableGaps.map((skill, i) => (
                      <li key={i} className="text-xs text-sky-200 font-mono flex items-start gap-1.5">
                        <span className="text-sky-400 shrink-0">~</span>
                        <span>{skill}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-500">None detected</li>
                  )}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-rose-500/20">
                <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wide block mb-2.5">
                  Potential Deficits
                </span>
                <ul className="space-y-1.5">
                  {vetting.gapAnalysis.criticalMissing.length > 0 ? (
                    vetting.gapAnalysis.criticalMissing.map((skill, i) => (
                      <li key={i} className="text-xs text-rose-200 font-mono flex items-start gap-1.5">
                        <span className="text-rose-400 shrink-0">✗</span>
                        <span>{skill}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-500">None detected</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* Growth & Salary Insights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Growth Trajectory
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {vetting.growthTrajectory}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                Salary Competitiveness
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {vetting.salaryCompetitiveness}
              </p>
            </div>
          </div>
        </div>
      ) : vettingError ? (
        <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-800/40 text-center max-w-lg mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">Vetting Evaluation Unsuccessful</h3>
          <p className="text-xs text-rose-300 mb-5 leading-relaxed font-mono">
            {vettingError}
          </p>
          <button
            type="button"
            onClick={() => void runVetting()}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition cursor-pointer flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Analysis with Gemini</span>
          </button>
        </div>
      ) : null}
    </div>
  );
};
