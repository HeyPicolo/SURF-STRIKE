// Surf Skill · rodada 9b: sem prespeed cap, velocidade mantida entre stages, versão das regras na chave
// dos recordes e "Próximo mapa".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { SIM_DT, PHYSICS } from '../shared/config/physics';
import { SKILL, SKILL_MAPS, skillMapOrder, nextSkillMap } from '../shared/config/skill';
import { getSkillMap } from '../shared/maps/skillMaps';
import { RouteDriver } from '../shared/bots/routeDriver';
import { recordVersion, recordKey } from '../shared/sim/records';
import { insideVolume } from '../shared/sim/skill';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { V3 } from '../shared/math/vec3';

const world = (id: string) => new World(getSkillMap(id), { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
const hs = (v: V3) => Math.hypot(v.x, v.z);

test('no prespeed cap in the start zones (the code stays: 420 turns it back on); jumping still allowed', () => {
  assert.equal(SKILL.prespeedCap, Infinity);
  assert.equal(SKILL.blockJumpInStart, false);
  const w = world('sky_steps'), p = w.local;
  for (let i = 0; i < 10; i++) w.step(SIM_DT);
  p.phys.vel.set(0, 0, -900); w.step(SIM_DT);
  assert.ok(hs(p.phys.vel) > 850, `sem limitador: ${hs(p.phys.vel)}`);
  const old = SKILL.prespeedCap;
  try {
    (SKILL as { prespeedCap: number }).prespeedCap = 420;
    const w2 = world('sky_steps'), p2 = w2.local;
    for (let i = 0; i < 10; i++) w2.step(SIM_DT);
    p2.phys.vel.set(0, 0, -900); w2.step(SIM_DT);
    assert.ok(hs(p2.phys.vel) <= 420 + 1e-6, 'religado, o cap volta a valer');
  } finally { (SKILL as { prespeedCap: number }).prespeedCap = old; }
});

test('staged: the end zone carries the speed into the next stage, turned to its first ramp, vertical limited, 0.45 s without friction', () => {
  const w = world('sky_steps'), sk = w.skill!, p = w.local;
  p.input.cmd.forward = 1; for (let i = 0; i < 300 && sk.state === 'zone'; i++) w.step(SIM_DT); p.input.cmd.forward = 0;
  const d = new RouteDriver(sk.stageDef.route);
  let before = 0;
  for (let t = 0; t < 3000 && sk.stage === 0; t++) { before = hs(p.phys.vel); d.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT); }
  assert.equal(sk.stage, 1);
  const c = sk.stageDef.carry!;
  const after = hs(p.phys.vel);
  assert.ok(Math.abs(after - before) / before < 0.05, `velocidade mantida: ${before.toFixed(0)} → ${after.toFixed(0)}`);
  const hd = new V3(c.dir.x, 0, c.dir.z).normalize();
  assert.ok((p.phys.vel.x * hd.x + p.phys.vel.z * hd.z) / after > 0.99, 'girada para a direção da primeira rampa');
  assert.ok(p.phys.vel.y <= 0 && p.phys.vel.y >= -(SKILL.carryMaxDown + 80) - 30, `vertical limitada: ${p.phys.vel.y}`);
  assert.ok(p.teleportGlide > 0 && p.teleportGlide <= PHYSICS.teleportGlide, 'sem atrito por um instante');
  assert.ok(p.phys.pos.distTo(c.pos) < 1200, 'no ar, logo acima do começo da primeira rampa');
  assert.equal(p.phys.onGround, false);
});

test('falling and restarting the stage still bring you back stopped to the stage start', () => {
  const w = world('sky_steps'), sk = w.skill!, p = w.local;
  p.input.cmd.forward = 1; for (let i = 0; i < 300 && sk.state === 'zone'; i++) w.step(SIM_DT); p.input.cmd.forward = 0;
  p.phys.vel.set(0, 0, -2000);
  p.input.skill.restartStage = true; w.step(SIM_DT); p.input.skill.restartStage = false;
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5); assert.equal(hs(p.phys.vel), 0);
  p.phys.pos.set(sk.stageDef.spawn.pos.x, sk.stageDef.fallY - 10, sk.stageDef.spawn.pos.z); p.phys.vel.set(1500, 0, 0); w.step(SIM_DT);
  assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5); assert.equal(hs(p.phys.vel), 0);
});

