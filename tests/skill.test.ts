// Surf Skill: cronômetro, zonas, splits, quedas, reinícios, prática, recordes e os 3 mapas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { SIM_DT } from '../shared/config/physics';
import { SKILL, SKILL_MAPS, formatTicks, formatDiff } from '../shared/config/skill';
import { getSkillMap } from '../shared/maps/skillMaps';
import { RouteDriver } from '../shared/bots/routeDriver';
import { insideVolume, SkillPb } from '../shared/sim/skill';
import {
  emptyRecords, applyFinish, addAttempt, sumOfBest, splitDiff, mapVersion, MemoryRecordStore, sanitizeRecords, recordKey,
} from '../shared/sim/records';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { PHYSICS } from '../shared/config/physics';
import type { SimEvent } from '../shared/sim/world';
import type { MapDef } from '../shared/maps/types';

function skillWorld(id = 'sky_steps', pb: SkillPb | null = null) {
  return new World(getSkillMap(id), { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true, skillPb: pb });
}
function steps(w: World, n: number, each?: () => void) { const ev: SimEvent[] = []; for (let i = 0; i < n; i++) { each?.(); w.step(SIM_DT); ev.push(...w.drainEvents()); } return ev; }
/** Anda para frente até sair da zona de início. */
function leaveZone(w: World) {
  const p = w.local; p.input.cmd.forward = 1;
  for (let i = 0; i < 300 && w.skill!.state === 'zone'; i++) w.step(SIM_DT);
  p.input.cmd.forward = 0;
}
/** Dirige o jogador pelo percurso de referência do stage atual até o stage mudar (ou terminar). */
function driveStage(w: World, maxTicks = 3000) {
  const sk = w.skill!, p = w.local, start = sk.stage, d = new RouteDriver(sk.stageDef.route);
  const ev: SimEvent[] = [];
  for (let t = 0; t < maxTicks; t++) {
    d.drive(p.phys, p.input.cmd, SIM_DT);
    w.step(SIM_DT);
    ev.push(...w.drainEvents());
    if (sk.stage !== start || sk.state === 'finished' || ev.some((e) => e.t === 'skillReset')) break;
  }
  p.input.cmd.forward = 0; p.input.cmd.side = 0; p.input.cmd.jump = false;
  return ev;
}

// ---------------------------------------------------------------- regras do modo
test('skill mode: alone, knife only (with its speed bonus), no bots/items/abilities, no damage', () => {
  const w = skillWorld();
  assert.equal(w.players.length, 1);
  assert.equal(w.pickups.length, 0);
  const p = w.local;
  assert.deepEqual(p.weapons.filter(Boolean).map((x) => x!.id), ['knife']);
  assert.ok(p.noAbilities);
  const hp = p.hp;
  w.applyDamage(p, null, 500, true, false, 'teste');
  assert.equal(p.hp, hp);
  // faca + sprint automático no chão
  p.input.cmd.forward = 1;
  steps(w, 40);
  assert.ok(Math.abs(Math.hypot(p.phys.vel.x, p.phys.vel.z) - PHYSICS.maxGroundSpeed * 1.25 * 1.3) < 3);
});

test('timer is measured in ticks and starts only when leaving the start zone', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  assert.equal(sk.state, 'zone');
  // parado / andando de lado dentro da zona: nada conta
  p.input.cmd.side = 1; steps(w, 30); p.input.cmd.side = -1; steps(w, 30); p.input.cmd.side = 0;
  assert.equal(sk.state, 'zone'); assert.equal(sk.ticks, 0);
  assert.ok(insideVolume(sk.stageDef.startZone, p.phys.pos, p.phys.mins, p.phys.maxs));
  leaveZone(w);
  assert.equal(sk.state, 'running');
  assert.equal(sk.ticks, 0, 'starts at zero on the exit tick');
  steps(w, 137);
  assert.equal(sk.ticks, 137, 'one tick per simulation step (100 Hz)');
  assert.equal(formatTicks(137), '00:01.37');
  assert.equal(formatTicks(6123 + 100 * 60), '02:01.23');
  assert.equal(formatDiff(-42), '−00.42');
  assert.equal(formatDiff(250), '+02.50');
});

