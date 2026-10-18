// =============================================================
//  Spawns aleatórios de itens
//  Cada ponto do mapa mantém a sua posição, mas sorteia (a cada
//  round) um item do seu "pool". Pontos espelhados entre os times
//  compartilham o sorteio, então nenhum lado leva vantagem.
// =============================================================
import type { PickupKind } from '../maps/types';
import type { WeaponId } from './weapons';

export type PoolId = 'spawnGun' | 'spawnUtility' | 'midWeapon' | 'highWeapon' | 'utility' | 'defense';

export interface PoolEntry { kind: PickupKind; weapon?: WeaponId; weight: number; }

export const PICKUP_POOLS: Record<PoolId, PoolEntry[]> = {
  /** Plataforma de spawn: quase sempre uma arma leve (todos começam só com a faca). */
  spawnGun: [
    { kind: 'weapon', weapon: 'pistol', weight: 60 },
    { kind: 'weapon', weapon: 'smg', weight: 20 },
    { kind: 'weapon', weapon: 'shotgun', weight: 20 },
  ],
  spawnUtility: [
    { kind: 'nade_impulse', weight: 30 },
    { kind: 'medkit', weight: 25 },
    { kind: 'nade_smoke', weight: 15 },
    { kind: 'nade_he', weight: 15 },
    { kind: 'armor', weight: 15 },
  ],
  /** Áreas laterais do platô e flancos. */
  midWeapon: [
    { kind: 'weapon', weapon: 'smg', weight: 30 },
    { kind: 'weapon', weapon: 'shotgun', weight: 25 },
    { kind: 'weapon', weapon: 'pistol', weight: 25 },
    { kind: 'weapon', weapon: 'rifle', weight: 20 },
  ],
  /** Pontos disputados: as armas mais fortes. */
  highWeapon: [
    { kind: 'weapon', weapon: 'rifle', weight: 40 },
    { kind: 'weapon', weapon: 'sniper', weight: 25 },
    { kind: 'weapon', weapon: 'smg', weight: 20 },
    { kind: 'weapon', weapon: 'shotgun', weight: 15 },
  ],
  utility: [
    { kind: 'nade_he', weight: 22 },
    { kind: 'nade_smoke', weight: 14 },
    { kind: 'nade_impulse', weight: 18 },
    { kind: 'medkit', weight: 22 },
    { kind: 'ammo', weight: 14 },
    { kind: 'speed', weight: 10 },
  ],
  defense: [
    { kind: 'armor', weight: 50 },
    { kind: 'medkit', weight: 30 },
    { kind: 'shield', weight: 20 },
  ],
};

/** Sorteio ponderado com um gerador determinístico. */
export function rollPool(pool: PoolId, rng: () => number): PoolEntry {
  const list = PICKUP_POOLS[pool];
  const total = list.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of list) { r -= e.weight; if (r < 0) return e; }
  return list[list.length - 1];
}
