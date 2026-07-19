# Act 1 Zone Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the run timer's distance is set to 1 act, show 7 curated per-zone
checkpoints inside act 1 (livesplit-style, like brandondong/POE-LiveSplit-Component)
plus the existing "act 1 complete" finish row, instead of the single act-1 row.
Distances 3/5/10 are untouched.

**Architecture:** Variant B — a separate branch bolted onto the existing act-based
timer, not a generalization of it. `RunTimer` (main process) gains a parallel
`zoneSplits` array and `onZoneEntered(zone)` method that only activates when
`targetActs === 1`; comparison math (`computeZoneComparison`) mirrors the existing
`computeComparison` but keyed by zone name instead of act number. The renderer
(`Timer.tsx`) picks between two row-builders based on `timer.targetActs === 1`.
The finish row deliberately reuses the *existing* act-1 split data (`timer.splits`/
`timer.pb` at `act === 1`) rather than adding an 8th synthetic checkpoint — the
finish is already recorded correctly today by the untouched `advanceTo`/`finish()`
logic (see Task 2 rationale).

**Tech Stack:** TypeScript, Electron (main/renderer split via electron-vite), React
19, no test framework in this repo — verification is `npm run typecheck` plus
manual driving via `npm run fake-log` (per `CLAUDE.md`), not automated unit tests.

## Global Constraints

- Never mention any AI assistant in commit messages (see `CLAUDE.md`).
- Commit after each task, in Russian-or-English style matching this repo's
  existing commit log (short, imperative, `type: summary` — e.g. `feat: ...`).
- Distances 3/5/10 (`targetActs !== 1`) must go through byte-for-byte the same
  code paths as before this change — every new branch is gated on
  `targetActs === 1`.
- Checkpoint zone names must exactly match the guide TOML zone names (verified
  against `guides/default/act-1.toml`): `The Coast`, `The Mud Flats`, `The Ledge`,
  `The Lower Prison`, `Prisoner's Gate` (straight apostrophe `'`), `The Ship
  Graveyard`, `The Cavern of Wrath`.
- Run `npm run typecheck` after every task before committing.

---

### Task 1: Shared checkpoint list, types, and i18n labels

**Files:**
- Create: `src/shared/act1-checkpoints.ts`
- Modify: `src/shared/types.ts:140-184` (add `ZoneSplit`, extend `Run` and `TimerState`)
- Modify: `src/shared/i18n.ts` (add `checkpointLabel`/`finishCheckpointLabel` to
  `Messages`, `ru`, `en`)

**Interfaces:**
- Produces: `ACT1_CHECKPOINTS: readonly string[]` (7 entries, in route order) —
  consumed by Task 2 (`main/timer.ts`) and Task 4 (`renderer/Timer.tsx`).
- Produces: `ZoneSplit { zone: string; cumulativeMs: number }` — consumed by
  Task 2 and Task 4.
- Produces: `Run.zoneSplits?: ZoneSplit[]` — consumed by Task 2
  (`computeZoneComparison`, `finish()`).
- Produces: `TimerState.zoneSplits: ZoneSplit[]`, `TimerState.zonePb: ZoneSplit[] | null`,
  `TimerState.bestZoneSegments: Record<string, number> | null` — consumed by
  Task 2 (`initialTimerState`, `RunTimer`) and Task 4 (`buildZoneRows`).
- Produces: `Messages.checkpointLabel: (zone: string) => string`,
  `Messages.finishCheckpointLabel: string` — consumed by Task 4.

- [ ] **Step 1: Create the checkpoint list**

Create `src/shared/act1-checkpoints.ts`:

```ts
/**
 * Курируемый список зон-чекпоинтов акта 1 для режима таймера "1 акт"
 * (livesplit-стиль, см. github.com/brandondong/POE-LiveSplit-Component).
 * Порядок = порядок прохождения по стандартному маршруту.
 */
export const ACT1_CHECKPOINTS: readonly string[] = [
  'The Coast',
  'The Mud Flats',
  'The Ledge',
  'The Lower Prison',
  "Prisoner's Gate",
  'The Ship Graveyard',
  'The Cavern of Wrath'
]
```

- [ ] **Step 2: Add `ZoneSplit` and extend `Run` in `src/shared/types.ts`**

Find:
```ts
/** Один сплит: акт `act` завершён на отметке `cumulativeMs` от старта забега. */
export interface ActSplit {
  act: number
  cumulativeMs: number
}

/** Сохранённый забег со сплитами по актам. */
export interface Run {
  id: string
  profile: string
  startedAt: number
  finishedAt: number | null
  splits: ActSplit[]
  totalMs: number | null
  completed: boolean
  /** дистанция забега в актах (1/3/5/10); отсутствие в старых записях трактуется как 10 */
  targetActs: number
}
```

