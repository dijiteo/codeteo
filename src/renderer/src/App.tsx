import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Command,
  Download,
  FileCode2,
  FolderOpen,
  GitBranch,
  Keyboard,
  PanelLeft,
  Save,
  RotateCw,
  Settings as SettingsIcon,
  TerminalSquare,
  X,
} from 'lucide-react'
import type { ChatContextFile, ProviderStatus } from '@shared/ai'
import type { AppUpdateState } from '@shared/app-update'
import type { EditorFile, RecentWorkspace, WorkspaceEntry, WorkspaceGitStatus } from '@shared/contracts'
import { readPreferences, writePreferences } from '@shared/preferences'
import type { AppPreferences } from '@shared/preferences'
import AiPanel from './components/AiPanel'
import AiSettingsDialog from './components/AiSettingsDialog'
import SettingsDialog from './components/SettingsDialog'
import { localizeError } from './localize'
import CodeEditor from './components/CodeEditor'
import TerminalPanel from './components/TerminalPanel'
import WorkspaceExplorer from './components/WorkspaceExplorer'

type OpenTab = EditorFile & { dirty: boolean; savedContent: string }

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function isSameOrInside(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}\\`) || path.startsWith(`${ancestor}/`)
}

export default function App() {
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentWorkspace[]>([])
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null)
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [terminalOpened, setTerminalOpened] = useState(false)
  const [terminalSession, setTerminalSession] = useState(0)
  const [error, setError] = useState('')
  const [aiVisible, setAiVisible] = useState(true)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences)
  const [aiProviders, setAiProviders] = useState<ProviderStatus[]>([])
  const [updateState, setUpdateState] = useState<AppUpdateState>({ status: 'idle' })

  const activeTab = useMemo(() => tabs.find((tab) => tab.path === activePath) ?? null, [tabs, activePath])
  const aiContextFile = useMemo<ChatContextFile | null>(() => {
    if (!activeTab || !workspace) return null
    return { path: activeTab.path || activeTab.name, content: activeTab.content }
  }, [activeTab, workspace])

  const refreshAiProviders = useCallback(async () => {
    try {
      setAiProviders(await window.desktop.getAiProviders())
    } catch (cause) {
      setError(localizeError(cause, 'Yapay zekâ sağlayıcı ayarları okunamadı.'))
    }
  }, [])

  useEffect(() => {
    void refreshAiProviders()
  }, [refreshAiProviders])

  useEffect(() => {
    void window.desktop.getAppUpdateState().then(setUpdateState)
    return window.desktop.onAppUpdateState(setUpdateState)
  }, [])

  const handleUpdateAction = async () => {
    try {
      if (updateState.status === 'available') await window.desktop.downloadAppUpdate()
      else if (updateState.status === 'downloaded') await window.desktop.installAppUpdate()
      else setUpdateState(await window.desktop.checkForAppUpdates())
    } catch (cause) {
      setUpdateState({ status: 'error', message: localizeError(cause, 'Güncelleme işlemi başarısız oldu.') })
    }
  }

  const updateLabel = updateState.status === 'checking' ? 'Denetleniyor…'
    : updateState.status === 'available' ? `v${updateState.version} indir`
      : updateState.status === 'downloading' ? `İndiriliyor: %${updateState.percent}`
        : updateState.status === 'downloaded' ? 'Güncellemek için yeniden başlat'
          : updateState.status === 'not-available' ? 'Güncel'
            : updateState.status === 'unavailable' ? 'Yüklü uygulamada kullanılabilir' : 'Güncellemeleri denetle'
  const hasUnsavedChanges = tabs.some((tab) => tab.dirty)

  useEffect(() => {
    window.desktop.setUnsavedChanges(hasUnsavedChanges)
  }, [hasUnsavedChanges])

  const confirmDiscardChanges = useCallback(() => (
    !hasUnsavedChanges || !preferences.confirmBeforeDiscard || window.confirm('Bazı dosyalarda kaydedilmemiş değişiklikler var. Bu değişiklikleri atıp başka bir klasör açılsın mı?')
  ), [hasUnsavedChanges, preferences.confirmBeforeDiscard])

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await window.desktop.getRecentWorkspaces())
    } catch (cause) {
      setError(localizeError(cause, 'Son açılan klasörler okunamadı.'))
    }
  }, [])

  useEffect(() => {
    void refreshRecent()
  }, [refreshRecent])

  const refreshGitStatus = useCallback(async () => {
    try {
      setGitStatus(await window.desktop.getGitStatus())
    } catch (cause) {
      setGitStatus(null)
      setError(localizeError(cause, 'Git durumu okunamadı.'))
    }
  }, [])

  useEffect(() => {
    if (workspace) void refreshGitStatus()
    else setGitStatus(null)
  }, [workspace, refreshGitStatus])

  const setActiveWorkspace = useCallback((path: string) => {
    setWorkspace(path)
    setGitStatus(null)
    setTabs([])
    setActivePath(null)
    setError('')
    setTerminalVisible(false)
    setTerminalOpened(false)
  }, [])

  const chooseWorkspace = useCallback(async () => {
    if (!confirmDiscardChanges()) return
    try {
      const path = await window.desktop.chooseWorkspace()
      if (path) {
        setActiveWorkspace(path)
        await refreshRecent()
      }
    } catch (cause) {
      setError(localizeError(cause, 'Klasör açılamadı.'))
    }
  }, [confirmDiscardChanges, refreshRecent, setActiveWorkspace])

  const openRecentWorkspace = useCallback(async (path: string) => {
    if (!confirmDiscardChanges()) return
    try {
      const opened = await window.desktop.openRecentWorkspace(path)
      setActiveWorkspace(opened)
      await refreshRecent()
    } catch (cause) {
      setError(localizeError(cause, 'Bu klasör artık kullanılamıyor.'))
      await refreshRecent()
    }
  }, [confirmDiscardChanges, refreshRecent, setActiveWorkspace])

  const onEntryRenamed = useCallback((previousPath: string, entry: WorkspaceEntry) => {
    const movePath = (path: string) => isSameOrInside(path, previousPath) ? entry.path + path.slice(previousPath.length) : path
    setTabs((current) => current.map((tab) => isSameOrInside(tab.path, previousPath)
      ? { ...tab, path: movePath(tab.path), name: tab.path === previousPath ? entry.name : tab.name }
      : tab))
    setActivePath((current) => current ? movePath(current) : current)
    void refreshGitStatus()
  }, [refreshGitStatus])

  const onEntryDeleted = useCallback((entry: WorkspaceEntry) => {
    setTabs((current) => {
      const remaining = current.filter((tab) => !isSameOrInside(tab.path, entry.path))
      setActivePath((active) => active && isSameOrInside(active, entry.path) ? remaining.at(-1)?.path ?? null : active)
      return remaining
    })
    void refreshGitStatus()
  }, [refreshGitStatus])

  const toggleTerminal = useCallback(() => {
    setTerminalOpened(true)
    setTerminalVisible((visible) => !visible)
  }, [])

  const openFile = useCallback(async (path: string) => {
    const existing = tabs.find((tab) => tab.path === path)
    if (existing) {
      setActivePath(path)
      return
    }
    try {
      const file = await window.desktop.readFile(path)
      setTabs((current) => [...current, { ...file, dirty: false, savedContent: file.content }])
      setActivePath(file.path)
      setError('')
    } catch (cause) {
      setError(localizeError(cause, 'Dosya açılamadı.'))
    }
  }, [tabs])

  const saveActive = useCallback(async () => {
    if (!activeTab?.dirty) return
    const path = activeTab.path
    const content = activeTab.content
    try {
      await window.desktop.saveFile(path, content)
      setTabs((current) => current.map((tab) => tab.path === path && tab.content === content ? { ...tab, dirty: false, savedContent: content } : tab))
      setError('')
      void refreshGitStatus()
    } catch (cause) {
      setError(localizeError(cause, 'Dosya kaydedilemedi.'))
    }
  }, [activeTab, refreshGitStatus])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveActive()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void chooseWorkspace()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        setAiVisible((visible) => !visible)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [chooseWorkspace, saveActive])

  const closeTab = (path: string) => {
    const tab = tabs.find((item) => item.path === path)
    if (tab?.dirty && preferences.confirmBeforeDiscard && !window.confirm(`${tab.name} dosyasındaki kaydedilmemiş değişiklikler atılsın mı?`)) return
    const index = tabs.findIndex((item) => item.path === path)
    const nextTabs = tabs.filter((item) => item.path !== path)
    setTabs(nextTabs)
    if (activePath === path) {
      const next = nextTabs[Math.min(index, nextTabs.length - 1)]
      setActivePath(next?.path ?? null)
    }
  }

  const reportError = useCallback((message: string) => setError(message), [])

  const onAgentFileChanged = useCallback((path: string, content: string) => {
    setTabs((current) => current.map((tab) => tab.path.toLowerCase() === path.toLowerCase()
      ? { ...tab, content, savedContent: content, dirty: false }
      : tab))
    void refreshGitStatus()
  }, [refreshGitStatus])

  const updatePreferences = (next: AppPreferences) => {
    setPreferences(next)
    writePreferences(next)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Code2 size={18} strokeWidth={2.4} /></div>
          <div className="brand-name">CodeTeo</div>
          <div className="topbar-divider" />
          <button className="workspace-picker" onClick={() => void chooseWorkspace()}>
            <FolderOpen size={15} />
            <span>{workspace ? folderName(workspace) : 'Çalışma alanı aç'}</span>
            {workspace ? <ChevronRight size={13} className="muted-icon" /> : null}
          </button>
        </div>
        <div className="topbar-actions">
          <span className="shortcut-hint"><Command size={12} /> K</span>
          <button className="toolbar-button" onClick={() => void chooseWorkspace()} title="Klasör aç (Ctrl+O)">
            <FolderOpen size={15} /><span>Klasör aç</span>
          </button>
          <button className="toolbar-button save-button" onClick={() => void saveActive()} disabled={!activeTab?.dirty} title="Dosyayı kaydet (Ctrl+S)">
            {activeTab?.dirty ? <Save size={15} /> : <Check size={15} />}<span>Kaydet</span>
          </button>
          <button
            className={`toolbar-button terminal-toggle ${terminalVisible ? 'active' : ''}`}
            onClick={toggleTerminal}
            disabled={!workspace}
            title="Terminali aç veya kapat"
          >
            <TerminalSquare size={15} /><span>Terminal</span>
          </button>
          <button className="toolbar-button" onClick={() => void handleUpdateAction()} disabled={updateState.status === 'checking' || updateState.status === 'downloading' || updateState.status === 'unavailable'} title={updateState.status === 'error' ? updateState.message : 'CodeTeo güncellemelerini denetle'}>
            {updateState.status === 'available' || updateState.status === 'downloaded' ? <Download size={14} /> : <RotateCw size={14} className={updateState.status === 'checking' ? 'spinning' : ''} />}
            <span>{updateState.status === 'error' ? 'Güncelleme hatası' : updateLabel}</span>
          </button>
          <button className="toolbar-button" onClick={() => setSettingsOpen(true)} title="Ayarlar">
            <SettingsIcon size={15} /><span>Ayarlar</span>
          </button>
          <button
            className={`toolbar-button ${aiVisible && workspace ? 'active' : ''}`}
            onClick={() => workspace ? setAiVisible((visible) => !visible) : setAiSettingsOpen(true)}
            title={workspace ? 'Yapay zekâ yardımcısını aç veya kapat (Ctrl+L)' : 'Yapay zekâ sağlayıcıları'}
          >
            <Bot size={15} /><span>Yapay zekâ</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="icon-button small" title="Kapat" onClick={() => setError('')}><X size={14} /></button>
        </div>
      ) : null}

      <div className={`workbench ${workspace ? '' : 'welcome-workbench'}`}>
        {workspace ? (
          <>
            <WorkspaceExplorer
              rootPath={workspace}
              selectedPath={activePath}
              onOpenFile={(path) => void openFile(path)}
              onEntryRenamed={onEntryRenamed}
              onEntryDeleted={onEntryDeleted}
            />
            <main className="editor-column">
              <div className="tabs-bar">
                {tabs.length ? tabs.map((tab) => (
                  <div key={tab.path} className={`editor-tab ${activePath === tab.path ? 'active' : ''}`}>
                    <button className="tab-select" onClick={() => setActivePath(tab.path)} title={tab.path}>
                      <FileCode2 size={14} />
                      <span>{tab.name}</span>
                      {tab.dirty ? <span className="dirty-dot" title="Kaydedilmemiş değişiklikler" /> : null}
                    </button>
                    <button className="tab-close" onClick={() => closeTab(tab.path)} title={`${tab.name} sekmesini kapat`}><X size={13} /></button>
                  </div>
                )) : <div className="empty-tabs"><Braces size={14} /><span>Çalışma alanı</span></div>}
                <div className="tabs-spacer" />
                {activeTab ? <span className="file-location">{activeTab.path}</span> : null}
              </div>
              <div className="editor-stage">
                {activeTab ? (
                  <CodeEditor
                    key={activeTab.path}
                    value={activeTab.content}
                    language={activeTab.language}
                    fontSize={preferences.editorFontSize}
                    tabSize={preferences.tabSize}
                    wordWrap={preferences.wordWrap}
                    lineNumbers={preferences.lineNumbers}
                    onChange={(content) => setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, content, dirty: content !== tab.savedContent } : tab))}
                  />
                ) : (
                  <div className="empty-editor">
                    <div className="empty-editor-mark"><Braces size={25} /></div>
                    <h1>{folderName(workspace)}</h1>
                    <p>Düzenlemeye başlamak için gezginden bir dosya seç.</p>
                    <div className="empty-shortcuts">
                      <span><Keyboard size={13} /> Kaydet <kbd>Ctrl</kbd><b>+</b><kbd>S</kbd></span>
                      <span><FolderOpen size={13} /> Klasör aç <kbd>Ctrl</kbd><b>+</b><kbd>O</kbd></span>
                    </div>
                  </div>
                )}
              </div>
              {terminalOpened ? (
                <TerminalPanel
                  key={terminalSession}
                  workspacePath={workspace}
                  visible={terminalVisible}
                  onClose={() => setTerminalVisible(false)}
                  onRestart={() => setTerminalSession((session) => session + 1)}
                  onError={reportError}
                />
              ) : null}
            </main>
            <AiPanel
              visible={aiVisible}
              providers={aiProviders}
              workspacePath={workspace}
              activeFile={aiContextFile}
              defaultAgentMode={preferences.defaultAiMode === 'agent'}
              defaultAttachFile={preferences.includeActiveFile}
              hasUnsavedChanges={hasUnsavedChanges}
              onFileChanged={onAgentFileChanged}
              onOpenSettings={() => setAiSettingsOpen(true)}
              onClose={() => setAiVisible(false)}
            />
          </>
        ) : (
          <section className="welcome-screen">
            <div className="welcome-hero">
              <div className="welcome-logo"><Code2 size={27} /></div>
              <p className="eyebrow">ÇALIŞMA ALANIN HAZIR</p>
              <h1>Fikirlerini<br /><span>koda dönüştür.</span></h1>
              <p className="welcome-copy">Kodların için sade ve odaklı bir çalışma alanı.</p>
              <button className="primary-action" onClick={() => void chooseWorkspace()}>
                <FolderOpen size={16} /> Klasör aç <span className="action-shortcut">Ctrl O</span>
              </button>
            </div>
            <div className="welcome-lower">
              <div className="recent-heading"><span><Clock3 size={14} /> Son açılan klasörler</span><button onClick={() => void refreshRecent()}>Yenile</button></div>
              {recent.length ? (
                <div className="recent-list">
                  {recent.map((item) => (
                    <button className="recent-item" key={item.path} onClick={() => void openRecentWorkspace(item.path)}>
                      <div className="recent-icon"><FolderOpen size={16} /></div>
                      <div className="recent-details"><strong>{folderName(item.path)}</strong><span>{item.path}</span></div>
                      <span className="recent-date">{new Date(item.openedAt).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' })}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="no-recent">Açtığın klasörler burada görünür.</div>
              )}
            </div>
            <div className="welcome-footer"><span><span className="windows-dot" /> Windows için geliştirildi</span><span>Yapay zekâ destekli kodlama</span></div>
          </section>
        )}
      </div>

      {workspace ? (
        <footer className="statusbar">
          <div className="status-left"><span className="status-product">CODETEO</span><span className="status-path">{workspace}</span></div>
          <div className="status-right">
            {gitStatus?.status === 'repository' ? (
              <span className="git-status" title={`${gitStatus.changedFiles} changed files`}>
                <GitBranch size={13} />{gitStatus.branch}
                {gitStatus.changedFiles > 0 ? <span className="git-change-count">{gitStatus.changedFiles}</span> : null}
              </span>
            ) : gitStatus?.status === 'not-repository' ? (
              <span title="Bu klasör bir Git deposu değil">Git deposu yok</span>
            ) : gitStatus?.status === 'git-unavailable' ? (
              <span title="Depo durumunu görmek için Git'i yükle">Git kullanılamıyor</span>
            ) : null}
            {activeTab ? <><span>{activeTab.language}</span><span>UTF-8</span>{activeTab.dirty ? <span className="status-unsaved">Kaydedilmedi</span> : <span>Kaydedildi</span>}</> : <span>Hazır</span>}
          </div>
        </footer>
      ) : null}

      {aiSettingsOpen ? (
        <AiSettingsDialog
          providers={aiProviders}
          onChanged={() => void refreshAiProviders()}
          onClose={() => setAiSettingsOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsDialog
          preferences={preferences}
          onPreferencesChange={updatePreferences}
          onOpenAiSettings={() => { setSettingsOpen(false); setAiSettingsOpen(true) }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
