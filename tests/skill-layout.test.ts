// Surf Skill · rodada 9a: layout dos stages, nuvens, emendas das curvas e plataformas de checkpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_MAPS, STAGE_LAYOUT } from '../shared/config/skill';
import { getSkillMap } from '../shared/maps/skillMaps';
import { layoutIssues, cloudIssues } from '../shared/maps/skillLayout';
import { probeSeams, SEAM_PROBE } from '../shared/maps/seamProbe';
import { CollisionWorld, newTrace } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { SIM_DT } from '../shared/config/physics';
import { V3, yawFromDir } from '../shared/math/vec3';
import { World } from '../shared/sim/world';

const all = SKILL_MAPS.map((m) => ({ meta: m, map: getSkillMap(m.id) }));

test('staged maps: stage envelopes keep STAGE_CLEARANCE apart, no lava over another stage, no solid brushes crossing', () => {
  for (const { meta, map } of all.filter((x) => x.meta.format === 'staged')) {
    const { issues, minClear } = layoutIssues(map);
    assert.deepEqual(issues.map((i) => `${i.kind} ${i.a + 1}×${i.b + 1} ${i.detail}`), [], meta.name);
    assert.ok(minClear >= STAGE_LAYOUT.clearance, `${meta.name}: folga ${minClear}`);
  }
});

test('staged maps: spawns come from the automatic layout (none written by hand in config) and stay within ±40000', () => {
  for (const { meta, map } of all.filter((x) => x.meta.format === 'staged')) {
    assert.ok(meta.layoutY !== undefined, meta.name);
    assert.ok(meta.segments.every((s) => !s.spawn), `${meta.name}: spawn escrito à mão`);
    for (const st of map.skill!.segments) for (const x of [st.spawn.pos.x, st.spawn.pos.z]) assert.ok(Math.abs(x) <= STAGE_LAYOUT.limit, `${meta.name} ${st.name}`);
  }
});

test('linear maps: no brushes of non-neighbouring segments closer than 400 u', () => {
  for (const { meta, map } of all.filter((x) => x.meta.format === 'linear')) {
    const { issues } = layoutIssues(map);
    assert.deepEqual(issues.map((i) => `${i.a + 1}×${i.b + 1} ${i.detail}`), [], meta.name);
  }
});

test('clouds stay out of the playable corridor (600 u from brushes, zones and the reference route) on all 15 maps', () => {
  for (const { meta, map } of all) assert.deepEqual(cloudIssues(map), [], meta.name);
});

test('curve seams: every chained ramp of every map, 800–3000 u/s, q 0.15–0.85, both strafes — no >5% tick loss, never "on ground" on a ramp', () => {
  for (const { meta, map } of all) {
    const r = probeSeams(map, SEAM_PROBE);
    if (r.worst) assert.ok(r.worst.drop <= 0.05, `${meta.name}: perda de ${(r.worst.drop * 100).toFixed(1)}% (stage ${r.worst.segment + 1}, ${r.worst.speed} u/s, q ${r.worst.q}) em ${r.worst.at}`);
    assert.equal(r.groundRuns.length, 0, `${meta.name}: no chão numa rampa em ${r.groundRuns.slice(0, 3).map((f) => `${f.speed}u/s q${f.q} @${f.at}`).join('; ')}`);
  }
});

test('LANTERN PASS curves are actually probed (the map where the surf used to stop)', () => {
  const r = probeSeams(getSkillMap('lantern_pass'));
  assert.ok(r.runs >= 500, `${r.runs} passadas`);
});

test('checkpoint return platforms: flying through the marker area at any height keeps the speed; respawning there has solid ground', () => {
  for (const { meta, map } of all.filter((x) => x.meta.format === 'linear')) {
    const cw = new CollisionWorld(map.brushes), mv = new Mover(cw), tr = newTrace();
    for (const st of map.skill!.segments.slice(1)) {
      const floor = map.brushes.find((b) => b.id === st.spawnFloor)!;
      assert.ok(floor?.spawnOnly, `${meta.name} ${st.name}: plataforma`);
      const yaw = st.spawn.yaw, d = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
      // passa voando por cima, por dentro e por baixo da plataforma, em várias alturas
      for (let dy = -120; dy <= 140; dy += 20) {
        const ps = new PhysState();
        ps.pos.set(st.spawn.pos.x - d.x * 700, floor.max.y + dy, st.spawn.pos.z - d.z * 700);
        if (cw.boxSolid(ps.pos, ps.mins, ps.maxs)) continue;
        ps.vel.set(d.x * 2200, 0, d.z * 2200);
        const cmd = emptyCmd(); cmd.yaw = yawFromDir(d.x, d.z);
        let hitFloor = false;
        for (let t = 0; t < 40; t++) {
          const end = ps.pos.clone().addScaled(ps.vel, SIM_DT);
          if (cw.traceBox(ps.pos, end, ps.mins, ps.maxs, tr).brush === floor) hitFloor = true;
          mv.move(ps, cmd, SIM_DT, { speedMul: 1, groundSpeedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: false, fly: false });
        }
        assert.equal(hitFloor, false, `${meta.name} ${st.name}: bateu na plataforma a ${dy} u do topo`);
      }
    }
    // reaparecer no checkpoint: chão firme na plataforma e ela some quando o jogador sai da zona
    const w = new World(map, { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
    const p = w.local, sk = w.skill!;
    p.input.skill.gotoStage = 1; w.step(SIM_DT); p.input.skill.gotoStage = null;
    for (let i = 0; i < 50; i++) w.step(SIM_DT);
    assert.ok(p.phys.onGround, `${meta.name}: chão firme no retorno`);
    assert.equal(p.phys.spawnFloor, sk.stageDef.spawnFloor);
    assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5, `${meta.name}: parado na plataforma`);
  }
});
