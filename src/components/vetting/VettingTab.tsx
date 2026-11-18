import React, { useState } from 'react';
import { useWizardStore } from '../../store/useWizardStore';
import { vetJobWithGroq, formatGroqError } from '../../services/groqService';
import { verifyJobPosting } from '../../services/jobVerificationService';
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
    selectedJobId,
    jobs,
    masterResume,
    updateJobVetting,
    updateJobVerification,
    groqApiKey,
    setActiveTab,
    addToast
  } = useWizardStore();

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;
  const [isVettingLoading, setIsVettingLoading] = useState(false);
  const [vettingError, setVettingError] = useState<string | null>(null);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const runVacancyCheck = async () => {
    if (!selectedJob) return;
    setIsVerificationLoading(true);
    setVerificationError(null);
    try {
      const evidence = await verifyJobPosting(selectedJob);
      updateJobVerification(selectedJob.id, evidence);
      addToast({
        type: evidence.status === 'confirmed' ? 'success' : 'warning',
        title: 'Vacancy Evidence Updated',
        message: evidence.status === 'confirmed'
          ? 'A matching public Greenhouse record was found. Employer identity is still unverified.'
          : evidence.explanation
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'The public posting check could not be completed.';
      setVerificationError(message);
      addToast({ type: 'warning', title: 'Vacancy Check Incomplete', message });
    } finally {
      setIsVerificationLoading(false);
    }
  };

  const runVetting = async () => {
    if (!selectedJob) return;

    setIsVettingLoading(true);
    setVettingError(null);
    try {
      const vetting = await vetJobWithGroq(
        selectedJob,
        masterResume,
        groqApiKey
      );
      updateJobVetting(selectedJob.id, vetting);
      addToast({
        type: 'success',
        title: 'Vetting Report Generated',
        message: `Recommendation: ${vetting.recommendation}`
      });
    } catch (err: unknown) {
      const msg = formatGroqError(err, 'Vetting evaluation failed.');
      setVettingError(msg);
      addToast({ type: 'error', message: msg });
    } finally {
      setIsVettingLoading(false);
    }
  };

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
  const verification = __SELECTED_VERIFICATION__

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
          {vetting && (
            <button
              type="button"
              onClick={() => void runVetting()}
              disabled={isVettingLoading || !groqApiKey}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVettingLoading ? 'animate-spin' : ''}`} />
              <span>Re-Vet</span>
            </button>
          )}

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

      <p className="text-[11px] text-slate-400 leading-relaxed">
        AI career-fit guidance only — this report does not independently verify an employer or prove that a vacancy is genuine. Confirm openings through the employer’s official careers site.
      </p>

      <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-sky-300" />
              Public vacancy evidence
            </h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-400">
              Checks for a matching public Greenhouse posting record. It does not certify the employer, guarantee the role is open, or assess offer legitimacy. Unsupported job boards require manual review.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runVacancyCheck()}
            disabled={isVerificationLoading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs font-bold text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isVerificationLoading ? 'animate-spin' : ''}`} />
            {isVerificationLoading ? 'Checking public record…' : verification ? 'Recheck posting' : 'Check public posting'}
          </button>
        </div>

        {verificationError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{verificationError}</p>}

        {verification ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">
                {{
                  confirmed: 'Public ATS record found',
                  expired: 'ATS record found — deadline passed',
                  mismatch: 'Posting details differ',
                  not_found: 'No matching public record',
                  manual_review: 'Manual review required',
                  check_failed: 'Check could not complete'
                }[verification.status]}
              </span>
              <span className="text-[10px] text-slate-500">
                Checked {new Date(verification.checkedAt).toLocaleString()}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">{verification.explanation}</p>
            {(verification.officialTitle || verification.officialCompany) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div><p className="text-[10px] uppercase tracking-wide text-slate-500">ATS title</p><p className="mt-0.5 text-xs text-white">{verification.officialTitle || 'Not supplied'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wide text-slate-500">ATS company</p><p className="mt-0.5 text-xs text-white">{verification.officialCompany || 'Not supplied'}</p></div>
                {verification.firstPublishedAt && <div><p className="text-[10px] uppercase tracking-wide text-slate-500">First published</p><p className="mt-0.5 text-xs text-slate-200">{verification.firstPublishedAt}</p></div>}
                {verification.updatedAt && <div><p className="text-[10px] uppercase tracking-wide text-slate-500">ATS last updated</p><p className="mt-0.5 text-xs text-slate-200">{verification.updatedAt}</p></div>}
                {verification.applicationDeadline && <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Application deadline</p><p className="mt-0.5 text-xs text-slate-200">{verification.applicationDeadline}</p></div>}
                {verification.postingId && <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Public posting ID</p><p className="mt-0.5 text-xs font-mono text-slate-200">{verification.postingId}</p></div>}
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-[11px]">
              {verification.evidenceUrl && <a href={verification.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">Open ATS evidence</a>}
              <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">Open original posting</a>
            </div>
            <p className="text-[10px] font-semibold text-amber-200">Employer identity: Not verified</p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500">Not checked yet. BYOC does not run public ATS checks automatically.</p>
        )}

        <div className="border-t border-slate-800 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Local description risk signals</p>
          {verification?.riskFlags.length ? (
            <ul className="mt-2 space-y-1.5">{verification.riskFlags.map((flag, index) => <li key={index} className="flex gap-2 text-[11px] leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{flag}</li>)}</ul>
          ) : (
            <p className="mt-1 text-[11px] text-slate-500">
              {verification ? 'No predefined risk phrases were found. This is not a safety guarantee.' : 'Risk phrases are checked locally when you run the public posting check.'}
            </p>
          )}
        </div>
      </section>

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
            disabled={!groqApiKey}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition cursor-pointer flex items-center gap-2 mx-auto disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Analysis with Groq</span>
          </button>
        </div>
      ) : (
        <section className="p-6 sm:p-8 rounded-2xl bg-[#0F172A] border border-slate-800 max-w-2xl mx-auto my-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white mb-1">Ready for an AI Career-Fit Review?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              No request is sent until you choose to run this review. BYOC will send the selected job details and, if available, your Master Resume headline, summary, skills, and work-experience evidence to Groq using your configured API key. Your contact details are not included.
            </p>
            <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
              This is AI-generated guidance, not independent employer or vacancy verification. Check the employer and active job posting directly before sharing personal information or applying.
            </p>
          </div>
          {!groqApiKey && (
            <p className="text-xs text-amber-300">Add your Groq API key in Settings to enable this optional review.</p>
          )}
          <button
            type="button"
            onClick={() => void runVetting()}
            disabled={!groqApiKey || isVettingLoading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition cursor-pointer disabled:opacity-50"
          >
            Run AI Vetting
          </button>
        </section>
      )}
    </div>
  );
};
