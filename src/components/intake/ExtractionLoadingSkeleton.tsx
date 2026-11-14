import React, { useEffect, useState } from 'react';
import { ChakraLogo } from '../ChakraLogo';
import { Sparkles, FileText, Cpu, CheckCircle2 } from 'lucide-react';

interface ExtractionLoadingSkeletonProps {
  fileName?: string;
  isProcessing: boolean;
  stageMessage?: string;
}

const EXTRACTION_STAGES = [
  { label: 'Ingesting binary document stream & font tables', progress: 25 },
  { label: 'Reconstructing text coordinates & layout bounding boxes', progress: 55 },
  { label: 'Parsing career milestones, skills & contact metadata', progress: 85 },
  { label: 'Auto-filling structured application schema', progress: 98 }
];

export const ExtractionLoadingSkeleton: React.FC<ExtractionLoadingSkeletonProps> = ({
  fileName = 'Resume_Document.pdf',
  isProcessing,
  stageMessage
}) => {
  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setCurrentStageIdx(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStageIdx((prev) => (prev < EXTRACTION_STAGES.length - 1 ? prev + 1 : prev));
    }, 450);

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  const currentStage = EXTRACTION_STAGES[currentStageIdx];

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-300">
      {/* Active Processing Banner with Sudarsana Chakra Scanner Pulse */}
      <div className="relative overflow-hidden p-5 rounded-3xl bg-slate-900/90 border border-indigo-500/50 shadow-2xl backdrop-blur-md">
        {/* Animated Scanner Laser Sweep */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-[pulse_1.5s_ease-in-out_infinite]" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40">
              <ChakraLogo size={28} spin={true} glow={true} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-sky-400 animate-spin" />
                  <span>Local Client Extraction Engine</span>
                </span>
                <span className="px-2 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                  {currentStage.progress}%
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5 flex items-center gap-2 truncate max-w-xs sm:max-w-md">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{fileName}</span>
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-mono text-emerald-400">
            <Sparkles className="w-3.5 h-3.5 animate-bounce" />
            <span>Parsing Text Stream...</span>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="text-indigo-300 truncate font-sans">
              {stageMessage || currentStage.label}
            </span>
            <span>{currentStage.progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300 ease-out relative"
              style={{ width: `${currentStage.progress}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {/* Shimmering Skeleton Form Placeholders */}
      <div className="p-6 rounded-3xl bg-slate-800/40 border border-slate-700/60 space-y-5 animate-pulse">
        {/* Contact Details Skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-28 bg-slate-700/60 rounded-md" />
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
            <div className="h-5 w-48 bg-slate-700/80 rounded-lg" />
            <div className="flex gap-3">
              <div className="h-3 w-32 bg-slate-700/50 rounded-md" />
              <div className="h-3 w-24 bg-slate-700/50 rounded-md" />
              <div className="h-3 w-28 bg-slate-700/50 rounded-md" />
            </div>
          </div>
        </div>

        {/* Professional Summary Skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-36 bg-slate-700/60 rounded-md" />
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="h-3 w-full bg-slate-700/60 rounded-md" />
            <div className="h-3 w-11/12 bg-slate-700/60 rounded-md" />
            <div className="h-3 w-4/5 bg-slate-700/50 rounded-md" />
          </div>
        </div>

        {/* Work Experience Milestones Skeleton */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <div className="h-3 w-40 bg-slate-700/60 rounded-md" />
            <div className="h-3 w-20 bg-slate-700/40 rounded-md" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
                <div className="flex justify-between items-start">
                  <div className="h-4 w-36 bg-slate-700/80 rounded-md" />
                  <div className="h-3 w-16 bg-slate-700/50 rounded-md" />
                </div>
                <div className="h-3 w-24 bg-slate-700/50 rounded-md" />
                <div className="space-y-1.5 pt-1">
                  <div className="h-2.5 w-full bg-slate-700/40 rounded-md" />
                  <div className="h-2.5 w-5/6 bg-slate-700/40 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills Tags Skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-24 bg-slate-700/60 rounded-md" />
          <div className="flex flex-wrap gap-2">
            {[20, 24, 16, 28, 20, 22].map((w, idx) => (
              <div key={idx} className={`h-6 w-${w} bg-slate-700/50 rounded-lg`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
