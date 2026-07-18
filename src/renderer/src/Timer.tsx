import { useEffect, useState } from 'react'
import type { Language } from '../../shared/i18n'
import { messages } from '../../shared/i18n'
import type { TimerState } from '../../shared/types'

/** mm:ss или h:mm:ss; showMs добавляет десятые доли секунды. */
function fmt(ms: number, showMs = false): string {
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

function liveElapsed(t: TimerState, now: number): number {
  return t.accumulatedMs + (t.runningSince != null ? now - t.runningSince : 0)
}

interface Row {
  act: number
  cumulativeMs: number | null
  delta: number | null
  gold: boolean
  current: boolean
  /** акт ещё не пройден в этом забеге — показываем время PB серым для сравнения */
  pending: boolean
}

/**
 * Полный список всех актов гайда (livesplit-стиль): пройденные акты показывают
 * своё время и Δ к PB, текущий — живое время, ещё не начатые — время PB серым.
 */
function buildRows(t: TimerState, elapsed: number, acts: number[]): Row[] {
  const pbMap = new Map<number, number>()
  t.pb?.forEach((s) => pbMap.set(s.act, s.cumulativeMs))
  const splitMap = new Map<number, number>()
  t.splits.forEach((s) => splitMap.set(s.act, s.cumulativeMs))

  const active = t.status === 'running' || t.status === 'paused'
  const rows: Row[] = []
  let prevCum = 0
  for (const act of acts) {
    const pbCum = pbMap.get(act)
    const splitCum = splitMap.get(act)
    if (splitCum != null) {
      // пройденный акт
      const segment = splitCum - prevCum
      const bestSeg = t.bestSegments?.[act]
      rows.push({
        act,
        cumulativeMs: splitCum,
        delta: pbCum != null ? splitCum - pbCum : null,
        gold: bestSeg != null && segment < bestSeg,
        current: false,
        pending: false
      })
      prevCum = splitCum
    } else if (active && act === t.currentAct) {
      // текущий (ещё не заспличенный) акт — живая строка
      rows.push({
        act,
        cumulativeMs: elapsed,
        delta: pbCum != null ? elapsed - pbCum : null,
        gold: false,
        current: true,
        pending: false
      })
    } else {
      // ещё не начатый акт — ориентир по PB
      rows.push({
        act,
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
  const rows = buildRows(timer, elapsed, actList)
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
            <li
              key={r.act}
              className={`${r.current ? 'current' : ''} ${r.pending ? 'pending' : ''}`}
            >
              <span className="split-act">{t.actLabel(r.act)}</span>
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
