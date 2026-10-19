// =============================================================
//  Kit de construção dos mapas do Surf Skill.
//
//  STAGED: cada stage é uma "ilha" própria: plataforma de início (zona verde), sequência de rampas,
//  plataforma de fim (zona vermelha) e um chão de lava logo abaixo. Coordenadas dos stages são
//  locais ao spawn do stage (x, y relativos; z relativo a spawn.z − 120).
//
//  LINEAR: um percurso contínuo em coordenadas absolutas, dividido por checkpoints. Cada checkpoint
//  tem um portal (zona de passagem) logo depois do início de uma rampa e, atrás dele e bem acima da
//  linha de voo, uma plataforma de retorno de onde o jogador cai de volta na rampa.
//
//  Peças: rampas de duas faces ou de uma face só, rampas ascendentes (o fim mais alto que o início),
//  segmentos curvos encadeados (emendas fechadas por uma cunha), túneis (teto e paredes que
//  acompanham a rampa), plataformas de bhop e checkpoints.
// =============================================================
import { V3, yawFromDir } from '../math/vec3';
import { Brush, boxBrush, rampBrush, prismBrush, makeBrush } from '../physics/brush';
import type { MapDef, NavPoint, SkillSegmentDef, TriggerVolume, Decor, SpawnPoint, SegmentDesign } from './types';
import { SKILL, SkillMapMeta } from '../config/skill';
import { PHYSICS } from '../config/physics';

export type P3 = [number, number, number];

export interface RampSeg {
  /** início e fim do cume da rampa */
  s: P3; e: P3;
  /** meia-largura horizontal e altura do prisma (inclinação = atan(h / hw)) */
  hw: number; h: number;
  /** face usada pelo percurso de referência: −1 esquerda, +1 direita (em relação ao sentido s→e) */
  ride: 1 | -1;
  /** profundidade dos pontos de referência na face (0 cume … 1 base) */
  q?: number;
  /** frações ao longo da rampa para os pontos de referência */
  fs?: number[];
  sides?: 'both' | 'left' | 'right';
  /** emenda contínua com a rampa anterior (segmento curvo): o início é o fim da anterior */
  join?: boolean;
  /** túnel: teto a esta distância acima do cume, com paredes laterais */
  ceiling?: number;
}

export interface LocalNav { p: P3; mode: NavPoint['mode']; r?: number; jump?: boolean }
export interface BoxSpec { min: P3; max: P3; color?: number }

export interface StageSpec {
  ramps: RampSeg[];
  /** plataformas extras (bhop, apoio) */
  boxes?: BoxSpec[];
  /** pontos de referência inseridos depois da rampa i */
  after?: Record<number, LocalNav[]>;
  /** x do ponto onde o percurso de referência sai da plataforma de início */
  walkX?: number;
  /** plataforma de fim: centro (x, z), topo y, largura (x) e profundidade (z) */
  end: { x: number; y: number; z: number; w: number; d: number };
  /** pontos antes de chegar ao centro da plataforma de fim */
  tail?: LocalNav[];
}

export interface LinearSpec {
  /** posição do jogador na largada (absoluta); a plataforma fica 2u abaixo */
  start: P3;
  ramps: RampSeg[];
  /** índices das rampas que começam um novo trecho (checkpoint) */
  checkpoints: number[];
  boxes?: BoxSpec[];
  after?: Record<number, LocalNav[]>;
  end: StageSpec['end'];
  tail?: LocalNav[];
}

const v = (x: number, y: number, z: number) => new V3(x, y, z);
const G = PHYSICS.gravity;

function box(a: V3, b: V3, color: number, edgeGlow?: number, tag?: string, noCollide?: boolean): Brush {
  return boxBrush(v(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)), v(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)), { color, edgeGlow, tag, noCollide });
}

/** Normal Y da face de uma rampa (precisa ser < 0.7 para ser surfável). */
export function rampNormalY(hw: number, h: number): number { return hw / Math.hypot(hw, h); }

/** Ponto na face de uma rampa (coordenadas absolutas). */
export function rampFacePoint(s: V3, e: V3, hw: number, h: number, f: number, u: number, q: number): V3 {
  const flat = v(e.x - s.x, 0, e.z - s.z).normalize();
  const side = v(-flat.z, 0, flat.x);
  return v(s.x + (e.x - s.x) * f + side.x * u * hw * q, s.y + (e.y - s.y) * f - h * q, s.z + (e.z - s.z) * f + side.z * u * hw * q);
}

const dirOf = (r: { s: P3; e: P3 }) => { const dx = r.e[0] - r.s[0], dz = r.e[2] - r.s[2], l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, len: l }; };
const yawDegOf = (r: { s: P3; e: P3 }) => { const d = dirOf(r); return (Math.atan2(d.x, -d.z) * 180) / Math.PI; };
const angDiff = (a: number, b: number) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

