import fs from 'node:fs'
import path from 'node:path'
import chokidar, { FSWatcher } from 'chokidar'
import { parse as parseToml } from 'smol-toml'
import type { Guide, GuideAct, GuideStep, GuideZone, StepKind } from '../shared/types'

const KINDS: StepKind[] = ['normal', 'gem-buy', 'gem-reward']

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function parseAct(fileName: string, raw: string): GuideAct {
  const doc = parseToml(raw) as Record<string, unknown>
  const actMeta = (doc.act ?? {}) as Record<string, unknown>
  const number = typeof actMeta.number === 'number' ? actMeta.number : NaN
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${fileName}: [act].number должен быть целым числом >= 1`)
  }
  const zonesRaw = Array.isArray(doc.zone) ? doc.zone : []
  const zones: GuideZone[] = zonesRaw.map((z, i) => {
    const zone = z as Record<string, unknown>
    const name = asString(zone.name)
    if (!name) throw new Error(`${fileName}: [[zone]] #${i + 1} без name`)
    const stepsRaw = Array.isArray(zone.steps) ? zone.steps : []
    const steps: GuideStep[] = stepsRaw.map((s, j) => {
      const step = s as Record<string, unknown>
      const text = asString(step.text)
      if (!text) throw new Error(`${fileName}: зона "${name}", шаг #${j + 1} без text`)
      const kind = asString(step.kind) ?? 'normal'
      if (!KINDS.includes(kind as StepKind)) {
        throw new Error(`${fileName}: зона "${name}", шаг "${text}": неизвестный kind "${kind}"`)
      }
      return { text, kind: kind as StepKind }
    })
    return { name, notes: asString(zone.notes), layout: asString(zone.layout), steps }
  })
  return {
    number,
    title: asString(actMeta.title) ?? `Act ${number}`,
    zones
  }
}

export function loadGuide(guidesRoot: string, profile: string): Guide {
  const dir = path.join(guidesRoot, profile)
  const guide: Guide = { profile, acts: [], errors: [] }
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.toml'))
  } catch {
    guide.errors.push(`Папка гайда не найдена: ${dir}`)
    return guide
  }
  for (const file of files.sort()) {
    try {
      guide.acts.push(parseAct(file, fs.readFileSync(path.join(dir, file), 'utf-8')))
    } catch (e) {
      guide.errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  guide.acts.sort((a, b) => a.number - b.number)
  return guide
}

/** Watches the profile directory and reloads on any .toml change (hot-reload). */
export function watchGuide(
  guidesRoot: string,
  profile: string,
  onReload: (guide: Guide) => void
): FSWatcher {
  const dir = path.join(guidesRoot, profile)
  let debounce: NodeJS.Timeout | null = null
  const watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 2 })
  watcher.on('all', (_event, changedPath) => {
    if (!changedPath.toLowerCase().endsWith('.toml')) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => onReload(loadGuide(guidesRoot, profile)), 150)
  })
  return watcher
}
