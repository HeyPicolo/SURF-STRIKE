// =============================================================
//  Progressão por arma (rodada 12, inspirada no Warzone): cada arma tem o próprio nível, ganho com
//  XP usando aquela arma; cada nível libera um attachment daquela arma (ver attachments.ts).
//  XP só nas partidas contra bots, com multiplicador por dificuldade.
// =============================================================
import type { WeaponId } from './weapons';
import type { BotDifficulty } from './match';

/** Armas com progressão nesta rodada (BALISONG, VOLT-1 e granadas ficam de fora). */
export const PROGRESSION_WEAPONS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'] as const;
export type ProgWeaponId = (typeof PROGRESSION_WEAPONS)[number];
export const isProgWeapon = (id: WeaponId): id is ProgWeaponId => (PROGRESSION_WEAPONS as readonly string[]).includes(id);

export const PROGRESSION = {
  /** fontes de XP da arma (antes do multiplicador de dificuldade) */
  xp: {
    kill: 100,
    headshot: 50,
    /** abate a longa distância: distância ≥ falloffHalf × longRangeFrac[arma] */
    longRange: 50,
    /** abate com o atirador no ar ou surfando */
    airKill: 75,
    /** por ponto de dano causado */
    perDamage: 0.5,
    assist: 40,
    /** multiabate: 2º abate e 3º em diante dentro da janela (s) */
    multikill2: 50,
    multikill3: 100,
    multikillWindow: 4,
    /** vitórias: rateadas pelas armas usadas no round (pelo dano de cada uma) */
    roundWin: 100,
    matchWin: 300,
    duelWin: 150,
  },
  longRangeFrac: { pistol: 0.6, rifle: 0.45, smg: 0.8, shotgun: 1.3, sniper: 0.1 } as Record<ProgWeaponId, number>,
  difficultyMul: { easy: 0.75, medium: 1, hard: 1.25, god: 1.6 } as Record<BotDifficulty, number>,
  /** nível máximo por arma */
  maxLevel: { pistol: 20, rifle: 30, smg: 30, shotgun: 30, sniper: 30 } as Record<ProgWeaponId, number>,
  /**
   * XP para subir do nível n−1 para o n: levelBase + levelStep × (n − 2).
   * Total até o 30: 29×500 + 60×406 = 38.860 XP; pistola até o 20: 19.760 XP.
   * Medido (scripts/xp-sim.ts, 3v3 contra bots medium, ~6 min/partida): jogador ≈ bot hard faz ~2.980
   * XP/partida → ~13 partidas até o máximo usando só a arma (≈ medium ~15, ≈ god ~12).
   */
  levelBase: 500,
  levelStep: 60,
  /** opcional: nível de conta (soma do XP de todas as armas) */
  account: { enabled: false, xpPerLevel: 12000 },
  /** opcional: tokens de XP em dobro */
  doubleXp: { enabled: false, multiplier: 2, minutes: 30 },
} as const;

/** Duelos 1v1 (a mesma arma sorteada para os dois): 'base' = arma sem attachments para os dois (justo); 'own' = build de cada um. */
export const DUEL_BUILDS: 'base' | 'own' = 'base';
