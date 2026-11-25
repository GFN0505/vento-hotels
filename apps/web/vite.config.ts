import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The web app and the API share one origin (decision 0019): in development Vite forwards /api and
// /rpc to the API, so cookies are first-party and no CORS is needed.
// Ports differ from other local projects so both can run at once (decision 0015).
const apiTarget = process.env.VITE_API_PROXY ?? `http://localhost:${process.env.API_PORT ?? 3010}`
const proxy = {
  '/api': { target: apiTarget, changeOrigin: false },
  '/rpc': { target: apiTarget, changeOrigin: false },
}

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: Number(process.env.WEB_PORT ?? 5180), strictPort: true, proxy },
  preview: { port: Number(process.env.WEB_PORT ?? 5180), strictPort: true, proxy },
  build: {
    rollupOptions: {
      output: {
        // The sign-in library changes rarely, so it gets its own file: phones keep it cached when
        // the app updates, and no single file outgrows its budget (apps/web/bundle-budget.json).
        manualChunks: (id) =>
          /node_modules\/.*(better-auth|@better-fetch|nanostores)/.test(id) ? 'auth' : undefined,
      },
    },
  },
})
