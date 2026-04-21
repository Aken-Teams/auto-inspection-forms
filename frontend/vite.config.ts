import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 12060,
    proxy: {
      '/api': {
        target: 'http://localhost:12061',
        changeOrigin: true,
      },
    },
  },
})
