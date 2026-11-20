import { createRoot } from 'react-dom/client';
import './index.css';
import { initializeVaultEnvelopeStorage, flushVaultEnvelopePersistence } from './utils/cryptoVault';

async function bootstrap(): Promise<void> {
  // Hydrate the encrypted-vault mirror before evaluating React/store modules.
  await initializeVaultEnvelopeStorage();
  const flush = () => { void flushVaultEnvelopePersistence(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  const { default: App } = await import('./App.tsx');
  const root = document.getElementById('root');
  if (!root) throw new Error('BYOC root element is missing.');
  createRoot(root).render(<App />);
}

void bootstrap().catch((error) => {
  console.error('BYOC startup failed:', error);
  const root = document.getElementById('root');
  if (root) root.textContent = 'BYOC could not initialize its secure local workspace. Please reload the app.';
});
