/**
 * Эмулятор Client.txt для тестов без игры.
 *
 * Использование:
 *   npm run fake-log -- <файл> "The Coast"     # дописать вход в зону
 *   npm run fake-log -- <файл> --reset          # обнулить файл (эмуляция рестарта игры)
 *   npm run fake-log -- <файл> --demo           # проиграть последовательность зон акта 1
 *
 * Запуск оверлея с тестовым логом:
 *   $env:POE_OVERLAY_LOG = "<файл>"; npm run dev
 */
import fs from 'node:fs'
import path from 'node:path'

const [, , file, ...rest] = process.argv
if (!file) {
  console.error('Укажи путь к тестовому Client.txt')
  process.exit(1)
}

function line(zone: string): string {
  const now = new Date()
  const d = now.toISOString().slice(0, 10).replace(/-/g, '/')
  const t = now.toTimeString().slice(0, 8)
  return `${d} ${t} 123456789 cff945b9 [INFO Client 1234] : You have entered ${zone}.\r\n`
}

fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })

const arg = rest.join(' ')
if (arg === '--reset') {
  fs.writeFileSync(file, '')
  console.log('Файл обнулён (эмуляция рестарта игры)')
} else if (arg === '--demo') {
  const zones = [
    'The Twilight Strand',
    "Lioneye's Watch",
    'The Coast',
    'The Tidal Island',
    'The Coast',
    'The Mud Flats'
  ]
  let i = 0
  const timer = setInterval(() => {
    if (i >= zones.length) {
      clearInterval(timer)
      return
    }
    fs.appendFileSync(file, line(zones[i]))
    console.log(`→ ${zones[i]}`)
    i++
  }, 3000)
} else if (arg) {
  fs.appendFileSync(file, line(arg))
  console.log(`→ ${arg}`)
} else {
  console.error('Укажи имя зоны, --reset или --demo')
  process.exit(1)
}
