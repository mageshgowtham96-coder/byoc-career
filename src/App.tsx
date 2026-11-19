/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useWizardStore } from './store/useWizardStore';
import { LocalAuthGate } from './components/LocalAuthGate';
import { BiometricSecurityGate } from './components/BiometricSecurityGate';
import { HeaderBar } from './components/HeaderBar';
import { NavigationShell } from './components/NavigationShell';
import { ToastContainer } from './components/ToastContainer';
import { WifiOff } from 'lucide-react';
import type { ActiveTab } from './types';
import { includeVisitedTab } from './utils/visitedTabs';

// Load each workspace only when the user first opens it. Previously visited tabs
// remain mounted (hidden) so switching tabs does not discard unfinished UI state.
const DashboardTab = lazy(() => import('./components/dashboard/DashboardTab').then((m) => ({ default: m.DashboardTab })));
const IntakeTab = lazy(() => import('./components/intake/IntakeTab').then((m) => ({ default: m.IntakeTab })));
const SourcingTab = lazy(() => import('./components/sourcing/SourcingTab').then((m) => ({ default: m.SourcingTab })));
const VettingTab = lazy(() => import('./components/vetting/VettingTab').then((m) => ({ default: m.VettingTab })));
const CustomizationTab = lazy(() => import('./components/customization/CustomizationTab').then((m) => ({ default: m.CustomizationTab })));
const TrackingTab = lazy(() => import('./components/tracking/TrackingTab').then((m) => ({ default: m.TrackingTab })));
const PrepZone = lazy(() => import('./pages/PrepZone').then((m) => ({ default: m.PrepZone })));
const SettingsTab = lazy(() => import('./components/settings/SettingsTab').then((m) => ({ default: m.SettingsTab })));
const DocumentsTab = lazy(() => import('./components/DocumentsTab').then((m) => ({ default: m.DocumentsTab })));

const TabLoadingFallback: React.FC = () => (
  <div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center">
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
      Loading workspace…
    </div>
  </div>
);

export default function App() {
  const { activeTab, vaultPersistenceError } = useWizardStore();
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<ActiveTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setVisitedTabs((current) => includeVisitedTab(current, activeTab));
  }, [activeTab]);

  const shouldRenderTab = (tab: ActiveTab) => visitedTabs.has(tab) || activeTab === tab;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  useEffect(() => {
    if (!vaultPersistenceError) return;
    const preventUnsavedClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnsavedClose);
    return () => window.removeEventListener('beforeunload', preventUnsavedClose);
  }, [vaultPersistenceError]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <LocalAuthGate>
      <BiometricSecurityGate>
        <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative">
          {/* Real-time Offline Connectivity Banner */}
          {isOffline && (
            <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold text-center flex items-center justify-center gap-2 sticky top-0 z-50">
              <WifiOff className="w-4 h-4" />
              <span>Offline Mode Active — Running strictly from local vault storage</span>
            </div>
          )}

          {/* Global Toast System */}
          <ToastContainer />

          {/* Header Bar */}
          <HeaderBar />

          {/* Desktop Sidebar + Main Workspace */}
          <div className="flex-1 flex w-full max-w-[1440px] mx-auto">
            <NavigationShell />

            <main
              style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
              className="flex-1 min-w-0 px-4 pt-5 sm:px-6 lg:px-8 md:pb-10"
            >
              <div className={activeTab === 'dashboard' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('dashboard') && <Suspense fallback={<TabLoadingFallback />}><DashboardTab /></Suspense>}
              </div>
              <div className={activeTab === 'intake' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('intake') && <Suspense fallback={<TabLoadingFallback />}><IntakeTab /></Suspense>}
              </div>
              <div className={activeTab === 'sourcing' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('sourcing') && <Suspense fallback={<TabLoadingFallback />}><SourcingTab /></Suspense>}
              </div>
              <div className={activeTab === 'vetting' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('vetting') && <Suspense fallback={<TabLoadingFallback />}><VettingTab /></Suspense>}
              </div>
              <div className={activeTab === 'customization' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('customization') && <Suspense fallback={<TabLoadingFallback />}><CustomizationTab /></Suspense>}
              </div>
              <div className={activeTab === 'tracking' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('tracking') && <Suspense fallback={<TabLoadingFallback />}><TrackingTab /></Suspense>}
              </div>
              <div className={activeTab === 'prepzone' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('prepzone') && <Suspense fallback={<TabLoadingFallback />}><PrepZone /></Suspense>}
              </div>
              <div className={activeTab === 'documents' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('documents') && <Suspense fallback={<TabLoadingFallback />}><DocumentsTab /></Suspense>}
              </div>
              <div className={activeTab === 'settings' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                {shouldRenderTab('settings') && <Suspense fallback={<TabLoadingFallback />}><SettingsTab /></Suspense>}
              </div>
            </main>
          </div>
        </div>
      </BiometricSecurityGate>
    </LocalAuthGate>
  );
}
