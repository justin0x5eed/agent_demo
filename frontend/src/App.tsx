import { useEffect, useRef, useState } from 'react'
import './App.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
  annotations?: string[]
}

const modelLabels: Record<string, string> = {
  qwen3: 'Qwen 3',
  gemma3: 'Gemma 3',
  'gpt-oss': 'GPT-OSS',
}

const tools = [
  { id: 'code', label: 'Code Interpreter' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'scraper', label: 'Web Scraper' },
]

const getCsrfToken = () => {
  if (typeof document === 'undefined') return ''
  return document.querySelector("meta[name='csrf-token']")?.getAttribute('content') ?? ''
}

const formatBackendResponse = (data: unknown): string => {
  if (data === null || typeof data === 'undefined') {
    return 'No response received from backend.'
  }

  if (typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2)
    } catch (error) {
      console.warn('Failed to stringify backend payload', error)
    }
  }

  return String(data)
}

const readBackendModels = (): Record<string, string> => {
  if (typeof document === 'undefined') return {}

  const root = document.getElementById('vite_root')
  if (!root) return {}

  const raw = root.getAttribute('data-models')
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn('Failed to parse backend models data attribute', error)
    return {}
  }
}

function App() {
  const backendModels = readBackendModels()
  const availableModelIds = Object.keys(backendModels)
  const modelOptions: { id: string; label: string }[] =
    (availableModelIds.length > 0 ? availableModelIds : Object.keys(modelLabels)).map((id) => ({
      id,
      label: backendModels[id] ?? modelLabels[id] ?? id,
    }))

  const [documents, setDocuments] = useState<File[]>([])
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>(
    'idle',
  )
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(true)
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => modelOptions[0]?.id ?? '')
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set(['code', 'calculator']))
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I can decide when to use RAG, web search, or tools while answering.',
    },
  ])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const chatWindowRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const toolsEnabled = selectedTools.size > 0

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return

    const selectedFiles = Array.from(event.target.files)
    setDocuments(selectedFiles)
    setUploadStatus('uploading')
    setUploadError(null)

    const csrfToken = getCsrfToken()

    try {
      await Promise.all(
        selectedFiles.map(async (file) => {
          const formData = new FormData()
          formData.append('file', file)

          const response = await fetch('/api/upload/', {
            method: 'POST',
            headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined,
            body: formData,
          })

          if (!response.ok) {
            let detail: string | undefined
            try {
              const payload = await response.json()
              if (payload && typeof payload === 'object' && 'detail' in payload) {
                detail = String((payload as { detail?: string }).detail)
              }
            } catch (error) {
              console.warn('Failed to parse upload error response', error)
            }
            throw new Error(detail ?? `Upload failed with status ${response.status}`)
          }
        }),
      )
      setUploadStatus('success')
    } catch (error) {
      console.error('Failed to upload document(s)', error)
      setUploadStatus('error')
      setUploadError(error instanceof Error ? error.message : String(error))
    } finally {
      event.target.value = ''
    }
  }

  const simulateAgent = async (userMessage: string) => {
    const needsRag = knowledgeBaseEnabled && documents.length > 0
    const needsWeb = enableWebSearch && /\?|news|latest|weather/i.test(userMessage)
    const needsTool = toolsEnabled && /calc|calculate|schedule/i.test(userMessage)

    const annotations: string[] = []
    if (needsRag) annotations.push('RAG lookup')
    if (needsWeb) annotations.push('Web search')
    if (needsTool) annotations.push('Tool call')

    const utilization = annotations.length
      ? `Using ${annotations.join(' + ')}`
      : 'No extra actions were required. Returning the answer.'

    const currentModelLabel =
      modelOptions.find((option) => option.id === selectedModel)?.label ?? selectedModel

    const answer = `I reviewed your message using ${currentModelLabel}. ${utilization} Key takeaways: ${userMessage}`

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
      enableTools: toolsEnabled,
      message: prompt,
      file: knowledgeBaseEnabled && documents.length > 0 ? documents.map((doc) => doc.name) : null,
    }

    try {
      const csrfToken = getCsrfToken()
      const response = await fetch('/api/message/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`)
      }

      let backendPayload: unknown = null
      try {
        backendPayload = await response.json()
      } catch (error) {
        console.warn('Failed to parse backend JSON response', error)
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: formatBackendResponse(backendPayload) },
      ])
    } catch (error) {
      console.error('Failed to fetch backend response, falling back to simulation', error)
      const fallbackResponse = await simulateAgent(prompt)
      setMessages((prev) => [...prev, { role: 'assistant', ...fallbackResponse }])
    } finally {
      setPending(false)
    }
  }

  const handleClear = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Hello! I can decide when to use RAG, web search, or tools while answering.',
      },
    ])
  }

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTo({
        top: chatWindowRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, pending])

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#f6f7f8] text-slate-900 dark:bg-[#101822]">
      <div className="flex flex-1">
        <aside className="flex w-full max-w-sm flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#101822]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 py-2">
              <div
                className="size-10 rounded-full bg-cover bg-center bg-no-repeat"
                aria-label="Gradient avatar"
                style={{
                  backgroundImage:
                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBEGu_GjZyb6b6Uwr2Dzry91eZy44Fp1koknk_8KusSk_5gukx6_EK4olhLseSGUSlumIC87t9yYWtys_Y2lGjJhtpEhZvrxp3qllfVoFMA53-4p17C1TNXkO9IUqlAcQ-SNOOUBdfLAYFexTlkr05IvwAr4eEHFW_tlLYikWFBMzuCGk3vVRX1hEotGIZBVzvWXvo1jwBoV-ogNgOZ9H2c80nnIBfVentHbqm8XVYuGJY_zs5RamBARhFDJHCdlbJvm11v9aCtW8Y')",
                }}
              />
              <div className="flex flex-col">
                <h1 className="text-base font-medium leading-normal text-slate-900 dark:text-white">
                  Agentic RAG
                </h1>
                <p className="text-sm font-normal leading-normal text-slate-500 dark:text-slate-400">DEMO</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <details
                className="group flex flex-col rounded-xl border border-slate-200 bg-transparent px-4 py-2 dark:border-slate-800"
                open
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">
                      model_training
                    </span>
                    <p className="text-sm font-medium leading-normal text-slate-900 dark:text-white">Model</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">
                    expand_more
                  </span>
                </summary>
                <div className="py-2">
                  <label className="flex min-w-40 flex-1 flex-col">
                    <select
                      className="h-14 w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl border border-slate-200 bg-[#f6f7f8] p-3 text-base font-normal leading-normal text-slate-900 placeholder:text-slate-500 focus:border-[#2b7cee] focus:outline-0 focus:ring-2 focus:ring-[#2b7cee]/50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white"
                      value={selectedModel}
                      onChange={(event) => setSelectedModel(event.target.value)}
                    >
                      {modelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>

              <details className="group flex flex-col rounded-xl border border-slate-200 bg-transparent px-4 py-2 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">database</span>
                    <p className="text-sm font-medium leading-normal text-slate-900 dark:text-white">
                      Knowledge Base
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">
                    expand_more
                  </span>
                </summary>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex items-center justify-between">
                    <p className="flex-1 truncate text-sm font-normal leading-normal text-slate-900 dark:text-white">
                      Enable Knowledge Base
                    </p>
                    <div className="shrink-0">
                      <label className="has-[:checked]:justify-end has-[:checked]:bg-[#2b7cee] relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none bg-slate-200 p-0.5 dark:bg-slate-700">
                        <div
                          className="h-full w-[27px] rounded-full bg-white transition-transform"
                          style={{ boxShadow: 'rgba(0, 0, 0, 0.15) 0px 3px 8px, rgba(0, 0, 0, 0.06) 0px 3px 1px' }}
                        />
                        <input
                          checked={knowledgeBaseEnabled}
                          className="invisible absolute"
                          type="checkbox"
                          onChange={(event) => setKnowledgeBaseEnabled(event.target.checked)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 dark:border-slate-700">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <p className="text-base font-medium leading-tight text-slate-900 dark:text-white">
                        Drag & drop files
                      </p>
                      <p className="text-sm font-normal leading-normal text-slate-500 dark:text-slate-400">
                        or browse to upload
                      </p>
                    </div>
                    <button
                      className="flex h-10 min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100 px-4 text-sm font-bold leading-normal tracking-[0.015em] text-slate-900 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                      onClick={() => fileInputRef.current?.click()}
                      type="button"
                    >
                      <span className="truncate">Browse Files</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.doc"
                      multiple
                      className="hidden"
                      onChange={handleUpload}
                    />
                    {uploadStatus === 'uploading' && (
                      <p className="text-sm text-[#2b7cee]">Embedding...</p>
                    )}
                    {uploadStatus === 'success' && (
                      <p className="text-sm text-green-600">Files embedded successfully.</p>
                    )}
                    {uploadStatus === 'error' && (
                      <p className="text-sm text-red-500">
                        Upload failed. {uploadError ? `(${uploadError})` : 'Please try again.'}
                      </p>
                    )}
                  </div>

                  {documents.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {documents.map((file) => (
                        <div
                          key={file.name}
                          className="flex items-center gap-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800"
                        >
                          <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">
                            description
                          </span>
                          <p className="flex-1 truncate text-sm font-normal leading-normal text-slate-900 dark:text-white">
                            {file.name}
                          </p>
                          <button
                            className="text-slate-500 transition-colors hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                            type="button"
                            onClick={() => setDocuments((prev) => prev.filter((doc) => doc.name !== file.name))}
                          >
                            <span className="material-symbols-outlined !text-[20px]">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              <details className="group flex flex-col rounded-xl border border-slate-200 bg-transparent px-4 py-2 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">travel_explore</span>
                    <p className="text-sm font-medium leading-normal text-slate-900 dark:text-white">
                      Web Search
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">
                    expand_more
                  </span>
                </summary>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex items-center justify-between">
                    <p className="flex-1 truncate text-sm font-normal leading-normal text-slate-900 dark:text-white">
                      Enable Web Search
                    </p>
                    <div className="shrink-0">
                      <label className="has-[:checked]:justify-end has-[:checked]:bg-[#2b7cee] relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none bg-slate-200 p-0.5 dark:bg-slate-700">
                        <div
                          className="h-full w-[27px] rounded-full bg-white transition-transform"
                          style={{ boxShadow: 'rgba(0, 0, 0, 0.15) 0px 3px 8px, rgba(0, 0, 0, 0.06) 0px 3px 1px' }}
                        />
                        <input
                          className="invisible absolute"
                          type="checkbox"
                          checked={enableWebSearch}
                          onChange={(event) => setEnableWebSearch(event.target.checked)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </details>

              <details className="group flex flex-col rounded-xl border border-slate-200 bg-transparent px-4 py-2 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">apps</span>
                    <p className="text-sm font-medium leading-normal text-slate-900 dark:text-white">Tools</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400">
                    expand_more
                  </span>
                </summary>
                <div className="flex flex-col gap-3 py-2">
                  {tools.map((tool) => (
                    <label key={tool.id} className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded-md border-slate-300 text-[#2b7cee] accent-[#2b7cee] focus:ring-[#2b7cee]/50 dark:border-slate-600 dark:bg-slate-800"
                        checked={selectedTools.has(tool.id)}
                        onChange={() => toggleTool(tool.id)}
                      />
                      <span className="text-sm font-normal text-slate-900 dark:text-white">{tool.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-6 md:p-8">
          <div className="flex h-full flex-col gap-6">
            <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Agentic RAG Demo
                </p>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Chat playground</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Upload documents, toggle capabilities, and watch the agent plan its work.
                </p>
              </div>
              <button
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-white"
                type="button"
                onClick={handleClear}
              >
                Clear chat
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
              <div
                ref={chatWindowRef}
                className="chat-window flex-1 min-h-0 space-y-4 overflow-y-auto rounded-xl border border-dashed border-slate-200 bg-[#f6f7f8] p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                {messages.map((message, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="material-symbols-outlined text-base">
                        {message.role === 'user' ? 'person' : 'smart_toy'}
                      </span>
                      {message.role === 'user' ? 'You' : 'Agent'}
                    </div>
                    <div className={`max-w-full whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-sm ${message.role === 'user' ? 'bg-white text-slate-900 dark:bg-slate-700 dark:text-white' : 'bg-[#2b7cee] text-white'}`}>
                      {message.content}
                    </div>
                    {message.annotations?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {message.annotations.map((annotation) => (
                          <span
                            key={annotation}
                            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-200"
                          >
                            {annotation}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {pending && (
                  <div className="flex flex-col gap-2 opacity-70">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="material-symbols-outlined text-base">smart_toy</span>
                      Agent
                    </div>
                    <div className="max-w-full rounded-2xl bg-slate-200 px-4 py-3 text-sm text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white">
                      ...
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Ask anything
                  <textarea
                    className="min-h-[96px] w-full resize-none rounded-xl border border-slate-200 bg-[#f6f7f8] p-3 text-base text-slate-900 focus:border-[#2b7cee] focus:outline-none focus:ring-2 focus:ring-[#2b7cee]/50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="Ask anything to the agent..."
                    rows={3}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    type="button"
                    onClick={handleClear}
                  >
                    Clear chat
                  </button>
                  <button
                    className="rounded-full bg-[#2b7cee] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2365c1] disabled:opacity-50"
                    type="button"
                    onClick={handleSend}
                    disabled={pending}
                  >
                    {pending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
