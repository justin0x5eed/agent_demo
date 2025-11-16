import { useEffect, useRef, useState } from 'react'
import './App.css'

const getCsrfToken = () => {
  if (typeof document === 'undefined') return ''
  return document.querySelector("meta[name='csrf-token']")?.getAttribute('content') ?? ''
}

const translations = {
  en: {
    title: 'Agentic RAG Demo',
    subtitle: 'Upload documents, toggle capabilities, and watch the agent plan its work.',
    uploadLabel: 'RAG documents',
    uploadHint: 'Drag & drop files or click to select',
    uploaded: 'uploaded',
    knowledgeBaseTitle: 'Knowledge base',
    knowledgeBaseDescription: 'Keep your domain files close for grounded answers.',
    supportedFormats: 'Supported formats: txt, doc',
    webSearch: 'Enable web search',
    webSearchTitle: 'Web search',
    webSearchDescription: 'Let the agent reach the web for fresh context.',
    tools: 'Enable tools',
    toolsTitle: 'Tools calling',
    toolsDescription: 'Choose which utilities the agent may call mid-conversation.',
    chooseTools: 'Available tools',
    modelTitle: 'Model selection',
    modelDescription: 'Pick the foundation model the agent will use while responding.',
    modelLabel: 'Available models',
    language: 'Language',
    chatTitle: 'Chat playground',
    chatSubtitle: 'Agent loop visualized',
    inputPlaceholder: 'Ask anything to the agent...',
    send: 'Send',
    clear: 'Clear chat',
    welcome: 'Hello! I can decide when to use RAG, web search, or tools while answering.',
    reasoning: 'Agent reasoning',
    using: 'Using',
    idle: 'No extra actions were required. Returning the answer.',
    badges: {
      rag: 'RAG lookup',
      web: 'Web search',
      tool: 'Tool call',
    },
    participants: {
      user: 'You',
      agent: 'Agent',
    },
  },
  zh: {
    title: 'Agent RAG 演示',
    subtitle: '上传文档、切换能力，观察智能体如何规划工作流程。',
    uploadLabel: 'RAG 文档',
    uploadHint: '拖拽文件或点击选择',
    uploaded: '已上传',
    knowledgeBaseTitle: '知识库',
    knowledgeBaseDescription: '上传业务文档，回答更有依据。',
    supportedFormats: '支持 txt、doc 格式',
    webSearch: '启用网络搜索',
    webSearchTitle: 'Web 搜索',
    webSearchDescription: '需要最新信息时放权给智能体访问网络。',
    tools: '启用工具',
    toolsTitle: 'Tools 调用',
    toolsDescription: '挑选智能体可调用的工具，按需扩展能力。',
    chooseTools: '可用工具',
    modelTitle: '大模型选择',
    modelDescription: '决定智能体回答时调用的大语言模型。',
    modelLabel: '可用模型',
    language: '界面语言',
    chatTitle: '聊天演练场',
    chatSubtitle: '智能体循环可视化',
    inputPlaceholder: '向智能体提问...',
    send: '发送',
    clear: '清空对话',
    welcome: '你好！我会在需要时自动决定是否使用 RAG、搜索或工具。',
    reasoning: '智能体推理',
    using: '使用',
    idle: '无需额外操作，直接返回答案。',
    badges: {
      rag: 'RAG 检索',
      web: '网络搜索',
      tool: '工具调用',
    },
    participants: {
      user: '你',
      agent: '智能体',
    },
  },
  'zh-hant': {
    title: 'Agent RAG 示範',
    subtitle: '上傳文件、切換能力，觀察智慧體如何規劃工作流程。',
    uploadLabel: 'RAG 文件',
    uploadHint: '拖曳檔案或點擊選擇',
    uploaded: '已上傳',
    knowledgeBaseTitle: '知識庫',
    knowledgeBaseDescription: '上傳領域文件，讓答案更有依據。',
    supportedFormats: '支援 txt、doc 格式',
    webSearch: '啟用網路搜尋',
    webSearchTitle: '網路搜尋',
    webSearchDescription: '需要最新資訊時授權智慧體連網。',
    tools: '啟用工具',
    toolsTitle: '工具呼叫',
    toolsDescription: '挑選智慧體可使用的工具，延伸能力。',
    chooseTools: '可用工具',
    modelTitle: '大模型選擇',
    modelDescription: '決定智慧體回覆時會使用的大型語言模型。',
    modelLabel: '可用模型',
    language: '介面語言',
    chatTitle: '聊天練習場',
    chatSubtitle: '智慧體循環視覺化',
    inputPlaceholder: '向智慧體提問...',
    send: '傳送',
    clear: '清除對話',
    welcome: '你好！我會在需要時自動決定是否使用 RAG、搜尋或工具。',
    reasoning: '智慧體推理',
    using: '使用',
    idle: '無需額外操作，直接回覆答案。',
    badges: {
      rag: 'RAG 檢索',
      web: '網路搜尋',
      tool: '工具呼叫',
    },
    participants: {
      user: '你',
      agent: '智慧體',
    },
  },
} as const

