# Data & content formats

Schemas for everything the app reads: TOML guides, the inline markup grammar, gem
presets, bundled JSON data, and the shared types. For how these are loaded and used, see
[ARCHITECTURE.md](ARCHITECTURE.md); for where to edit them, see [TASK-MAP.md](TASK-MAP.md).

---

## Act guide TOML

Location: `guides/<profile>/act-N.toml` (one file per act). Parsed by
`src/main/guide-loader.ts` (`parseAct`), hot-reloaded on save.

```toml
[act]
number = 1          # int, act number
title  = "Act 1"    # string

[[zone]]
name = "The Twilight Strand"     # EXACTLY as the game writes it in Client.txt (English)

  [[zone.steps]]
  text = "Find and kill {kill|Hillock}"

  [[zone.steps]]
  text = "→ {zone|Lioneye's Watch}"

[[zone]]
name   = "The Coast"
notes  = "Free text shown under the zone title."
layout = "layouts/a1-coast.png"  # optional image, relative to guides/<profile>/
```

| Table | Field | Type | Notes |
|---|---|---|---|
| `[act]` | `number` | int | required |
| | `title` | string | e.g. `"Act 1"` |
| `[[zone]]` | `name` | string | must match the log line exactly |
| | `notes` | string? | rendered under the title (markup applies) |
| | `layout` | string? | image path served via `guide://` (toggle `Ctrl+Alt+L`) |
| `[[zone.steps]]` | `text` | string | supports inline markup + multiline (see below) |
| | `kind` | string? | `unset` = normal, `"gem-buy"`, `"gem-reward"` (highlight) |

- A zone may have **zero** steps (e.g. a town).
- Multiline steps use TOML `"""…"""`; continuation lines prefixed with `·` render as
  `.step-sub` sub-notes:

```toml
  [[zone.steps]]
  text = """
Find and kill {kill|Hailrake}, take {item|Medicine Chest}
· Go ←
· Recommended Level: 4"""
```

- `StepKind` is defined in `src/shared/types.ts`; the loader's allowed set is
  `KINDS = ['normal','gem-buy','gem-reward']` in `guide-loader.ts`.
