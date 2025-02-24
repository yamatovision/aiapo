import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@frontend': path.resolve(__dirname, '..'),
    },
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    sourcemap: true,
  },
  logLevel: 'info',
  css: {
    devSourcemap: true
  },
  define: {
    'process.env.NODE_ENV': '"development"'
  }
})