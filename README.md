# PoE Acts Overlay

Оверлей-помощник для прохождения актов Path of Exile 1. Следит за `Client.txt` и
автоматически показывает подсказки для зоны, в которой находится персонаж:
маршрут, чеклист шагов, план камней, лайаут зоны.

**Игра должна работать в режиме Windowed Fullscreen** (иначе оверлей не будет виден поверх).

## Запуск

```powershell
npm install
npm run dev
```

Путь к `Client.txt` ищется автоматически по стандартным местам установки.
Если не нашёлся — выбери вручную через меню иконки в трее.

## Хоткеи

| Хоткей | Действие |
|---|---|
| `Ctrl+Alt+O` | показать/скрыть оверлей |
| `Ctrl+Alt+I` | режим кликов (иначе мышь проходит сквозь оверлей) |
| `Ctrl+Alt+L` | показать/скрыть лайаут зоны |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | предыдущая/следующая зона вручную |

Хоткеи можно поменять в `%APPDATA%\poe-acts-overlay\settings.json`.
Перетащить панель: включить режим кликов и тянуть за полосатую полоску сверху.

## Гайды

Гайды лежат в [guides/default/](guides/default/) — по TOML-файлу на акт.
Файлы можно править при запущенном оверлее — изменения подхватываются сразу (hot-reload).
Ошибки парсинга показываются прямо в оверлее.

```toml
[act]
number = 1
title = "Act 1"

[[zone]]
name = "The Coast"                  # точно как пишет игра в логе (английский)
layout = "layouts/a1-coast.png"     # опционально: картинка из guides/default/layouts/
notes = """
Произвольный текст под названием зоны.
"""

  [[zone.steps]]                    # шаг чеклиста (кликается в режиме кликов)
  text = "Взять waypoint"

  [[zone.steps]]
  text = "Купить Steelskin у Nessa"
  kind = "gem-buy"                  # подсветка: gem-buy (купить) / gem-reward (награда)
```

- Зона может встречаться в файле один раз; шаги отмечаются кликом, прогресс
  сохраняется (`%APPDATA%\poe-acts-overlay\progress-default.json`).
- Сброс прогресса — в меню трея (для нового персонажа).
- Картинки лайаутов клади в `guides/default/layouts/` и указывай в `layout`.
- Одноимённые зоны из частей 1 и 2 (The Coast в A1 и A6) различаются автоматически
  по последнему определённому акту.

## Импорт маршрута exile-leveling

Стартовые гайды сгенерированы из маршрута [exile-leveling](https://github.com/HeartofPhos/exile-leveling) (MIT).
Перегенерировать (перезапишет файлы!):

```powershell
npm run import-guide                # в guides/default/
npm run import-guide -- myprofile   # в guides/myprofile/
```

Профиль гайдов переключается полем `profile` в `settings.json`.

## Тест без игры

```powershell
# запустить оверлей с тестовым логом
$env:POE_OVERLAY_LOG = "D:\tmp\Client.txt"; npm run dev

# в другом терминале: эмулировать вход в зону / рестарт игры / демо-прогон
npm run fake-log -- D:\tmp\Client.txt "The Coast"
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --reset
npx tsx scripts/fake-log.ts D:\tmp\Client.txt --demo
```

## Как это работает

- `src/main/log-watcher.ts` — тейлинг `Client.txt` (поллинг размера, чтение только
  новых байт, обработка обнуления файла при рестарте игры), строки
  `: You have entered <Zone>.`
- `src/main/guide-loader.ts` — загрузка TOML-гайдов + hot-reload (chokidar).
- `src/main/zone-tracker.ts` — привязка зоны из лога к акту гайда.
- `src/renderer/` — React-интерфейс панели.
- Прозрачное always-on-top окно Electron с `setIgnoreMouseEvents` (click-through).
