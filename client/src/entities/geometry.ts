// =============================================================
//  Geometria das armas, faca, granadas, itens e luvas no estilo de blocos (sem GL: só MeshBuilder).
//  models.ts transforma isto em GpuMesh; os testes chamam estas funções direto.
//  Coordenadas do modelo: frente = −Z, origem no punho, Y para cima. Pontos de referência em style.ts.
//  Duas versões: 'view' (primeira pessoa, detalhada) e 'world' (terceira pessoa / chão, simplificada).
// =============================================================
import { MeshBuilder, P2 } from '../render/mesh';
import type { WeaponId, NadeKind } from '../../../shared/config/weapons';
import type { PickupKind } from '../../../shared/maps/types';
import { PALETTES, Palette, STYLE, NADE_STYLE, GLOVE, PICKUP_COLORS, ITEM_STYLE, shade } from './style';

export type Lod = 'view' | 'world' | 'far';

// ---------------------------------------------------------------- peças comuns

/** Parafusos nos dois lados (x = ±x). */
function boltsX(m: MeshBuilder, pal: Palette, x: number, pts: [number, number][], r = STYLE.boltR) {
  for (const [y, z] of pts) { m.bolt([x, y, z], '+x', r, pal.bolt); m.bolt([-x, y, z], '-x', r, pal.bolt); }
}

/** Recortes nos dois lados. */
function insetsX(m: MeshBuilder, x: number, pts: [number, number][], shape: P2[], color: number, lip?: number) {
  for (const [y, z] of pts) { m.inset([x, y, z], '+x', shape, color, lip); m.inset([-x, y, z], '-x', shape, color, lip); }
}

/** Guarda-mato (barra de baixo + poste da frente) e gatilho. */
function triggerGuard(m: MeshBuilder, color: number, z0: number, z1: number, yTop: number, yBot: number, hi: boolean) {
  m.chamferBox(-0.4, yBot, z0, 0.4, yBot + 0.45, z1, color, 0.12);
  m.chamferBox(-0.4, yBot, z0, 0.4, yTop, z0 + 0.45, color, 0.12);
  const tz = (z0 + z1) / 2 - 0.1;
  if (hi) m.prism('x', [[tz - 0.25, yTop], [tz + 0.3, yTop], [tz + 0.75, yTop - 1.5], [tz + 0.35, yTop - 1.65]], -0.2, 0.2, color);
  else m.box(-0.2, yTop - 1.5, tz - 0.2, 0.2, yTop, tz + 0.3, color);
}

/** Punho inclinado (perfil em z, y) com fita em bandas. */
function grip(m: MeshBuilder, prof: P2[], hw: number, color: number, tape: number, tapeY: [number, number], hi: boolean) {
  m.prism('x', prof, -hw, hw, color);
  m.tapeProfileX(prof, tapeY[0], tapeY[1], -hw, hw, tape, hi ? 3 : 1);
}

const sides = (hi: boolean) => (hi ? STYLE.sides : STYLE.sidesLo);

// ---------------------------------------------------------------- LONGBOW (sniper)
function sniper(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.sniper, S = sides(hi), ch = STYLE.chamfer, lip = shade(P.body, 1.12);
  // caixa da culatra e guarda-mão com recortes hexagonais
  m.chamferBox(-1.8, -1, -6, 1.8, 4.2, 7.2, P.body, ch);
  m.chamferBox(-1.9, -0.7, -26, 1.9, 4.2, -6, P.body, ch);
  if (hi) {
    m.box(-1.94, -0.45, -6.12, 1.94, 3.95, -5.88, P.hole); // junta
    const hex = MeshBuilder.hex(0.84), tri: P2[] = [[-0.55, 0.28], [0.55, 0.28], [0, -0.34]];
    insetsX(m, 1.9, Array.from({ length: 7 }, (_, i) => [2.45, -23.3 + i * 2.3] as [number, number]), hex, P.hole, lip);
    insetsX(m, 1.9, Array.from({ length: 7 }, (_, i) => [0.75, -23.3 + i * 2.3] as [number, number]), tri, shade(P.body, 0.72));
    m.inset([1.8, 2.7, 2.2], '+x', MeshBuilder.rect(3.4, 1.1), P.hole, lip); // janela de ejeção
  } else {
    insetsX(m, 1.9, [[2.4, -21], [2.4, -16], [2.4, -11]], MeshBuilder.rect(3.6, 0.9), P.hole);
  }
  // trilho superior
  if (hi) m.rail(0, 4.2, -25.5, 6.5, 1.8, P.metal, '+y', { pitch: STYLE.railPitch });
  else m.box(-0.9, 4.2, -25.5, 0.9, 4.7, 6.5, P.metal);
  // cano, freio de boca e fita
  m.tube('z', [0, 2, 0], 0.85, -26, -40.8, P.dark, S, { caps: 'none' });
  m.chamferBox(-1.3, 0.75, -44, 1.3, 3.25, -40.6, P.dark, 0.35);
  if (hi) {
    insetsX(m, 1.3, [[2, -41.6], [2, -43.0]], MeshBuilder.rect(0.6, 1.6), P.hole);
    m.inset([0, 2, -44], '-z', MeshBuilder.hex(0.42, 1), P.hole);
  }
  m.tapeTube('z', [0, 2, 0], 0.85, -32, -29.6, P.accent, hi ? 2 : 1, S);
  // bipé dobrado sob o guarda-mão
  m.chamferBox(-1.2, -1.8, -25.2, 1.2, -0.7, -22.6, P.dark, 0.25);
  for (const s of [-1, 1]) {
    m.tube('z', [s * 0.75, -1.35, 0], 0.36, -22.6, -11.5, P.dark, hi ? 6 : 4, { caps: 'none' });
    if (hi) m.tube('z', [s * 0.75, -1.35, 0], 0.5, -17.6, -16.6, P.metal, 6, { caps: 'none' });
    if (hi) m.chamferBox(s * 0.75 - 0.45, -1.95, -11.6, s * 0.75 + 0.45, -0.95, -10.3, P.metal, 0.15);
  }
  if (hi) boltsX(m, P, 1.2, [[-1.25, -23.9]]);
  // luneta: anéis, tubo, objetiva, ocular, torres e tampas
  const sy = 7.8, C: [number, number, number] = [0, sy, 0];
  for (const z of [-7.5, 0.4]) {
    m.chamferBox(-1.0, 4.88, z - 0.75, 1.0, 6.6, z + 0.75, P.metal, 0.2);
    if (hi) m.tube('z', C, 1.36, z - 0.7, z + 0.7, P.metal, S, { caps: 'none' });
    if (hi) boltsX(m, P, 1.26, [[sy, z]], 0.2);
  }
  m.tube('z', C, 1.05, -11.5, 3.4, P.dark, S, { caps: 'none' });
  m.tube('z', C, 1.05, -11.5, -13.3, P.dark, S, { r2: 1.55, caps: 'none' });
  m.tube('z', C, 1.55, -13.3, -17.6, P.dark, S, { caps: 'none' });
  if (hi) m.tube('z', C, 1.66, -14.1, -14.7, P.metal, S, { caps: 'none' });
  m.tube('z', C, 1.68, -17.6, -18.5, P.metal, S);
  if (hi) m.chamferBox(-0.4, sy + 1.45, -18.4, 0.4, sy + 1.9, -17.3, P.metal, 0.1); // dobradiça da tampa
  m.tube('z', C, 1.1, 3.4, 4.6, P.dark, S, { r2: 1.3, caps: 'none' });
  m.tube('z', C, 1.3, 4.6, 6.8, P.dark, S, { caps: 'none' });
  if (hi) m.tube('z', C, 1.4, 5.2, 5.7, P.metal, S, { caps: 'none' });
  m.tube('z', C, 1.4, 6.8, 7.4, P.metal, S);
  m.chamferBox(-1.25, sy - 1.25, -5.0, 1.25, sy + 1.25, -2.2, P.dark, 0.45);
  if (hi) m.tube('y', [0, 0, -3.6], 1.0, sy + 1.15, sy + 1.45, P.metal, S);
  m.tube('y', [0, 0, -3.6], 0.8, sy + 1.15, sy + 1.95, P.dark, S, { caps: 'end' });
  m.tube('x', [0, sy, -3.6], 0.75, 1.2, 2.2, P.dark, S, { caps: 'end' });
  m.tube('x', [0, sy, -3.6], 0.75, -1.2, -2.2, P.dark, S, { caps: 'end' });
  // ferrolho
  m.tube('z', [0, 2.4, 0], 1.15, 7.2, 8.6, P.metal, S, { caps: 'end' });
  if (hi) m.beam([1.7, 2.9, 5.2], [2.15, 1.7, 6.0], 0.22, P.metal, 0);
  m.chamferBox(1.85, 0.9, 5.6, 2.42, 1.9, 6.6, P.metal, 0.18);
  // carregador em bloco
  m.chamferBox(-1.35, -5.4, -5.4, 1.35, -1, -1.8, P.dark, 0.3);
  m.chamferBox(-1.5, -5.9, -5.6, 1.5, -5.4, -1.6, P.metal, 0.15);
  if (hi) insetsX(m, 1.35, [[-3.2, -3.6]], MeshBuilder.rect(2.2, 2.6), shade(P.dark, 0.7));
  // guarda-mato, gatilho e punho com fita
  triggerGuard(m, P.metal, -1.7, 1.2, -1, -3.3, hi);
  grip(m, [[-0.3, -1], [2.8, -1], [3.9, -6.3], [1.1, -6.7]], 1.1, P.body, P.accent, [-4.9, -2.3], hi);
  // coronha esqueletizada com apoio de bochecha
  m.chamferBox(-1.25, 2.2, 7.2, 1.25, 4.4, 19.5, P.body, 0.35);
  m.chamferBox(-1.15, 4.4, 10.5, 1.15, 5.5, 16.8, P.body, 0.3);
  m.prism('x', [[7.2, 0.6], [7.2, -1.0], [20, -5.6], [20, -3.9]], -1.0, 1.0, P.body);
  m.chamferBox(-1.0, -4.6, 18.2, 1.0, 2.4, 19.8, P.body, 0.3);
  m.chamferBox(-1.45, -6.2, 19.8, 1.45, 4.9, 21.2, P.dark, 0.4);
  if (hi) m.chamferBox(-1.5, -6.3, 21.2, 1.5, 5.0, 22.0, P.metal, 0.4);
  else m.box(-1.45, -6.2, 21.2, 1.45, 4.9, 22.0, P.metal);
  m.tapeBox('z', -1.25, 2.2, 8.4, 1.25, 4.4, 10.2, P.accent, hi ? 2 : 1);
  m.tapeBox('y', -1.0, -3.6, 18.2, 1.0, -1.4, 19.8, P.accent, hi ? 2 : 1);
  if (hi) {
    boltsX(m, P, 1.9, [[0.0, -24.4], [0.0, -18.6], [0.0, -12.8], [0.0, -7.6]]);
    boltsX(m, P, 1.8, [[0.2, -3.4], [0.2, 5.0]]);
    boltsX(m, P, 1.15, [[4.95, 12.0], [4.95, 15.4]]);
    boltsX(m, P, 1.25, [[3.3, 18.7]]);
    m.bolt([0, -5.9, -3.6], '-y', 0.28, P.bolt);
  }
}

