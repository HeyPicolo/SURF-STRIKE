// =============================================================
//  Progressão por arma (rodada 12): níveis, desbloqueios, XP por evento da partida, dados salvos
//  (com versão de schema e migração) e a interface ProgressionStore (localStorage hoje; backend no
//  multiplayer depois). Tudo puro, sem DOM.
// =============================================================
import type { WeaponId } from '../config/weapons';
import { WEAPONS } from '../config/weapons';
import type { BotDifficulty } from '../config/match';
import { PROGRESSION, PROGRESSION_WEAPONS, ProgWeaponId, isProgWeapon } from '../config/progression';
import { ATTACHMENTS, MAX_ATTACHMENTS, WEAPON_ATTACHMENTS } from '../config/attachments';
import { Build, Builds, sanitizeBuild } from './loadout';
import type { SimEvent, World } from './world';

// ------------------------------------------------------------------ curva de níveis

/** XP para subir do nível n−1 para o n (n ≥ 2). */
export function xpToReach(n: number): number { return PROGRESSION.levelBase + PROGRESSION.levelStep * (n - 2); }

/** XP total acumulado para chegar ao nível `level`. */
export function totalXpForLevel(level: number): number {
  let t = 0;
  for (let n = 2; n <= level; n++) t += xpToReach(n);
  return t;
}

export interface LevelInfo { level: number; max: number; xp: number; intoLevel: number; needed: number; maxed: boolean }

export function levelInfo(id: ProgWeaponId, xp: number): LevelInfo {
  const max = PROGRESSION.maxLevel[id];
  let level = 1, rest = Math.max(0, xp);
  while (level < max && rest >= xpToReach(level + 1)) { rest -= xpToReach(level + 1); level++; }
  const maxed = level >= max;
  return { level, max, xp, intoLevel: maxed ? 0 : rest, needed: maxed ? 0 : xpToReach(level + 1), maxed };
}

/** Attachments liberados até o nível (em ordem de liberação). */
export function unlockedAt(id: ProgWeaponId, level: number): string[] {
  return WEAPON_ATTACHMENTS[id].filter((a) => a.level <= level).map((a) => a.id);
}
/** Próximo desbloqueio depois do nível atual. */
export function nextUnlock(id: ProgWeaponId, level: number): { id: string; level: number } | null {
  return WEAPON_ATTACHMENTS[id].find((a) => a.level > level) ?? null;
}

/** Nível de conta opcional (config PROGRESSION.account): soma do XP de todas as armas. null se desligado. */
export function accountLevel(xp: Record<ProgWeaponId, number>): number | null {
  if (!PROGRESSION.account.enabled) return null;
  const sum = PROGRESSION_WEAPONS.reduce((s, w) => s + (xp[w] ?? 0), 0);
  return 1 + Math.floor(sum / PROGRESSION.account.xpPerLevel);
}

// ------------------------------------------------------------------ dados salvos

export const PROGRESSION_SCHEMA = 2;

export interface ProgressionData {
  schema: number;
  /** XP acumulado por arma */
  xp: Record<ProgWeaponId, number>;
  /** build salvo do jogador por arma */
  builds: Record<ProgWeaponId, Build>;
  /** nome do build (editável no Arsenal) */
  buildNames: Partial<Record<ProgWeaponId, string>>;
  /** opcional (config): tokens de XP em dobro restantes (s) */
  doubleXpLeft?: number;
}

export function emptyProgression(): ProgressionData {
  const xp = {} as Record<ProgWeaponId, number>, builds = {} as Record<ProgWeaponId, Build>;
  for (const w of PROGRESSION_WEAPONS) { xp[w] = 0; builds[w] = {}; }
  return { schema: PROGRESSION_SCHEMA, xp, builds, buildNames: {} };
}

/**
 * Lê dados de qualquer versão: schema 1 (protótipo: { version: 1, weapons: { id: { xp, level } } }),
 * schema 2 (atual) ou lixo (volta ao vazio). Builds inválidos são limpos (peças bloqueadas saem).
 */
export function migrateProgression(raw: unknown): ProgressionData {
  const out = emptyProgression();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.schema === undefined && r.version === 1 && r.weapons && typeof r.weapons === 'object') {
    for (const [id, v] of Object.entries(r.weapons as Record<string, { xp?: number }>)) if (isProgWeapon(id as WeaponId) && typeof v?.xp === 'number') out.xp[id as ProgWeaponId] = Math.max(0, v.xp);
    return out;
  }
  if (r.schema === PROGRESSION_SCHEMA) {
    const xp = (r.xp ?? {}) as Record<string, number>, builds = (r.builds ?? {}) as Record<string, Build>;
    for (const w of PROGRESSION_WEAPONS) {
      out.xp[w] = typeof xp[w] === 'number' && isFinite(xp[w]) ? Math.max(0, xp[w]) : 0;
      out.builds[w] = sanitizeBuild(w, builds[w], levelInfo(w, out.xp[w]).level);
    }
    if (r.buildNames && typeof r.buildNames === 'object') out.buildNames = { ...(r.buildNames as Record<string, string>) };
    if (typeof r.doubleXpLeft === 'number') out.doubleXpLeft = r.doubleXpLeft;
  }
  return out;
}

