# Timer Panel Position Setting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Настройка позиции панели таймера относительно основной панели оверлея: сверху / снизу / слева / справа (дефолт — справа, как сейчас).

**Architecture:** Позиция хранится в `settings.json` и прокидывается через `AppState` в рендерер, который вешает класс `pos-<position>` на `.overlay-root`; CSS меняет `flex-direction`. DOM-порядок не меняется. UI — ряд кнопок во вкладке «runs» окна настроек, по образцу выбора дистанции (`target-acts`).

**Tech Stack:** Electron + React 19 + TypeScript, IPC через `ipcMain.on` / `contextBridge` (паттерн `set-target-acts`).

**Spec:** `docs/superpowers/specs/2026-07-19-timer-position-design.md`

## Global Constraints

- Тип позиции: `TimerPosition = 'top' | 'bottom' | 'left' | 'right'`; дефолт `'right'`.
- Для `top`/`bottom` таймер растягивается до ширины основной панели — ровно `380px`.
- Неизвестное значение в `settings.json` при загрузке трактуется как `'right'`; IPC-обработчик игнорирует значения вне списка.
- В проекте нет тест-раннера — проверка каждой задачи: `npm run typecheck` (из корня репо) + ручная проверка в Task 4. Не добавлять тестовый фреймворк.
- Комментарии в коде — в стиле проекта (по-русски, по делу).

---

### Task 1: Тип, настройка, IPC (shared + main + preload)

**Files:**
- Modify: `src/shared/types.ts` (тип + поле в `AppState`, ~строка 212)
- Modify: `src/main/settings.ts` (поле в `Settings`, DEFAULTS, нормализация)
- Modify: `src/main/index.ts` (инициализация `state`, IPC-обработчик, ~строки 57–75 и 572–578)
- Modify: `src/preload/index.ts` (метод API)
- `src/preload/index.d.ts` менять НЕ нужно: он объявляет `window.api: Api`, где `Api = typeof api` из `./index` — тип подтянется сам.

**Interfaces:**
- Produces: тип `TimerPosition` (export из `src/shared/types.ts`); поле `AppState.timerPosition: TimerPosition`; `window.api.setTimerPosition(pos: TimerPosition): void`; IPC-канал `'set-timer-position'`; экспорты `TIMER_POSITIONS` и `normalizeTimerPosition` из `src/main/settings.ts`.
- Consumes: существующие `saveSettings`, `pushState`, паттерн `set-target-acts` в `src/main/index.ts`.

- [ ] **Step 1: Добавить тип и поле в `src/shared/types.ts`**

Перед `export interface AppState` добавить:

```ts
/** Позиция панели таймера относительно основной панели оверлея. */
export type TimerPosition = 'top' | 'bottom' | 'left' | 'right'
```

Внутри `interface AppState`, после поля `timer: TimerState` (~строка 212), добавить:

```ts
  /** позиция панели таймера относительно основной панели */
  timerPosition: TimerPosition
```

- [ ] **Step 2: Поле настройки и нормализация в `src/main/settings.ts`**

В импорт из `'../shared/types'` (сейчас: `import type { Run } from '../shared/types'`) добавить `TimerPosition`:

```ts
import type { Run, TimerPosition } from '../shared/types'
```

В `interface Settings`, после `timerVisible: boolean` (~строка 39), добавить:

```ts
  /** позиция панели таймера относительно основной панели */
  timerPosition: TimerPosition
```

В `DEFAULTS`, после `timerVisible: false,`:

```ts
  timerPosition: 'right',
```

Перед `loadSettings` добавить:

```ts
export const TIMER_POSITIONS: readonly TimerPosition[] = ['top', 'bottom', 'left', 'right']

/** Неизвестное значение (ручная правка settings.json) трактуем как 'right'. */
export function normalizeTimerPosition(v: unknown): TimerPosition {
  return TIMER_POSITIONS.includes(v as TimerPosition) ? (v as TimerPosition) : 'right'
}
```

