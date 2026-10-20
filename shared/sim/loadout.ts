// =============================================================
//  Builds de arma (rodada 12): WeaponDef efetivo = base + attachments, validação do build,
//  teto de poder e textos de prós/contras. Funções puras (sem DOM): combate, HUD e bots usam o efetivo.
// =============================================================
import { WEAPONS, WeaponDef, WeaponId, AdsDef, DAMAGE } from '../config/weapons';
import { ATTACHMENTS, ATTACH_SLOTS, AttachSlot, AttachmentDef, AttachFx, MAX_ATTACHMENTS, POWER_CAP, StatKey, WEAPON_ATTACHMENTS, SLOT_LABEL } from '../config/attachments';
import { isProgWeapon } from '../config/progression';

/** Build: um attachment (id) por categoria. */
export type Build = Partial<Record<AttachSlot, string>>;
export type Builds = Partial<Record<WeaponId, Build>>;

/** WeaponDef efetivo, com os efeitos que não são números. */
export interface EffectiveDef extends WeaponDef { fx: AttachFx; build: Build }

const STATS: StatKey[] = ['damage', 'falloffHalf', 'range', 'rpm', 'mag', 'reserve', 'reloadTime', 'spread', 'airSpread', 'moveSpread', 'kick', 'kickSide', 'recover', 'moveSpeedMul', 'zoom', 'zoomSpread'];
const ADS_KEYS: (keyof AdsDef)[] = ['fov', 'time', 'sens', 'moveMul', 'spreadMul'];

/** Attachments disponíveis para uma arma (com o nível de liberação). */
export function weaponAttachments(id: WeaponId) { return isProgWeapon(id) ? WEAPON_ATTACHMENTS[id] : []; }
/** Categorias que a arma tem. */
export function weaponSlots(id: WeaponId): AttachSlot[] {
  const list = weaponAttachments(id);
  return ATTACH_SLOTS.filter((s) => list.some((a) => ATTACHMENTS[a.id].slot === s));
}
export function attachmentLevel(id: WeaponId, att: string): number | null {
  return weaponAttachments(id).find((a) => a.id === att)?.level ?? null;
}

export interface BuildCheck { ok: boolean; errors: string[] }

