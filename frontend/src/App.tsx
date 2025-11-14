import { useMemo, useState } from 'react'
import './App.css'

const tools = [
  { id: 'calculator', label: { en: 'Calculator', zh: '计算器' } },
  { id: 'calendar', label: { en: 'Calendar lookup', zh: '日历查询' } },
  { id: 'code', label: { en: 'Code executor', zh: '代码执行器' } },
  { id: 'weather', label: { en: 'Weather API', zh: '天气 API' } },
]

type Language = 'en' | 'zh'

type Message = {
  role: 'user' | 'assistant'
  content: string
  annotations?: string[]
}

const translations = {
  en: {
    title: 'Agentic RAG Demo',
    subtitle: 'Upload documents, toggle capabilities, and watch the agent plan its work.',
    uploadLabel: 'RAG documents',
    uploadHint: 'Drag & drop files or click to select',
    uploaded: 'uploaded',
    webSearch: 'Enable web search',
    tools: 'Enable tools',
    chooseTools: 'Available tools',
    language: 'Language',
    chatTitle: 'Chat playground',
    inputPlaceholder: 'Ask anything to the agent...',
    send: 'Send',
    clear: 'Clear chat',
    welcome: 'Hello! I can decide when to use RAG, web search, or tools while answering.',
    reasoning: 'Agent reasoning',
    using: 'Using',
    idle: 'No extra actions were required. Returning the answer.',
  },
  zh: {
    title: 'Agent RAG 演示',
    subtitle: '上传文档、切换能力，观察智能体如何规划工作流程。',
    uploadLabel: 'RAG 文档',
    uploadHint: '拖拽文件或点击选择',
    uploaded: '已上传',
    webSearch: '启用网络搜索',
    tools: '启用工具',
    chooseTools: '可用工具',
    language: '界面语言',
    chatTitle: '聊天演练场',
    inputPlaceholder: '向智能体提问...',
    send: '发送',
    clear: '清空对话',
    welcome: '你好！我会在需要时自动决定是否使用 RAG、搜索或工具。',
    reasoning: '智能体推理',
    using: '使用',
    idle: '无需额外操作，直接返回答案。',
  },
}

