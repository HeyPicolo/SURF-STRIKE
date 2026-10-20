// =============================================================
//  D9 · HOLLOW MOON — Surf Skill · Desafio · TIER 5 · linear, 7 checkpoints
//  Rampas de uma face só em lados alternados, uma espiral descendente (curvas para a direita feitas
//  em rampas de face direita) e transições de descida bruscas (gaps de 520–560 u com quedas de 700–860 u, rampas de pouso longas).
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const ONE = { hw: 110, h: 190 };   // rampa de uma face: normal Y ≈ 0,50 (íngreme)
const R: { ride: 1; sides: 'right' } = { ride: 1, sides: 'right' };
const Lf: { ride: -1; sides: 'left' } = { ride: -1, sides: 'left' };

export function buildHollowMoon(): MapDef {
  const c = new Course({ s: [0, 31600, -650], e: [0, 30900, -3300], ...ONE, ...R });
  for (let k = 0; k < 8; k++) {
    if (k > 0) { c.checkpoint(); c.next({ gap: 320, drop: 320, len: 2800, descent: 760, ...ONE, ...R }); }
    // faces alternadas, gaps curtos
    for (let i = 0; i < 3; i++) c.next({ gap: 250, drop: 250, len: 1600, descent: 320, ...ONE, ...(i % 2 === 0 ? Lf : R) });
    // descida brusca: queda grande logo depois do gap
    c.next({ gap: 560, drop: 700 + k * 20, len: 3000, descent: 420, ...ONE, ...R });
    // espiral: curva larga para a direita na face direita
    c.curveFor(90, 2400, 100).straight(800, 160);
    // mais faces alternadas antes da segunda descida brusca
    for (let i = 0; i < 2; i++) c.next({ gap: 250, drop: 250, len: 1500, descent: 280, ...ONE, ...(i % 2 === 0 ? Lf : R) });
    c.next({ gap: 250, drop: 250, len: 1700, descent: 300, ...ONE, ...Lf });
    c.next({ gap: 520, drop: 760 + k * 10, len: 2600, descent: 300, ...ONE, ...R });
    c.curveFor(90, 2400, 90).straight(700, 140);
  }
  // reta final: mais três faces alternadas até a chegada
  for (let i = 0; i < 3; i++) c.next({ gap: 250, drop: 250, len: 1600, descent: 320, ...ONE, ...(i % 2 === 0 ? Lf : R) });
  return linearMapDef(skillMapMeta('hollow_moon'), c.linear([0, 32002, 0], endAfter(c.last, 560, 520, 1100, 900)));
}
