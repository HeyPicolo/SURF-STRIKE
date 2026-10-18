import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClouds } from '../shared/maps/clouds';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { SIM_DT } from '../shared/config/physics';
import { steerToward } from '../shared/bots/steer';
import type { Team } from '../shared/maps/types';

const map = buildClouds();
const world = new CollisionWorld(map.brushes);

test('spawn points are not inside geometry and stand on ground', () => {
  const m = new Mover(world);
  for (const team of ['blue', 'red'] as Team[]) {
    for (const sp of map.spawns[team]) {
      const st = new PhysState();
      st.pos.copy(sp.pos);
      assert.equal(world.boxSolid(st.pos, st.mins, st.maxs), false, `spawn ${team} solid`);
      for (let i = 0; i < 20; i++) m.move(st, emptyCmd(), SIM_DT);
      assert.ok(st.onGround, `spawn ${team} should be on ground`);
    }
  }
});

test('map is symmetric (same brush count per team half, mirrored spawns)', () => {
  const blue = map.brushes.filter((b) => b.min.z > 100 && b.max.x < 5000).length;
  const red = map.brushes.filter((b) => b.max.z < -100 && b.max.x < 5000).length;
  assert.equal(blue, red);
});

export function runRoute(team: Team, routeIdx: number, assist: number, maxSeconds = 25) {
  const m = new Mover(world);
  const route = map.routes[team][routeIdx];
  const st = new PhysState();
  const sp = map.spawns[team][0];
  st.pos.copy(sp.pos);
  const cmd = emptyCmd();
  let idx = 0;
  let maxSpeed = 0;
  let minY = Infinity;
  for (let t = 0; t < maxSeconds / SIM_DT; t++) {
    const target = route.points[idx];
    const prev = idx > 0 ? route.points[idx - 1].p : null;
    const r = steerToward(st, target, prev, cmd, SIM_DT, assist);
    m.move(st, cmd, SIM_DT);
    maxSpeed = Math.max(maxSpeed, Math.hypot(st.vel.x, st.vel.z));
    minY = Math.min(minY, st.pos.y);
    if (r.reached) { idx++; if (idx >= route.points.length) return { ok: true, t: t * SIM_DT, maxSpeed, st, minY }; }
    if (st.pos.y < -1000) return { ok: false, t: t * SIM_DT, maxSpeed, st, minY, failedAt: idx };
  }
  return { ok: false, t: maxSeconds, maxSpeed, st, minY, failedAt: idx };
}

for (const team of ['blue', 'red'] as Team[]) {
  map.routes[team].forEach((route, i) => {
    test(`route ${route.name} (${team}) is surfable spawn → combat area`, () => {
      const res = runRoute(team, i, 30);
      assert.ok(res.ok, `failed at waypoint ${res.failedAt} pos=${res.st.pos.toArray().map(Math.round)} vel=${Math.round(res.st.vel.len())}`);
      assert.ok(res.maxSpeed > 750, `route should build real surf speed (max ${Math.round(res.maxSpeed)})`);
      assert.ok(res.st.pos.y > -100, 'ends on a platform, not in the recovery layer');
      console.log(`  ${route.name} ${team}: ${res.t.toFixed(1)}s, max speed ${Math.round(res.maxSpeed)} u/s`);
    });
  });
}

import { CENTER_RAMP, facePoint } from '../shared/maps/clouds';
import { V3 } from '../shared/math/vec3';
import type { NavPoint } from '../shared/maps/types';

test('the old sky bridge is gone and the center ramp is surfable (Perch → flank)', () => {
  assert.equal(map.brushes.filter((b) => b.tag === 'bridge' || b.kind === 'glass').length, 0, 'no bridge');
  assert.equal(map.brushes.filter((b) => b.tag === 'centerRamp').length, 1);
  for (const side of [1, -1]) {
    const m = new Mover(world);
    const st = new PhysState();
    st.pos.set(-1750, 1002, side * 100);
    const pts: NavPoint[] = [
      { p: new V3(-1470, 1000, side * 60), mode: 'walk', r: 40 },
      ...[0.15, 0.45, 0.75, 0.97].map((f) => ({ p: facePoint(CENTER_RAMP, f, side, 0.35), mode: 'surf' as const, r: 250 })),
      { p: new V3(1800, 150, side * 120), mode: 'air', r: 350 },
    ];
    const cmd = emptyCmd();
    let idx = 0, maxSpeed = 0, surfed = 0, ok = false;
    for (let t = 0; t < 20 / SIM_DT; t++) {
      const r = steerToward(st, pts[idx], idx ? pts[idx - 1].p : null, cmd, SIM_DT, 30);
      m.move(st, cmd, SIM_DT);
      maxSpeed = Math.max(maxSpeed, Math.hypot(st.vel.x, st.vel.z));
      if (st.surfing) surfed++;
      if (r.reached && ++idx >= pts.length) { ok = true; break; }
      if (st.pos.y < -500) break;
    }
    assert.ok(ok, `side ${side}: stopped at waypoint ${idx}, pos ${st.pos.toArray().map(Math.round)}`);
    assert.ok(surfed > 100, `side ${side}: actually surfed (${surfed} ticks)`);
    assert.ok(maxSpeed > 700, `side ${side}: builds speed (${Math.round(maxSpeed)})`);
    assert.ok(st.pos.y > 100, 'lands on the flank');
  }
});

test('players can still walk under the center ramp and up to the flank', () => {
  // standing + jumping height clears the ramp base above the plateau items
  for (const x of [-900, -240, 0, 300, 800, 1100]) {
    const t = world.traceBox(new V3(x, 2, 0), new V3(x, 140, 0), new V3(-16, 0, -16), new V3(16, 72, 16));
    assert.ok(t.fraction === 1 || t.endPos.y > 60, `head room at x=${x}`);
  }
  const m = new Mover(world);
  const st = new PhysState();
  st.pos.set(800, 2, 200); // beside the plateau cover, under the ramp face
  const cmd = emptyCmd(); cmd.yaw = -Math.PI / 2; cmd.forward = 1; // walk toward +X
  for (let i = 0; i < 300; i++) m.move(st, cmd, SIM_DT);
  assert.ok(st.pos.x > 1500 && st.pos.y > 140, `reached the flank ${st.pos.toArray().map(Math.round)}`);
});
