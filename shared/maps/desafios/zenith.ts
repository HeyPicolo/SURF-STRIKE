// =============================================================
//  D12 · ZENITH — Surf Skill · Desafio · TIER 6 · linear, maratona
//  O mais longo e o mais difícil: uma espiral descendente de rampas no limite (meia-largura 96,
//  normal Y ≈ 0,41), duas seções por checkpoint (faces alternadas, velocidade mínima, túnel, face
//  única, queda brusca, subida), cada uma fechada por uma curva de 90° feita para o teto de 3500 u/s.
//  O último trecho sobe até o cume, marcado por uma coluna de anéis dourados.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter, gapDrop } from '../skillKit';
import type { MapDef } from '../types';

const N = { hw: 96, h: 215 };             // normal Y ≈ 0,41
const ONE = { hw: 100, h: 205 };
/** rampas das curvas da espiral: mais largas e altas, para segurar de ~2200 a 3500 u/s */
const CURVE = { hw: 160, h: 280 };
/** queda das transições comuns (menor que nos outros mapas: a maratona precisa caber em ±40000) */
const TD = 190;

/** as seções descem menos que os outros mapas: a maratona precisa caber em ±40000 */
const DS = 0.3;
const d = (x: number) => Math.round(x * DS);
/** ...e são mais longas: mais tempo por unidade de altura */
const LS = 1.9;
const l = (x: number) => Math.round(x * LS);

type Section = (c: Course, k: number) => void;

const SECTIONS: Record<string, Section> = {
  /** faces alternadas, gaps curtos */
  alt: (c) => { for (const ride of [-1, 1, -1, 1] as const) c.next({ gap: 260, drop: TD, len: l(1700), descent: d(330), ...N, ride }); },
  /** gap de velocidade mínima depois de uma descida forte */
  min: (c, k) => {
    c.next({ gap: 260, drop: TD, len: l(2600), descent: 760, ...N, ride: 1 });
    const gap = 1550 + (k % 3) * 150;
    c.next({ gap, drop: gapDrop(c.last, gap, 1700, 70), len: l(2400), descent: d(420), hw: 140, h: 290, ride: -1 });
  },
  /** túnel com troca de face */
  tunnel: (c) => {
    c.next({ gap: 300, drop: 160, len: l(2100), descent: d(420), ...N, ride: 1, ceiling: 135 });
    for (const ride of [-1, -1, 1] as const) c.next({ gap: 250, drop: ride === c.last.ride ? 85 : 100, len: l(2000), descent: d(420), ride, ceiling: 135 });
    c.next({ gap: 260, drop: TD, len: l(2000), descent: d(420), ...N, ride: -1 });
  },
  /** uma face só, lados alternados */
  one: (c) => {
    for (let i = 0; i < 5; i++) { const r = i % 2 === 0; c.next({ gap: 260, drop: TD, len: l(1600), descent: d(440), ...ONE, ride: r ? 1 : -1, sides: r ? 'right' : 'left' }); }
  },
  /** quedas bruscas */
  drop: (c, k) => {
    c.next({ gap: 260, drop: TD, len: l(1600), descent: d(320), ...N, ride: -1 });
    c.next({ gap: 540, drop: 700 + (k % 3) * 30, len: l(3000), descent: d(420), ...N, ride: 1 });
    c.next({ gap: 260, drop: TD, len: l(1600), descent: d(320), ...N, ride: -1 });
  },
  /** subida com voo longo */
  climb: (c) => {
    c.next({ gap: 260, drop: TD, len: l(2600), descent: d(720), ...N, ride: -1 });
    c.next({ gap: 260, drop: TD, len: l(2000), descent: d(-340), ...N, ride: 1 });
    c.next({ gap: 680, drop: 190, len: l(2400), descent: d(560), ...N, ride: 1 });
  },
};
// sem cabos: na maratona chega-se rápido demais para as viradas no ar (os cabos ficam no D11)
const ORDER = ['alt', 'min', 'tunnel', 'one', 'drop', 'climb'];

/** Fecha uma seção com uma curva contínua de 90° para a direita (a espiral). */
function spiral(c: Course) {
  c.next({ gap: 260, drop: TD, len: 2600, descent: 240, ...CURVE, ride: 1 }); // longa: pousa antes da curva
  c.curveFor(90, 3500, 75).straight(900, 110);
}

export const ZENITH_SEGMENTS = 12;

export function buildZenith(): MapDef {
  // a espiral ocupa ~44000 × 55000: a largada fica deslocada para o conjunto caber em ±40000
  const X0 = -19000, Z0 = 8000;
  const c = new Course({ s: [X0, 37600, Z0 - 650], e: [X0, 36700, Z0 - 3600], ...N, ride: 1 });
  let n = 0;
  for (let k = 0; k < ZENITH_SEGMENTS - 1; k++) {
    if (k > 0) c.checkpoint();
    // embalo depois do checkpoint (quem renasce sai parado)
    // a primeira desce pouco: quem passa embalado pelo portal ainda pousa nela
    c.next({ gap: 260, drop: 260, len: 3000, descent: 420, ...N, ride: 1 });
    c.next({ gap: 260, drop: TD, len: 2600, descent: 560, ...N, ride: -1 });
    // duas seções; o gap de velocidade mínima vem sempre logo depois do embalo
    const pair = [ORDER[n++ % ORDER.length], ORDER[n++ % ORDER.length]].sort((a, b) => +(b === 'min') - +(a === 'min'));
    for (const name of pair) { SECTIONS[name](c, k); spiral(c); }
  }
  // cume: descidas longas que lançam duas rampas de subida seguidas até a plataforma do topo
  c.checkpoint();
  c.next({ gap: 260, drop: TD, len: 3000, descent: 820, ...N, ride: 1 });
  c.next({ gap: 260, drop: TD, len: 3000, descent: 900, ...N, ride: -1 });
  c.next({ gap: 260, drop: TD, len: 3000, descent: 900, ...N, ride: 1 });
  c.next({ gap: 260, drop: TD, len: 2400, descent: -480, ...N, ride: -1 });
  c.next({ gap: 260, drop: TD, len: 2200, descent: -400, ...N, ride: 1 });
  // a maratona é surfada perto do teto de velocidade: todas as peças são lisas (sem ramp bug nos biséis)
  for (const r of c.ramps) r.slick = true;
  return linearMapDef(skillMapMeta('zenith'), {
    ...c.linear([X0, 38002, Z0], endAfter(c.last, 420, 320, 1100, 1300)),
    finale: { color: 0xffd76a },
  });
}
