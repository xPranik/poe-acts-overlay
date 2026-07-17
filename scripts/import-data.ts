/**
 * Вендоринг данных из exile-leveling (https://github.com/HeartofPhos/exile-leveling):
 *  - список камней умений  -> src/renderer/src/data/gems.json  (поисковый список в окне настроек)
 *  - уровни монстров зон   -> src/main/data/zone-levels.json   (расчёт штрафа опыта)
 *
 * Использование: npm run import-data
 * Результат коммитится в репозиторий; скрипт нужен только для обновления данных.
 */
import fs from 'node:fs'
import path from 'node:path'

const RAW_BASE =
  'https://raw.githubusercontent.com/HeartofPhos/exile-leveling/master/common/data/json'

const ROOT = path.join(__dirname, '..')

interface RawGem {
  id: string
  name: string
  primary_attribute: string
  required_level: number
  is_support: boolean
}

interface RawArea {
  id: string
  name: string
  act: number
  level: number
  is_town_area: boolean
}

async function fetchJson<T>(file: string): Promise<T> {
  const url = `${RAW_BASE}/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const ATTRS: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  intelligence: 'int'
}

// исключаем девелоперские заглушки — их нет в реальной игре
const SKIP_GEM_RE = /playtest|\[unused\]/i

async function importGems(): Promise<void> {
  const raw = await fetchJson<Record<string, RawGem>>('gems.json')
  const byName = new Map<string, { name: string; attr: string; level: number; support: boolean }>()
  for (const gem of Object.values(raw)) {
    if (!gem.name || byName.has(gem.name) || SKIP_GEM_RE.test(gem.name)) continue
    byName.set(gem.name, {
      name: gem.name,
      attr: ATTRS[gem.primary_attribute] ?? 'none',
      level: gem.required_level ?? 1,
      support: !!gem.is_support
    })
  }
  const gems = [...byName.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  const out = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'gems.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(gems, null, 1))
  console.log(`gems: ${gems.length} -> ${path.relative(ROOT, out)}`)
}

async function importZoneLevels(): Promise<void> {
  const raw = await fetchJson<Record<string, RawArea>>('areas.json')
  const seen = new Set<string>()
  const zones: Array<{ name: string; act: number; level: number; town?: boolean }> = []
  for (const area of Object.values(raw)) {
    if (!area.name || !Number.isInteger(area.act) || area.act < 1 || area.act > 10) continue
    if (!Number.isInteger(area.level) || area.level < 1) continue
    const key = `${area.act}|${area.name}`
    if (seen.has(key)) continue
    seen.add(key)
    zones.push({
      name: area.name,
      act: area.act,
      level: area.level,
      ...(area.is_town_area ? { town: true } : {})
    })
  }
  zones.sort((a, b) => a.act - b.act || a.level - b.level || a.name.localeCompare(b.name))
  const out = path.join(ROOT, 'src', 'main', 'data', 'zone-levels.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(zones, null, 1))
  console.log(`zones: ${zones.length} -> ${path.relative(ROOT, out)}`)

  // города актов — единственные зоны, где покупают/забирают камни (для окна настроек).
  // По одному на акт (10). Имена повторяются (Lioneye's Watch в актах 1 и 6) — различаем по акту.
  const townByAct = new Map<number, { name: string; act: number }>()
  for (const z of zones) {
    if (z.town && !townByAct.has(z.act)) townByAct.set(z.act, { name: z.name, act: z.act })
  }
  const towns = [...townByAct.values()].sort((a, b) => a.act - b.act)
  const townsOut = path.join(ROOT, 'src', 'renderer', 'src', 'data', 'act-towns.json')
  fs.mkdirSync(path.dirname(townsOut), { recursive: true })
  fs.writeFileSync(townsOut, JSON.stringify(towns, null, 1))
  console.log(`towns: ${towns.length} -> ${path.relative(ROOT, townsOut)}`)
}

async function main(): Promise<void> {
  await importGems()
  await importZoneLevels()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