Replace with:
```ts
/** Один сплит: акт `act` завершён на отметке `cumulativeMs` от старта забега. */
export interface ActSplit {
  act: number
  cumulativeMs: number
}

/** Один сплит зоны-чекпоинта акта 1 (режим таймера "1 акт"). */
export interface ZoneSplit {
  zone: string
  cumulativeMs: number
}

/** Сохранённый забег со сплитами по актам. */
export interface Run {
  id: string
  profile: string
  startedAt: number
  finishedAt: number | null
  splits: ActSplit[]
  /** сплиты по зонам-чекпоинтам акта 1; заполняется только когда targetActs === 1 */
  zoneSplits?: ZoneSplit[]
  totalMs: number | null
  completed: boolean
  /** дистанция забега в актах (1/3/5/10); отсутствие в старых записях трактуется как 10 */
  targetActs: number
}
```

- [ ] **Step 3: Extend `TimerState` in `src/shared/types.ts`**

Find:
```ts
export interface TimerState {
  status: TimerStatus
  /** замороженный elapsed (мс), накопленный до текущего resume */
  accumulatedMs: number
  /** epoch мс последнего resume; null в паузе/idle/finished */
  runningSince: number | null
  /** акт, который сейчас идёт */
  currentAct: number
  /** сплиты текущего забега */
  splits: ActSplit[]
  /** тоггл панели таймера */
  visible: boolean
  /** сплиты Personal Best забега (для Δ), null если истории нет */
  pb: ActSplit[] | null
  /** акт → лучший сегмент (мс) по всем забегам, null если истории нет */
  bestSegments: Record<number, number> | null
  /** целевая дистанция забега в актах (1/3/5/10) */
  targetActs: number
}
```

Replace with:
```ts
export interface TimerState {
  status: TimerStatus
  /** замороженный elapsed (мс), накопленный до текущего resume */
  accumulatedMs: number
  /** epoch мс последнего resume; null в паузе/idle/finished */
  runningSince: number | null
  /** акт, который сейчас идёт */
  currentAct: number
  /** сплиты текущего забега */
  splits: ActSplit[]
  /** сплиты по зонам-чекпоинтам акта 1 текущего забега (только режим targetActs === 1) */
  zoneSplits: ZoneSplit[]
  /** тоггл панели таймера */
  visible: boolean
  /** сплиты Personal Best забега (для Δ), null если истории нет */
  pb: ActSplit[] | null
  /** сплиты по зонам-чекпоинтам PB-забега (targetActs === 1), null если истории нет */
  zonePb: ZoneSplit[] | null
  /** акт → лучший сегмент (мс) по всем забегам, null если истории нет */
  bestSegments: Record<number, number> | null
  /** зона-чекпоинт → лучший сегмент (мс) по всем 1-актовым забегам, null если истории нет */
  bestZoneSegments: Record<string, number> | null
  /** целевая дистанция забега в актах (1/3/5/10) */
  targetActs: number
}
```

- [ ] **Step 4: Add checkpoint labels to `Messages` interface in `src/shared/i18n.ts`**

Find:
```ts
  clickModeOn: string
  clickModeOff: string
  actLabel: (n: number) => string

  timerIdle: string
```

Replace with:
```ts
  clickModeOn: string
  clickModeOff: string
  actLabel: (n: number) => string
  checkpointLabel: (zone: string) => string
  finishCheckpointLabel: string

  timerIdle: string
```

- [ ] **Step 5: Add lookup tables and RU strings in `src/shared/i18n.ts`**

Find:
```ts
const ru: Messages = {
  loading: 'Загрузка...',
```

Replace with:
```ts
const ACT1_CHECKPOINT_LABELS_RU: Record<string, string> = {
  'The Coast': 'Берег',
  'The Mud Flats': 'Топи',
  'The Ledge': 'Уступ',
  'The Lower Prison': 'Нижняя тюрьма',
  "Prisoner's Gate": 'Врата узника',
  'The Ship Graveyard': 'Кладбище кораблей',
  'The Cavern of Wrath': 'Пещера Гнева'
}

const ACT1_CHECKPOINT_LABELS_EN: Record<string, string> = {
  'The Coast': 'Coast',
  'The Mud Flats': 'Mud Flats',
  'The Ledge': 'Ledge',
  'The Lower Prison': 'Lower Prison',
  "Prisoner's Gate": "Prisoner's Gate",
  'The Ship Graveyard': 'Ship Graveyard',
  'The Cavern of Wrath': 'Cavern of Wrath'
}

const ru: Messages = {
  loading: 'Загрузка...',
```

- [ ] **Step 6: Wire the RU field in `src/shared/i18n.ts`**

Find:
```ts
  clickModeOn: 'режим кликов — Ctrl+Alt+I чтобы отпустить мышь',
  clickModeOff: 'Ctrl+Alt+I — кликать · Ctrl+Alt+O — скрыть',
  actLabel: (n) => `Акт ${n}`,

  timerIdle: 'готов',
```

Replace with:
```ts
  clickModeOn: 'режим кликов — Ctrl+Alt+I чтобы отпустить мышь',
  clickModeOff: 'Ctrl+Alt+I — кликать · Ctrl+Alt+O — скрыть',
  actLabel: (n) => `Акт ${n}`,
  checkpointLabel: (zone) => ACT1_CHECKPOINT_LABELS_RU[zone] ?? zone,
  finishCheckpointLabel: 'Финиш',

  timerIdle: 'готов',
```

