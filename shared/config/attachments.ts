// =============================================================
//  Attachments (rodada 12): categorias, peças, modificadores, nível de liberação por arma e teto de poder.
//  Toda peça é uma troca (prós e contras). Os modificadores são multiplicadores sobre os atributos
//  que já existem em WeaponDef/AdsDef ("set" = valor absoluto, usado pelas miras com ampliação).
//  O WeaponDef efetivo (base + build) é calculado em shared/sim/loadout.ts.
// =============================================================
import type { AdsDef } from './weapons';
import { PROGRESSION, ProgWeaponId } from './progression';

export type AttachSlot = 'muzzle' | 'barrel' | 'laser' | 'optic' | 'stock' | 'underbarrel' | 'magazine' | 'rearGrip';
export const ATTACH_SLOTS: AttachSlot[] = ['muzzle', 'barrel', 'laser', 'optic', 'stock', 'underbarrel', 'magazine', 'rearGrip'];
export const SLOT_LABEL: Record<AttachSlot, string> = {
  muzzle: 'Boca', barrel: 'Cano', laser: 'Laser', optic: 'Mira', stock: 'Coronha',
  underbarrel: 'Empunhadura frontal', magazine: 'Carregador', rearGrip: 'Empunhadura traseira',
};

/** Máximo de attachments equipados ao mesmo tempo (um por categoria). */
export const MAX_ATTACHMENTS = 5;

export type StatKey = 'damage' | 'falloffHalf' | 'range' | 'rpm' | 'mag' | 'reserve' | 'reloadTime' | 'spread' | 'airSpread' | 'moveSpread' | 'kick' | 'kickSide' | 'recover' | 'moveSpeedMul' | 'zoom' | 'zoomSpread';
export type AdsKey = keyof AdsDef;
export type OpticKind = 'reddot' | 'holo' | 'x2' | 'x3' | 'scopeVar' | 'scopeHigh' | 'thermal';

/** Efeitos que não são números da arma (o cliente desenha; o sim usa supressor/laser). */
export interface AttachFx {
  /** sem tracer/clarão visível de longe e tiro ouvido mais perto pelos outros */
  suppressed?: boolean;
  /** feixe fino visível para os outros (desvantagem de posição) */
  laser?: boolean;
  optic?: OpticKind;
  /** a peça tira a coronha padrão sem pôr outra */
  noStock?: boolean;
}

export interface AttachmentDef {
  id: string;
  slot: AttachSlot;
  name: string;
  /** multiplicadores dos atributos da arma */
  mul?: Partial<Record<StatKey, number>>;
  /** multiplicadores do ADS */
  ads?: Partial<Record<AdsKey, number>>;
  /** valores absolutos do ADS (miras com ampliação) */
  adsSet?: Partial<Record<AdsKey, number>>;
  fx?: AttachFx;
  /** prós/contras que não aparecem nos números (o resto é gerado dos modificadores) */
  notes?: { pro?: string[]; con?: string[] };
}

