# Mini Timer in Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the timer panel is collapsed and the timer is not idle, the header's `⏱` button shows live ticking digits instead of the icon.

**Architecture:** Reuse `fmt()`/`liveElapsed()` from `Timer.tsx` (export them). Add a small `MiniTimer` component inside `App.tsx` that ticks locally via `setInterval` only while `status === 'running'`, and swap the `⏱` glyph for it inside the existing header button. One CSS block for tabular digits + paused dimming.

**Tech Stack:** React 19, TypeScript, Electron (electron-vite). No test framework in repo — verification is `npm run typecheck` plus a manual run (`npm run dev` + `npm run fake-log`), per project practice.

## Global Constraints

- **Never mention the AI assistant in git** — no `Co-Authored-By`, no "Generated with" (CLAUDE.md).
- **Do not commit or push unless the user explicitly asks** (CLAUDE.md). This plan therefore has no commit steps; when the user asks for a release/commit, follow CLAUDE.md.
- Spec: `docs/superpowers/specs/2026-07-19-mini-timer-design.md`.
- Time format in the header: `mm:ss`, or `h:mm:ss` from one hour — i.e. `fmt(ms)` **without** the `showMs` flag.
- Button click behavior and tooltip (`t.runTimerTitle`) must remain unchanged.

---

### Task 1: Export timer format helpers

**Files:**
- Modify: `src/renderer/src/Timer.tsx:7,27`

**Interfaces:**
- Produces: `export function fmt(ms: number, showMs = false): string` and `export function liveElapsed(t: TimerState, now: number): number` — both already exist as module-local functions; this task only adds `export`.

- [ ] **Step 1: Add `export` to the two helpers**

In `src/renderer/src/Timer.tsx` change line 7:

```ts
export function fmt(ms: number, showMs = false): string {
```

and line 27:

```ts
export function liveElapsed(t: TimerState, now: number): number {
```

No other changes — bodies stay identical, `fmtDelta` stays local.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

---

### Task 2: MiniTimer component + header button swap

**Files:**
- Modify: `src/renderer/src/App.tsx` (imports at top; header button at ~lines 133-139 inside the header component; new `MiniTimer` function component at file scope, next to the other local components)

**Interfaces:**
- Consumes: `fmt(ms)` and `liveElapsed(timer, now)` from `./Timer` (Task 1); `TimerState` from `../../shared/types`; existing `state.timer` prop already available in the header component.
- Produces: `function MiniTimer({ timer }: { timer: TimerState })` — local to `App.tsx`, used only by the header button. Task 3 relies on the class names `mini-timer` and `mini-timer-paused`.

- [ ] **Step 1: Extend imports**

In `src/renderer/src/App.tsx`, change the Timer import (line 7) to:

```ts
import { Timer, fmt, liveElapsed } from './Timer'
```

Ensure `TimerState` is included in the type import from `'../../shared/types'` (add it to the existing `import type { ... }` list).

`useEffect`/`useState` are already imported from `'react'` (line 1) — no change needed there.

- [ ] **Step 2: Add the MiniTimer component**

Add at file scope in `App.tsx` (near the other helper components, e.g. above the header component):

```tsx
/** Цифры вместо иконки ⏱ в шапке, когда панель таймера свёрнута, а таймер не idle. */
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

Notes for the implementer:
- When `status` is `paused`/`finished`, `runningSince` is `null`, so `liveElapsed` returns `accumulatedMs` regardless of `now` — a stale `now` is harmless and no interval runs.
- Match the file's existing component return-type style: if sibling components in `App.tsx` don't declare `: React.JSX.Element`, omit it here too.

- [ ] **Step 3: Swap the button content**

In the header's `header-actions` block, change the timer button (currently renders the `⏱` glyph as its child):

```tsx
<button
  className={state.timer.visible ? 'active' : ''}
  title={t.runTimerTitle}
  onClick={() => window.api.timerToggleVisible()}
>
  {!state.timer.visible && state.timer.status !== 'idle' ? (
    <MiniTimer timer={state.timer} />
  ) : (
    '⏱'
  )}
</button>
```

`className`, `title`, and `onClick` are byte-for-byte unchanged — only the child content is conditional now.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

---

### Task 3: CSS + manual verification

**Files:**
- Modify: `src/renderer/src/styles.css` (append near the `.header-actions` rules, after line ~277)

**Interfaces:**
- Consumes: class names `mini-timer`, `mini-timer-paused` from Task 2.

- [ ] **Step 1: Add styles**

Append after the `.header-actions button:hover` rule:

```css
.header-actions .mini-timer {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: #7fa3b0;
}

.header-actions .mini-timer-paused {
  color: #5b6570;
}
```

(`#7fa3b0` = the existing `active`/accent color; `#5b6570` = the existing idle button color — both already used in this file.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 3: Manual verification (spec's checklist)**

1. Start the app: `npm run dev` (in one terminal).
2. In another terminal drive fake zone events: `npm run fake-log`.
3. Verify against the spec table:
   - Timer panel open → button shows `⏱` (with `active` highlight), never digits.
   - Panel collapsed, timer idle → `⏱`.
   - Panel collapsed, timer running → digits tick (`m:ss`, no tenths); button width stable (tabular digits).
   - Pause → digits freeze and dim; resume → ticking resumes.
   - Finish → static final time; reset → `⏱` again.
   - Clicking the digits toggles the timer panel exactly like the icon did; tooltip unchanged.

Expected: all seven checks pass. If any fails, fix before reporting the task done (use superpowers:systematic-debugging for unexpected behavior).