- [ ] **Step 7: Wire the EN field in `src/shared/i18n.ts`**

Find:
```ts
  clickModeOn: 'click mode — Ctrl+Alt+I to release the mouse',
  clickModeOff: 'Ctrl+Alt+I — click · Ctrl+Alt+O — hide',
  actLabel: (n) => `Act ${n}`,

  timerIdle: 'ready',
```

Replace with:
```ts
  clickModeOn: 'click mode — Ctrl+Alt+I to release the mouse',
  clickModeOff: 'Ctrl+Alt+I — click · Ctrl+Alt+O — hide',
  actLabel: (n) => `Act ${n}`,
  checkpointLabel: (zone) => ACT1_CHECKPOINT_LABELS_EN[zone] ?? zone,
  finishCheckpointLabel: 'Finish',

  timerIdle: 'ready',
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `src/main/timer.ts` and `src/renderer/src/Timer.tsx` don't yet
populate the new required `TimerState` fields (`zoneSplits`, `zonePb`,
`bestZoneSegments`), so `initialTimerState`'s return object is missing keys.
This is expected; Task 2 fixes it. Confirm the errors are only in `timer.ts`
(object literal missing properties) and not in `types.ts` or `i18n.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/shared/act1-checkpoints.ts src/shared/types.ts src/shared/i18n.ts
git commit -m "feat: add act-1 zone checkpoint types and labels"
```

---

### Task 2: Timer engine — zone checkpoint tracking (`src/main/timer.ts`)

**Files:**
- Modify: `src/main/timer.ts` (full-file rewrite)

**Interfaces:**
- Consumes: `ACT1_CHECKPOINTS` from `src/shared/act1-checkpoints.ts` (Task 1).
- Consumes: `ZoneSplit`, extended `Run`/`TimerState` from `src/shared/types.ts` (Task 1).
- Produces: `computeZoneComparison(runs: Run[]): { zonePb: ZoneSplit[] | null; bestZoneSegments: Record<string, number> | null }`
  — consumed nowhere outside this file except by `RunTimer.refreshComparison`
  (kept exported to mirror the existing exported `computeComparison`, for
  parity/testability).
- Produces: `RunTimer.onZoneEntered(zone: string): void` — consumed by Task 3
  (`src/main/index.ts`).
- Unchanged signatures: `RunTimer.start`, `advanceTo`, `manualSplit`, `pause`,
  `resume`, `togglePause`, `finish`, `undo`, `reset`, `toggleVisible`,
  `setTargetActs`, `reloadHistory` — all still take the same params, but
  `undo`, `reset`, `start`, and `finish` now also touch `state.zoneSplits`.

**Rationale for not adding an 8th "Finish" checkpoint here:** for a 1-act run,
`startAct = endAct = 1`, so `advanceTo(2)` (fired when the player steps into
an act-2 zone) always satisfies `s.currentAct >= this.endAct` and calls
`finish()` immediately — this already happens today, unmodified. The finish
time therefore continues to live in `s.splits` (the existing `ActSplit` for
`act === 1`), and Task 4's renderer builds the "Finish" row from that same
data instead of duplicating it into `zoneSplits`.

- [ ] **Step 1: Rewrite `src/main/timer.ts`**

```ts
import { ACT1_CHECKPOINTS } from '../shared/act1-checkpoints'
import type { ActSplit, Run, TimerState, ZoneSplit } from '../shared/types'

/** Последний акт кампании — вход в его финальную зону завершает забег. */
export const FINAL_ACT = 10

export function initialTimerState(visible = false, targetActs = FINAL_ACT): TimerState {
  return {
    status: 'idle',
    accumulatedMs: 0,
    runningSince: null,
    currentAct: 1,
    splits: [],
    zoneSplits: [],
    visible,
    pb: null,
    bestSegments: null,
    zonePb: null,
    bestZoneSegments: null,
    targetActs
  }
}

/**
 * PB = завершённый забег с минимальным итогом; bestSegments = минимальный сегмент
 * каждого акта по всем забегам (Sum of Best / «золото»).
 */
export function computeComparison(
  runs: Run[],
  targetActs: number
): {
  pb: ActSplit[] | null
  bestSegments: Record<number, number> | null
} {
  let pb: ActSplit[] | null = null
  let pbTotal = Infinity
  const best: Record<number, number> = {}

  for (const run of runs) {
    // сравнение раздельно по дистанции; старые записи без поля трактуем как 10
    if ((run.targetActs ?? FINAL_ACT) !== targetActs) continue
    if (run.completed && run.totalMs != null && run.totalMs < pbTotal) {
      pbTotal = run.totalMs
      pb = run.splits
    }
    const cum: Record<number, number> = {}
    for (const s of run.splits) cum[s.act] = s.cumulativeMs
    for (const s of run.splits) {
      const prev = cum[s.act - 1] ?? 0
      const seg = s.cumulativeMs - prev
      if (seg > 0 && (best[s.act] == null || seg < best[s.act])) best[s.act] = seg
    }
  }

  return {
    pb,
    bestSegments: Object.keys(best).length ? best : null
  }
}

