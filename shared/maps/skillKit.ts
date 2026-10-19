// =============================================================
//  Kit de construção dos mapas do Surf Skill.
//  Cada stage é uma "ilha" própria: plataforma de início (zona verde), sequência de rampas,
//  plataforma de fim (zona vermelha) e um chão de lava logo abaixo.
//  Coordenadas dos stages são locais: x relativo ao spawn do stage, y relativo à altura do
//  spawn, z absoluto (anda-se para −Z).
// =============================================================
import { V3 } from '../math/vec3';
import { Brush, boxBrush, rampBrush } from '../physics/brush';
import type { MapDef, NavPoint, SkillStageDef, TriggerVolume, Decor, SpawnPoint } from './types';
import { SKILL, SkillMapMeta } from '../config/skill';

export type P3 = [number, number, number];

export interface RampSeg {
  /** início e fim do cume da rampa (local) */
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
}

export interface LocalNav { p: P3; mode: NavPoint['mode']; r?: number; jump?: boolean }

export interface StageSpec {
  ramps: RampSeg[];
  /** plataformas extras (bhop, apoio) */
  boxes?: { min: P3; max: P3; color?: number }[];
  /** pontos de referência inseridos depois da rampa i */
  after?: Record<number, LocalNav[]>;
  /** x do ponto onde o percurso de referência sai da plataforma de início */
  walkX?: number;
  /** plataforma de fim: centro (x, z), topo y, largura (x) e profundidade (z) */
  end: { x: number; y: number; z: number; w: number; d: number };
  /** pontos antes de chegar ao centro da plataforma de fim */
  tail?: LocalNav[];
}

const v = (x: number, y: number, z: number) => new V3(x, y, z);

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

export interface BuiltCourse { brushes: Brush[]; stages: SkillStageDef[]; decor: Decor[] }

