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
  screen,
  shell,
  Tray
} from 'electron'
import path from 'node:path'
import appIcon from '../../resources/icon.ico?asset'
import { pathToFileURL } from 'node:url'
import type { Language } from '../shared/i18n'
import { messages } from '../shared/i18n'
import type { AppState, Guide, PresetSource } from '../shared/types'
import { getStaticArea } from './area-levels'
import { hasTrial } from './trial-zones'
import { loadGuide, watchGuide } from './guide-loader'
import { extractZone, findClientLog, LogWatcher } from './log-watcher'
import { deletePreset, readPresetSource, writePreset } from './preset-store'
import {
  clearRuns,
  deleteRun,
  guidesRoot,
  loadProgress,
  loadRuns,
  loadSettings,
  saveProgress,
  saveRun,
  saveSettings
} from './settings'
import { RunTimer } from './timer'
import { checkForUpdate } from './updates'
import { resolveZone } from './zone-tracker'

let win: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let tray: Tray | null = null
let logWatcher: LogWatcher | null = null

const settings = loadSettings()

// speedrun-таймер по актам; state.timer держит ссылку на его состояние (мутируется на месте)
const runTimer = new RunTimer(
  { profile: () => settings.profile, loadRuns, saveRun },
  settings.timerVisible,
  settings.targetActs
)

const state: AppState = {
  guide: { profile: settings.profile, acts: [], presets: [], errors: [] },
  currentAct: 1,
  currentZone: null,
  currentZoneIndex: -1,
  activePreset: settings.gemPreset,
  interactive: false,
  layoutVisible: false,
  routeVisible: settings.routeVisible,
  charLevel: settings.charLevel,
  areaLevel: null,
  hasTrial: false,
  logStatus: { kind: 'missing', message: messages[settings.language].clientLogNotFound },
  progress: loadProgress(settings.profile),
  timer: runTimer.state,
  language: settings.language,
  updateStatus: { kind: 'idle' }
}

// реальные уровни инстансов из строк "Generating level N area ..." по имени зоны
const instanceLevels = new Map<string, number>()

function pushState(): void {
  win?.webContents.send('state', state)
  settingsWin?.webContents.send('state', state)
}

async function runUpdateCheck(): Promise<void> {
  state.updateStatus = { kind: 'checking' }
  pushState()
  state.updateStatus = await checkForUpdate(app.getVersion())
  pushState()
}

/** Уровень текущей зоны: реальный инстанс из лога, иначе статика exile-leveling; город — null. */
function updateAreaLevel(): void {
  const name = state.currentZone
  if (!name) {
    state.areaLevel = null
    state.hasTrial = false
    return
  }
  state.hasTrial = hasTrial(name, state.currentAct)
  const stat = getStaticArea(name, state.currentAct)
  if (stat?.town) {
    // штраф опыта в городе — шум, индикатор не показываем
    state.areaLevel = null
    return
  }
  state.areaLevel = instanceLevels.get(name) ?? stat?.level ?? null
}

function onZoneEntered(zoneName: string, areaLevel: number | null = null): void {
  if (areaLevel !== null) instanceLevels.set(zoneName, areaLevel)
  state.currentZone = zoneName
  const pos = resolveZone(state.guide, state.currentAct, zoneName, state.charLevel)
  if (pos) {
    state.currentAct = pos.act
    state.currentZoneIndex = pos.zoneIndex
  } else {
    state.currentZoneIndex = -1
  }
  updateAreaLevel()
  // авто-сплит таймера по актам (форвард-онли): вход в акт N фиксирует акты < N
  if (runTimer.state.status === 'running') runTimer.advanceTo(state.currentAct)
  pushState()
}

function onLevelUp(level: number): void {
  state.charLevel = level
  settings.charLevel = level
  saveSettings(settings)
  updateTrayMenu()
  pushState()
}

function resetCharLevel(): void {
  state.charLevel = null
  settings.charLevel = null
  saveSettings(settings)
  updateTrayMenu()
  pushState()
}

function setGuide(guide: Guide): void {
  state.guide = guide
  // re-resolve the current zone against the freshly loaded guide
  if (state.currentZone) {
    const pos = resolveZone(guide, state.currentAct, state.currentZone, state.charLevel)
    state.currentZoneIndex = pos ? pos.zoneIndex : -1
    if (pos) state.currentAct = pos.act
  }
  // keep the active preset valid: drop it if gone, auto-pick the only one
  const ids = guide.presets.map((p) => p.id)
  if (state.activePreset && !ids.includes(state.activePreset)) {
    state.activePreset = null
  }
  if (!state.activePreset && ids.length === 1) {
    state.activePreset = ids[0]
  }
  updateAreaLevel()
  updateTrayMenu()
  pushState()
}

