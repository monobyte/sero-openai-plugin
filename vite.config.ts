import { federation } from '@module-federation/vite';
import { seroPluginCssScope } from '@sero-ai/plugin-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [react(), tailwindcss(), seroPluginCssScope({ pluginId: 'openai-extender', allowGlobalSelectors: true }), federation({
    name: 'sero_openai_extender', filename: 'remoteEntry.js', dts: false, manifest: true,
    exposes: { './OpenAIApp': './ui/OpenAIApp.tsx', './OpenAIModelSettings': './ui/OpenAIModelSettings.tsx' },
    shared: { react: { singleton: true }, 'react/': { singleton: true }, 'react-dom': { singleton: true }, 'react-dom/': { singleton: true } },
  })],
  server: { port: 5200, strictPort: true, origin: 'http://localhost:5200' },
  optimizeDeps: { exclude: ['@sero-ai/app-runtime'], include: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] },
  build: { target: 'esnext', outDir: 'dist/ui', emptyOutDir: true, rollupOptions: { input: 'ui/index.html' } },
});
