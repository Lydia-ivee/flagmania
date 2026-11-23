import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the app from /flagmania/.
export default defineConfig({
  base: '/flagmania/',
  plugins: [react()],
})