// ---------------------------------------------------------------- KESTREL AR (rifle)
function rifle(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.rifle, S = sides(hi), lip = shade(P.body, 1.15);
  // caixa superior e inferior
  m.chamferBox(-1.6, 0.8, -8.5, 1.6, 3.6, 5.6, P.dark, 0.35);
  m.chamferBox(-1.5, -1.5, -6.2, 1.5, 0.8, 4.6, P.dark, 0.3);
  m.chamferBox(-1.62, -2.4, -6.0, 1.62, -1.4, -2.4, P.dark, 0.25);
  // trilho de cima, guarda-mão longo com fendas e trilhos laterais
  m.rail(0, 3.6, -24.5, 4.4, 1.7, P.metal, '+y', { teeth: hi, pitch: STYLE.railPitch });
  m.chamferBox(-1.75, -0.7, -25, 1.75, 3.6, -8.5, P.body, 0.7);
  if (hi) {
    insetsX(m, 1.75, [[1.5, -22.6], [1.5, -19.6], [1.5, -16.6], [1.5, -13.6]], MeshBuilder.rect(2.0, 0.66), P.hole, lip);
    m.rail(1.75, 1.4, -24.6, -20.0, 0.9, P.metal, '+x', { pitch: STYLE.railPitch });
    m.rail(-1.75, 1.4, -24.6, -20.0, 0.9, P.metal, '-x', { pitch: STYLE.railPitch });
    m.inset([0, -0.7, -16], '-y', MeshBuilder.rect(10, 0.8), P.hole, lip);
  }
  m.tapeBox('z', -1.75, -0.7, -11.6, 1.75, 3.6, -9.6, P.accent, hi ? 2 : 1);
  // cano e quebra-chamas
  m.tube('z', [0, 2, 0], 0.62, -25, -31, P.metal, S, { caps: 'none' });
  m.tube('z', [0, 2, 0], 0.88, -31, -34, P.metal, 6);
  if (hi) {
    insetsX(m, 0.762, [[2, -32.5]], MeshBuilder.rect(1.6, 0.3), P.hole);
    m.inset([0, 2, -34], '-z', MeshBuilder.hex(0.32, 1), P.hole);
  }
  // massa e alça de mira rebatíveis (de pé)
  m.chamferBox(-0.7, 4.3, -24.2, 0.7, 4.9, -22.6, P.metal, 0.15);
  m.prism('x', [[-23.9, 4.9], [-23.1, 4.9], [-23.3, 6.5], [-23.7, 6.5]], -0.22, 0.22, P.metal);
  m.chamferBox(-0.75, 4.3, 1.8, 0.75, 4.9, 3.8, P.metal, 0.15);
  m.chamferBox(-0.65, 4.9, 2.6, 0.65, 6.0, 3.2, P.metal, 0.12);
  if (hi) {
    for (const s of [-1, 1]) m.box(s > 0 ? 0.4 : -0.62, 4.9, -23.9, s > 0 ? 0.62 : -0.4, 6.1, -23.1, P.metal);
    m.inset([0, 5.55, 2.6], '-z', MeshBuilder.hex(0.2, 1), P.hole);
  }
  // alavanca de manejo, assistente e janela de ejeção
  m.chamferBox(-1.9, 3.0, 5.6, 1.9, 3.55, 6.6, P.metal, 0.15);
  if (hi) {
    m.tube('x', [0, 2.6, 3.4], 0.45, 1.6, 2.25, P.metal, 6);
    m.inset([1.6, 2.2, -1.5], '+x', MeshBuilder.rect(3.4, 1.0), P.hole, lip);
  }
  // carregador curvo facetado
  const back: P2[] = [], front: P2[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4, y = -1.5 - 7.3 * t, dz = -2.5 * t * t;
    back.push([-2.6 + dz, y]); front.push([-5.8 + dz, y]);
  }
  m.prism('x', [...back, ...front.reverse()], -1.05, 1.05, P.dark);
  m.prism('x', [[-4.9, -8.6], [-8.5, -8.6], [-8.6, -9.3], [-4.8, -9.3]], -1.2, 1.2, P.metal);
  if (hi) insetsX(m, 1.05, [[-5.0, -5.1]], MeshBuilder.rect(1.8, 4.6), shade(P.dark, 0.75));
  // punho, guarda-mato
  triggerGuard(m, P.metal, -2.3, 1.0, -1.5, -3.5, hi);
  grip(m, [[-0.2, -1.4], [2.6, -1.4], [3.6, -6.2], [1.0, -6.6]], 1.05, P.dark, P.accent, [-5.4, -3.0], hi);
  // tubo e coronha ajustável
  m.tube('z', [0, 2.0, 0], 0.72, 5.6, 12.5, P.metal, S);
  m.prism('x', [[8.6, 3.5], [16, 3.5], [16, -3.6], [14.6, -3.6], [9.4, 0.6], [8.6, 0.6]], -1.3, 1.3, P.body);
  m.chamferBox(-1.4, -3.8, 16, 1.4, 3.7, 16.9, P.metal, 0.35);
  if (hi) {
    m.box(-0.35, 0.3, 10, 0.35, 1.2, 12.5, P.metal);
    insetsX(m, 1.3, [[1.6, 13.4]], MeshBuilder.rect(2.6, 1.4), P.hole, lip);
    boltsX(m, P, 1.75, [[0.0, -23.2], [0.0, -17.2], [0.0, -12.2]]);
    boltsX(m, P, 1.5, [[-0.4, -4.6], [-0.4, 2.8]]);
    boltsX(m, P, 1.3, [[2.6, 14.8]]);
  }
}

