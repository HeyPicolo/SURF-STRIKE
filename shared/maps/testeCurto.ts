// Mapa curtíssimo (linear, 1 checkpoint), fora do menu: usado pelos testes automáticos
// para terminar uma corrida rápida e ver o fantasma.
import { skillMapMeta } from '../config/skill';
import { linearMapDef, Course, endAfter } from './skillKit';
import type { MapDef } from './types';

export function buildTesteCurto(): MapDef {
  const c = new Course({ s: [0, 3800, -650], e: [0, 3300, -2600], hw: 280, h: 360, ride: -1 });
  c.checkpoint().next({ gap: 300, drop: 300, len: 2000, descent: 500 });
  return linearMapDef(skillMapMeta('teste_curto'), c.linear([0, 4002, 0], endAfter(c.last, 500, 500, 1000, 700)));
}
