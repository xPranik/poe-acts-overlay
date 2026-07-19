# Act 1 zone checkpoints for the run timer — design

Date: 2026-07-19
Status: approved (variant B — separate branch for the 1-act distance only)

## Goal

When the run distance (`targetActs`) is **1**, the run timer shows key per-zone
checkpoints inside act 1 (like brandondong/POE-LiveSplit-Component's zone
auto-splits) instead of a single act split. Distances 3/5/10 keep the current
per-act behavior, untouched.

## Checkpoint list (curated, fixed)

Seven zone checkpoints + the existing finish (act 1 completion) = 8 rows:

1. The Coast
2. The Mud Flats
3. The Ledge
4. The Lower Prison
5. Prisoner's Gate
6. The Ship Graveyard
7. The Cavern of Wrath
8. Finish — act 1 completed (unchanged logic)

Zone names are the normalized names zone-tracker already resolves (same names
as the guide TOML), not raw log lines.

## Data model (`src/shared/types.ts`)

- New `ZoneSplit { zone: string; cumulativeMs: number }`.
- `RunRecord.zoneSplits?: ZoneSplit[]` — written only when `targetActs === 1`.
  Old records without it stay valid.
- `TimerState` gains fields populated only in 1-act mode:
  - `zoneSplits: ZoneSplit[]` — current run's zone splits
  - `zonePb: ZoneSplit[] | null` — PB run's zone splits
  - `bestZoneSegments: Record<string, number> | null` — best segment per zone

## Timer logic (`src/main/timer.ts`, wired from `src/main/index.ts`)

- Checkpoint list is a constant in `timer.ts`.
- New `RunTimer.onZoneEntered(zone)`; active only while running and
  `targetActs === 1`.
- Records a split on the **first** entry into a checkpoint zone, forward-only:
  once a later checkpoint is recorded, earlier ones are permanently skipped;
  backtracking never creates splits.
- Undo split also applies to zone splits: it removes the last recorded zone
  split (that checkpoint becomes eligible again as if not yet visited).
- Finish and run saving are unchanged; the saved `RunRecord` additionally
  carries `zoneSplits`.

## Comparison (extend `computeComparison` or a sibling helper)

For `targetActs === 1` only:

- PB run is chosen by total time, exactly as today; `zonePb` is taken from
  that run's `zoneSplits`.
- Best segment for checkpoint *i* = `cum[i] − cum[i−1]`, counted only when
  both adjacent checkpoints were recorded in that run (first checkpoint
  measures from 0).
- Old 1-act runs without `zoneSplits` still compete on total time; per-zone
  PB/segments accumulate from new runs only.

## UI (`src/renderer/src/Timer.tsx`, `src/shared/i18n.ts`)

- When `targetActs === 1`, render the 8 checkpoint rows instead of act rows,
  same visual style: time, Δ vs PB, best-segment highlight.
- Skipped checkpoint renders a dash and does not break comparison.
- Short localized labels in `i18n.ts`:
  - RU: Берег, Топи, Уступ, Нижняя тюрьма, Врата узника, Кладбище кораблей,
    Пещера Гнева, Финиш
  - EN: Coast, Mud Flats, Ledge, Lower Prison, Prisoner's Gate,
    Ship Graveyard, Cavern of Wrath, Finish
- Runs history window (`RunsHistory.tsx`) is unchanged (totals only).

## Edge cases

- Distances 3/5/10 go through untouched code paths.
- Reset/pause behave as before.
- Changing distance mid-run behaves as today (reset / comparison refresh).
- Entering non-checkpoint zones has no timer effect.

## Verification

- `npm run typecheck`.
- Without the game: `POE_OVERLAY_LOG=<file> npm run dev` + `npm run fake-log`
  driving an act-1 zone sequence, including one skipped checkpoint and a
  backtrack. Check: splits appear on first entry only, skipped row shows a
  dash, Δ appears after a second run, undo removes the last zone split, and
  distance 10 behavior is unchanged.