test('start zone: prespeed cap and no jumping (no bhop for prespeed)', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  steps(w, 10);
  p.phys.vel.set(0, 0, -900);
  steps(w, 1);
  assert.ok(Math.hypot(p.phys.vel.x, p.phys.vel.z) <= SKILL.prespeedCap + 1e-6, 'capped inside the zone');
  p.phys.vel.set(0, 0, 0);
  steps(w, 10);
  p.input.cmd.jump = true;
  steps(w, 20);
  p.input.cmd.jump = false;
  assert.ok(p.phys.onGround && Math.abs(p.phys.vel.y) < 1e-6, 'jump blocked');
  assert.equal(sk.state, 'zone');
  // fora da zona o pulo volta a funcionar
  leaveZone(w);
  p.input.cmd.forward = 1; steps(w, 5); p.input.cmd.forward = 0;
  p.input.cmd.jump = true; const ev = steps(w, 3); p.input.cmd.jump = false;
  assert.ok(ev.some((e) => e.t === 'jump'));
});

test('falling sends you back to the current stage start, stopped, and the clock keeps running', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  leaveZone(w);
  driveStage(w); // stage 1 → 2
  assert.equal(sk.stage, 1);
  const t0 = sk.ticks;
  p.phys.pos.set(sk.stageDef.spawn.pos.x, sk.stageDef.fallY + 40, -3000);
  const ev = steps(w, 2);
  const reset = ev.find((e) => e.t === 'skillReset');
  assert.ok(reset && reset.t === 'skillReset' && reset.reason === 'fall' && reset.stage === 1);
  assert.equal(sk.stage, 1);
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5);
  assert.equal(Math.hypot(p.phys.vel.x, p.phys.vel.z), 0);
  assert.equal(sk.state, 'running');
  assert.equal(sk.ticks, t0 + 2, 'falling does not reset the map timer');
  // o trigger de lava também conta (sem passar do fallY)
  const lava = sk.stageDef.fall[0];
  p.phys.pos.set(sk.stageDef.spawn.pos.x, lava.max.y - 10, -3000);
  steps(w, 1);
  assert.equal(sk.falls, 2);
});

test('restart stage keeps the timer; restart map goes to stage 1 and zeroes it', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  leaveZone(w);
  driveStage(w);
  steps(w, 50);
  const t0 = sk.ticks;
  p.input.skill.restartStage = true; steps(w, 1); p.input.skill.restartStage = false;
  assert.equal(sk.stage, 1); assert.equal(sk.state, 'running'); assert.ok(sk.ticks > t0);
  p.input.skill.restartMap = true; steps(w, 1); p.input.skill.restartMap = false;
  assert.equal(sk.stage, 0); assert.equal(sk.state, 'zone'); assert.equal(sk.ticks, 0);
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5);
});

test('splits: stage time and difference against the personal best', () => {
  const pb: SkillPb = { ticks: 4000, splits: [600, 1400, 2200, 3100, 4000], stages: [600, 800, 800, 900, 900] };
  const w = skillWorld('sky_steps', pb), sk = w.skill!;
  leaveZone(w);
  const ev = driveStage(w);
  const sp = ev.find((e) => e.t === 'skillSplit');
  assert.ok(sp && sp.t === 'skillSplit');
  assert.equal(sp.stage, 0);
  assert.equal(sp.total, sk.splits[0]);
  assert.equal(sp.stageTicks, sp.total);
  assert.equal(sp.diffTotal, sp.total - 600);
  assert.equal(sp.diffStage, sp.stageTicks - 600);
  assert.equal(sk.stage, 1, 'end zone leads into the next stage start');
  assert.ok(insideVolume(sk.stageDef.startZone, w.local.phys.pos, w.local.phys.mins, w.local.phys.maxs));
  // segundo split: tempo do stage = total − split anterior
  const ev2 = driveStage(w);
  const sp2 = ev2.find((e) => e.t === 'skillSplit');
  assert.ok(sp2 && sp2.t === 'skillSplit');
  assert.equal(sp2.stageTicks, sp2.total - sp.total);
  assert.equal(sp2.diffTotal, sp2.total - 1400);
  // sem PB: diferenças nulas
  assert.deepEqual(splitDiff(null, 0, 100, 100), { diffTotal: null, diffStage: null });
});