/** Ponto em caixa orientada? (com folga para a caixa do jogador) */
export function insideObb(o: NonNullable<TriggerVolume['obb']>, p: V3, rad: number, halfH: number): boolean {
  const dx = Math.sin((o.yaw)), dz = -Math.cos(o.yaw);
  const rx = p.x - o.c.x, rz = p.z - o.c.z, ry = p.y - o.c.y;
  const along = rx * dx + rz * dz, lat = rx * -dz + rz * dx;
  return Math.abs(along) < o.hl + rad && Math.abs(lat) < o.hw + rad && Math.abs(ry) < o.hh + halfH;
}

/** Caixa orientada → TriggerVolume (com envelope AABB). */
export function obbVolume(c: V3, yaw: number, hl: number, hw: number, hh: number): TriggerVolume {
  const dx = Math.sin(yaw), dz = -Math.cos(yaw);
  const ex = Math.abs(dx) * hl + Math.abs(dz) * hw, ez = Math.abs(dz) * hl + Math.abs(dx) * hw;
  return { min: v(c.x - ex, c.y - hh, c.z - ez), max: v(c.x + ex, c.y + hh, c.z + ez), obb: { c: c.clone(), yaw, hl, hw, hh } };
}

// ------------------------------------------------------------------ geometria das peças

/** Cunha que fecha a emenda de dois segmentos curvos no lado de fora da curva. */
function seamFiller(prev: RampSeg, next: RampSeg, L: (p: P3) => V3, color: number, glow: number, tag: string): Brush | null {
  const a = dirOf(prev), b = dirOf(next);
  const cross = a.x * b.z - a.z * b.x; // > 0: virou para a direita (+X quando se olha para −Z)
  if (Math.abs(cross) < 1e-4) return null;
  // lado de fora da curva: oposto ao sentido da virada
  const out = cross > 0 ? -1 : 1;
  const sides = next.sides ?? 'both';
  if ((sides === 'left' && out > 0) || (sides === 'right' && out < 0)) return null; // lado de fora é o fundo vertical
  const P = L(next.s);
  const sa = v(-a.z, 0, a.x).scale(out * prev.hw), sb = v(-b.z, 0, b.x).scale(out * next.hw);
  const down = v(P.x, P.y - next.h, P.z);
  const verts = [P.clone(), down, v(P.x + sa.x, P.y - prev.h, P.z + sa.z), v(P.x + sb.x, P.y - next.h, P.z + sb.z)];
  return makeBrush(verts, [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]], { color, edgeGlow: glow, kind: 'ramp', tag });
}

/** Teto e paredes que acompanham a rampa (túnel). */
function tunnelPieces(s: V3, e: V3, hw: number, h: number, clear: number, color: number, tag: string): Brush[] {
  const W = hw + 60, T = 30;
  const top = (p: V3) => v(p.x, p.y + clear, p.z);
  const out: Brush[] = [];
  out.push(prismBrush(top(s), top(e), [[-W - T, 0], [W + T, 0], [W + T, T], [-W - T, T]], { color, tag: `${tag}-teto` }));
  for (const sg of [-1, 1]) {
    out.push(prismBrush(v(s.x, s.y, s.z), v(e.x, e.y, e.z), sg < 0 ? [[-W - T, -h - 40], [-W, -h - 40], [-W, clear], [-W - T, clear]] : [[W, -h - 40], [W + T, -h - 40], [W + T, clear], [W, clear]], { color, tag: `${tag}-parede` }));
  }
  return out;
}

/** Laje de teto sobre o gap entre duas rampas com túnel. */
function gapCeiling(a: V3, b: V3, hw: number, clear: number, color: number, tag: string): Brush | null {
  if (Math.hypot(b.x - a.x, b.z - a.z) < 1) return null;
  const W = hw + 90, T = 30;
  // laje horizontal na altura do fim da rampa anterior (um teto inclinado empurraria o jogador para baixo)
  return prismBrush(v(a.x, a.y + clear, a.z), v(b.x, a.y + clear, b.z), [[-W, 0], [W, 0], [W, T], [-W, T]], { color, tag });
}

/** Velocidade horizontal mínima (balística) para sair de `a` com inclinação θ e alcançar `b`. */
function ballistic(a: V3, b: V3, theta: number): { D: number; vmin: number; air: number } {
  const D = Math.hypot(b.x - a.x, b.z - a.z), H = a.y - b.y;
  const c = Math.cos(theta), t = Math.tan(theta);
  const den = 2 * c * c * (D * t + H);
  if (D < 1) return { D, vmin: 0, air: 0 };
  if (den <= 0) return { D, vmin: Infinity, air: Infinity };
  const vmin = Math.sqrt((G * D * D) / den);
  return { D, vmin, air: D / (vmin * c) };
}

interface RampPass {
  brushes: Brush[];
  route: NavPoint[];
  design: Omit<SegmentDesign, 'minSpeed' | 'maxGap' | 'maxAirTime' | 'transitions' | 'bhop'> & { minSpeed: number; maxGap: number; maxAirTime: number; transitions: number };
}

/**
 * Constrói um trecho de rampas (geometria, pontos de referência e métricas de projeto).
 * `nextSupport`: o apoio depois da última rampa (para a métrica do último gap), se houver.
 */
