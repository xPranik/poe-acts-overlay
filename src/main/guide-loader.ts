import fs from 'node:fs'
import path from 'node:path'
import chokidar, { FSWatcher } from 'chokidar'
import { parse as parseToml } from 'smol-toml'
import type { Language } from '../shared/i18n'
import { messages } from '../shared/i18n'
import type {
  CharClass,
  GemPortion,
  GemPreset,
  Guide,
  GuideAct,
  GuideStep,
  GuideZone,
  PresetZone,
  StepKind
} from '../shared/types'
import { CHAR_CLASSES } from '../shared/types'
import { questRewardById } from '../shared/quest-rewards'
import { getZoneActEarliest } from './area-levels'
import { gemEntryText, parseGemEntry, parsePortion, portionSteps } from './preset-store'

const KINDS: StepKind[] = ['normal', 'gem-buy', 'gem-reward']

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function parseStep(
  raw: unknown,
  where: string,
  index: number,
  defaultKind: StepKind,
  lang: Language
): GuideStep {
  const step = raw as Record<string, unknown>
  const text = asString(step.text)
  if (!text) throw new Error(messages[lang].stepMissingTextError(where, index))
  const kind = asString(step.kind) ?? defaultKind
  if (!KINDS.includes(kind as StepKind)) {
    throw new Error(messages[lang].stepUnknownKindError(where, text, kind))
  }
  return { text, kind: kind as StepKind }
}

function parseAct(fileName: string, raw: string, lang: Language): GuideAct {
  const doc = parseToml(raw) as Record<string, unknown>
  const actMeta = (doc.act ?? {}) as Record<string, unknown>
  const number = typeof actMeta.number === 'number' ? actMeta.number : NaN
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(messages[lang].actNumberInvalidError(fileName))
  }
  const zonesRaw = Array.isArray(doc.zone) ? doc.zone : []
  const zones: GuideZone[] = zonesRaw.map((z, i) => {
    const zone = z as Record<string, unknown>
    const name = asString(zone.name)
    if (!name) throw new Error(messages[lang].zoneMissingNameError(fileName, i))
    const stepsRaw = Array.isArray(zone.steps) ? zone.steps : []
    const steps = stepsRaw.map((s, j) =>
      parseStep(s, `${fileName}: зона "${name}"`, j, 'normal', lang)
    )
    return { name, notes: asString(zone.notes), layout: asString(zone.layout), steps }
  })
  return {
    number,
    title: asString(actMeta.title) ?? `Act ${number}`,
    zones
  }
}

/** A gem preset (build): [preset].name + [[zone]] blocks whose gems default to gem-buy. */
function parsePreset(fileName: string, id: string, raw: string, lang: Language): GemPreset {
  const doc = parseToml(raw) as Record<string, unknown>
  const meta = (doc.preset ?? {}) as Record<string, unknown>
  const zonesRaw = Array.isArray(doc.zone) ? doc.zone : []
  const zones: PresetZone[] = []
  zonesRaw.forEach((z, i) => {
    const zone = z as Record<string, unknown>
    const name = asString(zone.name)
    if (!name) throw new Error(messages[lang].zoneMissingNameError(fileName, i))
    // акт указан явно или выводится по имени (различает повторные города 6/8/9)
    const act = typeof zone.act === 'number' ? zone.act : getZoneActEarliest(name)
    // accept `gems` (natural) or `steps` (same shape); gems default to gem-buy
    const gemsRaw = Array.isArray(zone.gems)
      ? zone.gems
      : Array.isArray(zone.steps)
        ? zone.steps
        : []
    // запись камня: либо готовый text, либо структурные поля (quest/vendor/items),
    // из которых текст синтезируется — схема описана в preset-store
    const gems = gemsRaw.map((s, j): GuideStep => {
      const entry = parseGemEntry(s, `${fileName}: зона "${name}"`, j, lang)
      return { text: gemEntryText(entry, lang), kind: entry.kind }
    })
    // сливаем блоки с одинаковыми (акт, имя)
    const existing = zones.find((zn) => zn.name === name && zn.act === act)
    if (existing) existing.steps.push(...gems)
    else zones.push({ name, act, steps: gems })
  })
  const clsRaw = asString(meta.class)
  // невалидный класс не роняет пресет: фильтрация гемов просто отключается
  const cls = CHAR_CLASSES.includes(clsRaw as CharClass) ? (clsRaw as CharClass) : undefined
  // [[portion]] → GemPortion: триггер и заголовки берём из quest-rewards.json
  const portionsRaw = Array.isArray(doc.portion) ? doc.portion : []
  const portions: GemPortion[] = []
  portionsRaw.forEach((p, i) => {
    const src = parsePortion(p, fileName, i, lang)
    const q = questRewardById(src.quest)
    if (!q) return
    const steps = portionSteps(src, lang)
    if (steps.length === 0 && !src.notes) return // пустая порция без заметки ничего не показывает
    portions.push({ quest: q.id, questName: q.name, zone: q.zone, act: q.act, steps, notes: src.notes })
  })
  return { id, name: asString(meta.name) ?? id, class: cls, zones, portions }
}

export function loadGuide(guidesRoot: string, profile: string, lang: Language): Guide {
  const dir = path.join(guidesRoot, profile)
  const guide: Guide = { profile, acts: [], presets: [], errors: [] }
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.toml'))
  } catch {
    guide.errors.push(messages[lang].guideDirNotFoundError(dir))
    return guide
  }
  for (const file of files.sort()) {
    try {
      guide.acts.push(parseAct(file, fs.readFileSync(path.join(dir, file), 'utf-8'), lang))
    } catch (e) {
      guide.errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  guide.acts.sort((a, b) => a.number - b.number)

  // gem presets (builds) live in <profile>/gems/*.toml
  const gemsDir = path.join(dir, 'gems')
  let presetFiles: string[] = []
  try {
    presetFiles = fs.readdirSync(gemsDir).filter((f) => f.toLowerCase().endsWith('.toml'))
  } catch {
    /* no gems dir yet — feature simply inactive */
  }
  for (const file of presetFiles.sort()) {
    const id = file.replace(/\.toml$/i, '')
    try {
      guide.presets.push(
        parsePreset(`gems/${file}`, id, fs.readFileSync(path.join(gemsDir, file), 'utf-8'), lang)
      )
    } catch (e) {
      guide.errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return guide
}

/** Watches the profile directory and reloads on any .toml change (hot-reload). */
export function watchGuide(
  guidesRoot: string,
  profile: string,
  getLang: () => Language,
  onReload: (guide: Guide) => void
): FSWatcher {
  const dir = path.join(guidesRoot, profile)
  let debounce: NodeJS.Timeout | null = null
  const watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 2 })
  watcher.on('all', (_event, changedPath) => {
    if (!changedPath.toLowerCase().endsWith('.toml')) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => onReload(loadGuide(guidesRoot, profile, getLang())), 150)
  })
  return watcher
}
