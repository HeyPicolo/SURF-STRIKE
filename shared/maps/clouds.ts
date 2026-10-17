// =============================================================
//  CLOUDS — primeira arena do SURF STRIKE
//  Arena flutuante sobre um mar de nuvens. Simétrica no eixo Z:
//  Azul em +Z, Vermelho em −Z, centro disputado em z = 0.
//
//  Três trajetórias por equipe:
//   A  "Ridge"   (verde-água)  — iniciante: rampa dupla larga e longa até o centro
//   B  "Riptide" (magenta)     — rápida/arriscada: 3 rampas estreitas e íngremes em sequência
//   C  "Halo"    (dourado)     — estratégica: rampa longa que leva ao Poleiro elevado (sniper)
// =============================================================
import { V3 } from '../math/vec3';
import { Brush, boxBrush, rampBrush, prismBrush, makeBrush, BrushOptions } from '../physics/brush';
import type { MapDef, Trigger, PickupSpawn, Decor, BotRoute, Team, DuelArena, SpawnPoint } from './types';

export const COLORS = {
  blue: 0x2f7bff, red: 0xff4757,
  routeA: 0x2ee6c0, routeB: 0xff3df2, routeC: 0xffc93d,
  platform: 0xd3dbe8, platformDark: 0xa3afc4, cover: 0x8d9ab0, coverDark: 0x5f6b80,
  rampA: 0x9fdfd2, rampB: 0xd9a8e6, rampC: 0xeedca8,
  cloudFloor: 0xf4f7fb, glass: 0xa8d8ff, metal: 0x4a5368, accent: 0x7c5cff,
};

const v = (x: number, y: number, z: number) => new V3(x, y, z);

/** Surf ramp specification (blue side, z > 0). Red side is mirrored in Z. */
interface RampSpec { start: [number, number, number]; end: [number, number, number]; hw: number; h: number; color: number; glow: number; tag: string; }
export const RAMPS: Record<string, RampSpec> = {
  A: { start: [0, 2280, 4800], end: [0, 900, 1750], hw: 520, h: 760, color: COLORS.rampA, glow: COLORS.routeA, tag: 'routeA' },
  B1: { start: [900, 2280, 5400], end: [1600, 1700, 3700], hw: 300, h: 650, color: COLORS.rampB, glow: COLORS.routeB, tag: 'routeB1' },
  B2: { start: [1700, 1330, 3450], end: [1950, 850, 1300], hw: 300, h: 650, color: COLORS.rampB, glow: COLORS.routeB, tag: 'routeB2' },
  C: { start: [-900, 2280, 5400], end: [-1900, 1650, 1700], hw: 420, h: 700, color: COLORS.rampC, glow: COLORS.routeC, tag: 'routeC' },
};

/** Point on a ramp face: f = 0..1 along the ramp, u = ±1 face side, q = depth below apex (0 apex … 1 base). */
function facePoint(r: RampSpec, f: number, u: number, q: number): V3 {
  const s = v(...r.start), e = v(...r.end);
  const flat = v(e.x - s.x, 0, e.z - s.z).normalize();
  const side = v(-flat.z, 0, flat.x);
  const ax = s.x + (e.x - s.x) * f, ay = s.y + (e.y - s.y) * f, az = s.z + (e.z - s.z) * f;
  return v(ax + side.x * u * r.hw * q, ay - r.h * q, az + side.z * u * r.hw * q);
}

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opt: BrushOptions): Brush {
  return boxBrush(v(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), v(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)), opt);
}

/** Walkable slope (wedge) rising from (x, y0) to (x, y1) along +X over `len`. */
function slopeX(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, opt: BrushOptions): Brush {
  const zs = [Math.min(z0, z1), Math.max(z0, z1)];
  const verts: V3[] = [];
  for (const z of zs) { verts.push(v(x0, y0 - 40, z), v(x1, y0 - 40, z), v(x1, y1, z), v(x0, y0, z)); }
  const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return makeBrush(verts, faces, opt);
}

