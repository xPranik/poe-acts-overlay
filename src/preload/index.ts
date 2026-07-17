import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, PresetSource } from '../shared/types'

type SaveResult = { ok: true } | { ok: false; error: string }

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('get-state'),
  onState: (cb: (state: AppState) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: AppState): void => cb(state)
    ipcRenderer.on('state', listener)
    return () => ipcRenderer.removeListener('state', listener)
  },
  toggleStep: (key: string): void => {
    ipcRenderer.send('toggle-step', key)
  },
  navZone: (delta: number): void => {
    ipcRenderer.send('nav-zone', delta)
  },
  navAct: (delta: number): void => {
    ipcRenderer.send('nav-act', delta)
  },
  setPreset: (id: string | null): void => {
    ipcRenderer.send('set-preset', id)
  },
  toggleLayout: (): void => {
    ipcRenderer.send('toggle-layout')
  },
  toggleRoute: (): void => {
    ipcRenderer.send('toggle-route')
  },
  resetProgress: (): void => {
    ipcRenderer.send('reset-progress')
  },
  openGuidesFolder: (): void => {
    ipcRenderer.send('open-guides-folder')
  },
  openSettings: (): void => {
    ipcRenderer.send('open-settings')
  },
  getPresetSource: (id: string): Promise<PresetSource | null> =>
    ipcRenderer.invoke('get-preset-source', id),
  savePreset: (src: PresetSource): Promise<SaveResult> => ipcRenderer.invoke('save-preset', src),
  deletePreset: (id: string): Promise<SaveResult> => ipcRenderer.invoke('delete-preset', id)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