/** Catálogo genérico (nomes originais). Cada arma escolhe quais usa e em que nível. */
export const ATTACHMENTS: Record<string, AttachmentDef> = {
  // BOCA
  comp: { id: 'comp', slot: 'muzzle', name: 'Compensador', mul: { kick: 0.82, kickSide: 1.12 } },
  brake: { id: 'brake', slot: 'muzzle', name: 'Freio de boca', mul: { kickSide: 0.78, recover: 1.1, kick: 1.06 }, ads: { time: 1.05 } },
  supp: { id: 'supp', slot: 'muzzle', name: 'Supressor', mul: { falloffHalf: 0.9, range: 0.95 }, ads: { time: 1.08 }, fx: { suppressed: true }, notes: { pro: ['Sem tracer e sem clarão de longe', 'Tiro ouvido mais perto pelos outros'] } },
  // CANO
  short: { id: 'short', slot: 'barrel', name: 'Cano curto', mul: { moveSpeedMul: 1.04, falloffHalf: 0.82, range: 0.9, spread: 1.12 }, ads: { time: 0.88 } },
  long: { id: 'long', slot: 'barrel', name: 'Cano longo', mul: { falloffHalf: 1.2, range: 1.1, spread: 0.9, moveSpeedMul: 0.95 }, ads: { time: 1.12 } },
  heavy: { id: 'heavy', slot: 'barrel', name: 'Cano reforçado', mul: { falloffHalf: 1.12, kick: 0.92, moveSpeedMul: 0.94 }, ads: { time: 1.1 } },
  // LASER
  laserTac: { id: 'laserTac', slot: 'laser', name: 'Laser tático', mul: { spread: 0.82, moveSpread: 0.85, airSpread: 0.9 }, fx: { laser: true }, notes: { con: ['Feixe visível para os inimigos'] } },
  laserIr: { id: 'laserIr', slot: 'laser', name: 'Laser infravermelho', mul: { spread: 0.86, moveSpeedMul: 0.98 }, fx: { laser: true }, notes: { con: ['Feixe visível para os inimigos'] } },
  laserFast: { id: 'laserFast', slot: 'laser', name: 'Laser de mira rápida', ads: { time: 0.84, spreadMul: 1.05 }, fx: { laser: true }, notes: { con: ['Feixe visível para os inimigos'] } },
  // MIRA (ADS)
  reddot: { id: 'reddot', slot: 'optic', name: 'Mira de ponto', ads: { time: 1.04, spreadMul: 0.95 }, fx: { optic: 'reddot' }, notes: { pro: ['Visada limpa com ponto luminoso'] } },
  holo: { id: 'holo', slot: 'optic', name: 'Mira holográfica', ads: { time: 1.06, spreadMul: 0.93, fov: 0.97 }, fx: { optic: 'holo' }, notes: { pro: ['Retícula com anel, boa para alvos em movimento'] } },
  x2: { id: 'x2', slot: 'optic', name: 'Luneta 2x', adsSet: { fov: 0.5, sens: 0.55 }, ads: { time: 1.2, moveMul: 0.92 }, fx: { optic: 'x2' }, notes: { pro: ['Ampliação 2x'] } },
  x3: { id: 'x3', slot: 'optic', name: 'Luneta 3x', adsSet: { fov: 0.36, sens: 0.42 }, ads: { time: 1.3, moveMul: 0.88 }, fx: { optic: 'x3' }, notes: { pro: ['Ampliação 3x'] } },
  // MIRA (LONGBOW: lunetas)
  scopeVar: { id: 'scopeVar', slot: 'optic', name: 'Luneta variável', mul: { zoom: 1.25, zoomSpread: 1.15 }, fx: { optic: 'scopeVar' }, notes: { pro: ['Campo de visão mais aberto na luneta'] } },
  scopeHigh: { id: 'scopeHigh', slot: 'optic', name: 'Luneta de alta ampliação', mul: { zoom: 0.78, moveSpeedMul: 0.97 }, fx: { optic: 'scopeHigh' }, notes: { pro: ['Mais ampliação'], con: ['Campo de visão estreito'] } },
  thermal: { id: 'thermal', slot: 'optic', name: 'Mira térmica', mul: { zoom: 1.08, zoomSpread: 1.1, moveSpeedMul: 0.96 }, fx: { optic: 'thermal' }, notes: { pro: ['Inimigos destacados em calor na luneta'] } },
  // CORONHA
  stockLight: { id: 'stockLight', slot: 'stock', name: 'Coronha leve', mul: { moveSpeedMul: 1.04, kick: 1.1, recover: 0.9 }, ads: { time: 0.9 } },
  stockHeavy: { id: 'stockHeavy', slot: 'stock', name: 'Coronha pesada', mul: { kick: 0.88, recover: 1.12, moveSpeedMul: 0.95 }, ads: { time: 1.08 } },
  stockNone: { id: 'stockNone', slot: 'stock', name: 'Sem coronha', mul: { moveSpeedMul: 1.06, kick: 1.18, kickSide: 1.15, spread: 1.12 }, ads: { time: 0.82 }, fx: { noStock: true } },
  // EMPUNHADURA FRONTAL
  gripVert: { id: 'gripVert', slot: 'underbarrel', name: 'Empunhadura vertical', mul: { kick: 0.88 }, ads: { time: 1.06 } },
  gripAngled: { id: 'gripAngled', slot: 'underbarrel', name: 'Empunhadura angulada', mul: { kickSide: 0.9, kick: 1.04 }, ads: { time: 0.92 } },
  bipod: { id: 'bipod', slot: 'underbarrel', name: 'Bipé', mul: { kick: 0.85, kickSide: 0.85, moveSpeedMul: 0.94 }, ads: { time: 1.12 } },
  // CARREGADOR
  magExt: { id: 'magExt', slot: 'magazine', name: 'Carregador estendido', mul: { mag: 1.17, reserve: 1.17, reloadTime: 1.12 }, ads: { time: 1.06 } },
  magFast: { id: 'magFast', slot: 'magazine', name: 'Carregador rápido', mul: { reloadTime: 0.8, mag: 0.88 } },
  magDrum: { id: 'magDrum', slot: 'magazine', name: 'Tambor', mul: { mag: 1.25, reserve: 1.25, reloadTime: 1.25, moveSpeedMul: 0.95 }, ads: { time: 1.12 } },
  // EMPUNHADURA TRASEIRA
  tape: { id: 'tape', slot: 'rearGrip', name: 'Fita de empunhadura', mul: { kick: 1.04 }, ads: { time: 0.94 } },
  rubber: { id: 'rubber', slot: 'rearGrip', name: 'Empunhadura de borracha', mul: { kick: 0.94, kickSide: 0.94 }, ads: { time: 1.05 } },
};