В `loadSettings`, в возвращаемом объекте после строки `hotkeys: { ...DEFAULTS.hotkeys, ...raw.hotkeys }` добавить (с запятой у предыдущей строки):

```ts
      timerPosition: normalizeTimerPosition(raw.timerPosition)
```

- [ ] **Step 3: `state` и IPC-обработчик в `src/main/index.ts`**

В импорт из `'./settings'` (блок `import { clearRuns, deleteRun, ... } from './settings'`) добавить `TIMER_POSITIONS`. В импорт типов из `'../shared/types'` добавить `TimerPosition` (type-only).

В инициализации `const state: AppState = { ... }` после `timer: runTimer.state,` (~строка 71) добавить:

```ts
  timerPosition: settings.timerPosition,
```

После обработчика `ipcMain.on('set-target-acts', ...)` (~строка 578) добавить:

```ts
  // позиция панели таймера (сверху/снизу/слева/справа от основной панели)
  ipcMain.on('set-timer-position', (_e, pos: unknown) => {
    if (!TIMER_POSITIONS.includes(pos as TimerPosition)) return
    settings.timerPosition = pos as TimerPosition
    state.timerPosition = settings.timerPosition
    saveSettings(settings)
    pushState()
  })
```

- [ ] **Step 4: Метод API в `src/preload/index.ts`**

В импорт из `'../shared/types'` добавить `TimerPosition`:

```ts
import type { AppState, PresetSource, Run, TimerPosition, UpdateStatus } from '../shared/types'
```

В объект `api`, после метода `setTargetActs` (~строка 67–69), добавить:

```ts
  setTimerPosition: (pos: TimerPosition): void => {
    ipcRenderer.send('set-timer-position', pos)
  },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, без ошибок (рендерер поле пока не использует — это нормально).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/settings.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: timerPosition setting plumbed through settings/IPC/AppState"
```

---

### Task 2: Раскладка оверлея по позиции (renderer CSS)

**Files:**
- Modify: `src/renderer/src/App.tsx` (~строка 60, корневой `div`)
- Modify: `src/renderer/src/styles.css` (после блока `.overlay-root`, ~строка 45)

**Interfaces:**
- Consumes: `state.timerPosition: TimerPosition` из `AppState` (Task 1).
- Produces: классы `pos-top` / `pos-bottom` / `pos-left` / `pos-right` на `.overlay-root`.

- [ ] **Step 1: Класс позиции в `src/renderer/src/App.tsx`**

Заменить (~строка 60):

```tsx
    <div className="overlay-root" ref={rootRef}>
```

на:

```tsx
    <div className={`overlay-root pos-${state.timerPosition}`} ref={rootRef}>
```

- [ ] **Step 2: CSS-правила в `src/renderer/src/styles.css`**

Сразу после закрывающей скобки блока `.overlay-root { ... }` (~строка 45) добавить:

```css
/* Позиция панели таймера: pos-right = базовый row, отдельного правила не требует. */
.overlay-root.pos-left {
  flex-direction: row-reverse;
}

.overlay-root.pos-bottom {
  flex-direction: column;
}

.overlay-root.pos-top {
  flex-direction: column-reverse;
}

/* сверху/снизу таймер растягивается до ширины основной панели */
.overlay-root.pos-top .timer,
.overlay-root.pos-bottom .timer {
  width: 380px;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat: overlay layout honors timer panel position"
```

---

### Task 3: Строки i18n + кнопки в окне настроек

**Files:**
- Modify: `src/shared/i18n.ts` (интерфейс `Messages` ~строка 73, объект ru ~строка 196, объект en ~строка 324)
- Modify: `src/renderer/src/settings/SettingsApp.tsx` (вкладка `runs`, после блока «Дистанция забега», ~строка 510)

