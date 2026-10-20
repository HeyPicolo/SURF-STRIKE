// =============================================================
//  Attachments nos modelos (rodada 12b): pontos de montagem por arma, canos com o comprimento do
//  build, peças no estilo de blocos e os pontos de visada de cada mira (ADS) e do laser.
//  Coordenadas do modelo: frente = −Z, origem no punho, Y para cima (as mesmas de geometry.ts).
//  Sem GL: só MeshBuilder (testável).
// =============================================================
import { MeshBuilder, P, P2 } from '../render/mesh';
import type { WeaponId } from '../../../shared/config/weapons';
import type { AttachSlot } from '../../../shared/config/attachments';
import type { Build } from '../../../shared/sim/loadout';
import { isProgWeapon, ProgWeaponId } from '../../../shared/config/progression';
import { PALETTES, Palette, STYLE, WEAPON_REFS, SightRef, ITEM_STYLE, shade } from './style';

/** Ponto de montagem: posição, para onde a peça "cresce" (lado do trilho) e escala da peça. */
export interface Mount { p: P; d: '+y' | '-y' | '-x' | '+z'; s: number }

/** Cano padrão: eixo (y), início (z0, onde sai da arma), comprimento, raio e a peça da boca padrão. */
export interface BarrelSpec { y: number; z0: number; len: number; r: number; device: number; deviceR: number; delta: Partial<Record<'short' | 'long' | 'heavy', number>> }

export const BARRELS: Record<ProgWeaponId, BarrelSpec> = {
  rifle: { y: 2, z0: -25, len: 6, r: 0.62, device: 3, deviceR: 0.88, delta: { short: -3, long: 5, heavy: 2.5 } },
  sniper: { y: 2, z0: -26, len: 14.8, r: 0.85, device: 3.4, deviceR: 1.25, delta: { short: -5, long: 4, heavy: 2 } },
  smg: { y: 2, z0: -17.4, len: 1.8, r: 0.5, device: 1.4, deviceR: 0.72, delta: { short: -1.2, long: 4 } },
  shotgun: { y: 3, z0: -12, len: 24.6, r: 1.0, device: 1.0, deviceR: 1.18, delta: { short: -6, long: 5 } },
  pistol: { y: 2.5, z0: -14.4, len: 0.5, r: 0.6, device: 0, deviceR: 0.6, delta: { short: -0.4, long: 3.5 } },
};

/** Pontos de montagem das outras categorias (a boca vem de muzzleRef, o cano de BARRELS). */
export const MOUNTS: Record<ProgWeaponId, Partial<Record<AttachSlot, Mount>>> = {
  rifle: {
    optic: { p: [0, 4.26, -3.6], d: '+y', s: 1 },
    laser: { p: [-2.41, 1.4, -22.3], d: '-x', s: 1 },
    underbarrel: { p: [0, -0.7, -17.5], d: '-y', s: 1 },
    stock: { p: [0, 2.0, 5.6], d: '+z', s: 1 },
    magazine: { p: [0, -1.5, -4.2], d: '-y', s: 1 },
    rearGrip: { p: [0, -3.8, 1.8], d: '-y', s: 1 },
  },
  sniper: {
    optic: { p: [0, 4.86, -3.6], d: '+y', s: 1 },
    laser: { p: [-1.9, 1.7, -24.4], d: '-x', s: 1 },
    underbarrel: { p: [0, -0.7, -20], d: '-y', s: 1.05 },
    stock: { p: [0, 3.3, 7.2], d: '+z', s: 1.15 },
    magazine: { p: [0, -1, -3.6], d: '-y', s: 1 },
    rearGrip: { p: [0, -3.9, 1.8], d: '-y', s: 1 },
  },
  smg: {
    optic: { p: [0, 5.16, -2.9], d: '+y', s: 0.95 },
    laser: { p: [-1.8, 1.4, -10.6], d: '-x', s: 0.9 },
    underbarrel: { p: [0, -1, -10.4], d: '-y', s: 0.9 },
    stock: { p: [0, 1.85, 4], d: '+z', s: 0.85 },
    magazine: { p: [0, -1, -5.4], d: '-y', s: 0.9 },
    rearGrip: { p: [0, -3.6, 1.7], d: '-y', s: 1 },
  },
  shotgun: {
    optic: { p: [0, 4.1, -4.6], d: '+y', s: 1 },
    laser: { p: [-1.9, 0.85, -24.6], d: '-x', s: 1 },
    underbarrel: { p: [0, -0.7, -21.5], d: '-y', s: 1 },
    stock: { p: [0, 1.5, 4], d: '+z', s: 1.1 },
    magazine: { p: [0, 0.95, -12], d: '+z', s: 1 },
    rearGrip: { p: [0, -3.6, 1.9], d: '-y', s: 1 },
  },
  pistol: {
    optic: { p: [0, 4.0, -5.2], d: '+y', s: 0.8 },
    laser: { p: [0, -1.16, -9.2], d: '-y', s: 0.85 },
    magazine: { p: [0, -6.8, 1.7], d: '-y', s: 1 },
    rearGrip: { p: [0, -3.6, 1.4], d: '-y', s: 1 },
  },
};