function buildRamps(ramps: RampSeg[], L: (p: P3) => V3, color: number, glow: number, tag: string,
  after: Record<number, LocalNav[]> | undefined, routeOffset: number): RampPass {
  const brushes: Brush[] = [];
  const route: NavPoint[] = [];
  let minHw = Infinity, sumHw = 0, maxN = 0, minN = 1, minSpeed = 0, maxGap = 0, maxAir = 0, transitions = 0, maxTurn = 0, chainTurn = 0;
  let tunnel = false, ascending = false;
  ramps.forEach((r, i) => {
    const s = L(r.s), e = L(r.e);
    brushes.push(rampBrush(s, e, r.hw, r.h, r.sides ?? 'both', { color, edgeGlow: glow, tag: `${tag}-${i + routeOffset}` }));
    if (r.join && i > 0) {
      const f = seamFiller(ramps[i - 1], r, L, color, glow, `${tag}-emenda-${i + routeOffset}`);
      if (f) brushes.push(f);
    }
    if (r.ceiling) {
      tunnel = true;
      // a boca do túnel fica um pouco depois do início (dá para cair na rampa vindo de cima);
      // se a anterior também é túnel, o teto continua sem buraco
      const prevTunnel = i > 0 && !!ramps[i - 1].ceiling;
      const f0 = prevTunnel ? 0 : 0.5;
      const s1 = v(s.x + (e.x - s.x) * f0, s.y + (e.y - s.y) * f0, s.z + (e.z - s.z) * f0);
      brushes.push(...tunnelPieces(s1, e, r.hw, r.h, r.ceiling, 0x5a6378, `${tag}-tunel-${i + routeOffset}`));
      const n = ramps[i + 1];
      if (n?.ceiling && !n.join) { const c = gapCeiling(e, L(n.s), Math.max(r.hw, n.hw), Math.min(r.ceiling, n.ceiling), 0x5a6378, `${tag}-teto-gap-${i + routeOffset}`); if (c) brushes.push(c); }
    }
    if (e.y > s.y + 1) ascending = true;
    minHw = Math.min(minHw, r.hw); sumHw += r.hw;
    const n = rampNormalY(r.hw, r.h);
    maxN = Math.max(maxN, n); minN = Math.min(minN, n);
    for (const f of r.fs ?? (r.join || ramps[i + 1]?.join ? [0.5, 1] : [0.15, 0.45, 0.75, 0.97])) {
      route.push({ p: rampFacePoint(s, e, r.hw, r.h, f, r.ride, r.q ?? 0.35), mode: 'surf', r: 220 });
    }
    const next = ramps[i + 1];
    // sai da rampa em linha reta antes de mirar a próxima (evita cruzar o cume)
    if (next && !next.join) route.push({ p: rampFacePoint(s, e, r.hw, r.h, 1.06, r.ride, r.q ?? 0.35), mode: 'air', r: 120 });
    for (const a of after?.[i] ?? []) route.push({ p: L(a.p), mode: a.mode, r: a.r ?? 200, jump: a.jump });
    // métricas da transição para a próxima rampa
    if (next) {
      const turn = angDiff(yawDegOf(r), yawDegOf(next));
      if (next.join) { chainTurn += turn; maxTurn = Math.max(maxTurn, Math.abs(chainTurn)); }
      else {
        chainTurn = 0;
        maxTurn = Math.max(maxTurn, Math.abs(turn));
        transitions++;
        const a = rampFacePoint(s, e, r.hw, r.h, 1, r.ride, r.q ?? 0.35);
        const b = rampFacePoint(L(next.s), L(next.e), next.hw, next.h, 0, next.ride, next.q ?? 0.35);
        const theta = Math.atan2(e.y - s.y, dirOf(r).len);
        const bl = ballistic(a, b, theta);
        maxGap = Math.max(maxGap, bl.D); minSpeed = Math.max(minSpeed, bl.vmin); maxAir = Math.max(maxAir, bl.air);
      }
    }
  });
  return { brushes, route, design: { minHalfWidth: minHw, sumHalfWidth: sumHw, maxNormalY: maxN, minNormalY: minN, ramps: ramps.length, minSpeed, maxGap, maxAirTime: maxAir, transitions, maxTurn, tunnel, ascending } };
}

/** Métrica do último gap: da saída da última rampa até a borda mais próxima de uma plataforma. */
function exitToPlatform(r: RampSeg, L: (p: P3) => V3, center: V3, w: number, d: number) {
  const s = L(r.s), e = L(r.e);
  const a = rampFacePoint(s, e, r.hw, r.h, 1, r.ride, r.q ?? 0.35);
  const dx = center.x - a.x, dz = center.z - a.z, l = Math.hypot(dx, dz) || 1;
  const inset = Math.min(w, d) / 2;
  const b = v(center.x - (dx / l) * inset, center.y, center.z - (dz / l) * inset);
  return ballistic(a, b, Math.atan2(e.y - s.y, dirOf(r).len));
}

function cloudsAround(decor: Decor[], seed0: number, cx: number, cz: number, y: number, spread: number, n: number) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < n; i++) {
    decor.push({ kind: 'cloud', pos: v(cx + (rnd() - 0.5) * spread, y - 300 - rnd() * 1500 + (rnd() < 0.3 ? 2500 : 0), cz + (rnd() - 0.5) * spread), scale: 250 + rnd() * 500, rot: rnd() * 6 });
  }
}

