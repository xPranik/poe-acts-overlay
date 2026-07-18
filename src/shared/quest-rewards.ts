import type { CharClass } from './types'
import rawQuestRewards from './data/quest-rewards.json'

/**
 * Типизированный доступ к вендоренным наградам квестов (quest-rewards.json,
 * источник — exile-leveling, обновляется `npm run import-data`).
 * Используется в main (компиляция порций пресета) и в renderer (редактор).
 */

export interface QuestRewardGem {
  name: string
  /** классы, которым доступен гем; пустой массив = всем */
  classes: string[]
}

export interface QuestReward {
  /** id квеста (a1q5, ...) — ключ порций в пресете */
  id: string
  /** имя квеста (Mercy Mission, ...) */
  name: string
  act: number
  /** зона-триггер: войдя в неё, игрок приступает к квесту */
  zone: string
  /** NPC, выдающий награду */
  npc: string
  /** торговец, продающий гемы после квеста */
  vendorNpc: string
  /** гемы-награды за квест */
  rewards: QuestRewardGem[]
  /** гемы, появляющиеся у торговца после квеста */
  vendor: QuestRewardGem[]
}

/** Все квесты с гем-наградами, отсортированы по порядку прохождения. */
export const QUEST_REWARDS: QuestReward[] = rawQuestRewards as QuestReward[]

const byId = new Map<string, QuestReward>(QUEST_REWARDS.map((q) => [q.id, q]))

export function questRewardById(id: string): QuestReward | undefined {
  return byId.get(id)
}

/** Доступен ли гем `gem` классу `cls` (пустой список классов = всем). */
export function gemAvailableFor(gem: QuestRewardGem, cls: CharClass | undefined): boolean {
  return gem.classes.length === 0 || cls === undefined || gem.classes.includes(cls)
}
