import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const mountApp = (element: HTMLElement, Component: React.FC<any>, props?: any): Root => {
  const root = createRoot(element)
  root.render(
    <StrictMode>
      <Component {...props} />
    </StrictMode>,
  )
  return root
}

const viteRoot = document.getElementById('vite_root')
if (viteRoot) {
  mountApp(viteRoot, App)
}

if (typeof window !== 'undefined') {
  ;(window as any).mountReactApp = (element: HTMLElement, Component: React.FC<any>, props?: any) =>
    mountApp(element, Component, props)
}

export const components = {
  App,
}
