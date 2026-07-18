import { useEffect, useState } from 'react'
import type { AppState, GemEntry, PresetSource } from '../../../shared/types'
import actTowns from '../data/act-towns.json'
import { GemPicker } from './GemPicker'
import { RunsHistory } from './RunsHistory'
import './settings.css'

const ID_RE = /^[\w-]+$/

// города актов — единственные зоны, где покупают/забирают камни (по одному на акт 1-10)
const TOWNS = actTowns as Array<{ name: string; act: number }>

/** Окно настроек: редактор пресетов камней (gems/<id>.toml). */
export function SettingsApp(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
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

  if (!state) return <div className="settings-root">Загрузка...</div>

  const presets = state.guide.presets

  async function select(id: string): Promise<void> {
    if (dirty && !confirm('Несохранённые изменения будут потеряны. Продолжить?')) return
    const src = await window.api.getPresetSource(id)
    setSelectedId(id)
    setSource(src ?? { id, name: id, zones: [] })
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
      setMessage('Id пресета: только латиница/цифры/дефис/подчёркивание, без пробелов')
      return
    }
    if (presets.some((p) => p.id === id)) {
      setMessage(`Пресет "${id}" уже существует`)
      return
    }
    const res = await window.api.savePreset({ id, name: id, zones: [] })
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
    const res = await window.api.savePreset({ ...source, id, name: `${source.name} (копия)` })
    if (!res.ok) {
      setMessage(res.error)
      return
    }
    await select(id)
  }

  async function remove(id: string): Promise<void> {
    if (!confirm(`Удалить пресет "${id}"? Файл gems/${id}.toml будет стёрт.`)) return
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
      <aside className="preset-list">
        <div className="pane-title">Пресеты</div>
        {presets.map((p) => (
          <div
            key={p.id}
            className={`preset-item ${p.id === selectedId ? 'selected' : ''}`}
            onClick={() => select(p.id)}
          >
            <span className="preset-item-name">{p.name}</span>
            <button
              className="icon-btn"
              title="Удалить пресет"
              onClick={(e) => {
                e.stopPropagation()
                remove(p.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {presets.length === 0 && <div className="hint">Пресетов пока нет</div>}
        <div className="new-preset">
          <input
            placeholder="id нового пресета"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createPreset()}
          />
          <button onClick={createPreset}>+ создать</button>
        </div>
      </aside>

      <main className="editor">
        {state.guide.errors.length > 0 && (
          <div className="banner error">
            {state.guide.errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}
        {message && <div className="banner error">⚠ {message}</div>}

        {!source ? (
          <div className="hint big">Выбери пресет слева или создай новый</div>
        ) : (
          <>
            <div className="editor-head">
              <input
                className="preset-name"
                value={source.name}
                title="Название пресета"
                onChange={(e) => update((d) => (d.name = e.target.value))}
              />
              <span className="preset-id">gems/{source.id}.toml</span>
              <button onClick={duplicate}>Дублировать</button>
              <button className="primary" disabled={!dirty} onClick={save}>
                {dirty ? 'Сохранить' : 'Сохранено'}
              </button>
            </div>

            {source.zones.map((zone, zi) => (
              <section key={`${zone.act}|${zone.name}`} className="zone-block">
                <div className="zone-block-head">
                  <span className="zone-block-name">
                    {zone.name}
                    <span className="zone-block-act">Акт {zone.act}</span>
                  </span>
                  <button
                    className="icon-btn"
                    title="Убрать зону из пресета"
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
                  + запись
                </button>
              </section>
            ))}

            <div className="add-zone">
              <select
                value=""
                onChange={(e) => {
                  const idx = e.target.value
                  if (idx === '') return
                  const t = availableTowns[Number(idx)]
                  update((d) => d.zones.push({ name: t.name, act: t.act, gems: [] }))
                }}
              >
                <option value="">+ добавить зону...</option>
                {availableTowns.map((t, i) => (
                  <option key={`${t.act}|${t.name}`} value={i}>
                    {t.name} (Акт {t.act})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <RunsHistory />
      </main>
    </div>
  )
}

function EntryRow({
  gem,
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
  canUp: boolean
  canDown: boolean
  pickerOpen: boolean
  onOpenPicker: () => void
  onClosePicker: () => void
  onChange: (g: GemEntry) => void
  onMove: (delta: number) => void
  onDelete: () => void
}): React.JSX.Element {
  const legacy = !!gem.text && (!gem.items || gem.items.length === 0)
  return (
    <div className={`entry ${gem.kind}`}>
      <div className="entry-row">
        <select
          value={gem.kind}
          onChange={(e) => onChange({ ...gem, kind: e.target.value as GemEntry['kind'] })}
        >
          <option value="gem-reward">Награда</option>
          <option value="gem-buy">Покупка</option>
        </select>
        {!legacy &&
          (gem.kind === 'gem-reward' ? (
            <input
              placeholder="квест (напр. Enemy at the Gate)"
              value={gem.quest ?? ''}
              onChange={(e) => onChange({ ...gem, quest: e.target.value || undefined })}
            />
          ) : (
            <input
              placeholder="продавец (напр. Nessa)"
              value={gem.vendor ?? ''}
              onChange={(e) => onChange({ ...gem, vendor: e.target.value || undefined })}
            />
          ))}
        <span className="entry-spacer" />
        <button className="icon-btn" disabled={!canUp} title="Выше" onClick={() => onMove(-1)}>
          ↑
        </button>
        <button className="icon-btn" disabled={!canDown} title="Ниже" onClick={() => onMove(1)}>
          ↓
        </button>
        <button className="icon-btn" title="Удалить запись" onClick={onDelete}>
          ✕
        </button>
      </div>
      {legacy ? (
        <textarea
          className="legacy-text"
          title="Свободный текст записи (легаси-формат)"
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
                title="Убрать камень"
                onClick={() => onChange({ ...gem, items: gem.items!.filter((n) => n !== name) })}
              >
                ✕
              </button>
            </span>
          ))}
          <button className="add-gem" onClick={pickerOpen ? onClosePicker : onOpenPicker}>
            + камень
          </button>
        </div>
      )}
      {pickerOpen && !legacy && (
        <GemPicker
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
