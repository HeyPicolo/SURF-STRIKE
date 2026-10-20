// =============================================================
//  Guia de estilo das armas, faca, granadas, itens e luvas ("stylized geometric / block-build").
//  Cores e espessuras ficam aqui; a geometria (geometry.ts) só lê estes valores.
//  Regras: blocos chanfrados, cilindros de 6–10 lados, parafusos cinza-claro, fita enrolada na
//  cor de destaque, 2–3 cores dominantes + 1 destaque por arma, fosco (no máximo um LED).
// =============================================================
import type { WeaponId, NadeKind } from '../../../shared/config/weapons';
import { WEAPONS } from '../../../shared/config/weapons';

/** Paleta de uma arma: corpo, peça escura (cano/mira), metal, destaque (fita), parafusos. */
export interface Palette {
  body: number;
  dark: number;
  metal: number;
  accent: number;
  bolt: number;
  /** fundo dos recortes */
  hole: number;
  /** cor extra (cartuchos, faixas de alerta, LED) */
  extra?: number;
}

const BOLT = 0xc4c8ce, HOLE = 0x1c1d22;

/**
 * Paletas. A cor de identificação de cada arma (WEAPONS[id].color) entra como dominante
 * (LONGBOW, KESTREL, HORNET, BREAKER-12, VEX-9, VOLT-1) — o jogador continua reconhecendo pela cor.
 */
export const PALETTES: Record<WeaponId, Palette> = {
  // areia + verde-grafite (id) + fita azul, como na referência
  sniper: { body: 0xd6c69c, dark: WEAPONS.sniper.color, metal: 0x33363b, accent: 0x2d5cb3, bolt: BOLT, hole: 0x3a3426 },
  // ardósia (id) + oliva + fita terracota
  rifle: { body: 0x858a5e, dark: WEAPONS.rifle.color, metal: 0x2a2d33, accent: 0xb8613a, bolt: BOLT, hole: HOLE },
  // grafite (id) + cinza frio + fita ocre
  smg: { body: 0x9aa2ac, dark: WEAPONS.smg.color, metal: 0x24272d, accent: 0xc99a3e, bolt: BOLT, hole: HOLE },
  // branco-gelo + madeira/terracota (id) + fita verde-azulada, cartuchos vermelhos
  shotgun: { body: 0xd2ccbd, dark: WEAPONS.shotgun.color, metal: 0x33353a, accent: 0x3d8783, bolt: BOLT, hole: 0x2a2622, extra: 0xb0442f },
  // ferrolho cinza-azulado (id) + armação grafite + fita violeta
  pistol: { body: WEAPONS.pistol.color, dark: 0x2e3138, metal: 0x24262b, accent: 0x7f66b5, bolt: BOLT, hole: HOLE },
  // amarelo de alerta (id) + preto; o único LED de carga
  taser: { body: WEAPONS.taser.color, dark: 0x25272c, metal: 0x3a3d44, accent: WEAPONS.taser.color, bolt: BOLT, hole: HOLE, extra: 0x6fe3ff },
  // aço + cabos grafite com o cinza (id) nos parafusos + fita azul
  knife: { body: 0xc9d0da, dark: 0x343944, metal: 0x23262d, accent: 0x2d5cb3, bolt: WEAPONS.knife.color, hole: 0x16181d },
};

/** Faixa de cor de cada granada (vermelho / cinza / ciano, como antes). */
export const NADE_STYLE: Record<NadeKind, { body: number; band: number; cap: number }> = {
  he: { body: 0x5c6347, band: 0xd1503a, cap: 0x3a3d44 },
  smoke: { body: 0x6b717a, band: 0xcfd6e2, cap: 0x3a3d44 },
  impulse: { body: 0x2f3440, band: 0x37c9e6, cap: 0x5b616c },
};

/** Luvas do viewmodel. */
export const GLOVE = { base: 0x2c2f37, plate: 0x50555e, tape: 0x2d5cb3, stitch: 0x1d1f24 };

/** Espessuras e tamanhos dos detalhes (mesma "fábrica" em todas as armas). */
export const STYLE = {
  /** chanfro dos blocos grandes */
  chamfer: 0.4,
  /** chanfro das peças pequenas */
  chamferSmall: 0.18,
  /** raio do parafuso (viewmodel) */
  boltR: 0.24,
  /** quanto a fita fica acima da peça */
  tape: 0.13,
  /** lados dos cilindros: canos, luneta (detalhado) e versão simplificada */
  sides: 8,
  sidesLo: 6,
  /** passo dos dentes do trilho */
  railPitch: 1.3,
};

/** Orçamento de triângulos por modelo: primeira pessoa, perto (chão / terceira pessoa) e longe. */
export const TRI_BUDGET = { view: 2500, world: 600, far: 150, /** arma com attachments (rodada 12b) na versão perto; a 'view' continua ≤ 2500 */ worldBuild: 800 };

/** Distância (u) a partir da qual itens do chão e armas na mão dos outros usam a versão "longe". */
export const LOD_FAR_DIST = 1100;

/**
 * Pontos de referência de cada arma (coordenadas do modelo: frente = −Z, origem no punho).
 * `muzzle`: centro da boca (o clarão do tiro sai 2 u à frente); `scopeY`: eixo da luneta.
 * A mão (luva) encaixa no punho em z 0..3,5 · y −6,5..0,5, igual para todas as armas de fogo.
 * `sight` (rodada 11b): linha de visada do ADS — altura da linha (y), alça (rearZ) e massa/ponto
 * (frontZ) no modelo, e a distância da alça até o olho na posição de mira (dist, unidades da câmera).
 */
export interface SightRef { y: number; rearZ: number; frontZ: number; dist: number }

export const WEAPON_REFS: Record<Exclude<WeaponId, 'knife'>, { muzzle: { y: number; z: number }; scopeY?: number; sight?: SightRef }> = {
  sniper: { muzzle: { y: 2.0, z: -44 }, scopeY: 7.8 },
  rifle: { muzzle: { y: 2.0, z: -34 }, sight: { y: 5.6, rearZ: 3.2, frontZ: -23.5, dist: 7 } },
  smg: { muzzle: { y: 2.0, z: -21 }, sight: { y: 6.05, rearZ: -1.4, frontZ: -4.3, dist: 8 } },
  shotgun: { muzzle: { y: 3.0, z: -38 }, sight: { y: 4.65, rearZ: 3.2, frontZ: -36, dist: 8 } },
  pistol: { muzzle: { y: 2.5, z: -16 }, sight: { y: 4.85, rearZ: 1.9, frontZ: -13.35, dist: 13 } },
  taser: { muzzle: { y: 2.2, z: -13.6 } },
};

/** Multiplica o brilho de uma cor (0x rrggbb) por k. */
export function shade(c: number, k: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

/** Cor principal de cada item do mapa (legível à distância). */
export const PICKUP_COLORS: Record<import('../../../shared/maps/types').PickupKind, number> = {
  weapon: 0xffffff, ammo: 0xffd23c, medkit: 0xff3b4f, armor: 0x5ec8ff,
  nade_he: 0xff5a3c, nade_smoke: 0xcfd6e2, nade_impulse: 0x37e3ff, shield: 0x5ec8ff, speed: 0xffe14d,
};

/** Cores de apoio dos itens do mapa. */
export const ITEM_STYLE = { metal: 0x3a3e46, dark: 0x2c3038, fabric: 0x3b4a66, strap: 0x262a31, white: 0xf0efe8, brass: 0xc9a24a, copper: 0xb87333, bolt: 0xc4c8ce, hole: 0x1c1d22 };
