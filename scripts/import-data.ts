/**
 * Вендоринг данных из exile-leveling (https://github.com/HeartofPhos/exile-leveling):
 *  - список камней умений  -> src/renderer/src/data/gems.json      (поисковый список в окне настроек)
 *  - уровни монстров зон   -> src/main/data/zone-levels.json       (расчёт штрафа опыта)
 *  - награды квестов       -> src/shared/data/quest-rewards.json   (гемы за квест/у торговца, по классам)
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

async function importGems(raw: Record<string, RawGem>): Promise<void> {
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

async function importZoneLevels(raw: Record<string, RawArea>): Promise<void> {
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

// ---------------------------------------------------------------------------
// Награды квестов (quests.json): какой квест даёт какие гемы какому классу.
// ---------------------------------------------------------------------------

interface RawRewardItem {
  classes: string[]
  npc?: string
}

interface RawOffer {
  quest_npc: string
  quest: Record<string, RawRewardItem>
  vendor: Record<string, RawRewardItem>
}

interface RawQuest {
  id: string
  name: string
  act: string
  reward_offers: Record<string, RawOffer>
}

const GEM_PATH_RE = /^Metadata\/Items\/Gems\//

/**
 * Зона-триггер квеста: войдя в неё, игрок приступает к заданию — с этого
 * момента оверлей показывает, что забрать/купить после выполнения.
 * Рукописная карта: в quests.json привязки квест→зона нет.
 * Проверяется на импорте по areas.json (имя зоны + акт).
 */
const QUEST_ZONES: Record<string, string> = {
  a1q1: 'The Twilight Strand', // Enemy at the Gate
  a1q2: 'The Lower Prison', // The Caged Brute
  a1q3: 'The Cavern of Wrath', // The Siren's Cadence
  a1q4: 'The Mud Flats', // Breaking Some Eggs
  a1q5: 'The Tidal Island', // Mercy Mission
  a2q4: "The Weaver's Chambers", // Sharp and Cruel
  a2q6: 'The Chamber of Sins Level 1', // Intruders in Black
  a3q1: 'The Crematorium', // Lost in Love
  a3q8: 'The Ebony Barracks', // Sever the Right Hand
  a3q12: 'The Library', // A Fixture of Fate
  a4q1: 'The Harvest', // The Eternal Nightmare
  a4q2: 'The Dried Lake', // Breaking the Seal
  a6q4: 'The Twilight Strand' // Fallen from Grace
}

// офферы китайского (Tencent) клиента — в международной версии их нет
const SKIP_OFFER_RE = /_tencent$/i

interface QuestGem {
  name: string
  /** классы, которым доступен гем; пустой массив = всем */
  classes: string[]
}

async function importQuestRewards(
  rawGems: Record<string, RawGem>,
  rawAreas: Record<string, RawArea>
): Promise<void> {
  const raw = await fetchJson<Record<string, RawQuest>>('quests.json')

  const gemName = (metaPath: string): string | null => {
    const gem = rawGems[metaPath]
    if (!gem?.name || SKIP_GEM_RE.test(gem.name)) return null
    return gem.name
  }
  const gemLevel = (name: string): number =>
    Object.values(rawGems).find((g) => g.name === name)?.required_level ?? 1

  // объединяем повторные попадания гема из разных офферов (a1q5 + a1q5b):
  // пустой список классов означает «всем», он поглощает любые ограничения
  const mergeGem = (into: Map<string, QuestGem>, name: string, item: RawRewardItem): void => {
    const prev = into.get(name)
    if (!prev) {
      into.set(name, { name, classes: [...item.classes] })
      return
    }
    if (prev.classes.length === 0 || item.classes.length === 0) prev.classes = []
    else prev.classes = [...new Set([...prev.classes, ...item.classes])]
  }

  const quests: Array<{
    id: string
    name: string
    act: number
    zone: string
    npc: string
    vendorNpc: string
    rewards: QuestGem[]
    vendor: QuestGem[]
  }> = []

  for (const quest of Object.values(raw)) {
    const rewards = new Map<string, QuestGem>()
    const vendor = new Map<string, QuestGem>()
    let npc = ''
    let vendorNpc = ''
    for (const [offerId, offer] of Object.entries(quest.reward_offers ?? {})) {
      if (SKIP_OFFER_RE.test(offerId)) continue
      npc ||= offer.quest_npc
      for (const [metaPath, item] of Object.entries(offer.quest ?? {})) {
        if (!GEM_PATH_RE.test(metaPath)) continue
        const name = gemName(metaPath)
        if (name) mergeGem(rewards, name, item)
      }
      for (const [metaPath, item] of Object.entries(offer.vendor ?? {})) {
        if (!GEM_PATH_RE.test(metaPath)) continue
        const name = gemName(metaPath)
        if (!name) continue
        mergeGem(vendor, name, item)
        vendorNpc ||= item.npc ?? ''
      }
    }
    if (rewards.size === 0 && vendor.size === 0) continue

    const act = Number(quest.act)
    const zone = QUEST_ZONES[quest.id]
    if (!zone) {
      throw new Error(`quest-rewards: нет зоны-триггера для ${quest.id} "${quest.name}" (акт ${act}) — дополни QUEST_ZONES`)
    }
    const zoneKnown = Object.values(rawAreas).some((a) => a.name === zone && a.act === act)
    if (!zoneKnown) {
      throw new Error(`quest-rewards: зона "${zone}" (${quest.id}) не найдена в areas.json в акте ${act}`)
    }

    const byLevel = (a: QuestGem, b: QuestGem): number =>
      gemLevel(a.name) - gemLevel(b.name) || a.name.localeCompare(b.name)
    quests.push({
      id: quest.id,
      name: quest.name,
      act,
      zone,
      npc,
      vendorNpc,
      rewards: [...rewards.values()].sort(byLevel),
      vendor: [...vendor.values()].sort(byLevel)
    })
  }

  for (const id of Object.keys(QUEST_ZONES)) {
    if (!quests.some((q) => q.id === id)) {
      console.warn(`quest-rewards: QUEST_ZONES содержит ${id}, но в quests.json у него нет гем-наград`)
    }
  }

  // сортировка по акту, внутри акта — по уровню зоны-триггера (порядок прохождения)
  const zoneLevel = (q: (typeof quests)[number]): number =>
    Object.values(rawAreas).find((a) => a.name === q.zone && a.act === q.act)?.level ?? 0
  quests.sort((a, b) => a.act - b.act || zoneLevel(a) - zoneLevel(b))

  const out = path.join(ROOT, 'src', 'shared', 'data', 'quest-rewards.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(quests, null, 1))
  console.log(`quest rewards: ${quests.length} -> ${path.relative(ROOT, out)}`)
}

async function main(): Promise<void> {
  const rawGems = await fetchJson<Record<string, RawGem>>('gems.json')
  const rawAreas = await fetchJson<Record<string, RawArea>>('areas.json')
  await importGems(rawGems)
  await importZoneLevels(rawAreas)
  await importQuestRewards(rawGems, rawAreas)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
