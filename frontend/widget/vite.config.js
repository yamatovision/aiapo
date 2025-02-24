// widget/vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // 環境変数のロード
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      // 環境変数の定義
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        mode === 'production' 
          ? 'https://aibookingbot-backend-6clpzmy5pa-an.a.run.app'
          : 'http://localhost:3000'
      )
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@frontend': path.resolve(__dirname, '..')
      }
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})