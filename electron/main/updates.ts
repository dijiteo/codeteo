import { app, ipcMain, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { AppUpdateState } from '../../src/shared/app-update'

const { autoUpdater } = electronUpdater
let state: AppUpdateState = { status: 'idle' }

type AssertMainFrame = (event: Electron.IpcMainInvokeEvent) => void

export function registerAppUpdateHandlers(
  getWindow: () => BrowserWindow | null,
  assertMainFrame: AssertMainFrame,
  hasUnsavedChanges: () => boolean,
): void {
  autoUpdater.autoDownload = false
  autoUpdater.allowPrerelease = false

  const publish = (next: AppUpdateState): void => {
    state = next
    getWindow()?.webContents.send('app:update-state', state)
  }

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking' }))
  autoUpdater.on('update-not-available', (info) => publish({ status: 'not-available', version: info.version }))
  autoUpdater.on('update-available', (info) => publish({ status: 'available', version: info.version }))
  autoUpdater.on('download-progress', (progress) => {
    const version = state.status === 'available' || state.status === 'downloading' ? state.version : app.getVersion()
    publish({ status: 'downloading', version, percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => publish({ status: 'downloaded', version: info.version }))
  autoUpdater.on('error', (cause) => publish({
    status: 'error',
    message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 320),
  }))

  const getState = (): AppUpdateState => app.isPackaged
    ? state
    : { status: 'unavailable', message: 'Update checks are available in the installed CodeTeo app.' }

  ipcMain.handle('app:update-state', (event) => {
    assertMainFrame(event)
    return getState()
  })
  ipcMain.handle('app:update-check', async (event) => {
    assertMainFrame(event)
    if (!app.isPackaged) return getState()
    publish({ status: 'checking' })
    try {
      await autoUpdater.checkForUpdates()
    } catch (cause) {
      publish({ status: 'error', message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 320) })
    }
    return state
  })
  ipcMain.handle('app:update-download', async (event) => {
    assertMainFrame(event)
    if (!app.isPackaged || state.status !== 'available') throw new Error('There is no available update to download.')
    await autoUpdater.downloadUpdate()
  })
  ipcMain.handle('app:update-install', (event) => {
    assertMainFrame(event)
    if (!app.isPackaged || state.status !== 'downloaded') throw new Error('The update is not ready to install.')
    if (hasUnsavedChanges()) throw new Error('Save or discard editor changes before restarting to update.')
    autoUpdater.quitAndInstall(false, true)
  })
}