const finishDesign = (p: RampPass['design'], bhop: boolean, last: { D: number; vmin: number; air: number } | null): SegmentDesign => ({
  ...p,
  transitions: p.transitions + (last ? 1 : 0),
  minSpeed: Math.round(Math.max(p.minSpeed, last?.vmin ?? 0)),
  maxGap: Math.round(Math.max(p.maxGap, last?.D ?? 0)),
  maxAirTime: Math.round(Math.max(p.maxAirTime, last?.air ?? 0) * 100) / 100,
  maxTurn: Math.round(p.maxTurn),
  bhop,
});

// ------------------------------------------------------------------ STAGED

export interface BuiltCourse { brushes: Brush[]; segments: SkillSegmentDef[]; decor: Decor[] }

export function buildCourse(meta: SkillMapMeta, specs: StageSpec[]): BuiltCourse {
  const brushes: Brush[] = [];
  const segments: SkillSegmentDef[] = [];
  const decor: Decor[] = [];
  specs.forEach((spec, k) => {
    const sm = meta.segments[k];
    if (!sm.spawn) throw new Error(`${meta.id}: stage ${k + 1} sem spawn em config`);
    // o spawn fica 2u acima do piso; z local relativo a spawn.z − 120 (os mapas de treino têm spawn.z = 120)
    const ox = sm.spawn[0], oy = sm.spawn[1] - 2, oz = sm.spawn[2] - 120;
    const L = (p: P3) => v(ox + p[0], oy + p[1], oz + p[2]);
    const color = meta.segmentColors[k % meta.segmentColors.length];
    const glow = meta.color;
    const last = k === specs.length - 1;

    // ---- plataforma de início + zona verde ----
    brushes.push(box(v(ox - 320, oy - 80, oz - 300), v(ox + 320, oy, oz + 320), 0xdfe6f0, glow, `skill-start-${k}`));
    brushes.push(box(v(ox - 320, oy, oz + 280), v(ox + 320, oy + 140, oz + 320), 0xa3afc4)); // parede do fundo
    const startZone: TriggerVolume = { min: v(ox - 320, oy, oz - 170), max: v(ox + 320, oy + SKILL.zoneHeight, oz + 280) };

    // ---- rampas ----
    const route: NavPoint[] = [];
    const r0 = spec.ramps[0];
    const firstFace = rampFacePoint(L(r0.s), L(r0.e), r0.hw, r0.h, 0.02, r0.ride, r0.q ?? 0.35);
    route.push({ p: v(spec.walkX !== undefined ? ox + spec.walkX : firstFace.x, oy, oz - 292), mode: 'walk', r: 30 });
    const pass = buildRamps(spec.ramps, L, color, glow, `skill-ramp-${k}`, spec.after, 0);
    brushes.push(...pass.brushes);
    route.push(...pass.route);
    for (const b of spec.boxes ?? []) brushes.push(box(L(b.min), L(b.max), b.color ?? 0xd3dbe8, glow));
    for (const a of spec.tail ?? []) route.push({ p: L(a.p), mode: a.mode, r: a.r ?? 200, jump: a.jump });

    // ---- plataforma de fim + zona vermelha (ou chegada) ----
    const E = spec.end;
    const ec = L([E.x, E.y, E.z]);
    brushes.push(box(v(ec.x - E.w / 2, ec.y - 80, ec.z - E.d / 2), v(ec.x + E.w / 2, ec.y, ec.z + E.d / 2), last ? 0xfff2c4 : 0xdfe6f0, last ? 0xffd23c : 0xff4757, `skill-end-${k}`));
    const endZone: TriggerVolume = { min: v(ec.x - E.w / 2, ec.y, ec.z - E.d / 2), max: v(ec.x + E.w / 2, ec.y + SKILL.zoneHeight + 260, ec.z + E.d / 2) };
    route.push({ p: v(ec.x, ec.y, ec.z), mode: 'air', r: Math.min(E.w, E.d) / 2 - 20, jump: route[route.length - 1].jump });

    // ---- lava ----
    let lowY = ec.y;
    let x0 = ox - 400, x1 = ox + 400, z0 = oz - 300, z1 = oz + 320;
    for (const r of spec.ramps) {
      for (const p of [L(r.s), L(r.e)]) {
        lowY = Math.min(lowY, p.y - r.h);
        x0 = Math.min(x0, p.x - r.hw); x1 = Math.max(x1, p.x + r.hw);
        z0 = Math.min(z0, p.z - r.hw); z1 = Math.max(z1, p.z + r.hw);
      }
    }
    // (as plataformas extras ficam acima da rampa mais baixa; não entram no cálculo, para manter os mapas de treino idênticos)
    x0 = Math.min(x0, ec.x - E.w); x1 = Math.max(x1, ec.x + E.w); z0 = Math.min(z0, ec.z - E.d);
    const pad = 2500;
    const lavaY = lowY - 350;
    brushes.push(box(v(x0 - pad, lavaY - 40, z0 - pad), v(x1 + pad, lavaY, z1 + pad), 0xe8502e, 0xffb02e, `skill-lava-${k}`, true));
    const fall: TriggerVolume[] = [{ min: v(x0 - pad, lavaY - 400, z0 - pad), max: v(x1 + pad, lavaY + 120, z1 + pad) }];

    const lastRamp = spec.ramps[spec.ramps.length - 1];
    const bhop = (spec.tail ?? []).some((t) => t.jump) || Object.values(spec.after ?? {}).flat().some((t) => t.jump);
    // chegada com pista de bhop: a pista é o apoio (o gap até a pista não é medido)
    const lastGap = spec.boxes?.length ? null : exitToPlatform(lastRamp, L, ec, E.w, E.d);

    const spawn: SpawnPoint = { pos: v(sm.spawn[0], sm.spawn[1], sm.spawn[2]), yaw: sm.yaw ?? 0 };
    segments.push({
      index: k, name: sm.name, kind: 'stage', spawn, startZone, endZone, fall, fallY: lavaY - 300, color, route, flowFrom: 0,
      design: finishDesign(pass.design, bhop, lastGap),
    });

    cloudsAround(decor, 11 + k * 97 + meta.id.length * 13, ox, (z0 + z1) / 2, lavaY, 9000, 14);
    decor.push({ kind: 'ring', pos: v(ox, oy + 420, oz - 120), scale: 180, color });
  });
  return { brushes, segments, decor };
}