function App() {
  const [language, setLanguage] = useState<Language>('zh')
  const t = translations[language]
  const [documents, setDocuments] = useState<File[]>([])
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [enableTools, setEnableTools] = useState(true)
  const [selectedTools, setSelectedTools] = useState<string[]>([tools[0].id])
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t.welcome, annotations: [t.reasoning] },
  ])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)

  const actionBadges = useMemo(() => {
    return {
      rag: language === 'en' ? 'RAG lookup' : 'RAG 检索',
      web: language === 'en' ? 'Web search' : '网络搜索',
      tool: language === 'en' ? 'Tool call' : '工具调用',
    }
  }, [language])

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return
    setDocuments(Array.from(event.target.files))
  }

  const toggleTool = (id: string) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((toolId) => toolId !== id) : [...prev, id],
    )
  }

  const simulateAgent = async (userMessage: string) => {
    const needsRag = documents.length > 0 && /doc|资料|paper/i.test(userMessage)
    const needsWeb = enableWebSearch && /\?|news|最新|weather/i.test(userMessage)
    const needsTool = enableTools && selectedTools.length > 0 && /calc|计算|schedule/i.test(userMessage)

    const annotations: string[] = []
    if (needsRag) annotations.push(actionBadges.rag)
    if (needsWeb) annotations.push(actionBadges.web)
    if (needsTool) annotations.push(actionBadges.tool)

    const utilization = annotations.length
      ? `${t.using} ${annotations.join(' + ')}`
      : t.idle

    const answer =
      language === 'en'
        ? `I reviewed your message and ${utilization.toLowerCase()}.
Key takeaways: ${userMessage}`
        : `我分析了你的输入，并且${utilization}。
要点：${userMessage}`

    return { content: answer, annotations: annotations.length ? annotations : [t.reasoning] }
  }

  const handleSend = async () => {
    if (!input.trim()) return
    setPending(true)
    const newMessage: Message = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, newMessage])
    const prompt = input.trim()
    setInput('')

    const response = await simulateAgent(prompt)
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', ...response }])
      setPending(false)
    }, 450)
  }

  const handleClear = () => {
    setMessages([{ role: 'assistant', content: t.welcome, annotations: [t.reasoning] }])
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 p-4 text-base-content md:p-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <section className="card flex-1 border border-base-300 bg-base-100 shadow-xl">
          <div className="card-body gap-6">
            <header>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                {t.title}
              </p>
              <h1 className="text-3xl font-bold">Agentic RAG</h1>
              <p className="mt-2 text-sm opacity-80">{t.subtitle}</p>
            </header>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.language}</span>
              </label>
              <div className="join">
                <button
                  className={`btn join-item ${language === 'zh' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLanguage('zh')}
                >
                  中文
                </button>
                <button
                  className={`btn join-item ${language === 'en' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setLanguage('en')}
                >
                  English
                </button>
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">{t.uploadLabel}</span>
                <span className="label-text-alt opacity-70">
                  {documents.length ? `${documents.length} ${t.uploaded}` : t.uploadHint}
                </span>
              </label>
              <input
                type="file"
                multiple
                className="file-input file-input-bordered"
                onChange={handleUpload}
              />
              {documents.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-box bg-base-200 p-3 text-sm">
                  {documents.map((file) => (
                    <li key={file.name} className="flex items-center justify-between">
                      <span>{file.name}</span>
                      <span className="text-xs opacity-60">{(file.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-4 rounded-box border border-base-200 p-4">
              <label className="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={enableWebSearch}
                  onChange={(event) => setEnableWebSearch(event.target.checked)}
                />
                <span className="label-text font-semibold">{t.webSearch}</span>
              </label>
              <label className="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={enableTools}
                  onChange={(event) => setEnableTools(event.target.checked)}
                />
                <span className="label-text font-semibold">{t.tools}</span>
              </label>
              <div className="divider my-0" />
              <p className="text-sm font-semibold">{t.chooseTools}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((tool) => (
                  <label key={tool.id} className="label cursor-pointer justify-start gap-3 rounded-box border border-base-200 p-3">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selectedTools.includes(tool.id) && enableTools}
                      disabled={!enableTools}
                      onChange={() => toggleTool(tool.id)}
                    />
                    <span>{tool.label[language]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card flex-1 border border-base-300 bg-base-100 shadow-xl">
          <div className="card-body">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{t.chatTitle}</h2>
                <p className="text-sm opacity-70">{language === 'en' ? 'Agent loop visualized' : '智能体循环可视化'}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                {t.clear}
              </button>
            </header>

            <div className="flex flex-1 flex-col gap-4">
              <div className="flex-1 space-y-4 overflow-y-auto rounded-box border border-base-200 p-4">
                {messages.map((message, index) => (
                  <div key={index} className={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className="chat-header mb-1 text-xs uppercase tracking-wide opacity-60">
                      {message.role === 'user' ? 'You' : 'Agent'}
                    </div>
                    <div className="chat-bubble max-w-full whitespace-pre-line text-left">
                      {message.content}
                    </div>
                    {message.annotations && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.annotations.map((annotation) => (
                          <div key={annotation} className="badge badge-outline">
                            {annotation}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {pending && (
                  <div className="chat chat-start opacity-70">
                    <div className="chat-bubble animate-pulse">...</div>
                  </div>
                )}
              </div>

              <label className="form-control">
                <textarea
                  className="textarea textarea-bordered"
                  rows={3}
                  placeholder={t.inputPlaceholder}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-3">
                <button className="btn btn-outline" onClick={handleClear}>
                  {t.clear}
                </button>
                <button className="btn btn-primary" onClick={handleSend} disabled={pending}>
                  {pending ? '...' : t.send}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
