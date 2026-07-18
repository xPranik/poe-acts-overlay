import trialZones from './data/trial-zones.json'

export interface TrialZone {
  name: string
  act: number
}

const set = new Set((trialZones as TrialZone[]).map((z) => `${z.act}|${z.name}`))

/** Есть ли в этой зоне (акт, имя) испытание Лабиринта. */
export function hasTrial(name: string, act: number): boolean {
  return set.has(`${act}|${name}`)
}