// ------------------------------------------------------------------ LINEAR

/** Altura da plataforma de retorno acima do cume da rampa do checkpoint (bem acima da linha de voo). */
export const CHECKPOINT_LIFT = 430;

export function buildLinear(meta: SkillMapMeta, spec: LinearSpec): BuiltCourse {
  const brushes: Brush[] = [];
  const segments: SkillSegmentDef[] = [];
  const decor: Decor[] = [];
  const A = (p: P3) => v(p[0], p[1], p[2]);
  const glow = meta.color;
  const [sx, sy0, sz] = spec.start;
  const sy = sy0 - 2;

  // largada (igual à de um stage): o jogador olha para −Z
  brushes.push(box(v(sx - 320, sy - 80, sz - 420), v(sx + 320, sy, sz + 200), 0xdfe6f0, glow, 'skill-start-0'));
  brushes.push(box(v(sx - 320, sy, sz + 160), v(sx + 320, sy + 140, sz + 200), 0xa3afc4));

  const bounds = [spec.ramps[0].s, spec.ramps[0].s];
  const cps = [0, ...spec.checkpoints, spec.ramps.length];
  const E = spec.end;
  const ec = A([E.x, E.y, E.z]);

  for (let k = 0; k < cps.length - 1; k++) {
    const from = cps[k], to = cps[k + 1];
    const ramps = spec.ramps.slice(from, to);
    const color = meta.segmentColors[k % meta.segmentColors.length];
    const isLast = k === cps.length - 2;
    const route: NavPoint[] = [];
    let spawn: SpawnPoint, startZone: TriggerVolume;
    const r0 = ramps[0];
    const s0 = A(r0.s), e0 = A(r0.e);
    const d0 = dirOf(r0);
    if (k === 0) {
      spawn = { pos: v(sx, sy + 2, sz), yaw: 0 };
      startZone = { min: v(sx - 320, sy, sz - 290), max: v(sx + 320, sy + SKILL.zoneHeight, sz + 160) };
      const firstFace = rampFacePoint(s0, e0, r0.hw, r0.h, 0.02, r0.ride, r0.q ?? 0.35);
      route.push({ p: v(firstFace.x, sy, sz - 412), mode: 'walk', r: 30 });
    } else {
      // plataforma de retorno: atrás do início da rampa, acima da linha de voo
      const P0 = rampFacePoint(s0, e0, r0.hw, r0.h, 0, r0.ride, r0.q ?? 0.35);
      // bem acima da linha de voo de quem chega embalado: a saída da rampa anterior (e o arco dela,
      // se ela sobe) fica sempre pelo menos ~380 u abaixo do fundo da plataforma
      const pr = spec.ramps[from - 1];
      const pe = rampFacePoint(A(pr.s), A(pr.e), pr.hw, pr.h, 1, pr.ride, pr.q ?? 0.35);
      const climbing = pr.e[1] - pr.s[1];
      const lift = Math.max(CHECKPOINT_LIFT, pe.y - s0.y + 380 + (climbing > 0 ? 260 + climbing * 0.5 : 0));
      const top = s0.y + lift;
      const back = v(P0.x - d0.x * 230, top - 24, P0.z - d0.z * 230), front = v(P0.x, top - 24, P0.z);
      brushes.push(prismBrush(back, front, [[-100, 0], [100, 0], [100, 24], [-100, 24]], { color: 0xe6f6ff, edgeGlow: 0x7fe9ff, tag: `skill-cp-${k}` }));
      const yaw = yawFromDir(d0.x, d0.z);
      spawn = { pos: v(P0.x - d0.x * 150, top + 2, P0.z - d0.z * 150), yaw };
      startZone = obbVolume(v(P0.x - d0.x * 115, top + SKILL.zoneHeight / 2, P0.z - d0.z * 115), yaw, 115, 100, SKILL.zoneHeight / 2);
      route.push({ p: v(P0.x + d0.x * 6, top, P0.z + d0.z * 6), mode: 'walk', r: 26 });
    }
    const pass = buildRamps(ramps, A, color, glow, `skill-ramp-${k}`, offsetAfter(spec.after, from), from);
    brushes.push(...pass.brushes);
    route.push(...pass.route);

    let endZone: TriggerVolume, lastGap: { D: number; vmin: number; air: number } | null = null;
    if (!isLast) {
      // portal do próximo checkpoint: logo depois do início da rampa seguinte
      const n = spec.ramps[to];
      const ns = A(n.s), ne = A(n.e), nd = dirOf(n);
      const P0 = rampFacePoint(ns, ne, n.hw, n.h, 0, n.ride, n.q ?? 0.35);
      const yaw = yawFromDir(nd.x, nd.z);
      const c = v(ns.x + nd.x * 130, ns.y + 500, ns.z + nd.z * 130);
      endZone = obbVolume(c, yaw, 90, n.hw + 260, 500 + n.h);
      // prolonga a última rampa até o portal: aponta para dentro dele, na linha de surf
      route.push({ p: v(P0.x + nd.x * 130, P0.y, P0.z + nd.z * 130), mode: 'air', r: 140 });
      const last = ramps[ramps.length - 1];
      const ls = A(last.s), le = A(last.e);
      lastGap = ballistic(rampFacePoint(ls, le, last.hw, last.h, 1, last.ride, last.q ?? 0.35), P0, Math.atan2(le.y - ls.y, dirOf(last).len));
    } else {
      for (const b of spec.boxes ?? []) brushes.push(box(A(b.min), A(b.max), b.color ?? 0xd3dbe8, glow));
      for (const a of spec.tail ?? []) route.push({ p: A(a.p), mode: a.mode, r: a.r ?? 200, jump: a.jump });
      brushes.push(box(v(ec.x - E.w / 2, ec.y - 80, ec.z - E.d / 2), v(ec.x + E.w / 2, ec.y, ec.z + E.d / 2), 0xfff2c4, 0xffd23c, 'skill-end'));
      endZone = { min: v(ec.x - E.w / 2, ec.y, ec.z - E.d / 2), max: v(ec.x + E.w / 2, ec.y + SKILL.zoneHeight + 260, ec.z + E.d / 2) };
      route.push({ p: v(ec.x, ec.y, ec.z), mode: 'air', r: Math.min(E.w, E.d) / 2 - 20, jump: route[route.length - 1].jump });
      if (!spec.boxes?.length) lastGap = exitToPlatform(ramps[ramps.length - 1], A, ec, E.w, E.d);
    }

    // queda: abaixo da parte mais baixa deste trecho (e do começo do próximo)
    let low = Infinity;
    for (const r of [...ramps, ...(isLast ? [] : [spec.ramps[to]])]) for (const p of [r.s, r.e]) {
      low = Math.min(low, p[1] - r.h);
      bounds[0] = [Math.min(bounds[0][0], p[0] - r.hw), Math.min(bounds[0][1], p[1] - r.h), Math.min(bounds[0][2], p[2] - r.hw)];
      bounds[1] = [Math.max(bounds[1][0], p[0] + r.hw), Math.max(bounds[1][1], p[1]), Math.max(bounds[1][2], p[2] + r.hw)];
    }
    if (isLast) { low = Math.min(low, ec.y); for (const b of spec.boxes ?? []) low = Math.min(low, b.min[1]); }
    const fallY = low - 450;
    const bhop = isLast && ((spec.tail ?? []).some((t) => t.jump));
    segments.push({
      index: k, name: meta.segments[k]?.name ?? `Checkpoint ${k}`, kind: k === 0 ? 'stage' : 'checkpoint', spawn, startZone, endZone,
      fall: [{ min: v(-1e6, fallY - 5000, -1e6), max: v(1e6, fallY, 1e6) }], fallY, color, route, flowFrom: k === 0 ? 0 : 1,
      design: finishDesign(pass.design, bhop, lastGap),
    });
  }

  // lava visual: um plano só, no fundo de tudo
  const pad = 4000;
  const [b0, b1] = bounds;
  const lavaY = Math.min(b0[1], ec.y) - 600;
  brushes.push(box(v(Math.min(b0[0], sx) - pad, lavaY - 40, Math.min(b0[2], sz) - pad), v(Math.max(b1[0], sx) + pad, lavaY, Math.max(b1[2], sz) + pad), 0xe8502e, 0xffb02e, 'skill-lava', true));
  cloudsAround(decor, 7 + meta.id.length * 31, (b0[0] + b1[0]) / 2, (b0[2] + b1[2]) / 2, lavaY, Math.max(b1[0] - b0[0], b1[2] - b0[2]) + 8000, 40);
  return { brushes, segments, decor };
}

