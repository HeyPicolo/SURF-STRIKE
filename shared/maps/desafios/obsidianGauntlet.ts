// =============================================================
//  D11 · OBSIDIAN GAUNTLET — Surf Skill · Desafio · TIER 6 · staged, 11 stages
//  Junta todas as técnicas dos desafios anteriores com rampas no limite: meia-largura 100–110 e
//  faces quase verticais para o surf (normal Y ≈ 0,43). Pouca margem: túneis, subidas, curvas
//  fechadas, bhop, cabos, faces únicas alternadas, U-turns, gaps de velocidade mínima e quedas bruscas.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, RampSeg, endAfter, gapDrop } from '../skillKit';
import type { MapDef } from '../types';

const N = { hw: 100, h: 210 };            // normal Y ≈ 0,43
const WIRE = { hw: 110, h: 235 };         // cabos: o mais largo do mapa ainda é estreito
const ONE = { hw: 104, h: 200 };          // uma face só
const first = (ride: 1 | -1, o: Partial<RampSeg> = {}): RampSeg => ({ s: [0, -260, -560], e: [0, -1000, -3100], ...N, ride, ...o });
const arrival = (c: Course) => endAfter(c.last, 420, 460, 700, 600);
const dropFor = (gap: number, v: number) => { const t = gap / v; return Math.round(400 * t * t + 320 * t + 140); };

function tunnelStage(): StageSpec {
  const c = new Course(first(-1));
  c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ceiling: 135 });
  for (const ride of [1, -1, -1, 1, -1, 1] as const) c.next({ gap: 250, drop: ride === c.last.ride ? 85 : 100, len: 2000, descent: 420, ride, ceiling: 135 });
  c.next({ gap: 300, drop: 320, len: 2200, descent: 460, ride: -1 });
  return c.stage(arrival(c));
}

function climbStage(): StageSpec {
  const c = new Course(first(-1, { e: [0, -1300, -3300] }));
  for (const k of [0, 1, 2, 3]) {
    c.next({ gap: 320, drop: 320, len: 2600, descent: 720, ride: -1 });
    c.next({ gap: 320, drop: 300, len: 2000, descent: -(320 + k * 30), ride: 1 });
    c.next({ gap: 660 + k * 40, drop: 190, len: 2400, descent: 580, ride: 1 });
  }
  return c.stage(arrival(c));
}

function curveStage(turns: number[], speed = 2300, margin = 1.08): StageSpec {
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
  c.bhop({ firstDist: 450, drop: 420, pads: 7, pitch: 1430, padLen: 700, width: 440, firstLen: 1500 });
  const t = c.tail[c.tail.length - 1].p;
  return c.stage({ x: t[0], y: t[1], z: t[2] - 1500, w: 700, d: 900 });
}

function wireStage(): StageSpec {
  const c = new Course(first(1, { e: [0, -1200, -3300] }));
  for (const [i, t] of [17, -16, 18, -17, 16].entries()) {
    const gap = 1000 + i * 60;
    c.next({ gap, drop: dropFor(gap, 1300), turn: t, len: 2300, descent: 320, ride: t > 0 ? -1 : 1, ...WIRE });
  }
  c.next({ gap: 320, drop: 320, len: 2000, descent: 400, ride: 1, ...N });
  return c.stage(arrival(c));
}

function staticStage(): StageSpec {
  const c = new Course({ s: [0, -260, -560], e: [0, -800, -2300], ...ONE, ride: -1, sides: 'left' });
  for (let i = 0; i < 9; i++) {
    const right = i % 2 === 0;
    c.next({ gap: 250, drop: 250, len: 1650, descent: 470, ...ONE, ride: right ? 1 : -1, sides: right ? 'right' : 'left' });
  }
  return c.stage(arrival(c));
}

function minSpeedStage(): StageSpec {
  const c = new Course(first(1, { e: [0, -1500, -3600] }));
  for (const k of [0, 1, 2]) {
    c.next({ gap: 320, drop: 320, len: 2200, descent: 760, ride: 1 });
    c.next({ gap: 320, drop: 320, len: 2000, descent: 680, ride: -1 });
    const gap = 1500 + k * 150;
    c.next({ gap, drop: gapDrop(c.last, gap, 1700, 70), len: 2000, descent: 420, ride: -1, hw: 140, h: 290 });
    c.next({ gap: 320, drop: 320, len: 1600, descent: 380, ride: 1, ...N });
  }
  return c.stage(arrival(c));
}

function dropStage(): StageSpec {
  const c = new Course(first(1));
  for (const k of [0, 1, 2, 3]) {
    c.next({ gap: 250, drop: 250, len: 1600, descent: 320, ride: -1 });
    c.next({ gap: 250, drop: 250, len: 1600, descent: 320, ride: 1 });
    c.next({ gap: 540, drop: 700 + k * 30, len: 3000, descent: 420, ride: 1 });
  }
  return c.stage(arrival(c));
}

function finalStage(): StageSpec {
  const c = new Course(first(-1));
  c.next({ gap: 300, drop: 160, len: 2100, descent: 420, ride: -1, ceiling: 135 });
  c.next({ gap: 250, drop: 85, len: 2000, descent: 420, ride: -1, ceiling: 135 });
  c.next({ gap: 320, drop: 320, len: 2600, descent: 700, ride: -1 });
  c.next({ gap: 320, drop: 300, len: 2000, descent: -320, ride: 1 });
  c.next({ gap: 660, drop: 190, len: 2200, descent: 520, ride: 1 });
  c.curveFor(150, 2500, 48, { margin: 1.1, stepDeg: 5 }).straight(900, 160);
  for (const [i, t] of [16, -15].entries()) { const gap = 1000 + i * 80; c.next({ gap, drop: dropFor(gap, 1300), turn: t, len: 2300, descent: 320, ride: t > 0 ? -1 : 1, ...WIRE }); }
  c.next({ gap: 320, drop: 320, len: 2400, descent: 600, ride: 1, ...N });
  c.next({ gap: 540, drop: 760, len: 3000, descent: 420, ride: 1 });
  c.curveFor(-120, 2500, 48, { margin: 1.1, stepDeg: 5 }).straight(900, 160);
  c.next({ gap: 320, drop: 320, len: 2200, descent: 460, ride: 1 });
  return c.stage(endAfter(c.last, 520, 420, 900, 1500)); // chega-se rápido: plataforma funda
}

export const OBSIDIAN_GAUNTLET_STAGES: StageSpec[] = [
  tunnelStage(),                    // 1 · Fenda: túnel estreito com trocas de face
  climbStage(),                     // 2 · Escarpa: quatro subidas
  curveStage([90, -90, 90, -90]),   // 3 · Vidro: curvas fechadas alternadas
  bhopStage(),                      // 4 · Brasas: bhop em pistas estreitas
  wireStage(),                      // 5 · Fio negro: cabos com curva no ar
  staticStage(),                    // 6 · Lâmina: uma face só, lados alternados
  curveStage([180, -180]),          // 7 · Retorno: dois U-turns
  minSpeedStage(),                  // 8 · Abismo: gaps de velocidade mínima
  dropStage(),                      // 9 · Desabamento: quedas bruscas
  curveStage([120, -150, 90], 2400, 1.06), // 10 · Espiral: curvas encadeadas no limite
  finalStage(),                     // 11 · Manopla: tudo junto
];

export function buildObsidianGauntlet(): MapDef { return skillMapDef(skillMapMeta('obsidian_gauntlet'), OBSIDIAN_GAUNTLET_STAGES); }