const prog = (id: WeaponId): id is ProgWeaponId => isProgWeapon(id);

/** Comprimento e raio do cano com o build. */
export function barrelFor(id: ProgWeaponId, build: Build = {}) {
  const B = BARRELS[id], kind = build.barrel as 'short' | 'long' | 'heavy' | undefined;
  const len = Math.max(0.1, B.len + (kind ? B.delta[kind] ?? 0 : 0));
  return { y: B.y, z0: B.z0, z1: B.z0 - len, len, r: kind === 'heavy' ? B.r * 1.3 : B.r, kind };
}

/** Comprimento da peça de boca do build (0 = nenhuma). */
const MUZZLE_LEN: Record<string, number> = { comp: 2.6, brake: 3.4, supp: 9 };

/** Ponto de onde sai o tiro (o clarão aparece 2 u à frente), já com o cano e a boca do build. */
export function muzzleRef(id: WeaponId, build: Build = {}): { y: number; z: number } {
  if (id === 'knife') return { y: 0, z: -10 };
  if (!prog(id)) return WEAPON_REFS[id].muzzle;
  const b = barrelFor(id, build), dev = build.muzzle ? MUZZLE_LEN[build.muzzle] ?? 0 : BARRELS[id].device;
  return { y: b.y, z: b.z1 - dev };
}

/** Altura da linha de visada de cada mira acima do ponto de montagem e distância do olho no ADS. */
const OPTIC_SIGHT: Record<string, { h: number; rear: number; front: number; dist: number }> = {
  reddot: { h: 1.75, rear: 1.2, front: -0.9, dist: 7 },
  holo: { h: 1.9, rear: 1.8, front: -1.5, dist: 7 },
  x2: { h: 1.9, rear: 3.4, front: -3.4, dist: 5 },
  x3: { h: 2.05, rear: 4.4, front: -4.4, dist: 4.5 },
};

/** Linha de visada do ADS com o build (a mira equipada substitui a alça/massa). */
export function sightRef(id: WeaponId, build: Build = {}): SightRef | undefined {
  if (id === 'knife') return undefined;
  const base = WEAPON_REFS[id].sight;
  if (!prog(id) || !build.optic || !base) return base;
  const o = OPTIC_SIGHT[build.optic], mt = MOUNTS[id].optic;
  if (!o || !mt) return base;
  const s = mt.s;
  return { y: mt.p[1] + o.h * s, rearZ: mt.p[2] + o.rear * s, frontZ: mt.p[2] + o.front * s, dist: o.dist };
}

