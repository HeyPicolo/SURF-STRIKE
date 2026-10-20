// Surf Skill · mapas de desafio: regras de projeto, percurso de referência em cada segmento,
// checkpoints, emendas das curvas em alta velocidade e o índice de dificuldade crescente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { SIM_DT, PHYSICS } from '../shared/config/physics';
import { skillMapsOf, SKILL_MAPS, formatTicks } from '../shared/config/skill';
import { getSkillMap, SKILL_MAP_BUILDERS } from '../shared/maps/skillMaps';
import { SKILL_REFERENCE } from '../shared/maps/skillReference';
import { RouteDriver, referenceRun } from '../shared/bots/routeDriver';
import { mapMetrics, difficultyIndex } from '../shared/maps/skillMetrics';
import { insideVolume } from '../shared/sim/skill';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { V3 } from '../shared/math/vec3';

const desafios = skillMapsOf('desafio');
const world = (id: string) => new World(getSkillMap(id), { mode: 'skill', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });

test('desafios: numbered in order, tiers per the plan, formats and segment counts', () => {
  const plan: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 5, 9: 5, 10: 6, 11: 6, 12: 6 };
  desafios.forEach((m, i) => {
    assert.equal(m.num, i + 1);
    assert.equal(m.tier, plan[m.num!], `${m.name} tier`);
    const map = getSkillMap(m.id);
    assert.equal(map.skill!.format, m.format);
    assert.equal(map.skill!.segments.length, m.segments.length);
    if (m.format === 'staged') assert.ok(m.segments.length >= 6 && m.segments.length <= 12, `${m.name}: 6–12 stages`);
    else assert.ok(m.segments.length - 1 >= 4, `${m.name}: checkpoints`);
  });
});

test('desafios: every ramp face is surfable (normal Y 0.40–0.69) and half-width ≥ 90', () => {
  for (const m of desafios) {
    const map = getSkillMap(m.id);
    for (const b of map.brushes.filter((x) => x.kind === 'ramp')) {
      // faces de surf (as duas primeiras são as tampas; nas juntas de curva elas ficam inclinadas)
      const faces = b.planes.slice(2, b.faces.length).filter((pl) => pl.n.y > 0.05);
      for (const pl of faces) assert.ok(pl.n.y >= 0.4 && pl.n.y < PHYSICS.walkableNormalY && pl.n.y <= 0.69, `${m.name} ${b.tag} normal ${pl.n.y.toFixed(3)}`);
    }
    for (const s of map.skill!.segments) assert.ok(s.design.minHalfWidth >= 90, `${m.name} ${s.name}: ${s.design.minHalfWidth}`);
  }
});

test('desafios: every segment has its zones, a fall trigger and a solid spawn inside the start zone', () => {
  for (const m of desafios) {
    const map = getSkillMap(m.id);
    const cw = new CollisionWorld(map.brushes), mv = new Mover(cw);
    for (const st of map.skill!.segments) {
      assert.ok(st.startZone && st.endZone && st.fall.length > 0, `${m.name} ${st.name}`);
      const ps = new PhysState(); ps.pos.copy(st.spawn.pos); ps.spawnFloor = st.spawnFloor ?? -1;
      assert.equal(cw.boxSolid(ps.pos, ps.mins, ps.maxs), false, `${m.name} ${st.name}: spawn livre`);
      for (let i = 0; i < 20; i++) mv.move(ps, emptyCmd(), SIM_DT);
      assert.ok(ps.onGround, `${m.name} ${st.name}: spawn no chão`);
      assert.ok(insideVolume(st.startZone, ps.pos, ps.mins, ps.maxs), `${m.name} ${st.name}: spawn na zona de início`);
      assert.ok(st.fallY < st.spawn.pos.y - 300);
    }
  }
});

for (const m of desafios) {
  test(`${m.name}: the reference route completes the whole run (no assist) with the stored time`, () => {
    const w = world(m.id);
    const r = referenceRun(w, { stopOnFall: true });
    assert.ok(r.finished, `${m.name}: caiu no segmento ${(r.fail?.segment ?? -1) + 1} em ${r.fail?.pos.map(Math.round)}`);
    assert.equal(r.falls, 0);
    // a simulação é determinística: o tempo bate com skillReference.ts (npm run skill:metrics)
    assert.equal(r.ticks, SKILL_REFERENCE[m.id].ticks, `${m.name}: ${formatTicks(r.ticks)} — rode npm run skill:metrics`);
  });

  test(`${m.name}: every segment is completable from its own start (stage spawn / checkpoint platform)`, () => {
    const n = getSkillMap(m.id).skill!.segments.length;
    for (let k = 1; k < n; k++) {
      const w = world(m.id), sk = w.skill!, p = w.local;
      p.input.skill.gotoStage = k; w.step(SIM_DT); p.input.skill.gotoStage = null; w.drainEvents();
      assert.equal(sk.stage, k);
      assert.ok(p.phys.pos.distTo(sk.stageDef.spawn.pos) < 5, 'volta ao ponto certo');
      const d = new RouteDriver(sk.stageDef.route);
      let done = false;
      for (let t = 0; t < 9000 && !done; t++) { // trechos da maratona (D12) passam de 60 s saindo parado
        d.drive(p.phys, p.input.cmd, SIM_DT); w.step(SIM_DT);
        assert.ok(!w.drainEvents().some((e) => e.t === 'skillReset'), `${m.name}: caiu a partir do segmento ${k + 1}`);
        done = sk.stage > k || sk.state === 'finished';
      }
      assert.ok(done, `${m.name}: segmento ${k + 1} não terminou`);
    }
  });
}

