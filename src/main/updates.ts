import { net } from 'electron'
import type { UpdateStatus } from '../shared/types'

const REPO = 'xPranik/poe-acts-overlay'

interface LatestRelease {
  tag_name: string
  html_url: string
}

/** true, если `a` (x.y.z) новее `b` */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na > nb
  }
  return false
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus> {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { kind: 'error', message: `GitHub API ${res.status}` }
    const data = (await res.json()) as LatestRelease
    const version = data.tag_name.replace(/^v/, '')
    if (isNewer(version, currentVersion)) {
      return { kind: 'available', version, url: data.html_url }
    }
    return { kind: 'up-to-date' }
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}
