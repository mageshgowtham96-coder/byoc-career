import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import { generateAllAndroidIcons } from './scripts/generate_icons.js';

function androidIconGeneratorPlugin() {
  return {
    name: 'android-icon-generator',
    buildStart() {
      try {
        generateAllAndroidIcons(process.cwd());
      } catch (err) {
        console.error('Failed to generate Android icons:', err);
      }
    },
  };
}

function pdfJsOfflineAssetsPlugin() {
  const copyAssets = (destinationRoot: string) => {
    const packageRoot = path.resolve(process.cwd(), 'node_modules/pdfjs-dist');
    for (const assetDirectory of ['cmaps', 'standard_fonts']) {
      const source = path.join(packageRoot, assetDirectory);
      const destination = path.join(destinationRoot, assetDirectory);
      if (fs.existsSync(source)) {
        fs.mkdirSync(destinationRoot, { recursive: true });
        fs.cpSync(source, destination, { recursive: true });
      }
    }
  };

  return {
    name: 'pdfjs-offline-assets',
    buildStart() {
      // Make the assets available to Vite's dev server.
      copyAssets(path.resolve(process.cwd(), 'public'));
    },
    closeBundle() {
      // Vite copies publicDir before buildStart; copy again after bundling so
      // production and Capacitor output always contain the worker's resources.
      copyAssets(path.resolve(process.cwd(), 'dist'));
    },
  };
}

export default defineConfig(() => {
  return {
    // Relative base path ensures assets resolve correctly in Capacitor Android WebView
    // (e.g. file:///android_asset/public/ or https://localhost/ schemes)
    base: './',
    plugins: [react(), tailwindcss(), androidIconGeneratorPlugin(), pdfJsOfflineAssetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Unified CSS bundle prevents chunk-loading drops across varied Android WebViews
      cssCodeSplit: false,
      sourcemap: false,
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

