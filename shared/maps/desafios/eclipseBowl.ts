// =============================================================
//  D7 · ECLIPSE BOWL — Surf Skill · Desafio · TIER 5 · staged, 8 stages
//  Introduz CURVAS FECHADAS: 90°, rampas em "bacia" (curvas longas que dão a volta) e retornos de
//  180° (U-turn) feitos com segmentos curvos. O raio é calculado para ~2200–2300 u/s com pouca folga:
//  quem chega rápido demais sobe na face e sai por cima. Antes das curvas, subidas seguram a velocidade.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const N = { hw: 125, h: 205 };

/** Peças: número = curva fechada (graus) na rampa; 'u' = subida que segura a velocidade; 'd' = descida. */
type P = number | 'u' | 'd';
function stage(pieces: P[], o: { speed?: number; margin?: number } = {}): StageSpec {
  const speed = o.speed ?? 2300, margin = o.margin ?? 1.15;
  const firstTurn = pieces.find((p) => typeof p === 'number') as number | undefined;
  const c = new Course({ s: [0, -260, -560], e: [0, -900, -3000], ...N, ride: (firstTurn ?? 1) > 0 ? 1 : -1 });
  pieces.forEach((p, i) => {
    const nextTurn = pieces.slice(i + 1).find((x) => typeof x === 'number') as number | undefined;
    const side: 1 | -1 = (nextTurn ?? 1) > 0 ? 1 : -1;
    if (p === 'u') c.next({ gap: 320, drop: 300, len: 1700, descent: -110, ride: side });
    else if (p === 'd') c.next({ gap: 320, drop: 320, len: 2400, descent: 520, ride: side });
    else {
      // a curva usa a face de dentro: se a rampa atual está na outra face, entra por uma rampa curta
      if (c.last.ride !== (p > 0 ? 1 : -1)) c.next({ gap: 300, drop: 300, len: 1500, descent: 300, ride: p > 0 ? 1 : -1 });
      c.curveFor(p, speed, 48, { margin, stepDeg: 5 }).straight(900, 160);
    }
  });
  return c.stage(endAfter(c.last, 420, 460, 760, 620));
}

export const ECLIPSE_BOWL_STAGES: StageSpec[] = [
  // 1 · Penumbra: duas curvas de 90°
  stage(['u', 90, 'd', 'u', -90]),
  // 2 · Meia-lua: retorno de 180°
  stage(['d', 'u', 180, 'd']),
  // 3 · Bacia: uma volta longa de 270° em descida
  stage(['u', 270, 'd']),
  // 4 · Retorno: dois U-turns em sentidos opostos
  stage(['u', 180, 'u', -180]),
  // 5 · Anel: 90° + 90° + 90°
  stage(['u', 90, 'u', 90, 'u', 90]),
  // 6 · Ferradura: U-turn mais fechado
  stage(['d', 'u', -180, 'd', 'u', 120], { speed: 2200 }),
  // 7 · Coroa: bacia de 300°
  stage(['u', -300, 'd'], { speed: 2200 }),
  // 8 · Totalidade: tudo junto, mais fechado
  stage(['u', 180, 'u', -180, 'd'], { speed: 2200, margin: 1.1 }),
];

export function buildEclipseBowl(): MapDef { return skillMapDef(skillMapMeta('eclipse_bowl'), ECLIPSE_BOWL_STAGES); }