**Interfaces:**
- Consumes: `window.api.setTimerPosition(pos)` (Task 1), `state.timerPosition` (Task 1), CSS-класс `.target-acts` из `settings.css` (существует).
- Produces: `Messages.timerPositionTitle: string`, `Messages.timerPositionNames: Record<'top' | 'bottom' | 'left' | 'right', string>`.

- [ ] **Step 1: Строки в `src/shared/i18n.ts`**

В `interface Messages`, после `runDistanceTitle: string` (~строка 73), добавить (без импорта `TimerPosition` — union прописан литерально, чтобы не заводить импорт из `./types`, который сам импортирует `Language` отсюда):

```ts
  timerPositionTitle: string
  timerPositionNames: Record<'top' | 'bottom' | 'left' | 'right', string>
```

В русском объекте, после `runDistanceTitle: 'Дистанция забега',` (~строка 196):

```ts
  timerPositionTitle: 'Позиция таймера',
  timerPositionNames: { top: 'Сверху', bottom: 'Снизу', left: 'Слева', right: 'Справа' },
```

В английском объекте, после `runDistanceTitle: 'Run distance',` (~строка 324):

```ts
  timerPositionTitle: 'Timer position',
  timerPositionNames: { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' },
```

- [ ] **Step 2: Кнопки в `src/renderer/src/settings/SettingsApp.tsx`**

Во вкладке `runs`, после закрывающего `</div>` блока `settings-row` с `t.runDistanceTitle` (~строка 510) и перед `<RunsHistory language={state.language} />`, добавить:

```tsx
            <div className="settings-row">
              <span className="pane-title">{t.timerPositionTitle}</span>
              <div className="target-acts">
                {(['top', 'bottom', 'left', 'right'] as const).map((p) => (
                  <button
                    key={p}
                    className={state.timerPosition === p ? 'active' : ''}
                    onClick={() => window.api.setTimerPosition(p)}
                  >
                    {t.timerPositionNames[p]}
                  </button>
                ))}
              </div>
            </div>
```

Новых импортов не требуется (`as const`-массив типизируется литералами).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. Если ругается на неполноту `Messages` — значит строки добавлены не в оба языковых объекта.

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n.ts src/renderer/src/settings/SettingsApp.tsx
git commit -m "feat: timer position picker in settings (runs tab), i18n strings"
```

---

### Task 4: Ручная проверка end-to-end

**Files:** нет изменений кода (только фиксы, если проверка провалится).

**Interfaces:**
- Consumes: всё из Task 1–3.

- [ ] **Step 1: Запустить оверлей**

Run: `npm run dev`
Expected: оверлей стартует, таймер (если скрыт) включается кнопкой ⏱ в шапке или `Ctrl+Alt+T`, панель таймера справа от основной (дефолт `right`).

- [ ] **Step 2: Переключить все 4 позиции**

Открыть настройки (⚙ или `Ctrl+Alt+G`) → вкладка забегов → ряд «Позиция таймера». Кликнуть по очереди: Сверху, Снизу, Слева, Справа. Expected: панель таймера мгновенно перемещается на соответствующую сторону; при «Сверху»/«Снизу» она растянута до ширины основной панели (380px); активная кнопка подсвечена; окно оверлея ресайзится под контент без обрезания.

- [ ] **Step 3: Персистентность**

Выбрать «Сверху», закрыть приложение полностью, запустить снова (`npm run dev`). Expected: таймер сверху. В `%APPDATA%/poe-acts-overlay/settings.json` есть `"timerPosition": "top"`.

- [ ] **Step 4: Устойчивость к мусору в settings.json**

Закрыть приложение, руками поставить в settings.json `"timerPosition": "diagonal"`, запустить. Expected: таймер справа (fallback `'right'`), без ошибок в консоли.

- [ ] **Step 5: Вернуть желаемую позицию и убедиться, что рабочее дерево чистое**

Run: `git status`
Expected: чисто (все изменения закоммичены в Task 1–3).
