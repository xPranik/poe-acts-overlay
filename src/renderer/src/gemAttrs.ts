import gems from './data/gems.json'

export interface GemInfo {
  name: string
  attr: string
  level: number
  support: boolean
}

export const GEM_LIST = gems as GemInfo[]

/** Цвета атрибутов камней умений (str/dex/int/none). */
export const ATTR_COLORS: Record<string, string> = {
  str: '#e06060',
  dex: '#4ec98a',
  int: '#5aa0e8',
  none: '#c8c8c8'
}

const attrByName = new Map(GEM_LIST.map((g) => [g.name, g.attr]))

/** Возвращает цвет атрибута камня по имени, либо undefined если имя не распознано. */
export function gemColor(name: string): string | undefined {
  const attr = attrByName.get(name)
  return attr ? ATTR_COLORS[attr] : undefined
}
