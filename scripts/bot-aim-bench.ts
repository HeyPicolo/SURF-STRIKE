// Bancada de mira dos bots: um bot (cada dificuldade) atira num alvo que anda de lado, em 3 distâncias.
// Mede taxa de acerto (acertos / tiros) e o tempo até o primeiro acerto. Uso: npx tsx scripts/bot-aim-bench.ts
import { aimBench } from '../shared/bots/aimBench';
import type { BotDifficulty } from '../shared/config/match';

const diffs: BotDifficulty[] = ['easy', 'medium', 'hard', 'god'];
const dists = [400, 1200, 2400];
console.log('dificuldade  distância  acerto   1º acerto (s, média/min/máx)');
for (const d of diffs) for (const dist of dists) {
  const r = aimBench(d, dist, { seeds: [1, 2, 3, 4, 5, 6], seconds: 12 });
  console.log(`${d.padEnd(11)}  ${String(dist).padStart(5)}      ${(r.hitRate * 100).toFixed(1).padStart(5)}%   ${r.firstHit.mean.toFixed(2)} / ${r.firstHit.min.toFixed(2)} / ${r.firstHit.max.toFixed(2)}  (tiros ${r.shots})`);
}
