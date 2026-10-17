// Cálculos de dano puros (testáveis) + modelo de spread/recuo.
import { WEAPONS, WeaponDef, ITEMS, falloff } from '../config/weapons';
import { CLASSES } from '../config/classes';

export interface DamageContext {
  base: number;           // dano bruto (por projétil, já com falloff)
  head: boolean;
  explosion: boolean;
  attackerFury: boolean;  // berserker em fúria
  attackerHp: number;
  victimTired: boolean;   // jumper cansado
  victimArmor: number;
  victimShield: number;
}

export interface DamageResult { hpDamage: number; armorDamage: number; shieldDamage: number; total: number; }

/** Bônus de dano da Fúria: linear com a vida perdida (até +maxBonus em 0 HP). */
export function furyMultiplier(hp: number): number {
  const missing = Math.max(0, Math.min(100, 100 - hp)) / 100;
  return 1 + CLASSES.berserker.params.maxBonus * missing;
}

export function computeDamage(c: DamageContext): DamageResult {
  let dmg = c.base;
  if (c.attackerFury) dmg *= furyMultiplier(c.attackerHp);
  if (c.victimTired) dmg *= 1 - (c.head ? CLASSES.jumper.params.headReduction : CLASSES.jumper.params.bodyReduction);
  const total = dmg;
  // escudo temporário absorve primeiro, 100%
  const shieldDamage = Math.min(c.victimShield, dmg);
  dmg -= shieldDamage;
  // colete protege o corpo (e explosões), não a cabeça
  let armorDamage = 0;
  if (!c.head && c.victimArmor > 0 && dmg > 0) {
    armorDamage = Math.min(c.victimArmor, dmg * ITEMS.armorAbsorb);
    dmg -= armorDamage;
  }
  return { hpDamage: dmg, armorDamage, shieldDamage, total };
}

/** Dano de um projétil da arma `def` à distância `dist`. */
export function weaponHitDamage(def: WeaponDef, dist: number, head: boolean): number {
  return def.damage * falloff(def, dist) * (head ? def.headMult : 1);
}

export interface SpreadState { onGround: boolean; hSpeed: number; ducked: boolean; zoomed: boolean; }

/** Spread (graus). Baixo no ar de propósito: o surf depende de mira, não de sorte. */
export function computeSpread(def: WeaponDef, s: SpreadState): number {
  let spread = s.zoomed && def.zoomSpread !== undefined ? def.zoomSpread : def.spread;
  if (!s.onGround) spread += def.airSpread;
  else if (s.hSpeed > 130) spread += def.moveSpread * Math.min(1, s.hSpeed / 250);
  if (s.ducked && s.onGround) spread *= 0.8;
  return spread;
}

export function fireInterval(def: WeaponDef, fireRateMul = 1): number {
  return 60 / (def.rpm * fireRateMul);
}

export const ALL_WEAPONS = WEAPONS;