/**
 * То же самое, но по зонам-чекпоинтам акта 1 (режим таймера "1 акт"). Учитывает
 * только забеги с targetActs === 1; старые записи без zoneSplits по-прежнему
 * конкурируют за PB по общему времени, но не дают данных для zonePb/bestZoneSegments.
 */
export function computeZoneComparison(runs: Run[]): {
  zonePb: ZoneSplit[] | null
  bestZoneSegments: Record<string, number> | null
} {
  let zonePb: ZoneSplit[] | null = null
  let pbTotal = Infinity
  const best: Record<string, number> = {}

  for (const run of runs) {
    if ((run.targetActs ?? FINAL_ACT) !== 1) continue
    if (run.completed && run.totalMs != null && run.totalMs < pbTotal) {
      pbTotal = run.totalMs
      zonePb = run.zoneSplits ?? null
    }
    if (!run.zoneSplits) continue
    const cumByZone = new Map(run.zoneSplits.map((s) => [s.zone, s.cumulativeMs]))
    for (const s of run.zoneSplits) {
      const idx = ACT1_CHECKPOINTS.indexOf(s.zone)
      const prevCum = idx === 0 ? 0 : cumByZone.get(ACT1_CHECKPOINTS[idx - 1])
      if (prevCum == null) continue
      const seg = s.cumulativeMs - prevCum
      if (seg > 0 && (best[s.zone] == null || seg < best[s.zone])) best[s.zone] = seg
    }
  }

  return {
    zonePb,
    bestZoneSegments: Object.keys(best).length ? best : null
  }
}

export interface RunTimerDeps {
  profile: () => string
  loadRuns: (profile: string) => Run[]
  saveRun: (profile: string, run: Run) => void
  now?: () => number
}

/**
 * Логика speedrun-таймера по актам. Держит `TimerState` и историю забегов через
 * инжектированный персист (модуль намеренно без зависимостей от Electron).
 */
export class RunTimer {
  state: TimerState
  private deps: RunTimerDeps
  private now: () => number
  private startedAt = 0
  /** акт старта текущего забега */
  private startAct = 1
  /** целевой акт финиша: min(startAct + targetActs - 1, FINAL_ACT) */
  private endAct = FINAL_ACT

  constructor(deps: RunTimerDeps, visible = false, targetActs = FINAL_ACT) {
    this.deps = deps
    this.now = deps.now ?? Date.now
    this.state = initialTimerState(visible, targetActs)
    this.refreshComparison()
  }

  elapsed(): number {
    const s = this.state
    return s.accumulatedMs + (s.runningSince != null ? this.now() - s.runningSince : 0)
  }

  private refreshComparison(): void {
    const runs = this.deps.loadRuns(this.deps.profile())
    const { pb, bestSegments } = computeComparison(runs, this.state.targetActs)
    this.state.pb = pb
    this.state.bestSegments = bestSegments
    const { zonePb, bestZoneSegments } = computeZoneComparison(runs)
    this.state.zonePb = zonePb
    this.state.bestZoneSegments = bestZoneSegments
  }

  /** Запустить забег с текущего акта (ручной старт). */
  start(currentAct: number): void {
    const s = this.state
    if (s.status === 'running' || s.status === 'paused') return
    this.startedAt = this.now()
    this.startAct = Math.max(1, currentAct)
    // финиш через targetActs актов от старта, но не дальше финального акта кампании
    this.endAct = Math.min(this.startAct + s.targetActs - 1, FINAL_ACT)
    s.status = 'running'
    s.accumulatedMs = 0
    s.runningSince = this.startedAt
    s.currentAct = this.startAct
    s.splits = []
    s.zoneSplits = []
    this.refreshComparison()
  }

  /** Авто-сплит из лога: зафиксировать завершённые акты до `newAct` (форвард-онли). */
  advanceTo(newAct: number): void {
    const s = this.state
    if (s.status !== 'running') return
    if (newAct <= s.currentAct) return
    const e = this.elapsed()
    // не перешагиваем через целевой финиш — доводим до endAct и завершаем
    const target = Math.min(newAct, this.endAct)
    while (s.currentAct < target) {
      s.splits.push({ act: s.currentAct, cumulativeMs: e })
      s.currentAct++
    }
    if (s.currentAct >= this.endAct) this.finish()
  }

  /**
   * Чекпоинт-сплит из лога (режим "1 акт"): фиксирует первый вход в зону из
   * ACT1_CHECKPOINTS, форвард-онли — вход в более раннюю или уже пройденную
   * зону-чекпоинт (бэктрекинг) игнорируется навсегда. No-op вне активного
   * забега или при дистанции, отличной от 1 акта.
   */
  onZoneEntered(zone: string): void {
    const s = this.state
    if (s.status !== 'running' || s.targetActs !== 1) return
    const idx = ACT1_CHECKPOINTS.indexOf(zone)
    if (idx === -1) return
    const lastIdx =
      s.zoneSplits.length > 0
        ? ACT1_CHECKPOINTS.indexOf(s.zoneSplits[s.zoneSplits.length - 1].zone)
        : -1
    if (idx <= lastIdx) return
    s.zoneSplits.push({ zone, cumulativeMs: this.elapsed() })
  }

