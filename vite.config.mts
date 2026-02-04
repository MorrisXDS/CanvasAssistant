import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600, // Raise limit slightly (default is 500)
    rollupOptions: {
      output: {
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-ui': ['lucide-react', 'react-window', 'react-hotkeys-hook'],
          // State & utilities
          'vendor-utils': ['zustand', 'zod', 'axios'],
          // Date handling (used heavily in Calendar)
          'vendor-date': ['luxon', 'rrule'],
          // Text editor (TipTap - heavy)
          'vendor-editor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-link',
            '@tiptap/extension-placeholder',
          ],
          // Security/sanitization
          'vendor-security': ['dompurify'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Ensure single React instance for TipTap and other dependencies
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
  },
});
