// Registro dos mapas do Surf Skill (id → construtor). Os metadados ficam em config/skill.ts.
import type { MapDef } from './types';
import { buildSkySteps } from './skySteps';
import { buildDriftCanyon } from './driftCanyon';
import { buildStormSpire } from './stormSpire';
import { buildTesteCurto } from './testeCurto';
import { buildCoralRush } from './desafios/coralRush';
import { buildVelvetDunes } from './desafios/velvetDunes';
import { buildLanternPass } from './desafios/lanternPass';
import { buildGlacierRun } from './desafios/glacierRun';
import { buildIronCathedral } from './desafios/ironCathedral';
import { buildSkywire } from './desafios/skywire';

export const SKILL_MAP_BUILDERS: Record<string, () => MapDef> = {
  sky_steps: buildSkySteps,
  drift_canyon: buildDriftCanyon,
  storm_spire: buildStormSpire,
  teste_curto: buildTesteCurto,
  coral_rush: buildCoralRush,
  velvet_dunes: buildVelvetDunes,
  lantern_pass: buildLanternPass,
  glacier_run: buildGlacierRun,
  iron_cathedral: buildIronCathedral,
  skywire: buildSkywire,
};

// só o último mapa construído fica em memória (o menu não precisa construir mapas: usa skillVersions.ts)
let cached: { id: string; map: MapDef } | null = null;
/** Constrói o mapa de Surf Skill selecionado (reaproveita se for o mesmo da última vez). */
export function getSkillMap(id: string): MapDef {
  if (cached?.id === id) return cached.map;
  const b = SKILL_MAP_BUILDERS[id];
  if (!b) throw new Error(`mapa de Surf Skill desconhecido: ${id}`);
  cached = { id, map: b() };
  return cached.map;
}
