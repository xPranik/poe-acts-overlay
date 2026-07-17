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

export interface Guide {
  profile: string
  acts: GuideAct[]
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
  interactive: boolean
  layoutVisible: boolean
  logStatus: LogStatus
  /** checked step keys */
  progress: Record<string, boolean>
}

export function stepKey(act: number, zone: string, stepText: string): string {
  return `a${act}|${zone}|${stepText}`
}
