/**
 * Импорт маршрута из exile-leveling (MIT, https://github.com/HeartofPhos/exile-leveling)
 * в TOML-гайды этого оверлея.
 *
 * Использование:
 *   npm run import-guide                  # скачает act-1..act-10 и запишет в guides/default/
 *   npm run import-guide -- myprofile     # запишет в guides/myprofile/
 *
 * Блоки #ifdef LEAGUE_START включаются, #ifndef LEAGUE_START пропускаются
 * (маршрут в варианте лиг-старта).
 */
import fs from 'node:fs'
import path from 'node:path'

const RAW_BASE =
  'https://raw.githubusercontent.com/HeartofPhos/exile-leveling/master/common/data/routes'

const TOWN_BY_ACT: Record<number, string> = {
  1: "Lioneye's Watch",
  2: 'The Forest Encampment',
  3: 'The Sarn Encampment',
  4: 'Highgate',
  5: "Overseer's Tower",
  6: "Lioneye's Watch",
  7: 'The Bridge Encampment',
  8: 'The Sarn Encampment',
  9: 'Highgate',
  10: 'Oriath Docks'
}

const START_ZONE_ACT_1 = 'The Twilight Strand'

interface Step {
  text: string
}

interface Zone {
  name: string
  steps: Step[]
}

function dirArrow(deg: string): string {
  const arrows: Record<string, string> = {
    '0': '↑',
    '45': '↗',
    '90': '→',
    '135': '↘',
    '180': '↓',
    '225': '↙',
    '270': '←',
    '315': '↖'
  }
  return arrows[deg] ?? `${deg}°`
}

/** Разбивает строку на текст и хвостовой комментарий `#Name` (вне фигурных скобок). */
function splitComment(line: string): { body: string; comment: string | null } {
  let depth = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '#' && depth === 0) {
      return { body: line.slice(0, i).trim(), comment: line.slice(i + 1).trim() }
    }
  }
  return { body: line.trim(), comment: null }
}

/** id области → имя, собирается из комментариев `{enter|id} #Name` по всем актам */
const areaNames = new Map<string, string>()

function collectAreaNames(text: string): void {
  for (const rawLine of text.split('\n')) {
    const { body, comment } = splitComment(rawLine.trim())
    if (!comment) continue
    const m = /\{(?:enter|waypoint|area)\|([^}|]+)\}/.exec(body)
    if (m) areaNames.set(m[1], comment)
  }
}

/** Заменяет {fragment|args} на читаемый текст. */
function renderFragments(body: string, comment: string | null): string {
  return body.replace(/\{([^}]*)\}/g, (_m, inner: string) => {
    const [kind, ...args] = inner.split('|')
    switch (kind) {
      case 'kill':
        return `{kill|${args.join('|')}}`
      case 'arena':
        return `{zone|${args.join('|')}}`
      case 'generic':
        return args.join('|') || kind
      case 'quest_text':
        return `{item|${args.join('|')}}`
      case 'area':
        return `{zone|${areaNames.get(args[0]) ?? args.join('|')}}`
      case 'enter':
        return `{zone|${comment ?? areaNames.get(args[0]) ?? args.join('|')}}`
      case 'waypoint':
        return `{waypoint|${comment ?? areaNames.get(args[0]) ?? args.join('|')}}`
      case 'waypoint_get':
        return '{waypoint}'
      case 'portal':
        return '{portal}'
      case 'quest':
        return comment ? `{quest|${comment}}` : `{quest|${args.join(', ')}}`
      case 'trial':
        return '{trial}'
      case 'ascend':
        return '{lab}'
      case 'crafting':
        return '{crafting}'
      case 'logout':
        return '{logout}'
      case 'dir':
        return dirArrow(args[0])
      default:
        return args.length > 0 ? `${kind}: ${args.join(', ')}` : kind
    }
  })
}

interface ParsedLine {
  indentLevel: number
  raw: string
}

