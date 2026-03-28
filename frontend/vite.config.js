import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Exposes VITE_* env variables to the frontend build
  // Set VITE_API_URL in your Vercel dashboard
})
