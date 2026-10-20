// =============================================================
//  D6 · SKYWIRE — Surf Skill · Desafio · TIER 4 · linear, 6 checkpoints
//  Estilo air control: gaps longos (900–1300 u) com curva de 14–22° no ar e pousos em rampas desalinhadas,
//  que pedem air strafe preciso. Entre os "cabos", curvas largas na própria rampa mantêm o
//  percurso numa espiral para a direita.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { linearMapDef, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const W = { hw: 150, h: 240 };

export function buildSkywire(): MapDef {
  const c = new Course({ s: [0, 31600, -650], e: [0, 30900, -3300], ...W, ride: 1 });
  // cada trecho: descida que dá embalo → cabo (gap longo virando no ar) → rampa desalinhada →
  // cabo para o outro lado → descida → curva larga na rampa → reta
  // queda necessária num cabo para quem chega a `v` u/s (com folga): tempo de ar t = gap / v
  const dropFor = (gap: number, v: number) => { const t = gap / v; return Math.round(400 * t * t + 320 * t + 140); };
  const wires = [[16, -14, 15, -14, 16], [18, -15, 16, -15, 17], [-17, 19, -16, 18, -17], [19, -17, 18, -16, 19], [-18, 20, -17, 19, -18], [20, -18, 19, -17, 20], [21, -19, 20, -18, 21]];
  const wire = (k: number, i: number, t: number) => {
    const gap = 900 + k * 40 + (i % 3) * 120;
    c.next({ gap, drop: dropFor(gap, 1250), turn: t, len: 2300, descent: 260, ride: t > 0 ? -1 : 1, hw: 195, h: 300 });
  };
  const bend = () => {
    // rampa de ligação na face de dentro da curva e curva larga para a direita
    c.next({ gap: 320, drop: 320, len: 1600, descent: 300, ride: 1, hw: W.hw, h: W.h });
    c.curveFor(75, 2600, 40).straight(1200, 120);
  };
  for (let k = 0; k < 7; k++) {
    if (k > 0) c.checkpoint();
    c.next({ gap: 320, drop: 320, len: 2800, descent: 700, ride: 1, hw: W.hw, h: W.h });
    // três cabos por trecho, com duas curvas largas no meio; a rampa de chegada de cada cabo fica
    // do lado de fora da curva feita no ar (face de fora)
    const ws = wires[k];
    wire(k, 0, ws[0]); wire(k, 1, ws[1]);
    bend();
    wire(k, 2, ws[2]);
    c.next({ gap: 320, drop: 320, len: 1800, descent: -250, ride: 1, hw: W.hw, h: W.h }); // subida: segura a velocidade
    c.next({ gap: 520, drop: 160, len: 1800, descent: 300, ride: 1, hw: W.hw, h: W.h });
    c.curveFor(75, 2600, 40).straight(1200, 120);
  }
  return linearMapDef(skillMapMeta('skywire'), c.linear([0, 32002, 0], endAfter(c.last, 560, 520, 1100, 900)));
}
