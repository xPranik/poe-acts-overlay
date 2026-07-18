/** Язык интерфейса. Не влияет на содержимое гайдов/пресетов камней — только на текст самого приложения. */
export type Language = 'ru' | 'en'

export interface Messages {
  loading: string
  dragOverlayTitle: string
  trialTooltip: string
  hideRoute: string
  showRoute: string
  runTimerTitle: string
  gemSettingsTitle: string
  noNotesForZone: (zone: string) => string
  waitingForZone: string
  expHint: (area: number, lvl: number) => string
  hideLayout: string
  showLayout: string
  noGemsInZone: string
  pickBuildHint: string
  clickModeOn: string
  clickModeOff: string
  actLabel: (n: number) => string

  timerIdle: string
  timerPaused: string
  timerFinished: string
  startSplitTitle: string
  pauseResumeTitle: string
  undoSplitTitle: string
  finishRunTitle: string
  resetTimerTitle: string

  runsTitle: string
  refreshBtn: string
  clearBtn: string
  confirmClearRuns: string
  noRunsYet: string
  actsWord: (n: number) => string
  deleteRunTitle: string

  searchGemPlaceholder: string
  closeTitle: string
  supportBadge: string
  levelAbbrev: (n: number) => string
  nothingFound: string

  generalTabTitle: string
  confirmDiscardChanges: string
  presetsTitle: string
  activePresetOn: string
  activePresetOff: string
  deletePresetTitle: string
  noPresetsYet: string
  newPresetIdPlaceholder: string
  createBtn: string
  pickOrCreateHint: string
  presetNameTitle: string
  duplicateBtn: string
  copySuffix: string
  saveBtn: string
  savedBtn: string
  removeZoneFromPresetTitle: string
  addEntryBtn: string
  addZoneOption: string
  runDistanceTitle: string
  rewardOption: string
  buyOption: string
  questPlaceholder: string
  vendorPlaceholder: string
  upTitle: string
  downTitle: string
  deleteEntryTitle: string
  removeGemTitle: string
  addGemBtn: string
  legacyTextTitle: string
  invalidPresetIdMsg: string
  presetExistsMsg: (id: string) => string
  confirmDeletePresetMsg: (id: string) => string
  languageTitle: string
  updateSectionTitle: string
  checkUpdateBtn: string
  checkingUpdate: string
  updateUpToDate: string
  updateCheckError: string
  updateAvailable: (version: string) => string

  clientLogNotFound: string
  clientLogNotFoundHint: string
  noGemsPresetOption: string
  toggleOverlayMenuLabel: string
  hideRunTimerMenuLabel: (hotkey: string) => string
  showRunTimerMenuLabel: (hotkey: string) => string
  clickModeMenuLabel: string
  buildMenuLabel: string
  noPresetsMenuLabel: string
  chooseClientLogMenuLabel: string
  chooseClientLogDialogTitle: string
  gemSettingsMenuLabel: string
  openGuidesFolderMenuLabel: string
  reloadGuidesMenuLabel: string
  quitMenuLabel: string
  settingsWindowTitle: string

  buyPrefix: string
  rewardPrefix: string
  presetFileHeaderComment: string
  guideDirNotFoundError: (dir: string) => string
  stepMissingTextError: (where: string, index: number) => string
  stepUnknownKindError: (where: string, text: string, kind: string) => string
  actNumberInvalidError: (fileName: string) => string
  zoneMissingNameError: (fileName: string, index: number) => string
  gemUnknownKindError: (where: string, index: number, kind: string) => string
  gemNeedsTextOrItemsError: (where: string, index: number) => string
  invalidPresetIdError: (id: string) => string
}

