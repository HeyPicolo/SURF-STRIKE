// =============================================================
//  D5 · IRON CATHEDRAL — Surf Skill · Desafio · TIER 4 · staged, 8 stages
//  Introduz TÚNEIS e TETOS BAIXOS: rampas estreitas (meia-largura 130–145) dentro de corredores
//  fechados. O teto fica 125–150 u acima do cume, então o salto entre as rampas precisa ser baixo
//  e controlado (quedas curtas, de 70–90 u). Fora dos túneis, curvas na rampa e trocas de face.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

/**
 * Peças: 'T' rampa de túnel (mesma face), 'X' rampa de túnel trocando de face, 'O' rampa aberta,
 * número = curva aberta na rampa (graus) seguida de reta.
 */
type Piece = 'T' | 'X' | 'O' | number;
function stage(pieces: Piece[], o: { hw?: number; clear?: number; h?: number } = {}): StageSpec {
  const hw = o.hw ?? 140, h = o.h ?? 220, clear = o.clear ?? 145;
  const c = new Course({ s: [0, -260, -560], e: [0, -700, -2700], hw, h, ride: -1 });
  for (const p of pieces) {
    const flip: 1 | -1 = c.last.ride === 1 ? -1 : 1;
    if (p === 'T' || p === 'X') {
      // entre túneis a queda é curta (o teto não deixa subir); vindo de uma rampa aberta, queda média e a boca do túnel no meio da rampa
      const inside = !!c.last.ceiling;
      c.next({ gap: inside ? 250 : 300, drop: inside ? (p === 'X' ? 100 : 85) : 160, len: 2100, descent: 420, ride: p === 'X' ? flip : c.last.ride, ceiling: clear });
    }
    else if (p === 'O') c.next({ gap: 320, drop: 330, len: 2300, descent: 470, ride: flip });
    else {
      // a curva usa a face de dentro: troca de face antes, se precisar
      const inner: 1 | -1 = p > 0 ? 1 : -1;
      c.next({ gap: 320, drop: 330, len: 1600, descent: 330, ride: inner });
      c.curveFor(p, 2400, 100).straight(1400, 280);
    }
  }
  return c.stage(endAfter(c.last, 420, 460, 760, 620));
}

export const IRON_CATHEDRAL_STAGES: StageSpec[] = [
  // 1 · Nave: o primeiro túnel, reto
  stage(['T', 'T', 'O', 'T', 'T']),
  // 2 · Cripta: túnel com trocas de face
  stage(['X', 'X', 'X', 'O', 'X']),
  // 3 · Claustro: curva aberta e túnel
  stage([35, 'T', 'T', -35, 'O']),
  // 4 · Abóbada: teto mais baixo
  stage(['T', 'X', 'T', 'X', 'T', 'O'], { clear: 130 }),
  // 5 · Órgão: mais estreito
  stage(['X', 'T', 40, 'T', 'X'], { hw: 132, h: 210 }),
  // 6 · Vitral: curvas e túneis alternados
  stage([-40, 'T', 'X', 40, 'T', 'X', 'T']),
  // 7 · Campanário: túnel longo e baixo
  stage(['T', 'T', 'X', 'T', 'T', 'X', 'O'], { clear: 128, hw: 135 }),
  // 8 · Altar: tudo junto
  stage([45, 'X', 'T', -45, 'X', 'T', 'O'], { hw: 132, h: 210, clear: 130 }),
];

export function buildIronCathedral(): MapDef { return skillMapDef(skillMapMeta('iron_cathedral'), IRON_CATHEDRAL_STAGES); }
