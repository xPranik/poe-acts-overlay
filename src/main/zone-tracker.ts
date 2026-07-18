import type { Guide } from '../shared/types'
import { getAreaLevelForAct } from './area-levels'

export interface ZonePosition {
  act: number
  zoneIndex: number
}

/**
 * Zone names repeat between parts (The Coast exists in act 1 and act 6),
 * so a zone from the log is resolved against the guide: stay in the current
 * act if it has the zone; otherwise, if charLevel is known, pick whichever
 * act's occurrence has the closest static area level (e.g. Lioneye's Watch
 * is level 13 in act 1 vs level 50 in act 6 — a level 20 character is
 * clearly still in act 1, not act 6). Without a charLevel, fall back to
 * preferring the nearest act ahead, and only then look backwards.
 */
export function resolveZone(
  guide: Guide,
  currentAct: number,
  zoneName: string,
  charLevel: number | null = null
): ZonePosition | null {
  const candidates: ZonePosition[] = []
  for (const act of guide.acts) {
    const idx = act.zones.findIndex((z) => z.name === zoneName)
    if (idx !== -1) candidates.push({ act: act.number, zoneIndex: idx })
  }
  if (candidates.length === 0) return null
  const inCurrent = candidates.find((c) => c.act === currentAct)
  if (inCurrent) return inCurrent
  if (candidates.length > 1 && charLevel !== null) {
    const withLevel = candidates
      .map((c) => ({ c, level: getAreaLevelForAct(zoneName, c.act) }))
      .filter((x): x is { c: ZonePosition; level: number } => x.level !== null)
    if (withLevel.length > 0) {
      withLevel.sort((a, b) => Math.abs(a.level - charLevel) - Math.abs(b.level - charLevel))
      return withLevel[0].c
    }
  }
  const ahead = candidates.filter((c) => c.act > currentAct).sort((a, b) => a.act - b.act)
  if (ahead.length > 0) return ahead[0]
  const behind = candidates.sort((a, b) => b.act - a.act)
  return behind[0]
}
