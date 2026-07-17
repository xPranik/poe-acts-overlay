# CLAUDE.md

Guidance for AI assistants working in this repository.

## Commit & PR rules

- **Never mention the AI assistant in git.** Do not add `Co-Authored-By` trailers,
  "Generated with" lines, or any reference to Claude/Anthropic/AI in commit messages,
  PR titles, or PR bodies. Commits are authored solely by the repository owner.
- Commit or push only when explicitly asked.

## Project

PoE Acts Overlay — an Electron + React overlay for Path of Exile 1 leveling. It tails
the game's `Client.txt` to detect the current zone and shows per-zone guidance (route,
gem plan, zone layouts) from hot-reloaded TOML guides.

## Commands

- `npm run dev` — run the overlay (electron-vite dev with HMR)
- `npm run typecheck` — type-check main + renderer
- `npm run build` — production build
- `npm run import-guide [profile]` — regenerate route guides from exile-leveling
- `npm run import-data` — refresh vendored gem list + zone levels from exile-leveling (committed JSONs)
- `npm run fake-log -- <file> "<Zone>"` — append a zone to a test log; `--gen <n>` adds an instance-level
  line, `--level <n>` appends a level-up, `--reset` truncates, `--demo` replays

Test without the game: `POE_OVERLAY_LOG=<path> npm run dev`, then drive the log with `fake-log`.

## Layout

- `src/main/` — Electron main: `log-watcher.ts` (Client.txt tailer: zones, char level, instance
  levels), `guide-loader.ts` (TOML + hot-reload), `preset-store.ts` (structured gem-preset
  read/write), `area-levels.ts` (zone→monster level), `zone-tracker.ts` (zone→act resolution),
  `settings.ts`, `index.ts`
- `src/renderer/` — React overlay UI; `src/settings/` — gem-preset editor window (`#settings` hash)
- `src/shared/` — types and inline markup shared across processes
- `guides/<profile>/` — route TOMLs (`act-N.toml`) + gem presets (`gems/<build>.toml`) + `layouts/`
