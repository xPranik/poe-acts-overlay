import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, PresetSource, Run } from '../shared/types'

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
  deletePreset: (id: string): Promise<SaveResult> => ipcRenderer.invoke('delete-preset', id),
  reportContentSize: (width: number, height: number): void => {
    ipcRenderer.send('content-resize', { width, height })
  },
  // --- таймер по актам ---
  timerStartSplit: (): void => {
    ipcRenderer.send('timer-start-split')
  },
  timerPause: (): void => {
    ipcRenderer.send('timer-pause')
  },
  timerFinish: (): void => {
    ipcRenderer.send('timer-finish')
  },
  timerReset: (): void => {
    ipcRenderer.send('timer-reset')
  },
  timerUndo: (): void => {
    ipcRenderer.send('timer-undo')
  },
  timerToggleVisible: (): void => {
    ipcRenderer.send('timer-toggle-visible')
  },
  getRuns: (): Promise<Run[]> => ipcRenderer.invoke('get-runs'),
  deleteRun: (id: string): Promise<Run[]> => ipcRenderer.invoke('delete-run', id),
  clearRuns: (): Promise<Run[]> => ipcRenderer.invoke('clear-runs')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