function teamHalf(team: Team): { brushes: Brush[]; triggers: Trigger[]; pickups: PickupSpawn[]; decor: Decor[] } {
  const s = team === 'blue' ? 1 : -1;
  const tc = team === 'blue' ? COLORS.blue : COLORS.red;
  const Z = (z: number) => z * s;
  const brushes: Brush[] = [];
  const triggers: Trigger[] = [];
  const pickups: PickupSpawn[] = [];
  const decor: Decor[] = [];

  // ---------- Spawn platform ----------
  brushes.push(box(-650, 2300, Z(4800), 650, 2400, Z(5700), { color: COLORS.platform, edgeGlow: tc, tag: `${team}-spawn` }));
  // back wall + side rails (cover)
  brushes.push(box(-650, 2400, Z(5640), 650, 2560, Z(5700), { color: tc }));
  brushes.push(box(-650, 2400, Z(5300), -610, 2450, Z(5700), { color: COLORS.cover }));
  brushes.push(box(610, 2400, Z(5300), 650, 2450, Z(5700), { color: COLORS.cover }));
  // little cover blocks at the front corners
  brushes.push(box(-560, 2400, Z(4860), -440, 2470, Z(4920), { color: COLORS.coverDark, edgeGlow: tc }));
  brushes.push(box(440, 2400, Z(4860), 560, 2470, Z(4920), { color: COLORS.coverDark, edgeGlow: tc }));
  // support pylon under the spawn
  brushes.push(box(-120, 1500, Z(5150), 120, 2300, Z(5400), { color: COLORS.metal, noCollide: false }));

  // ---------- Surf routes A (Ridge), B (Riptide, 3 ramps), C (Halo) ----------
  for (const r of Object.values(RAMPS)) {
    brushes.push(rampBrush(v(r.start[0], r.start[1], Z(r.start[2])), v(r.end[0], r.end[1], Z(r.end[2])), r.hw, r.h, 'both',
      { color: r.color, edgeGlow: r.glow, tag: r.tag }));
  }

  // ---------- Center-side cover (each half of the plateau) ----------
  brushes.push(box(-700, 0, Z(560), -500, 120, Z(620), { color: COLORS.cover, edgeGlow: tc }));
  brushes.push(box(500, 0, Z(560), 700, 120, Z(620), { color: COLORS.cover, edgeGlow: tc }));
  brushes.push(box(-400, 0, Z(950), -300, 220, Z(1050), { color: COLORS.coverDark }));
  brushes.push(box(300, 0, Z(950), 400, 220, Z(1050), { color: COLORS.coverDark }));
  // flank cover
  brushes.push(box(1700, 150, Z(380), 1900, 260, Z(440), { color: COLORS.cover, edgeGlow: tc }));
  brushes.push(box(2200, 150, Z(500), 2260, 290, Z(700), { color: COLORS.coverDark }));
  // perch cover
  brushes.push(box(-2100, 1000, Z(420), -1900, 1080, Z(470), { color: COLORS.cover, edgeGlow: tc }));

  // ---------- Teleporter on the plateau: back to own spawn front (rotation) ----------
  triggers.push({
    kind: 'teleport', min: v(-60, 0, Z(1330) - 60), max: v(60, 60, Z(1330) + 60),
    dest: v(0, 2402, Z(5050)), destYaw: s > 0 ? 0 : Math.PI, keepVelocity: false, color: tc,
  });
  // Recovery floor pad → this team's spawn (teamDest makes it fair for everyone)
  triggers.push({
    kind: 'teleport', min: v(-100, -1800, Z(3000) - 100), max: v(100, -1720, Z(3000) + 100),
    dest: v(0, 2402, Z(5050)), destYaw: 0,
    teamDest: { blue: { pos: v(0, 2402, 5050), yaw: 0 }, red: { pos: v(0, 2402, -5050), yaw: Math.PI } },
    keepVelocity: false, color: 0xffffff,
  });

  // ---------- Pickups (mirrored) ----------
  pickups.push({ kind: 'ammo', pos: v(0, 2400, Z(5480)) });
  pickups.push({ kind: 'nade_impulse', pos: v(-420, 2400, Z(5150)) });
  pickups.push({ kind: 'medkit', pos: v(420, 2400, Z(5150)) });
  pickups.push({ kind: 'weapon', weapon: 'smg', pos: v(700, 0, Z(1100)) });
  pickups.push({ kind: 'armor', pos: v(-700, 0, Z(1100)) });
  pickups.push({ kind: 'weapon', weapon: 'rifle', pos: v(300, 0, Z(760)) });
  pickups.push({ kind: 'weapon', weapon: 'smg', pos: v(2100, 150, Z(520)) });
  pickups.push({ kind: 'weapon', weapon: 'shotgun', pos: v(-1750, 1000, Z(250)) });
  pickups.push({ kind: 'nade_he', pos: v(0, 0, Z(1400)) });
  pickups.push({ kind: 'medkit', pos: v(-900, 0, Z(300)) });
  pickups.push({ kind: 'ammo', pos: v(900, 0, Z(300)) });
  pickups.push({ kind: 'nade_smoke', pos: v(2000, 150, Z(620)) });
  pickups.push({ kind: 'speed', pos: v(2350, 150, Z(300)) });
  pickups.push({ kind: 'medkit', pos: v(-2050, 1000, Z(620)) });
  pickups.push({ kind: 'nade_he', pos: v(-1700, 1000, Z(560)) });
  pickups.push({ kind: 'ammo', pos: v(-2300, 1000, Z(300)) });

  // ---------- Decor ----------
  decor.push({ kind: 'ring', pos: v(0, 2700, Z(4300)), scale: 260, color: tc });
  decor.push({ kind: 'pylon', pos: v(0, -1800, Z(4000)), scale: 1, color: tc });
  return { brushes, triggers, pickups, decor };
}