test('saveloc / loadloc mark the run as practice (no records)', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  leaveZone(w);
  p.input.cmd.forward = 1; steps(w, 20); p.input.cmd.forward = 0;
  p.input.skill.saveLoc = true; const ev = steps(w, 1); p.input.skill.saveLoc = false;
  assert.ok(ev.some((e) => e.t === 'skillSave'));
  assert.ok(sk.practice);
  const saved = sk.saved!.pos.clone();
  steps(w, 60);
  p.input.skill.loadLoc = true; steps(w, 1); p.input.skill.loadLoc = false;
  assert.ok(p.phys.pos.distTo(saved) < 40);
  // a corrida termina marcada como prática
  let fin: SimEvent | undefined;
  for (let i = 0; i < 5 && !fin; i++) fin = driveStage(w).find((e) => e.t === 'skillFinish');
  assert.ok(fin && fin.t === 'skillFinish' && fin.practice && fin.diff === null);
  // reiniciar o mapa limpa a marcação
  p.input.skill.restartMap = true; steps(w, 1); p.input.skill.restartMap = false;
  assert.equal(sk.practice, false);
});

test('go to stage: refused during a timed run, allowed outside it (as practice)', () => {
  const w = skillWorld(), sk = w.skill!, p = w.local;
  leaveZone(w);
  p.input.skill.gotoStage = 3; const ev = steps(w, 1); p.input.skill.gotoStage = null;
  assert.ok(ev.some((e) => e.t === 'skillDenied'));
  assert.equal(sk.stage, 0);
  p.input.skill.restartMap = true; steps(w, 1); p.input.skill.restartMap = false;
  p.input.skill.gotoStage = 3; steps(w, 1); p.input.skill.gotoStage = null;
  assert.equal(sk.stage, 3); assert.ok(sk.practice); assert.equal(sk.state, 'zone');
  leaveZone(w);
  assert.equal(sk.state, 'running');
});

// ---------------------------------------------------------------- recordes
test('records: PB, best segments, Sum of Best, attempts and top 10 ranking', () => {
  let rec = emptyRecords('m', 'v1', 3);
  assert.equal(sumOfBest(rec), null);
  rec = addAttempt(addAttempt(rec));
  assert.equal(rec.attempts, 2);
  const r1 = applyFinish(rec, { ticks: 3000, splits: [1000, 2000, 3000], stages: [1000, 1000, 1000], name: 'ana', date: '2026-10-01' });
  assert.ok(r1.newPb); assert.equal(r1.rank, 1); assert.equal(r1.diff, null);
  assert.deepEqual(r1.goldStages, [true, true, true]);
  // mais lenta no total, mas com um stage melhor: não é PB, melhora o Sum of Best
  const r2 = applyFinish(r1.rec, { ticks: 3200, splits: [900, 2100, 3200], stages: [900, 1200, 1100], name: 'bia', date: '2026-10-02' });
  assert.ok(!r2.newPb); assert.equal(r2.diff, 200); assert.equal(r2.rank, 2);
  assert.deepEqual(r2.goldStages, [true, false, false]);
  assert.equal(r2.rec.pb!.ticks, 3000);
  assert.deepEqual(r2.rec.bestStages, [900, 1000, 1000]);
  assert.equal(sumOfBest(r2.rec), 2900);
  assert.equal(r2.rec.completions, 2);
  // PB novo
  const r3 = applyFinish(r2.rec, { ticks: 2950, splits: [950, 1950, 2950], stages: [950, 1000, 1000], name: 'ana', date: '2026-10-03' });
  assert.ok(r3.newPb); assert.equal(r3.diff, -50); assert.deepEqual(r3.rec.pb!.splits, [950, 1950, 2950]);
  // ranking limitado ao top N e ordenado
  let rr = r3.rec;
  for (let i = 0; i < 15; i++) rr = applyFinish(rr, { ticks: 4000 + i, splits: [1, 2, 4000 + i], stages: [1, 1, 3998 + i], name: `p${i}`, date: '2026-10-04' }).rec;
  assert.equal(rr.top.length, SKILL.topN);
  assert.deepEqual(rr.top.slice(0, 3).map((e) => e.ticks), [2950, 3000, 3200]);
  const slow = applyFinish(rr, { ticks: 99999, splits: [1, 2, 99999], stages: [1, 1, 99997], name: 'z', date: '2026-10-05' });
  assert.equal(slow.rank, null, 'too slow for the top 10');
});

