// =============================================================
//  D3 · LANTERN PASS — Surf Skill · Desafio · TIER 3 · staged, 7 stages
//  "Um degrau acima": linhas mais apertadas (meia-largura 150–160), curvas de 25 a 35° feitas na
//  própria rampa (segmentos curvos, face de dentro) e trocas de face rápidas entre rampas curtas.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const H = 250;

/**
 * Passos do stage: número = curva (graus) feita na rampa, seguida de uma reta curta; 's' = troca de
 * face por um gap (rampa curta na outra face). A face fica sempre do lado de dentro da próxima curva.
 */
type Step = number | 's';
function stage(steps: Step[], o: { hw?: number; straight?: number } = {}): StageSpec {
  const hw = o.hw ?? 160, straight = o.straight ?? 1500;
  const firstTurn = steps.find((s) => typeof s === 'number') as number | undefined;
  const ride0: 1 | -1 = (firstTurn ?? 1) > 0 ? 1 : -1;
  const c = new Course({ s: [0, -260, -560], e: [0, -260 - 440, -560 - 2100], hw, h: H, ride: ride0 });
  steps.forEach((st, i) => {
    if (st === 's') {
      // próxima curva define o lado; sem curva depois, só alterna
      const nextTurn = steps.slice(i + 1).find((x) => typeof x === 'number') as number | undefined;
      const ride: 1 | -1 = nextTurn !== undefined ? (nextTurn > 0 ? 1 : -1) : (c.last.ride === 1 ? -1 : 1);
      c.next({ gap: 300, drop: 320, len: 1700, descent: 360, hw, ride: ride === c.last.ride ? (ride === 1 ? -1 : 1) : ride });
      if (ride === c.ramps[c.ramps.length - 2].ride) c.next({ gap: 300, drop: 320, len: 1700, descent: 360, hw, ride });
    } else {
      c.curveFor(st, 2300, 110).straight(straight, 300);
    }
  });
  return c.stage(endAfter(c.last, 420, 460, 760, 620));
}

export const LANTERN_PASS_STAGES: StageSpec[] = [
  // 1 · Primeira lanterna: curva de 25° para cada lado
  stage([25, 's', -25, 's', 25]),
  // 2 · Beco: trocas de face rápidas, rampas curtas
  stage(['s', 's', 's', 's', 's', 's']),
  // 3 · Ponte de papel: duas curvas seguidas para o mesmo lado (60°) e volta
  stage([30, 30, 's', -30, -30]),
  // 4 · Vielas: curvas de 35°
  stage([35, 's', -35, 's', 35, 's', -35]),
  // 5 · Telhados: mais estreito
  stage([-28, 's', 28, 's', -28, 's', 28], { hw: 150 }),
  // 6 · Festival: curvas variadas e trocas de face
  stage([32, 's', 's', -25, 's', 30, 's', -35]),
  // 7 · Portão: o mais longo e apertado
  stage([30, 's', -35, 's', 30, 's', -35, 's', 30], { hw: 150 }),
];

export function buildLanternPass(): MapDef { return skillMapDef(skillMapMeta('lantern_pass'), LANTERN_PASS_STAGES); }
