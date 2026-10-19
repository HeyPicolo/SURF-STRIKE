// =============================================================
//  SKY STEPS — Surf Skill · TIER 1 (iniciante)
//  Rampas largas (meia-largura 300), inclinação suave e constante (≈ 52°), retas longas,
//  transições óbvias com bastante folga e chegadas grandes logo depois do fim da rampa.
//  Stage 1 ensina a segurar a rampa; stage 5 tem uma curva leve e uma transição entre duas rampas.
// =============================================================
import { skillMapMeta } from '../config/skill';
import { skillMapDef, StageSpec, RampSeg, endAfter } from './skillKit';
import type { MapDef } from './types';

const WIDE = { hw: 300, h: 380 };
/** chegada grande: borda a 150u do fim da rampa, 500u abaixo do cume */
const arrival = (r: RampSeg, w = 1000, d = 700) => endAfter(r, d / 2 + 150, 500, w, d);

function stage(ramps: RampSeg[], end = arrival(ramps[ramps.length - 1])): StageSpec { return { ramps, end }; }

export const SKY_STEPS_STAGES: StageSpec[] = [
  // 1 · Primeiro contato: uma rampa larga e reta
  stage([{ s: [0, -150, -450], e: [0, -1000, -3800], ...WIDE, ride: -1 }]),
  // 2 · Reta longa
  stage([{ s: [0, -150, -450], e: [0, -1400, -5600], ...WIDE, ride: 1 }]),
  // 3 · Degraus: duas rampas alinhadas, a segunda um pouco abaixo
  stage([
    { s: [0, -150, -450], e: [0, -800, -3000], ...WIDE, ride: -1 },
    { s: [-60, -1100, -3300], e: [-60, -1800, -6000], ...WIDE, ride: -1 },
  ]),
  // 4 · Dupla: sai da face esquerda e cai na face direita da segunda rampa
  stage([
    { s: [0, -150, -450], e: [0, -800, -3000], ...WIDE, ride: -1 },
    { s: [-220, -1100, -3300], e: [-220, -1800, -6000], ...WIDE, ride: 1 },
  ]),
  // 5 · Curva leve: a segunda rampa vira ~15° para a esquerda
  stage([
    { s: [0, -150, -450], e: [0, -800, -3000], ...WIDE, ride: -1 },
    { s: [-60, -1100, -3300], e: [-760, -1800, -5900], ...WIDE, ride: -1 },
  ]),
];

export function buildSkySteps(): MapDef { return skillMapDef(skillMapMeta('sky_steps'), SKY_STEPS_STAGES); }