/** O build é válido para a arma (peças da arma, na categoria certa, até o limite e liberadas no nível)? */
export function validateBuild(id: WeaponId, build: Build, level = Infinity): BuildCheck {
  const errors: string[] = [];
  const entries = Object.entries(build).filter(([, v]) => !!v) as [AttachSlot, string][];
  if (entries.length > MAX_ATTACHMENTS) errors.push(`mais de ${MAX_ATTACHMENTS} attachments`);
  for (const [slot, att] of entries) {
    const a = ATTACHMENTS[att];
    const lv = attachmentLevel(id, att);
    if (!a || lv === null) errors.push(`${att} não existe para ${id}`);
    else if (a.slot !== slot) errors.push(`${att} não é da categoria ${slot}`);
    else if (lv > level) errors.push(`${att} libera no nível ${lv}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Remove do build o que não vale (peças inexistentes, bloqueadas ou acima do limite). */
export function sanitizeBuild(id: WeaponId, build: Build | undefined, level = Infinity): Build {
  const out: Build = {};
  let n = 0;
  for (const slot of ATTACH_SLOTS) {
    const att = build?.[slot];
    if (!att || n >= MAX_ATTACHMENTS) continue;
    const a = ATTACHMENTS[att], lv = attachmentLevel(id, att);
    if (a && a.slot === slot && lv !== null && lv <= level) { out[slot] = att; n++; }
  }
  return out;
}

const cache = new Map<string, EffectiveDef>();
export const buildKey = (id: WeaponId, build?: Build) => id + ':' + ATTACH_SLOTS.map((s) => build?.[s] ?? '').join(',');

/** Tempo para eliminar (s): 150 de vida, tiros no corpo, sem colete. */
export function ttkBody(def: WeaponDef): number {
  const mul = def.melee || def.starter ? 1 : DAMAGE.gunMul;
  const perShot = def.damage * mul * def.pellets;
  return (Math.ceil(150 / perShot) - 1) * (60 / def.rpm);
}

/** WeaponDef efetivo da arma com o build (com cache por arma + build). Sem build = a base. */
export function effectiveDef(id: WeaponId, build?: Build): EffectiveDef {
  const key = buildKey(id, build);
  const hit = cache.get(key);
  if (hit) return hit;
  const base = WEAPONS[id];
  const def: EffectiveDef = { ...base, ads: base.ads ? { ...base.ads } : undefined, fx: {}, build: { ...(build ?? {}) } };
  const atts = ATTACH_SLOTS.map((s) => build?.[s]).filter((a): a is string => !!a && !!ATTACHMENTS[a]).map((a) => ATTACHMENTS[a]);
  for (const a of atts) applyAttachment(def, a);
  // teto de poder
  const [lo, hi] = POWER_CAP.default;
  for (const k of STATS) {
    const b = base[k as keyof WeaponDef] as number | undefined, v = def[k as keyof WeaponDef] as number | undefined;
    if (typeof b !== 'number' || typeof v !== 'number' || b === 0) continue;
    (def as unknown as Record<string, number>)[k] = Math.min(b * hi, Math.max(b * lo, v));
  }
  if (base.ads && def.ads) for (const k of ADS_KEYS) {
    if (POWER_CAP.exempt.includes('ads.' + k)) continue;
    def.ads[k] = Math.min(base.ads[k] * hi, Math.max(base.ads[k] * lo, def.ads[k]));
  }
  // números inteiros
  if (base.mag > 0) def.mag = Math.max(1, Math.round(def.mag));
  def.reserve = Math.round(def.reserve);
  // TTK mínimo
  const ttk0 = ttkBody(base);
  const ttk1 = ttkBody(def);
  if (ttk0 > 0 && ttk1 < ttk0 * POWER_CAP.ttkMinFrac) def.rpm *= ttk1 / (ttk0 * POWER_CAP.ttkMinFrac);
  cache.set(key, def);
  return def;
}

/** Arma sem ADS: tempo de ADS ×t vira mobilidade ×(1 − (t − 1)/2). */
const noAdsMobility = (t: number) => 1 - (t - 1) * 0.5;

function applyAttachment(def: EffectiveDef, a: AttachmentDef) {
  const d = def as unknown as Record<string, number>;
  for (const [k, m] of Object.entries(a.mul ?? {})) if (typeof d[k] === 'number') d[k] *= m as number;
  if (def.ads) {
    for (const [k, v] of Object.entries(a.adsSet ?? {})) def.ads[k as keyof AdsDef] = v as number;
    for (const [k, m] of Object.entries(a.ads ?? {})) def.ads[k as keyof AdsDef] *= m as number;
  }
  // arma sem ADS (LONGBOW, luneta instantânea): o peso no manuseio vira mobilidade (metade do efeito)
  else if (a.ads?.time) d.moveSpeedMul *= noAdsMobility(a.ads.time);
  Object.assign(def.fx, a.fx ?? {});
}

/** Atributos de comparação do gunsmith (0..100, maior = melhor). */
export const STAT_BARS = ['Precisão', 'Dano', 'Alcance', 'Cadência', 'Mobilidade', 'Controle', 'Velocidade de ADS', 'Recarga'] as const;
export type StatBar = (typeof STAT_BARS)[number];

export function statBars(def: WeaponDef): Record<StatBar, number> {
  const c = (v: number) => Math.max(0, Math.min(100, v));
  const adsTime = def.ads?.time ?? 0.25;
  return {
    'Precisão': c(100 - (def.spread * 18 + def.moveSpread * 25 + def.airSpread * 12)),
    'Dano': c(def.damage * def.pellets * 0.9),
    'Alcance': c(Math.log10(def.falloffHalf) * 25 - 50),
    'Cadência': c(def.rpm / 9),
    'Mobilidade': c((def.moveSpeedMul - 0.7) * 220),
    'Controle': c(100 - def.kick * 18 - def.kickSide * 30 + def.recover * 2),
    'Velocidade de ADS': c(100 - adsTime * 260),
    'Recarga': c(100 - def.reloadTime * 25),
  };
}

const LABEL: Partial<Record<StatKey | `ads.${keyof AdsDef}`, [string, 1 | -1]>> = {
  damage: ['dano', 1], falloffHalf: ['alcance efetivo', 1], range: ['alcance máximo', 1], rpm: ['cadência', 1],
  mag: ['pente', 1], reserve: ['munição reserva', 1], reloadTime: ['velocidade de recarga', -1],
  spread: ['precisão do quadril', -1], airSpread: ['precisão no ar', -1], moveSpread: ['precisão andando', -1],
  kick: ['controle do recuo vertical', -1], kickSide: ['controle do recuo lateral', -1], recover: ['recuperação do recuo', 1],
  moveSpeedMul: ['mobilidade', 1], zoom: ['campo de visão na luneta', 1], zoomSpread: ['precisão na luneta', -1],
  'ads.time': ['velocidade de ADS', -1], 'ads.spreadMul': ['precisão mirando', -1], 'ads.moveMul': ['mobilidade mirando', 1], 'ads.fov': ['campo de visão mirando', 1],
};

/** Prós e contras em texto, gerados dos modificadores (+ notas da peça). Com `weapon`, só o que vale nela. */
export function describeAttachment(id: string, weapon?: WeaponId): { pros: string[]; cons: string[] } {
  const a = ATTACHMENTS[id];
  const pros: string[] = [...(a.notes?.pro ?? [])], cons: string[] = [...(a.notes?.con ?? [])];
  const add = (key: string, m: number) => {
    const l = LABEL[key as keyof typeof LABEL];
    if (!l || Math.abs(m - 1) < 1e-6) return;
    const pct = Math.round(Math.abs(m - 1) * 100);
    const good = (m > 1 ? 1 : -1) * l[1] > 0;
    (good ? pros : cons).push(`${good ? '+' : '−'}${pct}% ${l[0]}`);
  };
  const noAds = !!weapon && !WEAPONS[weapon].ads;
  const mul: Record<string, number> = { ...(a.mul ?? {}) } as Record<string, number>;
  if (noAds && a.ads?.time) mul.moveSpeedMul = (mul.moveSpeedMul ?? 1) * noAdsMobility(a.ads.time);
  for (const [k, m] of Object.entries(mul)) add(k, m);
  if (!noAds) for (const [k, m] of Object.entries(a.ads ?? {})) add('ads.' + k, m as number);
  return { pros, cons };
}

export const slotLabel = (s: AttachSlot) => SLOT_LABEL[s];
export const attachmentName = (id: string) => ATTACHMENTS[id]?.name ?? id;