/** Ordem de liberação de cada arma (o nível sai distribuído entre 2 e o nível máximo). */
const UNLOCK_ORDER: Record<ProgWeaponId, string[]> = {
  pistol: ['laserTac', 'comp', 'magExt', 'tape', 'short', 'reddot', 'supp', 'magFast', 'rubber', 'long', 'laserFast', 'holo', 'magDrum'],
  rifle: ['comp', 'gripVert', 'magExt', 'reddot', 'tape', 'stockLight', 'laserTac', 'short', 'supp', 'holo', 'gripAngled', 'magFast', 'rubber', 'long', 'brake', 'x2', 'stockHeavy', 'laserFast', 'heavy', 'bipod', 'magDrum', 'x3'],
  smg: ['laserTac', 'comp', 'magExt', 'stockLight', 'reddot', 'tape', 'gripAngled', 'short', 'supp', 'stockNone', 'magFast', 'holo', 'gripVert', 'rubber', 'long', 'laserFast', 'stockHeavy', 'magDrum'],
  shotgun: ['laserTac', 'magExt', 'short', 'stockLight', 'reddot', 'tape', 'gripVert', 'brake', 'supp', 'stockNone', 'magFast', 'holo', 'gripAngled', 'rubber', 'long', 'laserFast', 'stockHeavy'],
  sniper: ['brake', 'tape', 'magExt', 'scopeVar', 'stockLight', 'bipod', 'laserTac', 'short', 'supp', 'magFast', 'rubber', 'stockHeavy', 'thermal', 'long', 'gripVert', 'laserIr', 'heavy', 'scopeHigh'],
};

export interface WeaponAttachment { id: string; level: number }

/** Attachments de cada arma com o nível de liberação (primeiro nível 2, último = nível máximo). */
export const WEAPON_ATTACHMENTS: Record<ProgWeaponId, WeaponAttachment[]> = Object.fromEntries(
  (Object.keys(UNLOCK_ORDER) as ProgWeaponId[]).map((w) => {
    const list = UNLOCK_ORDER[w], max = PROGRESSION.maxLevel[w];
    return [w, list.map((id, i) => ({ id, level: 2 + Math.round((i * (max - 2)) / (list.length - 1)) }))];
  }),
) as Record<ProgWeaponId, WeaponAttachment[]>;

/**
 * Teto de poder: nenhum atributo do WeaponDef efetivo sai de [min, max] × base (padrão ±25%).
 * Exceções: o FOV/sensibilidade do ADS com miras de ampliação (valores absolutos das lunetas).
 * TTK mínimo: o tempo para eliminar (150 de vida, corpo) não cai abaixo de ttkMinFrac × base.
 */
export const POWER_CAP = {
  default: [0.75, 1.25] as [number, number],
  exempt: ['ads.fov', 'ads.sens'] as string[],
  ttkMinFrac: 0.95,
};
