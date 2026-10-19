// =============================================================
//  STORM SPIRE — Surf Skill · TIER 3 (avançado)
//  Rampas estreitas no limite do surf (normal Y perto de 0.7, sempre abaixo) e rampas bem
//  íngremes, sequências rápidas de transições, curvas fechadas, rampas de uma face só em lados
//  alternados e gaps longos que só passam com velocidade alta. Pouca margem de erro.
// =============================================================
import { skillMapMeta } from '../config/skill';
import { skillMapDef, StageSpec, RampSeg, chainRamp, endAfter } from './skillKit';
import type { MapDef } from './types';

// rampa "no limite": normal Y ≈ 0.68 (47°) · rampa íngreme: normal Y ≈ 0.45 (63°)
const EDGE = { hw: 130, h: 140 };
const STEEP = { hw: 110, h: 220 };

function stage1(): StageSpec {
  const r1: RampSeg = { s: [0, -150, -450], e: [0, -750, -2600], ...EDGE, ride: -1 };
  const r2 = chainRamp(r1, { gap: 300, drop: 300, yawDeg: 0, len: 2100, descent: 600, ...EDGE, ride: 1 });
  const r3 = chainRamp(r2, { gap: 300, drop: 300, yawDeg: 0, len: 2100, descent: 600, ...EDGE, ride: -1 });
  return { ramps: [r1, r2, r3], end: endAfter(r3, 600, 350, 500, 500) };
}

function stage2(): StageSpec {
  // rampas de uma face só, alternando os lados, com gaps curtos
  const r1: RampSeg = { s: [0, -150, -450], e: [0, -650, -2200], hw: 140, h: 150, ride: -1, sides: 'left' };
  const o = { gap: 250, drop: 250, yawDeg: 0, len: 1750, descent: 500, hw: 140, h: 150 };
  const r2 = chainRamp(r1, { ...o, ride: 1, sides: 'right' });
  const r3 = chainRamp(r2, { ...o, ride: -1, sides: 'left' });
  const r4 = chainRamp(r3, { ...o, ride: 1, sides: 'right' });
  return { ramps: [r1, r2, r3, r4], end: endAfter(r4, 550, 350, 500, 500) };
}

function stage3(): StageSpec {
  // descida íngreme para ganhar velocidade e um gap longo
  const r1: RampSeg = { s: [0, -150, -450], e: [0, -1500, -3800], ...STEEP, ride: -1 };
  const r2 = chainRamp(r1, { gap: 1300, drop: 1100, yawDeg: 0, len: 2200, descent: 500, ...EDGE, ride: -1 });
  return { ramps: [r1, r2], end: endAfter(r2, 600, 350, 500, 500) };
}

function stage4(): StageSpec {
  // curvas fechadas: direita, esquerda, direita
  const r1: RampSeg = { s: [0, -150, -450], e: [0, -700, -2300], ...EDGE, ride: -1 };
  const r2 = chainRamp(r1, { gap: 600, drop: 550, yawDeg: 28, len: 2000, descent: 600, ...EDGE, ride: -1 });
  const r3 = chainRamp(r2, { gap: 600, drop: 650, yawDeg: -5, len: 2000, descent: 600, ...EDGE, ride: 1 });
  const r4 = chainRamp(r3, { gap: 600, drop: 650, yawDeg: 25, len: 1800, descent: 550, ...EDGE, ride: -1 });
  return { ramps: [r1, r2, r3, r4], end: endAfter(r4, 600, 350, 500, 500) };
}

function stage5(): StageSpec {
  // tudo junto: descida íngreme, gap longo com curva, transições rápidas e chegada estreita
  const r1: RampSeg = { s: [0, -150, -450], e: [0, -1500, -3800], ...STEEP, ride: -1 };
  const r2 = chainRamp(r1, { gap: 1200, drop: 1150, yawDeg: -18, len: 2000, descent: 550, ...EDGE, ride: -1 });
  const r3 = chainRamp(r2, { gap: 300, drop: 350, yawDeg: -18, len: 1800, descent: 550, ...EDGE, ride: 1 });
  const r4 = chainRamp(r3, { gap: 500, drop: 550, yawDeg: 0, len: 1800, descent: 550, ...STEEP, ride: -1 });
  return { ramps: [r1, r2, r3, r4], end: endAfter(r4, 600, 350, 420, 420) };
}

export const STORM_SPIRE_STAGES: StageSpec[] = [stage1(), stage2(), stage3(), stage4(), stage5()];

export function buildStormSpire(): MapDef { return skillMapDef(skillMapMeta('storm_spire'), STORM_SPIRE_STAGES); }
