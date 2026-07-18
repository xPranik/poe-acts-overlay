import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Run } from '../shared/types'

export interface Hotkeys {
  toggleOverlay: string
  toggleInteractive: string
  toggleLayout: string
  prevZone: string
  nextZone: string
  toggleDevTools: string
  openSettings: string
  timerStartSplit: string
  timerPause: string
  timerReset: string
  timerUndo: string
  timerToggleVisible: string
}

export interface Settings {
  clientLogPath: string | null
  profile: string
  /** id of the selected gem preset (build); null = none */
  gemPreset: string | null
  /** показывать ли блок маршрута (акты); false = только камни */
  routeVisible: boolean
  /** последний известный уровень персонажа (переживает ротацию Client.txt) */
  charLevel: number | null
  bounds: { x?: number; y?: number; width: number; height: number }
  hotkeys: Hotkeys
  /** имя финальной зоны акта 10 (авто-стоп таймера); null = последняя зона гайда акта 10 */
  finishZone: string | null
  /** показывать ли панель таймера */
  timerVisible: boolean
  /** дистанция забега в актах (1/3/5/10) */
  targetActs: number
}

const DEFAULTS: Settings = {
  clientLogPath: null,
  profile: 'default',
  gemPreset: null,
  routeVisible: false,
  charLevel: null,
  bounds: { width: 400, height: 640 },
  hotkeys: {
    toggleOverlay: 'Ctrl+Alt+O',
    toggleInteractive: 'Ctrl+Alt+I',
    toggleLayout: 'Ctrl+Alt+L',
    prevZone: 'Ctrl+Alt+Left',
    nextZone: 'Ctrl+Alt+Right',
    toggleDevTools: 'Ctrl+Alt+D',
    openSettings: 'Ctrl+Alt+G',
    timerStartSplit: 'Ctrl+Alt+S',
    timerPause: 'Ctrl+Alt+P',
    timerReset: 'Ctrl+Alt+R',
    timerUndo: 'Ctrl+Alt+Z',
    timerToggleVisible: 'Ctrl+Alt+T'
  },
  finishZone: null,
  timerVisible: false,
  targetActs: 10
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

/** Сохранённые забеги таймера, отдельно на каждый профиль. */
const MAX_RUNS = 50

function runsPath(profile: string): string {
  return path.join(app.getPath('userData'), `runs-${profile}.json`)
}

export function loadRuns(profile: string): Run[] {
  try {
    const raw = JSON.parse(fs.readFileSync(runsPath(profile), 'utf-8'))
    return Array.isArray(raw) ? (raw as Run[]) : []
  } catch {
    return []
  }
}

function writeRuns(profile: string, runs: Run[]): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(runsPath(profile), JSON.stringify(runs, null, 2))
}

export function saveRun(profile: string, run: Run): void {
  const runs = loadRuns(profile)
  runs.push(run)
  // держим последние MAX_RUNS по времени старта
  runs.sort((a, b) => b.startedAt - a.startedAt)
  writeRuns(profile, runs.slice(0, MAX_RUNS))
}

export function deleteRun(profile: string, id: string): void {
  writeRuns(
    profile,
    loadRuns(profile).filter((r) => r.id !== id)
  )
}

export function clearRuns(profile: string): void {
  writeRuns(profile, [])
}

/** In dev the guides live in the repo; packaged builds keep them next to the exe so users can edit them. */
export function guidesRoot(): string {
  if (app.isPackaged) {
    return path.join(path.dirname(app.getPath('exe')), 'guides')
  }
  return path.join(app.getAppPath(), 'guides')
}
