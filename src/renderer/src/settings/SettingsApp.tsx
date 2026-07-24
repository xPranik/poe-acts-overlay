import { useEffect, useState } from 'react'
import type { Language } from '../../../shared/i18n'
import { messages } from '../../../shared/i18n'
import type { AppState, CharClass, GemEntry, PresetPortion, PresetSource } from '../../../shared/types'
import { CHAR_CLASSES } from '../../../shared/types'
import type { QuestRewardGem } from '../../../shared/quest-rewards'
import { QUEST_REWARDS, gemAvailableFor, questRewardById } from '../../../shared/quest-rewards'
import actTowns from '../data/act-towns.json'
import { GemPicker } from './GemPicker'
import { RunsHistory } from './RunsHistory'
import './settings.css'

const ID_RE = /^[\w-]+$/

// города актов — единственные зоны, где покупают/забирают камни (по одному на акт 1-10)
const TOWNS = actTowns as Array<{ name: string; act: number }>

// порядок квестов в quest-rewards.json = порядок прохождения; порции храним в нём же,
// чтобы «последняя достигнутая» в оверлее выбиралась корректно
const QUEST_ORDER = new Map(QUEST_REWARDS.map((q, i) => [q.id, i]))

// акты, в которых вообще есть квесты с гем-наградами (для группировки в редакторе)
const QUEST_ACTS = [...new Set(QUEST_REWARDS.map((q) => q.act))].sort((a, b) => a - b)

// группирует порции пресета по акту их квеста-триггера, сохраняя исходный порядок
// (порции уже отсортированы по QUEST_ORDER, так что группы выходят по актам)
function groupPortionsByAct(
  portions: PresetPortion[]
): Array<{ act: number; items: Array<{ p: PresetPortion; pi: number; q: ReturnType<typeof questRewardById> }> }> {
  const groups: Array<{
    act: number
    items: Array<{ p: PresetPortion; pi: number; q: ReturnType<typeof questRewardById> }>
  }> = []
  portions.forEach((p, pi) => {
    const q = questRewardById(p.quest)
    const act = q?.act ?? 0
    let group = groups.find((g) => g.act === act)
    if (!group) {
      group = { act, items: [] }
      groups.push(group)
    }
    group.items.push({ p, pi, q })
  })
  return groups.sort((a, b) => a.act - b.act)
}

type Tab = 'presets' | 'general' | 'runs'