// ---------------------------------------------------------------- HORNET (SMG)
function smg(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.smg, lip = shade(P.body, 1.12);
  m.chamferBox(-1.8, -1, -12, 1.8, 4.0, 4, P.dark, 0.4);
  m.chamferBox(-1.55, 4.0, -11.2, 1.55, 4.5, 3.2, P.body, 0.2);
  m.rail(0, 4.5, -9.5, 0.5, 1.4, P.metal, '+y', { teeth: hi, pitch: STYLE.railPitch });
  // capa do cano com respiros
  m.chamferBox(-1.0, 0.85, -17.4, 1.0, 3.15, -12, P.body, 0.4);
  if (hi) insetsX(m, 1.0, [[2.0, -16.4], [2.0, -14.9], [2.0, -13.4]], MeshBuilder.hex(0.36), P.hole, lip);
  m.tube('z', [0, 2, 0], 0.5, -17.4, -19.2, P.metal, 6, { caps: 'none' });
  m.tube('z', [0, 2, 0], 0.72, -19.2, -20.6, P.metal, 6);
  if (hi) m.inset([0, 2, -20.6], '-z', MeshBuilder.hex(0.28, 1), P.hole);
  // carregador reto longo com fita
  m.chamferBox(-1.15, -2.4, -6.9, 1.15, -1, -3.9, P.dark, 0.25);
  m.chamferBox(-0.9, -10.6, -6.6, 0.9, -2.6, -4.2, P.metal, 0.25);
  m.chamferBox(-1.05, -11.4, -6.8, 1.05, -10.6, -4.0, P.dark, 0.15);
  m.tapeBox('y', -0.9, -8.6, -6.6, 0.9, -7.0, -4.2, P.accent, hi ? 2 : 1);
  if (hi) insetsX(m, 0.9, [[-4.6, -5.4]], MeshBuilder.rect(1.4, 3.0), shade(P.metal, 1.6));
  // empunhadura frontal
  const fg: P2[] = [[-11.2, -1], [-9.6, -1], [-9.8, -4.0], [-11.0, -4.0]];
  m.prism('x', fg, -0.75, 0.75, P.body);
  m.tapeProfileX(fg, -3.4, -2.0, -0.75, 0.75, P.accent, hi ? 2 : 1);
  m.chamferBox(-0.85, -4.4, -11.2, 0.85, -4.0, -9.6, P.metal, 0.15);
  // punho e guarda-mato
  triggerGuard(m, P.metal, -2.0, 1.0, -1, -3.0, hi);
  grip(m, [[-0.2, -1], [2.6, -1], [3.5, -6.2], [0.9, -6.5]], 1.05, P.dark, P.accent, [-5.2, -2.8], hi);
  // coronha de arame (vigas finas)
  m.chamferBox(-1.25, 0.2, 4, 1.25, 3.5, 5.2, P.metal, 0.25);
  for (const s of [-1.05, 1.05]) {
    m.beam([s, 3.1, 5.2], [s, 2.9, 12.4], 0.22, P.metal, 0);
    m.beam([s, 0.5, 5.2], [s, -0.2, 12.4], 0.22, P.metal, 0);
    if (hi) m.beam([s, 0.7, 6.0], [s, 2.7, 11.6], 0.2, P.metal, 0);
  }
  m.chamferBox(-1.3, -0.6, 12.2, 1.3, 3.4, 13.0, P.metal, 0.2);
  // alavanca de manejo (lado esquerdo), seletor e janela de ejeção
  m.chamferBox(-2.25, 3.0, -9.5, -1.8, 3.7, -8.3, P.metal, 0.12);
  if (hi) {
    m.inset([-1.8, 3.35, -5], '-x', MeshBuilder.rect(8, 0.35), P.hole);
    m.tube('x', [0, 1.2, 1.6], 0.42, -1.8, -2.15, P.metal, 6);
    m.inset([1.8, 2.6, -3], '+x', MeshBuilder.rect(3.0, 1.0), P.hole, lip);
    boltsX(m, P, 1.8, [[0.0, -10.6], [0.0, -2.0]]);
    boltsX(m, P, 1.0, [[1.25, -16.9]], 0.2);
    boltsX(m, P, 1.55, [[4.25, -10.4], [4.25, 2.4]], 0.2);
  }
}

// ---------------------------------------------------------------- BREAKER-12 (shotgun)
function shotgun(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.shotgun, S = sides(hi), lip = shade(P.body, 1.08);
  m.chamferBox(-1.8, -1, -12, 1.8, 4.1, 4, P.body, 0.45);
  if (hi) m.inset([1.8, 2.4, -5], '+x', MeshBuilder.rect(4.6, 1.3), P.hole, lip);
  // cano com faixa de ventilação, massa e anel da boca
  m.tube('z', [0, 3, 0], 1.0, -12, -36.6, P.metal, S, { caps: 'none' });
  m.tube('z', [0, 3, 0], 1.18, -36.6, -37.6, P.metal, S);
  if (hi) m.inset([0, 3, -37.6], '-z', MeshBuilder.hex(0.6, 1), P.hole);
  m.box(-0.32, 3.9, -36.4, 0.32, 4.3, -12, P.metal);
  m.tube('y', [0, 0, -36.0], 0.24, 4.3, 4.65, P.bolt, 6);
  m.chamferBox(-0.7, 4.1, 1.5, 0.7, 4.8, 3.2, P.metal, 0.15);
  m.tapeTube('z', [0, 3, 0], 1.0, -30.4, -28.4, P.accent, hi ? 2 : 1, S);
  // tubo do carregador e abraçadeira
  m.tube('z', [0, 0.95, 0], 0.8, -12, -33.4, P.metal, S, { caps: 'none' });
  m.tube('z', [0, 0.95, 0], 0.9, -33.4, -34.4, P.metal, S);
  m.chamferBox(-1.0, 0.3, -33.0, 1.0, 3.9, -31.8, P.metal, 0.3);
  // telha com ranhuras
  m.chamferBox(-1.9, -0.7, -27.5, 1.9, 2.4, -17, P.dark, 0.55);
  if (hi) for (let i = 0; i < 6; i++) { const z = -26.3 + i * 1.6; m.box(-1.96, -0.76, z, 1.96, 1.6, z + 0.45, shade(P.dark, 0.62)); }
  // porta-cartuchos lateral (lado esquerdo, o que aparece em primeira pessoa)
  m.chamferBox(-2.05, 0.0, -10.6, -1.8, 3.6, -3.0, P.metal, 0.12);
  for (let i = 0; i < 4; i++) {
    const z = -9.7 + i * 1.85;
    m.tube('y', [-2.32, 0, z], 0.44, 0.3, 3.45, P.extra!, 6);
    if (hi) m.tube('y', [-2.32, 0, z], 0.47, 0.15, 1.0, ITEM_STYLE.brass, 6);
  }
  if (hi) m.box(-2.76, 1.9, -10.4, -2.0, 2.3, -3.2, P.dark);
  // punho, coronha e soleira
  triggerGuard(m, P.metal, -2.2, 1.2, -1, -3.2, hi);
  grip(m, [[-0.2, -1], [2.8, -1], [3.8, -6.0], [1.2, -6.3]], 1.1, P.dark, P.accent, [-5.0, -2.4], hi);
  m.prism('x', [[4, 4.1], [17.4, 3.3], [17.4, -4.6], [15.8, -4.6], [5.6, -1.0], [4, -1.0]], -1.4, 1.4, P.dark);
  m.chamferBox(-1.5, -4.9, 17.4, 1.5, 3.6, 18.6, P.metal, 0.4);
  if (hi) {
    insetsX(m, 1.4, [[1.4, 11.5]], MeshBuilder.rect(6, 0.3), shade(P.dark, 0.6));
    boltsX(m, P, 1.0, [[2.0, -32.4]], 0.2);
    m.bolt([1.8, 0.0, -11.3], '+x', STYLE.boltR, P.bolt); m.bolt([-1.8, 0.0, -11.3], '-x', STYLE.boltR, P.bolt);
    boltsX(m, P, 1.8, [[0.0, 2.6]]);
    boltsX(m, P, 1.4, [[2.4, 16.2]]);
  }
}

