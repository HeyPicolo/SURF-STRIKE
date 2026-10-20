// Surf Skill, rodada 8: tiers, versões dos mapas, formato linear (checkpoints) e fantasma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { SIM_DT } from '../shared/config/physics';
import { SKILL, GHOST, SKILL_MAPS, SKILL_TIERS, TIER_COLORS, TIER_LABELS, TIER_STYLE, skillMapsOf } from '../shared/config/skill';
import { getSkillMap, SKILL_MAP_BUILDERS } from '../shared/maps/skillMaps';
import { SKILL_MAP_VERSIONS } from '../shared/maps/skillVersions';
import { RouteDriver } from '../shared/bots/routeDriver';
import { mapVersion } from '../shared/sim/records';
import {
  GhostRecorder, GhostTrack, encodeTrack, decodeTrack, sampleTrack, sliceTrack, nearestTick, updateGhostSet, emptyGhostSet,
  MemoryGhostStore, GF_SNAP, GhostFrame,
} from '../shared/sim/ghost';
import { V3 } from '../shared/math/vec3';
import type { SimEvent } from '../shared/sim/world';

function skillWorld(id: string) {
  return new World(getSkillMap(id), { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
}
/** Corrida completa pelo percurso de referência (segue embalado pelos portais dos mapas linear). */
function referenceRun(w: World, maxTicks = 200000) {
  const sk = w.skill!, p = w.local;
  let drv = new RouteDriver(sk.stageDef.route), stage = 0;
  const ev: SimEvent[] = [];
  for (let t = 0; t < maxTicks && sk.state !== 'finished'; t++) {
    if (sk.stage !== stage) { drv = new RouteDriver(sk.stageDef.route); if (sk.stage === stage + 1) drv.idx = sk.stageDef.flowFrom; stage = sk.stage; }
    drv.drive(p.phys, p.input.cmd, SIM_DT);
    w.step(SIM_DT);
    const e = w.drainEvents();
    ev.push(...e);
    if (e.some((x) => x.t === 'skillReset')) drv = new RouteDriver(sk.stageDef.route);
  }
  p.input.cmd.forward = 0; p.input.cmd.side = 0; p.input.cmd.jump = false;
  return ev;
}

// ---------------------------------------------------------------- organização
test('tiers 1 to 6 with colors and labels; Treino × Desafio; progressive unlock off by default', () => {
  assert.deepEqual(SKILL_TIERS, [1, 2, 3, 4, 5, 6]);
  for (const t of SKILL_TIERS) { assert.ok(TIER_COLORS[t] && TIER_LABELS[t] && TIER_STYLE[t]); }
  assert.equal(TIER_STYLE[6].bg.toLowerCase(), '#0b0b0f');
  assert.equal(TIER_STYLE[6].border, TIER_COLORS[6]);
  assert.deepEqual(skillMapsOf('treino').map((m) => m.id), ['sky_steps', 'drift_canyon', 'storm_spire']);
  assert.equal(SKILL.progressiveUnlock, false);
  assert.ok(SKILL_MAPS.find((m) => m.id === 'teste_curto')!.hidden, 'test map stays out of the menu');
});

test('map versions: static file is up to date and the training maps keep their round-9b geometry', () => {
  for (const [id, build] of Object.entries(SKILL_MAP_BUILDERS)) {
    assert.equal(SKILL_MAP_VERSIONS[id], mapVersion(build()), `${id}: rode npm run skill:versions`);
  }
  // geometria dos mapas de treino fixada na rodada 9b (layout automático, chegada estendida para quem
  // chega embalado): mudar o kit sem querer não pode zerar recordes. Rodada 7: 0f22f531 / 430069a2 / 57badaf3.
  assert.equal(SKILL_MAP_VERSIONS.sky_steps, '3019fd2f');
  assert.equal(SKILL_MAP_VERSIONS.drift_canyon, '9c7ff963');
  assert.equal(SKILL_MAP_VERSIONS.storm_spire, '13d99fa7');
});

test('all skill maps stay within ±40000 (float precision)', () => {
  for (const id of Object.keys(SKILL_MAP_BUILDERS)) {
    const m = getSkillMap(id);
    for (const b of m.brushes) {
      if (b.noCollide) continue; // a lava visual pode passar um pouco
      for (const c of [b.min, b.max]) for (const x of [c.x, c.y, c.z]) assert.ok(Math.abs(x) <= 40000, `${id} ${b.tag} ${x}`);
    }
  }
});

// ---------------------------------------------------------------- formato linear
test('linear map: checkpoints split without stopping, and the whole run is recorded as segments', () => {
  const w = skillWorld('teste_curto'), sk = w.skill!;
  assert.equal(sk.course.format, 'linear');
  assert.equal(sk.stageCount, 2);
  let posBefore: V3 | null = null, jump = 0;
  const p = w.local;
  // mede o deslocamento no tick do split (sem teleporte)
  const sk0 = sk.stage;
  const ev = referenceRun(w);
  assert.equal(sk.state, 'finished');
  const splits = ev.filter((e) => e.t === 'skillSplit');
  assert.equal(splits.length, 2);
  assert.ok(!ev.some((e) => e.t === 'skillReset'), 'no falls');
  assert.equal(sk.stageTimes.reduce((a, b) => a + b, 0), sk.ticks);
  void posBefore; void jump; void sk0; void p;
});

test('linear map: passing a checkpoint keeps your speed (no teleport)', () => {
  const w = skillWorld('teste_curto'), sk = w.skill!, p = w.local;
  let drv = new RouteDriver(sk.stageDef.route);
  for (let t = 0; t < 5000 && (sk.stage as number) === 0; t++) {
    const before = p.phys.pos.clone(), v = Math.hypot(p.phys.vel.x, p.phys.vel.z);
    drv.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT); w.drainEvents();
    if ((sk.stage as number) === 1) {
      assert.ok(p.phys.pos.distTo(before) < 40, 'continuous movement across the checkpoint');
      assert.ok(Math.hypot(p.phys.vel.x, p.phys.vel.z) > v * 0.9 && v > 600, `kept speed ${v}`);
    }
  }
  assert.equal(sk.stage, 1);
  void drv;
});

test('linear map: falling returns to the last checkpoint touched, stopped; Backspace too; the clock keeps running', () => {
  const w = skillWorld('teste_curto'), sk = w.skill!, p = w.local;
  const drv = new RouteDriver(sk.stageDef.route);
  for (let t = 0; t < 5000 && sk.stage === 0; t++) { drv.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT); w.drainEvents(); }
  assert.equal(sk.stage, 1);
  const t0 = sk.ticks;
  p.phys.pos.y = sk.stageDef.fallY - 10;
  w.step(SIM_DT);
  const ev = w.drainEvents();
  assert.ok(ev.some((e) => e.t === 'skillReset' && e.reason === 'fall' && e.stage === 1));
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5, 'on the checkpoint platform');
  assert.equal(Math.hypot(p.phys.vel.x, p.phys.vel.z), 0);
  assert.equal(sk.state, 'running'); assert.equal(sk.ticks, t0 + 1);
  // de lá, o trecho é completável (a plataforma devolve o jogador na rampa)
  const d2 = new RouteDriver(sk.stageDef.route);
  for (let t = 0; t < 5000 && (sk.state as string) !== 'finished'; t++) {
    d2.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT);
    assert.ok(!w.drainEvents().some((e) => e.t === 'skillReset'), 'completes from the checkpoint');
  }
  assert.equal(sk.state, 'finished');
  // Backspace num mapa linear = voltar ao último checkpoint
  p.input.skill.restartMap = true; w.step(SIM_DT); p.input.skill.restartMap = false;
  p.input.skill.gotoStage = 1; w.step(SIM_DT); p.input.skill.gotoStage = null;
  p.phys.pos.x += 300; p.input.skill.restartStage = true; w.step(SIM_DT); p.input.skill.restartStage = false;
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5);
});

