// =============================================================
//  D10 · THUNDERHEAD — Surf Skill · Desafio · TIER 6 · linear, 8 checkpoints
//  Seções de VELOCIDADE MÍNIMA: gaps de 1500–1900 u com pouca queda, calculados para quem passa a
//  ~1700 u/s. Mais devagar que isso, o arco termina antes da rampa seguinte. Cada trecho dá embalo
//  numa descida longa, salta o gap, segue em rampas estreitas e faz duas curvas largas (a espiral).
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter, gapDrop } from '../skillKit';
import type { MapDef } from '../types';

const N = { hw: 115, h: 200 };
/** velocidade mínima dos gaps grandes */
const VMIN = 1700;

export function buildThunderhead(): MapDef {
  const c = new Course({ s: [0, 33600, -650], e: [0, 32700, -3600], ...N, ride: 1 });
  for (let k = 0; k < 9; k++) {
    if (k > 0) c.checkpoint();
    // embalo: duas descidas fortes
    c.next({ gap: 320, drop: 320, len: 3000, descent: 820, ...N, ride: 1 });
    c.next({ gap: 320, drop: 320, len: 2800, descent: 720, ...N, ride: -1 });
    // gap de velocidade mínima (pousa numa rampa um pouco mais larga)
    const gap = 1500 + (k % 4) * 120;
    c.next({ gap, drop: gapDrop(c.last, gap, VMIN, 70), len: 2400, descent: 420, hw: 160, h: 260, ride: -1 });
    c.next({ gap: 320, drop: 320, len: 2000, descent: 380, ...N, ride: 1 });
    c.curveFor(90, 2600, 100).straight(900, 180);
    c.next({ gap: 300, drop: 300, len: 1800, descent: 340, ...N, ride: -1 });
    c.next({ gap: 300, drop: 300, len: 1800, descent: 340, ...N, ride: 1 });
    c.curveFor(90, 2600, 100).straight(900, 180);
  }
  return linearMapDef(skillMapMeta('thunderhead'), c.linear([0, 34002, 0], endAfter(c.last, 560, 520, 1100, 900)));
}
