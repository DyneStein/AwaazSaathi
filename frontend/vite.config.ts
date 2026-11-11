import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const API = 'http://localhost:8000'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually only on /dealer
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/ws/, /^\/uploads/], globPatterns: ['**/*.{js,css,html,svg,woff2}'], maximumFileSizeToCacheInBytes: 8_000_000 },
      manifest: {
        name: 'AwaazSaathi Dealer',
        short_name: 'Saathi Dealer',
        description: 'Outbreak alerts and stock planning for agri dealers',
        start_url: '/dealer',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f1e7',
        theme_color: '#1f5130',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  build: { outDir: '../backend/static', emptyOutDir: true },
  server: {
    host: true,
    proxy: {
      '/api': API,
      '/media': API,
      '/uploads': API,
      '/recordings': API,
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
