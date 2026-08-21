import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv, not process.env: Vite only exposes .env files to client code by
  // default, so the config itself has to read them explicitly.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5192,
      proxy: {
        '/api': {
          // Defaults to the port docker-compose publishes. Override with
          // VITE_API_TARGET when running the backend locally alongside the
          // container, which would otherwise fight over the same port.
          target: env.VITE_API_TARGET || 'http://localhost:8008',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
