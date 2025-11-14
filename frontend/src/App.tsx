import type { ChangeEvent, FormEvent } from 'react'
import { useMemo, useState } from 'react'

type Language = 'zh' | 'en'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type ToolConfig = {
  id: string
  label: string
  description: string
}

const toolPresets: ToolConfig[] = [
  {
    id: 'code-interpreter',
    label: 'Code Interpreter',
    description: '运行代码或做轻量分析',
  },
  {
    id: 'data-browser',
    label: 'Data Browser',
    description: '查询指标数据与可视化',
  },
  {
    id: 'workflow-runner',
    label: 'Workflow Runner',
    description: '触发外部自动化流程',
  },
]

const localePack = {
  zh: {
    languageLabel: '界面语言',
    title: 'Agentic RAG 控制台',
    subtitle: '组合 RAG + Web Search + Tools，观察 Agent 自主决策。',
    uploadLabel: 'RAG 文档',
    uploadHint: '支持多文件上传，示例：PDF、Markdown、截图等。',
    uploadButton: '上传文件',
    emptyDoc: '尚未上传文档',
    ragToggle: '启用 RAG',
    webSearchToggle: '允许 Web 搜索',
    toolsToggle: '允许使用工具',
    toolTitle: '可选工具',
    chatTitle: 'Agent Chat 演示',
    chatSubtitle: '根据左侧配置自动推理是否需要继续循环。',
    inputPlaceholder: '输入问题，例如 “总结上传文档中的重点”',
    sendButton: '发送',
    agentThoughts: 'Agent 观察：',
    agentAnswer: '总结响应：',
    localeTag: '中文',
  },
  en: {
    languageLabel: 'Language',
    title: 'Agentic RAG Console',
    subtitle: 'Blend RAG, Web Search, and Tools to observe agent decisions.',
    uploadLabel: 'RAG Documents',
    uploadHint: 'Upload multiple files such as PDFs, markdown notes, or screenshots.',
    uploadButton: 'Upload files',
    emptyDoc: 'No documents uploaded yet',
    ragToggle: 'Enable RAG',
    webSearchToggle: 'Allow web search',
    toolsToggle: 'Allow tools',
    toolTitle: 'Available tools',
    chatTitle: 'Agent Chat Demo',
    chatSubtitle: 'The model loops until it decides a final answer is ready.',
    inputPlaceholder: 'Ask anything, e.g. “Summarize my uploaded docs”',
    sendButton: 'Send',
    agentThoughts: 'Agent reflection:',
    agentAnswer: 'Final answer:',
    localeTag: 'English',
  },
}

type LocalePack = (typeof localePack)[Language]