// ---------------------------------------------------------------- VEX-9 (pistola)
function pistol(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.pistol, ser = shade(P.body, 0.75);
  // ferrolho com serrilhas em blocos
  m.chamferBox(-1.42, 1.2, -14.4, 1.42, 4.0, 2.4, P.body, 0.55);
  if (hi) {
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 1.42 : -1.56, x1 = s > 0 ? 1.56 : -1.42;
      for (let i = 0; i < 5; i++) { const z = -0.4 + i * 0.5; m.box(x0, 1.8, z, x1, 3.4, z + 0.26, ser); }
      for (let i = 0; i < 3; i++) { const z = -12.8 + i * 0.5; m.box(x0, 1.8, z, x1, 3.4, z + 0.26, ser); }
    }
    m.inset([0.25, 4.0, -4.5], '+y', MeshBuilder.rect(3.2, 1.6), P.hole, shade(P.body, 1.15));
  }
  m.tube('z', [0, 2.5, 0], 0.6, -14.4, -14.9, P.metal, 8);
  if (hi) m.inset([0, 2.5, -14.9], '-z', MeshBuilder.hex(0.3, 1), P.hole);
  // miras de ferro
  m.chamferBox(-0.28, 4.0, -13.8, 0.28, 4.65, -12.9, P.dark, 0.1);
  m.chamferBox(-0.85, 4.0, 0.6, 0.85, 4.4, 1.9, P.dark, 0.1);
  for (const s of [-1, 1]) m.box(s > 0 ? 0.3 : -0.85, 4.4, 0.6, s > 0 ? 0.85 : -0.3, 4.85, 1.9, P.dark);
  if (hi) m.inset([0, 4.35, -12.9], '+z', MeshBuilder.hex(0.11, 1), ITEM_STYLE.white);
  // armação com base de trilho
  m.chamferBox(-1.32, -0.5, -12.8, 1.32, 1.2, 1.8, P.dark, 0.3);
  m.rail(0, -0.5, -12.2, -6.2, 1.4, P.metal, '-y', { teeth: hi, pitch: 1.1 });
  // guarda-mato quadrado e gatilho
  m.box(-0.38, -2.9, -5.3, 0.38, -2.4, -0.4, P.dark);
  m.box(-0.38, -2.9, -5.3, 0.38, -0.5, -4.75, P.dark);
  if (hi) m.prism('x', [[-3.2, -0.5], [-2.7, -0.5], [-2.2, -1.9], [-2.6, -2.0]], -0.2, 0.2, P.metal);
  else m.box(-0.2, -1.9, -3.2, 0.2, -0.5, -2.6, P.metal);
  // punho com fita, base do carregador, rabo de castor e cão
  grip(m, [[-0.8, -0.5], [2.4, -0.5], [3.3, -6.6], [0.3, -6.9]], 1.25, P.dark, P.accent, [-5.2, -2.6], hi);
  m.chamferBox(-1.2, -7.4, 0.1, 1.2, -6.8, 3.3, P.metal, 0.15);
  m.chamferBox(-1.0, -0.5, 1.8, 1.0, 0.6, 3.4, P.dark, 0.25);
  if (hi) {
    m.chamferBox(-0.35, 1.6, 2.4, 0.35, 3.4, 3.1, P.metal, 0.1);
    m.chamferBox(-1.55, 0.7, -6.6, -1.32, 1.25, -3.2, P.metal, 0.08);
    m.tube('x', [0, 0.5, -7.8], 0.32, -1.32, -1.55, P.metal, 6);
    boltsX(m, P, 1.32, [[0.35, -11.4]], 0.2);
  }
}

// ---------------------------------------------------------------- VOLT-1 (taser)
function taser(m: MeshBuilder, hi: boolean) {
  const P = PALETTES.taser;
  m.chamferBox(-1.7, -0.4, -10.4, 1.7, 4.0, 2.2, P.body, 0.5);
  // faixas de alerta pretas e amarelas (diagonais nos dois lados)
  for (const x of [1.72, -1.72]) for (let i = 0; i < (hi ? 4 : 2); i++) {
    const z0 = -3.4 + i * (hi ? 1.25 : 2.5);
    m.quad([x, 0.15, z0], [x, 0.15, z0 + 0.6], [x, 3.45, z0 + 1.6], [x, 3.45, z0 + 1.0], P.dark, 0, [Math.sign(x), 0, 0]);
  }
  // cartucho frontal destacável com dois eletrodos
  m.chamferBox(-1.6, -0.2, -13.2, 1.6, 3.8, -10.4, P.dark, 0.45);
  m.box(-1.66, 0.0, -10.56, 1.66, 3.6, -10.34, P.hole);
  m.chamferBox(1.6, 1.0, -12.4, 1.9, 2.6, -11.2, P.metal, 0.1);
  m.chamferBox(-1.9, 1.0, -12.4, -1.6, 2.6, -11.2, P.metal, 0.1);
  for (const s of [-0.75, 0.75]) {
    m.tube('z', [s, 2.6, 0], 0.32, -13.2, -13.5, P.metal, 6);
    if (hi) m.tube('z', [s, 2.6, 0], 0.15, -13.5, -13.7, ITEM_STYLE.bolt, 6);
  }
  if (hi) m.inset([0, 0.9, -13.2], '-z', MeshBuilder.rect(2.4, 0.8), P.hole);
  // indicador de carga (o único LED)
  m.chamferBox(-0.65, 3.95, 0.0, 0.65, 4.12, 1.6, P.dark, 0.06);
  m.box(-0.42, 4.12, 0.2, 0.42, 4.28, 1.4, P.extra!, 1);
  // punho com fita amarela, guarda-mato e lanterna
  triggerGuard(m, P.dark, -2.4, 0.4, -0.4, -2.6, hi);
  grip(m, [[-0.6, -0.4], [2.2, -0.4], [3.0, -6.8], [0.4, -7.2]], 1.2, P.dark, P.accent, [-5.6, -3.0], hi);
  m.chamferBox(-1.1, -1.4, -10, 1.1, -0.4, -6.2, P.dark, 0.25);
  if (hi) {
    m.inset([0, -0.9, -10], '-z', MeshBuilder.hex(0.32, 1), 0x8f97a3);
    m.chamferBox(-1.85, 2.6, -1.6, -1.7, 3.2, -0.4, P.metal, 0.06);
    boltsX(m, P, 1.7, [[3.3, -9.3], [0.6, -9.3]]);
  }
}

