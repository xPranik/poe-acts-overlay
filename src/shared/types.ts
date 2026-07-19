import type { Language } from './i18n'

export type StepKind = 'normal' | 'gem-buy' | 'gem-reward'

/** Классы персонажей PoE — фильтруют доступность квестовых наград. */
export type CharClass =
  | 'Marauder'
  | 'Witch'
  | 'Scion'
  | 'Ranger'
  | 'Duelist'
  | 'Shadow'
  | 'Templar'

export const CHAR_CLASSES: CharClass[] = [
  'Marauder',
  'Witch',
  'Scion',
  'Ranger',
  'Duelist',
  'Shadow',
  'Templar'
]

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
/** Зона внутри пресета: имя + акт (акт различает повторные города — Lioneye's Watch в 1 и 6). */
export interface PresetZone {
  name: string
  act: number
  steps: GuideStep[]
}

/**
 * Скомпилированная «порция» камней: становится видимой, когда игрок дошёл до
 * зоны-триггера квеста (см. quest-rewards.json), и сменяется следующей порцией.
 */
export interface GemPortion {
  /** id квеста-триггера (a1q5, ...) из quest-rewards.json */
  quest: string
  /** имя квеста — заголовок порции в оверлее */
  questName: string
  /** зона-триггер: дойдя до неё, игрок открывает эту порцию */
  zone: string
  act: number
  steps: GuideStep[]
}

export interface GemPreset {
  /** stable id = preset file name without extension */
  id: string
  /** display name from [preset].name, falls back to id */
  name: string
  /** класс персонажа; фильтрует квестовые награды в редакторе */
  class?: CharClass
  /** зоны с камнями; ищутся по (акт, имя) с фолбэком на имя */
  zones: PresetZone[]
  /** прогрессивные порции: показывается последняя, чей триггер уже достигнут */
  portions: GemPortion[]
}

/**
 * Запись камня в исходном TOML пресета: либо готовый text (легаси/ручные файлы),
 * либо структурные поля, из которых текст синтезируется при загрузке.
 */
export interface GemEntry {
  kind: 'gem-buy' | 'gem-reward'
  /** готовый текст с маркапом — используется как есть, если задан */
  text?: string
  /** квест-источник награды (kind = gem-reward) */
  quest?: string
  /** продавец (kind = gem-buy) */
  vendor?: string
  /** имена камней */
  items?: string[]
}

/**
 * Порция в исходном TOML ([[portion]]): квест-триггер + что забрать наградой
 * и что докупить у торговца после него. Тексты и зона синтезируются из
 * quest-rewards.json при загрузке.
 */
export interface PresetPortion {
  /** id квеста из quest-rewards.json (a1q5, ...) */
  quest: string
  /** забрать наградой за квест */
  take: string[]
  /** купить у торговца после квеста */
  buy: string[]
}

/** Пресет в исходном (редактируемом) виде — то, что лежит в gems/<id>.toml. */
export interface PresetSource {
  id: string
  name: string
  class?: CharClass
  zones: Array<{ name: string; act: number; gems: GemEntry[] }>
  portions: PresetPortion[]
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

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; url: string }
  | { kind: 'error'; message: string }

/** Один сплит: акт `act` завершён на отметке `cumulativeMs` от старта забега. */
export interface ActSplit {
  act: number
  cumulativeMs: number
}

/** Один сплит зоны-чекпоинта акта 1 (режим таймера "1 акт"). */
export interface ZoneSplit {
  zone: string
  cumulativeMs: number
}

/** Сохранённый забег со сплитами по актам. */
export interface Run {
  id: string
  profile: string
  startedAt: number
  finishedAt: number | null
  splits: ActSplit[]
  /** сплиты по зонам-чекпоинтам акта 1; заполняется только когда targetActs === 1 */
  zoneSplits?: ZoneSplit[]
  totalMs: number | null
  completed: boolean
  /** дистанция забега в актах (1/3/5/10); отсутствие в старых записях трактуется как 10 */
  targetActs: number
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

/**
 * Состояние таймера в main. Renderer тикает локально из `runningSince`/`accumulatedMs`
 * (те же часы машины), IPC шлёт только дискретные события.
 * elapsed = accumulatedMs + (runningSince ? Date.now() - runningSince : 0)
 */
export interface TimerState {
  status: TimerStatus
  /** замороженный elapsed (мс), накопленный до текущего resume */
  accumulatedMs: number
  /** epoch мс последнего resume; null в паузе/idle/finished */
  runningSince: number | null
  /** акт, который сейчас идёт */
  currentAct: number
  /** сплиты текущего забега */
  splits: ActSplit[]
  /** сплиты по зонам-чекпоинтам акта 1 текущего забега (только режим targetActs === 1) */
  zoneSplits: ZoneSplit[]
  /** тоггл панели таймера */
  visible: boolean
  /** сплиты Personal Best забега (для Δ), null если истории нет */
  pb: ActSplit[] | null
  /** сплиты по зонам-чекпоинтам PB-забега (targetActs === 1), null если истории нет */
  zonePb: ZoneSplit[] | null
  /** акт → лучший сегмент (мс) по всем забегам, null если истории нет */
  bestSegments: Record<number, number> | null
  /** зона-чекпоинт → лучший сегмент (мс) по всем 1-актовым забегам, null если истории нет */
  bestZoneSegments: Record<string, number> | null
  /** целевая дистанция забега в актах (1/3/5/10) */
  targetActs: number
}

/** Позиция панели таймера относительно основной панели оверлея. */
export type TimerPosition = 'top' | 'bottom' | 'left' | 'right'

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
  /** показывать ли блок маршрута (заметки + шаги акта); false = только камни */
  routeVisible: boolean
  /** уровень персонажа из Client.txt (последний "... is now level N"), null = неизвестен */
  charLevel: number | null
  /** уровень монстров текущей зоны (из лога или данных exile-leveling), null = неизвестен/город */
  areaLevel: number | null
  /** есть ли в текущей зоне испытание Лабиринта (по (act, name), см. trial-zones.ts) */
  hasTrial: boolean
  logStatus: LogStatus
  /** checked step keys */
  progress: Record<string, boolean>
  /** форвард-онли: акт → максимальный currentZoneIndex, реально достигнутый в этом акте
      (обновляется только из log-driven onZoneEntered, не из ручной навигации) */
  reachedZoneIndex: Record<number, number>
  /** состояние speedrun-таймера по актам */
  timer: TimerState
  /** позиция панели таймера относительно основной панели */
  timerPosition: TimerPosition
  /** язык интерфейса */
  language: Language
  /** результат последней проверки обновлений на GitHub Releases */
  updateStatus: UpdateStatus
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