/** Окно настроек: редактор пресетов камней (gems/<id>.toml) + общие настройки + история забегов. */
export function SettingsApp(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [tab, setTab] = useState<Tab>('general')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [source, setSource] = useState<PresetSource | null>(null)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  // где открыт выбор камня: индекс зоны + индекс записи
  const [picker, setPicker] = useState<{ zi: number; index: number } | null>(null)

  useEffect(() => {
    window.api.getState().then(setState)
    return window.api.onState(setState)
  }, [])

  if (!state) return <div className="settings-root">{messages.ru.loading}</div>

  const t = messages[state.language]
  const presets = state.guide.presets

  async function select(id: string): Promise<void> {
    if (dirty && !confirm(t.confirmDiscardChanges)) return
    const src = await window.api.getPresetSource(id)
    setSelectedId(id)
    setSource(src ?? { id, name: id, zones: [], portions: [] })
    setDirty(false)
    setMessage(null)
    setPicker(null)
  }

  function update(mut: (draft: PresetSource) => void): void {
    if (!source) return
    const draft: PresetSource = JSON.parse(JSON.stringify(source))
    mut(draft)
    setSource(draft)
    setDirty(true)
  }

  async function save(): Promise<void> {
    if (!source) return
    // пустые записи (ни text, ни items) не примет загрузчик — выкидываем молча
    const cleaned: PresetSource = {
      ...source,
      zones: source.zones
        .map((z) => ({
          ...z,
          gems: z.gems.filter((g) => g.text || (g.items && g.items.length > 0))
        }))
        .filter((z) => z.gems.length > 0)
    }
    const res = await window.api.savePreset(cleaned)
    if (res.ok) {
      setSource(cleaned)
      setDirty(false)
      setMessage(null)
    } else {
      setMessage(res.error)
    }
  }

  async function createPreset(): Promise<void> {
    const id = newId.trim()
    if (!ID_RE.test(id)) {
      setMessage(t.invalidPresetIdMsg)
      return
    }
    if (presets.some((p) => p.id === id)) {
      setMessage(t.presetExistsMsg(id))
      return
    }
    const res = await window.api.savePreset({ id, name: id, zones: [], portions: [] })
    if (!res.ok) {
      setMessage(res.error)
      return
    }
    setNewId('')
    await select(id)
  }

  async function duplicate(): Promise<void> {
    if (!source) return
    let id = `${source.id}-copy`
    let n = 2
    while (presets.some((p) => p.id === id)) id = `${source.id}-copy${n++}`
    const res = await window.api.savePreset({ ...source, id, name: `${source.name} ${t.copySuffix}` })
    if (!res.ok) {
      setMessage(res.error)
      return
    }
    await select(id)
  }

  async function remove(id: string): Promise<void> {
    if (!confirm(t.confirmDeletePresetMsg(id))) return
    const res = await window.api.deletePreset(id)
    if (!res.ok) {
      setMessage(res.error)
      return
    }
    if (selectedId === id) {
      setSelectedId(null)
      setSource(null)
      setDirty(false)
    }
  }

  const availableTowns = TOWNS.filter(
    (t) => !source?.zones.some((z) => z.name === t.name && z.act === t.act)
  )

  return (
    <div className="settings-root">
      <nav className="settings-tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          {t.generalTabTitle}
        </button>
        <button className={tab === 'presets' ? 'active' : ''} onClick={() => setTab('presets')}>
          {t.presetsTitle}
        </button>
        <button className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}>
          {t.runsTitle}
        </button>
      </nav>

      {state.guide.errors.length > 0 && (
        <div className="banner error">
          {state.guide.errors.map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}

      <div className="settings-body">
        {tab === 'presets' && (
          <>
            <aside className="preset-list">
              <div className="preset-list-scroll">
                <div className="pane-title">{t.presetsTitle}</div>
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className={`preset-item ${p.id === selectedId ? 'selected' : ''}`}
                    onClick={() => select(p.id)}
                  >
                    <button
                      className={`icon-btn active-toggle ${state.activePreset === p.id ? 'is-active' : ''}`}
                      title={state.activePreset === p.id ? t.activePresetOn : t.activePresetOff}
                      onClick={(e) => {
                        e.stopPropagation()
                        window.api.setPreset(state.activePreset === p.id ? null : p.id)
                      }}
                    >
                      {state.activePreset === p.id ? '★' : '☆'}
                    </button>
                    <span className="preset-item-name">{p.name}</span>
                    <button
                      className="icon-btn"
                      title={t.deletePresetTitle}
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(p.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {presets.length === 0 && <div className="hint">{t.noPresetsYet}</div>}
              </div>
              <div className="new-preset">
                <input
                  placeholder={t.newPresetIdPlaceholder}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createPreset()}
                />
                <button onClick={createPreset}>{t.createBtn}</button>
              </div>
            </aside>

            <main className="editor">
              {message && <div className="banner error">⚠ {message}</div>}

              {!source ? (
                <div className="hint big">{t.pickOrCreateHint}</div>
              ) : (
                <>
                  <div className="editor-head">
                    <input
                      className="preset-name"
                      value={source.name}
                      title={t.presetNameTitle}
                      onChange={(e) => update((d) => (d.name = e.target.value))}
                    />
                    <span className="preset-id">gems/{source.id}.toml</span>
                    <button onClick={duplicate}>{t.duplicateBtn}</button>
                    <button className="primary" disabled={!dirty} onClick={save}>
                      {dirty ? t.saveBtn : t.savedBtn}
                    </button>
                  </div>

                  <div className="settings-row">
                    <span className="pane-title">{t.classLabel}</span>
                    <select
                      value={source.class ?? ''}
                      onChange={(e) =>
                        update((d) => {
                          if (e.target.value === '') delete d.class
                          else d.class = e.target.value as CharClass
                        })
                      }
                    >
                      <option value="">{t.classNoneOption}</option>
                      {CHAR_CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <section className="portions">
                    <div className="pane-title" title={t.portionsHint}>
                      {t.portionsSectionTitle}
                    </div>
                    {groupPortionsByAct(source.portions).map(({ act, items }) => (
                      <div key={act} className="portion-group">
                        <div className="portion-group-title">{t.actLabel(act)}</div>
                        {items.map(({ p, pi, q }) => (
                          <div key={p.quest} className="zone-block">
                            <div className="zone-block-head">
                              <span className="zone-block-name">
                                {q ? q.name : p.quest}
                                {q && <span className="zone-block-act">{q.zone}</span>}
                              </span>
                              <button
                                className="icon-btn"
                                title={t.removePortionTitle}
                                onClick={() =>
                                  update((d) => {
                                    d.portions.splice(pi, 1)
                                  })
                                }
                              >
                                ✕
                              </button>
                            </div>
                            {q && (
                              <>
                                <GemChips
                                  label={t.portionTakeLabel}
                                  addLabel={t.addGemOption}
                                  selected={p.take}
                                  options={q.rewards.filter((g) => gemAvailableFor(g, source.class))}
                                  max={1}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].take = names
                                    })
                                  }
                                />
                                <BuyGemChips
                                  label={t.portionBuyLabel}
                                  language={state.language}
                                  selected={p.buy}
                                  onChange={(names) =>
                                    update((d) => {
                                      d.portions[pi].buy = names
                                    })
                                  }
                                />
                                <div className="gem-chips">
                                  <span className="gem-chips-label">{t.portionNotesLabel}</span>
                                  <textarea
                                    className="portion-notes-input"
                                    placeholder={t.portionNotesPlaceholder}
                                    value={p.notes ?? ''}
                                    onChange={(e) =>
                                      update((d) => {
                                        d.portions[pi].notes = e.target.value || undefined
                                      })
                                    }
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="add-zone">
                      <select
                        value=""
                        onChange={(e) => {
                          const id = e.target.value
                          if (id === '') return
                          update((d) => {
                            d.portions.push({ quest: id, take: [], buy: [] })
                            d.portions.sort(
                              (a, b) =>
                                (QUEST_ORDER.get(a.quest) ?? 1e9) - (QUEST_ORDER.get(b.quest) ?? 1e9)
                            )
                          })
                        }}
                      >
                        <option value="">{t.addPortionOption}</option>
                        {QUEST_ACTS.map((act) => {
                          const opts = QUEST_REWARDS.filter(
                            (q) => q.act === act && !source.portions.some((p) => p.quest === q.id)
                          )
                          if (opts.length === 0) return null
                          return (
                            <optgroup key={act} label={t.actLabel(act)}>
                              {opts.map((q) => (
                                <option key={q.id} value={q.id}>
                                  {q.name} — {q.zone}
                                </option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    </div>
                  </section>

                  {source.zones.map((zone, zi) => (
                    <section key={`${zone.act}|${zone.name}`} className="zone-block">
                      <div className="zone-block-head">
                        <span className="zone-block-name">
                          {zone.name}
                          <span className="zone-block-act">{t.actLabel(zone.act)}</span>
                        </span>
                        <button
                          className="icon-btn"
                          title={t.removeZoneFromPresetTitle}
                          onClick={() =>
                            update((d) => {
                              d.zones.splice(zi, 1)
                            })
                          }
                        >
                          ✕
                        </button>
                      </div>
                      {zone.gems.map((gem, gi) => (
                        <EntryRow
                          key={gi}
                          gem={gem}
                          language={state.language}
                          canUp={gi > 0}
                          canDown={gi < zone.gems.length - 1}
                          pickerOpen={picker?.zi === zi && picker.index === gi}
                          onOpenPicker={() => setPicker({ zi, index: gi })}
                          onClosePicker={() => setPicker(null)}
                          onChange={(g) =>
                            update((d) => {
                              d.zones[zi].gems[gi] = g
                            })
                          }
                          onMove={(delta) =>
                            update((d) => {
                              const gems = d.zones[zi].gems
                              const [g] = gems.splice(gi, 1)
                              gems.splice(gi + delta, 0, g)
                            })
                          }
                          onDelete={() =>
                            update((d) => {
                              d.zones[zi].gems.splice(gi, 1)
                            })
                          }
                        />
                      ))}
                      <button
                        className="add-entry"
                        onClick={() => {
                          update((d) => {
                            d.zones[zi].gems.push({ kind: 'gem-buy', items: [] })
                          })
                          setPicker({ zi, index: zone.gems.length })
                        }}
                      >
                        {t.addEntryBtn}
                      </button>
                    </section>
                  ))}

                  <div className="add-zone">
                    <select
                      value=""
                      onChange={(e) => {
                        const idx = e.target.value
                        if (idx === '') return
                        const town = availableTowns[Number(idx)]
                        update((d) => d.zones.push({ name: town.name, act: town.act, gems: [] }))
                      }}
                    >
                      <option value="">{t.addZoneOption}</option>
                      {availableTowns.map((town, i) => (
                        <option key={`${town.act}|${town.name}`} value={i}>
                          {town.name} ({t.actLabel(town.act)})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </main>
          </>
        )}

        {tab === 'general' && (
          <main className="editor">
            <div className="settings-row">
              <span className="pane-title">{t.languageTitle}</span>
              <div className="target-acts">
                <button
                  className={state.language === 'ru' ? 'active' : ''}
                  onClick={() => window.api.setLanguage('ru')}
                >
                  RU
                </button>
                <button
                  className={state.language === 'en' ? 'active' : ''}
                  onClick={() => window.api.setLanguage('en')}
                >
                  EN
                </button>
              </div>
            </div>

            <div className="settings-row">
              <span className="pane-title">{t.updateSectionTitle}</span>
              <div className="target-acts">
                <button onClick={() => window.api.checkForUpdates()}>
                  {state.updateStatus.kind === 'checking' ? t.checkingUpdate : t.checkUpdateBtn}
                </button>
                {(() => {
                  const upd = state.updateStatus
                  if (upd.kind === 'up-to-date') return <span>{t.updateUpToDate}</span>
                  if (upd.kind === 'error') return <span>{t.updateCheckError}</span>
                  if (upd.kind === 'available') {
                    return (
                      <span
                        className="update-link"
                        onClick={() => window.api.openExternal(upd.url)}
                      >
                        {t.updateAvailable(upd.version)}
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </main>
        )}

        {tab === 'runs' && (
          <main className="editor">
            <div className="settings-row">
              <span className="pane-title">{t.runDistanceTitle}</span>
              <div className="target-acts">
                {[1, 3, 5, 10].map((n) => (
                  <button
                    key={n}
                    className={state.timer.targetActs === n ? 'active' : ''}
                    onClick={() => window.api.setTargetActs(n)}
                  >
                    {n} {t.actsWord(n)}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <span className="pane-title">{t.timerPositionTitle}</span>
              <div className="target-acts">
                {(['top', 'bottom', 'left', 'right'] as const).map((p) => (
                  <button
                    key={p}
                    className={state.timerPosition === p ? 'active' : ''}
                    onClick={() => window.api.setTimerPosition(p)}
                  >
                    {t.timerPositionNames[p]}
                  </button>
                ))}
              </div>
            </div>

            <RunsHistory language={state.language} />
          </main>
        )}
      </div>
    </div>
  )
}

// чипы выбранных камней порции + селект для добавления из наград квеста.
// `max` ограничивает число выбранных камней (в игре за квест берут только один).
function GemChips({
  label,
  addLabel,
  selected,
  options,
  max,
  onChange
}: {
  label: string
  addLabel: string
  selected: string[]
  options: QuestRewardGem[]
  max?: number
  onChange: (names: string[]) => void
}): React.JSX.Element {
  const available = options.filter((g) => !selected.includes(g.name))
  const atMax = max !== undefined && selected.length >= max
  return (
    <div className="gem-chips">
      <span className="gem-chips-label">{label}</span>
      {selected.map((name, i) => (
        <span key={name} className="gem-chip">
          {name}
          <button
            className="icon-btn"
            onClick={() => onChange(selected.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </span>
      ))}
      {!atMax && available.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onChange([...selected, e.target.value])
          }}
        >
          <option value="">{addLabel}</option>
          {available.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// чипы покупки: поиск по полному каталогу камней (а не только по ассортименту
// этого конкретного квеста) — в игре у торговца можно докупать и то, что
// открылось на более ранних заданиях, список не ограничен одним квестом
function BuyGemChips({
  label,
  language,
  selected,
  onChange
}: {
  label: string
  language: Language
  selected: string[]
  onChange: (names: string[]) => void
}): React.JSX.Element {
  const t = messages[language]
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="gem-chips">
        <span className="gem-chips-label">{label}</span>
        {selected.map((name, i) => (
          <span key={name} className="gem-chip">
            {name}
            <button
              className="icon-btn"
              onClick={() => onChange(selected.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </span>
        ))}
        <button className="add-gem" onClick={() => setOpen((v) => !v)}>
          {t.addGemBtn}
        </button>
      </div>
      {open && (
        <GemPicker
          language={language}
          onClose={() => setOpen(false)}
          onPick={(name) => {
            if (!selected.includes(name)) onChange([...selected, name])
          }}
        />
      )}
    </>
  )
}

function EntryRow({
  gem,
  language,
  canUp,
  canDown,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onChange,
  onMove,
  onDelete
}: {
  gem: GemEntry
  language: Language
  canUp: boolean
  canDown: boolean
  pickerOpen: boolean
  onOpenPicker: () => void
  onClosePicker: () => void
  onChange: (g: GemEntry) => void
  onMove: (delta: number) => void
  onDelete: () => void
}): React.JSX.Element {
  const t = messages[language]
  const legacy = !!gem.text && (!gem.items || gem.items.length === 0)
  return (
    <div className={`entry ${gem.kind}`}>
      <div className="entry-row">
        <select
          value={gem.kind}
          onChange={(e) => onChange({ ...gem, kind: e.target.value as GemEntry['kind'] })}
        >
          <option value="gem-reward">{t.rewardOption}</option>
          <option value="gem-buy">{t.buyOption}</option>
        </select>
        {!legacy &&
          (gem.kind === 'gem-reward' ? (
            <input
              placeholder={t.questPlaceholder}
              value={gem.quest ?? ''}
              onChange={(e) => onChange({ ...gem, quest: e.target.value || undefined })}
            />
          ) : (
            <input
              placeholder={t.vendorPlaceholder}
              value={gem.vendor ?? ''}
              onChange={(e) => onChange({ ...gem, vendor: e.target.value || undefined })}
            />
          ))}
        <span className="entry-spacer" />
        <button className="icon-btn" disabled={!canUp} title={t.upTitle} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon-btn" disabled={!canDown} title={t.downTitle} onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="icon-btn" title={t.deleteEntryTitle} onClick={onDelete}>
          ✕
        </button>
      </div>
      {legacy ? (
        <textarea
          className="legacy-text"
          title={t.legacyTextTitle}
          value={gem.text}
          onChange={(e) => onChange({ ...gem, text: e.target.value })}
        />
      ) : (
        <div className="entry-gems">
          {(gem.items ?? []).map((name) => (
            <span key={name} className="gem-chip">
              {name}
              <button
                className="icon-btn"
                title={t.removeGemTitle}
                onClick={() => onChange({ ...gem, items: gem.items!.filter((n) => n !== name) })}
              >
                ✕
              </button>
            </span>
          ))}
          <button className="add-gem" onClick={pickerOpen ? onClosePicker : onOpenPicker}>
            {t.addGemBtn}
          </button>
        </div>
      )}
      {pickerOpen && !legacy && (
        <GemPicker
          language={language}
          onClose={onClosePicker}
          onPick={(name) => {
            if (!(gem.items ?? []).includes(name)) {
              onChange({ ...gem, items: [...(gem.items ?? []), name] })
            }
          }}
        />
      )}
    </div>
  )
}