test('curve seams: crossing every continuous curve at high speed has no ramp bug (no sudden speed loss)', () => {
  for (const id of Object.keys(SKILL_MAP_BUILDERS)) {
    const map = getSkillMap(id);
    const meta = SKILL_MAPS.find((x) => x.id === id)!;
    if (meta.category !== 'desafio') continue;
    const cw = new CollisionWorld(map.brushes), mv = new Mover(cw);
    for (const st of map.skill!.segments) {
      // pontos de rota em sequência sobre segmentos emendados ficam a ≤ 1 segmento de distância;
      // procura trechos de rota com ≥ 3 pontos de surf consecutivos curvando
      const r = st.route;
      for (let i = 0; i + 4 < r.length; i++) {
        const a = r[i], b = r[i + 1], c = r[i + 2];
        if (a.mode !== 'surf' || b.mode !== 'surf' || c.mode !== 'surf') continue;
        const ab = new V3(b.p.x - a.p.x, 0, b.p.z - a.p.z), bc = new V3(c.p.x - b.p.x, 0, c.p.z - b.p.z);
        const turn = Math.acos(Math.max(-1, Math.min(1, ab.clone().normalize().dot(bc.clone().normalize()))));
        if (turn < 0.12 || ab.hLen() > 1500) continue; // só curvas contínuas
        // larga do ponto a, um pouco acima da face, a 2400 u/s na direção da curva
        const ps = new PhysState();
        ps.pos.set(a.p.x, a.p.y + 45, a.p.z);
        const dir = ab.normalize();
        ps.vel.set(dir.x * 2400, -150, dir.z * 2400);
        const cmd = emptyCmd();
        const drv = new RouteDriver(r.slice(i + 1, i + 6));
        let prev = 2400, worst = 0;
        for (let t = 0; t < 120 && !drv.done; t++) {
          drv.drive(ps, cmd, SIM_DT);
          mv.move(ps, cmd, SIM_DT, { speedMul: 1, groundSpeedMul: 1.625, airAccelMul: 1, airCapMul: 1, autoBhop: true, fly: false });
          const hs = Math.hypot(ps.vel.x, ps.vel.z);
          worst = Math.max(worst, (prev - hs) / prev);
          prev = hs;
        }
        assert.ok(worst < 0.04, `${id} ${st.name}: perda de ${(worst * 100).toFixed(1)}% num tick numa emenda`);
        i += 3;
      }
    }
  }
});

test('D1 punishes a lazy start: walking off the first platform falls short of the first ramp', () => {
  for (const walk of [true, false]) {
    const w = world('coral_rush'), sk = w.skill!, p = w.local;
    const d = new RouteDriver(sk.stageDef.route);
    let fell = false;
    for (let t = 0; t < 1500 && d.idx < 3; t++) {
      d.drive(p.phys, p.input.cmd, SIM_DT);
      p.input.cmd.walk = walk && p.phys.onGround;
      w.step(SIM_DT);
      if (w.drainEvents().some((e) => e.t === 'skillReset')) { fell = true; break; }
    }
    assert.equal(fell, walk, walk ? 'caminhando cai' : 'correndo chega');
  }
});

test('difficulty index rises strictly from D1 to the last desafio, and every desafio is above STORM SPIRE', () => {
  const idx = (id: string) => difficultyIndex(mapMetrics(getSkillMap(id)), SKILL_REFERENCE[id]);
  const storm = idx('storm_spire');
  let prev = storm;
  for (const m of desafios) {
    assert.ok(SKILL_REFERENCE[m.id], `${m.id}: sem tempo de referência (npm run skill:metrics)`);
    const v = idx(m.id);
    assert.ok(v > prev, `${m.name}: índice ${v} deveria passar de ${prev}`);
    assert.ok(v > storm);
    prev = v;
  }
});
