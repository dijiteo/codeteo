import { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } from 'electron'
import * as pty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { AiService, requireProviderId } from './ai/service'
import { CredentialStore } from './ai/credentials'
import { closeDatabase, getSetting, initializeDatabase, listRecentWorkspaces, recordWorkspace, setSetting } from './database'
import { getWorkspaceGitStatus } from './git'
import { registerAppUpdateHandlers } from './updates'
import {
  createWorkspaceEntry,
  listWorkspaceDirectory,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveExistingEntry,
  saveWorkspaceFile,
  validateWorkspaceRoot,
} from './workspace'

let mainWindow: BrowserWindow | null = null
let workspaceRoot: string | null = null
let terminal: pty.IPty | null = null
let terminalId: string | null = null
let hasUnsavedChanges = false
let aiService: AiService | null = null

function isMainFrame(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  return !!mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame
}

function assertMainFrame(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  if (!isMainFrame(event)) throw new Error('This request did not come from the application window.')
}

async function activateWorkspace(candidate: string): Promise<string> {
  const root = await validateWorkspaceRoot(candidate)
  if (workspaceRoot !== root) aiService?.cancelAll()
  workspaceRoot = root
  recordWorkspace(root)
  return root
}

function requireWorkspace(): string {
  if (!workspaceRoot) throw new Error('Open a workspace folder first.')
  return workspaceRoot
}

function stopTerminal(): void {
  terminal?.kill()
  terminal = null
  terminalId = null
}

function registerAiHandlers(): void {
  const ai = new AiService({
    credentials: new CredentialStore(join(app.getPath('userData'), 'ai-credentials.json'), safeStorage),
    fetch: (url, init) => net.fetch(url, init),
    getSetting,
    setSetting,
    emit: (event) => mainWindow?.webContents.send('ai:chat-event', event),
    getWorkspace: () => workspaceRoot,
    hasUnsavedChanges: () => hasUnsavedChanges,
  })
  aiService = ai

  ipcMain.handle('ai:providers', (event) => {
    assertMainFrame(event)
    return ai.listProviders()
  })
  ipcMain.handle('ai:add-compatible-provider', async (event, config: unknown) => {
    assertMainFrame(event)
    return ai.addCompatibleProvider(config)
  })
  ipcMain.handle('ai:remove-compatible-provider', (event, providerId: unknown) => {
    assertMainFrame(event)
    ai.removeCompatibleProvider(providerId)
  })
  ipcMain.handle('ai:save-key', (event, providerId: unknown, apiKey: unknown) => {
    assertMainFrame(event)
    return ai.saveKey(requireProviderId(providerId), apiKey)
  })
  ipcMain.handle('ai:remove-key', (event, providerId: unknown) => {
    assertMainFrame(event)
    ai.removeKey(requireProviderId(providerId))
  })
  ipcMain.handle('ai:open-key-page', async (event, providerId: unknown) => {
    assertMainFrame(event)
    await shell.openExternal(ai.keyUrl(requireProviderId(providerId)))
  })
  ipcMain.handle('ai:models', (event, providerId: unknown, refresh: unknown) => {
    assertMainFrame(event)
    return ai.listModels(requireProviderId(providerId), refresh === true)
  })
  ipcMain.handle('ai:get-selection', (event) => {
    assertMainFrame(event)
    return ai.getSelection()
  })
  ipcMain.handle('ai:set-selection', (event, selection: unknown) => {
    assertMainFrame(event)
    ai.setSelection(selection)
  })
  ipcMain.handle('ai:chat-start', (event, chatId: unknown, request: unknown) => {
    assertMainFrame(event)
    ai.startChat(chatId, request)
  })
  ipcMain.handle('ai:chat-cancel', (event, chatId: unknown) => {
    assertMainFrame(event)
    ai.cancelChat(chatId)
  })
  ipcMain.handle('ai:agent-approval', (event, chatId: unknown, callId: unknown, approved: unknown) => {
    assertMainFrame(event)
    ai.respondToApproval(chatId, callId, approved)
  })
}

