export const VAULT_PERSISTENCE_ERROR_MESSAGE =
  'BYOC could not confirm that your latest changes were saved to the encrypted vault. Keep the app open, free device storage if needed, and retry before closing.';

export interface VaultPersistenceTransition {
  error: string | null;
  notifyFailure: boolean;
  notifyRecovered: boolean;
}

/**
 * Keeps a persistent warning visible after the first failed vault write,
 * suppresses repeated failure toasts, and announces recovery once saving works.
 */
export function transitionVaultPersistenceStatus(
  previousError: string | null,
  succeeded: boolean
): VaultPersistenceTransition {
  if (succeeded) {
    return {
      error: null,
      notifyFailure: false,
      notifyRecovered: previousError !== null
    };
  }

  return {
    error: previousError || VAULT_PERSISTENCE_ERROR_MESSAGE,
    notifyFailure: previousError === null,
    notifyRecovered: false
  };
}
