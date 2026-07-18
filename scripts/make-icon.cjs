// Generates build/icon.ico from resources/icon.webp.
// nativeImage.createFromPath() can't decode this file's extended WebP (VP8X+ALPH)
// chunks in this Electron version, so we render it through Blink instead: load it
// into a hidden BrowserWindow, draw it on <canvas> at each target size, and read
// back PNG data URLs via executeJavaScript.
//   ELECTRON_RUN_AS_NODE= ./node_modules/electron/dist/electron.exe scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '../resources/icon.webp')
const OUT = path.resolve(__dirname, '../build/icon.ico')
const SIZES = [16, 32, 48, 64, 128, 256]

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + 16 * entries.length
  entries.forEach((e, i) => {
    const b = dir.subarray(i * 16, i * 16 + 16)
    b.writeUInt8(e.size >= 256 ? 0 : e.size, 0)
    b.writeUInt8(e.size >= 256 ? 0 : e.size, 1)
    b.writeUInt8(0, 2)
    b.writeUInt8(0, 3)
    b.writeUInt16LE(1, 4)
    b.writeUInt16LE(32, 6)
    b.writeUInt32LE(e.png.length, 8)
    b.writeUInt32LE(offset, 12)
    offset += e.png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 300, height: 300 })
  // Must be a file:// page (not data:) so the file:// <img> src is same-origin
  // and Chromium doesn't block it as a cross-origin local-file access.
  const tmpHtml = path.join(path.dirname(SRC), '.make-icon-tmp.html')
  fs.writeFileSync(tmpHtml, `<!doctype html><html><body><img id="src" src="icon.webp"></body></html>`)
  await win.loadFile(tmpHtml)

  const dataUrls = await win.webContents.executeJavaScript(`
    (function() {
      const img = document.getElementById('src')
      return new Promise((resolve, reject) => {
        function draw() {
          if (!img.naturalWidth) { reject(new Error('image failed to decode')); return }
          const sizes = ${JSON.stringify(SIZES)}
          const out = {}
          for (const size of sizes) {
            const c = document.createElement('canvas')
            c.width = size; c.height = size
            const ctx = c.getContext('2d')
            ctx.drawImage(img, 0, 0, size, size)
            out[size] = c.toDataURL('image/png')
          }
          resolve(out)
        }
        if (img.complete) draw()
        else { img.onload = draw; img.onerror = () => reject(new Error('img onerror')) }
      })
    })()
  `)

  const entries = SIZES.map((size) => ({
    size,
    png: Buffer.from(dataUrls[size].split(',')[1], 'base64')
  }))
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, buildIco(entries))
  fs.rmSync(tmpHtml, { force: true })
  console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes')
  app.exit(0)
})
