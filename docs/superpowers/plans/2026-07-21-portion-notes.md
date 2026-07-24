# Portion Notes Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-form `notes` field to gem-preset portions (`[[portion]]` in `gems/<id>.toml`), editable in the settings UI alongside TAKE/BUY, shown as plain text under the portion title in the overlay.

**Architecture:** Extend the existing `PresetPortion`/`GemPortion` types with an optional `notes?: string` that flows unchanged through the existing pipeline: TOML parse (`preset-store.ts`) → compile (`guide-loader.ts`) → overlay render (`App.tsx`). Editor UI (`SettingsApp.tsx`) gets one more bound textarea per portion block, no new abstractions.

**Tech Stack:** TypeScript, React 19, Electron (main/renderer split), `smol-toml` for TOML I/O. No test framework exists in this repo (no vitest/jest, `package.json` has no `test` script) — verification is `npm run typecheck` plus small throwaway `tsx` scripts for backend logic (deleted after use, matching the project's existing `scripts/*.ts` pattern) and manual smoke-testing via `npm run dev` for UI, per `docs/TASK-MAP.md`'s "Run & debug without the game" convention.

## Global Constraints

- Never mention the AI assistant in commit messages (`CLAUDE.md`): no `Co-Authored-By`, no "Generated with" lines.
- Do not touch the zone-gems `EntryRow` UI (the "Награда/Покупка" per-entry list) — out of scope, confirmed with the user.
- Do not add any new `StepKind`/`GemEntry.kind` values — this feature only adds a `notes` string field, not a new entry kind.
- Always run `npm run typecheck` before considering a task done.
- Empty/whitespace `notes` must be stored as `undefined`, not `""` — matches how every other optional string field in `PresetPortion`/`GemEntry` behaves (see `asString()` in `preset-store.ts`, and how `PresetSource` fields like `d.class` are cleared in `SettingsApp.tsx`).

---

### Task 1: Data model + TOML parse/write round-trip

**Files:**
- Modify: `src/shared/types.ts` (`PresetPortion` interface, `GemPortion` interface)
- Modify: `src/main/preset-store.ts` (`parsePortion`, `writePreset`)
- Test: `scripts/tmp-verify-notes-parse.ts` (temporary — created, run, then deleted within this task; never committed)

**Interfaces:**
- Consumes: existing `PresetSource`/`PresetPortion` shape from `src/shared/types.ts`; existing `readPresetSource(guidesRoot, profile, id, lang)`, `writePreset(guidesRoot, profile, src, lang)`, `deletePreset(guidesRoot, profile, id, lang)` from `src/main/preset-store.ts`.
- Produces: `PresetPortion.notes?: string` (readable/writable via `readPresetSource`/`writePreset`). Task 2 consumes this field.

- [ ] **Step 1: Add `notes` to `PresetPortion` in `src/shared/types.ts`**

Find this block (around line 103-110):

```ts
export interface PresetPortion {
  /** id квеста из quest-rewards.json (a1q5, ...) */
  quest: string
  /** забрать наградой за квест */
  take: string[]
  /** купить у торговца после квеста */
  buy: string[]
}
```

Replace with:

```ts
export interface PresetPortion {
  /** id квеста из quest-rewards.json (a1q5, ...) */
  quest: string
  /** забрать наградой за квест */
  take: string[]
  /** купить у торговца после квеста */
  buy: string[]
  /** свободный текст, показывается под заголовком порции в оверлее */
  notes?: string
}
```

- [ ] **Step 2: Add `notes` to `GemPortion` in `src/shared/types.ts`**

Find this block (around line 58-67):

```ts
export interface GemPortion {
  /** id квеста-триггера (a1q5, ...) из quest-rewards.json */
  quest: string
  /** имя квеста — заголовок порции в оверлее */
  questName: string
  /** зона-триггер: дойдя до неё, игрок открывает эту порцию */
  zone: string
  act: number
  steps: GuideStep[]
}
```

Replace with:

```ts
export interface GemPortion {
  /** id квеста-триггера (a1q5, ...) из quest-rewards.json */
  quest: string
  /** имя квеста — заголовок порции в оверлее */
  questName: string
  /** зона-триггер: дойдя до неё, игрок открывает эту порцию */
  zone: string
  act: number
  steps: GuideStep[]
  /** свободный текст, показывается под заголовком порции в оверлее */
  notes?: string
}
```

- [ ] **Step 3: Write the round-trip verification script**

Create `scripts/tmp-verify-notes-parse.ts`:

```ts
import path from 'node:path'
import { deletePreset, readPresetSource, writePreset } from '../src/main/preset-store'
import type { PresetSource } from '../src/shared/types'

const guidesRoot = path.resolve(__dirname, '..', 'guides')
const profile = 'default'
const id = 'tmp-verify-notes-parse'

const src: PresetSource = {
  id,
  name: id,
  zones: [],
  portions: [{ quest: 'a1q1', take: ['Rolling Magma'], buy: [], notes: 'Test note text' }]
}

writePreset(guidesRoot, profile, src, 'ru')
const read = readPresetSource(guidesRoot, profile, id, 'ru')
deletePreset(guidesRoot, profile, id, 'ru')

if (!read) throw new Error('readPresetSource returned null')
if (read.portions[0]?.notes !== 'Test note text') {
  throw new Error(`notes did not round-trip: got ${JSON.stringify(read.portions[0]?.notes)}`)
}
console.log('OK: portion notes round-trip verified')
```

- [ ] **Step 4: Run it to verify it fails (notes not yet parsed/written)**

Run: `npx tsx scripts/tmp-verify-notes-parse.ts`
Expected: throws `Error: notes did not round-trip: got undefined` (the file is written without a `notes` key because `writePreset` doesn't serialize it yet, and even if it were present `parsePortion` doesn't read it back).

- [ ] **Step 5: Implement `notes` in `parsePortion` (`src/main/preset-store.ts`)**

Find (around line 68-80):

```ts
export function parsePortion(
  raw: unknown,
  where: string,
  index: number,
  lang: Language
): PresetPortion {
  const p = raw as Record<string, unknown>
  const quest = asString(p.quest)
  if (!quest || !questRewardById(quest)) {
    throw new Error(messages[lang].portionUnknownQuestError(where, index, quest ?? ''))
  }
  return { quest, take: asStringList(p.take), buy: asStringList(p.buy) }
}
```

Replace the `return` line with:

```ts
  return { quest, take: asStringList(p.take), buy: asStringList(p.buy), notes: asString(p.notes) }
```

- [ ] **Step 6: Implement `notes` in `writePreset` (`src/main/preset-store.ts`)**

Find (around line 158-163):

```ts
    portion: src.portions.map((p) => {
      const out: Record<string, unknown> = { quest: p.quest }
      if (p.take.length > 0) out.take = p.take
      if (p.buy.length > 0) out.buy = p.buy
      return out
    }),
```

Replace with:

```ts
    portion: src.portions.map((p) => {
      const out: Record<string, unknown> = { quest: p.quest }
      if (p.take.length > 0) out.take = p.take
      if (p.buy.length > 0) out.buy = p.buy
      if (p.notes) out.notes = p.notes
      return out
    }),
```

- [ ] **Step 7: Run the script again to verify it passes**

Run: `npx tsx scripts/tmp-verify-notes-parse.ts`
Expected: prints `OK: portion notes round-trip verified` and exits 0.

- [ ] **Step 8: Delete the temporary script**

```bash
rm scripts/tmp-verify-notes-parse.ts
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/main/preset-store.ts
git commit -m "feat: add notes field to gem preset portions"
```

---

### Task 2: Compile notes into `GemPortion`, keep notes-only portions visible

**Files:**
- Modify: `src/main/guide-loader.ts` (`parsePreset`)
- Test: `scripts/tmp-verify-notes-compile.ts` (temporary — created, run, then deleted within this task; never committed)

**Interfaces:**
- Consumes: `PresetPortion.notes?: string` (Task 1), `writePreset`/`deletePreset` (`src/main/preset-store.ts`), `loadGuide(guidesRoot, profile, lang): Guide` (`src/main/guide-loader.ts`, unchanged signature).
- Produces: `Guide.presets[].portions[].notes?: string` populated by `loadGuide`. A portion with `notes` set but empty `take`/`buy` (so `portionSteps()` returns `[]`) is no longer dropped. Task 4 (overlay render) consumes `activePortion.notes`.

- [ ] **Step 1: Write the compile verification script**

Create `scripts/tmp-verify-notes-compile.ts`:

```ts
import path from 'node:path'
import { loadGuide } from '../src/main/guide-loader'
import { deletePreset, writePreset } from '../src/main/preset-store'
import type { PresetSource } from '../src/shared/types'

const guidesRoot = path.resolve(__dirname, '..', 'guides')
const profile = 'default'
const id = 'tmp-verify-notes-compile'

const src: PresetSource = {
  id,
  name: id,
  zones: [],
  // no take/buy — a "notes-only" portion, the case the drop-condition must not eat
  portions: [{ quest: 'a1q1', take: [], buy: [], notes: 'Note-only portion' }]
}

writePreset(guidesRoot, profile, src, 'ru')
const guide = loadGuide(guidesRoot, profile, 'ru')
const preset = guide.presets.find((p) => p.id === id)
deletePreset(guidesRoot, profile, id, 'ru')

if (!preset) throw new Error('preset not found in loaded guide')
const portion = preset.portions.find((p) => p.quest === 'a1q1')
if (!portion) throw new Error('notes-only portion was dropped by loadGuide')
if (portion.notes !== 'Note-only portion') {
  throw new Error(`notes missing on compiled portion: ${JSON.stringify(portion.notes)}`)
}
console.log('OK: notes-only portion survives compilation')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tmp-verify-notes-compile.ts`
Expected: throws `Error: notes-only portion was dropped by loadGuide` — `parsePreset`'s current `if (steps.length === 0) return` skips the portion entirely because it has no take/buy.

- [ ] **Step 3: Implement in `parsePreset` (`src/main/guide-loader.ts`)**

Find (around line 106-113):

```ts
  portionsRaw.forEach((p, i) => {
    const src = parsePortion(p, fileName, i, lang)
    const q = questRewardById(src.quest)
    if (!q) return
    const steps = portionSteps(src, lang)
    if (steps.length === 0) return // пустая порция ничего не показывает
    portions.push({ quest: q.id, questName: q.name, zone: q.zone, act: q.act, steps })
  })
```

Replace with:

```ts
  portionsRaw.forEach((p, i) => {
    const src = parsePortion(p, fileName, i, lang)
    const q = questRewardById(src.quest)
    if (!q) return
    const steps = portionSteps(src, lang)
    if (steps.length === 0 && !src.notes) return // пустая порция без заметки ничего не показывает
    portions.push({ quest: q.id, questName: q.name, zone: q.zone, act: q.act, steps, notes: src.notes })
  })
```

- [ ] **Step 4: Run the script again to verify it passes**

Run: `npx tsx scripts/tmp-verify-notes-compile.ts`
Expected: prints `OK: notes-only portion survives compilation` and exits 0.

- [ ] **Step 5: Delete the temporary script**

```bash
rm scripts/tmp-verify-notes-compile.ts
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/guide-loader.ts
git commit -m "feat: compile portion notes, keep notes-only portions visible"
```

---

### Task 3: Editor UI — notes textarea in the portion block

**Files:**
- Modify: `src/shared/i18n.ts` (add `portionNotesLabel`, `portionNotesPlaceholder` to the `Messages` interface, `ru`, and `en`)
- Modify: `src/renderer/src/settings/SettingsApp.tsx` (portion render block)
- Modify: `src/renderer/src/settings/settings.css` (new `.portion-notes-input` rule)

**Interfaces:**
- Consumes: `PresetPortion.notes?: string` (Task 1), `PresetSource`/`update()` pattern already used throughout `SettingsApp.tsx` (`update((d) => { ... })` mutates a draft and marks the preset dirty).
- Produces: nothing new consumed by later tasks — this is the editor half; Task 4 is the overlay-display half and only depends on Task 1/2's data model, not on this task.

- [ ] **Step 1: Add the two message keys to the `Messages` interface**

In `src/shared/i18n.ts`, find (around line 72-74):

```ts
  portionTakeLabel: string
  portionBuyLabel: string
  addPortionOption: string
```

Replace with:

```ts
  portionTakeLabel: string
  portionBuyLabel: string
  portionNotesLabel: string
  portionNotesPlaceholder: string
  addPortionOption: string
```

- [ ] **Step 2: Add the Russian strings**

Find (around line 221-223):

```ts
  portionTakeLabel: 'Забрать',
  portionBuyLabel: 'Купить',
  addPortionOption: '+ добавить квест...',
```

Replace with:

```ts
  portionTakeLabel: 'Забрать',
  portionBuyLabel: 'Купить',
  portionNotesLabel: 'Заметка',
  portionNotesPlaceholder: 'Свободный текст (необязательно)',
  addPortionOption: '+ добавить квест...',
```

- [ ] **Step 3: Add the English strings**

Find (around line 355-357):

```ts
  portionTakeLabel: 'Take',
  portionBuyLabel: 'Buy',
  addPortionOption: '+ add quest...',
```

Replace with:

```ts
  portionTakeLabel: 'Take',
  portionBuyLabel: 'Buy',
  portionNotesLabel: 'Notes',
  portionNotesPlaceholder: 'Free-form text (optional)',
  addPortionOption: '+ add quest...',
```

- [ ] **Step 4: Typecheck to confirm the new keys are wired correctly**

Run: `npm run typecheck`
Expected: no errors (both `ru` and `en` objects satisfy the updated `Messages` interface).

- [ ] **Step 5: Add the notes textarea to the portion block in `SettingsApp.tsx`**

Find (around line 298-323):

```tsx
                            {q && (
                              <>
                                <GemChips
                                  label={t.portionTakeLabel}
                                  addLabel={t.addGemOption}
                                  selected={p.take}
                                  options={q.rewards.filter((g) => gemAvailableFor(g, source.class))}
                                  max={1}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].take = names
                                    })
                                  }
                                />
                                <BuyGemChips
                                  label={t.portionBuyLabel}
                                  language={state.language}
                                  selected={p.buy}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].buy = names
                                    })
                                  }
                                />
                              </>
                            )}
```

Replace with:

```tsx
                            {q && (
                              <>
                                <GemChips
                                  label={t.portionTakeLabel}
                                  addLabel={t.addGemOption}
                                  selected={p.take}
                                  options={q.rewards.filter((g) => gemAvailableFor(g, source.class))}
                                  max={1}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].take = names
                                    })
                                  }
                                />
                                <BuyGemChips
                                  label={t.portionBuyLabel}
                                  language={state.language}
                                  selected={p.buy}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].buy = names
                                    })
                                  }
                                />
                                <div className="gem-chips">
                                  <span className="gem-chips-label">{t.portionNotesLabel}</span>
                                  <textarea
                                    className="portion-notes-input"
                                    placeholder={t.portionNotesPlaceholder}
                                    value={p.notes ?? ''}
                                    onChange={(e) =>
                                      update((d) => {
                                        d.portions[pi].notes = e.target.value || undefined
                                      })
                                    }
                                  />
                                </div>
                              </>
                            )}
```

- [ ] **Step 6: Add the textarea style to `settings.css`**

In `src/renderer/src/settings/settings.css`, find (around line 297-304):

```css
.gem-chips-label {
  flex: 0 0 58px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #7fa3b0;
}
```

Add immediately after it:

```css
.portion-notes-input {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  resize: vertical;
  font-size: 12px;
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual smoke test**

Run: `npm run dev`

In the settings window (tray → "Open settings", or hotkey `Ctrl+Alt+G`):
1. Go to the Presets tab.
2. In the new-preset id box, type `tmp-verify-ui`, click Create.
3. Under "Gem portions (by quest)" → Act 1, use the "+ add quest..." select and pick "Enemy at the Gate — The Twilight Strand" (adds the `a1q1` portion block).
4. In that block, confirm a "Заметка"/"Notes" field now appears below Take/Buy.
5. Type `manual test note` into it. The header's Save button should switch from "Saved" to "Save" (dirty state).
6. Click Save.
7. Open `guides/default/gems/tmp-verify-ui.toml` in an editor and confirm it contains:
   ```toml
   [[portion]]
   quest = "a1q1"
   notes = "manual test note"
   ```
8. Back in the settings window, click the ✕ next to `tmp-verify-ui` in the preset list to delete it, confirm the dialog. Confirm `guides/default/gems/tmp-verify-ui.toml` no longer exists.

Expected: notes field is visible, editable, persists to the TOML file with the `notes` key, and the whole test preset can be created/deleted without leftover files.

- [ ] **Step 9: Commit**

```bash
git add src/shared/i18n.ts src/renderer/src/settings/SettingsApp.tsx src/renderer/src/settings/settings.css
git commit -m "feat: add portion notes textarea to the preset editor"
```

---

### Task 4: Overlay display + docs

**Files:**
- Modify: `src/renderer/src/App.tsx` (`ZoneView`, active-portion render block)
- Modify: `src/renderer/src/styles.css` (new `.portion-notes` rule)
- Modify: `docs/DATA-FORMATS.md` (`[[portion]]` table + example)

**Interfaces:**
- Consumes: `GemPortion.notes?: string` (Task 2), existing `Markup` component (`src/renderer/src/Markup.tsx`, already imported in `App.tsx`), existing `activePortion` computation in `ZoneView` (unchanged by this task).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Render notes under the portion title in `App.tsx`**

Find (around line 287-302):

```tsx
            {preset && activePortion && (
              <div className="portion">
                <div className="portion-title">{activePortion.questName}</div>
                <ul className="steps">
                  {activePortion.steps.map((s) => (
                    <StepRow
                      key={`q:${activePortion.quest}:${s.text}`}
                      state={state}
                      keyValue={gemStepKey(activePortion.act, activePortion.zone, preset.id, s.text)}
                      text={s.text}
                      kind={s.kind}
                    />
                  ))}
                </ul>
              </div>
            )}
```

Replace with:

```tsx
            {preset && activePortion && (
              <div className="portion">
                <div className="portion-title">{activePortion.questName}</div>
                {activePortion.notes && (
                  <div className="notes portion-notes">
                    <Markup text={activePortion.notes} />
                  </div>
                )}
                {activePortion.steps.length > 0 && (
                  <ul className="steps">
                    {activePortion.steps.map((s) => (
                      <StepRow
                        key={`q:${activePortion.quest}:${s.text}`}
                        state={state}
                        keyValue={gemStepKey(activePortion.act, activePortion.zone, preset.id, s.text)}
                        text={s.text}
                        kind={s.kind}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
```

(The `{activePortion.steps.length > 0 && ...}` guard is needed because Task 2 allows notes-only portions with zero steps — without it an empty `<ul className="steps"></ul>` would render.)

- [ ] **Step 2: Add spacing/size rule for the overlay notes block**

In `src/renderer/src/styles.css`, find (around line 551-558):

```css
.portion-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #7fa3b0;
  margin-bottom: 2px;
}
```

Add immediately after it:

```css
.portion-notes {
  margin: 2px 0 4px;
  font-size: 12px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual smoke test with the overlay**

Run (PowerShell):

```powershell
$env:POE_OVERLAY_LOG = "D:\tmp\Client.txt"; npm run dev
```

In a second terminal:

```powershell
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --reset
npx tsx scripts/fake-log.ts D:\tmp\Client.txt "The Twilight Strand"
```

Then:
1. In the overlay, select the "rf" build (star icon in the settings Presets tab, or the tray build submenu) so `activePreset` is set.
2. Temporarily add a note to the `a1q1` portion of the real `rf` preset: open Settings → Presets → `rf` → Act 1 → "Enemy at the Gate" block → type `overlay smoke test` into the new Notes field → Save.
3. In the overlay window (zone: "The Twilight Strand"), confirm the "Enemy at the Gate" portion block shows the text `overlay smoke test` under its title, above the TAKE/BUY checkbox rows, styled as plain text (no checkbox, not clickable/togglable).
4. Revert the temporary edit to the committed guide file:

```bash
git checkout -- guides/default/gems/rf.toml
```

5. Confirm `git status` shows no pending changes under `guides/`.

Expected: the note text renders correctly with no checkbox, and the repo's tracked guide content is left untouched after cleanup.

- [ ] **Step 5: Update `docs/DATA-FORMATS.md`**

Find the gem preset TOML example (around line 96-119) — the `[[portion]]` block:

```toml
[[portion]]                        # progressive portion, keyed by quest id
quest = "a1q2"                     # id from quest-rewards.json (Breaking Some Eggs)
take  = [ "Freezing Pulse" ]       # pick as quest reward
buy   = [ "War Cry" ]              # buy from the quest's vendor NPC
```

Replace with:

```toml
[[portion]]                        # progressive portion, keyed by quest id
quest = "a1q2"                     # id from quest-rewards.json (Breaking Some Eggs)
take  = [ "Freezing Pulse" ]       # pick as quest reward
buy   = [ "War Cry" ]              # buy from the quest's vendor NPC
notes = "Free text, shown under the portion title in the overlay."
```

Then find the `[[portion]]` row of the field table (around line 125-127):

```
| `[[portion]]` | `quest` | string | quest id from `quest-rewards.json` (e.g. `a1q2`); also the portion trigger |
| | `take` | string[] | gem picked as the quest reward — **at most one** (the editor caps this at 1: you only get one quest reward in-game) |
| | `buy` | string[] | gems to buy from the quest's vendor NPC — **not** limited to `quest-rewards.json`'s `vendor` list; the editor's buy picker searches the full gem catalog (`gems.json`), since vendor stock is cumulative across quests and old unlocks stay purchasable |
```

Add a row immediately after the `buy` row:

```
| | `notes` | string? | free-form text (markup applies), shown under the portion title in the overlay; a portion with `notes` but empty `take`/`buy` is still shown instead of being dropped |
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css docs/DATA-FORMATS.md
git commit -m "feat: show portion notes in the overlay, document the field"
```
