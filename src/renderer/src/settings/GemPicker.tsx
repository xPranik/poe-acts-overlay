import { useMemo, useState } from 'react'
import gems from '../data/gems.json'

interface GemInfo {
  name: string
  attr: string
  level: number
  support: boolean
}

const GEM_LIST = gems as GemInfo[]

const ATTR_COLORS: Record<string, string> = {
  str: '#e06060',
  dex: '#4ec98a',
  int: '#5aa0e8',
  none: '#c8c8c8'
}

/** Поисковый список всех камней умений (данные exile-leveling). */
export function GemPicker({
  onPick,
  onClose
}: {
  onPick: (name: string) => void
  onClose: () => void
}): React.JSX.Element {
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
          placeholder="Поиск камня..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && filtered.length > 0) onPick(filtered[0].name)
          }}
        />
        <button className="icon-btn" title="Закрыть" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="gem-picker-list">
        {filtered.map((g) => (
          <button key={g.name} className="gem-picker-row" onClick={() => onPick(g.name)}>
            <span className="gem-dot" style={{ background: ATTR_COLORS[g.attr] ?? '#c8c8c8' }} />
            <span className="gem-picker-name">{g.name}</span>
            {g.support && <span className="gem-badge">саппорт</span>}
            <span className="gem-picker-level">ур. {g.level}</span>
          </button>
        ))}
        {filtered.length === 0 && <div className="gem-picker-empty">Ничего не найдено</div>}
      </div>
    </div>
  )
}
