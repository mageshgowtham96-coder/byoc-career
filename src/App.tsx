/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useWizardStore } from './store/useWizardStore';
import { LocalAuthGate } from './components/LocalAuthGate';
import { BiometricSecurityGate } from './components/BiometricSecurityGate';
import { HeaderBar } from './components/HeaderBar';
import { NavigationShell } from './components/NavigationShell';
import { ToastContainer } from './components/ToastContainer';
import { DashboardTab } from './components/dashboard/DashboardTab';
import { IntakeTab } from './components/intake/IntakeTab';
import { SourcingTab } from './components/sourcing/SourcingTab';
import { VettingTab } from './components/vetting/VettingTab';
import { CustomizationTab } from './components/customization/CustomizationTab';
import { TrackingTab } from './components/tracking/TrackingTab';
import { PrepZone } from './pages/PrepZone';
import { SettingsTab } from './components/settings/SettingsTab';
import { WifiOff } from 'lucide-react';

export default function App() {
  const { activeTab } = useWizardStore();
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

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
                <DashboardTab />
              </div>
              <div className={activeTab === 'intake' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <IntakeTab />
              </div>
              <div className={activeTab === 'sourcing' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <SourcingTab />
              </div>
              <div className={activeTab === 'vetting' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <VettingTab />
              </div>
              <div className={activeTab === 'customization' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <CustomizationTab />
              </div>
              <div className={activeTab === 'tracking' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <TrackingTab />
              </div>
              <div className={activeTab === 'prepzone' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <PrepZone />
              </div>
              <div className={activeTab === 'settings' ? 'block animate-in fade-in duration-150' : 'hidden'}>
                <SettingsTab />
              </div>
            </main>
          </div>
        </div>
      </BiometricSecurityGate>
    </LocalAuthGate>
  );
}
