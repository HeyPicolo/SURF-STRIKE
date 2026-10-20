// Rodada 11a: mira humanizada dos bots (flick com aceleração/desaceleração e overshoot, rastreamento
// imperfeito, taxas de acerto por dificuldade, reação com distribuição, sem tiro sem linha de visão, determinismo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimBench } from '../shared/bots/aimBench';
import { BOT_HITRATE, BOT_BENCH_DIST, BotDifficulty } from '../shared/config/match';
import { V3, DEG, forwardFromAngles } from '../shared/math/vec3';
import { World } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { boxBrush } from '../shared/physics/brush';
import { SIM_DT } from '../shared/config/physics';
import { BotBrain } from '../shared/bots/brain';

const DIFFS: BotDifficulty[] = ['easy', 'medium', 'hard', 'god'];

/** Erro angular entre a mira do bot e o meio do alvo (graus). */
function aimErr(w: World, b: BotBrain): number {
  const p = w.local, d = w.players.find((q) => q.isDummy)!;
  const eye = p.eyePos(new V3()), mid = d.phys.pos.clone(); mid.y += 40;
  const to = mid.sub(eye).normalize(), look = forwardFromAngles(b.lookYaw, b.lookPitch, new V3());
  return Math.acos(Math.min(1, look.dot(to))) / DEG;
}

test('flicks look like a hand: speed rises then falls within each flick, and part of them overshoot', () => {
  for (const diff of DIFFS) {
    let flicks = 0, overs = 0, bellShaped = 0, checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let prof: number[] = [], inFlick = false, last: BotBrain | null = null;
      aimBench(diff, 900, {
        seeds: [seed], seconds: 3, target: 'still', startOff: 40 + seed * 9,
        onTick: (_w, b) => {
          last = b;
          if (b.aim.phase === 'flick') { prof.push(b.aim.speed); inFlick = true; }
          else if (inFlick) {
            inFlick = false;
            if (prof.length >= 5) {
              checked++;
              const peak = Math.max(...prof), start = prof[0], end = prof[prof.length - 1];
              if (peak > start * 2.5 && peak > end * 2.5) bellShaped++;
            }
            prof = [];
          }
        },
      });
      flicks += last!.aim.flicks; overs += last!.aim.overshoots;
    }
    assert.ok(checked >= 6, `${diff}: flicks medidos ${checked}`);
    assert.equal(bellShaped, checked, `${diff}: velocidade em sino em todos os flicks (${bellShaped}/${checked})`);
    const frac = overs / flicks;
    assert.ok(frac > 0.2 && frac < 0.95, `${diff}: overshoot em ${(frac * 100).toFixed(0)}% dos flicks`);
  }
});

test('tracking a zigzag target never locks on (error not ~0 for long) and is worse against a surfing target', () => {
  for (const diff of ['medium', 'god'] as const) {
    const run = (target: 'strafe' | 'surf') => {
      let sum = 0, n = 0, lockRun = 0, maxLock = 0;
      aimBench(diff, 700, {
        seeds: [3, 4], seconds: 8, target,
        onTick: (w, b, t) => {
          // só rastreamento puro: sem o desvio da compensação de recuo de uma rajada
          if (t < 2 || b.aim.phase !== 'track' || !b.hasLos || Math.abs(w.local.punchPitch) > 0.2) return;
          const e = aimErr(w, b);
          sum += e; n++;
          if (e < 0.08) { lockRun += SIM_DT; maxLock = Math.max(maxLock, lockRun); } else lockRun = 0;
        },
      });
      return { mean: sum / n, maxLock };
    };
    const zig = run('strafe'), surf = run('surf');
    assert.ok(zig.maxLock < 0.25, `${diff}: mira cravada no alvo por ${zig.maxLock.toFixed(2)} s (aimlock)`);
    assert.ok(zig.mean > 0.2, `${diff}: erro médio ${zig.mean.toFixed(2)}° (perfeito demais)`);
    assert.ok(surf.mean > zig.mean * 1.1, `${diff}: erro contra quem surfa ${surf.mean.toFixed(2)}° × andando ${zig.mean.toFixed(2)}°`);
  }
});

test('hit rate by difficulty stays in the configured ranges and grows easy < medium < hard < god (< 100%)', () => {
  const rates: Record<string, Record<string, number>> = {};
  for (const diff of DIFFS) {
    rates[diff] = {};
    for (const [k, dist] of Object.entries(BOT_BENCH_DIST)) {
      const r = aimBench(diff, dist, { seeds: [11, 12, 13, 14], seconds: 8 });
      const [lo, hi] = BOT_HITRATE[diff][k as keyof typeof BOT_BENCH_DIST];
      assert.ok(r.hitRate >= lo && r.hitRate <= hi, `${diff} ${k}: ${(r.hitRate * 100).toFixed(1)}% fora de [${lo * 100}, ${hi * 100}]`);
      assert.equal(r.shotsBeforeLos, 0);
      rates[diff][k] = r.hitRate;
    }
  }
  for (const k of Object.keys(BOT_BENCH_DIST)) {
    for (let i = 1; i < DIFFS.length; i++) assert.ok(rates[DIFFS[i]][k] > rates[DIFFS[i - 1]][k], `${k}: ${DIFFS[i - 1]} ${rates[DIFFS[i - 1]][k]} ≥ ${DIFFS[i]} ${rates[DIFFS[i]][k]}`);
    assert.ok(rates.god[k] < 0.95, `GOD ${k} abaixo de 100%`);
  }
});