function duelArena(i: number): { brushes: Brush[]; arena: DuelArena } {
  const cx = 14000 + i * 2400, cz = 0;
  const b: Brush[] = [];
  const col = { color: 0xdfe6f0, edgeGlow: COLORS.accent };
  b.push(box(cx - 800, -100, cz - 800, cx + 800, 0, cz + 800, col));
  b.push(box(cx - 840, 0, cz - 840, cx + 840, 520, cz - 800, { color: COLORS.metal }));
  b.push(box(cx - 840, 0, cz + 800, cx + 840, 520, cz + 840, { color: COLORS.metal }));
  b.push(box(cx - 840, 0, cz - 800, cx - 800, 520, cz + 800, { color: COLORS.metal }));
  b.push(box(cx + 800, 0, cz - 800, cx + 840, 520, cz + 800, { color: COLORS.metal }));
  b.push(box(cx - 840, 520, cz - 840, cx + 840, 560, cz + 840, { color: COLORS.metal, invisible: true }));
  // symmetric cover
  b.push(box(cx - 90, 0, cz - 90, cx + 90, 140, cz + 90, { color: COLORS.cover, edgeGlow: COLORS.accent }));
  b.push(box(cx - 500, 0, cz - 260, cx - 380, 110, cz - 220, { color: COLORS.coverDark }));
  b.push(box(cx + 380, 0, cz + 220, cx + 500, 110, cz + 260, { color: COLORS.coverDark }));
  b.push(box(cx + 380, 0, cz - 260, cx + 500, 110, cz - 220, { color: COLORS.coverDark }));
  b.push(box(cx - 500, 0, cz + 220, cx - 380, 110, cz + 260, { color: COLORS.coverDark }));
  return {
    brushes: b,
    arena: {
      center: v(cx, 0, cz),
      a: { pos: v(cx, 2, cz + 640), yaw: 0 },
      b: { pos: v(cx, 2, cz - 640), yaw: Math.PI },
    },
  };
}