function parseRoute(actNumber: number, text: string, startZone: string): { zones: Zone[]; lastZone: string } {
  const zones: Zone[] = []
  const byName = new Map<string, Zone>()
  let current = getZone(startZone)
  let ifdefSkipDepth = 0
  const condStack: boolean[] = []

  function getZone(name: string): Zone {
    let z = byName.get(name)
    if (!z) {
      z = { name, steps: [] }
      byName.set(name, z)
      zones.push(z)
    }
    return z
  }

  function lastStep(): Step | null {
    return current.steps.length > 0 ? current.steps[current.steps.length - 1] : null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed === '') continue

    // директивы условной компиляции
    if (trimmed.startsWith('#ifdef') || trimmed.startsWith('#ifndef')) {
      const isIfdef = trimmed.startsWith('#ifdef')
      const flag = trimmed.split(/\s+/)[1] ?? ''
      const include = flag === 'LEAGUE_START' ? isIfdef : !isIfdef
      condStack.push(include)
      if (!include) ifdefSkipDepth++
      continue
    }
    if (trimmed.startsWith('#endif')) {
      const wasIncluded = condStack.pop()
      if (wasIncluded === false) ifdefSkipDepth--
      continue
    }
    if (ifdefSkipDepth > 0) continue
    if (trimmed.startsWith('#section')) continue

    // #sub — пояснение к предыдущему шагу
    if (trimmed.startsWith('#sub')) {
      const sub = renderFragments(...destructure(trimmed.slice(4).trim()))
      const step = lastStep()
      if (step) step.text += `\n· ${sub}`
      continue
    }
    if (trimmed.startsWith('#')) continue

    const { body, comment } = splitComment(trimmed)
    if (body === '') continue

    // переходы, меняющие текущую зону
    const enterMatch = /\{enter\|([^}]*)\}/.exec(body)
    const waypointMatch = /\{waypoint\|([^}]*)\}/.exec(body)
    const rendered = renderFragments(body, comment).replace(/^➞\s*/, '→ ').trim()
    if (rendered !== '') current.steps.push({ text: rendered })

    if (enterMatch && comment) {
      current = getZone(comment)
    } else if (waypointMatch && comment) {
      current = getZone(comment)
    } else if (/\{logout\}/.test(body)) {
      current = getZone(TOWN_BY_ACT[actNumber])
    }
  }

  return { zones, lastZone: current.name }
}

function destructure(s: string): [string, string | null] {
  const { body, comment } = splitComment(s)
  return [body, comment]
}

// --- TOML serialization ---

function tomlString(s: string): string {
  if (s.includes('\n')) {
    const escaped = s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""')
    return `"""\n${escaped}"""`
  }
  return JSON.stringify(s)
}

function toToml(actNumber: number, zones: Zone[]): string {
  const lines: string[] = []
  lines.push(`# Сгенерировано из exile-leveling (https://github.com/HeartofPhos/exile-leveling, MIT).`)
  lines.push(`# Редактируй свободно: notes — текст под названием зоны, steps — чеклист.`)
  lines.push(`# kind шага: не указан = обычный, "gem-buy" = купить камень, "gem-reward" = награда за квест.`)
  lines.push(`# Разметка в тексте (цвет + иконка): {zone|Имя} {kill|Босс} {quest|Квест} {item|Предмет}`)
  lines.push(`#   {waypoint} {waypoint|Зона} {portal} {trial} {logout} {lab} {crafting}`)
  lines.push('')
  lines.push('[act]')
  lines.push(`number = ${actNumber}`)
  lines.push(`title = "Act ${actNumber}"`)
  // зоны без шагов (например, стартовая зона следующего акта) в файл не пишем,
  // иначе resolveZone найдёт пустой дубль вместо зоны из правильного акта
  for (const zone of zones.filter((z) => z.steps.length > 0)) {
    lines.push('')
    lines.push('[[zone]]')
    lines.push(`name = ${tomlString(zone.name)}`)
    for (const step of zone.steps) {
      lines.push('')
      lines.push('  [[zone.steps]]')
      lines.push(`  text = ${tomlString(step.text)}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

async function main(): Promise<void> {
  const profile = process.argv[2] ?? 'default'
  const outDir = path.join(process.cwd(), 'guides', profile)
  fs.mkdirSync(outDir, { recursive: true })

  const texts: string[] = []
  for (let act = 1; act <= 10; act++) {
    const url = `${RAW_BASE}/act-${act}.txt`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`Не удалось скачать ${url}: ${res.status}`)
      process.exit(1)
    }
    const text = await res.text()
    texts.push(text)
    collectAreaNames(text)
  }

  let startZone = START_ZONE_ACT_1
  for (let act = 1; act <= 10; act++) {
    const text = texts[act - 1]
    const { zones, lastZone } = parseRoute(act, text, startZone)
    const outPath = path.join(outDir, `act-${act}.toml`)
    fs.writeFileSync(outPath, toToml(act, zones), 'utf-8')
    console.log(`act-${act}.toml: ${zones.length} зон, ${zones.reduce((n, z) => n + z.steps.length, 0)} шагов`)
    startZone = lastZone
  }
  console.log(`\nГотово → ${outDir}`)
}

main()
