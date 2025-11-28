import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'web3modal': ['@web3modal/wagmi'],
          'wagmi': ['wagmi', 'viem'],
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
      '@walletconnect/ethereum-provider',
      '@web3modal/wagmi',
      'wagmi',
      'viem',
      'buffer',
    ],
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
