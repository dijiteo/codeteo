import { contextBridge, ipcRenderer } from 'electron'
import type { ChatEvent } from '../../src/shared/ai'
import type { AppUpdateState } from '../../src/shared/app-update'
import type { DesktopApi, TerminalExit, TerminalOutput } from '../../src/shared/contracts'

const desktopApi: DesktopApi = {
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  openRecentWorkspace: (path) => ipcRenderer.invoke('workspace:open-recent', path),
  getWorkspace: () => ipcRenderer.invoke('workspace:get-current'),
  getRecentWorkspaces: () => ipcRenderer.invoke('workspace:history'),
  listDirectory: (relativePath) => ipcRenderer.invoke('workspace:list-directory', relativePath),
  readFile: (relativePath) => ipcRenderer.invoke('workspace:read-file', relativePath),
  saveFile: (relativePath, content) => ipcRenderer.invoke('workspace:save-file', relativePath, content),
  createEntry: (parentPath, name, type) => ipcRenderer.invoke('workspace:create-entry', parentPath, name, type),
  renameEntry: (relativePath, newName) => ipcRenderer.invoke('workspace:rename-entry', relativePath, newName),
  deleteEntry: (relativePath) => ipcRenderer.invoke('workspace:delete-entry', relativePath),
  setUnsavedChanges: (hasUnsavedChanges) => ipcRenderer.send('workspace:set-unsaved', hasUnsavedChanges),
  getAiProviders: () => ipcRenderer.invoke('ai:providers'),
  addCompatibleAiProvider: (input) => ipcRenderer.invoke('ai:add-compatible-provider', input),
  removeCompatibleAiProvider: (providerId) => ipcRenderer.invoke('ai:remove-compatible-provider', providerId),
  saveAiKey: (providerId, apiKey) => ipcRenderer.invoke('ai:save-key', providerId, apiKey),
  removeAiKey: (providerId) => ipcRenderer.invoke('ai:remove-key', providerId),
  openAiKeyPage: (providerId) => ipcRenderer.invoke('ai:open-key-page', providerId),
  listAiModels: (providerId, refresh) => ipcRenderer.invoke('ai:models', providerId, refresh === true),
  getAiSelection: () => ipcRenderer.invoke('ai:get-selection'),
  setAiSelection: (selection) => ipcRenderer.invoke('ai:set-selection', selection),
  startAiChat: (chatId, request) => ipcRenderer.invoke('ai:chat-start', chatId, request),
  cancelAiChat: (chatId) => ipcRenderer.invoke('ai:chat-cancel', chatId),
  respondToAiApproval: (chatId, callId, approved) => ipcRenderer.invoke('ai:agent-approval', chatId, callId, approved),
  onAiChatEvent(callback) {
    const listener = (_event: Electron.IpcRendererEvent, chatEvent: ChatEvent): void => callback(chatEvent)
    ipcRenderer.on('ai:chat-event', listener)
    return () => ipcRenderer.removeListener('ai:chat-event', listener)
  },
  getAppUpdateState: () => ipcRenderer.invoke('app:update-state'),
  checkForAppUpdates: () => ipcRenderer.invoke('app:update-check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app:update-download'),
  installAppUpdate: () => ipcRenderer.invoke('app:update-install'),
  onAppUpdateState(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState): void => callback(state)
    ipcRenderer.on('app:update-state', listener)
    return () => ipcRenderer.removeListener('app:update-state', listener)
  },
  createTerminal: (cols, rows) => ipcRenderer.invoke('terminal:create', cols, rows),
  writeTerminal: (terminalId, data) => ipcRenderer.invoke('terminal:write', terminalId, data),
  resizeTerminal: (terminalId, cols, rows) => ipcRenderer.invoke('terminal:resize', terminalId, cols, rows),
  closeTerminal: (terminalId) => ipcRenderer.invoke('terminal:close', terminalId),
  getGitStatus: () => ipcRenderer.invoke('workspace:git-status'),
  onTerminalOutput(callback) {
    const listener = (_event: Electron.IpcRendererEvent, output: TerminalOutput): void => callback(output)
    ipcRenderer.on('terminal:output', listener)
    return () => ipcRenderer.removeListener('terminal:output', listener)
  },
  onTerminalExit(callback) {
    const listener = (_event: Electron.IpcRendererEvent, exit: TerminalExit): void => callback(exit)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
