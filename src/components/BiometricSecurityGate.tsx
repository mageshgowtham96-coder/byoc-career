import React, { useState, useEffect } from 'react';
import {
  useWizardStore,
  restoreVaultDataToStore
} from '../store/useWizardStore';
import { ChakraLogo } from './ChakraLogo';
import {
  decryptVault,
  hasActiveVaultKey,
  readStoredVaultEnvelope
} from '../utils/cryptoVault';
import {
  Fingerprint,
  Shield,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut
} from 'lucide-react';

export const BiometricSecurityGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    isAuthenticated,
    isBiometricLocked,
    unlockBiometric,
    signOut
  } = useWizardStore();

  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');
  const [showPassphraseFallback, setShowPassphraseFallback] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const storedEnvelope = readStoredVaultEnvelope();

  useEffect(() => {
    if (isAuthenticated && user?.biometricEnabled && isBiometricLocked) {
      if (hasActiveVaultKey() && storedEnvelope) {
        void triggerBiometricAuth();
      } else {
        setShowPassphraseFallback(true);
        setErrorMessage(
          !storedEnvelope
            ? 'Encrypted vault envelope is missing on this device. Return to Vault Unlock to recover or import a backup.'
            : 'Cold start requires your Vault Passphrase to unwrap the AES-256-GCM encryption key.'
        );
      }
    }
  }, [isBiometricLocked, isAuthenticated]);

  if (!isAuthenticated || !user?.biometricEnabled || !isBiometricLocked) {
    return <>{children}</>;
  }

  const triggerBiometricAuth = async () => {
    setErrorMessage('');
    const envelope = readStoredVaultEnvelope();
    if (!envelope) {
      setIsScanning(false);
      setShowPassphraseFallback(true);
      setErrorMessage(
        'Encrypted vault envelope is missing on this device. Access remains locked.'
      );
      return;
    }

    if (!hasActiveVaultKey()) {
      setIsScanning(false);
      setShowPassphraseFallback(true);
      setErrorMessage(
        'WebAuthn cannot decrypt storage after a cold reload. Enter your Vault Passphrase to unlock.'
      );
      return;
    }

    setIsScanning(true);
    try {
      const { verifyWebAuthnCredential } = await import('../utils/webauthn');
      const result = await verifyWebAuthnCredential(user?.biometricCredentialId);

      if (result.success && hasActiveVaultKey()) {
        setScanSuccess(true);
        setTimeout(() => {
          setScanSuccess(false);
          setIsScanning(false);
          unlockBiometric();
        }, 250);
        return;
      }

      setIsScanning(false);
      setShowPassphraseFallback(true);
      setErrorMessage(result.error || 'Biometric verification did not complete. Enter your Vault Passphrase.');
    } catch {
      setIsScanning(false);
      setShowPassphraseFallback(true);
      setErrorMessage('Biometric verification failed. Please unlock with your Vault Passphrase.');
    }
  };

  const handlePassphraseUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const envelope = readStoredVaultEnvelope();
    if (!envelope) {
      setErrorMessage(
        'Encrypted vault envelope is missing on this device. Return to the main lock screen to recover from backup.'
      );
      return;
    }
    if (!passphraseInput.trim()) {
      setErrorMessage('Enter your Vault Passphrase.');
      return;
    }

    try {
      const decrypted = await decryptVault(envelope, passphraseInput.trim());
      restoreVaultDataToStore(decrypted);
      setPassphraseInput('');
      unlockBiometric();
    } catch {
      setErrorMessage('Invalid vault passphrase or corrupted ciphertext.');
    }
  };

  const canUseSessionBiometrics = Boolean(storedEnvelope && hasActiveVaultKey());

  return (
    <div className="min-h-screen bg-[#070B14] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm bg-[#0F172A]/95 border border-slate-800 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-center">
        <div className="flex justify-center mb-4">
          <ChakraLogo size={52} spin={false} glow={true} />
        </div>

        <div className="mb-6">
          <p className="text-[11px] font-mono text-sky-400 tracking-wider uppercase mb-1 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Session Screen Lock</span>
          </p>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Workspace Locked
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {user.name?.trim()
              ? `In-session screen lock for ${user.name.trim()}. Cold starts always require your Vault Passphrase.`
              : 'In-session screen lock active. Cold starts always require your Vault Passphrase.'}
          </p>
        </div>

        {canUseSessionBiometrics && (
          <div className="my-5 flex flex-col items-center">
            <button
              type="button"
              onClick={triggerBiometricAuth}
              disabled={isScanning}
              className={`relative w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
                scanSuccess
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-400 scale-105'
                  : isScanning
                  ? 'border-sky-400 bg-sky-500/15 text-sky-400'
                  : 'border-slate-700 bg-slate-900/90 hover:border-indigo-500 text-slate-300 hover:text-white'
              }`}
            >
              {scanSuccess ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : (
                <Fingerprint className="w-10 h-10" />
              )}
            </button>

            <span className="text-xs font-semibold text-slate-300 mt-3">
              {scanSuccess
                ? 'Hardware Credential Verified'
                : isScanning
                ? 'Validating Hardware Credential...'
                : 'Tap to Scan Fingerprint / Face ID'}
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!showPassphraseFallback && canUseSessionBiometrics ? (
          <button
            type="button"
            onClick={() => setShowPassphraseFallback(true)}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium transition cursor-pointer"
          >
            Unlock with Vault Passphrase Instead
          </button>
        ) : (
          <form onSubmit={handlePassphraseUnlock} className="mt-2 pt-4 border-t border-slate-800 text-left space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Vault Passphrase
              </label>
              <input
                type="password"
                value={passphraseInput}
                onChange={(e) => setPassphraseInput(e.target.value)}
                placeholder="Enter AES-256 vault passphrase"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-sky-500"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!storedEnvelope}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Decrypt &amp; Unlock</span>
            </button>
          </form>
        )}

        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={signOut}
            className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Return to Vault Unlock &amp; Recovery</span>
          </button>
        </div>
      </div>
    </div>
  );
};
