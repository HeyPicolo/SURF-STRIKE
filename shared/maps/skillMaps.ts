// Registro dos mapas do Surf Skill (id → construtor). Os metadados ficam em config/skill.ts.
import type { MapDef } from './types';
import { buildSkySteps } from './skySteps';
import { buildDriftCanyon } from './driftCanyon';
import { buildStormSpire } from './stormSpire';

export const SKILL_MAP_BUILDERS: Record<string, () => MapDef> = {
  sky_steps: buildSkySteps,
  drift_canyon: buildDriftCanyon,
  storm_spire: buildStormSpire,
};

const cache = new Map<string, MapDef>();
/** Constrói (uma vez) o mapa de Surf Skill. */
export function getSkillMap(id: string): MapDef {
  let m = cache.get(id);
  if (!m) {
    const b = SKILL_MAP_BUILDERS[id];
    if (!b) throw new Error(`mapa de Surf Skill desconhecido: ${id}`);
    m = b();
    cache.set(id, m);
  }
  return m;
}
