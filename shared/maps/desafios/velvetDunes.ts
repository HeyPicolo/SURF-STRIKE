// =============================================================
//  D2 · VELVET DUNES — Surf Skill · Desafio · TIER 2 · linear, 5 checkpoints
//  Estilo linear fluido e longo: rampas longas em sequência e curvas abertas que desenham uma
//  grande espiral descendente. Ensina a manter a velocidade por bastante tempo.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

export function buildVelvetDunes(): MapDef {
  // em curvas com gap, surfa-se a face de fora da curva (a direita vira → face esquerda) e segura-se para dentro
  const c = new Course({ s: [0, 15600, -650], e: [0, 15100, -3400], hw: 210, h: 330, ride: -1 });
  const plan: number[] = [];
  // 6 trechos de 7 rampas; curvas abertas de 18–24° (sempre para a direita: a espiral)
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < 7; i++) {
      if (k > 0 && i === 0) c.checkpoint();
      if (k === 0 && i === 0) continue;
      const turn = 18 + ((k * 7 + i) % 3) * 3;
      c.next({ gap: 360, drop: 300, turn, len: 2500, descent: 380 });
      plan.push(turn);
    }
  }
  return linearMapDef(skillMapMeta('velvet_dunes'), c.linear([0, 16002, 0], endAfter(c.last, 560, 520, 1200, 1000)));
}
