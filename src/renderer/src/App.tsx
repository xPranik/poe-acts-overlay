import { useEffect, useMemo, useRef, useState } from 'react'
import { expMultiplier, fullExpRange } from '../../shared/exp'
import { messages } from '../../shared/i18n'
import type {
  AppState,
  GemPortion,
  GuideAct,
  GuideStep,
  GuideZone,
  TimerState
} from '../../shared/types'
import { gemStepKey, stepKey } from '../../shared/types'
import { Markup } from './Markup'
import { Timer, fmt, liveElapsed, deltaColorClass } from './Timer'
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
    <div className={`overlay-root pos-${state.timerPosition}`} ref={rootRef}>
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

/** Цифры вместо иконки ⏱ в шапке, когда панель таймера свёрнута, а таймер не idle. */
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
            {!state.timer.visible && state.timer.status !== 'idle' ? (
              <MiniTimer timer={state.timer} />
            ) : (
              '⏱'
            )}
          </button>
          <button title={t.gemSettingsTitle} onClick={() => window.api.openSettings()}>
            ⚙
          </button>
          <button
            title={t.resetProgressTitle}
            onClick={() => {
              if (confirm(t.confirmResetProgress)) window.api.resetProgress()
            }}
          >
            ↺
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

  // Прогрессивные порции: показываем последнюю порцию, чья зона-триггер уже
  // достигнута (по позиции зоны внутри акта в маршруте). Порции из прошлых
  // актов считаются достигнутыми; будущие — скрыты до прихода в зону-триггер.
  const activePortion = useMemo<GemPortion | null>(() => {
    if (!preset || preset.portions.length === 0) return null
    const zoneIdx = (a: number, name: string): number => {
      const ga = state.guide.acts.find((x) => x.number === a)
      return ga ? ga.zones.findIndex((z) => z.name === name) : -1
    }
    // риска акта (форвард-онли, из main) не даёт бэктрекингу в раннюю зону
    // (например, в хаб акта) откатить показанную порцию назад
    const curIdx = Math.max(
      state.currentZoneIndex >= 0 ? state.currentZoneIndex : zoneIdx(act, zone.name),
      state.reachedZoneIndex[act] ?? -1
    )
    let found: GemPortion | null = null
    for (const p of preset.portions) {
      if (p.act < act) {
        found = p
        continue
      }
      if (p.act !== act) continue
      const trigIdx = zoneIdx(p.act, p.zone)
      if (trigIdx >= 0 && curIdx >= 0 && trigIdx <= curIdx) found = p
    }
    return found
  }, [preset, act, zone, state.guide.acts, state.currentZoneIndex, state.reachedZoneIndex])

  const hasGems = inlineGems.length + presetGems.length > 0 || activePortion !== null

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
            <>
            {preset && activePortion && (
              <div className="portion">
                <div className="portion-title">{activePortion.questName}</div>
                {activePortion.notes && (
                  <div className="notes portion-notes">
                    <Markup text={activePortion.notes} />
                  </div>
                )}
                {activePortion.steps.length > 0 && (
                  <ul className="steps">
                    {activePortion.steps.map((s) => (
                      <StepRow
                        key={`q:${activePortion.quest}:${s.text}`}
                        state={state}
                        keyValue={gemStepKey(activePortion.act, activePortion.zone, preset.id, s.text)}
                        text={s.text}
                        kind={s.kind}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
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
            </>
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
  const upd = state.updateStatus
  return (
    <div className="footer">
      {state.logStatus.kind === 'missing' && (
        <span className="log-missing">⚠ {state.logStatus.message}</span>
      )}
      {upd.kind === 'available' && (
        <span className="update-notice" onClick={() => window.api.openExternal(upd.url)}>
          ⬆ {t.updateAvailable(upd.version)}
        </span>
      )}
      {state.interactive ? (
        <span className="mode on">{t.clickModeOn}</span>
      ) : (
        <span className="mode">{t.clickModeOff}</span>
      )}
    </div>
  )
}
