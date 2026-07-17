export type StepKind = 'normal' | 'gem-buy' | 'gem-reward'

export interface GuideStep {
  text: string
  kind: StepKind
}

export interface GuideZone {
  name: string
  notes?: string
  layout?: string
  steps: GuideStep[]
}

export interface GuideAct {
  number: number
  title: string
  zones: GuideZone[]
}

/**
 * Build-specific gem plan, layered on top of the shared route by zone name.
 * Lets one route serve many builds (Witch, Ranger, ...) without duplication.
 */
export interface GemPreset {
  /** stable id = preset file name without extension */
  id: string
  /** display name from [preset].name, falls back to id */
  name: string
  /** zone name -> gem steps to show while in that zone */
  zones: Record<string, GuideStep[]>
}

export interface Guide {
  profile: string
  acts: GuideAct[]
  presets: GemPreset[]
  /** parse errors per file, shown in the overlay instead of failing silently */
  errors: string[]
}

export type LogStatus =
  | { kind: 'ok'; path: string }
  | { kind: 'missing'; message: string }

export interface AppState {
  guide: Guide
  currentAct: number
  /** zone name as last seen in the log (may be absent from the guide) */
  currentZone: string | null
  /** index of the matched zone within the current act's guide, -1 if not found */
  currentZoneIndex: number
  /** id of the active gem preset (build), or null when none is selected */
  activePreset: string | null
  interactive: boolean
  layoutVisible: boolean
  logStatus: LogStatus
  /** checked step keys */
  progress: Record<string, boolean>
}

export function stepKey(act: number, zone: string, stepText: string): string {
  return `a${act}|${zone}|${stepText}`
}

/** Gem steps are keyed per preset so different builds keep independent progress. */
export function gemStepKey(
  act: number,
  zone: string,
  presetId: string,
  stepText: string
): string {
  return `a${act}|${zone}|gem:${presetId}|${stepText}`
}