  /** Ручной сплит (дубль авто): на целевом акте завершает забег. */
  manualSplit(): void {
    const s = this.state
    if (s.status !== 'running') return
    if (s.currentAct >= this.endAct) {
      this.finish()
      return
    }
    this.advanceTo(s.currentAct + 1)
  }

  pause(): void {
    const s = this.state
    if (s.status !== 'running') return
    s.accumulatedMs = this.elapsed()
    s.runningSince = null
    s.status = 'paused'
  }

  resume(): void {
    const s = this.state
    if (s.status !== 'paused') return
    s.runningSince = this.now()
    s.status = 'running'
  }

  /** Одна клавиша пауза/резюм. */
  togglePause(): void {
    if (this.state.status === 'running') this.pause()
    else if (this.state.status === 'paused') this.resume()
  }

  /** Завершить забег: финальный сплит + сохранение. */
  finish(): void {
    const s = this.state
    if (s.status !== 'running' && s.status !== 'paused') return
    const total = this.elapsed()
    s.splits.push({ act: s.currentAct, cumulativeMs: total })
    s.accumulatedMs = total
    s.runningSince = null
    s.status = 'finished'
    const run: Run = {
      id: `${this.startedAt}`,
      profile: this.deps.profile(),
      startedAt: this.startedAt,
      finishedAt: this.now(),
      splits: [...s.splits],
      zoneSplits: s.targetActs === 1 ? [...s.zoneSplits] : undefined,
      totalMs: total,
      completed: s.currentAct >= this.endAct,
      targetActs: s.targetActs
    }
    this.deps.saveRun(run.profile, run)
    this.refreshComparison()
  }

  /** Снять последний сплит (undo); в режиме "1 акт" снимает и последний зонный чекпоинт. */
  undo(): void {
    const s = this.state
    if (s.status === 'finished') {
      // отменить финиш: продолжить с накопленного elapsed
      s.status = 'running'
      s.runningSince = this.now()
    }
    const last = s.splits.pop()
    if (last) {
      s.currentAct = last.act
      return
    }
    if (s.targetActs === 1) s.zoneSplits.pop()
  }

  /** Сброс к idle (незавершённый забег отбрасывается). */
  reset(): void {
    const s = this.state
    s.status = 'idle'
    s.accumulatedMs = 0
    s.runningSince = null
    s.currentAct = 1
    s.splits = []
    s.zoneSplits = []
    this.refreshComparison()
  }

  toggleVisible(): void {
    this.state.visible = !this.state.visible
  }

  /** Сменить дистанцию (число актов). Применимо только вне активного забега. */
  setTargetActs(n: number): void {
    if (this.state.status === 'running' || this.state.status === 'paused') return
    this.state.targetActs = Math.max(1, Math.min(Math.round(n), FINAL_ACT))
    // PB/сегменты считаются раздельно по дистанции — пересчитать
    this.refreshComparison()
  }

  /** Перечитать историю забегов (после удаления/очистки извне) и пересчитать PB/сегменты. */
  reloadHistory(): void {
    this.refreshComparison()
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If `src/renderer/src/Timer.tsx` errors appear about
missing `Row`/`ZoneRow` fields, that's expected until Task 4 — confirm errors
are confined to `src/renderer/src/Timer.tsx`, not `src/main/timer.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/main/timer.ts
git commit -m "feat: track act-1 zone checkpoints in the run timer engine"
```

---

### Task 3: Wire zone entries into the timer (`src/main/index.ts`)

**Files:**
- Modify: `src/main/index.ts:130-134`

**Interfaces:**
- Consumes: `RunTimer.onZoneEntered(zone: string): void` (Task 2).

- [ ] **Step 1: Call `onZoneEntered` from the log-driven zone handler**

Find (inside `function onZoneEntered(zoneName: string, areaLevel: number | null = null): void`):
```ts
  updateAreaLevel()
  // авто-сплит таймера по актам (форвард-онли): вход в акт N фиксирует акты < N
  if (runTimer.state.status === 'running') runTimer.advanceTo(state.currentAct)
  pushState()
```

Replace with:
```ts
  updateAreaLevel()
  if (runTimer.state.status === 'running') {
    // чекпоинты зон акта 1 (режим "1 акт"); no-op вне этого режима
    runTimer.onZoneEntered(zoneName)
    // авто-сплит таймера по актам (форвард-онли): вход в акт N фиксирует акты < N
    runTimer.advanceTo(state.currentAct)
  }
  pushState()
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for `src/main/**`. Renderer errors from Task 2's Step 2 may
still be present — that's fine, Task 4 fixes them.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: feed zone entries into the act-1 checkpoint tracker"
```

---

### Task 4: Renderer UI — zone checkpoint rows (`src/renderer/src/Timer.tsx`)

**Files:**
- Modify: `src/renderer/src/Timer.tsx` (full-file rewrite)

**Interfaces:**
- Consumes: `ACT1_CHECKPOINTS` (Task 1), `Messages` type incl. `checkpointLabel`/
  `finishCheckpointLabel` (Task 1), `TimerState` incl. `zoneSplits`/`zonePb`/
  `bestZoneSegments` (Task 1).
- No exported surface changes: `Timer`, `fmt`, `liveElapsed` keep their existing
  signatures (consumed by `src/renderer/src/App.tsx`, already reading
  `state.timer`/`actNumbers`/`state.language` — no change needed there).

- [ ] **Step 1: Rewrite `src/renderer/src/Timer.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ACT1_CHECKPOINTS } from '../../shared/act1-checkpoints'
import type { Language, Messages } from '../../shared/i18n'
import { messages } from '../../shared/i18n'
import type { TimerState } from '../../shared/types'

/** mm:ss или h:mm:ss; showMs добавляет десятые доли секунды. */
export function fmt(ms: number, showMs = false): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const base =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  if (!showMs) return base
  return `${base}.${Math.floor((ms % 1000) / 100)}`
}

/** Δ со знаком: положительная = медленнее (красная), отрицательная = быстрее (зелёная). */
function fmtDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '−'
  return `${sign}${fmt(Math.abs(ms), true)}`
}