function offsetAfter(after: Record<number, LocalNav[]> | undefined, from: number): Record<number, LocalNav[]> | undefined {
  if (!after) return undefined;
  const out: Record<number, LocalNav[]> = {};
  for (const [k, val] of Object.entries(after)) out[Number(k) - from] = val;
  return out;
}

// ------------------------------------------------------------------ MapDef

function mapDefFrom(meta: SkillMapMeta, c: BuiltCourse): MapDef {
  const s0 = c.segments[0].spawn;
  return {
    name: meta.name,
    brushes: c.brushes,
    triggers: [],
    spawns: { blue: [s0], red: [s0] },
    pickups: [],
    decor: c.decor,
    routes: { blue: [], red: [] },
    combatNodes: [],
    duelArenas: [],
    waitingRoom: s0,
    recovery: s0,
    killY: -1e9,
    fallY: -1e9,
    trainingSpawn: s0,
    trainingTargets: [],
    skill: { id: meta.id, tier: meta.tier, format: meta.format, segments: c.segments },
  };
}

/** Monta o MapDef completo de um mapa staged do Surf Skill (sem bots, itens, duelos). */
export function skillMapDef(meta: SkillMapMeta, specs: StageSpec[]): MapDef { return mapDefFrom(meta, buildCourse(meta, specs)); }
/** Monta o MapDef de um mapa linear. */
export function linearMapDef(meta: SkillMapMeta, spec: LinearSpec): MapDef { return mapDefFrom(meta, buildLinear(meta, spec)); }