/** Ponta do laser (de onde o feixe sai), ou null sem laser. */
export function laserRef(id: WeaponId, build: Build = {}): P | null {
  if (!prog(id) || !build.laser) return null;
  const mt = MOUNTS[id].laser;
  if (!mt) return null;
  const s = mt.s, [x, y, z] = mt.p;
  return mt.d === '-x' ? [x - 0.55 * s, y, z - 1.5 * s] : [x, y - 0.55 * s, z - 1.5 * s];
}

// ---------------------------------------------------------------- peças

const LENS = 0x3b4f63, RED = 0xff3b30, IR = 0x5fe08a;

/** Peça de boca no fim do cano (eixo y, a partir de z = z1 indo para −Z). */
export function drawMuzzle(m: MeshBuilder, id: ProgWeaponId, att: string, y: number, z1: number, r: number, P: Palette, hi: boolean) {
  const S = hi ? STYLE.sides : STYLE.sidesLo, C: P = [0, y, 0];
  if (att === 'comp') {
    m.tube('z', C, r * 1.45, z1, z1 - 2.6, P.metal, 6);
    if (hi) for (const k of [0.8, 1.7]) m.inset([0, y + r * 1.45 * 0.87, z1 - k], '+y', MeshBuilder.rect(0.5, 0.7), P.hole);
  } else if (att === 'brake') {
    m.chamferBox(-r * 1.7, y - r * 1.25, z1 - 3.4, r * 1.7, y + r * 1.25, z1, P.dark, 0.25);
    if (hi) for (const s of [-1, 1]) for (const k of [0.9, 2.2]) m.inset([s * r * 1.7, y, z1 - k], s > 0 ? '+x' : '-x', MeshBuilder.rect(0.55, r * 1.6), P.hole);
  } else if (att === 'supp') {
    const R = Math.max(1.05, r * 1.85);
    m.tube('z', C, r * 1.2, z1, z1 - 0.8, P.metal, 6, { caps: 'none' });
    m.tube('z', C, R, z1 - 0.8, z1 - 9, shade(P.metal, 1.25), S);
    m.tapeTube('z', C, R, z1 - 4.2, z1 - 2.6, P.accent, hi ? 2 : 1, S);
    if (hi) m.inset([0, y, z1 - 9], '-z', MeshBuilder.hex(r * 0.55, 1), P.hole);
  }
  void id;
}

/** Cano do build (o padrão continua sendo desenhado pela arma, com o comprimento de barrelFor). */
export function drawBarrel(m: MeshBuilder, id: ProgWeaponId, build: Build, color: number, hi: boolean) {
  const b = barrelFor(id, build), S = hi ? STYLE.sides : STYLE.sidesLo, P = PALETTES[id], C: P = [0, b.y, 0];
  m.tube('z', C, b.r, b.z0, b.z1, color, S, { caps: 'end' });
  if (b.kind === 'heavy' && hi) for (let z = b.z0 - 1; z > b.z1 + 0.8; z -= 1.6) m.tube('z', C, b.r * 1.25, z, z - 0.5, P.metal, 6, { caps: 'none' });
  if (b.kind === 'long') m.tapeTube('z', C, b.r, b.z0 - b.len * 0.5, b.z0 - b.len * 0.5 - 1.6, P.accent, hi ? 2 : 1, S);
  if (b.kind === 'short' && hi) m.tube('z', C, b.r * 1.15, b.z1 + 0.6, b.z1, P.metal, 6, { caps: 'none' });
}

