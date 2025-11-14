import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    // ✅ 开发服务器设置
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // 允许通过环境变量覆盖，否则使用 Vite 自动推断的访问来源
      origin: env.VITE_DEV_SERVER_ORIGIN || undefined,
    },

    // ✅ 构建输出给 Django 使用
    build: {
      outDir: '../static/dist',
      emptyOutDir: true,
      manifest: true,
    },
  }
})