const ru: Messages = {
  loading: 'Загрузка...',
  dragOverlayTitle: 'Перетащить оверлей',
  trialTooltip: 'В этой зоне испытание Лабиринта',
  hideRoute: 'Скрыть маршрут',
  showRoute: 'Показать маршрут',
  runTimerTitle: 'Таймер забегов (Ctrl+Alt+T)',
  gemSettingsTitle: 'Настройки камней (Ctrl+Alt+G)',
  noNotesForZone: (zone) => `Нет заметок для зоны «${zone}»`,
  waitingForZone: 'Ожидание входа в зону...',
  expHint: (area, lvl) => `Зона ${area} ур. · персонаж ${lvl} ур.`,
  hideLayout: 'Скрыть лайаут',
  showLayout: 'Показать лайаут (Ctrl+Alt+L)',
  noGemsInZone: 'В этой зоне камней нет',
  pickBuildHint: 'Выбери билд в настройках (⚙) для плана камней',
  clickModeOn: 'режим кликов — Ctrl+Alt+I чтобы отпустить мышь',
  clickModeOff: 'Ctrl+Alt+I — кликать · Ctrl+Alt+O — скрыть',
  actLabel: (n) => `Акт ${n}`,

  timerIdle: 'готов',
  timerPaused: 'пауза',
  timerFinished: 'финиш',
  startSplitTitle: 'Старт / Сплит (следующий акт)',
  pauseResumeTitle: 'Пауза / Продолжить',
  undoSplitTitle: 'Отменить последний сплит',
  finishRunTitle: 'Завершить забег',
  resetTimerTitle: 'Сбросить таймер',

  runsTitle: 'Забеги',
  refreshBtn: 'обновить',
  clearBtn: 'очистить',
  confirmClearRuns: 'Удалить все сохранённые забеги?',
  noRunsYet: 'Забегов пока нет',
  actsWord: (n) => (n === 1 ? 'акт' : 'актов'),
  deleteRunTitle: 'Удалить забег',

  searchGemPlaceholder: 'Поиск камня...',
  closeTitle: 'Закрыть',
  supportBadge: 'саппорт',
  levelAbbrev: (n) => `ур. ${n}`,
  nothingFound: 'Ничего не найдено',

  generalTabTitle: 'Общие',
  confirmDiscardChanges: 'Несохранённые изменения будут потеряны. Продолжить?',
  presetsTitle: 'Пресеты',
  activePresetOn: 'Активен в оверлее — нажми, чтобы убрать',
  activePresetOff: 'Показывать в оверлее',
  deletePresetTitle: 'Удалить пресет',
  noPresetsYet: 'Пресетов пока нет',
  newPresetIdPlaceholder: 'id нового пресета',
  createBtn: '+ создать',
  pickOrCreateHint: 'Выбери пресет слева или создай новый',
  presetNameTitle: 'Название пресета',
  duplicateBtn: 'Дублировать',
  copySuffix: '(копия)',
  saveBtn: 'Сохранить',
  savedBtn: 'Сохранено',
  removeZoneFromPresetTitle: 'Убрать зону из пресета',
  addEntryBtn: '+ запись',
  addZoneOption: '+ добавить зону...',
  runDistanceTitle: 'Дистанция забега',
  rewardOption: 'Награда',
  buyOption: 'Покупка',
  questPlaceholder: 'квест (напр. Enemy at the Gate)',
  vendorPlaceholder: 'продавец (напр. Nessa)',
  upTitle: 'Выше',
  downTitle: 'Ниже',
  deleteEntryTitle: 'Удалить запись',
  removeGemTitle: 'Убрать камень',
  addGemBtn: '+ камень',
  legacyTextTitle: 'Свободный текст записи (легаси-формат)',
  invalidPresetIdMsg: 'Id пресета: только латиница/цифры/дефис/подчёркивание, без пробелов',
  presetExistsMsg: (id) => `Пресет "${id}" уже существует`,
  confirmDeletePresetMsg: (id) => `Удалить пресет "${id}"? Файл gems/${id}.toml будет стёрт.`,
  languageTitle: 'Язык',
  updateSectionTitle: 'Обновления',
  checkUpdateBtn: 'Проверить обновление',
  checkingUpdate: 'Проверка...',
  updateUpToDate: 'Установлена последняя версия',
  updateCheckError: 'Не удалось проверить обновление',
  updateAvailable: (version) => `Доступно обновление v${version}`,

  clientLogNotFound: 'Client.txt не найден',
  clientLogNotFoundHint: 'Client.txt не найден — укажи путь через иконку в трее',
  noGemsPresetOption: '— без камней —',
  toggleOverlayMenuLabel: 'Показать/скрыть оверлей',
  hideRunTimerMenuLabel: (hk) => `Скрыть таймер забегов (${hk})`,
  showRunTimerMenuLabel: (hk) => `Показать таймер забегов (${hk})`,
  clickModeMenuLabel: 'Режим кликов (interactive)',
  buildMenuLabel: 'Билд (камни)',
  noPresetsMenuLabel: 'Нет пресетов — создай gems/<билд>.toml',
  chooseClientLogMenuLabel: 'Выбрать Client.txt...',
  chooseClientLogDialogTitle: 'Выбери Client.txt',
  gemSettingsMenuLabel: 'Настройки камней...',
  openGuidesFolderMenuLabel: 'Открыть папку гайдов',
  reloadGuidesMenuLabel: 'Перечитать гайды',
  quitMenuLabel: 'Выход',
  settingsWindowTitle: 'Настройки камней — PoE Acts Overlay',

  buyPrefix: 'Купить',
  rewardPrefix: 'Награда',
  presetFileHeaderComment:
    '# Файл сгенерирован окном настроек камней — ручные комментарии при сохранении теряются.\n',
  guideDirNotFoundError: (dir) => `Папка гайда не найдена: ${dir}`,
  stepMissingTextError: (where, index) => `${where}, шаг #${index + 1} без text`,
  stepUnknownKindError: (where, text, kind) =>
    `${where}, шаг "${text}": неизвестный kind "${kind}"`,
  actNumberInvalidError: (fileName) => `${fileName}: [act].number должен быть целым числом >= 1`,
  zoneMissingNameError: (fileName, index) => `${fileName}: [[zone]] #${index + 1} без name`,
  gemUnknownKindError: (where, index, kind) =>
    `${where}, камень #${index + 1}: неизвестный kind "${kind}"`,
  gemNeedsTextOrItemsError: (where, index) =>
    `${where}, камень #${index + 1}: нужен text или непустой items`,
  invalidPresetIdError: (id) => `Недопустимый id пресета: "${id}"`
}

