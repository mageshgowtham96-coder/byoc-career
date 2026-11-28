import React from 'react';
import { useWizardStore } from '../store/useWizardStore';
import { ChakraLogo } from './ChakraLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { Zap, Key } from 'lucide-react';

export const HeaderBar: React.FC = () => {
  const { geminiApiKey, isLiveApiMode, setActiveTab, user } = useWizardStore();

  const isLiveActive = Boolean(geminiApiKey && geminiApiKey.trim().length > 0 && isLiveApiMode);

  return (
    <header
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      className="sticky top-0 z-40 w-full bg-[#070B14]/95 backdrop-blur-md border-b border-slate-800/90 px-4 pb-2.5"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left Brand Zone */}
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer group select-none text-left whitespace-nowrap shrink-0"
        >
          <ChakraLogo size={32} spin={false} glow={true} />
          <span className="font-extrabold text-base tracking-tight text-white group-hover:text-sky-400 transition">
            BYOC
          </span>
        </button>

        {/* Right Utility & Profile Zone */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap shrink-0 ${
              isLiveActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Configure Gemini API access in Settings"
          >
            {isLiveActive ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gemini Connected</span>
              </>
            ) : (
              <>
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">API Key Required</span>
                <span className="xs:hidden">BYOK</span>
              </>
            )}
          </button>

          <PWAInstallButton />

          {user && (
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg bg-[#0F172A] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs transition cursor-pointer whitespace-nowrap shrink-0"
              title="Open Workspace Settings"
            >
              <span className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white uppercase">
                {user.name?.trim().charAt(0) || 'W'}
              </span>
              <span className="hidden sm:inline font-medium truncate max-w-[110px]">
                {user.name?.trim() ? user.name.trim().split(' ')[0] : 'Workspace'}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
