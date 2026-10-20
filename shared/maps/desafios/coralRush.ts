// =============================================================
//  D1 · CORAL RUSH — Surf Skill · Desafio · TIER 2 · staged, 6 stages
//  Estilo mapa curto e limpo de stages: rampas médias e retas, transições rampa-rampa simples.
//  Cada stage começa com um salto grande da plataforma até a primeira rampa: largar devagar
//  (caminhando, ou sem embalo) faz cair antes dela.
// =============================================================
import { skillMapMeta } from '../../config/skill';
import { skillMapDef, StageSpec, Course, RampSeg, endAfter } from '../skillKit';
import type { MapDef } from '../types';

const MID = { hw: 195, h: 320 };

/** Primeira rampa longe e abaixo da borda da plataforma: exige sair correndo. */
function opening(ride: 1 | -1, len: number, descent: number, x = 0): RampSeg {
  return { s: [x, -420, -660], e: [x, -420 - descent, -660 - len], ...MID, ride };
}

type N = { len: number; descent: number; ride?: 1 | -1; gap?: number; drop?: number; turn?: number };
function stage(first: RampSeg, nexts: N[]): StageSpec {
  const c = new Course(first);
  for (const n of nexts) c.next({ gap: n.gap ?? 320, drop: n.drop ?? 330, len: n.len, descent: n.descent, ride: n.ride, turn: n.turn });
  // rodada 9: com a velocidade mantida entre stages o mapa ficou curto; uma rampa a mais por stage
  for (let i = 0; i < 1; i++) c.next({ gap: 320, drop: 330, len: 2600, descent: 520, ride: c.last.ride === 1 ? -1 : 1 });
  return c.stage(endAfter(c.last, 450, 480, 900, 700));
}
const r = (len: number, descent: number, o: Partial<N> = {}): N => ({ len, descent, ...o });

export const CORAL_RUSH_STAGES: StageSpec[] = [
  // 1 · Recife: rampas retas na mesma face
  stage(opening(-1, 2700, 540), [r(2700, 540), r(2700, 540), r(2600, 520), r(2500, 500)]),
  // 2 · Correnteza: troca de face a cada rampa
  stage(opening(1, 2600, 520), [r(2600, 520, { ride: -1 }), r(2600, 520, { ride: 1 }), r(2600, 520, { ride: -1 }), r(2500, 500, { ride: 1 })]),
  // 3 · Atol: rampas longas, gaps maiores
  stage(opening(-1, 3000, 600), [r(3000, 600, { gap: 420, drop: 380 }), r(3000, 600, { gap: 420, drop: 380 }), r(2800, 560, { gap: 420, drop: 380 }), r(2600, 520)]),
  // 4 · Maré alta: faces alternadas em pares e um leve desvio de rota
  stage(opening(1, 2500, 500), [r(2500, 500, { turn: -10 }), r(2500, 500, { ride: -1, turn: 10 }), r(2500, 500, { turn: 10 }), r(2500, 500, { ride: 1, turn: -10 }), r(2400, 480)]),
  // 5 · Coral vermelho: descida mais forte e gaps maiores
  stage(opening(-1, 2800, 650), [r(2800, 620, { gap: 460, drop: 400 }), r(2800, 620, { ride: 1, gap: 460, drop: 400 }), r(2700, 600, { ride: -1, gap: 460, drop: 400 }), r(2600, 560, { ride: 1 })]),
  // 6 · Arrebentação: a mais longa, com desvios leves
  stage(opening(1, 2600, 520), [r(2600, 520, { ride: -1, turn: 12 }), r(2600, 520, { turn: -12 }), r(2600, 520, { ride: 1, gap: 420, drop: 380 }), r(2600, 520, { ride: -1, turn: -12 }), r(2500, 500, { turn: 12 })]),
];

export function buildCoralRush(): MapDef { return skillMapDef(skillMapMeta('coral_rush'), CORAL_RUSH_STAGES); }
