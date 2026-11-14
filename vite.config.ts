import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
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

export default defineConfig(() => {
  return {
    // Relative base path ensures assets resolve correctly in Capacitor Android WebView
    // (e.g. file:///android_asset/public/ or https://localhost/ schemes)
    base: './',
    plugins: [react(), tailwindcss(), androidIconGeneratorPlugin()],
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

