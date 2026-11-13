import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { ChevronDown, ChevronRight, FileCode2, FilePlus2, Folder, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react'
import type { WorkspaceEntry } from '@shared/contracts'

interface WorkspaceExplorerProps {
  rootPath: string
  selectedPath: string | null
  onOpenFile(path: string): void
  onEntryRenamed(previousPath: string, entry: WorkspaceEntry): void
  onEntryDeleted(entry: WorkspaceEntry): void
}

type Draft =
  | { kind: 'create'; type: WorkspaceEntry['type']; parent: string }
  | { kind: 'rename'; entry: WorkspaceEntry }

interface ContextMenu {
  x: number
  y: number
  entry: WorkspaceEntry | null
}

function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index < 0 ? '' : path.slice(0, index)
}

function isSameOrInside(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}\\`) || path.startsWith(`${ancestor}/`)
}

function errorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback
  return cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export default function WorkspaceExplorer({ rootPath, selectedPath, onOpenFile, onEntryRenamed, onEntryDeleted }: WorkspaceExplorerProps) {
  const [children, setChildren] = useState<Record<string, WorkspaceEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [focused, setFocused] = useState<WorkspaceEntry | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftName, setDraftName] = useState('')
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [problem, setProblem] = useState('')
  const submitting = useRef(false)

  const load = useCallback(async (relativePath: string): Promise<boolean> => {
    setLoading((current) => new Set(current).add(relativePath))
    try {
      const entries = await window.desktop.listDirectory(relativePath)
      setChildren((current) => ({ ...current, [relativePath]: entries }))
      return true
    } catch (cause) {
      if (relativePath === '') setProblem(errorMessage(cause, 'Could not load this folder.'))
      return false
    } finally {
      setLoading((current) => {
        const next = new Set(current)
        next.delete(relativePath)
        return next
      })
    }
  }, [])

  const forget = (path: string) => {
    setChildren((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key === '' || !isSameOrInside(key, path))))
    setExpanded((current) => new Set([...current].filter((key) => key === '' || !isSameOrInside(key, path))))
  }

  useEffect(() => {
    setChildren({})
    setExpanded(new Set(['']))
    setFocused(null)
    setDraft(null)
    setMenu(null)
    setProblem('')
    void load('')
  }, [rootPath, load])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const refresh = async () => {
    setProblem('')
    const paths = [...expanded].filter((path) => path === '' || children[path])
    const results = await Promise.all(paths.map(async (path) => [path, await load(path)] as const))
    for (const [path, ok] of results) if (!ok && path !== '') forget(path)
  }

  const expand = async (path: string) => {
    setExpanded((current) => new Set(current).add(path))
    if (!children[path]) await load(path)
  }

  const toggleFolder = async (entry: WorkspaceEntry) => {
    if (expanded.has(entry.path)) {
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(entry.path)
        return next
      })
      return
    }
    await expand(entry.path)
  }

  const folderFor = (entry: WorkspaceEntry | null): string => {
    if (!entry) return ''
    return entry.type === 'directory' ? entry.path : parentOf(entry.path)
  }

  const startCreate = async (type: WorkspaceEntry['type'], target: WorkspaceEntry | null) => {
    setMenu(null)
    const parent = folderFor(target)
    if (parent) await expand(parent)
    setDraftName('')
    setDraft({ kind: 'create', type, parent })
  }

  const startRename = (entry: WorkspaceEntry) => {
    setMenu(null)
    setDraftName(entry.name)
    setDraft({ kind: 'rename', entry })
  }

  const deleteEntry = async (entry: WorkspaceEntry) => {
    setMenu(null)
    const label = entry.type === 'directory' ? 'folder' : 'file'
    if (!window.confirm(`Move the ${label} "${entry.name}" to the Recycle Bin?\nOpen editor tabs for it will be closed.`)) return
    try {
      await window.desktop.deleteEntry(entry.path)
      forget(entry.path)
      if (focused && isSameOrInside(focused.path, entry.path)) setFocused(null)
      onEntryDeleted(entry)
      setProblem('')
      await load(parentOf(entry.path))
    } catch (cause) {
      setProblem(errorMessage(cause, 'Could not delete this item.'))
    }
  }

  const cancelDraft = () => {
    setDraft(null)
    setDraftName('')
  }

  const submitDraft = async () => {
    if (!draft || submitting.current) return
    const name = draftName.trim()
    if (!name || (draft.kind === 'rename' && name === draft.entry.name)) {
      cancelDraft()
      return
    }
    submitting.current = true
    try {
      if (draft.kind === 'create') {
        const entry = await window.desktop.createEntry(draft.parent, name, draft.type)
        await load(draft.parent)
        setFocused(entry)
        if (entry.type === 'file') onOpenFile(entry.path)
      } else {
        const previous = draft.entry
        const entry = await window.desktop.renameEntry(previous.path, name)
        if (previous.type === 'directory') forget(previous.path)
        await load(parentOf(previous.path))
        setFocused(entry)
        onEntryRenamed(previous.path, entry)
      }
      setProblem('')
      cancelDraft()
    } catch (cause) {
      setProblem(errorMessage(cause, 'Could not complete this change.'))
    } finally {
      submitting.current = false
    }
  }

  const onDraftKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submitDraft()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelDraft()
    }
  }

  const openMenu = (event: ReactMouseEvent, entry: WorkspaceEntry | null) => {
    event.preventDefault()
    event.stopPropagation()
    if (entry) setFocused(entry)
    setMenu({ x: event.clientX, y: event.clientY, entry })
  }

  const renderDraftInput = (depth: number, type: WorkspaceEntry['type']) => (
    <div className="tree-row tree-draft" style={{ paddingLeft: 9 + depth * 14 }}>
      <span className="tree-chevron" />
      {type === 'directory' ? <Folder className="tree-folder" size={15} /> : <FileCode2 className="tree-file" size={14} />}
      <input
        className="tree-input"
        autoFocus
        spellCheck={false}
        value={draftName}
        aria-label={draft?.kind === 'rename' ? 'New name' : type === 'directory' ? 'Folder name' : 'File name'}
        onChange={(event) => setDraftName(event.target.value)}
        onKeyDown={onDraftKeyDown}
        onBlur={() => void submitDraft()}
        onFocus={(event) => {
          const dot = event.target.value.lastIndexOf('.')
          event.target.setSelectionRange(0, type === 'file' && dot > 0 ? dot : event.target.value.length)
        }}
      />
    </div>
  )

  const renderEntries = (parent: string, depth: number) => {
    const entries = children[parent] ?? []
    return (
      <>
        {draft?.kind === 'create' && draft.parent === parent ? renderDraftInput(depth, draft.type) : null}
        {entries.map((entry) => {
          const isFolder = entry.type === 'directory'
          const isExpanded = expanded.has(entry.path)
          const active = selectedPath === entry.path || focused?.path === entry.path
          if (draft?.kind === 'rename' && draft.entry.path === entry.path) {
            return <div key={entry.path}>{renderDraftInput(depth, entry.type)}</div>
          }
          return (
            <div key={entry.path}>
              <button
                className={`tree-row ${active ? 'selected' : ''}`}
                style={{ paddingLeft: 9 + depth * 14 }}
                onClick={() => {
                  setFocused(entry)
                  if (isFolder) void toggleFolder(entry)
                  else onOpenFile(entry.path)
                }}
                onContextMenu={(event) => openMenu(event, entry)}
                onKeyDown={(event) => {
                  if (event.key === 'F2') startRename(entry)
                  if (event.key === 'Delete') void deleteEntry(entry)
                }}
                title={entry.path}
              >
                <span className="tree-chevron">
                  {isFolder ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                </span>
                {isFolder
                  ? isExpanded ? <FolderOpen className="tree-folder" size={15} /> : <Folder className="tree-folder" size={15} />
                  : <FileCode2 className="tree-file" size={14} />}
                <span className="tree-name">{entry.name}</span>
                {isFolder && loading.has(entry.path) ? <span className="tree-loading" /> : null}
              </button>
              {isFolder && isExpanded && children[entry.path] ? renderEntries(entry.path, depth + 1) : null}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <aside className="explorer">
      <div className="section-heading">
        <span>EXPLORER</span>
        <div className="section-actions">
          <button className="icon-button small" title="New file" onClick={() => void startCreate('file', focused)}>
            <FilePlus2 size={14} />
          </button>
          <button className="icon-button small" title="New folder" onClick={() => void startCreate('directory', focused)}>
            <FolderPlus size={14} />
          </button>
          <button className="icon-button small" title="Refresh files" onClick={() => void refresh()}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div className="workspace-root" onClick={() => setFocused(null)} onContextMenu={(event) => openMenu(event, null)}>
        <FolderOpen size={14} />
        <span>{rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rootPath}</span>
      </div>
      <div className="tree-scroll" onContextMenu={(event) => openMenu(event, null)}>
        {problem ? <div className="tree-error" role="alert">{problem}</div> : null}
        {children[''] ? renderEntries('', 0) : !problem ? <div className="tree-empty">Loading files…</div> : null}
      </div>
      {menu ? (
        <div
          className="context-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 150) }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          role="menu"
        >
          <button role="menuitem" onClick={() => void startCreate('file', menu.entry)}>New File</button>
          <button role="menuitem" onClick={() => void startCreate('directory', menu.entry)}>New Folder</button>
          {menu.entry ? (
            <>
              <div className="context-menu-separator" />
              <button role="menuitem" onClick={() => startRename(menu.entry!)}>Rename<span>F2</span></button>
              <button role="menuitem" className="danger" onClick={() => void deleteEntry(menu.entry!)}>Delete<span>Del</span></button>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
