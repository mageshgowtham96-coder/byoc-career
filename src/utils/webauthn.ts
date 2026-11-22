/**
 * WebAuthn Credential Management Utility
 * Handles genuine hardware biometric registration and authentication ceremonies.
 */

export interface WebAuthnEnrollmentResult {
  success: boolean;
  credentialId?: string;
  error?: string;
}

export interface WebAuthnVerificationResult {
  success: boolean;
  error?: string;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Executes authentic WebAuthn registration ceremony
 */
export async function registerWebAuthnCredential(
  userName: string,
  userEmail: string
): Promise<WebAuthnEnrollmentResult> {
  const available = await isPlatformAuthenticatorAvailable();
  if (!available) {
    return {
      success: false,
      error: 'Platform authenticator (Touch ID, Face ID, or Windows Hello) is not available on this device.'
    };
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'BYOC Career Workspace',
        id: window.location.hostname
      },
      user: {
        id: userId,
        name: userEmail || 'user@byoc.app',
        displayName: userName || 'BYOC User'
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    })) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Registration cancelled by user.' };
    }

    const rawIdBase64 = bufferToBase64(credential.rawId);
    return {
      success: true,
      credentialId: rawIdBase64
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'WebAuthn registration ceremony failed';
    return { success: false, error: msg };
  }
}

/**
 * Requests a platform-authenticator assertion and matches its raw credential ID
 * to the credential enrolled for this workspace. userVerification is required.
 * This local-only gate is a session convenience, not server-verified identity proof.
 */
export async function verifyWebAuthnCredential(
  storedCredentialId?: string
): Promise<WebAuthnVerificationResult> {
  if (!storedCredentialId) {
    return {
      success: false,
      error: 'No enrolled device credential is associated with this workspace. Unlock with your passphrase and re-enroll.'
    };
  }

  const available = await isPlatformAuthenticatorAvailable();
  if (!available) {
    return {
      success: false,
      error: 'Platform hardware authenticator unavailable.'
    };
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const allowCredentials: PublicKeyCredentialDescriptor[] = storedCredentialId
      ? [
          {
            type: 'public-key',
            id: base64ToBuffer(storedCredentialId),
            transports: ['internal']
          }
        ]
      : [];

    const publicKeyRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: 'required',
      rpId: window.location.hostname,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined
    };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyRequestOptions
    })) as PublicKeyCredential;

    if (assertion?.rawId && bufferToBase64(assertion.rawId) === storedCredentialId) {
      return { success: true };
    }

    return {
      success: false,
      error: 'The device did not return the enrolled BYOC credential. Unlock with your passphrase and try again.'
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Biometric verification cancelled or failed.';
    return { success: false, error: msg };
  }
}