function toggleRoute(): void {
  state.routeVisible = !state.routeVisible
  settings.routeVisible = state.routeVisible
  saveSettings(settings)
  pushState()
}

function setActivePreset(id: string | null): void {
  state.activePreset = id
  settings.gemPreset = id
  saveSettings(settings)
  updateTrayMenu()
  pushState()
}

function setLanguage(lang: Language): void {
  settings.language = lang
  saveSettings(settings)
  state.language = lang
  setGuide(loadGuide(guidesRoot(), settings.profile, settings.language))
  updateTrayMenu()
  pushState()
}

/** Старт/сплит одной клавишей: если забег не идёт — старт с текущего акта, иначе ручной сплит. */
function timerStartSplit(): void {
  const t = runTimer.state
  if (t.status === 'idle' || t.status === 'finished') runTimer.start(state.currentAct)
  else runTimer.manualSplit()
  pushState()
}

/** Тоггл панели таймера + сохранение в настройки. */
function timerToggleVisible(): void {
  runTimer.toggleVisible()
  settings.timerVisible = runTimer.state.visible
  saveSettings(settings)
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
      message: messages[settings.language].clientLogNotFoundHint
    }
    pushState()
    return
  }
  if (!envPath) {
    settings.clientLogPath = logPath
    saveSettings(settings)
  }
  state.logStatus = { kind: 'ok', path: logPath }
  logWatcher = new LogWatcher(logPath, { onZone: onZoneEntered, onLevel: onLevelUp })
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
  updateAreaLevel()
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
  updateAreaLevel()
  pushState()
}

/** Fallback: 16x16 solid amber square, generated in-memory (BGRA). */
function fallbackTrayIcon(): Electron.NativeImage {
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

function trayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(appIcon)
  if (img.isEmpty()) return fallbackTrayIcon()
  return img.resize({ width: 16, height: 16 })
}

function buildTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('PoE Acts Overlay')
  updateTrayMenu()
  tray.on('click', toggleOverlay)
}

