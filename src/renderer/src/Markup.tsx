import { useMemo } from 'react'
import { parseMarkup, TokenType } from '../../shared/markup'
import { gemColor } from './gemAttrs'
import craftingIcon from './assets/crafting.png'
import portalIcon from './assets/portal.png'
import questIcon from './assets/quest.png'
import townIcon from './assets/town.png'
import trialIcon from './assets/trial.png'
import waypointIcon from './assets/waypoint.png'

const ICONS: Partial<Record<TokenType, string>> = {
  waypoint: waypointIcon,
  portal: portalIcon,
  quest: questIcon,
  trial: trialIcon,
  logout: townIcon,
  crafting: craftingIcon,
  lab: trialIcon
}

/** Рендерит текст гайда с цветными токенами и иконками (стиль exile-leveling). */
export function Markup({ text }: { text: string }): React.JSX.Element {
  const segments = useMemo(() => parseMarkup(text), [text])
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span
            key={i}
            className={`mk mk-${seg.type}`}
            style={seg.type === 'item' ? { color: gemColor(seg.text) } : undefined}
          >
            {ICONS[seg.type] && <img className="mk-icon" src={ICONS[seg.type]} alt="" />}
            {seg.text}
          </span>
        )
      )}
    </>
  )
}