// ---------------------------------------------------------------- BALISONG (faca borboleta)
// Pinos de articulação na origem; lâmina aponta para −Z e os cabos para +Z quando aberta.
// Os cabos giram em torno do eixo X (pitch) para abrir/fechar.

export function butterflyBlade(m: MeshBuilder) {
  const P = PALETTES.knife, t = 0.32, edge = shade(P.body, 0.86), fio = 0xf2f6ff;
  // parte de cima (chata) e parte de baixo (desbaste até o fio), cada uma com poucas faces
  const upper: [number, number, number][] = [[0.6, 1.1, t], [-9.5, 1.25, t], [-15.6, 0.45, 0.14], [-16.6, -0.2, 0.04], [-12.6, -0.25, t], [-1.2, -0.25, t], [0.6, -0.15, t]];
  const lower: [number, number, number][] = [[0.6, -0.15, t], [-1.2, -0.25, t], [-12.6, -0.25, t], [-16.6, -0.2, 0.04], [-12, -1.15, 0.04], [-1.5, -1.3, 0.04], [0.6, -0.9, 0.25]];
  m.slabX(upper, P.body, shade(P.body, 0.92), [3, 4, 5]);
  m.slabX(lower, edge, fio, [0, 1, 2]);
  // fenda de alívio (sem neon) e bucha do pino
  m.inset([t, 0.42, -4.5], '+x', MeshBuilder.rect(3, 0.38), P.hole);
  m.inset([-t, 0.42, -4.5], '-x', MeshBuilder.rect(3, 0.38), P.hole);
  m.tube('x', [0, 0, 0], 0.42, -0.36, 0.36, P.metal, 6);
}

export function butterflyHandle(m: MeshBuilder, side: 1 | -1, hi = true) {
  const P = PALETTES.knife;
  const a = side > 0 ? 0.36 : -1.36, b = side > 0 ? 1.36 : -0.36;
  const inner = side > 0 ? a : b, outer = side > 0 ? b : a, dir = side > 0 ? '+x' : '-x';
  // forro interno (aparece pelas janelas do cabo esqueletizado)
  const lx0 = side > 0 ? a : b - 0.22, lx1 = side > 0 ? a + 0.22 : b;
  m.box(lx0, -0.56, 1.4, lx1, 0.56, 12.4, P.metal);
  // estrutura: bloco do pino, trilhos de cima e de baixo, travessas e ponta
  m.chamferBox(a, -1.25, -0.6, b, 1.25, 1.4, P.dark, 0.45, 'x');
  m.chamferBox(a, 0.55, 1.4, b, 1.25, 12.4, P.dark, 0.2, 'x');
  m.chamferBox(a, -1.25, 1.4, b, -0.55, 12.4, P.dark, 0.2, 'x');
  const fx0 = side > 0 ? a + 0.2 : a, fx1 = side > 0 ? b : b - 0.2;
  for (const z of [4.6, 8.6]) m.box(fx0, -0.56, z, fx1, 0.56, z + 0.8, P.dark);
  m.chamferBox(a, -1.25, 12.4, b, 1.25, 13.0, P.dark, 0.3, 'x');
  // parafusos visíveis do lado de fora
  const zs = hi ? [0, 5.0, 9.0, 12.7] : [0];
  for (const z of zs) m.bolt([outer, 0, z], dir, z === 0 ? 0.34 : 0.24, P.bolt);
  m.tube('x', [0, 0, 0], 0.3, inner - 0.04, outer, P.metal, 6, { caps: 'none' });
  // fita (em U: fora, em cima e embaixo — o lado de dentro fica livre para a lâmina)
  const bands = hi ? 2 : 1, bw = (11.9 - 9.9 - 0.07 * (bands - 1)) / bands;
  for (let i = 0; i < bands; i++) {
    const s = 9.9 + i * (bw + 0.07), e = 0.12 + (i % 2) * 0.03;
    const x0 = side > 0 ? a + 0.25 : a - e, x1 = side > 0 ? b + e : b - 0.25;
    m.chamferBox(x0, -1.25 - e, s, x1, 1.25 + e, s + bw, P.accent, 0.15);
  }
  // trava no cabo "safe"
  if (side > 0) m.chamferBox(a, -0.5, 12.6, b + 0.5, 0.5, 13.6, ITEM_STYLE.bolt, 0.12);
}


// ---------------------------------------------------------------- versões "longe" (só a silhueta e as cores)
// Usadas para itens no chão e armas na mão dos outros a mais de LOD_FAR_DIST (orçamento TRI_BUDGET.far).