/** Mira sobre o trilho (local: base em y = 0, centro em z = 0). Desenha a retícula emissiva no ponto de visada. */
function optic(m: MeshBuilder, att: string, P: Palette, hi: boolean) {
  const o = OPTIC_SIGHT[att], S = hi ? STYLE.sides : STYLE.sidesLo;
  if (att === 'reddot') {
    m.chamferBox(-0.8, 0, -1.3, 0.8, 0.5, 1.3, P.metal, 0.15);
    for (const s of [-1, 1]) m.box(s > 0 ? 0.6 : -0.82, 0.5, -1.3, s > 0 ? 0.82 : -0.6, o.h + 0.75, -0.5, P.dark);
    m.box(-0.82, o.h + 0.55, -1.3, 0.82, o.h + 0.85, -0.5, P.dark);
    m.box(-0.82, 0.5, -1.3, 0.82, o.h - 0.75, -0.5, P.dark);
    if (hi) m.chamferBox(0.82, 0.6, -0.2, 1.12, 1.4, 0.8, P.metal, 0.08); // botão de brilho
    m.box(-0.07, o.h - 0.07, o.front - 0.02, 0.07, o.h + 0.07, o.front + 0.02, RED, 1);
  } else if (att === 'holo') {
    m.chamferBox(-0.95, 0, -1.9, 0.95, 0.65, 1.9, P.dark, 0.2);
    m.chamferBox(-0.75, 0.65, 0.4, 0.75, 1.0, 1.9, P.dark, 0.12); // corpo das pilhas
    for (const z of [-1.9, 1.3]) {
      for (const s of [-1, 1]) m.box(s > 0 ? 0.72 : -0.95, 0.65, z, s > 0 ? 0.95 : -0.72, o.h + 0.95, z + 0.6, P.dark);
      m.box(-0.95, o.h + 0.7, z, 0.95, o.h + 0.95, z + 0.6, P.dark);
    }
    m.box(-0.95, o.h + 0.95, -1.9, 0.95, o.h + 1.15, 1.9, P.metal); // capota
    if (hi) m.inset([0, o.h + 1.15, 0.3], '+y', MeshBuilder.rect(1.4, 0.6), P.hole);
    // retícula: anel de 8 pontos + ponto central
    const z = o.front;
    for (let i = 0; i < (hi ? 8 : 4); i++) {
      const a = (i / (hi ? 8 : 4)) * Math.PI * 2, x = Math.cos(a) * 0.42, y = o.h + Math.sin(a) * 0.42;
      m.box(x - 0.05, y - 0.05, z - 0.02, x + 0.05, y + 0.05, z + 0.02, RED, 1);
    }
    m.box(-0.06, o.h - 0.06, z - 0.02, 0.06, o.h + 0.06, z + 0.02, RED, 1);
  } else {
    // lunetas 2x/3x: anéis, tubo, objetiva e ocular; a retícula vem na tela (overlay)
    const long = att === 'x3', L = long ? 4.4 : 3.4, R = 0.9, Ro = long ? 1.4 : 1.2, C: P = [0, o.h, 0];
    m.chamferBox(-0.85, 0, -L * 0.75, 0.85, 0.45, L * 0.75, P.metal, 0.12);
    for (const z of [-L * 0.45, L * 0.45]) m.chamferBox(-0.7, 0.45, z - 0.5, 0.7, o.h - 0.3, z + 0.5, P.metal, 0.12);
    m.tube('z', C, R, -L * 0.7, L * 0.7, P.dark, S, { caps: 'none' });
    m.tube('z', C, R, -L * 0.7, -L * 0.85, P.dark, S, { r2: Ro, caps: 'none' });
    // tubo aberto: no ADS o olho vê através (as tampas de trás seriam uma parede na frente do olho)
    m.tube('z', C, Ro, -L * 0.85, -L, P.dark, S, { caps: 'none' });
    m.tube('z', C, R * 1.12, L * 0.7, L, P.dark, S, { caps: 'none' });
    if (hi) {
      m.tube('z', C, R * 1.1, -L * 0.15, L * 0.1, P.accent, S, { caps: 'none' }); // anel de destaque
      m.tube('y', [0, 0, -L * 0.15], 0.45, o.h + R - 0.1, o.h + R + 0.45, P.metal, 6, { caps: 'end' });
    }
    m.inset([0, o.h, -L], '-z', MeshBuilder.hex(Ro * 0.8, 1), LENS);
  }
}

