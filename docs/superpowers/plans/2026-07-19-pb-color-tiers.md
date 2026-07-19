# 3-Tier PB Color Coding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timer deltas vs. PB (in the expanded panel's total/split rows and in the collapsed header's `MiniTimer`) show three colors instead of two: green when at or ahead of PB, orange when behind by 10 seconds or less, red when behind by more than 10 seconds.

**Architecture:** Replace the local binary `deltaClass` helper in `Timer.tsx` with an exported `deltaColorClass(delta)` function plus an exported `CLOSE_THRESHOLD_MS` constant. `Timer.tsx`'s two existing call sites (`.timer-total`, `.split-delta`) switch to the new function unchanged in signature. `MiniTimer` in `App.tsx` gains its own delta computation (`liveElapsed(timer, now) - pb-for-current-act`) and applies the same `deltaColorClass`. Three CSS color rules added per surface (`ahead`/`close`/`behind` — `ahead`/`behind` already exist and keep their colors, `close` is new).

**Tech Stack:** React 19, TypeScript, Electron (electron-vite). No test framework in repo — verification is `npm run typecheck` plus manual run (`npm run dev` + `npm run fake-log`), per project practice.

## Global Constraints

- **Never mention the AI assistant in git** — no `Co-Authored-By`, no "Generated with" (CLAUDE.md).
- **Do not commit or push unless the user explicitly asks** — per the established pattern in this branch's prior mini-timer work, each task's implementer commits as part of executing this plan (that execution is itself the user's authorization); do not push, open PRs, or merge without a separate explicit ask.
- Spec: `docs/superpowers/specs/2026-07-19-pb-color-tiers-design.md`.
- `CLOSE_THRESHOLD_MS = 10_000` (10 seconds) — a fixed constant, not a user setting.
- Color values (exact, must match spec): `ahead` = `#6fce87` (existing, unchanged), `close` = `#e0a955` (new), `behind` = `#e08585` (existing, unchanged).
- `delta == null` → no color class, in every surface (no PB recorded, or no PB entry for the current act).
- `.split-delta.gold` (best-segment highlight) is a separate, orthogonal class — it is not touched and continues to combine with whichever of `ahead`/`close`/`behind` applies.

---

### Task 1: `deltaColorClass` in Timer.tsx + apply to panel

**Files:**
- Modify: `src/renderer/src/Timer.tsx` (add exports near `fmt`/`liveElapsed`; replace local `deltaClass` at its two call sites)

**Interfaces:**
- Produces: `export const CLOSE_THRESHOLD_MS = 10_000` and `export function deltaColorClass(delta: number | null): string` — returns `''` | `'ahead'` | `'close'` | `'behind'`. Task 2 imports both from `./Timer`.
- Consumes: nothing new; `delta` values are already computed as `number | null` by the existing `buildRows` logic and the `rows[rows.length - 1]?.delta ?? null` expression.

- [ ] **Step 1: Add the constant and function**

In `src/renderer/src/Timer.tsx`, add after `liveElapsed` (currently ending at line 29, right before the `interface Row` block at line 31):

```ts
export const CLOSE_THRESHOLD_MS = 10_000

export function deltaColorClass(delta: number | null): string {
  if (delta == null) return ''
  if (delta <= 0) return 'ahead'
  if (delta <= CLOSE_THRESHOLD_MS) return 'close'
  return 'behind'
}
```

- [ ] **Step 2: Remove the local `deltaClass` and switch call sites**

Delete the local helper (currently at lines 124-125 inside the `Timer` component body):

```ts
  const deltaClass = (d: number | null): string =>
    d == null ? '' : d > 0 ? 'behind' : 'ahead'
```

Then update its two call sites in the same file to call `deltaColorClass` instead:

```tsx
<span className={`timer-total ${active ? deltaColorClass(rows[rows.length - 1]?.delta ?? null) : ''}`}>
```

```tsx
<span className={`split-delta ${deltaColorClass(r.delta)} ${r.gold ? 'gold' : ''}`}>
```

No other lines in the component change. `fmtDelta` stays local and unexported.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/Timer.tsx
git commit -m "feat: 3-tier PB delta color (ahead/close/behind) in timer panel"
```

---

### Task 2: CSS for the panel's `close` tier

**Files:**
- Modify: `src/renderer/src/styles.css` (append next to the existing `.timer-total.ahead`/`.behind` and `.split-delta.ahead`/`.behind` rules)

**Interfaces:**
- Consumes: the `close` class name produced by `deltaColorClass` (Task 1).

- [ ] **Step 1: Add `.timer-total.close`**

In `src/renderer/src/styles.css`, after the existing block (currently lines 138-140):

```css
.timer-total.behind {
  color: #e08585;
}
```

add:

```css

.timer-total.close {
  color: #e0a955;
}
```

- [ ] **Step 2: Add `.split-delta.close`**

After the existing block (currently lines 194-196):

```css
.split-delta.behind {
  color: #e08585;
}
```

add:

```css

.split-delta.close {
  color: #e0a955;
}
```

Leave `.split-delta.gold` (lines 198-200) untouched — it is a separate class that combines with any of `ahead`/`close`/`behind` on the same element.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors (CSS changes don't affect this, but confirms no stray edits broke anything).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles.css
git commit -m "style: add close-tier color for timer panel PB deltas"
```

---

### Task 3: PB-aware color in MiniTimer (App.tsx) + CSS

**Files:**
- Modify: `src/renderer/src/App.tsx` (import; `MiniTimer` body at lines 100-114)
- Modify: `src/renderer/src/styles.css` (append near the existing `.header-actions .mini-timer` rules)

**Interfaces:**
- Consumes: `deltaColorClass` from `./Timer` (Task 1); `TimerState.pb: ActSplit[] | null` and `TimerState.currentAct: number` from `../../shared/types` (already imported); `liveElapsed` (already imported and used in `MiniTimer`).
- Produces: no new exports — `MiniTimer`'s rendered `className` now includes one of `''`/`ahead`/`close`/`behind` alongside the existing `mini-timer`/`mini-timer-paused` classes.

- [ ] **Step 1: Extend the Timer import**

In `src/renderer/src/App.tsx`, change line 14:

```ts
import { Timer, fmt, liveElapsed } from './Timer'
```

to:

```ts
import { Timer, fmt, liveElapsed, deltaColorClass } from './Timer'
```

- [ ] **Step 2: Compute delta and apply the class in `MiniTimer`**

Replace the current `MiniTimer` function body (lines 101-114):

```tsx
function MiniTimer({ timer }: { timer: TimerState }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (timer.status !== 'running') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer.status, timer.runningSince])
  return (
    <span className={`mini-timer${timer.status === 'paused' ? ' mini-timer-paused' : ''}`}>
      {fmt(liveElapsed(timer, now))}
    </span>
  )
}
```

with:

```tsx
function MiniTimer({ timer }: { timer: TimerState }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (timer.status !== 'running') return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer.status, timer.runningSince])
  const elapsed = liveElapsed(timer, now)
  const pbCum = timer.pb?.find((s) => s.act === timer.currentAct)?.cumulativeMs
  const delta = pbCum != null ? elapsed - pbCum : null
  const classes = [
    'mini-timer',
    timer.status === 'paused' ? 'mini-timer-paused' : '',
    deltaColorClass(delta)
  ]
    .filter(Boolean)
    .join(' ')
  return <span className={classes}>{fmt(elapsed)}</span>
}
```

Notes for the implementer:
- `timer.pb` is `ActSplit[] | null`; `ActSplit` has `act: number` and `cumulativeMs: number` (see `src/shared/types.ts`). `.find` on `null` would throw, hence the optional-chained `timer.pb?.find(...)`.
- When `status` is `paused`/`finished`, `runningSince` is `null` so `liveElapsed` returns the frozen `accumulatedMs` — `delta`/color is static too, matching the spec's "paused/finished color remains static" requirement with no extra code needed.
- If `timer.pb` is `null`, or no entry matches `timer.currentAct`, `pbCum` is `undefined` → `delta` is `null` → `deltaColorClass` returns `''` → no color class, exactly like the panel's own neutral case.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 4: Add CSS for the three color classes on `.mini-timer`**

In `src/renderer/src/styles.css`, after the existing block:

```css
.header-actions .mini-timer-paused {
  color: #5b6570;
}
```

add:

```css

.header-actions .mini-timer.ahead {
  color: #6fce87;
}

.header-actions .mini-timer.close {
  color: #e0a955;
}

.header-actions .mini-timer.behind {
  color: #e08585;
}
```

These are scoped with the `.header-actions` ancestor (matching the file's existing pattern for this block, e.g. `.header-actions .mini-timer` and `.header-actions .mini-timer-paused`) so they reliably override the base `.header-actions .mini-timer` color rule regardless of rule order.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 6: Manual verification**

1. Start the app: `npm run dev` (one terminal).
2. Drive fake zone/level events with `npm run fake-log` in another terminal, running at least two full acts so a PB (`timer.pb`) exists from a prior finished run.
3. On a subsequent run, verify:
   - Ahead of PB at the current act → green total time in the panel, green split deltas for completed acts, green digits in the collapsed header.
   - Within 10 seconds behind PB → orange in all three places.
   - More than 10 seconds behind PB → red in all three places.
   - No PB yet, or current act has no PB entry → neutral (no color) in all three places.
   - `.split-delta.gold` (best segment) still shows its gold color independent of the ahead/close/behind color on the same row.
4. Collapse the timer panel while running behind/close/ahead — the header digits' color must match what the panel showed for the total.

Expected: all checks pass. If any fails, fix before reporting the task done (use superpowers:systematic-debugging for unexpected behavior).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat: PB-aware color tiers for collapsed mini-timer"
```
