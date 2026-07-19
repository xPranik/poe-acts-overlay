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
