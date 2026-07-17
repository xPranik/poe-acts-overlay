import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import type { GemEntry, PresetSource } from '../shared/types'
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

export function parseGemEntry(raw: unknown, where: string, index: number): GemEntry {
  const g = raw as Record<string, unknown>
  const kind = asString(g.kind) ?? 'gem-buy'
  if (!GEM_KINDS.includes(kind as GemEntry['kind'])) {
    throw new Error(`${where}, камень #${index + 1}: неизвестный kind "${kind}"`)
  }
  const text = asString(g.text)
  const items = Array.isArray(g.items)
    ? g.items.filter((it): it is string => typeof it === 'string' && it.trim() !== '')
    : undefined
  if (!text && (!items || items.length === 0)) {
    throw new Error(`${where}, камень #${index + 1}: нужен text или непустой items`)
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
export function gemEntryText(entry: GemEntry): string {
  if (entry.text) return entry.text
  const items = (entry.items ?? []).map((n) => `{item|${n}}`).join(', ')
  if (entry.kind === 'gem-reward') {
    return entry.quest ? `Награда {quest|${entry.quest}}: ${items}` : `Награда: ${items}`
  }
  return entry.vendor ? `Купить ${entry.vendor}: ${items}` : `Купить: ${items}`
}

const ID_RE = /^[\w-]+$/
 
function presetPath(guidesRoot: string, profile: string, id: string): string {
  if (!ID_RE.test(id)) throw new Error(`Недопустимый id пресета: "${id}"`)
  return path.join(guidesRoot, profile, 'gems', `${id}.toml`)
}

export function readPresetSource(
  guidesRoot: string,
  profile: string,
  id: string
): PresetSource | null {
  let raw: string
  try {
    raw = fs.readFileSync(presetPath(guidesRoot, profile, id), 'utf-8')
  } catch {
    return null
  }
  const doc = parseToml(raw) as Record<string, unknown>
  const meta = (doc.preset ?? {}) as Record<string, unknown>
  const zonesRaw = Array.isArray(doc.zone) ? doc.zone : []
  const zones: PresetSource['zones'] = []
  zonesRaw.forEach((z, i) => {
    const zone = z as Record<string, unknown>
    const name = asString(zone.name)
    if (!name) throw new Error(`gems/${id}.toml: [[zone]] #${i + 1} без name`)
    // акт указан явно или выводится по имени (легаси-файлы без act)
    const act = typeof zone.act === 'number' ? zone.act : getZoneActEarliest(name)
    const gemsRaw = Array.isArray(zone.gems) ? zone.gems : Array.isArray(zone.steps) ? zone.steps : []
    const gems = gemsRaw.map((g, j) => parseGemEntry(g, `gems/${id}.toml: зона "${name}"`, j))
    // сливаем блоки с одинаковыми (акт, имя)
    const existing = zones.find((s) => s.name === name && s.act === act)
    if (existing) existing.gems.push(...gems)
    else zones.push({ name, act, gems })
  })
  return { id, name: asString(meta.name) ?? id, zones }
}

export function writePreset(guidesRoot: string, profile: string, src: PresetSource): void {
  const file = presetPath(guidesRoot, profile, src.id)
  const doc = {
    preset: { name: src.name },
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
  const header =
    '# Файл сгенерирован окном настроек камней — ручные комментарии при сохранении теряются.\n'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, header + stringifyToml(doc) + '\n')
}

export function deletePreset(guidesRoot: string, profile: string, id: string): void {
  fs.rmSync(presetPath(guidesRoot, profile, id), { force: true })
}
