import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Counter from './components/Counter.tsx'
import Progress from './components/Progress.tsx'

// 定义一个通用的挂载函数
const mountApp = (element: HTMLElement, Component: React.FC<any>, props?: any): Root => {
  const root = createRoot(element)
  root.render(
    <StrictMode>
      <Component {...props} />
    </StrictMode>
  )
  return root
}

// 将App挂载到Vite开发服务器首页的vite_root节点
// 这样使用访问Vite的5173端口也同样可以渲染页面
// 需要Vite创建的index.html的'root'修改为'vite_root'
const viteRoot = document.getElementById('vite_root')
if (viteRoot) {
  mountApp(viteRoot, App)
}

// 分别挂载到Django模板的'counter_root'和'progress_root'节点
const counterRoot = document.getElementById('counter_root')
if (counterRoot) {
  mountApp(counterRoot, Counter)
}
const progressRoot = document.getElementById('progress_root')
if (progressRoot) {
  mountApp(progressRoot, Progress)
}

// 暴露到 window 以便 Django 模板或外部脚本动态调用
if (typeof window !== 'undefined') {
  (window as any).mountReactApp = (element: HTMLElement, Component: React.FC<any>, props?: any) =>
    mountApp(element, Component, props)
}

// 可选：导出组件注册表（方便根据名字查找）
export const components = {
  App,
  Counter,
  ProgressDemo,
}

