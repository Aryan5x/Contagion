import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // The chart library is the largest dependency and changes rarely: keep it in its own chunk
        // so it is cached separately from the app code. Pages are split by the lazy imports in App.tsx.
        codeSplitting: {
          groups: [
            // React is needed by every page, so it must not be pulled into the charts group.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'charts', test: /node_modules[\\/](recharts|victory-vendor|@reduxjs|immer|reselect|redux|react-redux|es-toolkit|decimal\.js|eventemitter3|tiny-invariant)/, priority: 1 },
          ],
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