export function liveElapsed(t: TimerState, now: number): number {
  return t.accumulatedMs + (t.runningSince != null ? now - t.runningSince : 0)
}

interface Row {
  key: string
  label: string
  cumulativeMs: number | null
  delta: number | null
  gold: boolean
  current: boolean
  /** ещё не пройден в этом забеге — показываем время PB серым для сравнения */
  pending: boolean
}

/**
 * Полный список всех актов гайда (livesplit-стиль): пройденные акты показывают
 * своё время и Δ к PB, текущий — живое время, ещё не начатые — время PB серым.
 */
function buildActRows(timer: TimerState, elapsed: number, acts: number[], msgs: Messages): Row[] {
  const pbMap = new Map<number, number>()
  timer.pb?.forEach((s) => pbMap.set(s.act, s.cumulativeMs))
  const splitMap = new Map<number, number>()
  timer.splits.forEach((s) => splitMap.set(s.act, s.cumulativeMs))

  const active = timer.status === 'running' || timer.status === 'paused'
  const rows: Row[] = []
  let prevCum = 0
  for (const act of acts) {
    const pbCum = pbMap.get(act)
    const splitCum = splitMap.get(act)
    if (splitCum != null) {
      // пройденный акт
      const segment = splitCum - prevCum
      const bestSeg = timer.bestSegments?.[act]
      rows.push({
        key: String(act),
        label: msgs.actLabel(act),
        cumulativeMs: splitCum,
        delta: pbCum != null ? splitCum - pbCum : null,
        gold: bestSeg != null && segment < bestSeg,
        current: false,
        pending: false
      })
      prevCum = splitCum
    } else if (active && act === timer.currentAct) {
      // текущий (ещё не заспличенный) акт — живая строка
      rows.push({
        key: String(act),
        label: msgs.actLabel(act),
        cumulativeMs: elapsed,
        delta: pbCum != null ? elapsed - pbCum : null,
        gold: false,
        current: true,
        pending: false
      })
    } else {
      // ещё не начатый акт — ориентир по PB
      rows.push({
        key: String(act),
        label: msgs.actLabel(act),
        cumulativeMs: pbCum ?? null,
        delta: null,
        gold: false,
        current: false,
        pending: true
      })
    }
  }

  return rows
}

/**
 * Чекпоинты акта 1 (livesplit-стиль по зонам) + строка "Финиш", которая
 * использует существующий акт-сплит (act=1) — финиш забега в режиме "1 акт"
 * пишется туда же, что и раньше (см. RunTimer.finish()). Навсегда пропущенный
 * чекпоинт (обогнали более поздним) рендерится прочерком.
 */
