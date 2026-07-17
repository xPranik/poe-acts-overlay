import fs from 'node:fs'
import path from 'node:path'

const ENTER_RE = /\] : You have entered (.+)\.\s*$/

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

/**
 * Tails Client.txt by polling file size and reading only appended bytes.
 * Handles truncation (PoE may reset the file on restart) by rewinding.
 */
export class LogWatcher {
  private timer: NodeJS.Timeout | null = null
  private position = 0
  private partial = ''

  constructor(
    private filePath: string,
    private onZone: (zone: string) => void
  ) {}

  /** Reads the existing tail to recover the current zone, then starts polling. */
  start(): void {
    let size = 0
    try {
      size = fs.statSync(this.filePath).size
    } catch {
      /* stat retried by the poll loop */
    }
    const from = Math.max(0, size - TAIL_BYTES)
    const tail = this.readRange(from, size)
    const lastZone = tail
      .split('\n')
      .map(extractZone)
      .filter((z): z is string => z !== null)
      .pop()
    this.position = size
    if (lastZone) this.onZone(lastZone)
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
    for (const line of lines) {
      const zone = extractZone(line.trimEnd())
      if (zone) this.onZone(zone)
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
