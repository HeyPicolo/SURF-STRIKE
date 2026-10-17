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