function App() {
  const [language, setLanguage] = useState<Language>('zh')
  const copy: LocalePack = localePack[language]
  const [files, setFiles] = useState<File[]>([])
  const [enableRag, setEnableRag] = useState(true)
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [allowTools, setAllowTools] = useState(true)
  const [selectedTools, setSelectedTools] = useState<string[]>(
    toolPresets.length ? [toolPresets[0].id] : [],
  )
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      text:
        language === 'zh'
          ? '你好！上传文档并调整左侧开关，体验一次 Agentic RAG 循环。'
          : 'Hello! Upload some docs and tweak the toggles to experience an agentic RAG loop.',
    },
  ])
  const [pendingMessage, setPendingMessage] = useState('')

  const fileSummary = useMemo(() => {
    if (!files.length) {
      return copy.emptyDoc
    }

    return files.map((file) => `${file.name} · ${(file.size / 1024).toFixed(1)} KB`).join(' \n ')
  }, [copy.emptyDoc, files])

  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as Language
    setLanguage(value)
    setMessages((prev) =>
      prev.map((message, index) => {
        if (index === 0 && message.role === 'assistant') {
          return {
            ...message,
            text:
              value === 'zh'
                ? '你好！上传文档并调整左侧开关，体验一次 Agentic RAG 循环。'
                : 'Hello! Upload some docs and tweak the toggles to experience an agentic RAG loop.',
          }
        }
        return message
      }),
    )
  }

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files
    if (!list?.length) return
    setFiles((prev) => [...prev, ...Array.from(list)])
    event.target.value = ''
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((item) => item !== toolId) : [...prev, toolId],
    )
  }

  const buildAgentResponse = (question: string) => {
    const actions: string[] = []

    if (enableRag && files.length) {
      actions.push(
        language === 'zh'
          ? `解析 ${files.length} 份文档并检索相关片段。`
          : `Retrieve evidence from ${files.length} uploaded documents.`,
      )
    }

    if (enableWebSearch) {
      actions.push(language === 'zh' ? '补充实时 Web 搜索结果。' : 'Augment with live web results.')
    }

    if (allowTools && selectedTools.length) {
      actions.push(
        language === 'zh'
          ? `调用工具：${selectedTools.length} 个。`
          : `Use ${selectedTools.length} tool(s).`,
      )
    }

    if (!actions.length) {
      actions.push(language === 'zh' ? '无额外操作，直接回答。' : 'No extra steps, respond directly.')
    }

    const reasoning = `${copy.agentThoughts} ${actions.join(' ')}`
    const answer =
      language === 'zh'
        ? `${copy.agentAnswer} ${question} \n\nAgent 判断无需进一步循环，返回最终响应。`
        : `${copy.agentAnswer} ${question}\n\nThe agent decided no additional loop is needed and finalizes the response.`

    return `${reasoning}\n\n${answer}`
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pendingMessage.trim()) return

    const text = pendingMessage.trim()
    setPendingMessage('')

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', text },
      { id: crypto.randomUUID(), role: 'assistant', text: buildAgentResponse(text) },
    ])
  }

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <aside className="w-full rounded-3xl bg-base-100 p-6 shadow-xl lg:w-1/3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary">{copy.localeTag}</p>
              <h1 className="text-2xl font-bold">{copy.title}</h1>
              <p className="mt-1 text-sm text-base-content/70">{copy.subtitle}</p>
            </div>
            <label className="form-control w-32 text-right">
              <span className="label-text text-xs font-medium">{copy.languageLabel}</span>
              <select
                className="select select-bordered select-sm"
                value={language}
                onChange={handleLanguageChange}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          <section className="mt-6 space-y-4">
            <label className="form-control">
              <div className="label">
                <span className="label-text text-base font-semibold">{copy.uploadLabel}</span>
                <span className="label-text-alt text-xs text-base-content/70">{copy.uploadHint}</span>
              </div>
              <input
                type="file"
                multiple
                className="file-input file-input-bordered"
                onChange={handleFileUpload}
              />
            </label>
            <div className="rounded-2xl border border-dashed border-base-300 p-4 text-sm">
              <p className="font-medium text-base-content/80">{fileSummary}</p>
            </div>
          </section>

          <section className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{copy.ragToggle}</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={enableRag}
                onChange={(event) => setEnableRag(event.target.checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">{copy.webSearchToggle}</span>
              <input
                type="checkbox"
                className="toggle toggle-secondary"
                checked={enableWebSearch}
                onChange={(event) => setEnableWebSearch(event.target.checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">{copy.toolsToggle}</span>
              <input
                type="checkbox"
                className="toggle toggle-accent"
                checked={allowTools}
                onChange={(event) => setAllowTools(event.target.checked)}
              />
            </div>
          </section>

          <section className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{copy.toolTitle}</h2>
              <span className="badge badge-outline">{selectedTools.length}</span>
            </div>
            <div className="space-y-3">
              {toolPresets.map((tool) => (
                <label
                  key={tool.id}
                  className={`flex items-start gap-3 rounded-2xl border p-4 ${
                    selectedTools.includes(tool.id) ? 'border-primary/60 bg-primary/5' : 'border-base-200'
                  } ${!allowTools ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mt-1"
                    checked={selectedTools.includes(tool.id)}
                    disabled={!allowTools}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <div>
                    <p className="font-medium">{tool.label}</p>
                    <p className="text-sm text-base-content/70">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </aside>

        <section className="w-full rounded-3xl bg-base-100 p-6 shadow-xl lg:w-2/3">
          <header className="border-b border-base-200 pb-4">
            <p className="text-xs uppercase tracking-widest text-secondary">Live Demo</p>
            <h2 className="text-2xl font-bold">{copy.chatTitle}</h2>
            <p className="text-sm text-base-content/70">{copy.chatSubtitle}</p>
          </header>

          <div className="mt-4 flex h-[560px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`}
                >
                  <div className="chat-header text-xs text-base-content/60">
                    {message.role === 'user' ? 'User' : 'Agent'}
                  </div>
                  <div
                    className={`chat-bubble whitespace-pre-line text-left text-sm ${
                      message.role === 'user'
                        ? 'chat-bubble-primary'
                        : 'bg-base-200 text-base-content'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="form-control">
                <textarea
                  className="textarea textarea-bordered min-h-[120px]"
                  placeholder={copy.inputPlaceholder}
                  value={pendingMessage}
                  onChange={(event) => setPendingMessage(event.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={!pendingMessage.trim()}>
                {copy.sendButton}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