const en: Messages = {
  loading: 'Loading...',
  dragOverlayTitle: 'Drag overlay',
  trialTooltip: 'This zone has a Labyrinth trial',
  hideRoute: 'Hide route',
  showRoute: 'Show route',
  runTimerTitle: 'Run timer (Ctrl+Alt+T)',
  gemSettingsTitle: 'Gem settings (Ctrl+Alt+G)',
  noNotesForZone: (zone) => `No notes for zone "${zone}"`,
  waitingForZone: 'Waiting to enter a zone...',
  expHint: (area, lvl) => `Zone lvl ${area} · character lvl ${lvl}`,
  hideLayout: 'Hide layout',
  showLayout: 'Show layout (Ctrl+Alt+L)',
  noGemsInZone: 'No gems in this zone',
  pickBuildHint: 'Pick a build in settings (⚙) for a gem plan',
  clickModeOn: 'click mode — Ctrl+Alt+I to release the mouse',
  clickModeOff: 'Ctrl+Alt+I — click · Ctrl+Alt+O — hide',
  actLabel: (n) => `Act ${n}`,

  timerIdle: 'ready',
  timerPaused: 'paused',
  timerFinished: 'finished',
  startSplitTitle: 'Start / Split (next act)',
  pauseResumeTitle: 'Pause / Resume',
  undoSplitTitle: 'Undo last split',
  finishRunTitle: 'Finish run',
  resetTimerTitle: 'Reset timer',

  runsTitle: 'Runs',
  refreshBtn: 'refresh',
  clearBtn: 'clear',
  confirmClearRuns: 'Delete all saved runs?',
  noRunsYet: 'No runs yet',
  actsWord: (n) => (n === 1 ? 'act' : 'acts'),
  deleteRunTitle: 'Delete run',

  searchGemPlaceholder: 'Search gem...',
  closeTitle: 'Close',
  supportBadge: 'support',
  levelAbbrev: (n) => `lvl ${n}`,
  nothingFound: 'Nothing found',

  generalTabTitle: 'General',
  confirmDiscardChanges: 'Unsaved changes will be lost. Continue?',
  presetsTitle: 'Presets',
  activePresetOn: 'Active in overlay — click to remove',
  activePresetOff: 'Show in overlay',
  deletePresetTitle: 'Delete preset',
  noPresetsYet: 'No presets yet',
  newPresetIdPlaceholder: 'new preset id',
  createBtn: '+ create',
  pickOrCreateHint: 'Pick a preset on the left or create a new one',
  presetNameTitle: 'Preset name',
  duplicateBtn: 'Duplicate',
  copySuffix: '(copy)',
  saveBtn: 'Save',
  savedBtn: 'Saved',
  removeZoneFromPresetTitle: 'Remove zone from preset',
  addEntryBtn: '+ entry',
  addZoneOption: '+ add zone...',
  runDistanceTitle: 'Run distance',
  rewardOption: 'Reward',
  buyOption: 'Buy',
  questPlaceholder: 'quest (e.g. Enemy at the Gate)',
  vendorPlaceholder: 'vendor (e.g. Nessa)',
  upTitle: 'Up',
  downTitle: 'Down',
  deleteEntryTitle: 'Delete entry',
  removeGemTitle: 'Remove gem',
  addGemBtn: '+ gem',
  legacyTextTitle: 'Free-form entry text (legacy format)',
  invalidPresetIdMsg: 'Preset id: latin letters/digits/hyphen/underscore only, no spaces',
  presetExistsMsg: (id) => `Preset "${id}" already exists`,
  confirmDeletePresetMsg: (id) => `Delete preset "${id}"? File gems/${id}.toml will be erased.`,
  languageTitle: 'Language',
  updateSectionTitle: 'Updates',
  checkUpdateBtn: 'Check for updates',
  checkingUpdate: 'Checking...',
  updateUpToDate: "You're up to date",
  updateCheckError: "Couldn't check for updates",
  updateAvailable: (version) => `Update v${version} available`,

  clientLogNotFound: 'Client.txt not found',
  clientLogNotFoundHint: 'Client.txt not found — set the path via the tray icon',
  noGemsPresetOption: '— no gems —',
  toggleOverlayMenuLabel: 'Show/hide overlay',
  hideRunTimerMenuLabel: (hk) => `Hide run timer (${hk})`,
  showRunTimerMenuLabel: (hk) => `Show run timer (${hk})`,
  clickModeMenuLabel: 'Click mode (interactive)',
  buildMenuLabel: 'Build (gems)',
  noPresetsMenuLabel: 'No presets — create gems/<build>.toml',
  chooseClientLogMenuLabel: 'Choose Client.txt...',
  chooseClientLogDialogTitle: 'Choose Client.txt',
  gemSettingsMenuLabel: 'Gem settings...',
  openGuidesFolderMenuLabel: 'Open guides folder',
  reloadGuidesMenuLabel: 'Reload guides',
  quitMenuLabel: 'Quit',
  settingsWindowTitle: 'Gem Settings — PoE Acts Overlay',

  buyPrefix: 'Buy',
  rewardPrefix: 'Reward',
  presetFileHeaderComment:
    '# Generated by the gem settings window — manual comments are lost on save.\n',
  guideDirNotFoundError: (dir) => `Guide folder not found: ${dir}`,
  stepMissingTextError: (where, index) => `${where}, step #${index + 1} missing text`,
  stepUnknownKindError: (where, text, kind) => `${where}, step "${text}": unknown kind "${kind}"`,
  actNumberInvalidError: (fileName) => `${fileName}: [act].number must be an integer >= 1`,
  zoneMissingNameError: (fileName, index) => `${fileName}: [[zone]] #${index + 1} missing name`,
  gemUnknownKindError: (where, index, kind) =>
    `${where}, gem #${index + 1}: unknown kind "${kind}"`,
  gemNeedsTextOrItemsError: (where, index) =>
    `${where}, gem #${index + 1}: needs text or non-empty items`,
  invalidPresetIdError: (id) => `Invalid preset id: "${id}"`
}

export const messages: Record<Language, Messages> = { ru, en }
