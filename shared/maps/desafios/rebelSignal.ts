// =============================================================
//  D8 · REBEL SIGNAL — Surf Skill · Desafio · TIER 5 · staged, 9 stages
//  Stages técnicos e variados: cada stage pede uma técnica diferente (túnel, subida, curva fechada,
//  bhop, cabos com curva no ar, rampas de uma face em lados alternados, retorno de 180°) e os dois
//  últimos misturam tudo. Rampas estreitas (meia-largura 115–130).
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, RampSeg, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const N = { hw: 122, h: 205 };
const first = (ride: 1 | -1, o: Partial<RampSeg> = {}): RampSeg => ({ s: [0, -260, -560], e: [0, -900, -3000], ...N, ride, ...o });
const arrival = (c: Course) => endAfter(c.last, 420, 460, 760, 620);
const dropFor = (gap: number, v: number) => { const t = gap / v; return Math.round(400 * t * t + 320 * t + 140); };

function tunnelStage(): StageSpec {
  const c = new Course(first(-1));
  c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ceiling: 135 });
  for (const ride of [-1, 1, 1, -1, -1] as const) c.next({ gap: 250, drop: ride === c.last.ride ? 85 : 100, len: 2100, descent: 420, ride, ceiling: 135 });
  c.next({ gap: 300, drop: 320, len: 2200, descent: 460, ride: 1 });
  return c.stage(arrival(c));
}

function climbStage(): StageSpec {
  const c = new Course(first(-1, { e: [0, -1300, -3300] }));
  for (const k of [0, 1, 2]) {
    // embalo antes de cada subida
    c.next({ gap: 320, drop: 320, len: 2600, descent: 700, ride: -1 });
    c.next({ gap: 320, drop: 300, len: 2000, descent: -(300 + k * 30), ride: 1 });
    c.next({ gap: 620 + k * 40, drop: 190, len: 2400, descent: 560, ride: 1 });
  }
  return c.stage(arrival(c));
}

function curveStage(turns: number[], speed = 2200, margin = 1.12): StageSpec {
  const c = new Course(first(turns[0] > 0 ? 1 : -1));
  for (const t of turns) {
    if (c.last.ride !== (t > 0 ? 1 : -1)) c.next({ gap: 300, drop: 300, len: 1500, descent: 300, ride: t > 0 ? 1 : -1 });
    c.curveFor(t, speed, 48, { margin, stepDeg: 5 }).straight(900, 160);
    c.next({ gap: 320, drop: 300, len: 1700, descent: -100, ride: t > 0 ? 1 : -1 });
  }
  return c.stage(arrival(c));
}

function bhopStage(): StageSpec {
  const c = new Course(first(-1));
  c.next({ gap: 320, drop: 320, len: 2400, descent: 520 });
  c.next({ gap: 320, drop: 320, len: 2400, descent: 480, ride: 1 });
  c.next({ gap: 320, drop: 320, len: 2200, descent: 300, ride: -1 });
  // ritmo do bhop para quem chega a ~1900 u/s: um pulo dura ~0,75 s (≈ 1430 u)
  c.bhop({ firstDist: 450, drop: 360, pads: 4, pitch: 1450, padLen: 1250, width: 520, firstLen: 1500 });
  const t = c.tail[c.tail.length - 1].p;
  // chegada logo depois da última pista (quem sai do bhop um pouco fora do ritmo ainda pousa)
  return c.stage({ x: t[0], y: t[1], z: t[2] - 1050, w: 760, d: 1300 });
}

function wireStage(): StageSpec {
  const c = new Course(first(1, { e: [0, -1100, -3200] }));
  for (const [i, t] of [16, -15, 17, -16].entries()) {
    const gap = 950 + i * 70;
    c.next({ gap, drop: dropFor(gap, 1300), turn: t, len: 2300, descent: 300, ride: t > 0 ? -1 : 1, hw: 190, h: 300 });
  }
  c.next({ gap: 320, drop: 320, len: 2000, descent: 400, ride: 1, hw: N.hw, h: N.h });
  return c.stage(arrival(c));
}

function staticStage(): StageSpec {
  // rampas de uma face só em lados alternados, gaps curtos
  const c = new Course({ s: [0, -260, -560], e: [0, -760, -2300], hw: 130, h: 140, ride: -1, sides: 'left' });
  for (let i = 0; i < 7; i++) {
    const right = i % 2 === 0;
    c.next({ gap: 250, drop: 250, len: 1750, descent: 480, hw: 130, h: 140, ride: right ? 1 : -1, sides: right ? 'right' : 'left' });
  }
  return c.stage(arrival(c));
}

function mixStage(kind: 'bunker' | 'final'): StageSpec {
  const c = new Course(first(1));
  if (kind === 'bunker') {
    c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ride: 1, ceiling: 135 });
    c.next({ gap: 250, drop: 85, len: 2100, descent: 420, ride: 1, ceiling: 135 });
    c.next({ gap: 320, drop: 300, len: 1500, descent: 300, ride: 1 });
    c.curveFor(120, 2200, 48, { margin: 1.12, stepDeg: 5 }).straight(900, 160);
    c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ride: -1, ceiling: 135 });
    c.next({ gap: 250, drop: 100, len: 2100, descent: 420, ride: 1, ceiling: 135 });
    c.next({ gap: 320, drop: 320, len: 2200, descent: 460, ride: -1 });
  } else {
    c.next({ gap: 320, drop: 320, len: 2600, descent: 700, ride: -1 });
    c.next({ gap: 320, drop: 300, len: 2000, descent: -320, ride: 1 });
    c.next({ gap: 660, drop: 190, len: 2200, descent: 520, ride: 1 });
    c.curveFor(150, 2300, 48, { margin: 1.12, stepDeg: 5 }).straight(900, 160);
    for (const [i, t] of [15, -14].entries()) { const gap = 950 + i * 80; c.next({ gap, drop: dropFor(gap, 1300), turn: t, len: 2300, descent: 300, ride: t > 0 ? -1 : 1, hw: 190, h: 300 }); }
    c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ride: 1, hw: N.hw, h: N.h, ceiling: 135 });
    c.next({ gap: 250, drop: 85, len: 2100, descent: 420, ride: 1, ceiling: 135 });
    c.next({ gap: 320, drop: 320, len: 2200, descent: 460, ride: -1 });
  }
  return c.stage(arrival(c));
}

export const REBEL_SIGNAL_STAGES: StageSpec[] = [
  tunnelStage(),                   // 1 · Frequência: túnel com trocas de face
  climbStage(),                    // 2 · Subida: três subidas com voos longos
  curveStage([90, -90, 90]),       // 3 · Interferência: curvas fechadas de 90°
  bhopStage(),                     // 4 · Pulso: rampa até uma pista de bhop
  wireStage(),                     // 5 · Antena: cabos com curva no ar
  staticStage(),                   // 6 · Estática: uma face só, lados alternados
  curveStage([180, -150]),         // 7 · Retorno: U-turn e volta
  mixStage('bunker'),              // 8 · Bunker: túnel, curva, túnel
  mixStage('final'),               // 9 · Sinal final: subida, curva, cabos e túnel
];

export function buildRebelSignal(): MapDef { return skillMapDef(skillMapMeta('rebel_signal'), REBEL_SIGNAL_STAGES); }
