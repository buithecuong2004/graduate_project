import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // NOTE: getUserMedia works on http://localhost without HTTPS.
  // Only non-localhost HTTP origins require HTTPS for camera/mic access.
  define: {
    // simple-peer needs these Node.js globals in browser environment
    global: 'globalThis',
    'process.env': {},
  },
})