// ------------------------------------------------------------------ autoria

/**
 * Próxima rampa de uma sequência: posiciona o início para que a linha de quem surfa a rampa anterior
 * (na profundidade q) caia na face escolhida da nova rampa depois de um gap.
 * yawDeg: direção da nova rampa (0 = −Z, positivo vira para +X).
 */
export function chainRamp(prev: RampSeg, o: { gap: number; drop: number; yawDeg: number; len: number; descent: number; hw: number; h: number; ride: 1 | -1; sides?: RampSeg['sides']; q?: number; dx?: number; ceiling?: number }): RampSeg {
  const pd = [prev.e[0] - prev.s[0], prev.e[2] - prev.s[2]];
  const pl = Math.hypot(pd[0], pd[1]); pd[0] /= pl; pd[1] /= pl;
  const pside = [-pd[1], pd[0]];
  const pq = prev.q ?? 0.35;
  const a = (o.yawDeg * Math.PI) / 180;
  const d = [Math.sin(a), -Math.cos(a)];
  // no ar, metade do gap na direção antiga e metade já virando para a nova (air strafe)
  const px = prev.e[0] + pside[0] * prev.ride * prev.hw * pq + (pd[0] + d[0]) * o.gap * 0.5;
  const pz = prev.e[2] + pside[1] * prev.ride * prev.hw * pq + (pd[1] + d[1]) * o.gap * 0.5;
  const side = [-d[1], d[0]];
  const q = o.q ?? 0.35;
  const sx = px - side[0] * o.ride * o.hw * q + (o.dx ?? 0), sz = pz - side[1] * o.ride * o.hw * q;
  const sy = prev.e[1] - o.drop;
  const r: RampSeg = { s: [Math.round(sx), sy, Math.round(sz)], e: [Math.round(sx + d[0] * o.len), sy - o.descent, Math.round(sz + d[1] * o.len)], hw: o.hw, h: o.h, ride: o.ride, sides: o.sides, q: o.q };
  if (o.ceiling) r.ceiling = o.ceiling;
  return r;
}

/** Plataforma de fim alinhada com a saída de uma rampa: `dist` à frente do fim, `drop` abaixo do cume. */
export function endAfter(r: RampSeg, dist: number, drop: number, w: number, d: number): StageSpec['end'] {
  const dx = r.e[0] - r.s[0], dz = r.e[2] - r.s[2], l = Math.hypot(dx, dz);
  return { x: Math.round(r.e[0] + (dx / l) * dist), y: r.e[1] - drop, z: Math.round(r.e[2] + (dz / l) * dist), w, d };
}

export interface ChainOpts { gap?: number; drop?: number; turn?: number; yaw?: number; len: number; descent: number; hw?: number; h?: number; ride?: 1 | -1; sides?: RampSeg['sides']; q?: number; ceiling?: number }

/**
 * Montador de percursos: encadeia rampas a partir de uma primeira, com curvas contínuas,
 * subidas, túneis e checkpoints. Gera um StageSpec (staged) ou um LinearSpec (linear).
 */
export class Course {
  ramps: RampSeg[] = [];
  boxes: BoxSpec[] = [];
  after: Record<number, LocalNav[]> = {};
  tail: LocalNav[] = [];
  checkpoints: number[] = [];
  constructor(first: RampSeg) { this.ramps.push(first); }
  get last(): RampSeg { return this.ramps[this.ramps.length - 1]; }
  /** direção atual (graus; 0 = −Z, positivo para +X) */
  get yaw(): number { return yawDegOf(this.last); }