test('records are keyed by the map geometry version: changing the map invalidates them', () => {
  const m = getSkillMap('sky_steps');
  const v1 = mapVersion(m);
  assert.equal(v1, mapVersion(getSkillMap('sky_steps')), 'stable');
  assert.notEqual(v1, mapVersion(getSkillMap('drift_canyon')));
  // uma rampa deslocada muda a versão
  const moved: MapDef = { ...m, brushes: m.brushes.map((b, i) => (i === 3 ? { ...b, verts: b.verts.map((v) => v.clone().add({ x: 0, y: 5, z: 0 } as never)) } : b)) };
  const v2 = mapVersion(moved);
  assert.notEqual(v1, v2);
  const store = new MemoryRecordStore();
  const r = applyFinish(emptyRecords('sky_steps', v1, 5), { ticks: 5000, splits: [1, 2, 3, 4, 5000], stages: [1, 1, 1, 1, 4996], name: 'a', date: 'd' }).rec;
  store.save(r);
  assert.equal(store.load('sky_steps', v1, 5).pb!.ticks, 5000);
  assert.equal(store.load('sky_steps', v2, 5).pb, null, 'new geometry starts clean');
  assert.notEqual(recordKey('sky_steps', v1), recordKey('sky_steps', v2));
  // dados guardados com outra versão (ou corrompidos) viram recordes vazios
  assert.equal(sanitizeRecords(r, 'sky_steps', v2, 5).pb, null);
  assert.equal(sanitizeRecords('lixo', 'sky_steps', v1, 5).attempts, 0);
  assert.equal(sanitizeRecords(JSON.parse(JSON.stringify(r)), 'sky_steps', v1, 5).pb!.ticks, 5000);
});

// ---------------------------------------------------------------- mapas
const maps = SKILL_MAPS.map((meta) => ({ meta, map: getSkillMap(meta.id) }));

test('the 3 maps match the config metadata (name, tier, 5 stages with names and spawns)', () => {
  assert.deepEqual(maps.map((m) => m.meta.tier), [1, 2, 3]);
  for (const { meta, map } of maps) {
    assert.equal(map.name, meta.name);
    assert.equal(map.skill!.tier, meta.tier);
    assert.equal(map.skill!.stages.length, 5);
    map.skill!.stages.forEach((st, i) => {
      assert.equal(st.name, meta.stages[i].name);
      assert.deepEqual(st.spawn.pos.toArray(), meta.stages[i].spawn);
    });
  }
});

test('every ramp is surfable (normal Y < 0.7) and every stage has start, end, fall and a solid spawn', () => {
  for (const { map } of maps) {
    const cw = new CollisionWorld(map.brushes), m = new Mover(cw);
    const ramps = map.brushes.filter((b) => b.kind === 'ramp');
    assert.ok(ramps.length >= 5, map.name);
    for (const b of ramps) {
      const sloped = b.planes.slice(0, b.faces.length).filter((pl) => pl.n.y > 0.05);
      assert.ok(sloped.length > 0, `${map.name} ${b.tag}`);
      for (const pl of sloped) assert.ok(pl.n.y < PHYSICS.walkableNormalY, `${map.name} ${b.tag} normal ${pl.n.y.toFixed(3)}`);
    }
    for (const st of map.skill!.stages) {
      assert.ok(st.startZone && st.endZone && st.fall.length > 0, `${map.name} stage ${st.index + 1}`);
      const ps = new PhysState(); ps.pos.copy(st.spawn.pos);
      assert.equal(cw.boxSolid(ps.pos, ps.mins, ps.maxs), false);
      for (let i = 0; i < 20; i++) m.move(ps, emptyCmd(), SIM_DT);
      assert.ok(ps.onGround, `${map.name} stage ${st.index + 1} spawn on ground`);
      assert.ok(insideVolume(st.startZone, ps.pos, ps.mins, ps.maxs), 'spawn inside the start zone');
      assert.ok(!insideVolume(st.endZone, ps.pos, ps.mins, ps.maxs));
      assert.ok(st.fall[0].max.y < st.endZone.min.y && st.fallY < st.fall[0].max.y);
    }
  }
});