/** Lunetas da LONGBOW (local: eixo em y = 2,94 acima do trilho, centro em z = 0). */
function sniperScope(m: MeshBuilder, att: string, P: Palette, hi: boolean) {
  const S = hi ? STYLE.sides : STYLE.sidesLo, h = 2.94, C: P = [0, h, 0];
  for (const z of [-3.9, 4.0]) {
    m.chamferBox(-1.0, 0.02, z - 0.75, 1.0, 1.74, z + 0.75, P.metal, 0.2);
    if (hi) m.tube('z', C, 1.36, z - 0.7, z + 0.7, P.metal, S, { caps: 'none' });
  }
  if (att === 'thermal') {
    m.chamferBox(-1.5, h - 1.5, -6.5, 1.5, h + 1.6, 4.5, P.dark, 0.5);
    m.chamferBox(-1.2, h - 1.2, 4.5, 1.2, h + 1.2, 6.8, P.metal, 0.35); // ocular
    m.chamferBox(-1.7, h - 1.7, -9.4, 1.7, h + 1.8, -6.5, P.dark, 0.4); // para-sol
    m.inset([0, h, -9.4], '-z', MeshBuilder.rect(2.2, 2.2), 0xff8a3d, undefined, 0.2);
    if (hi) {
      for (let i = 0; i < 4; i++) m.box(-1.56, h + 0.6 - i * 0.5, -5.2 + i * 0.1, 1.56, h + 0.8 - i * 0.5, -2.5, shade(P.dark, 0.7));
      m.tube('x', [0, h + 0.4, 1.5], 0.55, 1.5, 2.1, P.metal, 6, { caps: 'end' });
    }
    return;
  }
  const big = att === 'scopeHigh', Ro = big ? 1.95 : 1.4, L0 = big ? -12.5 : -8.5;
  m.tube('z', C, 1.05, L0 + 3.2, 6.0, P.dark, S, { caps: 'none' });
  m.tube('z', C, 1.05, L0 + 3.2, L0 + 1.4, P.dark, S, { r2: Ro, caps: 'none' });
  m.tube('z', C, Ro, L0 + 1.4, L0, P.dark, S);
  m.tube('z', C, 1.3, 6.0, 8.2, P.dark, S, { r2: 1.4 });
  m.chamferBox(-1.25, h - 1.25, -1.6, 1.25, h + 1.25, 1.2, P.dark, 0.45);
  m.tube('y', [0, 0, -0.2], 0.8, h + 1.15, h + (big ? 2.4 : 1.95), P.metal, S, { caps: 'end' });
  m.tube('x', [0, h, -0.2], 0.75, 1.2, 2.2, P.metal, S, { caps: 'end' });
  if (!big) m.tube('z', C, 1.18, 3.2, 4.6, P.accent, S, { caps: 'none' }); // anel de ampliação
  if (big && hi) m.tube('x', [0, h, -0.2], 0.75, -1.2, -2.4, P.metal, S, { caps: 'end' });
  m.inset([0, h, L0], '-z', MeshBuilder.hex(Ro * 0.8, 1), LENS);
}

/** Laser: caixa presa no trilho, com a lente na frente (emissiva). */
function laser(m: MeshBuilder, att: string, d: Mount['d'], P: Palette, hi: boolean) {
  const lens = att === 'laserIr' ? IR : RED, body = att === 'laserFast' ? P.metal : P.dark;
  const w = att === 'laserFast' ? 0.85 : 1.1, L = 3.0;
  const drawBox = () => {
    // local: cresce em +y a partir do trilho
    m.chamferBox(-w / 2, 0, -L / 2, w / 2, w, L / 2, body, 0.15);
    if (hi) m.chamferBox(-w / 2 - 0.05, 0, -0.3, w / 2 + 0.05, 0.3, 0.9, P.metal, 0.06);
    if (att === 'laserFast') m.tapeBox('z', -w / 2, 0, 0.3, w / 2, w, 1.2, P.accent, 1);
    m.tube('z', [0, w / 2, 0], w * 0.32, -L / 2, -L / 2 - 0.12, lens, 6, { emissive: 1 });
  };
  if (d === '-x') m.group([0, 0, 0], [0, 0, Math.PI / 2], drawBox); // +y local → −x (o lado que aparece em primeira pessoa)
  else m.group([0, 0, 0], [0, 0, Math.PI], drawBox); // −y
}

