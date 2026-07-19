# Настройка позиции панели таймера

Дата: 2026-07-19

## Цель

Дать пользователю выбор, где отображать панель таймера относительно основной
панели оверлея: сверху, снизу, слева или справа. Сейчас позиция жёстко «справа»
(`.overlay-root` — inline-flex row, `<Timer>` рендерится после `.panel`).

## Решение

Позиция — это CSS-классы на `.overlay-root`, меняющие `flex-direction`.
DOM-порядок (панель, затем таймер) не меняется.

| Позиция  | flex-direction   | Ширина таймера |
| -------- | ---------------- | -------------- |
| `right`  | `row` (текущее)  | 240px          |
| `left`   | `row-reverse`    | 240px          |
| `bottom` | `column`         | 380px (= ширина панели) |
| `top`    | `column-reverse` | 380px (= ширина панели) |

Дефолт — `right` (сохраняет текущее поведение для существующих пользователей).

## Изменения по файлам

1. **`src/shared/types.ts`** — тип `TimerPosition = 'top' | 'bottom' | 'left' | 'right'`;
   поле `timerPosition: TimerPosition` в `AppState` (рядом с `routeVisible`/`language`).
2. **`src/main/settings.ts`** — поле `timerPosition` в `Settings`, дефолт `'right'`.
   Загружается/сохраняется как остальные поля через spread с `DEFAULTS`.
3. **`src/main/index.ts`** — IPC-обработчик `set-timer-position` по образцу
   `setTargetActs`: валидирует значение (одно из 4), пишет в settings, сохраняет
   и рассылает обновлённый `AppState` в оба окна. `timerPosition` включается в
   собираемый `AppState`.
4. **`src/preload/index.ts` + `src/preload/index.d.ts`** —
   `setTimerPosition(pos: TimerPosition): void`.
5. **`src/renderer/src/App.tsx`** — класс позиции на корне:
   `overlay-root pos-${state.timerPosition}`.
6. **`src/renderer/src/styles.css`** — правила `pos-top/pos-bottom/pos-left/pos-right`
   для `flex-direction`; для `pos-top`/`pos-bottom` — `.timer { width: 380px }`.
7. **`src/renderer/src/settings/SettingsApp.tsx`** — во вкладке `runs`, рядом с
   дистанцией забега, ряд из 4 кнопок («Сверху / Снизу / Слева / Справа») в стиле
   `target-acts`; активная подсвечена, клик → `window.api.setTimerPosition(...)`.
8. **`src/shared/i18n.ts`** — строки en + ru: заголовок настройки и 4 подписи
   позиций.

## Обработка ошибок

- Неизвестное значение `timerPosition` в settings.json (ручная правка) →
  при загрузке трактуется как `'right'` (валидация при чтении или в месте
  использования).
- IPC-обработчик игнорирует значения вне списка 4 позиций.

## Тестирование

- `npm run typecheck`.
- Ручная проверка: запустить оверлей, переключить все 4 позиции из окна
  настроек; убедиться, что панель таймера встаёт с нужной стороны, для
  top/bottom растянута до 380px, окно оверлея корректно ресайзится
  (ResizeObserver уже подгоняет окно под контент), позиция переживает
  перезапуск приложения.

## За рамками задачи

- Свободное перетаскивание таймера / отдельное окно Electron.
- Горячая клавиша или кнопка в оверлее для смены позиции (настройка только
  в окне настроек — решение пользователя).
