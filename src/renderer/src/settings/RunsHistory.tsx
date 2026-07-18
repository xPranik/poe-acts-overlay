import { useCallback, useEffect, useState } from 'react'
import type { Run } from '../../../shared/types'

function fmt(ms: number | null): string {
  if (ms == null) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function fmtDate(epoch: number): string {
  return new Date(epoch).toLocaleString()
}

export function RunsHistory(): React.JSX.Element {
  const [runs, setRuns] = useState<Run[]>([])

  const refresh = useCallback((): void => {
    window.api.getRuns().then(setRuns)
  }, [])

  useEffect(() => {
    refresh()
    // забеги финишируют в оверлее — подтягиваем актуальный список при фокусе окна
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  // Personal Best: завершённый забег с минимальным totalMs
  const pbId = runs
    .filter((r) => r.completed && r.totalMs != null)
    .sort((a, b) => a.totalMs! - b.totalMs!)[0]?.id

  return (
    <section className="runs">
      <div className="runs-head">
        <span className="pane-title">Забеги</span>
        <div className="runs-actions">
          <button onClick={refresh}>обновить</button>
          <button
            disabled={runs.length === 0}
            onClick={async () => {
              if (confirm('Удалить все сохранённые забеги?')) {
                setRuns(await window.api.clearRuns())
              }
            }}
          >
            очистить
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="hint">Забегов пока нет</div>
      ) : (
        <ul className="runs-list">
          {runs.map((r) => (
            <li
              key={r.id}
              className={`run-row${r.id === pbId ? ' pb' : ''}${r.completed ? '' : ' partial'}`}
            >
              <span className="run-date">{fmtDate(r.startedAt)}</span>
              <span className="run-profile">{r.profile}</span>
              <span className="run-acts">{r.splits.length}/10 актов</span>
              <span className="run-total">
                {fmt(r.totalMs)}
                {r.id === pbId ? ' ★' : ''}
              </span>
              <button
                className="icon-btn"
                title="Удалить забег"
                onClick={async () => setRuns(await window.api.deleteRun(r.id))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