export function buildClouds(): MapDef {
  const brushes: Brush[] = [];
  const triggers: Trigger[] = [];
  const pickups: PickupSpawn[] = [];
  const decor: Decor[] = [];

  for (const team of ['blue', 'red'] as Team[]) {
    const h = teamHalf(team);
    brushes.push(...h.brushes); triggers.push(...h.triggers); pickups.push(...h.pickups); decor.push(...h.decor);
  }

  // ---------- Central plateau ----------
  brushes.push(box(-1200, -220, -1500, 1200, 0, 1500, { color: COLORS.platform, edgeGlow: COLORS.accent, tag: 'center' }));
  brushes.push(box(-300, 0, -300, 300, 16, 300, { color: COLORS.platformDark }));
  brushes.push(box(-180, 16, -180, 180, 32, 180, { color: COLORS.platform, edgeGlow: COLORS.routeC }));
  // central cross walls (cover around the dais)
  brushes.push(box(-620, 0, -40, -420, 150, 40, { color: COLORS.cover, edgeGlow: COLORS.accent }));
  brushes.push(box(420, 0, -40, 620, 150, 40, { color: COLORS.cover, edgeGlow: COLORS.accent }));
  brushes.push(box(-1000, 0, -150, -940, 110, 150, { color: COLORS.coverDark }));
  brushes.push(box(940, 0, -150, 1000, 110, 150, { color: COLORS.coverDark }));
  // plateau underside (decor-ish but solid)
  brushes.push(prismBrush(v(0, -220, -1500), v(0, -220, 1500), [[-1100, 0], [1100, 0], [700, -500], [-700, -500]], { color: COLORS.platformDark }));

  // ---------- Right flank (+X) ----------
  brushes.push(box(1300, -60, -800, 2500, 150, 800, { color: COLORS.platform, edgeGlow: COLORS.routeB, tag: 'flank' }));
  brushes.push(slopeX(1200, 1300, 0, 150, -260, 260, { color: COLORS.platformDark }));
  brushes.push(box(1300, 150, -60, 1360, 220, 60, { color: COLORS.coverDark }));
  // ---------- Left perch (−X, elevated) ----------
  brushes.push(box(-2500, 900, -800, -1500, 1000, 800, { color: COLORS.platform, edgeGlow: COLORS.routeC, tag: 'perch' }));
  brushes.push(box(-2500, 1000, -800, -2460, 1120, 800, { color: COLORS.metal }));
  brushes.push(box(-1580, 1000, -120, -1500, 1060, 120, { color: COLORS.cover, edgeGlow: COLORS.routeC }));
  brushes.push(box(-2050, 400, -80, -1950, 900, 80, { color: COLORS.metal }));
  // ---------- Aerial corridor (sky bridge) ----------
  brushes.push(box(-1500, 980, -110, 1300, 1000, 110, { color: COLORS.platformDark, edgeGlow: COLORS.accent, tag: 'bridge' }));
  brushes.push(box(-1500, 1000, -116, 1300, 1050, -110, { color: COLORS.glass, kind: 'glass' }));
  brushes.push(box(-1500, 1000, 110, 1300, 1050, 116, { color: COLORS.glass, kind: 'glass' }));

  // Jump pads: plateau → perch, flank → bridge
  triggers.push({ kind: 'jumppad', min: v(-1120, 0, -70), max: v(-1040, 40, 70), velocity: v(-430, 1360, 0), color: COLORS.routeC });
  triggers.push({ kind: 'jumppad', min: v(2280, 150, -70), max: v(2400, 190, 70), velocity: v(-500, 1260, 0), color: COLORS.routeB });

  // ---------- Recovery floor (cloud layer) ----------
  brushes.push(box(-4500, -1900, -7000, 4500, -1800, 7000, { color: COLORS.cloudFloor, edgeGlow: 0xffffff, tag: 'recovery' }));
  // recovery pads to the plateau
  for (const sx of [-1, 1]) {
    triggers.push({
      kind: 'teleport', min: v(sx * 2500 - 100, -1800, -100), max: v(sx * 2500 + 100, -1720, 100),
      dest: v(sx * 800, 2, 0), destYaw: sx > 0 ? Math.PI / 2 : -Math.PI / 2, keepVelocity: false, color: COLORS.accent,
    });
  }

  // ---------- Contested pickups (z = 0) ----------
  pickups.push({ kind: 'weapon', weapon: 'rifle', pos: v(0, 32, 0) });
  pickups.push({ kind: 'weapon', weapon: 'sniper', pos: v(-2000, 1000, 0) });
  pickups.push({ kind: 'weapon', weapon: 'shotgun', pos: v(1950, 150, 0) });
  pickups.push({ kind: 'shield', pos: v(0, 1000, 0) });
  pickups.push({ kind: 'weapon', weapon: 'rifle', pos: v(-900, 0, 0) });
  pickups.push({ kind: 'armor', pos: v(900, 0, 0) });

  // ---------- Decor: low-poly cloud sea & islands ----------
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 2500 + rnd() * 9000;
    decor.push({ kind: 'cloud', pos: v(Math.cos(a) * r, -1500 - rnd() * 1800 + (rnd() < 0.25 ? 2600 + rnd() * 2000 : 0), Math.sin(a) * r * 1.2), scale: 200 + rnd() * 500, rot: rnd() * 6 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3, r = 9000 + rnd() * 3000;
    decor.push({ kind: 'island', pos: v(Math.cos(a) * r, -600 + rnd() * 2400, Math.sin(a) * r), scale: 500 + rnd() * 700, rot: rnd() * 6 });
  }

  // ---------- Duel arenas ----------
  const duelArenas: DuelArena[] = [];
  for (let i = 0; i < 5; i++) { const d = duelArena(i); brushes.push(...d.brushes); duelArenas.push(d.arena); }
  // waiting room
  const wr = v(14000, 0, 4000);
  brushes.push(box(wr.x - 400, -100, wr.z - 400, wr.x + 400, 0, wr.z + 400, { color: COLORS.platformDark }));
  for (const [x0, z0, x1, z1] of [[-440, -440, 440, -400], [-440, 400, 440, 440], [-440, -400, -400, 400], [400, -400, 440, 400]]) {
    brushes.push(box(wr.x + x0, 0, wr.z + z0, wr.x + x1, 300, wr.z + z1, { color: COLORS.metal }));
  }
  brushes.push(box(wr.x - 440, 300, wr.z - 440, wr.x + 440, 340, wr.z + 440, { color: COLORS.metal }));

  const spawns: Record<Team, SpawnPoint[]> = { blue: [], red: [] };
  const xs = [0, -200, 200, -400, 400];
  for (const x of xs) {
    spawns.blue.push({ pos: v(x, 2402, 5450), yaw: 0 });
    spawns.red.push({ pos: v(x, 2402, -5450), yaw: Math.PI });
  }

  return {
    name: 'CLOUDS',
    brushes, triggers, pickups, decor, spawns,
    routes: { blue: blueRoutes(), red: blueRoutes().map(mirrorRoute) },
    combatNodes: [
      v(0, 32, 0), v(-600, 0, 300), v(600, 0, 300), v(-600, 0, -300), v(600, 0, -300),
      v(0, 0, 800), v(0, 0, -800), v(-900, 0, 900), v(900, 0, -900), v(-900, 0, -900), v(900, 0, 900),
      v(1900, 150, 300), v(1900, 150, -300), v(-2000, 1000, 300), v(-2000, 1000, -300),
    ],
    duelArenas,
    waitingRoom: { pos: v(wr.x, 2, wr.z), yaw: 0 },
    recovery: { pos: v(0, -1798, 0), yaw: 0 },
    killY: -4200,
    trainingSpawn: { pos: v(0, 2402, 5450), yaw: 0 },
    trainingTargets: [
      { pos: v(-300, 2, -700), yaw: 0 }, { pos: v(300, 2, -900), yaw: 0 }, { pos: v(0, 34, 0), yaw: 0 },
      { pos: v(1900, 152, -200), yaw: Math.PI / 2 }, { pos: v(-2000, 1002, -300), yaw: -Math.PI / 2 },
    ],
  };
}

function blueRoutes(): BotRoute[] {
  const surf = (r: RampSpec, u: number, fs: number[], q: number) => fs.map((f) => ({ p: facePoint(r, f, u, q), mode: 'surf' as const, r: 250 }));
  return [
    {
      name: 'A-left', points: [
        { p: v(-160, 2402, 4830), mode: 'walk', r: 60 },
        ...surf(RAMPS.A, -1, [0.15, 0.45, 0.75, 0.97], 0.4),
        { p: v(-200, 0, 300), mode: 'air', r: 350 },
      ],
    },
    {
      name: 'A-right', points: [
        { p: v(160, 2402, 4830), mode: 'walk', r: 60 },
        ...surf(RAMPS.A, 1, [0.15, 0.45, 0.75, 0.97], 0.4),
        { p: v(200, 0, 300), mode: 'air', r: 350 },
      ],
    },
    {
      name: 'B', points: [
        { p: v(630, 2402, 5100), mode: 'walk', r: 50 },
        ...surf(RAMPS.B1, -1, [0.35, 0.65, 0.97], 0.35),
        ...surf(RAMPS.B2, -1, [0.1, 0.45, 0.8, 0.97], 0.35),
        { p: v(1900, 150, 100), mode: 'air', r: 400 },
      ],
    },
    {
      name: 'C', points: [
        { p: v(-630, 2402, 5100), mode: 'walk', r: 50 },
        ...surf(RAMPS.C, 1, [0.2, 0.45, 0.7, 0.97], 0.35),
        { p: v(-2000, 1000, 300), mode: 'air', r: 400 },
      ],
    },
  ];
}

function mirrorRoute(r: BotRoute): BotRoute {
  return { name: r.name, points: r.points.map((pt) => ({ ...pt, p: v(pt.p.x, pt.p.y, -pt.p.z) })) };
}
