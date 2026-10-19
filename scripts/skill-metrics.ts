// Corre o percurso de referência de cada mapa do Surf Skill, grava shared/maps/skillReference.ts
// (tempo e pico de velocidade) e imprime a tabela de métricas e o índice de dificuldade.
//   npm run skill:metrics           (todos os mapas)
//   npm run skill:metrics -- d1 d2  (só imprime alguns, sem gravar)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_MAPS, formatTicks } from '../shared/config/skill';
import { SKILL_MAP_BUILDERS } from '../shared/maps/skillMaps';
import { World } from '../shared/sim/world';
import { referenceRun } from '../shared/bots/routeDriver';
import { mapMetrics, difficultyIndex, RefResult } from '../shared/maps/skillMetrics';

const only = process.argv.slice(2);
const ids = SKILL_MAPS.filter((m) => !m.hidden && (only.length === 0 || only.includes(m.id))).map((m) => m.id);
const refs: Record<string, RefResult> = {};
const rows: string[] = [];
rows.push('| Mapa | Tier | Formato | Segmentos | Meia-largura mín/média | Normal Y | Maior gap | Vel. mínima | Tempo de ar | Transições | Curva máx. | Referência | Pico | Índice |');
rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const id of ids) {
  const meta = SKILL_MAPS.find((m) => m.id === id)!;
  const map = SKILL_MAP_BUILDERS[id]();
  const w = new World(map, { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'ref', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
  const t0 = Date.now();
  const r = referenceRun(w, { stopOnFall: true });
  if (!r.finished) { console.error(`${id}: FALHOU no segmento ${(r.fail?.segment ?? -1) + 1} em ${r.fail?.pos.map(Math.round)}`); process.exitCode = 1; continue; }
  refs[id] = { ticks: r.ticks, peak: r.peak };
  const m = mapMetrics(map);
  const name = `${meta.num ? `D${meta.num} · ` : ''}${meta.name}`;
  rows.push(`| ${name} | T${meta.tier} | ${meta.format} | ${m.segments} | ${m.minHalfWidth} / ${m.avgHalfWidth} | ${m.minNormalY.toFixed(2)}–${m.maxNormalY.toFixed(2)} | ${m.maxGap} u | ${m.minSpeed} u/s | ${m.maxAirTime.toFixed(2)} s | ${m.transitions} | ${m.maxTurn}° | ${formatTicks(r.ticks)} | ${r.peak} u/s | ${difficultyIndex(m, refs[id])} |`);
  console.error(`${id}: ${formatTicks(r.ticks)} (${((Date.now() - t0) / 1000).toFixed(1)} s de CPU)`);
}
console.log(rows.join('\n'));
if (only.length === 0 && !process.exitCode) {
  const out = `// Gerado por scripts/skill-metrics.ts — não edite à mão (npm run skill:metrics).
// Resultado do percurso de referência (sem assistência) de cada mapa: tempo em ticks e pico de velocidade.
export const SKILL_REFERENCE: Record<string, { ticks: number; peak: number }> = {
${Object.entries(refs).map(([id, r]) => `  ${id}: { ticks: ${r.ticks}, peak: ${r.peak} },`).join('\n')}
};
`;
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'maps', 'skillReference.ts'), out);
}