test('time to first hit and reaction times are distributions, not a fixed value; harder bots are faster', () => {
  const means: number[] = [];
  for (const diff of DIFFS) {
    const r = aimBench(diff, 500, { seeds: [1, 2, 3, 4, 5, 6, 7, 8], seconds: 6 });
    const a = r.firstHit.all, m = a.reduce((x, y) => x + y, 0) / a.length;
    const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    assert.ok(sd > 0.04, `${diff}: 1º acerto sempre igual (${a.map((x) => x.toFixed(2)).join(' ')})`);
    assert.ok(new Set(a.map((x) => x.toFixed(2))).size >= 4, `${diff}: pouca variação`);
    means.push(m);
  }
  for (let i = 1; i < means.length; i++) assert.ok(means[i] < means[i - 1], `1º acerto: ${means.map((x) => x.toFixed(2)).join(' > ')}`);
  // reações sorteadas: cauda longa (a maior bem acima da mediana)
  const reactions: number[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) aimBench('medium', 600, { seeds: [seed], seconds: 0.5, onTick: (_w, b) => { if (b.reactions.length) reactions[seed] = b.reactions[0]; } });
  const rs = reactions.filter((x) => x !== undefined).sort((a, b) => a - b);
  assert.ok(rs[rs.length - 1] > rs[Math.floor(rs.length / 2)] * 1.3, `reações ${rs.map((x) => x.toFixed(2)).join(' ')}`);
});

test('no bot shoots or tracks a target it cannot see (wall in between)', () => {
  const c = buildClouds();
  const floor = boxBrush(new V3(-6000, -100, -6000), new V3(6000, 0, 6000), { color: 0x888888 });
  const wall = boxBrush(new V3(-3000, 0, 380), new V3(3000, 400, 420), { color: 0x888888 });
  const map = { ...c, brushes: [floor, wall], triggers: [], pickups: [], trainingSpawn: { pos: new V3(0, 2, 800), yaw: 0 }, trainingTargets: [{ pos: new V3(0, 2, 0), yaw: 0 }] };
  for (const diff of DIFFS) {
    const w = new World(map, { mode: 'training', teamSize: 1, difficulty: diff, local: { name: 'bot', team: 'blue', classId: 'runner' }, seed: 5, autoBhop: true });
    const p = w.local, d = w.players.find((q) => q.isDummy)!;
    w.bots.delete(d.id);
    p.giveWeapon('rifle'); p.slot = 0;
    const b = new BotBrain(w, p, diff); w.bots.set(p.id, b); b.onRoundStart(); b.mode = 'idle';
    b.resetLook(Math.PI * 0.6, 0);
    let shots = 0;
    for (let i = 0; i < 600; i++) {
      d.hp = 1e6;
      d.phys.pos.x = Math.sin(i * 0.02) * 300;
      w.events.length = 0;
      w.step(SIM_DT);
      p.phys.pos.set(0, p.phys.pos.y, 800);
      for (const e of w.events) if (e.t === 'shot' && e.pid === p.id) shots++;
      assert.equal(b.target, null, `${diff}: escolheu um alvo atrás da parede`);
    }
    assert.equal(shots, 0, `${diff}: atirou sem linha de visão`);
    assert.equal(b.engaged, false, `${diff}: começou a mirar sem ver`);
  }
});

test('determinism: same seed, same bot aim and match', () => {
  const a = aimBench('hard', 900, { seeds: [7], seconds: 4 }), b = aimBench('hard', 900, { seeds: [7], seconds: 4 });
  assert.deepEqual(a, b);
  const sim = () => {
    const w = new World(buildClouds(), { mode: 'bots', teamSize: 3, difficulty: 'medium', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 9, autoBhop: true });
    w.bots.set(w.localId, new BotBrain(w, w.local, 'medium')); w.bots.get(w.localId)!.onRoundStart();
    for (let i = 0; i < 2000; i++) w.step(SIM_DT);
    return w.players.map((q) => [q.phys.pos.x.toFixed(3), q.phys.pos.z.toFixed(3), q.hp, q.yaw.toFixed(4)].join(','));
  };
  assert.deepEqual(sim(), sim());
});
