import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import type { Language } from '../shared/i18n'
import { messages } from '../shared/i18n'
import type { CharClass, GemEntry, GuideStep, PresetPortion, PresetSource } from '../shared/types'
import { CHAR_CLASSES } from '../shared/types'
import { questRewardById } from '../shared/quest-rewards'
import { getZoneActEarliest } from './area-levels'

/**
 * Чтение/запись пресетов камней (gems/<id>.toml) в исходном структурном виде.
 * Единственный источник истины по схеме записи камня — parseGemEntry/gemEntryText;
 * guide-loader использует их же при загрузке гайда.
 */

const GEM_KINDS = ['gem-buy', 'gem-reward'] as const

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

export function parseGemEntry(
  raw: unknown,
  where: string,
  index: number,
  lang: Language
): GemEntry {
  const g = raw as Record<string, unknown>
  const kind = asString(g.kind) ?? 'gem-buy'
  if (!GEM_KINDS.includes(kind as GemEntry['kind'])) {
    throw new Error(messages[lang].gemUnknownKindError(where, index, kind))
  }
  const text = asString(g.text)
  const items = Array.isArray(g.items)
    ? g.items.filter((it): it is string => typeof it === 'string' && it.trim() !== '')
    : undefined
  if (!text && (!items || items.length === 0)) {
    throw new Error(messages[lang].gemNeedsTextOrItemsError(where, index))
  }
  return {
    kind: kind as GemEntry['kind'],
    text,
    quest: asString(g.quest),
    vendor: asString(g.vendor),
    items: items && items.length > 0 ? items : undefined
  }
}

/** Отображаемый текст записи: готовый text или синтез из структурных полей. */
export function gemEntryText(entry: GemEntry, lang: Language): string {
  if (entry.text) return entry.text
  const t = messages[lang]
  const items = (entry.items ?? []).map((n) => `{item|${n}}`).join(', ')
  if (entry.kind === 'gem-reward') {
    return entry.quest ? `${t.rewardPrefix} {quest|${entry.quest}}: ${items}` : `${t.rewardPrefix}: ${items}`
  }
  return entry.vendor ? `${t.buyPrefix} ${entry.vendor}: ${items}` : `${t.buyPrefix}: ${items}`
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((it): it is string => typeof it === 'string' && it.trim() !== '')
    : []
}

/** Разбор [[portion]]: квест-триггер обязан существовать в quest-rewards.json. */
export function parsePortion(
  raw: unknown,
  where: string,
  index: number,
  lang: Language
): PresetPortion {
  const p = raw as Record<string, unknown>
  const quest = asString(p.quest)
  if (!quest || !questRewardById(quest)) {
    throw new Error(messages[lang].portionUnknownQuestError(where, index, quest ?? ''))
  }
  return { quest, take: asStringList(p.take), buy: asStringList(p.buy) }
}

/**
 * Синтез шагов порции: заголовки/зона берутся из quest-rewards.json,
 * тексты — через gemEntryText (единый маркап с обычными записями камней).
 */
export function portionSteps(portion: PresetPortion, lang: Language): GuideStep[] {
  const q = questRewardById(portion.quest)
  if (!q) return []
  const steps: GuideStep[] = []
  if (portion.take.length > 0) {
    steps.push({
      kind: 'gem-reward',
      text: gemEntryText({ kind: 'gem-reward', quest: q.name, items: portion.take }, lang)
    })
  }
  if (portion.buy.length > 0) {
    steps.push({
      kind: 'gem-buy',
      text: gemEntryText({ kind: 'gem-buy', vendor: q.vendorNpc, items: portion.buy }, lang)
    })
  }
  return steps
}

const ID_RE = /^[\w-]+$/

function presetPath(guidesRoot: string, profile: string, id: string, lang: Language): string {
  if (!ID_RE.test(id)) throw new Error(messages[lang].invalidPresetIdError(id))
  return path.join(guidesRoot, profile, 'gems', `${id}.toml`)
}

export function readPresetSource(
  guidesRoot: string,
  profile: string,
  id: string,
  lang: Language
): PresetSource | null {
  let raw: string
  try {
    raw = fs.readFileSync(presetPath(guidesRoot, profile, id, lang), 'utf-8')
  } catch {
    return null
  }
  const doc = parseToml(raw) as Record<string, unknown>
  const meta = (doc.preset ?? {}) as Record<string, unknown>
  const clsRaw = asString(meta.class)
  // невалидный класс не роняет пресет: гемы просто не фильтруются в редакторе
  const cls = CHAR_CLASSES.includes(clsRaw as CharClass) ? (clsRaw as CharClass) : undefined
  const zonesRaw = Array.isArray(doc.zone) ? doc.zone : []
  const zones: PresetSource['zones'] = []
  zonesRaw.forEach((z, i) => {
    const zone = z as Record<string, unknown>
    const name = asString(zone.name)
    if (!name) throw new Error(messages[lang].zoneMissingNameError(`gems/${id}.toml`, i))
    // акт указан явно или выводится по имени (легаси-файлы без act)
    const act = typeof zone.act === 'number' ? zone.act : getZoneActEarliest(name)
    const gemsRaw = Array.isArray(zone.gems) ? zone.gems : Array.isArray(zone.steps) ? zone.steps : []
    const gems = gemsRaw.map((g, j) => parseGemEntry(g, `gems/${id}.toml: зона "${name}"`, j, lang))
    // сливаем блоки с одинаковыми (акт, имя)
    const existing = zones.find((s) => s.name === name && s.act === act)
    if (existing) existing.gems.push(...gems)
    else zones.push({ name, act, gems })
  })
  const portionsRaw = Array.isArray(doc.portion) ? doc.portion : []
  const portions = portionsRaw.map((p, i) => parsePortion(p, `gems/${id}.toml`, i, lang))
  return { id, name: asString(meta.name) ?? id, class: cls, zones, portions }
}

export function writePreset(
  guidesRoot: string,
  profile: string,
  src: PresetSource,
  lang: Language
): void {
  const file = presetPath(guidesRoot, profile, src.id, lang)
  const doc = {
    preset: src.class ? { name: src.name, class: src.class } : { name: src.name },
    portion: src.portions.map((p) => {
      const out: Record<string, unknown> = { quest: p.quest }
      if (p.take.length > 0) out.take = p.take
      if (p.buy.length > 0) out.buy = p.buy
      return out
    }),
    zone: src.zones.map((z) => ({
      name: z.name,
      act: z.act,
      gems: z.gems.map((g) => {
        const out: Record<string, unknown> = { kind: g.kind }
        if (g.text) out.text = g.text
        if (g.quest) out.quest = g.quest
        if (g.vendor) out.vendor = g.vendor
        if (g.items && g.items.length > 0) out.items = g.items
        return out
      })
    }))
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, messages[lang].presetFileHeaderComment + stringifyToml(doc) + '\n')
}

export function deletePreset(guidesRoot: string, profile: string, id: string, lang: Language): void {
  fs.rmSync(presetPath(guidesRoot, profile, id, lang), { force: true })
}