// ---------------------------------------------------------------- fantasma
function syntheticTrack(seconds: number): GhostTrack {
  const rec = new GhostRecorder();
  const ticks = seconds * 100;
  for (let i = 0; i < ticks; i++) {
    const t = i / 100;
    // trajeto de surf plausível: rápido, curvando e descendo, com teleportes a cada 40 s (stages)
    const seg = Math.floor(t / 40);
    if (i > 0 && i % 4000 === 0) rec.markSegment(seg, i);
    const p = new V3(Math.sin(t * 0.3) * 9000 + seg * 5000, 3000 - (t % 40) * 60, Math.cos(t * 0.2) * 12000);
    rec.push(p, t * 0.7, Math.sin(t) * 0.5, (i % 4000 === 0 && i > 0 ? GF_SNAP : 0) | (i % 7 === 0 ? 1 : 0), seg);
  }
  return rec.toTrack();
}

test('ghost: encode → decode returns the same positions within the quantization tolerance', () => {
  const tr = syntheticTrack(30);
  const back = decodeTrack(encodeTrack(tr));
  assert.equal(back.count, tr.count);
  assert.equal(back.totalTicks, tr.totalTicks);
  assert.deepEqual(back.segStart, tr.segStart);
  let maxErr = 0, maxAng = 0;
  for (let i = 0; i < tr.count; i++) {
    for (let k = 0; k < 3; k++) maxErr = Math.max(maxErr, Math.abs(back.pos[i * 3 + k] - tr.pos[i * 3 + k]));
    const dy = Math.abs(Math.atan2(Math.sin(back.ang[i * 2] - tr.ang[i * 2]), Math.cos(back.ang[i * 2] - tr.ang[i * 2])));
    maxAng = Math.max(maxAng, dy, Math.abs(back.ang[i * 2 + 1] - tr.ang[i * 2 + 1]));
    assert.equal(back.flags[i], tr.flags[i]); assert.equal(back.seg[i], tr.seg[i]);
  }
  assert.ok(maxErr <= GHOST.posQuant / 2 + 0.01, `position error ${maxErr}`);
  assert.ok(maxAng < 0.001, `angle error ${maxAng}`);
});