export function buildCourse(meta: SkillMapMeta, specs: StageSpec[]): BuiltCourse {
  const brushes: Brush[] = [];
  const stages: SkillStageDef[] = [];
  const decor: Decor[] = [];
  specs.forEach((spec, k) => {
    const sm = meta.stages[k];
    const ox = sm.spawn[0], oy = sm.spawn[1] - 2; // o spawn fica 2u acima do piso
    const L = (p: P3) => v(ox + p[0], oy + p[1], p[2]);
    const color = meta.stageColors[k];
    const glow = meta.color;
    const last = k === specs.length - 1;

    // ---- plataforma de início + zona verde ----
    brushes.push(box(v(ox - 320, oy - 80, -300), v(ox + 320, oy, 320), 0xdfe6f0, glow, `skill-start-${k}`));
    brushes.push(box(v(ox - 320, oy, 280), v(ox + 320, oy + 140, 320), 0xa3afc4)); // parede do fundo
    const startZone: TriggerVolume = { min: v(ox - 320, oy, -170), max: v(ox + 320, oy + SKILL.zoneHeight, 280) };

    // ---- rampas ----
    let minHw = Infinity, maxN = 0, minN = 1;
    const route: NavPoint[] = [];
    const r0 = spec.ramps[0];
    const firstFace = rampFacePoint(L(r0.s), L(r0.e), r0.hw, r0.h, 0.02, r0.ride, r0.q ?? 0.35);
    route.push({ p: v(spec.walkX !== undefined ? ox + spec.walkX : firstFace.x, oy, -292), mode: 'walk', r: 30 });
    spec.ramps.forEach((r, i) => {
      const s = L(r.s), e = L(r.e);
      brushes.push(rampBrush(s, e, r.hw, r.h, r.sides ?? 'both', { color, edgeGlow: glow, tag: `skill-ramp-${k}-${i}` }));
      minHw = Math.min(minHw, r.hw);
      const n = rampNormalY(r.hw, r.h);
      maxN = Math.max(maxN, n); minN = Math.min(minN, n);
      for (const f of r.fs ?? [0.15, 0.45, 0.75, 0.97]) {
        route.push({ p: rampFacePoint(s, e, r.hw, r.h, f, r.ride, r.q ?? 0.35), mode: 'surf', r: 220 });
      }
      // sai da rampa em linha reta antes de mirar a próxima (evita cruzar o cume)
      if (i < spec.ramps.length - 1) route.push({ p: rampFacePoint(s, e, r.hw, r.h, 1.06, r.ride, r.q ?? 0.35), mode: 'air', r: 120 });
      for (const a of spec.after?.[i] ?? []) route.push({ p: L(a.p), mode: a.mode, r: a.r ?? 200, jump: a.jump });
    });
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
    let x0 = ox - 400, x1 = ox + 400, z0 = -300, z1 = 320;
    for (const r of spec.ramps) {
      for (const p of [L(r.s), L(r.e)]) {
        lowY = Math.min(lowY, p.y - r.h);
        x0 = Math.min(x0, p.x - r.hw); x1 = Math.max(x1, p.x + r.hw);
        z0 = Math.min(z0, p.z - r.hw); z1 = Math.max(z1, p.z + r.hw);
      }
    }
    x0 = Math.min(x0, ec.x - E.w); x1 = Math.max(x1, ec.x + E.w); z0 = Math.min(z0, ec.z - E.d);
    const pad = 2500;
    const lavaY = lowY - 350;
    brushes.push(box(v(x0 - pad, lavaY - 40, z0 - pad), v(x1 + pad, lavaY, z1 + pad), 0xe8502e, 0xffb02e, `skill-lava-${k}`, true));
    const fall: TriggerVolume[] = [{ min: v(x0 - pad, lavaY - 400, z0 - pad), max: v(x1 + pad, lavaY + 120, z1 + pad) }];

    // velocidade mínima de projeto: para cada gap (rampa → rampa e rampa → chegada), a velocidade
    // horizontal abaixo da qual quem sai da rampa sem impulso vertical cai antes de alcançar o próximo apoio
    let minSpeed = 0, maxGap = 0;
    const g = 800;
    const exitOf = (r: RampSeg) => rampFacePoint(L(r.s), L(r.e), r.hw, r.h, 1, r.ride, r.q ?? 0.35);
    for (let i = 0; i < spec.ramps.length; i++) {
      const a = exitOf(spec.ramps[i]);
      let b: V3;
      if (i + 1 < spec.ramps.length) { const n = spec.ramps[i + 1]; b = rampFacePoint(L(n.s), L(n.e), n.hw, n.h, 0, n.ride, n.q ?? 0.35); }
      else {
        // borda da plataforma de fim mais próxima, na direção da saída
        const dx = ec.x - a.x, dz = ec.z - a.z, l = Math.hypot(dx, dz) || 1;
        const inset = Math.min(E.w, E.d) / 2;
        b = v(ec.x - (dx / l) * inset, ec.y, ec.z - (dz / l) * inset);
        if (spec.boxes?.length) continue; // chegada com pista de bhop: a pista é o apoio
      }
      const D = Math.hypot(b.x - a.x, b.z - a.z), H = a.y - b.y;
      maxGap = Math.max(maxGap, D);
      minSpeed = Math.max(minSpeed, H > 1 ? D / Math.sqrt((2 * H) / g) : Infinity);
    }

    const spawn: SpawnPoint = { pos: v(sm.spawn[0], sm.spawn[1], sm.spawn[2]), yaw: sm.yaw };
    stages.push({
      index: k, name: sm.name, spawn, startZone, endZone, fall, fallY: lavaY - 300, color, route,
      design: { minHalfWidth: minHw, maxNormalY: maxN, minNormalY: minN, ramps: spec.ramps.length, minSpeed: Math.round(minSpeed), maxGap: Math.round(maxGap), bhop: (spec.tail ?? []).some((t) => t.jump) || Object.values(spec.after ?? {}).flat().some((t) => t.jump) },
    });

    // decoração: nuvens em volta do stage
    let seed = 11 + k * 97 + meta.id.length * 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 14; i++) {
      decor.push({ kind: 'cloud', pos: v(ox + (rnd() - 0.5) * 9000, lavaY - 300 - rnd() * 1500 + (rnd() < 0.3 ? 2500 : 0), (z0 + z1) / 2 + (rnd() - 0.5) * 9000), scale: 250 + rnd() * 500, rot: rnd() * 6 });
    }
    decor.push({ kind: 'ring', pos: v(ox, oy + 420, -120), scale: 180, color });
  });
  return { brushes, stages, decor };
}

/** Monta o MapDef completo de um mapa do Surf Skill (sem bots, itens, duelos). */
export function skillMapDef(meta: SkillMapMeta, specs: StageSpec[]): MapDef {
  const c = buildCourse(meta, specs);
  const s0 = c.stages[0].spawn;
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
    skill: { id: meta.id, tier: meta.tier, stages: c.stages },
  };
}

/**
 * Próxima rampa de uma sequência: posiciona o início para que a linha de quem surfa a rampa anterior
 * (na profundidade q) caia na face escolhida da nova rampa depois de um gap.
 * yawDeg: direção da nova rampa (0 = −Z, positivo vira para +X).
 */
export function chainRamp(prev: RampSeg, o: { gap: number; drop: number; yawDeg: number; len: number; descent: number; hw: number; h: number; ride: 1 | -1; sides?: RampSeg['sides']; q?: number; dx?: number }): RampSeg {
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
  return { s: [Math.round(sx), sy, Math.round(sz)], e: [Math.round(sx + d[0] * o.len), sy - o.descent, Math.round(sz + d[1] * o.len)], hw: o.hw, h: o.h, ride: o.ride, sides: o.sides, q: o.q };
}

/** Plataforma de fim alinhada com a saída de uma rampa: `dist` à frente do fim, `drop` abaixo do cume. */
export function endAfter(r: RampSeg, dist: number, drop: number, w: number, d: number): StageSpec['end'] {
  const dx = r.e[0] - r.s[0], dz = r.e[2] - r.s[2], l = Math.hypot(dx, dz);
  return { x: Math.round(r.e[0] + (dx / l) * dist), y: r.e[1] - drop, z: Math.round(r.e[2] + (dz / l) * dist), w, d };
}
