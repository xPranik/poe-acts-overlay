import type { ActSplit, Run, TimerState } from '../shared/types'

/** Последний акт кампании — вход в его финальную зону завершает забег. */
export const FINAL_ACT = 10

export function initialTimerState(visible = false): TimerState {
  return {
    status: 'idle',
    accumulatedMs: 0,
    runningSince: null,
    currentAct: 1,
    splits: [],
    visible,
    pb: null,
    bestSegments: null
  }
}

/**
 * PB = завершённый забег с минимальным итогом; bestSegments = минимальный сегмент
 * каждого акта по всем забегам (Sum of Best / «золото»).
 */
export function computeComparison(runs: Run[]): {
  pb: ActSplit[] | null
  bestSegments: Record<number, number> | null
} {
  let pb: ActSplit[] | null = null
  let pbTotal = Infinity
  const best: Record<number, number> = {}

  for (const run of runs) {
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

  constructor(deps: RunTimerDeps, visible = false) {
    this.deps = deps
    this.now = deps.now ?? Date.now
    this.state = initialTimerState(visible)
    this.refreshComparison()
  }

  elapsed(): number {
    const s = this.state
    return s.accumulatedMs + (s.runningSince != null ? this.now() - s.runningSince : 0)
  }

  private refreshComparison(): void {
    const { pb, bestSegments } = computeComparison(this.deps.loadRuns(this.deps.profile()))
    this.state.pb = pb
    this.state.bestSegments = bestSegments
  }

  /** Запустить забег с текущего акта (ручной старт). */
  start(currentAct: number): void {
    const s = this.state
    if (s.status === 'running' || s.status === 'paused') return
    this.startedAt = this.now()
    s.status = 'running'
    s.accumulatedMs = 0
    s.runningSince = this.startedAt
    s.currentAct = Math.max(1, currentAct)
    s.splits = []
    this.refreshComparison()
  }

  /** Авто-сплит из лога: зафиксировать завершённые акты до `newAct` (форвард-онли). */
  advanceTo(newAct: number): void {
    const s = this.state
    if (s.status !== 'running') return
    if (newAct <= s.currentAct) return
    const e = this.elapsed()
    while (s.currentAct < newAct) {
      s.splits.push({ act: s.currentAct, cumulativeMs: e })
      s.currentAct++
    }
  }

  /** Ручной сплит (дубль авто): на финальном акте завершает забег. */
  manualSplit(): void {
    const s = this.state
    if (s.status !== 'running') return
    if (s.currentAct >= FINAL_ACT) {
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
      totalMs: total,
      completed: s.currentAct >= FINAL_ACT
    }
    this.deps.saveRun(run.profile, run)
    this.refreshComparison()
  }

  /** Снять последний сплит (undo). */
  undo(): void {
    const s = this.state
    if (s.status === 'finished') {
      // отменить финиш: продолжить с накопленного elapsed
      s.status = 'running'
      s.runningSince = this.now()
    }
    const last = s.splits.pop()
    if (last) s.currentAct = last.act
  }

  /** Сброс к idle (незавершённый забег отбрасывается). */
  reset(): void {
    const s = this.state
    s.status = 'idle'
    s.accumulatedMs = 0
    s.runningSince = null
    s.currentAct = 1
    s.splits = []
    this.refreshComparison()
  }

  toggleVisible(): void {
    this.state.visible = !this.state.visible
  }

  /** Перечитать историю забегов (после удаления/очистки извне) и пересчитать PB/сегменты. */
  reloadHistory(): void {
    this.refreshComparison()
  }
}
