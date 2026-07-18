# Architecture

Developer reference for **poe-acts-overlay**. Start here to understand how the pieces
fit together, then use [DATA-FORMATS.md](DATA-FORMATS.md) for content/data schemas and
[TASK-MAP.md](TASK-MAP.md) for "I want to change X → touch these files".

---

## Process model

Electron app with three TypeScript sides plus a shared module:

| Side | Path | Runs in | Role |
|---|---|---|---|
| **main** | `src/main/` | Node/Electron | Owns state, windows, tray, log/guide watchers, IPC, hotkeys |
| **preload** | `src/preload/` | isolated bridge | Exposes a typed `window.api` via `contextBridge` |
| **renderer** | `src/renderer/` | Chromium (React 19) | UI — one bundle, two windows |
| **shared** | `src/shared/` | both | Types, inline markup grammar, exp formula |

There is a **single** `src/renderer/index.html` and one renderer bundle. The overlay
and the settings editor are the **same bundle differentiated by URL hash**
(`src/renderer/src/main.tsx`):

```
const Root = window.location.hash.startsWith('#settings') ? SettingsApp : App
```

- Overlay window → no hash → `App` (`src/renderer/src/App.tsx`)
- Settings window → `#settings` → `SettingsApp` (`src/renderer/src/settings/SettingsApp.tsx`)

Main creates the two `BrowserWindow`s and loads `ELECTRON_RENDERER_URL` (dev) or
`loadFile('../renderer/index.html')` (prod), the settings one with `#settings`.

---

## Data flow

```
Client.txt (game log)
   │  poll size every 500ms, read only appended bytes (tail 64KB)
   ▼
LogWatcher (src/main/log-watcher.ts)
   │  ENTER_RE  → onZone(zone, areaLevel)
   │  LEVEL_RE  → onLevel(level)
   │  GEN_RE    → instance area level (feeds next onZone)
   ▼
index.ts handlers
   onZoneEntered → resolveZone(guide, act, zone, charLevel)   [zone-tracker.ts, level-disambiguated]
                 → getStaticArea(name, act)         [area-levels.ts → zone-levels.json]
                 → hasTrial(name, act)              [trial-zones.ts → trial-zones.json]
                 → runTimer.advanceTo(act)          [timer.ts]
   onLevelUp    → state.charLevel
   │  mutate the singleton `state: AppState` in place
   ▼
pushState() → webContents.send('state', state)  →  BOTH windows
   ▼
renderer: window.api.onState(setState)  →  pure-function React components

Guides:  guides/<profile>/*.toml ──loadGuide()──▶ state.guide
         chokidar watchGuide() (150ms debounce) ──▶ setGuide() on any .toml change
```

Renderer never holds authoritative state: it fetches once with `window.api.getState()`
and then re-renders on every pushed `state`. All navigation/edits are sent back to main
over IPC; main mutates `state` and pushes a fresh copy.

---

## Module map

### `src/main/`

