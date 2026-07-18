import { useEffect, useMemo, useRef, useState } from 'react'
import { expMultiplier, fullExpRange } from '../../shared/exp'
import { messages } from '../../shared/i18n'
import type { AppState, GuideAct, GuideStep, GuideZone } from '../../shared/types'
import { gemStepKey, stepKey } from '../../shared/types'
import { Markup } from './Markup'
import { Timer } from './Timer'
import trialIcon from './assets/trial.png'

export default function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hasState = state !== null

  useEffect(() => {
    window.api.getState().then(setState)
    return window.api.onState(setState)
  }, [])

  // Сообщаем main актуальные размеры контента, чтобы окно подгонялось под него.
  // Ширину меряем по overlay-root.scrollWidth: его box (width: fit-content)
  // ограничен шириной окна, поэтому bounding-rect не даёт окну расти — а scrollWidth
  // учитывает контент, вылезающий за ужатый box (панель/таймер с flex-shrink: 0),
  // и при этом уменьшается, когда таймер скрыт.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let raf = 0
    const report = (): void => {
      window.api.reportContentSize(
        Math.ceil(el.scrollWidth),
        Math.ceil(document.body.scrollHeight)
      )
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(report)
    })
    ro.observe(el)
    ro.observe(document.body)
    report()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [hasState])

  if (!state) return <div className="panel">{messages.ru.loading}</div>

  const t = messages[state.language]
  const act = state.guide.acts.find((a) => a.number === state.currentAct)
  const zone = act && state.currentZoneIndex >= 0 ? act.zones[state.currentZoneIndex] : undefined

  // В LiveSplit показываем только выбранную в настройках дистанцию забега (1/3/5/10 актов).
  const actNumbers = state.guide.acts
    .map((a) => a.number)
    .filter((n) => n <= state.timer.targetActs)

  return (
    <div className="overlay-root" ref={rootRef}>
      <div
        className={`panel ${state.interactive ? 'interactive' : ''} ${state.routeVisible ? '' : 'collapsed'}`}
      >
        <Header state={state} act={act} zone={zone} />
        {state.guide.errors.length > 0 && (
          <div className="errors">
            {state.guide.errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}
        {state.routeVisible && state.layoutVisible && zone?.layout && (
          <div className="layout-box">
            <img src={`guide:///${zone.layout}`} alt="layout" />
          </div>
        )}
        {zone ? (
          <ZoneView state={state} zone={zone} />
        ) : (
          <div className="no-zone">
            {state.currentZone ? t.noNotesForZone(state.currentZone) : t.waitingForZone}
          </div>
        )}
        <Footer state={state} />
      </div>
      {state.timer.visible && (
        <Timer timer={state.timer} acts={actNumbers} language={state.language} />
      )}
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
  const t = messages[state.language]
  return (
    <div className="header">
      <div className="drag-strip" title={t.dragOverlayTitle} />
      <div className="header-row">
        <div className="act-nav">
          <button onClick={() => window.api.navAct(-1)}>‹</button>
          <span className="act-title">{act ? act.title : `Act ${state.currentAct}`}</span>
          <button onClick={() => window.api.navAct(1)}>›</button>
        </div>
        <span className={state.hasTrial ? "zone-title trial-zone-title" : "zone-title"}>
          {state.hasTrial && (
            <span className="trial-badge" title={t.trialTooltip}>
              <img src={trialIcon} alt="trial" />
            </span>
          )}
          <span className="zone-name">{zone?.name ?? state.currentZone ?? '—'}</span>
          <ExpBadge state={state} />
        </span>
        <div className="zone-nav">
          <button onClick={() => window.api.navZone(-1)}>‹</button>
          <button onClick={() => window.api.navZone(1)}>›</button>
        </div>
        <div className="header-actions">
          <button
            className={state.routeVisible ? 'active' : ''}
            title={state.routeVisible ? t.hideRoute : t.showRoute}
            onClick={() => window.api.toggleRoute()}
          >
            ▤
          </button>
          <button
            className={state.timer.visible ? 'active' : ''}
            title={t.runTimerTitle}
            onClick={() => window.api.timerToggleVisible()}
          >
            ⏱
          </button>
          <button title={t.gemSettingsTitle} onClick={() => window.api.openSettings()}>
            ⚙
          </button>
        </div>
      </div>
      <div className="header-divider" />
    </div>
  )
}

/** Индикатор опыта рядом с названием зоны: зелёный «min|уровень|max» без штрафа, красный «NN% (−d)» со штрафом. */
function ExpBadge({ state }: { state: AppState }): React.JSX.Element | null {
  const lvl = state.charLevel
  const area = state.areaLevel
  if (lvl === null || area === null) return null
  const mult = expMultiplier(lvl, area)
  const hint = messages[state.language].expHint(area, lvl)
  if (mult >= 0.995) {
    const { min, max } = fullExpRange(lvl)
    return (
      <span className="exp-badge exp-ok" title={hint}>
        {min}|{lvl}|{max}
      </span>
    )
  }
  const diff = area - lvl
  return (
    <span className="exp-badge exp-penalty" title={hint}>
      {Math.round(mult * 100)}% ({diff > 0 ? '+' : '−'}
      {Math.abs(diff)})
    </span>
  )
}

function ZoneView({ state, zone }: { state: AppState; zone: GuideZone }): React.JSX.Element {
  const t = messages[state.language]
  const act = state.currentAct
  const normal = useMemo(() => zone.steps.filter((s) => s.kind === 'normal'), [zone])
  const inlineGems = useMemo(() => zone.steps.filter((s) => s.kind !== 'normal'), [zone])

  const presets = state.guide.presets
  const preset = presets.find((p) => p.id === state.activePreset) ?? null
  // Камни привязаны к АКТУ, а не к отдельной зоне: показываем весь план камней
  // текущего акта в любой зоне этого акта (город лишь одна из локаций акта).
  // Ключ прогресса при этом остаётся привязан к исходной зоне камня.
  const presetGems = useMemo<Array<{ zoneName: string; step: GuideStep }>>(() => {
    if (!preset) return []
    return preset.zones
      .filter((z) => z.act === act)
      .flatMap((z) => z.steps.map((step) => ({ zoneName: z.name, step })))
  }, [preset, act])
  const hasGems = inlineGems.length + presetGems.length > 0

  return (
    <>{state.routeVisible && (
      <div className="zone">
        {zone.notes && (
          <div className="notes">
            <Markup text={zone.notes} />
          </div>
        )}
        {normal.length > 0 && (
          <ul className="steps">
            {normal.map((s) => (
              <StepRow
                key={s.text}
                state={state}
                keyValue={stepKey(act, zone.name, s.text)}
                text={s.text}
                kind={s.kind}
              />
            ))}
          </ul>
        )}
        {zone.layout && (
          <button className="layout-toggle" onClick={() => window.api.toggleLayout()}>
            {state.layoutVisible ? t.hideLayout : t.showLayout}
          </button>
        )}
      </div>
    )}
    {(presets.length > 0 || hasGems) && (
        <div className="gems">
          {hasGems ? (
            <ul className="steps">
              {inlineGems.map((s) => (
                <StepRow
                  key={`i:${s.text}`}
                  state={state}
                  keyValue={stepKey(act, zone.name, s.text)}
                  text={s.text}
                  kind={s.kind}
                />
              ))}
              {preset &&
                presetGems.map(({ zoneName, step: s }) => (
                  <StepRow
                    key={`p:${zoneName}:${s.text}`}
                    state={state}
                    keyValue={gemStepKey(act, zoneName, preset.id, s.text)}
                    text={s.text}
                    kind={s.kind}
                  />
                ))}
            </ul>
          ) : (
            <div className="gems-empty">
              {state.activePreset ? t.noGemsInZone : t.pickBuildHint}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function StepRow({
  state,
  keyValue,
  text,
  kind
}: {
  state: AppState
  keyValue: string
  text: string
  kind: string
}): React.JSX.Element {
  const done = !!state.progress[keyValue]
  const [first, ...subs] = text.split('\n')
  return (
    <li
      className={`step ${kind} ${done ? 'done' : ''}`}
      onClick={() => window.api.toggleStep(keyValue)}
    >
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
  const t = messages[state.language]
  return (
    <div className="footer">
      {state.logStatus.kind === 'missing' && (
        <span className="log-missing">⚠ {state.logStatus.message}</span>
      )}
      {state.interactive ? (
        <span className="mode on">{t.clickModeOn}</span>
      ) : (
        <span className="mode">{t.clickModeOff}</span>
      )}
    </div>
  )
}
