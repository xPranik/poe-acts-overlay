import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  Tray
} from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppState, Guide } from '../shared/types'
import { loadGuide, watchGuide } from './guide-loader'
import { extractZone, findClientLog, LogWatcher } from './log-watcher'
import { guidesRoot, loadProgress, loadSettings, saveProgress, saveSettings } from './settings'
import { resolveZone } from './zone-tracker'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let logWatcher: LogWatcher | null = null

const settings = loadSettings()

const state: AppState = {
  guide: { profile: settings.profile, acts: [], errors: [] },
  currentAct: 1,
  currentZone: null,
  currentZoneIndex: -1,
  interactive: false,
  layoutVisible: false,
  logStatus: { kind: 'missing', message: 'Client.txt не найден' },
  progress: loadProgress(settings.profile)
}

function pushState(): void {
  win?.webContents.send('state', state)
}

function onZoneEntered(zoneName: string): void {
  state.currentZone = zoneName
  const pos = resolveZone(state.guide, state.currentAct, zoneName)
  if (pos) {
    state.currentAct = pos.act
    state.currentZoneIndex = pos.zoneIndex
  } else {
    state.currentZoneIndex = -1
  }
  pushState()
}

function setGuide(guide: Guide): void {
  state.guide = guide
  // re-resolve the current zone against the freshly loaded guide
  if (state.currentZone) {
    const pos = resolveZone(guide, state.currentAct, state.currentZone)
    state.currentZoneIndex = pos ? pos.zoneIndex : -1
    if (pos) state.currentAct = pos.act
  }
  pushState()
}

function startLogWatcher(): void {
  logWatcher?.stop()
  logWatcher = null
  // POE_OVERLAY_LOG lets dev/tests point at a fake log without touching saved settings
  const envPath = process.env.POE_OVERLAY_LOG
  const logPath = envPath ?? settings.clientLogPath ?? findClientLog()
  if (!logPath) {
    state.logStatus = {
      kind: 'missing',
      message: 'Client.txt не найден — укажи путь через иконку в трее'
    }
    pushState()
    return
  }
  if (!envPath) {
    settings.clientLogPath = logPath
    saveSettings(settings)
  }
  state.logStatus = { kind: 'ok', path: logPath }
  logWatcher = new LogWatcher(logPath, onZoneEntered)
  logWatcher.start()
  pushState()
}

function setInteractive(interactive: boolean): void {
  state.interactive = interactive
  if (win) {
    win.setIgnoreMouseEvents(!interactive, { forward: true })
    if (interactive) win.focus()
  }
  pushState()
}

function toggleOverlay(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else win.showInactive()
}

function navZone(delta: number): void {
  const acts = state.guide.acts
  if (acts.length === 0) return
  let actIdx = acts.findIndex((a) => a.number === state.currentAct)
  if (actIdx === -1) actIdx = 0
  let zoneIdx = state.currentZoneIndex === -1 ? 0 : state.currentZoneIndex + delta
  while (zoneIdx < 0 && actIdx > 0) {
    actIdx--
    zoneIdx += acts[actIdx].zones.length
  }
  while (zoneIdx >= acts[actIdx].zones.length && actIdx < acts.length - 1) {
    zoneIdx -= acts[actIdx].zones.length
    actIdx++
  }
  zoneIdx = Math.max(0, Math.min(zoneIdx, acts[actIdx].zones.length - 1))
  state.currentAct = acts[actIdx].number
  state.currentZoneIndex = zoneIdx
  state.currentZone = acts[actIdx].zones[zoneIdx]?.name ?? state.currentZone
  pushState()
}

function navAct(delta: number): void {
  const acts = state.guide.acts
  if (acts.length === 0) return
  let actIdx = acts.findIndex((a) => a.number === state.currentAct)
  if (actIdx === -1) actIdx = 0
  actIdx = Math.max(0, Math.min(actIdx + delta, acts.length - 1))
  state.currentAct = acts[actIdx].number
  state.currentZoneIndex = 0
  state.currentZone = acts[actIdx].zones[0]?.name ?? null
  pushState()
}

