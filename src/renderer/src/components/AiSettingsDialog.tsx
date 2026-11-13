import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, X } from 'lucide-react'
import type { ProviderId, ProviderStatus } from '@shared/ai'

interface AiSettingsDialogProps {
  providers: ProviderStatus[]
  onChanged: () => void
  onClose: () => void
}

function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : 'The request failed.'
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export default function AiSettingsDialog({ providers, onChanged, onClose }: AiSettingsDialogProps) {
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({})
  const [busy, setBusy] = useState<ProviderId | null>(null)
  const [messages, setMessages] = useState<Partial<Record<ProviderId, { ok: boolean; text: string }>>>({})
  const [compatible, setCompatible] = useState({ name: '', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: '', supportsAgent: false })
  const [compatibleBusy, setCompatibleBusy] = useState(false)
  const [compatibleMessage, setCompatibleMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = async (id: ProviderId) => {
    const key = drafts[id]?.trim()
    if (!key) return
    setBusy(id)
    try {
      const models = await window.desktop.saveAiKey(id, key)
      setDrafts((current) => ({ ...current, [id]: '' }))
      setMessages((current) => ({ ...current, [id]: { ok: true, text: `Connected. ${models.length} models available.` } }))
      onChanged()
    } catch (cause) {
      setMessages((current) => ({ ...current, [id]: { ok: false, text: errorMessage(cause) } }))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (provider: ProviderStatus) => {
    if (!window.confirm(`Remove the saved ${provider.name} API key?`)) return
    try {
      await window.desktop.removeAiKey(provider.id)
      setMessages((current) => ({ ...current, [provider.id]: { ok: true, text: 'Key removed.' } }))
      onChanged()
    } catch (cause) {
      setMessages((current) => ({ ...current, [provider.id]: { ok: false, text: errorMessage(cause) } }))
    }
  }

  const checkLocalServer = async (provider: ProviderStatus) => {
    setBusy(provider.id)
    try {
      const models = await window.desktop.listAiModels(provider.id, true)
      setMessages((current) => ({ ...current, [provider.id]: { ok: true, text: `${provider.name} is responding. ${models.length} models available.` } }))
      onChanged()
    } catch (cause) {
      setMessages((current) => ({ ...current, [provider.id]: { ok: false, text: errorMessage(cause) } }))
    } finally {
      setBusy(null)
    }
  }

  const addCompatible = async () => {
    setCompatibleBusy(true)
    setCompatibleMessage(null)
    try {
      const provider = await window.desktop.addCompatibleAiProvider(compatible)
      setCompatibleMessage({ ok: true, text: `${provider.name} connected. ${provider.endpoint}` })
      setCompatible({ name: '', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: '', supportsAgent: false })
      onChanged()
    } catch (cause) {
      setCompatibleMessage({ ok: false, text: errorMessage(cause) })
    } finally {
      setCompatibleBusy(false)
    }
  }

  const removeCompatible = async (provider: ProviderStatus) => {
    if (!window.confirm(`Remove ${provider.name} and its saved API key?`)) return
    try {
      await window.desktop.removeCompatibleAiProvider(provider.id)
      setMessages((current) => ({ ...current, [provider.id]: { ok: true, text: 'Provider removed.' } }))
      onChanged()
    } catch (cause) {
      setMessages((current) => ({ ...current, [provider.id]: { ok: false, text: errorMessage(cause) } }))
    }
  }

  const usePreset = (name: string, baseUrl: string) => setCompatible((current) => ({ ...current, name, baseUrl }))

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <div className="modal-header">
          <h2 id="ai-settings-title"><KeyRound size={16} /> AI providers</h2>
          <button className="icon-button small" title="Close" onClick={onClose}><X size={15} /></button>
        </div>
        <p className="modal-note">
          Cloud keys are verified and encrypted on this computer. For any OpenAI-compatible server, enter its base URL ending in <code>/v1</code>; an API key is optional for local servers.
        </p>
        <div className="provider-list">
          {providers.map((provider) => {
            const message = messages[provider.id]
            return (
              <div key={provider.id} className="provider-row">
                <div className="provider-title">
                  <strong>{provider.name}</strong>
                  {provider.kind === 'local-server' ? (
                    <span className="provider-badge">Local · 127.0.0.1:8000</span>
                  ) : provider.configured
                    ? <span className="provider-badge connected"><CheckCircle2 size={12} /> Connected</span>
                    : <span className="provider-badge">Not connected</span>}
                  {provider.kind !== 'openai-compatible' ? (
                    <button className="link-button" onClick={() => void window.desktop.openAiKeyPage(provider.id)}>
                      {provider.kind === 'local-server' ? 'Model setup' : 'Get a key'} <ExternalLink size={11} />
                    </button>
                  ) : null}
                </div>
                {provider.kind === 'local-server' ? (
                  <div className="provider-form">
                    <p className="local-provider-note">Start a local vLLM server for <code>vngrs-ai/Kumru-2B</code>, then check the connection. No API key is sent or stored.</p>
                    <button type="button" className="toolbar-button save-button" disabled={busy !== null} onClick={() => void checkLocalServer(provider)}>
                      {busy === provider.id ? 'Checking…' : 'Check server'}
                    </button>
                  </div>
                ) : provider.kind === 'openai-compatible' ? (
                  <div className="provider-form compatible-provider-info">
                    <code title={provider.endpoint}>{provider.endpoint}</code>
                    <button type="button" className="toolbar-button" disabled={busy !== null} onClick={() => void checkLocalServer(provider)}>
                      {busy === provider.id ? 'Checking…' : 'Refresh models'}
                    </button>
                    <button type="button" className="toolbar-button" disabled={busy !== null} onClick={() => void removeCompatible(provider)}>Remove</button>
                  </div>
                ) : (
                  <form className="provider-form" onSubmit={(event) => { event.preventDefault(); void save(provider.id) }}>
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={provider.configured ? 'Enter a new key to replace the saved one' : 'Paste API key'}
                      value={drafts[provider.id] ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                      disabled={busy !== null}
                    />
                    <button type="submit" className="toolbar-button save-button" disabled={busy !== null || !drafts[provider.id]?.trim()}>
                      {busy === provider.id ? 'Testing…' : 'Save & test'}
                    </button>
                    {provider.configured ? (
                      <button type="button" className="toolbar-button" disabled={busy !== null} onClick={() => void remove(provider)}>Remove</button>
                    ) : null}
                  </form>
                )}
                {message ? <div className={`provider-message ${message.ok ? 'ok' : 'error'}`}>{message.text}</div> : null}
              </div>
            )
          })}
        </div>
        <section className="compatible-provider-add">
          <h3>Add an OpenAI-compatible provider</h3>
          <p className="modal-note">Works with local servers and hosted endpoints that implement <code>/v1/models</code> and <code>/v1/chat/completions</code>.</p>
          <div className="provider-presets">
            <button type="button" onClick={() => usePreset('LM Studio', 'http://127.0.0.1:1234/v1')}>LM Studio</button>
            <button type="button" onClick={() => usePreset('Ollama', 'http://127.0.0.1:11434/v1')}>Ollama</button>
            <button type="button" onClick={() => usePreset('Kumru · vLLM', 'http://127.0.0.1:8000/v1')}>Kumru · vLLM</button>
          </div>
          <form className="compatible-provider-form" onSubmit={(event) => { event.preventDefault(); void addCompatible() }}>
            <label>Provider name<input value={compatible.name} onChange={(event) => setCompatible((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. My local model" maxLength={60} /></label>
            <label>Base URL<input value={compatible.baseUrl} onChange={(event) => setCompatible((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></label>
            <label>API key <span>(optional for local servers)</span><input type="password" autoComplete="off" spellCheck={false} value={compatible.apiKey} onChange={(event) => setCompatible((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Leave blank when not required" /></label>
            <label className="compatible-agent-option"><input type="checkbox" checked={compatible.supportsAgent} onChange={(event) => setCompatible((current) => ({ ...current, supportsAgent: event.target.checked }))} /> Enable Agent tools when this model supports function calling</label>
            <button type="submit" className="toolbar-button save-button" disabled={compatibleBusy || !compatible.name.trim() || !compatible.baseUrl.trim()}>
              {compatibleBusy ? 'Connecting…' : 'Connect & test'}
            </button>
          </form>
          <p className="compatible-provider-security">Remote addresses must use HTTPS; plain HTTP is limited to localhost. Any key you enter is sent to that endpoint and encrypted locally. Chat text and attached code are sent to the selected provider.</p>
          {compatibleMessage ? <div className={`provider-message ${compatibleMessage.ok ? 'ok' : 'error'}`}>{compatibleMessage.text}</div> : null}
        </section>
      </div>
    </div>
  )
}
