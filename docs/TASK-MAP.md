# Task map — "I want to change X → touch these files"

A cookbook so you can start a change from here instead of re-reading the whole repo.
Background in [ARCHITECTURE.md](ARCHITECTURE.md); schemas in [DATA-FORMATS.md](DATA-FORMATS.md).

---

## Quick "where does X live"

| Looking for… | File(s) |
|---|---|
| App entry / state / windows / tray / hotkeys / IPC wiring | `src/main/index.ts` |
| Reading Client.txt (zones, level, instance level) | `src/main/log-watcher.ts` |
| Loading TOML guides + hot-reload | `src/main/guide-loader.ts` |
| Gem-preset read/write + gem-entry schema | `src/main/preset-store.ts` |
| Zone → monster level | `src/main/area-levels.ts` + `src/main/data/zone-levels.json` |
| Zone → guide position (act/index) | `src/main/zone-tracker.ts` |
| Trial-zone flag | `src/main/trial-zones.ts` + `src/main/data/trial-zones.json` |
| Settings / progress / runs persistence + default hotkeys | `src/main/settings.ts` |
| Speedrun timer logic | `src/main/timer.ts` |
| `window.api` bridge (+ types) | `src/preload/index.ts`, `src/preload/index.d.ts` |
| Overlay UI | `src/renderer/src/App.tsx` |
| Inline markup rendering | `src/renderer/src/Markup.tsx` |
| Timer UI | `src/renderer/src/Timer.tsx` |
| Gem colors / list | `src/renderer/src/gemAttrs.ts` + `src/renderer/src/data/gems.json` |
| Gem-preset editor window | `src/renderer/src/settings/*` |
| Cross-process types | `src/shared/types.ts` |
| Markup grammar | `src/shared/markup.ts` |
| XP math | `src/shared/exp.ts` |
| Overlay styles | `src/renderer/src/styles.css` (settings: `settings/settings.css`) |

---

## Recipes

### Add a renderer → main action (IPC)
1. `src/preload/index.ts` — add a method to `api` (`send` for fire-and-forget, `invoke`
   for request/response). Types flow automatically via `type Api = typeof api`.
2. `src/main/index.ts` `registerIpc()` — add matching `ipcMain.on(...)` / `ipcMain.handle(...)`.
3. Implement the handler; if it changes state, mutate `state` and call `pushState()`.
4. (No change needed in `index.d.ts` — it just re-exports `Api`.)

