import React from 'react';
import { useWizardStore } from '../store/useWizardStore';
import type { ActiveTab } from '../types';
import { useAuthLocale } from '../i18n/authLocale';
import {
  LayoutDashboard,
  Search,
  CheckCircle,
  Wand2,
  KanbanSquare,
  Settings,
  FileText,
  GraduationCap,
  ShieldCheck,
  FileSearch
} from 'lucide-react';

interface NavItem {
  id: ActiveTab;
  label: string;
  mobileLabel: string;
  icon: React.ElementType;
  badge?: number | string;
}

export const NavigationShell: React.FC = () => {
  const { activeTab, setActiveTab, masterResume, selectedJobId, applications, jobs, user } = useWizardStore();
  const { t } = useAuthLocale();

  const appCount = applications.length;
  const hasResume = Boolean(masterResume && (masterResume.rawText.length > 20 || masterResume.experiences.length > 0));

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
    { id: 'intake', label: 'Master Intake', mobileLabel: 'Intake', icon: FileText, badge: hasResume ? undefined : '•' },
    { id: 'sourcing', label: 'Job Sourcing', mobileLabel: 'Jobs', icon: Search, badge: jobs.length > 0 ? jobs.length : undefined },
    { id: 'vetting', label: 'Role Vetting', mobileLabel: 'Vet', icon: CheckCircle, badge: selectedJobId ? 1 : undefined },
    { id: 'customization', label: 'Tailor Kit', mobileLabel: 'Tailor', icon: Wand2 },
    { id: 'tracking', label: 'Applications', mobileLabel: 'Track', icon: KanbanSquare, badge: appCount > 0 ? appCount : undefined },
    { id: 'prepzone', label: 'Prep-Zone', mobileLabel: 'Prep', icon: GraduationCap },
    { id: 'documents', label: 'PDF Workspace', mobileLabel: 'PDF', icon: FileSearch },
    { id: 'settings', label: 'Settings & Docs', mobileLabel: 'Setup', icon: Settings }
  ];

  return (
    <>
      {/* Desktop Left Workspace Rail */}
      <aside
        aria-label={t('Workspace navigation')}
        className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-[57px] md:h-[calc(100vh-57px)] md:overflow-y-auto bg-[#0A0F1C] border-r border-slate-800/90 p-4 justify-between"
      >
        <div className="space-y-1.5">
          <div className="px-2.5 pb-2 mb-2 border-b border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400">{t('Career Pipeline')}</span>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <span className="truncate">{t(item.label)}</span>
                </span>
                {item.badge !== undefined && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-4 mt-6 border-t border-slate-800/80 px-2 space-y-1 text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{t('AES-256-GCM Vault')}</span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {user?.email || t('Local Encrypted Session')}
          </p>
        </div>
      </aside>

      {/* Mobile Compact Bottom Navigation Bar (<= 64px height) */}
      <nav
        aria-label={t('Mobile navigation')}
        style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom, 0px))' }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0A0F1C]/95 backdrop-blur-xl border-t border-slate-800 px-1 pt-1"
      >
        <div className="w-full max-w-lg mx-auto flex items-center justify-between">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                aria-label={t(item.label)}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 min-w-0 min-h-[44px] flex flex-col items-center justify-center py-1 px-0.5 rounded-lg transition relative cursor-pointer ${
                  isActive ? 'text-sky-400 font-semibold' : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {typeof item.badge === 'number' && (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] px-1 text-[9px] font-mono tabular-nums font-bold rounded-full bg-indigo-600 text-white text-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] mt-0.5 whitespace-nowrap truncate max-w-full ${isActive ? 'text-white' : 'text-slate-400'}`}>
                  {t(item.mobileLabel)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
