// npm run skill:layout — confere o layout de todos os mapas do Surf Skill (stages que se cruzam,
// lava sobre outro stage, trechos não vizinhos encostados, nuvens no corredor de voo).
import { SKILL_MAPS } from '../shared/config/skill';
import { getSkillMap } from '../shared/maps/skillMaps';
import { layoutIssues, cloudIssues } from '../shared/maps/skillLayout';

let bad = 0;
for (const m of SKILL_MAPS) {
  const map = getSkillMap(m.id);
  const { issues, minClear } = layoutIssues(map);
  const clouds = cloudIssues(map);
  const n = issues.length + clouds.length;
  bad += n;
  console.log(`${n ? '✗' : '✓'} ${m.name.padEnd(18)} ${map.skill!.format.padEnd(7)} folga mínima ${Math.round(minClear)} u · nuvens ${map.decor.filter((d) => d.kind === 'cloud').length}${n ? '' : ''}`);
  for (const i of issues.slice(0, 12)) console.log(`    ${i.kind} ${i.a + 1}×${i.b + 1}: ${i.detail}`);
  for (const c of clouds.slice(0, 6)) console.log(`    nuvem: ${c}`);
}
process.exit(bad ? 1 : 0);
