import { useId, useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  const counterLabelId = useId()

  return (
    <section className="space-y-8 rounded-3xl bg-base-100 p-10 shadow-2xl">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-widest text-primary">React + DaisyUI</p>
        <h1 className="text-3xl font-bold">计数器演示</h1>
        <p className="text-base text-base-content/70">
          使用 Tailwind 与 DaisyUI 构建一个简单的交互式计数器组件。
        </p>
      </header>

      <section className="space-y-6">
        <div className="rounded-2xl bg-base-200/60 p-6 text-center">
          <p id={counterLabelId} className="text-sm font-medium text-base-content/70">
            当前计数值
          </p>
          <p
            className="mt-4 text-6xl font-black tabular-nums text-primary"
            aria-live="polite"
            aria-atomic="true"
            aria-labelledby={counterLabelId}
          >
            {count}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="btn btn-outline btn-secondary"
            onClick={() => setCount((value) => value - 1)}
          >
            - 1
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCount((value) => value + 1)}
          >
            + 1
          </button>
          <button type="button" className="btn btn-accent" onClick={() => setCount(0)}>
            重置
          </button>
        </div>
      </section>

      <footer className="space-y-2 rounded-2xl bg-base-200/60 p-5 text-sm text-base-content/70">
        <p>小提示：</p>
        <ul className="list-disc space-y-1 pl-5 text-left">
          <li>按钮样式来自 DaisyUI，展示主题色彩与状态。</li>
          <li>
            计数值使用 <span className="font-semibold">tabular-nums</span> 确保数字对齐。
          </li>
          <li>通过 React 状态管理更新界面，实现即时反馈。</li>
        </ul>
      </footer>
    </section>
  )
}

export default Counter
