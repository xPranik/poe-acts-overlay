# PoE Acts Overlay

An overlay assistant for leveling through Path of Exile 1 acts. It tails `Client.txt`
and automatically shows guidance for the zone the character is in: route, step
checklist, gem plan, zone layout.

**The game must run in Windowed Fullscreen mode** (otherwise the overlay won't show on top).

## Running

```powershell
npm install
npm run dev
```

The path to `Client.txt` is auto-detected from standard install locations.
If it isn't found, pick it manually from the tray icon menu.

## Developer docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — processes, data flow, IPC, state.
- [docs/TASK-MAP.md](docs/TASK-MAP.md) — what to change where + scripts and running without the game.
- [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md) — TOML/JSON formats, markup, shared types.

## Hotkeys

| Hotkey | Action |
|---|---|
| `Ctrl+Alt+O` | show/hide overlay |
| `Ctrl+Alt+I` | click-through toggle (otherwise the mouse passes through the overlay) |
| `Ctrl+Alt+L` | show/hide zone layout |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | previous/next zone manually |

Hotkeys can be changed in `%APPDATA%\poe-acts-overlay\settings.json`.
To move the panel: enable click-through mode and drag the striped bar at the top.

## Guides

Guides live in [guides/default/](guides/default/) — one TOML file per act.
Files can be edited while the overlay is running — changes are picked up immediately
(hot-reload). Parsing errors are shown right in the overlay.

```toml
[act]
number = 1
title = "Act 1"

[[zone]]
name = "The Coast"                  # exactly as the game writes it in the log (English)
layout = "layouts/a1-coast.png"     # optional: image from guides/default/layouts/
notes = """
Free-form text under the zone name.
"""

  [[zone.steps]]                    # checklist step (clickable in click-through mode)
  text = "Take the waypoint"

  [[zone.steps]]
  text = "Buy Steelskin from Nessa"
  kind = "gem-buy"                  # highlight: gem-buy (purchase) / gem-reward (quest reward)
```

- A zone can appear only once per file; steps are checked off by clicking, progress
  is saved (`%APPDATA%\poe-acts-overlay\progress-default.json`).
- Reset progress from the tray menu (for a new character).
- Put layout images in `guides/default/layouts/` and reference them via `layout`.
- Same-named zones from parts 1 and 2 (The Coast in A1 and A6) are distinguished
  automatically by the last-detected act.

## Importing the exile-leveling route

The starter guides are generated from the
[exile-leveling](https://github.com/HeartofPhos/exile-leveling) route (MIT).
To regenerate (overwrites files!):

```powershell
npm run import-guide                # into guides/default/
npm run import-guide -- myprofile   # into guides/myprofile/
```

The guide profile is switched via the `profile` field in `settings.json`.

## Testing without the game

```powershell
# run the overlay against a test log
$env:POE_OVERLAY_LOG = "D:\tmp\Client.txt"; npm run dev

# in another terminal: emulate entering a zone / game restart / demo run
npm run fake-log -- D:\tmp\Client.txt "The Coast"
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --reset
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --demo
```

## How it works

- `src/main/log-watcher.ts` — tails `Client.txt` (polls file size, reads only new
  bytes, handles truncation on game restart), matching lines
  `: You have entered <Zone>.`
- `src/main/guide-loader.ts` — loads TOML guides + hot-reload (chokidar).
- `src/main/zone-tracker.ts` — maps the log zone to the guide act.
- `src/renderer/` — React panel UI.
- A transparent always-on-top Electron window with `setIgnoreMouseEvents` (click-through).
