// Gera shared/maps/skillVersions.ts: o hash da geometria de cada mapa do Surf Skill.
// O menu usa esses valores para ler os recordes sem construir os 15 mapas.
// Rode depois de mudar qualquer mapa:  npm run skill:versions   (um teste confere se está em dia)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_MAP_BUILDERS } from '../shared/maps/skillMaps';
import { mapVersion } from '../shared/sim/records';

const lines = Object.entries(SKILL_MAP_BUILDERS).map(([id, build]) => `  ${id}: '${mapVersion(build())}',`);
const out = `// Gerado por scripts/skill-versions.ts — não edite à mão (npm run skill:versions).
// Hash da geometria e das zonas de cada mapa do Surf Skill: chave dos recordes e fantasmas.
export const SKILL_MAP_VERSIONS: Record<string, string> = {
${lines.join('\n')}
};
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'maps', 'skillVersions.ts'), out);
console.log(out);
