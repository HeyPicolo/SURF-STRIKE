// =============================================================
//  Checagem de layout dos mapas do Surf Skill: stages que se cruzam, lava de um stage passando por
//  outro e (mapas linear) trechos não vizinhos encostados. Usado pelo teste e por `npm run skill:layout`.
// =============================================================
import type { MapDef } from './types';
import type { Brush } from '../physics/brush';
import { STAGE_LAYOUT } from '../config/skill';

export interface Box3 { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }

const isLava = (b: Brush) => !!b.tag?.startsWith('skill-lava');

/** Separação entre duas caixas em cada eixo (negativa quando se sobrepõem naquele eixo). */
export function gaps(a: Box3, b: Box3) {
  const g = (a0: number, a1: number, b0: number, b1: number) => Math.max(b0 - a1, a0 - b1);
  return { x: g(a.min.x, a.max.x, b.min.x, b.max.x), y: g(a.min.y, a.max.y, b.min.y, b.max.y), z: g(a.min.z, a.max.z, b.min.z, b.max.z) };
}
const overlap = (a: Box3, b: Box3) => { const g = gaps(a, b); return g.x < 0 && g.y < 0 && g.z < 0; };
/** Distância entre duas caixas (0 quando se tocam ou se cruzam). */
export function boxDist(a: Box3, b: Box3) { const g = gaps(a, b); return Math.hypot(Math.max(0, g.x), Math.max(0, g.y), Math.max(0, g.z)); }

function grow(e: Box3 | null, b: Box3): Box3 {
  if (!e) return { min: { ...b.min }, max: { ...b.max } };
  return {
    min: { x: Math.min(e.min.x, b.min.x), y: Math.min(e.min.y, b.min.y), z: Math.min(e.min.z, b.min.z) },
    max: { x: Math.max(e.max.x, b.max.x), y: Math.max(e.max.y, b.max.y), z: Math.max(e.max.z, b.max.z) },
  };
}

/** Envelope de cada stage/trecho: brushes do grupo, zonas e o número flutuante; `solid` sem a lava. */
export function segmentEnvelopes(map: MapDef): { all: Box3; solid: Box3 }[] {
  const segs = map.skill!.segments;
  return segs.map((st, k) => {
    let all: Box3 | null = null, solid: Box3 | null = null;
    for (const b of map.brushes) if (b.group === k) { all = grow(all, b); if (!isLava(b)) solid = grow(solid, b); }
    for (const z of [st.startZone, st.endZone]) { all = grow(all, z); solid = grow(solid, z); }
    if (st.kind === 'stage') {
      const sp = st.spawn.pos, nz = st.startZone.min.z - 400;
      const n = { min: { x: sp.x - 200, y: sp.y, z: nz }, max: { x: sp.x + 200, y: sp.y + 320, z: nz } };
      all = grow(all, n); solid = grow(solid, n);
    }
    return { all: all!, solid: solid! };
  });
}

export interface LayoutIssue { kind: 'clearance' | 'lava' | 'solid' | 'linear'; a: number; b: number; detail: string }

/**
 * Problemas de layout de um mapa. Staged: envelopes de stages diferentes a menos de `clearance`
 * (separados em planta ou em altura), lava de um stage cruzando outro, brushes sólidos se cruzando.
 * Linear: brushes de trechos não vizinhos a menos de `linearGap`.
 */
export function layoutIssues(map: MapDef, clearance = STAGE_LAYOUT.clearance, linearGap = 400): { issues: LayoutIssue[]; minClear: number } {
  const issues: LayoutIssue[] = [];
  const segs = map.skill!.segments;
  let minClear = Infinity;
  const groups = segs.map((_, k) => map.brushes.filter((b) => b.group === k));
  if (map.skill!.format === 'staged') {
    const env = segmentEnvelopes(map);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const g = gaps(env[i].all, env[j].all);
      const sep = Math.max(Math.max(g.x, g.z), g.y);
      minClear = Math.min(minClear, sep);
      if (sep < clearance) issues.push({ kind: 'clearance', a: i, b: j, detail: `folga ${Math.round(sep)} u` });
      for (const [p, q] of [[i, j], [j, i]]) {
        const lava = groups[p].find(isLava);
        if (lava && overlap(lava, env[q].solid)) issues.push({ kind: 'lava', a: p, b: q, detail: `lava do stage ${p + 1} cruza o stage ${q + 1}` });
      }
      outer: for (const a of groups[i]) if (!a.noCollide) for (const b of groups[j]) if (!b.noCollide && overlap(a, b)) {
        issues.push({ kind: 'solid', a: i, b: j, detail: `${a.tag ?? 'brush'} × ${b.tag ?? 'brush'}` });
        break outer;
      }
    }
  } else {
    for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) {
      let best = Infinity, pair = '';
      for (const a of groups[i]) if (!a.noCollide) for (const b of groups[j]) if (!b.noCollide) {
        const d = boxDist(a, b);
        if (d < best) { best = d; pair = `${a.tag ?? 'brush'} × ${b.tag ?? 'brush'}`; }
      }
      minClear = Math.min(minClear, best);
      if (best < linearGap) issues.push({ kind: 'linear', a: i, b: j, detail: `${Math.round(best)} u (${pair})` });
    }
  }
  return { issues, minClear };
}

/**
 * Nuvens (decoração) dentro do corredor jogável: a menos de `margin` de algum brush sólido, zona ou
 * trecho do percurso de referência (os segmentos entre pontos cobrem os gaps). A nuvem é tratada como
 * uma esfera de raio ~1,6 × escala (o tamanho do modelo).
 */
export function cloudIssues(map: MapDef, margin = CLOUD_MARGIN): string[] {
  const out: string[] = [];
  for (const d of map.decor) {
    if (d.kind !== 'cloud') continue;
    const r = cloudRadius(d.scale) + margin;
    const why = cloudBlocked(map, d.pos, r);
    if (why) out.push(`${Math.round(d.pos.x)},${Math.round(d.pos.y)},${Math.round(d.pos.z)} perto de ${why}`);
  }
  return out;
}

export const CLOUD_MARGIN = 600;
/** raio aproximado do modelo de nuvem (client/src/maps/worldMesh.ts) */
export const cloudRadius = (scale: number) => scale * 1.6;

/** Motivo pelo qual uma esfera (centro p, raio r) invade o corredor jogável, ou null. */
export function cloudBlocked(map: MapDef, p: { x: number; y: number; z: number }, r: number): string | null {
  const ball: Box3 = { min: { x: p.x - r, y: p.y - r, z: p.z - r }, max: { x: p.x + r, y: p.y + r, z: p.z + r } };
  for (const b of map.brushes) if (!b.noCollide && boxDist(b, ball) === 0 && sphereBox(p, r, b)) return b.tag ?? 'brush';
  for (const st of map.skill?.segments ?? []) {
    for (const z of [st.startZone, st.endZone]) if (sphereBox(p, r, z)) return 'zona';
    const pts = st.route.map((n) => n.p);
    for (let i = 0; i + 1 < pts.length; i++) if (segDist(p, pts[i], pts[i + 1]) < r) return `percurso (${st.name})`;
  }
  return null;
}

function sphereBox(p: { x: number; y: number; z: number }, r: number, b: Box3) {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
  return dx * dx + dy * dy + dz * dz < r * r;
}

function segDist(p: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}