/** Coronhas (local: começa em z = 0 e vai para +Z; eixo da arma em y = 0). */
function stock(m: MeshBuilder, att: string, id: ProgWeaponId, P: Palette, hi: boolean) {
  const L = { rifle: 11, sniper: 13, smg: 9.5, shotgun: 13, pistol: 0 }[id];
  if (att === 'stockNone') {
    m.chamferBox(-1.1, -1.2, 0, 1.1, 1.2, 1.0, P.metal, 0.25);
    if (hi) m.bolt([0, 0, 1.0], '+z', 0.32, P.bolt);
    return;
  }
  if (att === 'stockLight') {
    m.chamferBox(-1.0, -0.9, 0, 1.0, 1.4, 1.2, P.metal, 0.2);
    for (const s of [-0.85, 0.85]) {
      m.beam([s, 1.1, 1.2], [s, 1.2, L], 0.25, P.metal, 0);
      m.beam([s, -0.7, 1.2], [s, -3.9, L], 0.25, P.metal, 0);
    }
    m.chamferBox(-1.15, -4.6, L - 0.2, 1.15, 1.7, L + 0.7, P.dark, 0.25);
    m.tapeBox('z', -0.95, 0.85, L * 0.45, 0.95, 1.45, L * 0.45 + 1.2, P.accent, 1);
    return;
  }
  // pesada: corpo cheio com apoio de bochecha e soleira de borracha
  m.prism('x', [[0, 1.6], [L, 1.6], [L, -4.9], [L - 2.0, -4.9], [2.0, -1.2], [0, -1.2]], -1.35, 1.35, P.body);
  m.chamferBox(-1.25, 1.6, L * 0.35, 1.25, 2.6, L * 0.85, P.body, 0.3);
  m.chamferBox(-1.5, -5.2, L, 1.5, 1.9, L + 1.3, 0x1f2125, 0.4);
  if (hi) {
    m.inset([1.35, -0.6, L * 0.6], '+x', MeshBuilder.rect(L * 0.4, 1.2), shade(P.body, 0.7));
    m.inset([-1.35, -0.6, L * 0.6], '-x', MeshBuilder.rect(L * 0.4, 1.2), shade(P.body, 0.7));
    m.bolt([1.35, 2.0, L * 0.6], '+x', STYLE.boltR, P.bolt);
    m.bolt([-1.35, 2.0, L * 0.6], '-x', STYLE.boltR, P.bolt);
  }
}

/** Empunhaduras frontais e bipé (local: cresce para −Y a partir de y = 0). */
function underbarrel(m: MeshBuilder, att: string, P: Palette, hi: boolean) {
  m.chamferBox(-0.9, -0.5, -1.4, 0.9, 0, 1.4, P.metal, 0.12); // braçadeira no trilho
  if (att === 'gripVert') {
    const prof: P2[] = [[-0.9, -0.5], [0.9, -0.5], [0.7, -4.6], [-0.7, -4.6]];
    m.prism('x', prof, -0.7, 0.7, P.dark);
    m.tapeProfileX(prof, -3.6, -1.6, -0.7, 0.7, P.accent, hi ? 2 : 1);
    m.chamferBox(-0.85, -5.0, -0.85, 0.85, -4.6, 0.85, P.metal, 0.12);
  } else if (att === 'gripAngled') {
    m.prism('x', [[-1.4, -0.5], [1.4, -0.5], [1.9, -2.1], [-0.4, -1.4]], -0.75, 0.75, P.dark);
    if (hi) m.inset([0.75, -1.0, 0.3], '+x', MeshBuilder.rect(1.4, 0.4), P.hole);
  } else {
    // bipé dobrado para trás
    m.chamferBox(-1.2, -1.2, -1.2, 1.2, -0.5, 1.2, P.dark, 0.2);
    for (const s of [-1, 1]) {
      m.tube('z', [s * 0.8, -0.95, 0], 0.32, 1.2, 9.5, P.dark, hi ? 6 : 4, { caps: 'none' });
      m.chamferBox(s * 0.8 - 0.45, -1.5, 9.4, s * 0.8 + 0.45, -0.5, 10.6, P.metal, 0.15);
    }
  }
}