test('ghost: a 5-minute run fits under the configured size limit', () => {
  const bytes = encodeTrack(syntheticTrack(300)).byteLength;
  assert.ok(bytes < GHOST.maxBytes5min, `${bytes} bytes`);
});

test('ghost: a real run is recorded tick by tick and plays back where the player was', () => {
  const w = skillWorld('teste_curto'), sk = w.skill!, p = w.local;
  const seen: { tick: number; pos: V3 }[] = [];
  let drv = new RouteDriver(sk.stageDef.route), stage = 0;
  let fin: SimEvent | undefined;
  for (let t = 0; t < 5000 && !fin; t++) {
    if (sk.stage !== stage) { drv = new RouteDriver(sk.stageDef.route); drv.idx = sk.stageDef.flowFrom; stage = sk.stage; }
    drv.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT);
    if (sk.state === 'running' && sk.ticks % 37 === 0) seen.push({ tick: sk.ticks, pos: p.phys.pos.clone() });
    fin = w.drainEvents().find((e) => e.t === 'skillFinish');
  }
  assert.ok(fin && fin.t === 'skillFinish' && fin.ghost && !fin.practice);
  const tr = decodeTrack(encodeTrack(fin.ghost!));
  assert.equal(tr.totalTicks, fin.total);
  assert.equal(tr.segStart[1], fin.splits[0], 'segment 2 starts at the first split');
  const f: GhostFrame = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, seg: 0, ended: false };
  for (const s of seen) {
    sampleTrack(tr, s.tick, f);
    // entre amostras de 50 Hz a interpolação linear erra poucas unidades mesmo a ~1500 u/s
    assert.ok(Math.hypot(f.x - s.pos.x, f.y - s.pos.y, f.z - s.pos.z) < 12, `tick ${s.tick}: ${Math.hypot(f.x - s.pos.x, f.y - s.pos.y, f.z - s.pos.z).toFixed(1)}`);
  }
  // diferença ao vivo: o tick mais próximo de uma posição gravada é o próprio tick
  const mid = seen[Math.floor(seen.length / 2)];
  assert.ok(Math.abs(nearestTick(tr, mid.pos, null) - mid.tick) <= 2);
});

