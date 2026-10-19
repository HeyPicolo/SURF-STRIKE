// =============================================================
//  D4 · GLACIER RUN — Surf Skill · Desafio · TIER 3 · linear, 6 checkpoints
//  Introduz RAMPAS ASCENDENTES: depois de uma descida, uma rampa que sobe (usa o embalo da
//  anterior) e lança o jogador para cima, com gaps de mais tempo de ar até a próxima descida.
//  O percurso dá voltas largas para a direita, descendo em espiral sobre a geleira.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const W = { hw: 165, h: 255 };

export function buildGlacierRun(): MapDef {
  const c = new Course({ s: [0, 17600, -650], e: [0, 17000, -3200], ...W, ride: -1 });
  // cada trecho: descida longa (dá embalo também para quem volta do checkpoint) → curva larga →
  // subida → voo longo → descida → curva larga → subida curta → descida
  const rises = [300, 340, 370, 400, 420, 440, 460];
  for (let k = 0; k < 7; k++) {
    if (k > 0) { c.checkpoint(); c.next({ gap: 320, drop: 320, len: 2900, descent: 820, ride: 1 }); }
    else c.next({ gap: 320, drop: 300, len: 2600, descent: 600, ride: 1 });
    c.curveFor(50, 2400).straight(1600, 320);                                          // curva larga para a direita (face direita = de dentro)
    c.next({ gap: 320, drop: 300, len: 2000, descent: -rises[k], ride: 1 });          // subida
    c.next({ gap: 600 + k * 40, drop: 200, len: 2400, descent: 520, ride: 1 });       // voo longo depois da subida
    c.curveFor(50, 2400).straight(1600, 320);
    c.next({ gap: 320, drop: 300, len: 1800, descent: -Math.round(rises[k] * 0.7), ride: -1 }); // subida curta na outra face
    c.next({ gap: 560, drop: 220, len: 2400, descent: 520, ride: -1 });
    c.next({ gap: 320, drop: 320, len: 2400, descent: 480, ride: 1 });
  }
  return linearMapDef(skillMapMeta('glacier_run'), c.linear([0, 18002, 0], endAfter(c.last, 480, 480, 1000, 800)));
}
