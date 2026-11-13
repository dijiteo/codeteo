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
  TerminalSquare,
  X,
} from 'lucide-react'
import type { ChatContextFile, ProviderStatus } from '@shared/ai'
import type { AppUpdateState } from '@shared/app-update'
import type { EditorFile, RecentWorkspace, WorkspaceEntry, WorkspaceGitStatus } from '@shared/contracts'
import AiPanel from './components/AiPanel'
import AiSettingsDialog from './components/AiSettingsDialog'
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
      setError(cause instanceof Error ? cause.message : 'Could not read AI provider settings.')
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
      setUpdateState({ status: 'error', message: cause instanceof Error ? cause.message : 'Update action failed.' })
    }
  }

  const updateLabel = updateState.status === 'checking' ? 'Checking…'
    : updateState.status === 'available' ? `Download v${updateState.version}`
      : updateState.status === 'downloading' ? `Downloading ${updateState.percent}%`
        : updateState.status === 'downloaded' ? 'Restart to update'
          : updateState.status === 'not-available' ? 'Up to date'
            : updateState.status === 'unavailable' ? 'Updates in installed app' : 'Check updates'
  const hasUnsavedChanges = tabs.some((tab) => tab.dirty)

  useEffect(() => {
    window.desktop.setUnsavedChanges(hasUnsavedChanges)
  }, [hasUnsavedChanges])

  const confirmDiscardChanges = useCallback(() => (
    !hasUnsavedChanges || window.confirm('Some files have unsaved changes. Discard them and open another folder?')
  ), [hasUnsavedChanges])

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await window.desktop.getRecentWorkspaces())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read workspace history.')
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
      setError(cause instanceof Error ? cause.message : 'Could not read Git status.')
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
      setError(cause instanceof Error ? cause.message : 'Could not open that workspace.')
    }
  }, [confirmDiscardChanges, refreshRecent, setActiveWorkspace])

  const openRecentWorkspace = useCallback(async (path: string) => {
    if (!confirmDiscardChanges()) return
    try {
      const opened = await window.desktop.openRecentWorkspace(path)
      setActiveWorkspace(opened)
      await refreshRecent()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That recent workspace is no longer available.')
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
      setError(cause instanceof Error ? cause.message : 'Could not open this file.')
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
      setError(cause instanceof Error ? cause.message : 'Could not save this file.')
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
    if (tab?.dirty && !window.confirm(`Discard unsaved changes to ${tab.name}?`)) return
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Code2 size={18} strokeWidth={2.4} /></div>
          <div className="brand-name">CodeTeo</div>
          <div className="topbar-divider" />
          <button className="workspace-picker" onClick={() => void chooseWorkspace()}>
            <FolderOpen size={15} />
            <span>{workspace ? folderName(workspace) : 'Open workspace'}</span>
            {workspace ? <ChevronRight size={13} className="muted-icon" /> : null}
          </button>
        </div>
        <div className="topbar-actions">
          <span className="shortcut-hint"><Command size={12} /> K</span>
          <button className="toolbar-button" onClick={() => void chooseWorkspace()} title="Open workspace (Ctrl+O)">
            <FolderOpen size={15} /><span>Open Folder</span>
          </button>
          <button className="toolbar-button save-button" onClick={() => void saveActive()} disabled={!activeTab?.dirty} title="Save file (Ctrl+S)">
            {activeTab?.dirty ? <Save size={15} /> : <Check size={15} />}<span>Save</span>
          </button>
          <button
            className={`toolbar-button terminal-toggle ${terminalVisible ? 'active' : ''}`}
            onClick={toggleTerminal}
            disabled={!workspace}
            title="Toggle terminal"
          >
            <TerminalSquare size={15} /><span>Terminal</span>
          </button>
          <button className="toolbar-button" onClick={() => void handleUpdateAction()} disabled={updateState.status === 'checking' || updateState.status === 'downloading' || updateState.status === 'unavailable'} title={updateState.status === 'error' ? updateState.message : 'Check for CodeTeo updates'}>
            {updateState.status === 'available' || updateState.status === 'downloaded' ? <Download size={14} /> : <RotateCw size={14} className={updateState.status === 'checking' ? 'spinning' : ''} />}
            <span>{updateState.status === 'error' ? 'Update error' : updateLabel}</span>
          </button>
          <button
            className={`toolbar-button ${aiVisible && workspace ? 'active' : ''}`}
            onClick={() => workspace ? setAiVisible((visible) => !visible) : setAiSettingsOpen(true)}
            title={workspace ? 'Toggle AI assistant (Ctrl+L)' : 'AI providers'}
          >
            <Bot size={15} /><span>AI</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="icon-button small" title="Dismiss" onClick={() => setError('')}><X size={14} /></button>
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
                      {tab.dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
                    </button>
                    <button className="tab-close" onClick={() => closeTab(tab.path)} title={`Close ${tab.name}`}><X size={13} /></button>
                  </div>
                )) : <div className="empty-tabs"><Braces size={14} /><span>Workspace</span></div>}
                <div className="tabs-spacer" />
                {activeTab ? <span className="file-location">{activeTab.path}</span> : null}
              </div>
              <div className="editor-stage">
                {activeTab ? (
                  <CodeEditor
                    key={activeTab.path}
                    value={activeTab.content}
                    language={activeTab.language}
                    onChange={(content) => setTabs((current) => current.map((tab) => tab.path === activeTab.path ? { ...tab, content, dirty: content !== tab.savedContent } : tab))}
                  />
                ) : (
                  <div className="empty-editor">
                    <div className="empty-editor-mark"><Braces size={25} /></div>
                    <h1>{folderName(workspace)}</h1>
                    <p>Choose a file from the explorer to start editing.</p>
                    <div className="empty-shortcuts">
                      <span><Keyboard size={13} /> Save file <kbd>Ctrl</kbd><b>+</b><kbd>S</kbd></span>
                      <span><FolderOpen size={13} /> Open folder <kbd>Ctrl</kbd><b>+</b><kbd>O</kbd></span>
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
              <p className="eyebrow">YOUR WORKSPACE, READY</p>
              <h1>Build something<br /><span>that matters.</span></h1>
              <p className="welcome-copy">A calm, focused place to work on your code.</p>
              <button className="primary-action" onClick={() => void chooseWorkspace()}>
                <FolderOpen size={16} /> Open a folder <span className="action-shortcut">Ctrl O</span>
              </button>
            </div>
            <div className="welcome-lower">
              <div className="recent-heading"><span><Clock3 size={14} /> Recent workspaces</span><button onClick={() => void refreshRecent()}>Refresh</button></div>
              {recent.length ? (
                <div className="recent-list">
                  {recent.map((item) => (
                    <button className="recent-item" key={item.path} onClick={() => void openRecentWorkspace(item.path)}>
                      <div className="recent-icon"><FolderOpen size={16} /></div>
                      <div className="recent-details"><strong>{folderName(item.path)}</strong><span>{item.path}</span></div>
                      <span className="recent-date">{new Date(item.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="no-recent">Folders you open will appear here.</div>
              )}
            </div>
            <div className="welcome-footer"><span><span className="windows-dot" /> Built for Windows</span><span>Phase 2 · AI providers</span></div>
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
              <span title="This workspace is not a Git repository">No Git</span>
            ) : gitStatus?.status === 'git-unavailable' ? (
              <span title="Install Git to see repository status">Git unavailable</span>
            ) : null}
            {activeTab ? <><span>{activeTab.language}</span><span>UTF-8</span>{activeTab.dirty ? <span className="status-unsaved">Unsaved</span> : <span>Saved</span>}</> : <span>Ready</span>}
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
    </div>
  )
}
