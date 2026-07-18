import { useMemo, useState } from 'react'
import type { Language } from '../../../shared/i18n'
import { messages } from '../../../shared/i18n'
import { ATTR_COLORS, GEM_LIST } from '../gemAttrs'

/** Поисковый список всех камней умений (данные exile-leveling). */
export function GemPicker({
  onPick,
  onClose,
  language
}: {
  onPick: (name: string) => void
  onClose: () => void
  language: Language
}): React.JSX.Element {
  const t = messages[language]
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? GEM_LIST.filter((g) => g.name.toLowerCase().includes(q)) : GEM_LIST
    return list.slice(0, 60)
  }, [query])

  return (
    <div className="gem-picker">
      <div className="gem-picker-head">
        <input
          autoFocus
          placeholder={t.searchGemPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filtered.length > 0) onPick(filtered[0].name)
          }}
        />
        <button className="icon-btn" title={t.closeTitle} onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="gem-picker-list">
        {filtered.map((g) => (
          <button key={g.name} className="gem-picker-row" onClick={() => onPick(g.name)}>
            <span className="gem-dot" style={{ background: ATTR_COLORS[g.attr] ?? '#c8c8c8' }} />
            <span className="gem-picker-name">{g.name}</span>
            {g.support && <span className="gem-badge">{t.supportBadge}</span>}
            <span className="gem-picker-level">{t.levelAbbrev(g.level)}</span>
          </button>
        ))}
        {filtered.length === 0 && <div className="gem-picker-empty">{t.nothingFound}</div>}
      </div>
    </div>
  )
}