  /** Próxima rampa depois de um gap. `turn` é relativo à direção atual; `yaw` é absoluto. */
  next(o: ChainOpts): this {
    const l = this.last;
    const yawDeg = o.yaw ?? this.yaw + (o.turn ?? 0);
    this.ramps.push(chainRamp(l, { gap: o.gap ?? 300, drop: o.drop ?? 300, yawDeg, len: o.len, descent: o.descent, hw: o.hw ?? l.hw, h: o.h ?? l.h, ride: o.ride ?? l.ride, sides: o.sides, q: o.q, ceiling: o.ceiling }));
    return this;
  }

  /**
   * Curva contínua: `steps` segmentos emendados (sem gap) virando `turn` graus no total.
   * A face usada deve ser a de dentro da curva (direita para turn > 0).
   */
  curve(turn: number, steps: number, segLen: number, descentPerSeg: number, o: { ceiling?: number } = {}): this {
    const l = this.last;
    let yaw = this.yaw;
    for (let i = 0; i < steps; i++) {
      yaw += turn / steps;
      const a = (yaw * Math.PI) / 180;
      const p = this.last.e;
      const r: RampSeg = { s: [p[0], p[1], p[2]], e: [Math.round(p[0] + Math.sin(a) * segLen), p[1] - descentPerSeg, Math.round(p[2] - Math.cos(a) * segLen)], hw: l.hw, h: l.h, ride: l.ride, q: l.q, sides: l.sides, join: true };
      if (o.ceiling ?? l.ceiling) r.ceiling = o.ceiling ?? l.ceiling;
      this.ramps.push(r);
    }
    return this;
  }

  /**
   * Curva contínua dimensionada para uma velocidade: o raio é o de uma curva "inclinada" em que a
   * face segura quem passa a `speed` (v² / (g·tan α)), com folga. Mais rápido que isso, sobe-se na face.
   */
  curveFor(turn: number, speed: number, descentPerSeg = 110, o: { ceiling?: number; margin?: number } = {}): this {
    const l = this.last;
    const tanA = l.h / l.hw;
    const R = ((speed * speed) / (PHYSICS.gravity * tanA)) * (o.margin ?? 1.3);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / 10));
    const seg = Math.round((R * Math.abs(turn) * Math.PI) / 180 / steps);
    return this.curve(turn, steps, seg, descentPerSeg, o);
  }

  /** Reta emendada no fim da rampa atual (continua na mesma direção, sem gap). */
  straight(len: number, descent: number): this {
    const l = this.last, a = (this.yaw * Math.PI) / 180;
    const r: RampSeg = { s: [l.e[0], l.e[1], l.e[2]], e: [Math.round(l.e[0] + Math.sin(a) * len), l.e[1] - descent, Math.round(l.e[2] - Math.cos(a) * len)], hw: l.hw, h: l.h, ride: l.ride, q: l.q, sides: l.sides, join: true };
    if (l.ceiling) r.ceiling = l.ceiling;
    this.ramps.push(r);
    return this;
  }

  /** O próximo trecho começa num checkpoint (mapas linear). */
  checkpoint(): this { this.checkpoints.push(this.ramps.length); return this; }

  /** Pista de bhop depois da última rampa: `pads` plataformas de `padLen` a cada `pitch` (ao longo da direção). */
  bhop(o: { firstDist: number; drop: number; pads: number; pitch: number; padLen: number; width: number }): { lastPadEnd: P3; y: number } {
    const l = this.last, d = dirOf(l);
    const side = [-d.z, d.x];
    const off = l.hw * (l.q ?? 0.35) * l.ride;
    const base = [l.e[0] + side[0] * off, l.e[2] + side[1] * off];
    const y = l.e[1] - o.drop;
    let end: P3 = [0, 0, 0];
    for (let i = 0; i < o.pads; i++) {
      const c0 = o.firstDist + i * o.pitch, c1 = c0 + o.padLen;
      const pa = [base[0] + d.x * c0, base[1] + d.z * c0], pb = [base[0] + d.x * c1, base[1] + d.z * c1];
      const w = o.width / 2;
      this.boxes.push({ min: [Math.min(pa[0], pb[0]) - w * Math.abs(side[0]) - 1, y - 80, Math.min(pa[1], pb[1]) - w * Math.abs(side[1]) - 1], max: [Math.max(pa[0], pb[0]) + w * Math.abs(side[0]) + 1, y, Math.max(pa[1], pb[1]) + w * Math.abs(side[1]) + 1] });
      const mid = (c0 + c1) / 2;
      this.tail.push({ p: [Math.round(base[0] + d.x * mid), y, Math.round(base[1] + d.z * mid)], mode: i === 0 ? 'air' : 'walk', r: 220, jump: true });
      end = [Math.round(pb[0]), y, Math.round(pb[1])];
    }
    return { lastPadEnd: end, y };
  }

  stage(end: StageSpec['end']): StageSpec { return { ramps: this.ramps, boxes: this.boxes.length ? this.boxes : undefined, after: this.after, tail: this.tail.length ? this.tail : undefined, end }; }
  linear(start: P3, end: StageSpec['end']): LinearSpec { return { start, ramps: this.ramps, checkpoints: this.checkpoints, boxes: this.boxes.length ? this.boxes : undefined, after: this.after, tail: this.tail.length ? this.tail : undefined, end }; }
}
