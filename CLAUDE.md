# CLAUDE.md

Guidance for AI assistants working in this repository.

## Commit & PR rules

- **Never mention the AI assistant in git.** Do not add `Co-Authored-By` trailers,
  "Generated with" lines, or any reference to Claude/Anthropic/AI in commit messages,
  PR titles, or PR bodies. Commits are authored solely by the repository owner.
- Commit or push only when explicitly asked.

## Release process

When the user says **"release current changes version X.Y.Z"** (or the Russian equivalent,
"зарелизь текущие изменения версия X.Y.Z"), run the full pipeline below without asking for
confirmation at each step — this instruction is the standing authorization for the push, PR
merge, and public GitHub release it performs. Only stop and ask if something in the pipeline
actually fails or looks wrong (build error, typecheck failure, dirty working tree with
unrelated changes, version already released, etc).

1. **Sanity-check the tree.** `git status` — make sure only intended changes are present.
   Run `npm run typecheck` before doing anything else; fix or ask if it fails.
2. **Bump the version.** Set `"version"` in `package.json` to `X.Y.Z`, keep the trailing
   newline, then run `npm install --package-lock-only` to sync `package-lock.json`.
3. **Branch, commit, push.** From `main`:
   ```
   git checkout -b feat/<short-kebab-description>
   git add -A
   git commit -m "<summary of the actual changes — see Commit & PR rules above>"
   git push -u origin feat/<short-kebab-description>
   ```
4. **PR + merge immediately.** Don't wait for manual review/merge on GitHub — this project is
   solo-maintained and the user has pre-approved this:
   ```
   gh pr create --title "..." --body "..."
   gh pr merge <number> --merge --delete-branch
   git checkout main && git pull --ff-only
   ```
   If `gh` isn't on `PATH` in the Bash tool, add it: `export PATH="$PATH:/c/Program Files/GitHub CLI"`.
5. **Build the installer** (not `npm run build:unpack`, which only produces the unpacked
   `--dir` build for local testing):
   ```
   rm -rf dist/
   npm run build
   npx electron-builder --win
   ```
   Electron-builder occasionally hits an `EBUSY` from Windows Defender locking the freshly
   extracted `electron.exe`; retry a few times (15s apart) if it fails — see
   `scripts/build-app.cjs` for the same pattern. Expect `dist/PoE Acts Overlay Setup X.Y.Z.exe`
   (~90MB) plus a `.blockmap`. The exe is unsigned — `signing with signtool.exe` in the build
   log is a no-op, not real Authenticode signing; don't be surprised the file is still
   `NotSigned` (`Get-AuthenticodeSignature`).
6. **Publish the GitHub release:**
   ```
   gh release create vX.Y.Z "dist/PoE Acts Overlay Setup X.Y.Z.exe" \
     --title "PoE Acts Overlay vX.Y.Z" --notes "<changelog>"
   ```
   Release notes: a short "What's new" bullet list of the actual changes, an install blurb,
   and this SmartScreen note (the installer isn't code-signed):
   > Windows may show a SmartScreen warning since the installer isn't code-signed — click
   > "More info" → "Run anyway" to proceed.
7. Report back the release URL. Do not attempt to fix the SmartScreen warning itself
   (no-op — it requires paid code signing) unless the user separately asks about it.

## Project

PoE Acts Overlay — an Electron + React overlay for Path of Exile 1 leveling. It tails
the game's `Client.txt` to detect the current zone and shows per-zone guidance (route,
gem plan, zone layouts) from hot-reloaded TOML guides.

## Docs — read these first

Before touching the project, use the maps in `docs/` instead of re-reading everything:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — processes, data flow, IPC channels, state shape.
- [docs/TASK-MAP.md](docs/TASK-MAP.md) — "I want to change X → touch these files" cookbook + scripts.
- [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md) — guide/gem TOML, inline markup grammar, JSON data, shared types.

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