test('ghost: practice runs are not recorded', () => {
  const w = skillWorld('teste_curto'), sk = w.skill!, p = w.local;
  p.input.cmd.forward = 1;
  for (let i = 0; i < 300 && sk.state === 'zone'; i++) w.step(SIM_DT);
  assert.ok(sk.recorder, 'valid run records');
  p.input.skill.saveLoc = true; w.step(SIM_DT); p.input.skill.saveLoc = false;
  assert.equal(sk.recorder, null, 'saveloc stops the recording');
  const ev = referenceRunFrom(w);
  const fin = ev.find((e) => e.t === 'skillFinish');
  assert.ok(fin && fin.t === 'skillFinish' && fin.practice && fin.ghost === null);
  // começar de um checkpoint (menu) também não grava
  p.input.skill.restartMap = true; w.step(SIM_DT); p.input.skill.restartMap = false;
  p.input.skill.gotoStage = 1; w.step(SIM_DT); p.input.skill.gotoStage = null;
  p.input.cmd.forward = 1;
  for (let i = 0; i < 300 && sk.state === 'zone'; i++) w.step(SIM_DT);
  assert.equal(sk.state, 'running'); assert.equal(sk.recorder, null);
});
function referenceRunFrom(w: World) {
  const sk = w.skill!, p = w.local, ev: SimEvent[] = [];
  let drv = new RouteDriver(sk.stageDef.route); drv.idx = 1;
  let stage = sk.stage;
  for (let t = 0; t < 5000 && sk.state !== 'finished'; t++) {
    if (sk.stage !== stage) { drv = new RouteDriver(sk.stageDef.route); drv.idx = sk.stageDef.flowFrom; stage = sk.stage; }
    drv.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT); ev.push(...w.drainEvents());
  }
  return ev;
}

test('ghost: a new PB replaces the run ghost; gold segments replace segment ghosts; the store round-trips', async () => {
  const a = syntheticTrack(20), b = syntheticTrack(18);
  let set = emptyGhostSet(1);
  set = updateGhostSet(set, a, 2000, [2000], true, [true]);
  assert.equal(set.pb, a); assert.equal(set.pbTicks, 2000);
  // mais lenta e sem recorde: nada muda
  const slower = updateGhostSet(set, b, 2100, [2100], false, [false]);
  assert.equal(slower.pb, a); assert.equal(slower.segTicks[0], 2000);
  // PB novo
  const faster = updateGhostSet(set, b, 1800, [1800], true, [true]);
  assert.equal(faster.pb, b); assert.equal(faster.pbTicks, 1800);
  const store = new MemoryGhostStore();
  await store.save('m', 'v', faster);
  const back = await store.load('m', 'v', 1);
  assert.equal(back.pbTicks, 1800);
  assert.equal(back.pb!.count, b.count);
  assert.equal((await store.load('m', 'outra-versao', 1)).pb, null, 'same hashed key as the records');
});

test('ghost: per-segment sync uses the best segment clip, starting at that segment', () => {
  const tr = syntheticTrack(100); // 3 segmentos (0–40 s, 40–80 s, 80–100 s)
  assert.deepEqual(tr.segStart, [0, 4000, 8000]);
  const clip = sliceTrack(tr, 1)!;
  assert.equal(clip.totalTicks, 4000);
  const f: GhostFrame = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, seg: 0, ended: false };
  const g: GhostFrame = { ...f };
  sampleTrack(clip, 0, f); sampleTrack(tr, 4000, g);
  assert.ok(Math.hypot(f.x - g.x, f.y - g.y, f.z - g.z) < 1e-3, 'clip time 0 = start of segment 2');
  sampleTrack(clip, 1234, f); sampleTrack(tr, 5234, g);
  assert.ok(Math.hypot(f.x - g.x, f.y - g.y, f.z - g.z) < 1e-3);
  assert.equal(f.seg, 1);
  // através de um teleporte não interpola
  sampleTrack(tr, 3998.4, f);
  assert.ok(Math.abs(f.y - (3000 - 39.98 * 60)) < 10, 'no blend across the teleport');
  // os melhores segmentos podem vir de corridas diferentes
  let set = emptyGhostSet(3);
  set = updateGhostSet(set, tr, 10000, [4000, 4000, 2000], true, [true, true, true]);
  const other = syntheticTrack(100);
  set = updateGhostSet(set, other, 11000, [3900, 4100, 3000], false, [true, false, false]);
  assert.equal(set.segTicks[0], 3900); assert.equal(set.segTicks[1], 4000); assert.equal(set.pbTicks, 10000);
});
