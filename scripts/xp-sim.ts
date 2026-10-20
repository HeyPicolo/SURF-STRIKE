// Mede o XP por partida contra bots (rodada 12): o jogador local é controlado por um bot da
// dificuldade escolhida e joga partidas completas; imprime XP por arma, total e partidas até o máximo.
//   npx tsx scripts/xp-sim.ts [partidas=6] [dificuldade=medium] [tamanho=3] [nível do jogador=hard]
// (o "jogador" é um bot do nível dado — hard ≈ um jogador bom contra bots medium)
import { World } from '../shared/sim/world';
import { BotBrain } from '../shared/bots/brain';
import { buildClouds } from '../shared/maps/clouds';
import { MatchXpTracker, totalXpForLevel } from '../shared/sim/progression';
import { PROGRESSION, PROGRESSION_WEAPONS } from '../shared/config/progression';
import type { BotDifficulty } from '../shared/config/match';

const n = Number(process.argv[2] ?? 6), diff = (process.argv[3] ?? 'medium') as BotDifficulty, size = Number(process.argv[4] ?? 3), me = (process.argv[5] ?? 'hard') as BotDifficulty;
const map = buildClouds();
const sum: Record<string, number> = {};
let total = 0, wins = 0, secs = 0;
for (let m = 0; m < n; m++) {
  const w = new World(map, { mode: 'bots', teamSize: size, difficulty: diff, local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1000 + m * 77, autoBhop: true });
  w.local.isBot = true;
  w.bots.set(w.localId, new BotBrain(w, w.local, me));
  const t = new MatchXpTracker(w.localId, 'bots', diff);
  const dt = 0.01;
  while (w.match.phase !== 'matchEnd' && w.time < 3600) { w.step(dt); t.feed(w.drainEvents(), w); }
  if (w.match.score.blue > w.match.score.red) wins++;
  secs += w.time;
  let mt = 0;
  for (const [k, v] of Object.entries(t.total)) { sum[k] = (sum[k] ?? 0) + (v ?? 0); mt += v ?? 0; }
  total += mt;
  console.log(`partida ${m + 1}: ${w.match.score.blue}×${w.match.score.red} ${Math.round(w.time)} s  XP ${mt}  ${JSON.stringify(t.total)}`);
}
const per = total / n;
console.log(`\nmédia: ${Math.round(per)} XP/partida (bots ${diff}, jogador ≈ bot ${me}, ${size}v${size}), ${Math.round(secs / n / 60 * 10) / 10} min/partida, vitórias ${wins}/${n}`);
for (const w of PROGRESSION_WEAPONS) {
  const need = totalXpForLevel(PROGRESSION.maxLevel[w]);
  console.log(`${w.padEnd(8)} máx ${PROGRESSION.maxLevel[w]}: ${need} XP → ${(need / per).toFixed(1)} partidas usando só ela  (nesta amostra: ${Math.round((sum[w] ?? 0) / n)} XP/partida)`);
}