- Layout images live in `guides/<profile>/layouts/` (see `layouts/README.txt`).
- Regenerate all act files from exile-leveling with `npm run import-guide` — this
  **overwrites** them (see [TASK-MAP.md](TASK-MAP.md#scripts--data-regeneration)).

---

## Inline markup grammar

Defined in `src/shared/markup.ts`; rendered by `src/renderer/src/Markup.tsx`.

Grammar (`TOKEN_RE`): `{type}` or `{type|arg}` where `type` is one of:

```
zone · kill · quest · item · waypoint · portal · trial · logout · crafting · lab
```

- Display text = `arg` if given, else `DEFAULT_TEXT[type]`
  (`waypoint→"Waypoint"`, `portal→"Portal"`, `trial→"Trial of Ascendancy"`,
  `logout→"Logout"`, `crafting→"crafting recipe"`, `lab→"Labyrinth"`;
  `zone/kill/quest/item` default to empty).
- Special case: `{waypoint|Zone}` renders as `"Waypoint → Zone"`.
- Unknown/malformed constructs stay as plain text.
- Each typed token → `<span class="mk mk-<type>">` with an optional leading icon.
  `ICONS` (in `Markup.tsx`) maps: `waypoint→waypoint`, `portal→portal`, `quest→quest`,
  `trial→trial`, `logout→town`, `crafting→crafting`, `lab→trial`.
- `item` tokens are colored by gem attribute via `gemColor(text)` (falls back to the
  `.mk-item` CSS color when the name is not a known gem).

Example: `Take {item|Flame Wall} then {waypoint|The Coast}`.

---

## Gem preset TOML

Location: `guides/<profile>/gems/<id>.toml`. `<id>` matches `/^[\w-]+$/` and is the
preset id. Written by the settings editor (`writePreset` in `preset-store.ts`) — **manual
comments are lost on save**. Parsed by `parseGemEntry` (schema source of truth).

```toml
[preset]
name  = "Witch — RF"               # display name
class = "Witch"                    # optional; filters quest rewards in the editor

[[portion]]                        # progressive portion, keyed by quest id
quest = "a1q2"                     # id from quest-rewards.json (Breaking Some Eggs)
take  = [ "Freezing Pulse" ]       # pick as quest reward
buy   = [ "War Cry" ]              # buy from the quest's vendor NPC
notes = "Free text, shown under the portion title in the overlay."

[[zone]]
name = "Lioneye's Watch"           # a town; where gems are bought/rewarded
act  = 1                           # disambiguates repeated towns (Lioneye's Watch a1 vs a6)

[[zone.gems]]
kind  = "gem-reward"               # quest reward
quest = "After Hillock"
items = [ "Flame Wall", "Elemental Proliferation Support" ]

[[zone.gems]]
kind   = "gem-buy"                 # vendor purchase
vendor = "After Hillock"
items  = [ "Holy Flame Totem", "Shield Charge" ]
```

| Table | Field | Type | Notes |
|---|---|---|---|
| `[preset]` | `name` | string | shown in the build selector |
| | `class` | string? | `CharClass`; filters quest rewards in the editor picker |
| `[[portion]]` | `quest` | string | quest id from `quest-rewards.json` (e.g. `a1q2`); also the portion trigger |
| | `take` | string[] | gem picked as the quest reward — **at most one** (the editor caps this at 1: you only get one quest reward in-game) |
| | `buy` | string[] | gems to buy from the quest's vendor NPC — **not** limited to `quest-rewards.json`'s `vendor` list; the editor's buy picker searches the full gem catalog (`gems.json`), since vendor stock is cumulative across quests and old unlocks stay purchasable |
| | `notes` | string? | free-form text (markup applies), shown under the portion title in the overlay; a portion with `notes` but empty `take`/`buy` is still shown instead of being dropped |
| `[[zone]]` | `name` | string | usually a town (from `act-towns.json`) |
| | `act` | int | required; distinguishes duplicate town names |
| `[[zone.gems]]` | `kind` | `"gem-buy" \| "gem-reward"` | vendor buy vs quest reward |
| | `quest` | string? | label for reward entries |
| | `vendor` | string? | label for buy entries |
| | `items` | string[] | gem names (validated against `gems.json` in the picker) |
| | `text` | string? | legacy free-form text; used verbatim if present, else text is synthesized from `quest`/`vendor`/`items` by `gemEntryText()` |

**Act scoping**: the overlay shows a preset's gems in **every zone of the current act**
— `App.tsx` filters `preset.zones` by `z.act === currentAct` (gems are bound to the act,
not one zone). Progress keys use the source preset zone name via `gemStepKey`.

**Portions**: each `[[portion]]` is compiled to a `GemPortion` (steps synthesized from
`quest-rewards.json`: reward pick → `gem-reward`, vendor buys → `gem-buy`). The overlay
shows only the **latest portion whose trigger zone has been reached** — `App.tsx` picks
the last `GemPortion` whose `(act, zone)` is at or before the current guide position
(earlier act, or same act with trigger zone index ≤ current zone index); portions and
`[[zone]]` blocks are independent and can be mixed in one preset.

Guide position for this comparison is the **max** of the live `currentZoneIndex` and
`AppState.reachedZoneIndex[act]` — a forward-only ratchet updated in `onZoneEntered`
(main process) whenever a real log-driven zone entry reaches a new zoneIndex in an act.
This means backtracking to an earlier zone (e.g. returning to the act's town hub) does
not regress the shown portion. Manual route navigation (`navZone`/`navAct`) does **not**
update the ratchet. It's persisted per profile (`route-progress-<profile>.json`) and
cleared together with the "Reset progress" action.

The editable in-memory form is `PresetSource` (see below); the compiled form used by the
overlay is `GemPreset`/`PresetZone` with `GuideStep[]`.

---

## Bundled data JSON

Committed to the repo; regenerated by scripts (see [TASK-MAP.md](TASK-MAP.md#scripts--data-regeneration)).

| File | Shape | Consumed by | Purpose |
|---|---|---|---|
| `src/renderer/src/data/gems.json` | `{ name, attr: 'str'\|'dex'\|'int'\|'none', level, support }[]` | `gemAttrs.ts` → `GEM_LIST`, `gemColor`, `GemPicker` | Full gem catalog: colors + search |
| `src/renderer/src/data/act-towns.json` | `{ name, act }[]` (one town per act 1–10) | `SettingsApp.tsx` (`TOWNS`/`availableTowns`) | Zone choices in the preset editor |
| `src/shared/data/quest-rewards.json` | `{ id, name, act, zone, npc, vendorNpc, rewards, vendor }[]` (gems: `{ name, classes }`) | `quest-rewards.ts` → `QUEST_REWARDS`, `questRewardById`, `gemAvailableFor` | Quest gem rewards/vendor stock; portion triggers + editor picker |
| `src/main/data/zone-levels.json` | `{ name, act, level, town? }[]` | `area-levels.ts` → `getStaticArea` | Zone monster level → `AppState.areaLevel` |
| `src/main/data/trial-zones.json` | `{ name, act }[]` | `trial-zones.ts` → `hasTrial` | Marks Labyrinth-trial zones → `AppState.hasTrial` |

`gems.json` + `act-towns.json` + `quest-rewards.json` are regenerated by
`npm run import-data`; `zone-levels.json` also by `import-data`; `trial-zones.json`
is hand-maintained. Values from the two
`src/main/data/*.json` files reach the UI only through `AppState.areaLevel` / `hasTrial`.

---

## Shared types index

From `src/shared/types.ts` — one line each (full definitions in the file):

| Type | Shape (abridged) |
|---|---|
| `StepKind` | `'normal' \| 'gem-buy' \| 'gem-reward'` |
| `GuideStep` | `{ text; kind: StepKind }` |
| `GuideZone` | `{ name; notes?; layout?; steps: GuideStep[] }` |
| `GuideAct` | `{ number; title; zones: GuideZone[] }` |
| `Guide` | `{ profile; acts: GuideAct[]; presets: GemPreset[]; errors: string[] }` |
| `CharClass` | `'Marauder' \| 'Witch' \| ...` (7 classes; `CHAR_CLASSES` const) |
| `PresetZone` | `{ name; act; steps: GuideStep[] }` |
| `GemPortion` | `{ quest; questName; zone; act; steps: GuideStep[] }` (compiled portion) |
| `GemPreset` | `{ id; name; class?; zones: PresetZone[]; portions: GemPortion[] }` (compiled form) |
| `GemEntry` | `{ kind; text?; quest?; vendor?; items? }` (TOML source form) |
| `PresetPortion` | `{ quest; take: string[]; buy: string[] }` (TOML source form) |
| `PresetSource` | `{ id; name; class?; portions: PresetPortion[]; zones: { name; act; gems: GemEntry[] }[] }` (editable form) |
| `LogStatus` | `{ kind:'ok'; path } \| { kind:'missing'; message }` |
| `ActSplit` | `{ act; cumulativeMs }` |
| `Run` | `{ id; profile; startedAt; finishedAt; splits: ActSplit[]; totalMs; completed }` |
| `TimerStatus` | `'idle' \| 'running' \| 'paused' \| 'finished'` |
| `TimerState` | `{ status; accumulatedMs; runningSince; currentAct; splits; visible; pb; bestSegments }` |
| `AppState` | see [ARCHITECTURE.md → State](ARCHITECTURE.md#state) |

Helpers: `stepKey(act, zone, text)`, `gemStepKey(act, zone, presetId, text)`.

---

## Experience formula

`src/shared/exp.ts` (poewiki XP-penalty math), used by `ExpStrip` in `App.tsx`:

- `safeZone(playerLevel) = 3 + floor(playerLevel / 16)` — allowed level gap with no penalty.
- `expMultiplier(playerLevel, areaLevel)`:
  `eff = max(|playerLevel - areaLevel| - safeZone, 0)`;
  returns `((pl+5) / (pl+5 + eff^2.5))^1.5` in `0..1`.
- `fullExpRange(playerLevel) = { min: max(1, pl - sz), max: pl + sz }` — zone-level band
  giving 100% XP.

The high-area-level (71+) rule is intentionally omitted (not reached during the acts).

---

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — processes, data flow, IPC, state
- [TASK-MAP.md](TASK-MAP.md) — feature → files cookbook
