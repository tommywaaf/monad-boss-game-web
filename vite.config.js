import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'dynamic': ['@dynamic-labs/sdk-react-core', '@dynamic-labs/ethereum'],
        },
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: [
      '@dynamic-labs/sdk-react-core',
      '@dynamic-labs/ethereum',
      'buffer',
    ],
    exclude: ['viem'], // Let viem be bundled normally to avoid initialization issues
    esbuildOptions: {
      target: 'es2020',
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
  },
})