function registerIpcHandlers(): void {
  registerAiHandlers()
  registerAppUpdateHandlers(() => mainWindow, assertMainFrame, () => hasUnsavedChanges)
  ipcMain.handle('workspace:choose', async (event) => {
    assertMainFrame(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Open Workspace Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return activateWorkspace(result.filePaths[0])
  })

  ipcMain.handle('workspace:open-recent', async (event, requestedPath: unknown) => {
    assertMainFrame(event)
    if (typeof requestedPath !== 'string' || requestedPath.length > 32767) throw new Error('The workspace path is invalid.')
    return activateWorkspace(requestedPath)
  })

  ipcMain.handle('workspace:get-current', (event) => {
    assertMainFrame(event)
    return workspaceRoot
  })

  ipcMain.handle('workspace:history', (event) => {
    assertMainFrame(event)
    return listRecentWorkspaces()
  })

  ipcMain.handle('workspace:git-status', (event) => {
    assertMainFrame(event)
    return getWorkspaceGitStatus(requireWorkspace())
  })

  ipcMain.handle('workspace:list-directory', async (event, relativePath: unknown) => {
    assertMainFrame(event)
    if (typeof relativePath !== 'string') throw new Error('The folder path is invalid.')
    return listWorkspaceDirectory(requireWorkspace(), relativePath)
  })

  ipcMain.handle('workspace:read-file', async (event, relativePath: unknown) => {
    assertMainFrame(event)
    if (typeof relativePath !== 'string') throw new Error('The file path is invalid.')
    return readWorkspaceFile(requireWorkspace(), relativePath)
  })

  ipcMain.handle('workspace:save-file', async (event, relativePath: unknown, content: unknown) => {
    assertMainFrame(event)
    if (typeof relativePath !== 'string' || typeof content !== 'string') throw new Error('The save request is invalid.')
    await saveWorkspaceFile(requireWorkspace(), relativePath, content)
  })

  ipcMain.handle('workspace:create-entry', async (event, parentPath: unknown, name: unknown, type: unknown) => {
    assertMainFrame(event)
    if (typeof parentPath !== 'string' || typeof name !== 'string' || (type !== 'file' && type !== 'directory')) {
      throw new Error('The create request is invalid.')
    }
    return createWorkspaceEntry(requireWorkspace(), parentPath, name, type)
  })

  ipcMain.handle('workspace:rename-entry', async (event, relativePath: unknown, newName: unknown) => {
    assertMainFrame(event)
    if (typeof relativePath !== 'string' || typeof newName !== 'string') throw new Error('The rename request is invalid.')
    return renameWorkspaceEntry(requireWorkspace(), relativePath, newName)
  })

  ipcMain.handle('workspace:delete-entry', async (event, relativePath: unknown) => {
    assertMainFrame(event)
    if (typeof relativePath !== 'string') throw new Error('The delete request is invalid.')
    await shell.trashItem(await resolveExistingEntry(requireWorkspace(), relativePath))
  })

  ipcMain.on('workspace:set-unsaved', (event, value: unknown) => {
    if (isMainFrame(event)) hasUnsavedChanges = value === true
  })

  ipcMain.handle('terminal:create', (event, cols: unknown, rows: unknown) => {
    assertMainFrame(event)
    if (process.platform !== 'win32') throw new Error('The integrated terminal is available in the Windows build.')
    const cwd = requireWorkspace()
    stopTerminal()
    const id = randomUUID()
    const powershell = join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const shell = existsSync(powershell) ? powershell : (process.env.ComSpec ?? 'powershell.exe')
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    env.TERM = 'xterm-256color'
    env.COLORTERM = 'truecolor'
    terminal = pty.spawn(shell, ['-NoLogo', '-NoProfile'], {
      name: 'xterm-256color',
      cols: Math.max(20, Math.min(Number(cols) || 100, 300)),
      rows: Math.max(5, Math.min(Number(rows) || 24, 120)),
      cwd,
      env,
      useConpty: true,
    })
    terminalId = id
    terminal.onData((data) => mainWindow?.webContents.send('terminal:output', { terminalId: id, data }))
    terminal.onExit(({ exitCode }) => {
      mainWindow?.webContents.send('terminal:exit', { terminalId: id, exitCode })
      if (terminalId === id) {
        terminal = null
        terminalId = null
      }
    })
    return id
  })

  ipcMain.handle('terminal:write', (event, requestedId: unknown, data: unknown) => {
    assertMainFrame(event)
    if (requestedId !== terminalId || typeof data !== 'string' || data.length > 65536) return
    terminal?.write(data)
  })

  ipcMain.handle('terminal:resize', (event, requestedId: unknown, cols: unknown, rows: unknown) => {
    assertMainFrame(event)
    if (requestedId !== terminalId) return
    const width = Math.max(20, Math.min(Number(cols) || 100, 300))
    const height = Math.max(5, Math.min(Number(rows) || 24, 120))
    terminal?.resize(width, height)
  })

  ipcMain.handle('terminal:close', (event, requestedId: unknown) => {
    assertMainFrame(event)
    if (requestedId === terminalId) stopTerminal()
  })
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111318',
    title: 'CodeTeo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const expected = process.env.ELECTRON_RENDERER_URL
    if (expected ? !url.startsWith(expected) : !url.startsWith('file://')) event.preventDefault()
  })
  mainWindow.on('close', (event) => {
    if (!hasUnsavedChanges || !mainWindow) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'Some files have unsaved changes.',
      detail: 'If you quit now, those changes will be lost.',
      buttons: ['Quit without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (choice !== 0) event.preventDefault()
  })
  mainWindow.on('closed', () => {
    stopTerminal()
    aiService?.cancelAll()
    hasUnsavedChanges = false
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.platform !== 'win32') {
    dialog.showErrorBox('Yalnızca Windows', 'CodeTeo Windows için geliştirilmiştir.')
    app.quit()
    return
  }
  const appDataDirectory = app.getPath('appData')
  const newUserDataDirectory = join(appDataDirectory, 'CodeTeo')
  const previousUserDataDirectory = join(appDataDirectory, 'Dijiteo Code')
  if (!existsSync(newUserDataDirectory) && existsSync(previousUserDataDirectory)) {
    try {
      renameSync(previousUserDataDirectory, newUserDataDirectory)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not migrate CodeTeo settings.'
      dialog.showErrorBox('Ayarlar taşınamadı', message)
      app.quit()
      return
    }
  }
  try {
    await initializeDatabase()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not initialize workspace history.'
    dialog.showErrorBox('Klasör geçmişi kullanılamıyor', message)
    app.quit()
    return
  }
  registerIpcHandlers()
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  stopTerminal()
  aiService?.cancelAll()
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