See the IPC tables in [ARCHITECTURE.md](ARCHITECTURE.md#ipc-reference).

### Add a field to `AppState`
1. `src/shared/types.ts` — add the field to `AppState`.
2. `src/main/index.ts` — give it an initial value in the `state` literal; set it in
   whichever handler owns it (remember `pushState()` after mutating).
3. `src/renderer/src/App.tsx` (or a subcomponent) — consume it. UI updates automatically
   via the `onState` subscription.

### Add / change a guide step kind or markup token
- **Step kind**: `src/shared/types.ts` (`StepKind`) → `src/main/guide-loader.ts`
  (`KINDS` allow-list) → `App.tsx`/`styles.css` for rendering.
- **Markup token**: `src/shared/markup.ts` (`TOKEN_RE`, `TokenType`, `DEFAULT_TEXT`) →
  `src/renderer/src/Markup.tsx` (`ICONS` + any styling) → add a `.mk-<type>` rule in
  `styles.css`. If a new PNG icon is needed, drop it in `src/renderer/src/assets/` and
  import it. Grammar details in [DATA-FORMATS.md](DATA-FORMATS.md#inline-markup-grammar).

### Change zone level / trial data
- **Data only**: edit `src/main/data/zone-levels.json` or `trial-zones.json`
  (`{ name, act, ... }`), or re-run `npm run import-data` for the imported ones.
- **Logic**: `src/main/area-levels.ts` (`getStaticArea`) / `src/main/trial-zones.ts`
  (`hasTrial`). Both are surfaced through `updateAreaLevel()` in `index.ts`.

### Gem-preset editor changes
- **UI**: `src/renderer/src/settings/SettingsApp.tsx` (zones/entries) and
  `GemPicker.tsx` (gem search). Styles in `settings/settings.css`.
- **Persistence / schema**: `src/main/preset-store.ts` (`parseGemEntry`, `gemEntryText`,
  `writePreset`, `readPresetSource`). The TOML schema is in
  [DATA-FORMATS.md](DATA-FORMATS.md#gem-preset-toml).
- **Overlay display**: `ZoneView` in `App.tsx` (act-scoped `preset.zones` filter).

### Timer / runs behavior
- **Logic**: `src/main/timer.ts` (`RunTimer`, `computeComparison`, `FINAL_ACT`).
- **UI**: `src/renderer/src/Timer.tsx`.
- **Persistence**: `src/main/settings.ts` (`loadRuns`/`saveRun`/`deleteRun`/`clearRuns`).
- **Wiring**: timer IPC channels in `index.ts` `registerIpc()` + `registerHotkeys()`.

### Hotkeys / tray menu
- **Defaults**: `src/main/settings.ts` (`Hotkeys` interface + default values). Users
  override in `settings.json`.
- **Binding**: `src/main/index.ts` `registerHotkeys()`.
- **Tray items**: `src/main/index.ts` `updateTrayMenu()`.

### Window sizing / click-through / drag
- **Auto-size**: `App.tsx` `ResizeObserver` → `reportContentSize` → `content-resize`
  handler in `index.ts` (clamps to work area). Preload method in `src/preload/index.ts`.
- **Click-through / always-on-top**: `createWindow()` + `setInteractive()` in `index.ts`.
- **Layout/geometry styles**: `src/renderer/src/styles.css` (drag strip `.drag-strip`).

### Add / change a guide profile
- Put TOMLs under `guides/<profile>/` (+ `gems/`, `layouts/`). Switch the active profile
  via the `profile` field in `settings.json`. Regenerate route TOMLs with
  `npm run import-guide -- <profile>` (**overwrites**).

---

## Scripts & data regeneration

| Command | Script | Effect |
|---|---|---|
| `npm run dev` | — | electron-vite dev with HMR |
| `npm run build` | — | production build → `out/` |
| `npm run typecheck` | — | `tsc` for both `tsconfig.node.json` + `tsconfig.web.json` |
| `npm run import-guide [profile]` | `scripts/import-exile-leveling.ts` | Fetch exile-leveling routes → **overwrite** `guides/<profile>/act-*.toml` |
| `npm run import-data` | `scripts/import-data.ts` | Refresh `gems.json`, `act-towns.json`, `zone-levels.json` (committed) |
| `npm run fake-log -- <file> …` | `scripts/fake-log.ts` | Emulate Client.txt (see below) |

`fake-log` flags: `<file> "Zone"` appends an entered-zone line; `--gen <n>` prepends an
instance-level line; `--level <n>` appends a level-up; `--reset` truncates the file
(simulates game restart); `--demo` loops an Act-1 zone sequence every 3s.

---

## Run & debug without the game

```powershell
# 1. point the overlay at a throwaway log and start it
$env:POE_OVERLAY_LOG = "D:\tmp\Client.txt"; npm run dev

# 2. in another terminal, drive the log
npm run fake-log -- D:\tmp\Client.txt "The Coast"          # enter a zone
npm run fake-log -- D:\tmp\Client.txt --level 12           # level up
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --reset      # simulate restart
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --demo       # replay Act 1
```

- Toggle DevTools on the overlay with `Ctrl+Alt+D` (detached).
- Guide TOML edits hot-reload; parse errors surface in the overlay (`state.guide.errors`).
- Always run `npm run typecheck` before committing.

---

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — how it all fits together
- [DATA-FORMATS.md](DATA-FORMATS.md) — TOML/JSON schemas, markup, types