function buildZoneRows(timer: TimerState, elapsed: number, msgs: Messages): Row[] {
  const zonePbMap = new Map<string, number>()
  timer.zonePb?.forEach((s) => zonePbMap.set(s.zone, s.cumulativeMs))
  const zoneSplitMap = new Map<string, number>()
  timer.zoneSplits.forEach((s) => zoneSplitMap.set(s.zone, s.cumulativeMs))
  const lastRecordedIdx =
    timer.zoneSplits.length > 0
      ? ACT1_CHECKPOINTS.indexOf(timer.zoneSplits[timer.zoneSplits.length - 1].zone)
      : -1

  const active = timer.status === 'running' || timer.status === 'paused'
  const rows: Row[] = []
  let currentAssigned = false

  ACT1_CHECKPOINTS.forEach((zone, idx) => {
    const pbCum = zonePbMap.get(zone)
    const splitCum = zoneSplitMap.get(zone)
    if (splitCum != null) {
      // пройденный чекпоинт
      const prevZone = idx > 0 ? ACT1_CHECKPOINTS[idx - 1] : null
      const prevCum = prevZone != null ? zoneSplitMap.get(prevZone) : 0
      const bestSeg = timer.bestZoneSegments?.[zone]
      rows.push({
        key: zone,
        label: msgs.checkpointLabel(zone),
        cumulativeMs: splitCum,
        delta: pbCum != null ? splitCum - pbCum : null,
        gold: bestSeg != null && prevCum != null && splitCum - prevCum < bestSeg,
        current: false,
        pending: false
      })
    } else if (idx < lastRecordedIdx) {
      // навсегда пропущенный чекпоинт этого забега (обогнали более поздним)
      rows.push({
        key: zone,
        label: msgs.checkpointLabel(zone),
        cumulativeMs: null,
        delta: null,
        gold: false,
        current: false,
        pending: true
      })
    } else if (active && !currentAssigned) {
      // первый ещё не пройденный чекпоинт — живая строка
      currentAssigned = true
      rows.push({
        key: zone,
        label: msgs.checkpointLabel(zone),
        cumulativeMs: elapsed,
        delta: pbCum != null ? elapsed - pbCum : null,
        gold: false,
        current: true,
        pending: false
      })
    } else {
      // ещё не пройденный чекпоинт — ориентир по PB
      rows.push({
        key: zone,
        label: msgs.checkpointLabel(zone),
        cumulativeMs: pbCum ?? null,
        delta: null,
        gold: false,
        current: false,
        pending: true
      })
    }
  })

  // строка "Финиш" — переиспользует существующий акт-сплит (act=1)
  const finishSplit = timer.splits.find((s) => s.act === 1)?.cumulativeMs
  const finishPb = timer.pb?.find((s) => s.act === 1)?.cumulativeMs
  if (finishSplit != null) {
    rows.push({
      key: 'finish',
      label: msgs.finishCheckpointLabel,
      cumulativeMs: finishSplit,
      delta: finishPb != null ? finishSplit - finishPb : null,
      gold: false,
      current: false,
      pending: false
    })
  } else if (active && !currentAssigned) {
    rows.push({
      key: 'finish',
      label: msgs.finishCheckpointLabel,
      cumulativeMs: elapsed,
      delta: finishPb != null ? elapsed - finishPb : null,
      gold: false,
      current: true,
      pending: false
    })
  } else {
    rows.push({
      key: 'finish',
      label: msgs.finishCheckpointLabel,
      cumulativeMs: finishPb ?? null,
      delta: null,
      gold: false,
      current: false,
      pending: true
    })
  }

  return rows
}

