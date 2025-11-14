import { useId, useMemo, useState } from 'react'

const moodMapping = [
  { threshold: 90, label: '🎉 项目完成！可以庆祝啦。' },
  { threshold: 60, label: '💪 进展顺利，再坚持一下。' },
  { threshold: 30, label: '🚀 刚刚起步，保持动力。' },
  { threshold: 0, label: '🌱 准备开始第一步。' },
]

function getMoodLabel(progress: number) {
  return moodMapping.find((item) => progress >= item.threshold)?.label ?? moodMapping.at(-1)!.label
}

export function Progress() {
  const [progress, setProgress] = useState(60)
  const progressLabelId = useId()
  const sliderLabelId = useId()

  const moodLabel = useMemo(() => getMoodLabel(progress), [progress])

  return (
    <section className="h-full flex flex-col rounded-3xl bg-base-100 p-10 shadow-2xl">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-widest text-secondary">Progress & Mood</p>
        <h2 className="text-2xl font-bold">项目进度演示</h2>
        <p className="text-base text-base-content/70">
          通过滑块调整项目完成度，观察 DaisyUI 组件如何响应状态变化。
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <div className="rounded-2xl bg-base-200/60 p-6 text-center">
          <p id={progressLabelId} className="text-sm font-medium text-base-content/70">
            当前完成度
          </p>
          <div className="mt-6 space-y-4" aria-labelledby={progressLabelId}>
            <progress className="progress progress-primary w-full" value={progress} max="100" />
            <p className="text-4xl font-black tabular-nums text-primary">{progress}%</p>
            <p className="text-base text-base-content/80">{moodLabel}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={sliderLabelId} className="text-sm font-medium text-base-content/70">
            拖动滑块调整进度
          </label>
          <input
            id={sliderLabelId}
            type="range"
            min="0"
            max="100"
            value={progress}
            className="range range-primary w-full"
            onChange={(event) => setProgress(Number(event.target.value))}
          />
          <div className="flex justify-between text-xs text-base-content/60">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Progress
