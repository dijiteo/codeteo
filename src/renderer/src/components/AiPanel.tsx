import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, FileCode2, KeyRound, Pencil, RefreshCw, RotateCcw, SendHorizontal, Square, Trash2, X } from 'lucide-react'
import type { AIModel, ChatContextFile, ChatMessage, ProviderId, ProviderStatus } from '@shared/ai'
import { localizeError } from '../localize'

interface AiPanelProps {
  visible: boolean
  providers: ProviderStatus[]
  workspacePath: string
  activeFile: ChatContextFile | null
  defaultAgentMode: boolean
  defaultAttachFile: boolean
  hasUnsavedChanges: boolean
  onFileChanged(path: string, content: string): void
  onOpenSettings: () => void
  onClose: () => void
}

type Turn = ChatMessage & { id: string; error?: string }

interface Usage { input: number; output: number }

interface ApprovalRequest {
  chatId: string
  callId: string
  workspace: string
  action:
    | { kind: 'write-file'; path: string; before: string; after: string }
    | { kind: 'run-command'; command: string }
}

function MessageBody({ content }: { content: string }) {
  const parts = content.split(/```[^\n]*\n?/)
  return (
    <>
      {parts.map((part, index) => index % 2 === 1
        ? <pre key={index} className="ai-code"><code>{part.replace(/\n$/, '')}</code></pre>
        : part ? <Fragment key={index}>{part}</Fragment> : null)}
    </>
  )
}

export default function AiPanel({ visible, providers, workspacePath, activeFile, defaultAgentMode, defaultAttachFile, hasUnsavedChanges, onFileChanged, onOpenSettings, onClose }: AiPanelProps) {
  const configured = providers.filter((provider) => provider.configured)
  const [providerId, setProviderId] = useState<ProviderId | null>(null)
  const [modelId, setModelId] = useState('')
  const [models, setModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [attachFile, setAttachFile] = useState(defaultAttachFile)
  const [agentMode, setAgentMode] = useState(defaultAgentMode)
  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage>({ input: 0, output: 0 })
  const [error, setError] = useState('')
  const [selectionLoaded, setSelectionLoaded] = useState(false)
  const chatIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectedProvider = providers.find((provider) => provider.id === providerId)

  useEffect(() => {
    void window.desktop.getAiSelection().then((selection) => {
      if (selection) {
        setProviderId(selection.providerId)
        setModelId(selection.modelId)
      }
    }).finally(() => setSelectionLoaded(true))
  }, [])

  useEffect(() => {
    if (!selectionLoaded) return
    if (!providerId || !configured.some((provider) => provider.id === providerId)) {
      setProviderId(configured[0]?.id ?? null)
      setModels([])
    }
  }, [configured, providerId, selectionLoaded])

  useEffect(() => {
    if (agentMode && selectedProvider && !selectedProvider.supportsAgent) setAgentMode(false)
  }, [agentMode, selectedProvider?.supportsAgent])

  useEffect(() => setAttachFile(defaultAttachFile), [defaultAttachFile])
  useEffect(() => setAgentMode(defaultAgentMode), [defaultAgentMode])

  const loadModels = useCallback(async (id: ProviderId, refresh: boolean) => {
    setLoadingModels(true)
    try {
      const list = await window.desktop.listAiModels(id, refresh)
      setModels(list)
      setModelId((current) => {
        const preferredGemini = id === 'gemini'
          ? ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']
              .map((candidate) => list.find((model) => model.id === candidate)?.id)
              .find((candidate): candidate is string => Boolean(candidate))
          : undefined
        const next = list.some((model) => model.id === current) ? current : preferredGemini ?? list[0]?.id ?? ''
        if (next) void window.desktop.setAiSelection({ providerId: id, modelId: next })
        return next
      })
      setError('')
    } catch (cause) {
      setModels([])
      setError(localizeError(cause, 'Modeller yüklenemedi.'))
    } finally {
      setLoadingModels(false)
    }
  }, [])

  const configuredKey = configured.map((provider) => provider.id).join(',')
  useEffect(() => {
    if (providerId && configuredKey.split(',').includes(providerId)) void loadModels(providerId, false)
  }, [providerId, configuredKey, loadModels])

  useEffect(() => window.desktop.onAiChatEvent((event) => {
    if (event.chatId !== chatIdRef.current) return
    if (event.type === 'delta') {
      setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, content: turn.content + event.text } : turn))
    } else if (event.type === 'usage') {
      setUsage((current) => ({ input: current.input + (event.inputTokens ?? 0), output: current.output + (event.outputTokens ?? 0) }))
    } else if (event.type === 'approval-request') {
      setApproval({ chatId: event.chatId, callId: event.callId, workspace: event.workspace, action: event.action })
    } else if (event.type === 'file-changed') {
      onFileChanged(event.path, event.content)
    } else {
      if (event.type === 'error') {
        let message = localizeError(event.message, 'İstek başarısız oldu.')
        if (providerId === 'gemini' && /HTTP 404|no longer available|not found/i.test(message)) {
          const suggested = message.match(/models\/([a-zA-Z0-9._-]+)/)?.[1]
          const nextModel = models.find((model) => model.id === suggested)?.id ??
            ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']
              .map((candidate) => models.find((model) => model.id === candidate)?.id)
              .find((candidate): candidate is string => Boolean(candidate) && candidate !== modelId) ??
            models.find((model) => model.id !== modelId)?.id
          if (nextModel) {
            setModelId(nextModel)
            void window.desktop.setAiSelection({ providerId: 'gemini', modelId: nextModel })
            message = `Bu Gemini modeli kullanılamıyor. ${nextModel} modeline geçildi; isteği yeniden deneyebilirsin.`
          }
        }
        setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, error: message } : turn))
      }
      setApproval(null)
      chatIdRef.current = null
      setChatId(null)
    }
  }), [modelId, models, onFileChanged, providerId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [turns])

  const selectModel = (id: string) => {
    setModelId(id)
    if (providerId && id) void window.desktop.setAiSelection({ providerId, modelId: id })
  }

  const send = async (retry?: { text: string; history: ChatMessage[]; baseTurns: Turn[] }) => {
    const text = (retry?.text ?? input).trim()
    if (!text || chatId || !providerId || !modelId) return
    const history: ChatMessage[] = retry?.history ?? turns.filter((turn) => !turn.error).map(({ role, content }) => ({ role, content }))
    const baseTurns = retry?.baseTurns ?? turns
    const id = crypto.randomUUID()
    chatIdRef.current = id
    setChatId(id)
    setInput('')
    setError('')
    setTurns([
      ...baseTurns,
      { id: `${id}-user`, role: 'user', content: text },
      { id: `${id}-assistant`, role: 'assistant', content: '' },
    ])
    try {
      await window.desktop.startAiChat(id, {
        providerId,
        modelId,
        messages: [...history, { role: 'user', content: text }],
        contextFile: attachFile && activeFile ? activeFile : undefined,
        agentMode,
      })
    } catch (cause) {
      chatIdRef.current = null
      setChatId(null)
      setTurns((current) => current.map((turn, index) => index === current.length - 1 ? { ...turn, error: localizeError(cause, 'İstek başarısız oldu.') } : turn))
    }
  }

  const editPrompt = (index: number) => {
    const turn = turns[index]
    if (turn?.role !== 'user' || chatId) return
    setTurns(turns.slice(0, index))
    setInput(turn.content)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const retryPrompt = (index: number) => {
    const failedTurn = turns[index]
    const userTurn = turns[index - 1]
    if (!failedTurn?.error || userTurn?.role !== 'user' || chatId) return
    const baseTurns = turns.slice(0, index - 1)
    const history = baseTurns.filter((turn) => !turn.error).map(({ role, content }) => ({ role, content }))
    void send({ text: userTurn.content, history, baseTurns })
  }

  const stop = () => {
    if (chatId) void window.desktop.cancelAiChat(chatId)
  }

  const respondToApproval = async (approved: boolean) => {
    if (!approval) return
    const pending = approval
    setApproval(null)
    try {
      await window.desktop.respondToAiApproval(pending.chatId, pending.callId, approved)
    } catch (cause) {
      setError(localizeError(cause, 'Onay yanıtı gönderilemedi.'))
    }
  }

  const newChat = () => {
    stop()
    chatIdRef.current = null
    setChatId(null)
    setApproval(null)
    setTurns([])
    setUsage({ input: 0, output: 0 })
  }

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <aside className={`ai-panel ${visible ? '' : 'hidden'}`} aria-label="Yapay zekâ yardımcısı">
      <div className="section-heading">
        <span>YAPAY ZEKÂ YARDIMCISI</span>
        <div className="section-actions">
          <button className="icon-button small" title="Yeni sohbet" onClick={newChat} disabled={!turns.length}><Trash2 size={14} /></button>
          <button className="icon-button small" title="Yapay zekâ sağlayıcıları" onClick={onOpenSettings}><KeyRound size={14} /></button>
          <button className="icon-button small" title="Yapay zekâ panelini kapat" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      {configured.length ? (
        <>
          <div className="ai-messages" ref={scrollRef}>
            {turns.length ? turns.map((turn, index) => (
              <div key={turn.id} className={`ai-message ${turn.role}`}>
                <div className="ai-message-role">{turn.role === 'user' ? 'SEN' : 'ASİSTAN'}</div>
                <div className="ai-message-body">
                  <MessageBody content={turn.content} />
                  {turn.role === 'assistant' && chatId && index === turns.length - 1 && !turn.content ? <span className="ai-typing">Yanıt hazırlanıyor…</span> : null}
                </div>
                {turn.error ? <div className="ai-message-error">{turn.error}</div> : null}
                {turn.role === 'user' && !chatId ? <div className="ai-message-actions"><button onClick={() => editPrompt(index)}><Pencil size={12} /> İsteği düzenle</button></div> : null}
                {turn.role === 'assistant' && turn.error && !chatId ? <div className="ai-message-actions"><button onClick={() => retryPrompt(index)}><RotateCcw size={12} /> Seçili modelle yeniden dene</button></div> : null}
              </div>
            )) : (
              <div className="ai-empty">
                <Bot size={22} />
                <p>Kodun hakkında soru sor. Yanıtlar seçtiğin modelden anlık olarak gelir.</p>
              </div>
            )}
          </div>

          {error ? <div className="ai-error">{error}</div> : null}

          {approval ? (
            <div className="agent-approval" role="dialog" aria-label="Önerilen değişikliği incele">
              {approval.action.kind === 'write-file' ? (
                <>
                  <div className="agent-approval-title">Dosya değişikliğini incele</div>
                  <div className="agent-approval-path">{approval.workspace}\{approval.action.path}</div>
                  <div className="agent-approval-preview">
                    <details><summary>Mevcut içerik</summary><pre>{approval.action.before || '(boş dosya)'}</pre></details>
                    <details open><summary>Önerilen içerik</summary><pre>{approval.action.after || '(boş dosya)'}</pre></details>
                  </div>
                </>
              ) : (
                <>
                  <div className="agent-approval-title">PowerShell komutunu incele</div>
                  <div className="agent-approval-path">Çalışma klasörü: {approval.workspace}</div>
                  <pre className="agent-command-preview">{approval.action.command}</pre>
                  <p className="agent-approval-warning">Runs as your Windows account. Command output will be sent to {selectedProvider?.name}.</p>
                </>
              )}
              {hasUnsavedChanges ? <p className="agent-approval-warning">Onaylamadan önce düzenleyicideki değişiklikleri kaydet veya geri al.</p> : null}
              <div className="agent-approval-actions">
                <button className="toolbar-button" onClick={() => void respondToApproval(false)}>Reddet</button>
                <button className="toolbar-button save-button" disabled={hasUnsavedChanges} onClick={() => void respondToApproval(true)}>
                  {approval.action.kind === 'write-file' ? 'Onayla ve kaydet' : 'Onayla ve çalıştır'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="ai-composer">
            {agentMode ? <div className="agent-mode-note"><strong>Klasör erişimi:</strong> {workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? workspacePath}. Ajan bu klasördeki dosyaları inceleyebilir. Dosya değişiklikleri ve PowerShell komutları için onayın gerekir; dosya silemez veya yeniden adlandıramaz.</div> : null}
            {activeFile ? (
              <label className="ai-attach" title={activeFile.path}>
                <input type="checkbox" checked={attachFile} onChange={(event) => setAttachFile(event.target.checked)} />
                <FileCode2 size={13} /><span>{activeFile.path} dosyasını ekle</span>
              </label>
            ) : null}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Yapay zekâya sor… (Göndermek için Enter, yeni satır için Shift+Enter)"
              rows={3}
            />
            <div className="ai-composer-footer">
              <span className="ai-usage" title="Bu sohbette kullanılan belirteçler">
                {usage.input || usage.output ? `${usage.input.toLocaleString()} in · ${usage.output.toLocaleString()} out` : ''}
              </span>
              {chatId ? (
                <button className="toolbar-button ai-stop" onClick={stop}><Square size={13} /><span>Durdur</span></button>
              ) : (
                <button className="toolbar-button save-button" onClick={() => void send()} disabled={!input.trim() || !modelId}>
                  <SendHorizontal size={14} /><span>Gönder</span>
                </button>
              )}
            </div>
            <div className="ai-model-bar" aria-label="Yapay zekâ model ayarları">
              <select value={providerId ?? ''} onChange={(event) => { setProviderId(event.target.value as ProviderId); setModels([]) }} title="Sağlayıcı">
                {configured.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select>
              <select value={agentMode ? 'agent' : 'chat'} onChange={(event) => setAgentMode(event.target.value === 'agent')} disabled={!selectedProvider?.supportsAgent} title="Sohbet veya çalışma alanı Ajan modu">
                <option value="agent">Ajan</option><option value="chat">Sohbet</option>
              </select>
              <select value={modelId} onChange={(event) => selectModel(event.target.value)} disabled={loadingModels || !models.length} title="Model">
                {models.length ? models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>) : <option value="">{loadingModels ? 'Modeller yükleniyor…' : 'Model yok'}</option>}
              </select>
              <button className="icon-button small" title="Modelleri yenile" disabled={!providerId || loadingModels} onClick={() => providerId && void loadModels(providerId, true)}><RefreshCw size={13} className={loadingModels ? 'spinning' : ''} /></button>
            </div>
          </div>
        </>
      ) : (
        <div className="ai-empty ai-setup">
          <Bot size={24} />
          <p>Başlamak için bir yapay zekâ sağlayıcısı bağla veya yerel Kumru sunucusunu çalıştır.</p>
          <button className="primary-action" onClick={onOpenSettings}><KeyRound size={15} /> API anahtarı ekle</button>
        </div>
      )}
    </aside>
  )
}
