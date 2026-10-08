import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/** Иконка прямо в HTML — для версии-файла, рядом с которой нет папки public. */
function inlineFavicon(): Plugin {
  const svg = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf-8');
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return {
    name: 'docassist-inline-favicon',
    transformIndexHtml: (html) =>
      html
        .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${dataUri}" />`)
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, ''),
  };
}

export default defineConfig(({ mode }) => {
  // mode 'single' — всё приложение в одном HTML-файле (для релизов: скачал и открыл двойным кликом).
  const single = mode === 'single';
  // BASE_PATH задаётся при сборке: /DocAssist/ для GitHub Pages, ./ для архива веб-версии.
  const base = single ? './' : (process.env.BASE_PATH ?? '/');

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      __SINGLE_FILE__: JSON.stringify(single),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // В версии-файле нет service worker — подставляем заглушку регистрации.
        ...(single ? { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/ui/pwaStub.ts', import.meta.url)) } : {}),
      },
    },
    publicDir: single ? false : 'public',
    build: single ? { outDir: 'dist-single', chunkSizeWarningLimit: 2000 } : { chunkSizeWarningLimit: 1000 },
    plugins: single
      ? [react(), viteSingleFile({ removeViteModuleLoader: true }), inlineFavicon()]
      : [
          react(),
          VitePWA({
            registerType: 'prompt',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'DocAssist — документы РСО',
              short_name: 'DocAssist',
              description: 'Ускорение и автоматизация работы с документами Российских студенческих отрядов. Работает локально и офлайн.',
              lang: 'ru',
              theme_color: '#1d4fa0',
              background_color: '#ffffff',
              display: 'standalone',
              start_url: base,
              scope: base,
              icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
          }),
        ],
  };
});
