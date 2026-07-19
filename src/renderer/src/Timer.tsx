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

export const CLOSE_THRESHOLD_MS = 10_000

export function deltaColorClass(delta: number | null): string {
  if (delta == null) return ''
  if (delta <= 0) return 'ahead'
  if (delta <= CLOSE_THRESHOLD_MS) return 'close'
  return 'behind'
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

  return (
    <div className={`timer status-${timer.status}`}>
      <div className="timer-head">
        <span className={`timer-total ${active ? deltaColorClass(rows[rows.length - 1]?.delta ?? null) : ''}`}>
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
              <span className={`split-delta ${deltaColorClass(r.delta)} ${r.gold ? 'gold' : ''}`}>
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