/** Carregadores (local: topo do encaixe em y = 0, frente = −Z). */
function magazine(m: MeshBuilder, att: string, id: ProgWeaponId, P: Palette, hi: boolean) {
  if (id === 'shotgun') {
    // carregador tubular: extensão do tubo / porta-cartuchos rápido no lado direito
    if (att === 'magExt') {
      m.tube('z', [0, 0, 0], 0.8, -21.4, -27.6, P.metal, hi ? STYLE.sides : STYLE.sidesLo, { caps: 'none' });
      m.tapeTube('z', [0, 0, 0], 0.8, -25, -23.6, P.accent, 1, hi ? STYLE.sides : STYLE.sidesLo);
    } else {
      m.chamferBox(1.8, -0.8, 2.6, 2.05, 2.6, 8.4, P.metal, 0.1);
      for (let i = 0; i < 3; i++) m.tube('y', [2.32, 0, 3.4 + i * 1.85], 0.44, -0.6, 2.4, P.extra!, 6);
    }
    return;
  }
  if (id === 'pistol') {
    // no punho: só a base aparece
    if (att === 'magExt') { m.chamferBox(-1.05, -2.6, -1.4, 1.05, 0, 1.7, P.dark, 0.2); m.chamferBox(-1.2, -3.2, -1.6, 1.2, -2.6, 1.9, P.metal, 0.12); }
    else if (att === 'magFast') m.prism('x', [[-1.8, 0], [2.2, 0], [2.6, -1.2], [-2.0, -1.2]], -1.4, 1.4, P.accent);
    else { m.chamferBox(-0.7, -1.8, -0.6, 0.7, 0, 0.6, P.dark, 0.15); m.tube('x', [0, -4.2, 0], 2.6, -1.4, 1.4, P.dark, hi ? 10 : 8); m.tube('x', [0, -4.2, 0], 1.0, 1.4, 1.65, P.metal, 6); }
    return;
  }
  const spec = { rifle: { w: 1.05, d: 3.2, len: 7.3, tilt: 2.5 }, sniper: { w: 1.35, d: 3.6, len: 4.4, tilt: 0 }, smg: { w: 0.9, d: 2.4, len: 9.6, tilt: 0 } }[id];
  const stick = (lenMul: number, color: number) => {
    const back: P2[] = [], front: P2[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3, y = -spec.len * lenMul * t, dz = -spec.tilt * lenMul * t * t;
      back.push([spec.d / 2 + dz, y]); front.push([-spec.d / 2 + dz, y]);
    }
    m.prism('x', [...back, ...front.reverse()], -spec.w, spec.w, color);
    const yb = -spec.len * lenMul, zb = -spec.tilt * lenMul;
    m.chamferBox(-spec.w - 0.15, yb - 0.6, zb - spec.d / 2 - 0.15, spec.w + 0.15, yb, zb + spec.d / 2 + 0.15, P.metal, 0.12);
  };
  if (att === 'magExt') { stick(1.35, P.dark); if (hi) m.inset([spec.w, -spec.len * 0.5, -0.4], '+x', MeshBuilder.rect(1.4, spec.len * 0.6), shade(P.dark, 0.75)); }
  else if (att === 'magFast') {
    stick(1, P.dark);
    m.group([spec.w * 2 + 0.3, 0.9, spec.d * 0.4], null, () => stick(1, shade(P.dark, 1.15)));
    m.tapeBox('y', -spec.w - 0.1, -spec.len * 0.6, -spec.d / 2 - 0.1, spec.w * 3 + 0.4, -spec.len * 0.6 + 1.2, spec.d / 2 + 0.1, P.accent, 1);
  } else {
    // tambor
    m.chamferBox(-spec.w, -2.2, -spec.d / 2, spec.w, 0, spec.d / 2, P.dark, 0.2);
    const R = Math.max(2.9, spec.len * 0.4), cz = -spec.tilt * 0.3;
    m.tube('x', [0, -2.2 - R, cz], R, -spec.w * 1.5, spec.w * 1.5, P.dark, hi ? 12 : 8);
    m.tube('x', [0, -2.2 - R, cz], R * 0.35, spec.w * 1.5, spec.w * 1.5 + 0.3, P.metal, 6);
    m.tube('x', [0, -2.2 - R, cz], R * 0.35, -spec.w * 1.5, -spec.w * 1.5 - 0.3, P.metal, 6);
    if (hi) m.tapeTube('x', [0, -2.2 - R, cz], R, -0.5, 0.5, P.accent, 1, 12);
  }
}