function farWeapon(m: MeshBuilder, id: WeaponId) {
  const P = PALETTES[id];
  const grip = (prof: P2[], hw: number, color: number, tapeY: [number, number]) => { m.prism('x', prof, -hw, hw, color); m.tapeProfileX(prof, tapeY[0], tapeY[1], -hw, hw, P.accent, 1); };
  switch (id) {
    case 'sniper':
      m.box(-1.85, -1, -26, 1.85, 4.2, 7.2, P.body);
      m.box(-0.8, 1.2, -44, 0.8, 2.8, -26, P.dark);
      m.box(-1.0, 4.2, -8, 1.0, 6.7, 1, P.metal);
      m.box(-1.2, 6.7, -18.5, 1.2, 8.9, 7.4, P.dark);
      m.box(-1.35, -5.9, -5.6, 1.35, -1, -1.8, P.dark);
      grip([[-0.3, -1], [2.8, -1], [3.9, -6.3], [1.1, -6.7]], 1.1, P.body, [-4.9, -2.3]);
      m.box(-1.25, 2.2, 7.2, 1.25, 4.4, 19.8, P.body);
      m.prism('x', [[7.2, 0.6], [7.2, -1.0], [20, -5.6], [20, -3.9]], -1.0, 1.0, P.body);
      m.box(-1.45, -6.2, 19.8, 1.45, 4.9, 22, P.dark);
      break;
    case 'rifle':
      m.box(-1.6, -1.5, -8.5, 1.6, 3.6, 5.6, P.dark);
      m.box(-1.75, -0.7, -25, 1.75, 3.6, -8.5, P.body);
      m.box(-0.6, 1.4, -34, 0.6, 2.6, -25, P.metal);
      m.box(-0.5, 3.6, -24.2, 0.5, 6.5, -22.6, P.metal);
      m.prism('x', [[-2.6, -1.5], [-5.1, -8.8], [-8.3, -8.8], [-5.8, -1.5]], -1.05, 1.05, P.dark);
      grip([[-0.2, -1.4], [2.6, -1.4], [3.6, -6.2], [1.0, -6.6]], 1.05, P.dark, [-5.4, -3.0]);
      m.box(-0.7, 1.3, 5.6, 0.7, 2.7, 9, P.metal);
      m.prism('x', [[8.6, 3.5], [16.9, 3.5], [16.9, -3.7], [14.6, -3.7], [9.4, 0.6], [8.6, 0.6]], -1.3, 1.3, P.body);
      break;
    case 'smg':
      m.box(-1.8, -1, -12, 1.8, 4.5, 4, P.dark);
      m.box(-1.0, 0.85, -17.4, 1.0, 3.15, -12, P.body);
      m.box(-0.6, 1.4, -20.6, 0.6, 2.6, -17.4, P.metal);
      m.box(-0.9, -11.4, -6.6, 0.9, -1, -4.2, P.metal);
      m.box(-0.95, -8.6, -6.7, 0.95, -7.0, -4.1, P.accent);
      m.box(-0.75, -4.4, -11.2, 0.75, -1, -9.6, P.body);
      grip([[-0.2, -1], [2.6, -1], [3.5, -6.2], [0.9, -6.5]], 1.05, P.dark, [-5.2, -2.8]);
      m.box(-1.25, 2.7, 4, 1.25, 3.3, 12.4, P.metal);
      m.box(-1.3, -0.6, 12.2, 1.3, 3.4, 13, P.metal);
      break;
    case 'shotgun':
      m.box(-1.8, -1, -12, 1.8, 4.1, 4, P.body);
      m.box(-0.9, 2.1, -37.6, 0.9, 3.9, -12, P.metal);
      m.box(-0.75, 0.2, -34.4, 0.75, 1.7, -12, P.metal);
      m.box(-1.9, -0.7, -27.5, 1.9, 2.4, -17, P.dark);
      m.box(-2.7, 0.3, -10.4, -1.8, 3.45, -3.6, P.extra!);
      grip([[-0.2, -1], [2.8, -1], [3.8, -6.0], [1.2, -6.3]], 1.1, P.dark, [-5.0, -2.4]);
      m.prism('x', [[4, 4.1], [18.6, 3.3], [18.6, -4.9], [15.8, -4.9], [5.6, -1.0], [4, -1.0]], -1.4, 1.4, P.dark);
      break;
    case 'pistol':
      m.box(-1.42, 1.2, -14.9, 1.42, 4.0, 2.4, P.body);
      m.box(-1.32, -0.5, -12.8, 1.32, 1.2, 1.8, P.dark);
      m.box(-0.38, -2.9, -5.3, 0.38, -2.4, -0.4, P.dark);
      grip([[-0.8, -0.5], [2.4, -0.5], [3.3, -6.6], [0.3, -6.9]], 1.25, P.dark, [-5.2, -2.6]);
      m.box(-1.2, -7.4, 0.1, 1.2, -6.8, 3.3, P.metal);
      break;
    case 'taser':
      m.box(-1.7, -0.4, -10.4, 1.7, 4.0, 2.2, P.body);
      for (const x of [1.72, -1.72]) m.quad([x, 0.15, -2.2], [x, 0.15, -1.4], [x, 3.45, 0.2], [x, 3.45, -0.6], P.dark, 0, [Math.sign(x), 0, 0]);
      m.box(-1.6, -0.2, -13.6, 1.6, 3.8, -10.4, P.dark);
      grip([[-0.6, -0.4], [2.2, -0.4], [3.0, -6.8], [0.4, -7.2]], 1.2, P.dark, [-5.6, -3.0]);
      break;
    case 'knife':
      m.slabX([[0.6, 1.1, 0.3], [-9.5, 1.25, 0.3], [-15.6, 0.45, 0.14], [-16.6, -0.2, 0.04], [-12, -1.15, 0.04], [-1.5, -1.3, 0.04], [0.6, -0.9, 0.25]], P.body);
      m.box(0.36, -1.25, -0.6, 1.36, 1.25, 13, P.dark);
      m.box(-1.36, -1.25, -0.6, -0.36, 1.25, 13, P.dark);
      m.box(-1.5, -1.38, 9.9, 1.5, 1.38, 11.9, P.accent);
      m.box(0.36, -0.5, 12.6, 1.86, 0.5, 13.6, ITEM_STYLE.bolt);
      break;
  }
}

function farNade(m: MeshBuilder, kind: NadeKind) {
  const N = NADE_STYLE[kind], C: [number, number, number] = [0, 0, 0], rr = kind === 'smoke' ? 3.0 : 3.5;
  m.tube('y', C, rr, -4.2, 2.9, N.body, 6);
  m.tube('y', C, rr + 0.12, -0.9, 0.9, N.band, 6, { caps: 'none' });
  m.tube('y', C, 1.25, 2.9, 4.1, N.cap, 6, { caps: 'end' });
  m.box(0.6, 4.1, -0.6, rr + 0.4, 4.55, 0.6, N.cap);
  m.box(rr, -1.0, -0.6, rr + 0.4, 4.1, 0.6, N.cap);
}

function farPickup(m: MeshBuilder, kind: PickupKind) {
  const I = ITEM_STYLE, main = PICKUP_COLORS[kind];
  switch (kind) {
    case 'ammo': m.box(-8.6, 0, -5.6, 8.6, 8.6, 5.6, main); m.box(-8.9, 8.6, -5.9, 8.9, 10.2, 5.9, I.dark); m.box(-3.2, 10.2, -0.7, 3.2, 12.2, 0.7, I.metal); break;
    case 'medkit': m.box(-9.6, 0, -6.6, 9.6, 11.6, 6.6, main); m.box(-1.6, 2.2, -7.1, 1.6, 9.4, 7.1, I.white); m.box(-4.8, 4.2, -7.1, 4.8, 7.4, 7.1, I.white); m.box(-3.6, 11.6, -0.8, 3.6, 13.9, 0.8, I.dark); break;
    case 'armor': m.box(-9.4, 0, -3.4, 9.4, 16, 3.4, I.fabric); m.box(-9.4, 16, -3.4, -4.6, 20, 3.4, I.fabric); m.box(4.6, 16, -3.4, 9.4, 20, 3.4, I.fabric); m.box(-6.4, 4.0, -4.4, 6.4, 14.4, 4.4, main); break;
    case 'shield': m.tube('y', [0, 0, 0], 11, 0, 3.2, I.dark, 6, { caps: 'start' }); m.tube('y', [0, 0, 0], 9.2, 3.2, 4.4, main, 6, { caps: 'end' }); m.tube('y', [0, 0, 0], 6.4, 4.4, 9.4, I.white, 6, { r2: 1.6, caps: 'end' }); break;
    case 'speed': {
      m.box(-7, 0, -3, 7, 2.4, 3, I.dark);
      const chev: P2[] = [[-6.5, 2.4], [0, 8.9], [6.5, 2.4], [6.5, 5.6], [0, 12.1], [-6.5, 5.6]];
      m.prism('z', chev, -1.6, 1.6, main);
      m.prism('z', chev.map(([x, y]) => [x * 0.8, y + 6.2] as P2), -1.4, 1.4, main);
      break;
    }
    case 'nade_he': m.group([0, 6.3, 0], null, () => farNade(m, 'he'), 1.5); break;
    case 'nade_smoke': m.group([0, 6.3, 0], null, () => farNade(m, 'smoke'), 1.5); break;
    case 'nade_impulse': m.group([0, 6.3, 0], null, () => farNade(m, 'impulse'), 1.5); break;
    default: m.box(-6, 0, -6, 6, 12, 6, 0xffffff, 1);
  }
}

// ---------------------------------------------------------------- armas: entrada

export function weaponGeometry(id: WeaponId, lod: Lod = 'view'): MeshBuilder {
  const m = new MeshBuilder(), hi = lod === 'view';
  if (lod === 'far') { farWeapon(m, id); return m; }
  if (!hi) m.minChamfer = 0.38; // longe só os chanfros grandes contam
  switch (id) {
    case 'sniper': sniper(m, hi); break;
    case 'rifle': rifle(m, hi); break;
    case 'smg': smg(m, hi); break;
    case 'shotgun': shotgun(m, hi); break;
    case 'pistol': pistol(m, hi); break;
    case 'taser': taser(m, hi); break;
    case 'knife': butterflyBlade(m); butterflyHandle(m, 1, hi); butterflyHandle(m, -1, hi); break;
  }
  return m;
}

export function butterflyGeometry(): { blade: MeshBuilder; safe: MeshBuilder; bite: MeshBuilder } {
  const blade = new MeshBuilder(), safe = new MeshBuilder(), bite = new MeshBuilder();
  butterflyBlade(blade); butterflyHandle(safe, 1); butterflyHandle(bite, -1);
  return { blade, safe, bite };
}

// ---------------------------------------------------------------- granadas

