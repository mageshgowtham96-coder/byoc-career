import { Capacitor, registerPlugin } from '@capacitor/core';

interface ExternalBrowserPlugin {
  open(options: { url: string }): Promise<void>;
}

const ExternalBrowser = registerPlugin<ExternalBrowserPlugin>('ExternalBrowser');

export function shouldUseNativeExternalBrowser(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function openExternalPortalUrl(value: string): Promise<void> {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new Error('Only valid HTTP(S) portal links can be opened.');
  }
  if (!shouldUseNativeExternalBrowser()) {
    throw new Error('The native external browser is only available in the Android app.');
  }
  await ExternalBrowser.open({ url: url.toString() });
}