export function Timer({
  timer,
  acts,
  language
}: {
  timer: TimerState
  acts: number[]
  language: Language
}): React.JSX.Element | null {
  const t = messages[language]
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (timer.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [timer.status])

  if (!timer.visible) return null

  // Если гайд не дал список актов — запасной вариант 1..10 (стандартная кампания PoE).
  const actList = acts.length > 0 ? acts : Array.from({ length: 10 }, (_, i) => i + 1)
  const elapsed = liveElapsed(timer, now)
  const zoneMode = timer.targetActs === 1
  const rows = zoneMode
    ? buildZoneRows(timer, elapsed, t)
    : buildActRows(timer, elapsed, actList, t)
  const running = timer.status === 'running'
  const paused = timer.status === 'paused'
  const active = running || paused

  const deltaClass = (d: number | null): string =>
    d == null ? '' : d > 0 ? 'behind' : 'ahead'

  return (
    <div className={`timer status-${timer.status}`}>
      <div className="timer-head">
        <span className={`timer-total ${active ? deltaClass(rows[rows.length - 1]?.delta ?? null) : ''}`}>
          {fmt(elapsed, true)}
        </span>
        <span className="timer-status">
          {timer.status === 'idle' && t.timerIdle}
          {running && t.actLabel(timer.currentAct)}
          {paused && t.timerPaused}
          {timer.status === 'finished' && t.timerFinished}
        </span>
      </div>

      {rows.length > 0 && (
        <ul className="timer-splits">
          {rows.map((r) => (
            <li key={r.key} className={`${r.current ? 'current' : ''} ${r.pending ? 'pending' : ''}`}>
              <span className="split-act">{r.label}</span>
              <span className={`split-delta ${deltaClass(r.delta)} ${r.gold ? 'gold' : ''}`}>
                {r.delta != null ? fmtDelta(r.delta) : ''}
              </span>
              <span className="split-time">
                {r.cumulativeMs != null ? fmt(r.cumulativeMs, true) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="timer-buttons">
        <button
          type="button"
          className="icon"
          onClick={() => window.api.timerStartSplit()}
          title={t.startSplitTitle}
          aria-label={t.startSplitTitle}
        >
          {timer.status === 'idle' || timer.status === 'finished' ? '▶' : '⏭'}
        </button>
        <button
          type="button"
          className="icon"
          disabled={!active}
          onClick={() => window.api.timerPause()}
          title={t.pauseResumeTitle}
          aria-label={t.pauseResumeTitle}
        >
          {running ? '⏸' : '⏯'}
        </button>
        <button
          type="button"
          className="icon"
          disabled={timer.splits.length === 0 && !active}
          onClick={() => window.api.timerUndo()}
          title={t.undoSplitTitle}
          aria-label={t.undoSplitTitle}
        >
          ↶
        </button>
        <button
          type="button"
          className="icon"
          disabled={!active}
          onClick={() => window.api.timerFinish()}
          title={t.finishRunTitle}
          aria-label={t.finishRunTitle}
        >
          ⏹
        </button>
        <button
          type="button"
          className="icon"
          onClick={() => window.api.timerReset()}
          title={t.resetTimerTitle}
          aria-label={t.resetTimerTitle}
        >
          ↺
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors across the whole project.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/Timer.tsx
git commit -m "feat: render act-1 zone checkpoints in the timer panel"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only — no code changes expected; if a bug is
found, fix it in the relevant file from Tasks 1-4 and re-run this task).

- [ ] **Step 1: Prepare a scratch log file**

```bash
POE_LOG="/c/Users/xpran/AppData/Local/Temp/claude/d--work-poe-acts-overlay/2d96e638-badd-4be3-9c35-6bf5e7dff1e4/scratchpad/act1-timer-test.txt"
npm run fake-log -- "$POE_LOG" --reset
```

Expected: `Файл обнулён (эмуляция рестарта игры)` printed, file exists and is empty.

- [ ] **Step 2: Launch the overlay against the scratch log**

```bash
POE_OVERLAY_LOG="$POE_LOG" npm run dev
```

Run this with `run_in_background: true` (it's a long-lived dev server) — leave
it running for the rest of this task.

- [ ] **Step 3: Set run distance to 1 act and start the run**

In the running overlay: open gem settings (⚙) → General tab → set "Run
distance" (`t.runDistanceTitle`) to 1 act. Back in the main overlay, open the
timer panel (⏱) and press Start (▶).

- [ ] **Step 4: Drive zone entries in order, including one skip and one backtrack**

```bash
npm run fake-log -- "$POE_LOG" "The Twilight Strand"
npm run fake-log -- "$POE_LOG" "Lioneye's Watch"
npm run fake-log -- "$POE_LOG" "The Coast"
npm run fake-log -- "$POE_LOG" "The Ledge"   # skip "The Mud Flats" on purpose
npm run fake-log -- "$POE_LOG" "The Mud Flats"  # backtrack — must NOT record
npm run fake-log -- "$POE_LOG" "The Lower Prison"
npm run fake-log -- "$POE_LOG" "Prisoner's Gate"
npm run fake-log -- "$POE_LOG" "The Ship Graveyard"
npm run fake-log -- "$POE_LOG" "The Cavern of Wrath"
```

Expected in the overlay's timer panel after each command: the timer panel
shows 8 rows (Coast, Mud Flats, Ledge, Lower Prison, Prisoner's Gate, Ship
Graveyard, Cavern of Wrath, Finish). "The Coast" and "The Ledge" get real
times as they're entered; "The Mud Flats" shows a permanent dash (`—`) even
after the backtrack step; each subsequent checkpoint gets a real time; "Finish"
stays live (ticking) once all 7 checkpoints are recorded.

- [ ] **Step 5: Complete the run and verify saved history**

```bash
npm run fake-log -- "$POE_LOG" "Lioneye's Watch"
```

(Re-entering the act-2 occurrence of Lioneye's Watch — resolveZone should
place this in act 2 given the character's level context from earlier zones,
completing act 1.) Expected: timer status flips to "finished", the "Finish"
row shows the total time. Open Settings → Runs tab and confirm a new row
appears with `1/1 act` distance.

- [ ] **Step 6: Second run — verify Δ and best-segment ("gold") comparison**

Repeat steps 3-5 once more (Reset ↺ first, then Start ▶, then the same zone
sequence from Step 4 without the intentional skip/backtrack this time — enter
all 7 checkpoints in order). Expected: each checkpoint row now shows a Δ vs
the first run's PB (green "ahead" or red "behind"), and at least one row is
highlighted gold if its segment beat the first run's segment for that
checkpoint.

- [ ] **Step 7: Regression-check distance 10 is untouched**

In gem settings, set "Run distance" back to 10 acts. Reset the timer, start
it, and drive one zone (`npm run fake-log -- "$POE_LOG" "The Coast"`).
Expected: the timer panel shows the original per-act row list (Act 1 through
Act 10), not zone checkpoints — confirming the `targetActs === 1` gate keeps
other distances on the old code path.

- [ ] **Step 8: Stop the dev server**

Stop the background `npm run dev` task (e.g. via `TaskStop` on its task id).

- [ ] **Step 9: Final full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors.

No commit for this task — it's verification only. If any step's actual
behavior didn't match expected, fix the specific file (Task 1-4) and re-run
the affected steps before considering the feature done.
