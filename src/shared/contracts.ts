import type { AIModel, ChatEvent, ChatRequest, CompatibleProviderInput, ModelSelection, ProviderId, ProviderStatus } from './ai'
import type { AppUpdateState } from './app-update'

export interface WorkspaceEntry {
  name: string
  path: string
  type: 'file' | 'directory'
}

export interface RecentWorkspace {
  path: string
  openedAt: number
}

export type WorkspaceGitStatus =
  | { status: 'repository'; branch: string; changedFiles: number }
  | { status: 'not-repository' }
  | { status: 'git-unavailable' }

export interface EditorFile {
  name: string
  path: string
  content: string
  language: string
}

export interface TerminalOutput {
  terminalId: string
  data: string
}

export interface TerminalExit {
  terminalId: string
  exitCode: number
}

export interface DesktopApi {
  chooseWorkspace(): Promise<string | null>
  openRecentWorkspace(path: string): Promise<string>
  getWorkspace(): Promise<string | null>
  getRecentWorkspaces(): Promise<RecentWorkspace[]>
  getGitStatus(): Promise<WorkspaceGitStatus>
  listDirectory(relativePath: string): Promise<WorkspaceEntry[]>
  readFile(relativePath: string): Promise<EditorFile>
  saveFile(relativePath: string, content: string): Promise<void>
  createEntry(parentPath: string, name: string, type: WorkspaceEntry['type']): Promise<WorkspaceEntry>
  renameEntry(relativePath: string, newName: string): Promise<WorkspaceEntry>
  deleteEntry(relativePath: string): Promise<void>
  setUnsavedChanges(hasUnsavedChanges: boolean): void
  getAiProviders(): Promise<ProviderStatus[]>
  addCompatibleAiProvider(input: CompatibleProviderInput): Promise<ProviderStatus>
  removeCompatibleAiProvider(providerId: ProviderId): Promise<void>
  saveAiKey(providerId: ProviderId, apiKey: string): Promise<AIModel[]>
  removeAiKey(providerId: ProviderId): Promise<void>
  openAiKeyPage(providerId: ProviderId): Promise<void>
  listAiModels(providerId: ProviderId, refresh?: boolean): Promise<AIModel[]>
  getAiSelection(): Promise<ModelSelection | null>
  setAiSelection(selection: ModelSelection): Promise<void>
  startAiChat(chatId: string, request: ChatRequest): Promise<void>
  cancelAiChat(chatId: string): Promise<void>
  respondToAiApproval(chatId: string, callId: string, approved: boolean): Promise<void>
  onAiChatEvent(callback: (event: ChatEvent) => void): () => void
  getAppUpdateState(): Promise<AppUpdateState>
  checkForAppUpdates(): Promise<AppUpdateState>
  downloadAppUpdate(): Promise<void>
  installAppUpdate(): Promise<void>
  onAppUpdateState(callback: (state: AppUpdateState) => void): () => void
  createTerminal(cols: number, rows: number): Promise<string>
  writeTerminal(terminalId: string, data: string): Promise<void>
  resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void>
  closeTerminal(terminalId: string): Promise<void>
  onTerminalOutput(callback: (output: TerminalOutput) => void): () => void
  onTerminalExit(callback: (exit: TerminalExit) => void): () => void
}