| File | Responsibility | Key exports |
|---|---|---|
| `index.ts` | Entry point / orchestrator. Owns singleton `state`, windows, tray, wires everything. | `extractZone` (re-export for tests); internal `pushState`, `onZoneEntered`, `updateAreaLevel`, `createWindow`, `openSettingsWindow`, `registerIpc`, `registerHotkeys`, `registerGuideProtocol`, `updateTrayMenu` |
| `log-watcher.ts` | Tails `Client.txt` by polling size, parses appended bytes; locates the log. | `findClientLog()`, `extractZone()`, `extractLevel()`, `extractAreaGen()`, `class LogWatcher`, `interface LogEvents`. Const `POLL_INTERVAL_MS=500`, `TAIL_BYTES=64*1024`. Regexes `ENTER_RE`/`LEVEL_RE`/`GEN_RE`. Handles file truncation on game restart (rewind to 0). |
| `guide-loader.ts` | Loads a guide profile from TOML (acts + gem presets) and hot-reloads. | `loadGuide(guidesRoot, profile): Guide`, `watchGuide(guidesRoot, profile, onReload): FSWatcher` (chokidar, `ignoreInitial`, depth 2, 150ms debounce). Uses `parseGemEntry`/`gemEntryText` + `getZoneActEarliest`. |
| `preset-store.ts` | Single source of truth for the gem-entry schema; read/write `gems/<id>.toml`. | `parseGemEntry()`, `gemEntryText()`, `readPresetSource()`, `writePreset()`, `deletePreset()`. `ID_RE=/^[\w-]+$/`. `writePreset` prepends a "generated file" header. |
| `area-levels.ts` | Static zone→monster-level lookup from `data/zone-levels.json`. | `interface ZoneLevel`, `getStaticArea(name, act)` (nearest-act match), `getZoneActEarliest(name)`. In-memory `Map` built at import. |
| `zone-tracker.ts` | Resolve a log zone name to a guide position; disambiguates repeated zone names (e.g. Lioneye's Watch in act 1 vs 6) by closest static area level to `charLevel`, falling back to forward bias. | `interface ZonePosition`, `resolveZone(guide, currentAct, zoneName, charLevel?)`. Pure. |
| `trial-zones.ts` | Whether `(act, name)` has a Labyrinth trial, from `data/trial-zones.json`. | `interface TrialZone`, `hasTrial(name, act)`. In-memory `Set` keyed `` `${act}|${name}` ``. |
| `settings.ts` | Persist settings, per-profile progress, per-profile run history under `userData`; default hotkeys; resolve guides root. | `interface Hotkeys`, `interface Settings`, `loadSettings`/`saveSettings`, `loadProgress`/`saveProgress`, `loadRuns`/`saveRun`/`deleteRun`/`clearRuns` (`MAX_RUNS=50`), `guidesRoot()`. |
| `timer.ts` | Electron-independent speedrun-by-act timer with PB / Sum-of-Best. | `FINAL_ACT=10`, `initialTimerState()`, `computeComparison(runs)`, `interface RunTimerDeps`, `class RunTimer` (`start`/`advanceTo`/`manualSplit`/`pause`/`resume`/`togglePause`/`finish`/`undo`/`reset`/`toggleVisible`/`reloadHistory`). Persists only through injected deps. |

### `src/preload/`

| File | Role |
|---|---|
| `index.ts` | Builds the `api` object and `contextBridge.exposeInMainWorld('api', api)`. Exports `type Api = typeof api`. Local `SaveResult = {ok:true} \| {ok:false; error:string}`. |
| `index.d.ts` | Augments global `Window` with `api: Api` so `window.api.*` is typed everywhere. |

### `src/renderer/src/`

| File | Renders |
|---|---|
| `main.tsx` | Hash-based root selection (`App` vs `SettingsApp`), mounts into `#root`, imports `styles.css`. |
| `App.tsx` | Overlay. Holds `state`, subscribes via `onState`, reports content size to main via a `ResizeObserver`. Sub-components: `Header` (drag strip, act/zone nav, trial badge, route/timer/settings toggles, `ExpStrip`), `ExpStrip` (XP penalty), `ZoneView` (notes, normal steps, gem section), `StepRow` (checkbox row), `Footer`, `Timer`. |
| `Markup.tsx` | Renders inline markup segments; `ICONS` map token→PNG; item color via `gemColor`. |
| `Timer.tsx` | LiveSplit-style splits; local 100ms tick only while `running`; buttons call the timer IPC. |
| `gemAttrs.ts` | Loads `data/gems.json` → `GEM_LIST`; `ATTR_COLORS`; `gemColor(name)`. |
| `settings/SettingsApp.tsx` | Gem-preset editor (per `gems/<id>.toml`). Persists via preset IPC. |
| `settings/GemPicker.tsx` | Gem search/pick popup over `GEM_LIST`. Pure UI, results via `onPick`. |
| `settings/RunsHistory.tsx` | Run history list; `getRuns`/`deleteRun`/`clearRuns`; refreshes on window `focus`. |

### `src/shared/`

| File | Content |
|---|---|
| `types.ts` | All cross-process types (`AppState`, `Guide*`, `GemPreset`/`PresetZone`, `GemEntry`/`PresetSource`, `Run`/`ActSplit`/`TimerState`, `LogStatus`) + `stepKey`/`gemStepKey`. See [DATA-FORMATS.md](DATA-FORMATS.md#shared-types-index). |
| `markup.ts` | `TOKEN_RE`, `TokenType`, `parseMarkup`, `DEFAULT_TEXT`. See [DATA-FORMATS.md](DATA-FORMATS.md#inline-markup-grammar). |
| `exp.ts` | `safeZone`, `expMultiplier`, `fullExpRange` — PoE XP-penalty math. |

---

## IPC reference

All handlers are registered in `registerIpc()` in `src/main/index.ts`; the `state` push
happens in `pushState()`. The renderer only ever touches these through `window.api`
(`src/preload/index.ts`) — never `ipcRenderer` directly.

### Renderer → main, request/response (`ipcMain.handle`)

| Channel | `window.api` method | Payload | Returns |
|---|---|---|---|
| `get-state` | `getState()` | — | `AppState` |
| `get-runs` | `getRuns()` | — | `Run[]` |
| `delete-run` | `deleteRun(id)` | `id: string` | `Run[]` (fresh) |
| `clear-runs` | `clearRuns()` | — | `Run[]` (`[]`) |
| `get-preset-source` | `getPresetSource(id)` | `id: string` | `PresetSource \| null` |
| `save-preset` | `savePreset(src)` | `PresetSource` | `SaveResult` |
| `delete-preset` | `deletePreset(id)` | `id: string` | `SaveResult` |

### Renderer → main, fire-and-forget (`ipcMain.on`)

| Channel | `window.api` method | Payload |
|---|---|---|
| `toggle-step` | `toggleStep(key)` | `key: string` |
| `nav-zone` | `navZone(delta)` | `delta: number` |
| `nav-act` | `navAct(delta)` | `delta: number` |
| `set-preset` | `setPreset(id)` | `string \| null` |
| `toggle-layout` | `toggleLayout()` | — |
| `toggle-route` | `toggleRoute()` | — |
| `reset-progress` | `resetProgress()` | — |
| `open-guides-folder` | `openGuidesFolder()` | — |
| `open-settings` | `openSettings()` | — |
| `content-resize` | `reportContentSize(w, h)` | `{ width, height }` (clamped to work area, resizes overlay) |
| `timer-start-split` | `timerStartSplit()` | — |
| `timer-pause` | `timerPause()` | — (togglePause) |
| `timer-finish` | `timerFinish()` | — |
| `timer-reset` | `timerReset()` | — |
| `timer-undo` | `timerUndo()` | — |
| `timer-toggle-visible` | `timerToggleVisible()` | — |

### Main → renderer (`webContents.send`)

| Channel | Payload | Target | Subscribe |
|---|---|---|---|
| `state` | `AppState` | both `win` and `settingsWin` | `window.api.onState(cb)` → returns unsubscribe |

### Custom protocol

`protocol.handle('guide', …)` in `registerGuideProtocol()` serves zone layout images as
`guide:///<relative-path>` from `path.join(guidesRoot(), settings.profile)`. Path
traversal is blocked (`target.startsWith(base)` else HTTP 403); files fetched via
`net.fetch(pathToFileURL(target))`. Referenced from `App.tsx` as `guide:///${zone.layout}`.

---

## State

The singleton `state: AppState` is built as a literal in `src/main/index.ts` from
`settings` + `loadProgress` + `runTimer.state`, mutated in place by handlers, and pushed
to both windows.

`AppState` fields (see full type in `src/shared/types.ts`):

| Field | Type | Initial | Source |
|---|---|---|---|
| `guide` | `Guide` | empty `{profile, acts:[], presets:[], errors:[]}` | `loadGuide` / `watchGuide` |
| `currentAct` | `number` | `1` | `resolveZone` / nav |
| `currentZone` | `string \| null` | `null` | log |
| `currentZoneIndex` | `number` | `-1` | `resolveZone` (index in act; `-1` if unknown) |
| `activePreset` | `string \| null` | `settings.gemPreset` | tray / preset select |
| `interactive` | `boolean` | `false` | Ctrl+Alt+I |
| `layoutVisible` | `boolean` | `false` | Ctrl+Alt+L |
| `routeVisible` | `boolean` | `settings.routeVisible` | toggle-route |
| `charLevel` | `number \| null` | `settings.charLevel` | log level-up |
| `areaLevel` | `number \| null` | `null` | `updateAreaLevel` |
| `hasTrial` | `boolean` | `false` | `updateAreaLevel` → `hasTrial()` |
| `logStatus` | `LogStatus` | `{kind:'missing', message}` | log watcher |
| `progress` | `Record<string, boolean>` | `loadProgress(profile)` | toggle-step |
| `timer` | `TimerState` | `runTimer.state` | `timer.ts` |

**Progress keys** (`src/shared/types.ts`):
- Normal/inline steps: `stepKey(act, zone, text)` → `` `a${act}|${zone}|${text}` ``
- Preset gems: `gemStepKey(act, zone, presetId, text)` → `` `a${act}|${zone}|gem:${presetId}|${text}` `` (per-preset, so builds keep independent checkmarks)

**Timer**: renderer ticks locally; `elapsed = accumulatedMs + (runningSince ? Date.now() - runningSince : 0)`.

---

## Windows, tray, hotkeys

**Overlay window** (`createWindow()` → `win`): size/pos from `settings.bounds`
(default `400×640`); `frame:false`, `transparent:true`, `skipTaskbar:true`,
`hasShadow:false`, `show:false`; `webPreferences.preload` = `../preload/index.js`,
`sandbox:false`. After create: `setAlwaysOnTop(true, 'screen-saver')` and
`setIgnoreMouseEvents(true, {forward:true})` (click-through by default; interactive mode
flips it). Bounds saved with a debounced `saveBounds`. `ready-to-show → showInactive()`.

**Settings window** (`openSettingsWindow()` → `settingsWin`): `780×620`,
`autoHideMenuBar:true`, loads `#settings`. Focuses existing instance if already open.

Single-instance is enforced via `app.requestSingleInstanceLock()`. Bootstrap order in
`app.whenReady()`: `registerGuideProtocol → registerIpc → createWindow → buildTray →
registerHotkeys → setGuide(loadGuide(...)) → watchGuide → startLogWatcher`.

**Tray menu** (`updateTrayMenu()`, rebuilt when presets/level change): toggle overlay,
toggle timer, interactive checkbox, build (preset) radio submenu, choose Client.txt,
open settings, open guides folder, reload guides, reset level, reset progress, quit.

**Default hotkeys** (`Settings.hotkeys`, `src/main/settings.ts`; global, bound in
`registerHotkeys()`):

| Action | Default | Action | Default |
|---|---|---|---|
| `toggleOverlay` | `Ctrl+Alt+O` | `timerStartSplit` | `Ctrl+Alt+S` |
| `toggleInteractive` | `Ctrl+Alt+I` | `timerPause` | `Ctrl+Alt+P` |
| `toggleLayout` | `Ctrl+Alt+L` | `timerReset` | `Ctrl+Alt+R` |
| `prevZone` | `Ctrl+Alt+Left` | `timerUndo` | `Ctrl+Alt+Z` |
| `nextZone` | `Ctrl+Alt+Right` | `timerToggleVisible` | `Ctrl+Alt+T` |
| `openSettings` | `Ctrl+Alt+G` | `toggleDevTools` | `Ctrl+Alt+D` (detached) |

---

## Runtime files & paths

**Under `app.getPath('userData')`** (`%APPDATA%/poe-acts-overlay/` on Windows), in
`src/main/settings.ts`:
- `settings.json` — `loadSettings`/`saveSettings`
- `progress-<profile>.json` — `loadProgress`/`saveProgress`
- `runs-<profile>.json` — `loadRuns`/`saveRun`/`deleteRun`/`clearRuns`

**Under `guidesRoot()`** (dev: `<appPath>/guides`; packaged: `<dir of exe>/guides`):
- `<profile>/act-N.toml` — act guides (read by `loadGuide`)
- `<profile>/gems/<id>.toml` — gem presets (read by `loadGuide`/`readPresetSource`; written by `writePreset`; deleted by `deletePreset`)
- `<profile>/layouts/*.png` — layout images served over `guide://`
- The `<profile>/` dir (depth 2) is watched by chokidar

**Client.txt** resolution precedence (`startLogWatcher`):
`process.env.POE_OVERLAY_LOG` → `settings.clientLogPath` → `findClientLog()` (probes
drives C–Z × known install-path suffixes). Chosen path is persisted back to
`settings.clientLogPath` **unless** it came from the env var. Read-only tail.

**Env vars**: `POE_OVERLAY_LOG` (override log path, great for testing without the game),
`ELECTRON_RENDERER_URL` (electron-vite dev server URL).

---

## See also

- [DATA-FORMATS.md](DATA-FORMATS.md) — TOML/JSON schemas, markup grammar, shared types, exp formula
- [TASK-MAP.md](TASK-MAP.md) — feature → files cookbook and run/debug commands
- [../CLAUDE.md](../CLAUDE.md), [../README.md](../README.md)
