import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SPA with client-side routing. `appType: 'spa'` (the default) makes the dev
// and preview servers fall back to index.html for unknown routes, so deep
// links like /faq work without a server config.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 }
})
