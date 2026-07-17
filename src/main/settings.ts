import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface Hotkeys {
  toggleOverlay: string
  toggleInteractive: string
  toggleLayout: string
  prevZone: string
  nextZone: string
  toggleDevTools: string
}

export interface Settings {
  clientLogPath: string | null
  profile: string
  /** id of the selected gem preset (build); null = none */
  gemPreset: string | null
  bounds: { x?: number; y?: number; width: number; height: number }
  hotkeys: Hotkeys
}

const DEFAULTS: Settings = {
  clientLogPath: null,
  profile: 'default',
  gemPreset: null,
  bounds: { width: 400, height: 640 },
  hotkeys: {
    toggleOverlay: 'Ctrl+Alt+O',
    toggleInteractive: 'Ctrl+Alt+I',
    toggleLayout: 'Ctrl+Alt+L',
    prevZone: 'Ctrl+Alt+Left',
    nextZone: 'Ctrl+Alt+Right',
    toggleDevTools: 'Ctrl+Alt+D'
  }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    return {
      ...DEFAULTS,
      ...raw,
      bounds: { ...DEFAULTS.bounds, ...raw.bounds },
      hotkeys: { ...DEFAULTS.hotkeys, ...raw.hotkeys }
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Settings): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
}

/** Progress is stored separately per guide profile so a new character can start clean. */
function progressPath(profile: string): string {
  return path.join(app.getPath('userData'), `progress-${profile}.json`)
}

export function loadProgress(profile: string): Record<string, boolean> {
  try {
    return JSON.parse(fs.readFileSync(progressPath(profile), 'utf-8'))
  } catch {
    return {}
  }
}

export function saveProgress(profile: string, progress: Record<string, boolean>): void {
  fs.writeFileSync(progressPath(profile), JSON.stringify(progress))
}

/** In dev the guides live in the repo; packaged builds keep them next to the exe so users can edit them. */
export function guidesRoot(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'guides')
  }
  return path.join(app.getAppPath(), 'guides')
}