/** Onde a progressão fica guardada (localStorage hoje; um backend no multiplayer). */
export interface ProgressionStore {
  load(): ProgressionData;
  save(data: ProgressionData): void;
  reset(): void;
}

/** Store em memória (testes e quando o navegador não deixa salvar). */
export class MemoryProgressionStore implements ProgressionStore {
  private raw: string | null = null;
  load() { return migrateProgression(this.raw ? JSON.parse(this.raw) : null); }
  save(d: ProgressionData) { this.raw = JSON.stringify(d); }
  reset() { this.raw = null; }
  /** grava um valor bruto qualquer (testes de migração) */
  setRaw(v: unknown) { this.raw = JSON.stringify(v); }
}

/** Builds do jogador para entrar numa partida (só peças liberadas). */
export function playerBuilds(d: ProgressionData): Builds {
  const out: Builds = {};
  for (const w of PROGRESSION_WEAPONS) out[w] = sanitizeBuild(w, d.builds[w], levelInfo(w, d.xp[w]).level);
  return out;
}

// ------------------------------------------------------------------ modo de desenvolvimento

export const devXp = {
  grant(d: ProgressionData, id: ProgWeaponId, amount: number): ProgressionData { return { ...d, xp: { ...d.xp, [id]: Math.max(0, d.xp[id] + amount) } }; },
  unlockAll(d: ProgressionData): ProgressionData {
    const xp = { ...d.xp };
    for (const w of PROGRESSION_WEAPONS) xp[w] = Math.max(xp[w], totalXpForLevel(PROGRESSION.maxLevel[w]));
    return { ...d, xp };
  },
  reset(): ProgressionData { return emptyProgression(); },
};

// ------------------------------------------------------------------ builds dos bots

/** Nível e quantidade de attachments dos bots por dificuldade. */
export const BOT_BUILD = {
  easy: { levelFrac: 0.1, count: [0, 1] },
  medium: { levelFrac: 0.4, count: [1, 3] },
  hard: { levelFrac: 0.7, count: [3, 4] },
  god: { levelFrac: 1, count: [5, 5] },
} as Record<BotDifficulty, { levelFrac: number; count: [number, number] }>;

/** Builds de um bot, sorteados de forma determinística pelo PRNG (seed da partida). */
export function botBuilds(difficulty: BotDifficulty, rand: () => number): Builds {
  const cfg = BOT_BUILD[difficulty], out: Builds = {};
  for (const w of PROGRESSION_WEAPONS) {
    const level = Math.max(1, Math.round(PROGRESSION.maxLevel[w] * cfg.levelFrac));
    const n = Math.min(MAX_ATTACHMENTS, cfg.count[0] + Math.floor(rand() * (cfg.count[1] - cfg.count[0] + 1)));
    const pool = unlockedAt(w, level).slice();
    const b: Build = {};
    let k = 0;
    while (k < n && pool.length) {
      const att = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      const slot = ATTACHMENTS[att].slot;
      if (b[slot]) continue;
      b[slot] = att; k++;
    }
    out[w] = b;
  }
  return out;
}

// ------------------------------------------------------------------ XP da partida

export type XpReason = 'kill' | 'headshot' | 'longRange' | 'airKill' | 'damage' | 'assist' | 'multikill' | 'roundWin' | 'matchWin' | 'duelWin';
export const XP_REASON_LABEL: Record<XpReason, string> = {
  kill: 'Abate', headshot: 'Headshot', longRange: 'Longa distância', airKill: 'Abate no ar', damage: 'Dano', assist: 'Assistência',
  multikill: 'Multiabate', roundWin: 'Round vencido', matchWin: 'Partida vencida', duelWin: 'Duelo vencido',
};

export interface XpGain { weapon: ProgWeaponId; amount: number; reason: XpReason; time: number }

/** XP de um abate (antes da dificuldade). */
export function killXp(weapon: ProgWeaponId, o: { head: boolean; dist: number; air: boolean; streak: number }): { reason: XpReason; amount: number }[] {
  const X = PROGRESSION.xp, out: { reason: XpReason; amount: number }[] = [{ reason: 'kill', amount: X.kill }];
  if (o.head) out.push({ reason: 'headshot', amount: X.headshot });
  if (o.dist >= WEAPONS[weapon].falloffHalf * PROGRESSION.longRangeFrac[weapon]) out.push({ reason: 'longRange', amount: X.longRange });
  if (o.air) out.push({ reason: 'airKill', amount: X.airKill });
  if (o.streak === 2) out.push({ reason: 'multikill', amount: X.multikill2 });
  else if (o.streak >= 3) out.push({ reason: 'multikill', amount: X.multikill3 });
  return out;
}

/**
 * Acompanha uma partida contra bots e soma o XP de UM jogador por arma. Recebe os eventos do sim a
 * cada tick (feed). Só armas com progressão; XP só no modo 'bots', vezes o multiplicador da dificuldade.
 */