/** Desenha um attachment na arma (categorias com ponto de montagem; cano, boca e empunhadura traseira ficam na arma). */
export function drawAttachment(m: MeshBuilder, id: ProgWeaponId, slot: AttachSlot, att: string, hi: boolean) {
  const P = PALETTES[id], mt = MOUNTS[id][slot];
  if (!mt) return;
  m.group(mt.p, null, () => {
    if (slot === 'optic') { if (id === 'sniper') sniperScope(m, att, P, hi); else optic(m, att, P, hi); }
    else if (slot === 'laser') laser(m, att, mt.d, P, hi);
    else if (slot === 'stock') stock(m, att, id, P, hi);
    else if (slot === 'underbarrel') underbarrel(m, att, P, hi);
    else if (slot === 'magazine') magazine(m, att, id, P, hi);
  }, mt.s);
}

/** Cores da empunhadura traseira do build (fita = mais bandas; borracha = punho fosco sem fita). */
export function rearGripStyle(P: Palette, att?: string): { color: number; tape: number | null; bands: number } {
  if (att === 'rubber') return { color: 0x1d1f22, tape: null, bands: 0 };
  if (att === 'tape') return { color: P.dark, tape: P.accent, bands: 5 };
  return { color: P.dark, tape: P.accent, bands: 3 };
}

export { ITEM_STYLE };

/**
 * Ponto da arma onde fica a peça de cada categoria (modelo), para as linhas do Arsenal: centro
 * aproximado da peça equipada, ou do lugar dela quando a categoria está vazia.
 */
export function slotPoint(id: ProgWeaponId, slot: AttachSlot, build: Build = {}): P {
  const b = barrelFor(id, build), mt = MOUNTS[id][slot], att = build[slot];
  switch (slot) {
    case 'muzzle': { const dev = att ? MUZZLE_LEN[att] ?? 2 : Math.max(1, BARRELS[id].device); return [0, b.y, b.z1 - dev / 2]; }
    case 'barrel': return [0, b.y, (b.z0 + b.z1) / 2];
    case 'optic': { if (!mt) return [0, 5, -4]; const o = att ? OPTIC_SIGHT[att] : undefined; return [0, mt.p[1] + (o ? o.h : id === 'sniper' ? 2.94 : 1) * mt.s, mt.p[2]]; }
    case 'laser': return laserRef(id, build) ?? (mt ? [mt.p[0], mt.p[1], mt.p[2]] : [0, 0, -10]);
    case 'stock': return mt ? [0, mt.p[1] - 0.5, mt.p[2] + 6 * mt.s] : [0, 1, 8];
    case 'underbarrel': return mt ? [0, mt.p[1] - 2.2 * mt.s, mt.p[2]] : [0, -2, -15];
    case 'magazine': return mt ? (id === 'shotgun' ? [0, mt.p[1], mt.p[2] - 10] : [0, mt.p[1] - 3.5 * mt.s, mt.p[2]]) : [0, -4, -4];
    case 'rearGrip': return mt ? mt.p : [0, -3.8, 1.8];
  }
}
