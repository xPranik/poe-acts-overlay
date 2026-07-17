import { useEffect, useMemo, useState } from 'react'
import type { AppState, GuideAct, GuideZone } from '../../shared/types'
import { stepKey } from '../../shared/types'
import { Markup } from './Markup'

export default function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    window.api.getState().then(setState)
    return window.api.onState(setState)
  }, [])

  if (!state) return <div className="panel">Загрузка...</div>

  const act = state.guide.acts.find((a) => a.number === state.currentAct)
  const zone = act && state.currentZoneIndex >= 0 ? act.zones[state.currentZoneIndex] : undefined

  return (
    <div className={`panel ${state.interactive ? 'interactive' : ''}`}>
      <Header state={state} act={act} zone={zone} />
      {state.guide.errors.length > 0 && (
        <div className="errors">
          {state.guide.errors.map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}
      {state.layoutVisible && zone?.layout && (
        <div className="layout-box">
          <img src={`guide:///${zone.layout}`} alt="layout" />
        </div>
      )}
      {zone ? (
        <ZoneView state={state} zone={zone} />
      ) : (
        <div className="no-zone">
          {state.currentZone
            ? `Нет заметок для зоны «${state.currentZone}»`
            : 'Ожидание входа в зону...'}
        </div>
      )}
      <Footer state={state} />
    </div>
  )
}

function Header({
  state,
  act,
  zone
}: {
  state: AppState
  act?: GuideAct
  zone?: GuideZone
}): React.JSX.Element {
  return (
    <div className="header">
      <div className="drag-strip" title="Перетащить оверлей" />
      <div className="nav-row">
        <div className="act-nav">
          <button onClick={() => window.api.navAct(-1)}>‹</button>
          <span className="act-title">{act ? act.title : `Act ${state.currentAct}`}</span>
          <button onClick={() => window.api.navAct(1)}>›</button>
        </div>
        <div className="zone-nav">
          <button onClick={() => window.api.navZone(-1)}>‹</button>
          <span className="zone-title">{zone?.name ?? state.currentZone ?? '—'}</span>
          <button onClick={() => window.api.navZone(1)}>›</button>
        </div>
      </div>
    </div>
  )
}

function ZoneView({ state, zone }: { state: AppState; zone: GuideZone }): React.JSX.Element {
  const gems = useMemo(() => zone.steps.filter((s) => s.kind !== 'normal'), [zone])
  const normal = useMemo(() => zone.steps.filter((s) => s.kind === 'normal'), [zone])

  return (
    <div className="zone">
      {zone.notes && (
        <div className="notes">
          <Markup text={zone.notes} />
        </div>
      )}
      {normal.length > 0 && (
        <ul className="steps">
          {normal.map((s) => (
            <StepRow key={s.text} state={state} zone={zone} text={s.text} kind={s.kind} />
          ))}
        </ul>
      )}
      {gems.length > 0 && (
        <div className="gems">
          <div className="gems-title">💎 Камни</div>
          <ul className="steps">
            {gems.map((s) => (
              <StepRow key={s.text} state={state} zone={zone} text={s.text} kind={s.kind} />
            ))}
          </ul>
        </div>
      )}
      {zone.layout && (
        <button className="layout-toggle" onClick={() => window.api.toggleLayout()}>
          {state.layoutVisible ? 'Скрыть лайаут' : 'Показать лайаут (Ctrl+Alt+L)'}
        </button>
      )}
    </div>
  )
}

function StepRow({
  state,
  zone,
  text,
  kind
}: {
  state: AppState
  zone: GuideZone
  text: string
  kind: string
}): React.JSX.Element {
  const key = stepKey(state.currentAct, zone.name, text)
  const done = !!state.progress[key]
  const [first, ...subs] = text.split('\n')
  return (
    <li className={`step ${kind} ${done ? 'done' : ''}`} onClick={() => window.api.toggleStep(key)}>
      <span className="check">{done ? '✔' : '○'}</span>
      <span className="step-text">
        <Markup text={first} />
        {subs.map((sub, i) => (
          <span key={i} className="step-sub">
            <Markup text={sub} />
          </span>
        ))}
      </span>
    </li>
  )
}

function Footer({ state }: { state: AppState }): React.JSX.Element {
  return (
    <div className="footer">
      {state.logStatus.kind === 'missing' && (
        <span className="log-missing">⚠ {state.logStatus.message}</span>
      )}
      {state.interactive ? (
        <span className="mode on">режим кликов — Ctrl+Alt+I чтобы отпустить мышь</span>
      ) : (
        <span className="mode">Ctrl+Alt+I — кликать · Ctrl+Alt+O — скрыть</span>
      )}
    </div>
  )
}
