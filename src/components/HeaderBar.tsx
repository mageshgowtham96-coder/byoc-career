import React from 'react';
import { syncVaultFromStoreNow, useWizardStore } from '../store/useWizardStore';
import { ChakraLogo } from './ChakraLogo';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuthLocale } from '../i18n/authLocale';
import { Zap, Key, AlertTriangle, RefreshCw } from 'lucide-react';

export const HeaderBar: React.FC = () => {
  const { geminiApiKey, isLiveApiMode, setActiveTab, user, vaultPersistenceError } = useWizardStore();
  const { t } = useAuthLocale();

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
            title={t('Configure Gemini BYOK in Settings')}
          >
            {isLiveActive ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('Gemini Connected')}</span>
              </>
            ) : (
              <>
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">{t('API Key Required')}</span>
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
              title={t('Open Workspace Settings')}
            >
              <span className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white uppercase">
                {user.name?.trim().charAt(0) || 'W'}
              </span>
              <span className="hidden sm:inline font-medium truncate max-w-[110px]">
                {user.name?.trim() ? user.name.trim().split(' ')[0] : t('Workspace')}
              </span>
            </button>
          )}
        </div>
      </div>

      {vaultPersistenceError && (
        <div role="alert" className="max-w-7xl mx-auto mt-2 w-full rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
            <p className="flex-1 text-[11px] leading-relaxed text-rose-100">{vaultPersistenceError}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void syncVaultFromStoreNow()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30"
              >
                <RefreshCw className="h-3 w-3" />
                {t('Retry Save')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/15"
              >
                {t('Settings')}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