// entrada embalada: em todo stage (exceto o primeiro) de todo mapa staged, a 600–3500 u/s, o jogador pousa
// na primeira rampa (não passa por cima), não bate de frente em parede/teto e não fica no chão
for (const m of SKILL_MAPS.filter((x) => x.format === 'staged' && !x.hidden)) {
  test(`${m.name}: arriving fast lands on the first ramp of every stage (no overshoot, no wall/ceiling)`, () => {
    const map = getSkillMap(m.id);
    const cw = new CollisionWorld(map.brushes), mv = new Mover(cw);
    for (const st of map.skill!.segments.slice(1)) {
      for (const v of [600, 1500, 2500, 3500]) {
        const c = st.carry!;
        const ps = new PhysState();
        const hl = Math.hypot(c.dir.x, c.dir.z), slope = c.dir.y / hl;
        ps.pos.copy(c.pos); ps.pos.y += c.rise * Math.max(0, 1 - v / SKILL.carryRiseUntil);
        assert.equal(cw.boxSolid(ps.pos, ps.mins, ps.maxs), false, `${m.name} ${st.name}: entrada livre`);
        ps.vel.set((c.dir.x / hl) * v, Math.max(-SKILL.carryMaxDown, Math.min(0, slope * v)) - 80, (c.dir.z / hl) * v);
        const cmd = emptyCmd();
        let touched = -1, worst = 0, prev = v;
        const start = ps.pos.clone();
        // só enquanto está sobre a primeira rampa (depois dela, sem ninguém dirigindo, vale o resto do stage)
        for (let t = 0; t < 400; t++) {
          mv.move(ps, cmd, SIM_DT, { speedMul: 1, groundSpeedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: false, fly: false, noFriction: t < 45 });
          const along = ((ps.pos.x - start.x) * c.dir.x + (ps.pos.z - start.z) * c.dir.z) / hl;
          if (along > c.len) break;
          const h = hs(ps.vel);
          if (touched < 0 && ps.surfing) touched = t;
          worst = Math.max(worst, (prev - h) / prev);
          prev = h;
        }
        assert.ok(touched >= 0, `${m.name} ${st.name} a ${v} u/s: passou por cima da primeira rampa`);
        assert.ok(worst < 0.25, `${m.name} ${st.name} a ${v} u/s: bateu (perda de ${(worst * 100).toFixed(0)}% num tick)`);
      }
    }
  });

  test(`${m.name}: arriving fast at the end of a stage does not fly over the end platform`, () => {
    const map = getSkillMap(m.id);
    const cw = new CollisionWorld(map.brushes), mv = new Mover(cw);
    for (const st of map.skill!.segments) {
      const r = st.route, end = r[r.length - 1].p, from = r[r.length - 2].p;
      const ps = new PhysState(); ps.pos.copy(from); ps.pos.y += 40;
      if (cw.boxSolid(ps.pos, ps.mins, ps.maxs)) continue;
      const d = new V3(end.x - from.x, 0, end.z - from.z).normalize();
      ps.vel.set(d.x * 3500, 0, d.z * 3500);
      let inside = false;
      for (let t = 0; t < 300 && !inside; t++) {
        mv.move(ps, emptyCmd(), SIM_DT, { speedMul: 1, groundSpeedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: false, fly: false });
        inside = insideVolume(st.endZone, ps.pos, ps.mins, ps.maxs);
      }
      assert.ok(inside, `${m.name} ${st.name}: a 3500 u/s passa por cima da chegada`);
    }
  });
}

test('records and ghosts are keyed by map geometry AND rules version (old PBs with the cap do not mix)', () => {
  assert.equal(SKILL.rulesVersion, 2);
  assert.equal(recordVersion('abcd1234'), 'abcd1234.r2');
  assert.notEqual(recordKey('sky_steps', recordVersion('abcd1234')), recordKey('sky_steps', recordVersion('abcd1234', 1)));
});

test('next map: SKY STEPS → DRIFT CANYON → STORM SPIRE → D1 … D12; none after ZENITH; test map left out; progressive unlock respected', () => {
  const order = skillMapOrder();
  assert.deepEqual(order.slice(0, 4), ['sky_steps', 'drift_canyon', 'storm_spire', 'coral_rush']);
  assert.equal(order.length, 15);
  assert.equal(order[order.length - 1], 'zenith');
  assert.ok(!order.includes('teste_curto'));
  for (let i = 0; i + 1 < order.length; i++) assert.equal(nextSkillMap(order[i], () => true), order[i + 1]);
  assert.equal(nextSkillMap('zenith', () => true), null);
  assert.equal(nextSkillMap('teste_curto', () => true), 'sky_steps', 'do mapa de teste vai para o primeiro');
  const old = SKILL.progressiveUnlock;
  try {
    (SKILL as { progressiveUnlock: boolean }).progressiveUnlock = true;
    assert.equal(nextSkillMap('coral_rush', () => false), null, 'D2 bloqueado sem concluir o D1');
    assert.equal(nextSkillMap('coral_rush', () => true), 'velvet_dunes');
    assert.equal(nextSkillMap('storm_spire', () => false), 'coral_rush', 'o D1 é sempre liberado');
  } finally { (SKILL as { progressiveUnlock: boolean }).progressiveUnlock = old; }
});
