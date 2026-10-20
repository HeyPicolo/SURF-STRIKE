// =============================================================
//  DRIFT CANYON — Surf Skill · TIER 2 (intermediário)
//  Rampas mais estreitas, mais transições rampa-rampa, curvas, mudanças de altura,
//  bhop obrigatório na saída de alguns stages e gaps que exigem manter a velocidade.
// =============================================================
import { skillMapMeta } from '../config/skill';
import { skillMapDef, StageSpec } from './skillKit';
import type { MapDef } from './types';

export const DRIFT_CANYON_STAGES: StageSpec[] = [
  // 1 · Garganta: três rampas estreitas trocando de face
  { ramps: [
      { s: [0, -150, -450], e: [0, -750, -2800], hw: 180, h: 260, ride: -1 },
      { s: [-126, -1050, -3100], e: [-126, -1650, -5300], hw: 180, h: 260, ride: 1 },
      { s: [0, -1950, -5600], e: [0, -2550, -7800], hw: 180, h: 260, ride: -1 },
    ],
    end: { x: 0, y: -2900, z: -8400, w: 700, d: 600 } },
  // 2 · Zigue: curva para a direita e de volta para a esquerda
  { ramps: [
      { s: [0, -150, -450], e: [0, -750, -2800], hw: 180, h: 260, ride: -1 },
      { s: [-60, -1050, -3100], e: [700, -1650, -5200], hw: 180, h: 260, ride: -1 },
      { s: [840, -1950, -5550], e: [300, -2550, -7700], hw: 180, h: 260, ride: 1 },
    ],
    end: { x: 200, y: -2900, z: -8300, w: 700, d: 600 } },
  // 3 · Desfiladeiro: descida forte, gap longo e uma rampa quase plana que só mantém a velocidade
  { ramps: [
      { s: [0, -150, -450], e: [0, -1150, -3000], hw: 170, h: 260, ride: -1 },
      { s: [-60, -2000, -3900], e: [-60, -2250, -6600], hw: 170, h: 260, ride: -1 },
    ],
    end: { x: -60, y: -2600, z: -7250, w: 700, d: 600 } },
  // 4 · Saltos: rampa até uma pista com buracos — atravesse no bhop
  { ramps: [
      { s: [0, -150, -450], e: [0, -900, -3200], hw: 180, h: 260, ride: -1 },
    ],
    boxes: [
      // a primeira pista é longa: quem chega embalado do stage anterior também pousa nela
      { min: [-300, -1380, -4760], max: [300, -1300, -3700] },
      { min: [-300, -1380, -5560], max: [300, -1300, -4880] },
      { min: [-300, -1380, -6340], max: [300, -1300, -5680] },
    ],
    tail: [
      { p: [0, -1300, -4050], mode: 'air', r: 200, jump: true },
      { p: [0, -1300, -5220], mode: 'walk', r: 200, jump: true },
      { p: [0, -1300, -5890], mode: 'walk', r: 200, jump: true },
    ],
    end: { x: 0, y: -1300, z: -6650, w: 600, d: 600 } },
  // 5 · Cânion final: curva, mudança de altura e bhop até a chegada
  { ramps: [
      { s: [0, -150, -450], e: [0, -800, -2800], hw: 170, h: 260, ride: -1 },
      { s: [-60, -1100, -3100], e: [-800, -1700, -5200], hw: 170, h: 260, ride: -1 },
      { s: [-1000, -2050, -5500], e: [-1000, -2400, -7600], hw: 170, h: 260, ride: -1 },
    ],
    boxes: [
      { min: [-1300, -2780, -9100], max: [-700, -2700, -8000] },
    ],
    tail: [{ p: [-1000, -2700, -8700], mode: 'air', r: 250, jump: true }],
    end: { x: -1000, y: -2700, z: -10050, w: 700, d: 800 } },
];

export function buildDriftCanyon(): MapDef { return skillMapDef(skillMapMeta('drift_canyon'), DRIFT_CANYON_STAGES); }
