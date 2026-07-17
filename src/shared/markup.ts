/**
 * Лёгкая inline-разметка в текстах гайдов: {тип|аргумент} или {тип}.
 * Пример: "Убить {kill|Hillock}, взять {waypoint} и идти в {zone|The Coast}".
 * Неизвестные конструкции остаются обычным текстом.
 */

export type TokenType =
  | 'zone'
  | 'kill'
  | 'quest'
  | 'item'
  | 'waypoint'
  | 'portal'
  | 'trial'
  | 'logout'
  | 'crafting'
  | 'lab'

export interface MarkupSegment {
  type: TokenType | 'text'
  text: string
}

const TOKEN_RE = /\{(zone|kill|quest|item|waypoint|portal|trial|logout|crafting|lab)(?:\|([^}]*))?\}/g

const DEFAULT_TEXT: Record<TokenType, string> = {
  zone: '',
  kill: '',
  quest: '',
  item: '',
  waypoint: 'Waypoint',
  portal: 'Portal',
  trial: 'Trial of Ascendancy',
  logout: 'Logout',
  crafting: 'crafting recipe',
  lab: 'Labyrinth'
}

export function parseMarkup(text: string): MarkupSegment[] {
  const segments: MarkupSegment[] = []
  let last = 0
  TOKEN_RE.lastIndex = 0
  for (let m = TOKEN_RE.exec(text); m !== null; m = TOKEN_RE.exec(text)) {
    if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) })
    const type = m[1] as TokenType
    const arg = m[2]
    let display = arg && arg.trim() !== '' ? arg : DEFAULT_TEXT[type]
    if (type === 'waypoint' && arg) display = `Waypoint → ${arg}`
    segments.push({ type, text: display })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) })
  return segments
}
