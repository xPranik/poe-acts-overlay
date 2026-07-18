// electron-vite build, then electron-builder --win --dir with retries.
// Windows Defender's real-time scan grabs a lock on the freshly-extracted
// electron.exe right as electron-builder tries to (re)create appOutDir,
// producing an intermittent EBUSY. Retrying a few times rides it out without
// needing an AV exclusion.
const { execSync } = require('node:child_process')

const MAX_ATTEMPTS = 8
const RETRY_DELAY_MS = 15000

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

function sleep(ms) {
  execSync(`node -e "setTimeout(()=>{}, ${ms})"`)
}

run('electron-vite build')

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    run('electron-builder --win --dir')
    break
  } catch (err) {
    // stdio:'inherit' means the real EBUSY text goes straight to the terminal,
    // not into err.message — so we just retry on any failure up to the cap.
    if (attempt === MAX_ATTEMPTS) throw err
    console.warn(`electron-builder failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS}ms...`)
    sleep(RETRY_DELAY_MS)
  }
}
