/**
 * Эмулятор Client.txt для тестов без игры.
 *
 * Использование:
 *   npm run fake-log -- <файл> "The Coast"          # дописать вход в зону
 *   npm run fake-log -- <файл> "The Coast" --gen 2  # то же + строка Generating (уровень инстанса)
 *   npm run fake-log -- <файл> --level 10           # левелап персонажа
 *   npm run fake-log -- <файл> --reset              # обнулить файл (эмуляция рестарта игры)
 *   npm run fake-log -- <файл> --demo               # проиграть последовательность зон акта 1
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

function stamp(): string {
  const now = new Date()
  const d = now.toISOString().slice(0, 10).replace(/-/g, '/')
  const t = now.toTimeString().slice(0, 8)
  return `${d} ${t} 123456789 cff945b9`
}

function line(zone: string): string {
  return `${stamp()} [INFO Client 1234] : You have entered ${zone}.\r\n`
}

function levelLine(level: number): string {
  return `${stamp()} [INFO Client 1234] : Testchar (Witch) is now level ${level}\r\n`
}

function genLine(areaLevel: number): string {
  return `${stamp()} [DEBUG Client 1234] Generating level ${areaLevel} area "1_1_4" with seed 42\r\n`
}

fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })

// вычленяем флаги --level/--gen, остальное — имя зоны
let level: number | null = null
let gen: number | null = null
const words: string[] = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--level') level = parseInt(rest[++i], 10)
  else if (rest[i] === '--gen') gen = parseInt(rest[++i], 10)
  else words.push(rest[i])
}
const arg = words.join(' ')

if (level !== null) {
  if (!Number.isInteger(level) || level < 1) {
    console.error('--level требует целое число >= 1')
    process.exit(1)
  }
  fs.appendFileSync(file, levelLine(level))
  console.log(`↑ уровень ${level}`)
}

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
  if (gen !== null) {
    fs.appendFileSync(file, genLine(gen))
    console.log(`⚙ Generating level ${gen}`)
  }
  fs.appendFileSync(file, line(arg))
  console.log(`→ ${arg}`)
} else if (level === null) {
  console.error('Укажи имя зоны, --level <n>, --reset или --demo')
  process.exit(1)
}
