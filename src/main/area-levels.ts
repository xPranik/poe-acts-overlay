import zoneLevels from './data/zone-levels.json'

export interface ZoneLevel {
  name: string
  act: number
  level: number
  town?: boolean
}

// имя зоны -> все её вхождения по актам (The Coast есть в акте 1 и 6)
const byName = new Map<string, ZoneLevel[]>()
for (const z of zoneLevels as ZoneLevel[]) {
  const list = byName.get(z.name)
  if (list) list.push(z)
  else byName.set(z.name, [z])
}

/** Статический уровень зоны из данных exile-leveling; при дубле имени — ближайший акт. */
export function getStaticArea(name: string, act: number): ZoneLevel | null {
  const list = byName.get(name)
  if (!list) return null
  let best = list[0]
  for (const z of list) {
    if (Math.abs(z.act - act) < Math.abs(best.act - act)) best = z
  }
  return best
}

/** Ранний акт, в котором встречается зона (для легаси-пресетов без явного act). */
export function getZoneActEarliest(name: string): number {
  const list = byName.get(name)
  if (!list) return 1
  return list.reduce((min, z) => Math.min(min, z.act), Infinity)
}
