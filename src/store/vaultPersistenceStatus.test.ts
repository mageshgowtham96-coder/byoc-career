import { describe, expect, it } from 'vitest';
import {
  VAULT_PERSISTENCE_ERROR_MESSAGE,
  transitionVaultPersistenceStatus
} from './vaultPersistenceStatus';

describe('transitionVaultPersistenceStatus', () => {
  it('raises a persistent warning and a one-time notification on the first failed save', () => {
    expect(transitionVaultPersistenceStatus(null, false)).toEqual({
      error: VAULT_PERSISTENCE_ERROR_MESSAGE,
      notifyFailure: true,
      notifyRecovered: false
    });
  });

  it('does not repeat the failure notification for subsequent failed saves', () => {
    expect(transitionVaultPersistenceStatus(VAULT_PERSISTENCE_ERROR_MESSAGE, false)).toEqual({
      error: VAULT_PERSISTENCE_ERROR_MESSAGE,
      notifyFailure: false,
      notifyRecovered: false
    });
  });

  it('clears the warning and signals recovery after a successful save', () => {
    expect(transitionVaultPersistenceStatus(VAULT_PERSISTENCE_ERROR_MESSAGE, true)).toEqual({
      error: null,
      notifyFailure: false,
      notifyRecovered: true
    });
  });

  it('does not show a recovery notification when there was no prior failure', () => {
    expect(transitionVaultPersistenceStatus(null, true)).toEqual({
      error: null,
      notifyFailure: false,
      notifyRecovered: false
    });
  });
});
