import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // ✅ 开发服务器设置
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    origin: 'http://192.168.50.20:5173',  // 让 Django 模板能正确引用
  },

  // ✅ 构建输出给 Django 使用
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    manifest: true,
  },
})
