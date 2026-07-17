import fs from 'node:fs'
import path from 'node:path'

const ENTER_RE = /\] : You have entered (.+)\.\s*$/
// левелап пишется одинаково для своего персонажа и согрупников — берём последний
const LEVEL_RE = /\] : .+? \(\w+\) is now level (\d+)\s*$/
// строка генерации инстанса идёт непосредственно перед "You have entered"
const GEN_RE = /Generating level (\d+) area "[^"]*"/

const POLL_INTERVAL_MS = 500
const TAIL_BYTES = 64 * 1024

/** Probe standard install locations for Client.txt across all fixed drives. */
export function findClientLog(): string | null {
  const drives: string[] = []
  for (let c = 67; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`
    try {
      fs.accessSync(root)
      drives.push(root)
    } catch {
      /* drive absent */
    }
  }
  const suffixes = [
    'Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'Program Files\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'SteamLibrary\\steamapps\\common\\Path of Exile\\logs\\Client.txt',
    'Games\\Path of Exile\\logs\\Client.txt'
  ]
  for (const drive of drives) {
    for (const suffix of suffixes) {
      const candidate = path.join(drive, suffix)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}

export function extractZone(line: string): string | null {
  const m = ENTER_RE.exec(line)
  return m ? m[1] : null
}

export function extractLevel(line: string): number | null {
  const m = LEVEL_RE.exec(line)
  return m ? parseInt(m[1], 10) : null
}

export function extractAreaGen(line: string): number | null {
  const m = GEN_RE.exec(line)
  return m ? parseInt(m[1], 10) : null
}

export interface LogEvents {
  /** вход в зону; areaLevel — уровень инстанса из строки Generating (если была) */
  onZone: (zone: string, areaLevel: number | null) => void
  onLevel: (level: number) => void
}

/**
 * Tails Client.txt by polling file size and reading only appended bytes.
 * Handles truncation (PoE may reset the file on restart) by rewinding.
 */
export class LogWatcher {
  private timer: NodeJS.Timeout | null = null
  private position = 0
  private partial = ''
  private pendingAreaLevel: number | null = null

  constructor(
    private filePath: string,
    private events: LogEvents
  ) {}

  /** Reads the existing tail to recover the current zone and level, then starts polling. */
  start(): void {
    let size = 0
    try {
      size = fs.statSync(this.filePath).size
    } catch {
      /* stat retried by the poll loop */
    }
    const from = Math.max(0, size - TAIL_BYTES)
    const tail = this.readRange(from, size)
    let lastLevel: number | null = null
    let lastZone: { name: string; areaLevel: number | null } | null = null
    for (const raw of tail.split('\n')) {
      const line = raw.trimEnd()
      const gen = extractAreaGen(line)
      if (gen !== null) {
        this.pendingAreaLevel = gen
        continue
      }
      const zone = extractZone(line)
      if (zone) {
        lastZone = { name: zone, areaLevel: this.pendingAreaLevel }
        this.pendingAreaLevel = null
        continue
      }
      const level = extractLevel(line)
      if (level !== null) lastLevel = level
    }
    this.position = size
    if (lastLevel !== null) this.events.onLevel(lastLevel)
    if (lastZone) this.events.onZone(lastZone.name, lastZone.areaLevel)
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private poll(): void {
    let size: number
    try {
      size = fs.statSync(this.filePath).size
    } catch {
      return
    }
    if (size < this.position) {
      // file truncated on game restart — start over from the top
      this.position = 0
      this.partial = ''
      this.pendingAreaLevel = null
    }
    if (size === this.position) return
    const chunk = this.readRange(this.position, size)
    this.position = size
    this.consume(chunk)
  }

  private consume(chunk: string): void {
    const text = this.partial + chunk
    const lines = text.split('\n')
    this.partial = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trimEnd()
      const gen = extractAreaGen(line)
      if (gen !== null) {
        this.pendingAreaLevel = gen
        continue
      }
      const zone = extractZone(line)
      if (zone) {
        // pending сбрасывается всегда: залётная строка Generating не должна
        // прилипнуть к следующей зоне
        this.events.onZone(zone, this.pendingAreaLevel)
        this.pendingAreaLevel = null
        continue
      }
      const level = extractLevel(line)
      if (level !== null) this.events.onLevel(level)
    }
  }

  private readRange(from: number, to: number): string {
    if (to <= from) return ''
    let fd: number
    try {
      fd = fs.openSync(this.filePath, 'r')
    } catch {
      return ''
    }
    try {
      const buf = Buffer.alloc(to - from)
      const read = fs.readSync(fd, buf, 0, buf.length, from)
      return buf.toString('utf-8', 0, read)
    } finally {
      fs.closeSync(fd)
    }
  }
}