/** Granada (centro no meio do corpo, ~±4 u). `lod` 'world' = granada lançada. */
export function nadeInto(m: MeshBuilder, kind: NadeKind, hi: boolean) {
  const N = NADE_STYLE[kind], S = sides(hi), C: [number, number, number] = [0, 0, 0];
  let rr: number, top: number;
  if (kind === 'smoke') {
    rr = 3.0; top = 3.0;
    m.tube('y', C, 3.0, -4.2, 3.0, N.body, S);
    for (const [y0, y1] of [[-1.6, -0.4], [0.4, 1.6]]) m.tube('y', C, 3.12, y0, y1, N.band, S, { caps: 'none' });
    m.tube('y', C, 3.12, -4.2, -3.6, N.cap, S, { caps: 'none' });
    if (hi) for (const [x, z] of [[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]]) m.inset([x, 3.0, z], '+y', MeshBuilder.rect(0.7, 0.7), ITEM_STYLE.hole);
  } else {
    rr = 3.6; top = 2.9;
    m.tube('y', C, 2.5, -4.2, -3.2, N.body, S, { r2: 3.6, caps: 'start' });
    m.tube('y', C, 3.6, -3.2, 1.6, N.body, S, { caps: 'none' });
    m.tube('y', C, 3.6, 1.6, 2.9, N.body, S, { r2: 2.2, caps: 'end' });
    if (kind === 'he') {
      m.tube('y', C, 3.72, -0.8, 0.6, N.band, S, { caps: 'none' });
      if (hi) m.tube('y', C, 3.7, -2.5, -2.1, N.band, S, { caps: 'none' });
    } else {
      m.tube('y', C, 3.72, -1.3, -0.5, N.band, S, { caps: 'none' });
      m.tube('y', C, 3.72, 0.3, 1.1, N.band, S, { caps: 'none' });
    }
  }
  // espoleta, alavanca (colher) e pino com argola
  m.tube('y', C, 1.25, top, 4.1, N.cap, S);
  m.chamferBox(0.6, 4.1, -0.65, rr + 0.4, 4.55, 0.65, N.cap, 0.12, 'x');
  m.chamferBox(rr + 0.02, -1.0, -0.6, rr + 0.42, 4.55, 0.6, N.cap, 0.1, 'y');
  m.beam([-1.2, 3.6, 0], [-2.3, 3.6, 0], 0.12, ITEM_STYLE.bolt, 0);
  m.torus(-3.1, 3.6, 0, 0.85, 0.18, hi ? 8 : 6, 4, ITEM_STYLE.bolt, 0);
}

export function nadeGeometry(kind: NadeKind, lod: Lod = 'view'): MeshBuilder {
  const m = new MeshBuilder();
  if (lod === 'far') farNade(m, kind);
  else nadeInto(m, kind, lod === 'view');
  return m;
}

// ---------------------------------------------------------------- itens do mapa

/** Item do chão: 'far' = versão de longe; qualquer outro valor = versão completa. */
export function pickupGeometry(kind: PickupKind, lod: Lod = 'world'): MeshBuilder {
  const m = new MeshBuilder(), I = ITEM_STYLE, main = PICKUP_COLORS[kind];
  if (lod === 'far') { farPickup(m, kind); return m; }
  switch (kind) {
    case 'ammo': {
      // caixa de munição com travas, alça e cartuchos em relevo
      m.chamferBox(-8.6, 0, -5.6, 8.6, 8.6, 5.6, main, 0.6, 'x');
      m.chamferBox(-8.9, 8.6, -5.9, 8.9, 10.2, 5.9, I.dark, 0.5, 'x');
      for (const x of [-5, 5]) {
        m.chamferBox(x - 1, 6.2, -6.2, x + 1, 9.6, -5.55, I.metal, 0.15);
        m.chamferBox(x - 1, 8.0, 5.55, x + 1, 9.6, 6.1, I.metal, 0.15);
      }
      m.chamferBox(-3.2, 11.4, -0.7, 3.2, 12.2, 0.7, I.metal, 0.2);
      for (const s of [-1, 1]) m.box(s > 0 ? 2.5 : -3.1, 10.2, -0.45, s > 0 ? 3.1 : -2.5, 11.4, 0.45, I.metal);
      for (const z of [-5.6, 5.6]) m.inset([0, 7.3, z], z < 0 ? '-z' : '+z', MeshBuilder.rect(16, 0.8), I.dark);
      for (const x of [-2.2, 0, 2.2]) {
        m.chamferBox(x - 0.55, 1.4, -5.95, x + 0.55, 4.8, -5.55, I.brass, 0.15);
        m.chamferBox(x - 0.4, 4.8, -5.95, x + 0.4, 5.9, -5.55, I.copper, 0.2);
      }
      for (const x of [-7.6, 7.6]) for (const y of [1.2, 5.0]) m.bolt([x, y, -5.6], '-z', 0.32, I.bolt);
      break;
    }
    case 'medkit': {
      // maleta médica com cruz em relevo, alça e cantoneiras
      m.chamferBox(-9.6, 0, -6.6, 9.6, 11.6, 6.6, main, 0.9);
      m.box(-9.7, 5.6, -6.7, 9.7, 6.0, 6.7, shade(main, 0.55));
      for (const s of [-1, 1]) {
        const z0 = s < 0 ? -7.1 : 6.55, z1 = s < 0 ? -6.55 : 7.1;
        m.chamferBox(-1.6, 2.2, z0, 1.6, 9.4, z1, I.white, 0.3);
        m.chamferBox(-4.8, 4.2, z0, 4.8, 7.4, z1, I.white, 0.3);
      }
      m.chamferBox(-3.6, 13.0, -0.8, 3.6, 13.9, 0.8, I.dark, 0.25);
      for (const s of [-1, 1]) m.chamferBox(s * 3.0 - 0.5, 11.6, -0.6, s * 3.0 + 0.5, 13.0, 0.6, I.dark, 0.15);
      for (const x of [-6.5, 6.5]) m.chamferBox(x - 0.9, 9.6, -7.0, x + 0.9, 11.2, -6.5, I.metal, 0.12);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.chamferBox(sx > 0 ? 8.6 : -10.0, -0.2, sz > 0 ? 5.6 : -7.0, sx > 0 ? 10.0 : -8.6, 2.0, sz > 0 ? 7.0 : -5.6, I.dark, 0.3, 'y');
      break;
    }
    case 'armor': {
      // colete com placas na cor do item, alças e fivelas
      m.chamferBox(-9.4, 0, -3.4, 9.4, 16, 3.4, I.fabric, 0.9);
      for (const s of [-1, 1]) m.chamferBox(s > 0 ? 4.6 : -9.4, 16, -3.4, s > 0 ? 9.4 : -4.6, 20, 3.4, I.fabric, 0.6);
      m.inset([0, 16, 0], '+y', MeshBuilder.rect(5, 8), I.hole);
      for (const s of [-1, 1]) {
        const z0 = s < 0 ? -4.4 : 3.3, z1 = s < 0 ? -3.3 : 4.4;
        m.chamferBox(-6.4, 4.0, z0, 6.4, 14.4, z1, main, 0.9);
        for (const x of [-5.3, 5.3]) for (const y of [5.0, 13.4]) m.bolt([x, y, s < 0 ? -4.4 : 4.4], s < 0 ? '-z' : '+z', 0.3, I.bolt);
      }
      for (const s of [-1, 1]) {
        m.chamferBox(s > 0 ? 9.4 : -9.9, 3, -2.6, s > 0 ? 9.9 : -9.4, 13, 2.6, I.strap, 0.15);
        m.chamferBox(s > 0 ? 9.9 : -10.4, 6.6, -1.3, s > 0 ? 10.4 : -9.9, 8.6, 1.3, I.metal, 0.12);
      }
      for (const x of [-5, 0, 5]) m.chamferBox(x - 2, 0.6, -4.3, x + 2, 3.6, -3.4, shade(I.fabric, 0.8), 0.3);
      break;
    }
    case 'shield': {
      // gerador de escudo: base sextavada, anel emissor e cúpula facetada
      m.tube('y', [0, 0, 0], 11, 0, 3.2, I.dark, 6);
      m.tube('y', [0, 0, 0], 9.2, 3.2, 4.4, main, 6);
      m.tube('y', [0, 0, 0], 6.4, 4.4, 7.2, I.white, 6, { r2: 4.2 });
      m.tube('y', [0, 0, 0], 4.2, 7.2, 9.4, main, 6, { r2: 1.6 });
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6 * Math.PI * 2; m.bolt([Math.cos(t) * 9.6, 3.2, Math.sin(t) * 9.6], '+y', 0.4, I.bolt); }
      for (let i = 0; i < 6; i++) {
        const t = i / 6 * Math.PI * 2, ap = 11 * Math.cos(Math.PI / 6);
        m.group([Math.cos(t) * ap, 1.6, Math.sin(t) * ap], [0, -t, 0], () => m.inset([0, 0, 0], '+x', MeshBuilder.rect(5, 1.2), I.hole));
      }
      break;
    }
    case 'speed': {
      // impulsor de velocidade: base e duas setas (chevrons) em bloco
      m.chamferBox(-7, 0, -3, 7, 2.4, 3, I.dark, 0.5);
      const chev: P2[] = [[-6.5, 2.4], [0, 8.9], [6.5, 2.4], [6.5, 5.6], [0, 12.1], [-6.5, 5.6]];
      m.prism('z', chev, -1.6, 1.6, main);
      m.prism('z', chev.map(([x, y]) => [x * 0.8, y + 6.2] as P2), -1.4, 1.4, main);
      for (const x of [-5.6, 5.6]) m.bolt([x, 1.2, -3], '-z', 0.35, I.bolt);
      m.inset([0, 1.2, -3], '-z', MeshBuilder.rect(7, 0.6), I.hole);
      break;
    }
    case 'nade_he': m.group([0, 6.3, 0], null, () => nadeInto(m, 'he', true), 1.5); break;
    case 'nade_smoke': m.group([0, 6.3, 0], null, () => nadeInto(m, 'smoke', true), 1.5); break;
    case 'nade_impulse': m.group([0, 6.3, 0], null, () => nadeInto(m, 'impulse', true), 1.5); break;
    default: m.chamferBox(-6, 0, -6, 6, 12, 6, 0xffffff, 1);
  }
  return m;
}