for (const { meta } of maps) {
  test(`${meta.name}: every stage is completable with the reference route (pure physics, no assist)`, () => {
    const w = skillWorld(meta.id), sk = w.skill!;
    leaveZone(w);
    let peak = 0;
    for (let s = 0; s < 5; s++) {
      assert.equal(sk.stage, s);
      const d = new RouteDriver(sk.stageDef.route), p = w.local;
      let ev: SimEvent[] = [];
      for (let t = 0; t < 3000 && sk.stage === s && sk.state !== 'finished'; t++) {
        d.drive(p.phys, p.input.cmd, SIM_DT);
        w.step(SIM_DT);
        peak = Math.max(peak, Math.hypot(p.phys.vel.x, p.phys.vel.z));
        ev = w.drainEvents();
        assert.ok(!ev.some((e) => e.t === 'skillReset'), `${meta.name} stage ${s + 1}: fell at ${p.phys.pos.toArray().map(Math.round)}`);
      }
    }
    assert.equal(sk.state, 'finished');
    assert.equal(sk.splits.length, 5);
    assert.equal(sk.stageTimes.reduce((a, b) => a + b, 0), sk.ticks, 'stage times add up to the total');
    (meta as { peak?: number }).peak = peak;
    console.log(`  ${meta.name}: ${formatTicks(sk.ticks)} · pico ${Math.round(peak)} u/s`);
  });
}

test('tier 3 demands more speed and precision than tier 1', () => {
  const d = maps.map(({ map }) => {
    const ss = map.skill!.stages.map((s) => s.design);
    return {
      minHw: Math.min(...ss.map((x) => x.minHalfWidth)),
      needSpeed: Math.max(...ss.map((x) => x.minSpeed)),
      maxGap: Math.max(...ss.map((x) => x.maxGap)),
      ramps: ss.reduce((a, x) => a + x.ramps, 0),
      bhop: ss.some((x) => x.bhop),
    };
  });
  const [t1, t2, t3] = d;
  assert.ok(t1.minHw >= 200, 'tier 1: wide ramps (half-width ≥ 200)');
  assert.ok(t1.minHw > t2.minHw && t2.minHw > t3.minHw, `half-widths ${t1.minHw} > ${t2.minHw} > ${t3.minHw}`);
  assert.ok(t3.needSpeed > t1.needSpeed * 1.8, `minimum speed for the hardest gap: T1 ${t1.needSpeed} vs T3 ${t3.needSpeed}`);
  assert.ok(t3.maxGap > t1.maxGap * 3, `longest gap: T1 ${t1.maxGap} vs T3 ${t3.maxGap}`);
  assert.ok(t3.ramps > t1.ramps && t2.ramps > t1.ramps, 'more transitions');
  assert.ok(t2.bhop && !t1.bhop, 'tier 2 has mandatory bhop exits');
  const peaks = SKILL_MAPS.map((m) => (m as { peak?: number }).peak ?? 0);
  if (peaks[0] && peaks[2]) assert.ok(peaks[2] > peaks[0], `peak speed of the reference run: T1 ${Math.round(peaks[0])} vs T3 ${Math.round(peaks[2])}`);
  // tier 3 tem rampas no limite (normal perto de 0.7) e rampas bem íngremes
  const t3d = maps[2].map.skill!.stages.map((s) => s.design);
  assert.ok(Math.max(...t3d.map((x) => x.maxNormalY)) > 0.67 && Math.min(...t3d.map((x) => x.minNormalY)) < 0.5);
});
