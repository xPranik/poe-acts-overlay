/**
 * Штраф опыта за разницу уровней персонажа и зоны (формула с poewiki).
 * Правило эффективного уровня зоны для 71+ не учитываем — в актах не встречается.
 */

/** Допустимая разница уровней без штрафа. */
export function safeZone(playerLevel: number): number {
  return 3 + Math.floor(playerLevel / 16)
}

/** Множитель получаемого опыта, 0..1. */
export function expMultiplier(playerLevel: number, areaLevel: number): number {
  const eff = Math.max(Math.abs(playerLevel - areaLevel) - safeZone(playerLevel), 0)
  return Math.pow((playerLevel + 5) / (playerLevel + 5 + Math.pow(eff, 2.5)), 1.5)
}

/** Диапазон уровней зоны, дающих персонажу 100% опыта. */
export function fullExpRange(playerLevel: number): { min: number; max: number } {
  const sz = safeZone(playerLevel)
  return { min: Math.max(1, playerLevel - sz), max: playerLevel + sz }
}