type Language = keyof typeof translations

type Message = {
  role: 'user' | 'assistant'
  content: string
  annotations?: string[]
}

const tools: { id: string; label: Record<Language, string> }[] = [
  { id: 'calculator', label: { en: 'Calculator', zh: '计算器', 'zh-hant': '計算器' } },
  { id: 'calendar', label: { en: 'Calendar lookup', zh: '日历查询', 'zh-hant': '行事曆查詢' } },
  { id: 'code', label: { en: 'Code executor', zh: '代码执行器', 'zh-hant': '程式執行器' } },
  { id: 'weather', label: { en: 'Weather API', zh: '天气 API', 'zh-hant': '天氣 API' } },
]

const modelOptions: { id: string; label: Record<Language, string> }[] = [
  { id: 'qwen3', label: { en: 'Qwen 3', zh: 'Qwen 3', 'zh-hant': 'Qwen 3' } },
  { id: 'gemma3', label: { en: 'Gemma 3', zh: 'Gemma 3', 'zh-hant': 'Gemma 3' } },
  { id: 'gpt-oss', label: { en: 'GPT-OSS', zh: 'GPT-OSS', 'zh-hant': 'GPT-OSS' } },
]

function App() {
  const [language, setLanguage] = useState<Language>('zh')
  const t = translations[language]
  const [documents, setDocuments] = useState<File[]>([])
  const [enableWebSearch, setEnableWebSearch] = useState(true)
  const [enableTools, setEnableTools] = useState(true)
  const [selectedModel, setSelectedModel] = useState(modelOptions[0].id)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: t.welcome }])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const leftPanelRef = useRef<HTMLElement | null>(null)
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const chatWindowRef = useRef<HTMLDivElement | null>(null)

  const actionBadges = t.badges

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return
    setDocuments(Array.from(event.target.files))
  }

  const simulateAgent = async (userMessage: string) => {
    const needsRag = documents.length > 0 && /doc|资料|資料|paper/i.test(userMessage)
    const needsWeb = enableWebSearch && /\?|news|最新|weather|天氣/i.test(userMessage)
    const needsTool = enableTools && /calc|计算|計算|schedule|行程/i.test(userMessage)

    const annotations: string[] = []
    if (needsRag) annotations.push(actionBadges.rag)
    if (needsWeb) annotations.push(actionBadges.web)
    if (needsTool) annotations.push(actionBadges.tool)

    const utilization = annotations.length
      ? `${t.using} ${annotations.join(' + ')}`
      : t.idle

    const currentModelLabel =
      modelOptions.find((option) => option.id === selectedModel)?.label[language] ?? selectedModel

    const answer =
      language === 'en'
        ? `I reviewed your message using ${currentModelLabel} and ${utilization.toLowerCase()}.
Key takeaways: ${userMessage}`
        : language === 'zh'
          ? `我在 ${currentModelLabel} 的帮助下分析了你的输入，并且${utilization}。
要点：${userMessage}`
          : `我在 ${currentModelLabel} 的協助下分析了你的輸入，並且${utilization}。
重點：${userMessage}`

    return annotations.length ? { content: answer, annotations } : { content: answer }
  }

  const handleSend = async () => {
    if (!input.trim()) return
    setPending(true)
    const newMessage: Message = { role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, newMessage])
    const prompt = input.trim()
    setInput('')

    const payload = {
      model: selectedModel,
      enableWebSearch,
      enableTools,
      message: prompt,
    }

    try {
      const csrfToken = getCsrfToken()
      await fetch('http://47.242.1.178:12355', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      console.error('Failed to notify backend about the new message', error)
    }

    const response = await simulateAgent(prompt)
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', ...response }])
      setPending(false)
    }, 450)
  }

  const handleClear = () => {
    setMessages([{ role: 'assistant', content: t.welcome }])
  }

  useEffect(() => {
    const updatePanelHeight = () => {
      if (leftPanelRef.current) {
        setPanelHeight(leftPanelRef.current.offsetHeight)
      }
    }

    updatePanelHeight()

    const resizeObserver = leftPanelRef.current
      ? new ResizeObserver(updatePanelHeight)
      : null

    if (leftPanelRef.current && resizeObserver) {
      resizeObserver.observe(leftPanelRef.current)
    }

    window.addEventListener('resize', updatePanelHeight)

    return () => {
      window.removeEventListener('resize', updatePanelHeight)
      resizeObserver?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTo({
        top: chatWindowRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, pending])

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 p-4 text-base-content md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex justify-end">
          <div className="flex items-center gap-3 rounded-full border border-base-300 bg-base-100 px-4 py-2 shadow-sm">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
              {t.language}
            </span>
            <div className="join">
              <button
                className={`btn btn-sm join-item ${language === 'zh' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLanguage('zh')}
              >
                简体中文
              </button>
              <button
                className={`btn btn-sm join-item ${language === 'zh-hant' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLanguage('zh-hant')}
              >
                繁體中文
              </button>
              <button
                className={`btn btn-sm join-item ${language === 'en' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setLanguage('en')}
              >
                English
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <section
            ref={leftPanelRef}
            className="card flex min-h-0 flex-1 flex-col border border-base-300 bg-base-100 shadow-xl"
          >
            <div className="card-body flex h-full min-h-0 flex-col">
              <header>
                <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                  {t.title}
                </p>
                <h1 className="text-3xl font-bold">Agentic RAG</h1>
                <p className="mt-2 text-sm opacity-80">{t.subtitle}</p>
              </header>

              <div className="space-y-6">
                <div className="rounded-2xl border border-base-300 bg-base-100/70 p-5 shadow-sm">
                  <p className="text-base font-semibold text-primary">{t.modelTitle}</p>
                  <p className="mb-4 mt-2 text-sm opacity-70">{t.modelDescription}</p>
                  <label className="label" htmlFor="model-select">
                    <span className="label-text font-semibold">{t.modelLabel}</span>
                  </label>
                  <select
                    id="model-select"
                    className="select select-bordered w-full"
                    value={selectedModel}
                    onChange={(event) => setSelectedModel(event.target.value)}
                  >
                    {modelOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label[language]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100/70 p-5 shadow-sm">
                  <p className="text-base font-semibold text-primary">
                    {t.knowledgeBaseTitle}
                  </p>
                  <p className="mb-4 mt-2 text-sm opacity-70">{t.knowledgeBaseDescription}</p>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-semibold">{t.uploadLabel}</span>
                      <span className="label-text-alt opacity-70">
                        {documents.length ? `${documents.length} ${t.uploaded}` : t.uploadHint}
                      </span>
                    </label>
                    <input
                      type="file"
                      accept=".txt,.doc"
                      multiple
                      className="file-input file-input-bordered"
                      onChange={handleUpload}
                    />
                    <p className="mt-2 text-xs text-base-content/60">{t.supportedFormats}</p>
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
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100/70 p-5 shadow-sm">
                  <p className="text-base font-semibold text-primary">
                    {t.webSearchTitle}
                  </p>
                  <p className="mb-4 mt-2 text-sm opacity-70">{t.webSearchDescription}</p>
                  <label className="label cursor-pointer justify-start gap-4">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={enableWebSearch}
                      onChange={(event) => setEnableWebSearch(event.target.checked)}
                    />
                    <span className="label-text font-semibold">{t.webSearch}</span>
                  </label>
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100/70 p-5 shadow-sm">
                  <p className="text-base font-semibold text-primary">
                    {t.toolsTitle}
                  </p>
                  <p className="mb-4 mt-2 text-sm opacity-70">{t.toolsDescription}</p>
                  <label className="label cursor-pointer justify-start gap-4">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={enableTools}
                      onChange={(event) => setEnableTools(event.target.checked)}
                    />
                    <span className="label-text font-semibold">{t.tools}</span>
                  </label>
                  <div className="divider my-3" />
                  <p className="text-sm font-semibold">{t.chooseTools}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {tools.map((tool) => (
                      <div
                        key={tool.id}
                        className="rounded-box border border-base-200 bg-base-100/80 p-3 text-sm font-medium"
                      >
                        {tool.label[language]}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

        <section
          className="card flex min-h-0 flex-1 flex-col overflow-hidden border border-base-300 bg-base-100 shadow-xl"
          style={panelHeight ? { height: panelHeight } : undefined}
        >
          <div className="card-body flex h-full min-h-0 flex-col">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{t.chatTitle}</h2>
                <p className="text-sm opacity-70">{t.chatSubtitle}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                {t.clear}
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div
                ref={chatWindowRef}
                className="chat-window flex-1 min-h-0 overflow-y-auto rounded-box border border-base-200 p-4"
              >
                {messages.map((message, index) => (
                  <div key={index} className={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className="chat-header mb-1 text-xs uppercase tracking-wide opacity-60">
                      {message.role === 'user' ? t.participants.user : t.participants.agent}
                    </div>
                    <div className="chat-bubble max-w-full whitespace-pre-line text-left">
                      {message.content}
                    </div>
                    {message.annotations?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.annotations.map((annotation) => (
                          <div key={annotation} className="badge badge-outline">
                            {annotation}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {pending && (
                  <div className="chat chat-start opacity-70">
                    <div className="chat-bubble animate-pulse">...</div>
                  </div>
                )}
              </div>

              <label className="form-control w-full">
                <textarea
                  className="textarea textarea-bordered w-full"
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
    </div>
  )
}

export default App