export class MatchXpTracker {
  /** XP ganho na partida por arma */
  total: Partial<Record<ProgWeaponId, number>> = {};
  /** ganhos em ordem (para os avisos na tela e a tela de resultado) */
  log: XpGain[] = [];
  private mul: number;
  private roundDamage: Partial<Record<ProgWeaponId, number>> = {};
  private matchDamage: Partial<Record<ProgWeaponId, number>> = {};
  private killTimes: number[] = [];
  private enabled: boolean;

  /** `doubleXp`: um token de XP em dobro ativo (só vale se PROGRESSION.doubleXp.enabled) */
  constructor(public pid: number, mode: string, difficulty: BotDifficulty, doubleXp = false) {
    this.enabled = mode === 'bots';
    this.mul = PROGRESSION.difficultyMul[difficulty] * (doubleXp && PROGRESSION.doubleXp.enabled ? PROGRESSION.doubleXp.multiplier : 1);
  }

  private add(weapon: ProgWeaponId, amount: number, reason: XpReason, time: number) {
    const v = Math.round(amount * this.mul);
    if (v <= 0) return;
    this.total[weapon] = (this.total[weapon] ?? 0) + v;
    this.log.push({ weapon, amount: v, reason, time });
  }

  /** Divide `amount` entre as armas pelo dano de cada uma (ou a arma na mão, se não houve dano). */
  private split(amount: number, reason: XpReason, time: number, dmg: Partial<Record<ProgWeaponId, number>>, fallback: ProgWeaponId | null) {
    const entries = Object.entries(dmg).filter(([, v]) => (v ?? 0) > 0) as [ProgWeaponId, number][];
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    if (!sum) { if (fallback) this.add(fallback, amount, reason, time); return; }
    for (const [w, v] of entries) this.add(w, amount * v / sum, reason, time);
  }

  feed(events: SimEvent[], w: World) {
    if (!this.enabled) return;
    const me = w.player(this.pid);
    if (!me) return;
    const held = me.currentWeapon()?.id;
    const heldProg = held && isProgWeapon(held) ? held : null;
    for (const e of events) {
      if (e.t === 'hit' && e.attacker === this.pid && e.weaponId && isProgWeapon(e.weaponId) && e.victim !== this.pid) {
        const dmg = e.dealt ?? e.dmg; // o excesso além da vida não conta
        this.roundDamage[e.weaponId] = (this.roundDamage[e.weaponId] ?? 0) + dmg;
        this.matchDamage[e.weaponId] = (this.matchDamage[e.weaponId] ?? 0) + dmg;
        this.add(e.weaponId, dmg * PROGRESSION.xp.perDamage, 'damage', w.time);
      } else if (e.t === 'kill' && e.killer === this.pid && e.victim !== this.pid && e.weaponId && isProgWeapon(e.weaponId)) {
        this.killTimes = this.killTimes.filter((t) => w.time - t <= PROGRESSION.xp.multikillWindow);
        this.killTimes.push(w.time);
        for (const g of killXp(e.weaponId, { head: e.head, dist: e.dist ?? 0, air: !!e.air, streak: this.killTimes.length })) this.add(e.weaponId, g.amount, g.reason, w.time);
      } else if (e.t === 'kill' && e.assists?.includes(this.pid) && e.killer !== this.pid) {
        this.split(PROGRESSION.xp.assist, 'assist', w.time, this.roundDamage, heldProg);
      } else if (e.t === 'duelWin' && e.winner === this.pid && isProgWeapon(e.weapon)) {
        this.add(e.weapon, PROGRESSION.xp.duelWin, 'duelWin', w.time);
      } else if (e.t === 'match' && e.tr.type === 'roundEnd') {
        if (e.tr.winner === me.team) this.split(PROGRESSION.xp.roundWin, 'roundWin', w.time, this.roundDamage, heldProg);
        this.roundDamage = {};
      } else if (e.t === 'match' && e.tr.type === 'matchEnd') {
        if (e.tr.winner === me.team) this.split(PROGRESSION.xp.matchWin, 'matchWin', w.time, this.matchDamage, heldProg);
      }
    }
  }
}

export interface LevelUp { weapon: ProgWeaponId; from: number; to: number; unlocked: string[] }

/** Soma o XP da partida aos dados salvos; devolve os dados novos e as subidas de nível com desbloqueios. */
export function applyMatchXp(d: ProgressionData, gains: Partial<Record<ProgWeaponId, number>>): { data: ProgressionData; levelUps: LevelUp[] } {
  const xp = { ...d.xp }, levelUps: LevelUp[] = [];
  for (const [w, g] of Object.entries(gains) as [ProgWeaponId, number][]) {
    if (!g) continue;
    const from = levelInfo(w, xp[w]).level;
    xp[w] += g;
    const to = levelInfo(w, xp[w]).level;
    if (to > from) levelUps.push({ weapon: w, from, to, unlocked: WEAPON_ATTACHMENTS[w].filter((a) => a.level > from && a.level <= to).map((a) => a.id) });
  }
  return { data: { ...d, xp }, levelUps };
}