/** (Re)builds the tray menu — called on startup and whenever presets change. */
function updateTrayMenu(): void {
  if (!tray) return
  const t = messages[settings.language]
  const presetItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: t.noGemsPresetOption,
      type: 'radio',
      checked: state.activePreset === null,
      click: () => setActivePreset(null)
    },
    ...state.guide.presets.map((p) => ({
      label: p.name,
      type: 'radio' as const,
      checked: state.activePreset === p.id,
      click: () => setActivePreset(p.id)
    }))
  ]
  const menu = Menu.buildFromTemplate([
    { label: t.toggleOverlayMenuLabel, click: toggleOverlay },
    {
      label: runTimer.state.visible
        ? t.hideRunTimerMenuLabel(settings.hotkeys.timerToggleVisible)
        : t.showRunTimerMenuLabel(settings.hotkeys.timerToggleVisible),
      click: () => {
        timerToggleVisible()
        updateTrayMenu()
      }
    },
    {
      label: t.clickModeMenuLabel,
      click: () => setInteractive(!state.interactive)
    },
    { type: 'separator' },
    {
      label: t.buildMenuLabel,
      submenu: state.guide.presets.length > 0
        ? presetItems
        : [{ label: t.noPresetsMenuLabel, enabled: false }]
    },
    { type: 'separator' },
    {
      label: t.chooseClientLogMenuLabel,
      click: async () => {
        const res = await dialog.showOpenDialog({
          title: t.chooseClientLogDialogTitle,
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
      label: t.gemSettingsMenuLabel,
      click: openSettingsWindow
    },
    {
      label: t.openGuidesFolderMenuLabel,
      click: () => {
        shell.openPath(path.join(guidesRoot(), settings.profile))
      }
    },
    {
      label: t.reloadGuidesMenuLabel,
      click: () => setGuide(loadGuide(guidesRoot(), settings.profile, settings.language))
    },
    { type: 'separator' },
    { label: t.quitMenuLabel, click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
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
    icon: appIcon,
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

/** Окно настроек камней: обычное окно с рамкой, без always-on-top и click-through. */
function openSettingsWindow(): void {
  if (settingsWin) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 780,
    height: 620,
    autoHideMenuBar: true,
    icon: appIcon,
    title: messages[settings.language].settingsWindowTitle,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    settingsWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}#settings`)
  } else {
    settingsWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }
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
  bind(hk.openSettings, openSettingsWindow)
  bind(hk.timerStartSplit, timerStartSplit)
  bind(hk.timerPause, () => {
    runTimer.togglePause()
    pushState()
  })
  bind(hk.timerReset, () => {
    runTimer.reset()
    pushState()
  })
  bind(hk.timerUndo, () => {
    runTimer.undo()
    pushState()
  })
  bind(hk.timerToggleVisible, timerToggleVisible)
  bind(hk.toggleDevTools, () => {
    const wc = win?.webContents
    if (!wc) return
    // detach so DevTools opens as its own window — the overlay itself is
    // frameless + click-through and can't host docked tools
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'detach' })
  })
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
  ipcMain.on('set-preset', (_e, id: string | null) => setActivePreset(id))
  ipcMain.on('toggle-layout', () => {
    state.layoutVisible = !state.layoutVisible
    pushState()
  })
  ipcMain.on('toggle-route', toggleRoute)
  ipcMain.on('reset-progress', () => {
    state.progress = {}
    saveProgress(settings.profile, state.progress)
    pushState()
  })
  ipcMain.on('open-guides-folder', () => {
    shell.openPath(path.join(guidesRoot(), settings.profile))
  })
  ipcMain.on('open-settings', openSettingsWindow)
  // управление таймером кнопками из оверлея/настроек (дубль хоткеев)
  ipcMain.on('timer-start-split', timerStartSplit)
  ipcMain.on('timer-pause', () => {
    runTimer.togglePause()
    pushState()
  })
  ipcMain.on('timer-finish', () => {
    runTimer.finish()
    pushState()
  })
  ipcMain.on('timer-reset', () => {
    runTimer.reset()
    pushState()
  })
  ipcMain.on('timer-undo', () => {
    runTimer.undo()
    pushState()
  })
  ipcMain.on('timer-toggle-visible', timerToggleVisible)
  // смена дистанции забега (число актов); только вне активного забега
  ipcMain.on('set-target-acts', (_e, n: number) => {
    runTimer.setTargetActs(n)
    settings.targetActs = runTimer.state.targetActs
    saveSettings(settings)
    pushState()
  })
  // история забегов для окна настроек
  ipcMain.handle('get-runs', () => loadRuns(settings.profile))
  ipcMain.handle('delete-run', (_e, id: string) => {
    deleteRun(settings.profile, id)
    runTimer.reloadHistory()
    pushState()
    return loadRuns(settings.profile)
  })
  ipcMain.handle('clear-runs', () => {
    clearRuns(settings.profile)
    runTimer.reloadHistory()
    pushState()
    return [] as const
  })
  // Окно подгоняет свою высоту под контент рендерера; при превышении рабочей
  // области экрана высота упирается в потолок, а лишнее скроллится (fallback в CSS).
  ipcMain.on('content-resize', (_e, raw: { width: number; height: number }) => {
    if (!win) return
    const w = Math.round(Number(raw?.width))
    const h = Math.round(Number(raw?.height))
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return
    const b = win.getBounds()
    const area = screen.getDisplayMatching(b).workArea
    const width = Math.max(120, Math.min(w, area.width))
    const height = Math.max(80, Math.min(h, area.height))
    // Ширину определяет только контент: фиксируем min==max по ширине, чтобы её
    // нельзя было менять мышкой. По высоте ресайз остаётся доступен.
    win.setMinimumSize(width, 80)
    win.setMaximumSize(width, area.height)
    if (width === b.width && height === b.height) return
    // Левый край окна (основной контент) держим на месте; окно растёт вправо.
    // Если правый край вылезает за рабочую область — сдвигаем окно влево, чтобы
    // панель забегов оставалась на экране, но не заходим левее рабочей области.
    let x = b.x
    if (x + width > area.x + area.width) x = area.x + area.width - width
    if (x < area.x) x = area.x
    let y = b.y
    if (y + height > area.y + area.height) y = area.y + area.height - height
    if (y < area.y) y = area.y
    win.setBounds({ x, y, width, height })
  })
  ipcMain.handle('get-preset-source', (_e, id: string) => {
    try {
      return readPresetSource(guidesRoot(), settings.profile, id, settings.language)
    } catch {
      return null
    }
  })
  ipcMain.handle('save-preset', (_e, src: PresetSource) => {
    try {
      writePreset(guidesRoot(), settings.profile, src, settings.language)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('delete-preset', (_e, id: string) => {
    try {
      deletePreset(guidesRoot(), settings.profile, id, settings.language)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.on('set-language', (_e, lang: Language) => setLanguage(lang))
  ipcMain.handle('check-for-updates', async () => {
    await runUpdateCheck()
    return state.updateStatus
  })
  ipcMain.on('open-external', (_e, url: string) => {
    shell.openExternal(url)
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
    setGuide(loadGuide(guidesRoot(), settings.profile, settings.language))
    watchGuide(guidesRoot(), settings.profile, () => settings.language, setGuide)
    startLogWatcher()
    void runUpdateCheck()
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
