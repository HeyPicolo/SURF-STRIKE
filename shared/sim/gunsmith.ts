// =============================================================
//  Gunsmith (rodada 12c): regras da tela ARSENAL sem DOM — opções de cada categoria (liberadas e
//  bloqueadas), equipar respeitando o limite de 5, comparação de atributos (atual × seleção) e o
//  resumo de cada arma na lista. A interface (client/src/ui/gunsmith.ts) só desenha isto.
// =============================================================
import { ATTACHMENTS, AttachSlot, MAX_ATTACHMENTS, WEAPON_ATTACHMENTS } from '../config/attachments';
import { ProgWeaponId, PROGRESSION } from '../config/progression';
import { WEAPONS } from '../config/weapons';
import { Build, effectiveDef, statBars, STAT_BARS, StatBar, describeAttachment, weaponSlots, sanitizeBuild } from './loadout';
import { levelInfo, nextUnlock, unlockedAt, LevelInfo, ProgressionData } from './progression';

export interface SlotOption {
  id: string;
  name: string;
  level: number;
  unlocked: boolean;
  equipped: boolean;
  pros: string[];
  cons: string[];
}

/** Opções de uma categoria para a arma no nível dado (ordem de liberação). */
export function slotOptions(w: ProgWeaponId, slot: AttachSlot, level: number, build: Build): SlotOption[] {
  return WEAPON_ATTACHMENTS[w].filter((a) => ATTACHMENTS[a.id].slot === slot).map((a) => {
    const d = describeAttachment(a.id, w);
    return { id: a.id, name: ATTACHMENTS[a.id].name, level: a.level, unlocked: a.level <= level, equipped: build[slot] === a.id, pros: d.pros, cons: d.cons };
  });
}

export const buildCount = (b: Build) => Object.values(b).filter(Boolean).length;

export type EquipResult =
  | { ok: true; build: Build }
  | { ok: false; reason: 'locked'; level: number }
  | { ok: false; reason: 'full'; equipped: AttachSlot[] }
  | { ok: false; reason: 'invalid' };

/**
 * Equipa `att` na categoria dele. Trocar a peça de uma categoria já ocupada sempre pode; uma
 * categoria nova com 5 peças pede para remover uma (reason 'full'). Peça bloqueada: 'locked'.
 */
export function equip(w: ProgWeaponId, build: Build, att: string, level: number): EquipResult {
  const a = ATTACHMENTS[att], entry = WEAPON_ATTACHMENTS[w].find((x) => x.id === att);
  if (!a || !entry) return { ok: false, reason: 'invalid' };
  if (entry.level > level) return { ok: false, reason: 'locked', level: entry.level };
  if (!build[a.slot] && buildCount(build) >= MAX_ATTACHMENTS) return { ok: false, reason: 'full', equipped: (Object.keys(build) as AttachSlot[]).filter((s) => build[s]) };
  return { ok: true, build: { ...build, [a.slot]: att } };
}

/** Remove a peça de uma categoria. */
export function unequip(build: Build, slot: AttachSlot): Build {
  const b = { ...build };
  delete b[slot];
  return b;
}

/** Troca uma peça: remove `removeSlot` e equipa `att` (resposta ao aviso de limite). */
export function swapEquip(w: ProgWeaponId, build: Build, removeSlot: AttachSlot, att: string, level: number): EquipResult {
  return equip(w, unequip(build, removeSlot), att, level);
}

export interface StatCompare { stat: StatBar; current: number; next: number; delta: number }

/** Barras de atributos: build atual × build com a seleção (delta > 0 = melhor). */
export function compareStats(w: ProgWeaponId, current: Build, next: Build): StatCompare[] {
  const a = statBars(effectiveDef(w, current)), b = statBars(effectiveDef(w, next));
  return STAT_BARS.map((stat) => ({ stat, current: a[stat], next: b[stat], delta: b[stat] - a[stat] }));
}

export interface WeaponSummary {
  id: ProgWeaponId;
  name: string;
  category: string;
  info: LevelInfo;
  unlocked: number;
  total: number;
  next: { level: number; name: string } | null;
  build: Build;
  slots: AttachSlot[];
}

/** Resumo de uma arma para a lista do Arsenal. */
export function weaponSummary(w: ProgWeaponId, d: ProgressionData): WeaponSummary {
  const info = levelInfo(w, d.xp[w]);
  const nx = nextUnlock(w, info.level);
  return {
    id: w, name: WEAPONS[w].name, category: WEAPONS[w].category, info,
    unlocked: unlockedAt(w, info.level).length, total: WEAPON_ATTACHMENTS[w].length,
    next: nx ? { level: nx.level, name: ATTACHMENTS[nx.id].name } : null,
    build: sanitizeBuild(w, d.builds[w], info.level), slots: weaponSlots(w),
  };
}

/** Fração da barra de XP até o próximo nível (1 no máximo). */
export const xpFrac = (i: LevelInfo) => (i.maxed ? 1 : i.intoLevel / i.needed);

export { PROGRESSION };
