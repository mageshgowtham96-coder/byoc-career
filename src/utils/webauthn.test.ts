import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyWebAuthnCredential } from './webauthn';

describe('verifyWebAuthnCredential', () => {
  const getMock = vi.fn();

  beforeEach(() => {
    getMock.mockReset();
    const platformCredential = class {
      static isUserVerifyingPlatformAuthenticatorAvailable = vi.fn().mockResolvedValue(true);
    };
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: platformCredential
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { get: getMock }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts an assertion only when it matches the enrolled credential id', async () => {
    getMock.mockResolvedValue({ id: 'Y3JlZA==', rawId: Uint8Array.from([99, 114, 101, 100]).buffer });

    await expect(verifyWebAuthnCredential('Y3JlZA==')).resolves.toEqual({ success: true });
    expect(getMock).toHaveBeenCalledOnce();
  });

  it('rejects an assertion returned for a different credential', async () => {
    getMock.mockResolvedValue({ id: 'b3RoZXI=', rawId: Uint8Array.from([111, 116, 104, 101, 114]).buffer });

    await expect(verifyWebAuthnCredential('Y3JlZA==')).resolves.toMatchObject({
      success: false
    });
  });

  it('rejects when the authenticator returns no assertion', async () => {
    getMock.mockResolvedValue(null);

    await expect(verifyWebAuthnCredential('Y3JlZA==')).resolves.toMatchObject({
      success: false
    });
  });
});