// ---------------------------------------------------------------- luvas do viewmodel

/** Luva da mão que segura as armas de fogo (punho em z 0..3,5 · y −6,5..0,5). */
export function gunGloveGeometry(): MeshBuilder {
  const m = new MeshBuilder(), G = GLOVE;
  for (let i = 0; i < 3; i++) {
    const y0 = -2.3 - i * 1.15;
    m.chamferBox(-2.25, y0 - 1.0, -1.45 + i * 0.15, 2.0, y0, 0.9 + i * 0.25, G.base, 0.35, 'x');
    m.chamferBox(2.0, y0 - 0.85, -1.0 + i * 0.15, 2.35, y0 - 0.15, 0.6 + i * 0.25, G.plate, 0.12, 'x');
  }
  m.chamferBox(-2.0, -6.1, -0.75, 1.8, -5.3, 1.4, G.base, 0.3, 'x');
  m.chamferBox(-2.35, -1.75, -1.5, -1.2, -0.85, 1.2, G.base, 0.3);
  m.chamferBox(1.25, -5.4, 0.4, 2.45, -0.9, 3.4, G.base, 0.35, 'y');
  m.chamferBox(2.45, -4.4, 0.9, 2.6, -1.6, 2.9, G.plate, 0.15, 'y');
  m.chamferBox(-1.6, -5.2, 2.4, 1.6, -0.7, 3.5, G.base, 0.4, 'y');
  m.chamferBox(-2.45, -1.3, -0.6, -1.35, 0.2, 2.6, G.base, 0.35);
  m.chamferBox(-2.5, -1.0, -0.7, -2.1, 0.1, 0.4, G.plate, 0.1);
  m.chamferBox(-1.9, -5.6, 3.3, 2.2, -0.9, 5.6, G.base, 0.5);
  m.tapeBox('z', -1.9, -5.6, 3.7, 2.2, -0.9, 5.1, G.tape, 2);
  return m;
}

/** Luva da mão que segura o cabo "safe" da balisong (z 3,5..10,5). */
export function knifeGloveGeometry(): MeshBuilder {
  const m = new MeshBuilder(), G = GLOVE;
  m.chamferBox(1.45, -1.9, 3.8, 2.35, 1.9, 9.6, G.base, 0.35);
  m.chamferBox(2.35, -1.4, 4.6, 2.55, 1.4, 8.6, G.plate, 0.12);
  for (let i = 0; i < 4; i++) {
    const z0 = 3.7 + i * 1.5;
    m.chamferBox(-0.5, -2.2, z0, 2.0, -1.3, z0 + 1.35, G.base, 0.3);
    m.chamferBox(-0.55, -1.4, z0 + 0.05, 0.3, 0.5, z0 + 1.3, G.base, 0.25);
  }
  m.chamferBox(0.2, 1.3, 3.4, 1.7, 2.15, 8.2, G.base, 0.3);
  m.chamferBox(-0.2, -1.9, 9.6, 2.4, 1.9, 12.0, G.base, 0.45);
  m.tapeBox('z', -0.2, -1.9, 10.0, 2.4, 1.9, 11.4, G.tape, 2);
  return m;
}

/** Lista de modelos para a tela Arsenal e os testes. */
export interface ModelEntry { id: string; name: string; kind: 'weapon' | 'knife' | 'nade' | 'item' | 'glove'; build: (lod: Lod) => MeshBuilder; /** versões disponíveis (a primeira é a principal) */ lods: Lod[] }

const WEAPON_ORDER: WeaponId[] = ['sniper', 'rifle', 'smg', 'shotgun', 'pistol', 'taser', 'knife'];
const WEAPON_NAMES: Record<WeaponId, string> = { sniper: 'LONGBOW', rifle: 'KESTREL AR', smg: 'HORNET', shotgun: 'BREAKER-12', pistol: 'VEX-9', taser: 'VOLT-1', knife: 'BALISONG' };

/** Todos os modelos revisáveis, na ordem da tela Arsenal. */
export const MODEL_LIST: ModelEntry[] = [
  ...WEAPON_ORDER.map((id): ModelEntry => ({ id, name: WEAPON_NAMES[id], kind: id === 'knife' ? 'knife' : 'weapon', build: (lod) => weaponGeometry(id, lod), lods: ['view', 'world', 'far'] })),
  ...(['he', 'smoke', 'impulse'] as NadeKind[]).map((k): ModelEntry => ({ id: `nade_${k}`, name: { he: 'Granada explosiva', smoke: 'Granada de fumaça', impulse: 'Granada de impulso' }[k], kind: 'nade', build: (lod) => nadeGeometry(k, lod), lods: ['view', 'world', 'far'] })),
  ...(['ammo', 'medkit', 'armor', 'shield', 'speed'] as PickupKind[]).map((k): ModelEntry => ({ id: k, name: { ammo: 'Munição', medkit: 'Kit médico', armor: 'Colete', shield: 'Escudo', speed: 'Velocidade' }[k as 'ammo'], kind: 'item', build: (lod) => pickupGeometry(k, lod), lods: ['world', 'far'] })),
  { id: 'glove_gun', name: 'Luva (armas de fogo)', kind: 'glove', build: () => gunGloveGeometry(), lods: ['view'] },
  { id: 'glove_knife', name: 'Luva (balisong)', kind: 'glove', build: () => knifeGloveGeometry(), lods: ['view'] },
];
