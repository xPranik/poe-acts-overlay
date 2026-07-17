import type { Guide } from '../shared/types'

export interface ZonePosition {
  act: number
  zoneIndex: number
}

/**
 * Zone names repeat between parts (The Coast exists in act 1 and act 6),
 * so a zone from the log is resolved against the guide with a forward bias:
 * stay in the current act if it has the zone, otherwise prefer the nearest
 * act ahead, and only then look backwards.
 */
export function resolveZone(guide: Guide, currentAct: number, zoneName: string): ZonePosition | null {
  const candidates: ZonePosition[] = []
  for (const act of guide.acts) {
    const idx = act.zones.findIndex((z) => z.name === zoneName)
    if (idx !== -1) candidates.push({ act: act.number, zoneIndex: idx })
  }
  if (candidates.length === 0) return null
  const inCurrent = candidates.find((c) => c.act === currentAct)
  if (inCurrent) return inCurrent
  const ahead = candidates.filter((c) => c.act > currentAct).sort((a, b) => a.act - b.act)
  if (ahead.length > 0) return ahead[0]
  const behind = candidates.sort((a, b) => b.act - a.act)
  return behind[0]
}
