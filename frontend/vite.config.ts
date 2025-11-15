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
    origin: 'http://47.242.1.178:12356',  // 让 Django 模板能正确引用
    cors: {
      origin: 'http://47.242.1.178:12355' // 明确允许 Django 服务器的公网地址
    }
  },

  // ✅ 构建输出给 Django 使用
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    manifest: true,
  },
})