function trayIcon(): Electron.NativeImage {
  // 16x16 solid amber square, generated in-memory (BGRA)
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = 40 // B
    buf[i * 4 + 1] = 140 // G
    buf[i * 4 + 2] = 230 // R
    buf[i * 4 + 3] = 255 // A
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function buildTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('PoE Acts Overlay')
  const menu = Menu.buildFromTemplate([
    { label: 'Показать/скрыть оверлей', click: toggleOverlay },
    {
      label: 'Режим кликов (interactive)',
      click: () => setInteractive(!state.interactive)
    },
    { type: 'separator' },
    {
      label: 'Выбрать Client.txt...',
      click: async () => {
        const res = await dialog.showOpenDialog({
          title: 'Выбери Client.txt',
          filters: [{ name: 'Client.txt', extensions: ['txt'] }],
          properties: ['openFile']
        })
        if (!res.canceled && res.filePaths[0]) {
          settings.clientLogPath = res.filePaths[0]
          saveSettings(settings)
          startLogWatcher()
        }
      }
    },
    {
      label: 'Открыть папку гайдов',
      click: () => {
        shell.openPath(path.join(guidesRoot(), settings.profile))
      }
    },
    {
      label: 'Перечитать гайды',
      click: () => setGuide(loadGuide(guidesRoot(), settings.profile))
    },
    { type: 'separator' },
    {
      label: 'Сбросить прогресс',
      click: () => {
        state.progress = {}
        saveProgress(settings.profile, state.progress)
        pushState()
      }
    },
    { type: 'separator' },
    { label: 'Выход', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', toggleOverlay)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: settings.bounds.width,
    height: settings.bounds.height,
    x: settings.bounds.x,
    y: settings.bounds.y,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })

  const saveBounds = debounce(() => {
    if (!win) return
    const b = win.getBounds()
    settings.bounds = { x: b.x, y: b.y, width: b.width, height: b.height }
    saveSettings(settings)
  }, 500)
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  win.once('ready-to-show', () => win?.showInactive())
}

function debounce(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | null = null
  return () => {
    if (t) clearTimeout(t)
    t = setTimeout(fn, ms)
  }
}

function registerHotkeys(): void {
  const hk = settings.hotkeys
  const bind = (accelerator: string, handler: () => void): void => {
    try {
      globalShortcut.register(accelerator, handler)
    } catch {
      console.warn(`Не удалось зарегистрировать хоткей: ${accelerator}`)
    }
  }
  bind(hk.toggleOverlay, toggleOverlay)
  bind(hk.toggleInteractive, () => setInteractive(!state.interactive))
  bind(hk.toggleLayout, () => {
    state.layoutVisible = !state.layoutVisible
    pushState()
  })
  bind(hk.prevZone, () => navZone(-1))
  bind(hk.nextZone, () => navZone(1))
}

function registerIpc(): void {
  ipcMain.handle('get-state', () => state)
  ipcMain.on('toggle-step', (_e, key: string) => {
    if (state.progress[key]) delete state.progress[key]
    else state.progress[key] = true
    saveProgress(settings.profile, state.progress)
    pushState()
  })
  ipcMain.on('nav-zone', (_e, delta: number) => navZone(delta))
  ipcMain.on('nav-act', (_e, delta: number) => navAct(delta))
  ipcMain.on('toggle-layout', () => {
    state.layoutVisible = !state.layoutVisible
    pushState()
  })
  ipcMain.on('reset-progress', () => {
    state.progress = {}
    saveProgress(settings.profile, state.progress)
    pushState()
  })
  ipcMain.on('open-guides-folder', () => {
    shell.openPath(path.join(guidesRoot(), settings.profile))
  })
}

/** Serves layout images from the guide profile directory as guide:///<relative-path>. */
function registerGuideProtocol(): void {
  protocol.handle('guide', (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.hostname ? url.hostname + url.pathname : url.pathname)
    const base = path.join(guidesRoot(), settings.profile)
    const target = path.normalize(path.join(base, rel))
    if (!target.startsWith(base)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    registerGuideProtocol()
    registerIpc()
    createWindow()
    buildTray()
    registerHotkeys()
    setGuide(loadGuide(guidesRoot(), settings.profile))
    watchGuide(guidesRoot(), settings.profile, setGuide)
    startLogWatcher()
  })
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  logWatcher?.stop()
})

app.on('window-all-closed', () => {
  app.quit()
})

// re-exported for tests/debugging via `npm run fake-log`
export { extractZone }
