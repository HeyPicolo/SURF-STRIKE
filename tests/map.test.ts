import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClouds } from '../shared/maps/clouds';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import { SIM_DT } from '../shared/config/physics';
import { steerToward } from '../shared/bots/steer';
import { World } from '../shared/sim/world';
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

import { ITEMS } from '../shared/config/weapons';

const edgeOf = (dir: number) => (dir > 0 ? CENTER_RAMP.start[0] : CENTER_RAMP.end[0]);

function surfCenter(fromX: number, toX: number, side: number) {
  const m = new Mover(world);
  const dir = Math.sign(toX - fromX);
  const st = new PhysState();
  // entra pela ponta da rampa já embalado (como quem chega do jump pad e pula do flanco para a face)
  st.pos.set(edgeOf(dir) + dir * 30, 1075, side * 60);
  st.vel.set(dir * 800, 0, 0);
  const r = CENTER_RAMP;
  const fs = dir > 0 ? [0.2, 0.5, 0.8, 0.98] : [0.8, 0.5, 0.2, 0.02];
  const pts: NavPoint[] = [
    ...fs.map((f) => ({ p: facePoint(r, f, side, 0.4), mode: 'surf' as const, r: 250 })),
    { p: new V3(toX, 1000, side * 160), mode: 'air', r: 350 },
  ];
  const cmd = emptyCmd();
  let idx = 0, surfed = 0, ok = false;
  for (let t = 0; t < 20 / SIM_DT; t++) {
    const res = steerToward(st, pts[idx], idx ? pts[idx - 1].p : null, cmd, SIM_DT, 30);
    m.move(st, cmd, SIM_DT);
    if (st.surfing) surfed++;
    if (res.reached && ++idx >= pts.length) { ok = true; break; }
    if (st.pos.y < 500) break;
  }
  return { ok, idx, surfed, st };
}

test('center ramp: level, higher, lower profile; surfable both ways between Perch and flank', () => {
  assert.equal(map.brushes.filter((b) => b.tag === 'bridge' || b.kind === 'glass').length, 0, 'no bridge');
  const ramp = map.brushes.find((b) => b.tag === 'centerRamp')!;
  assert.ok(ramp, 'center ramp exists');
  assert.equal(CENTER_RAMP.start[1], CENTER_RAMP.end[1], 'straight (no height difference)');
  assert.ok(CENTER_RAMP.start[1] > 1000 && CENTER_RAMP.h <= 300, 'higher, lower profile');
  assert.ok(Math.atan2(CENTER_RAMP.h, CENTER_RAMP.hw) > 46 * Math.PI / 180, 'steep enough to surf');
  for (const side of [1, -1]) {
    for (const [a, b] of [[-1750, 1800], [1800, -1750]]) {
      const res = surfCenter(a, b, side);
      assert.ok(res.ok, `side ${side} ${a}→${b}: stopped at ${res.idx}, pos ${res.st.pos.toArray().map(Math.round)}`);
      assert.ok(res.surfed > 60, `actually surfed (${res.surfed} ticks)`);
      assert.ok(res.st.pos.y > 950, 'landed on the other flank');
    }
  }
});

test('flanks are at the same height as the center ramp', () => {
  const perch = map.brushes.find((b) => b.tag === 'perch')!, flank = map.brushes.find((b) => b.tag === 'flank')!;
  assert.equal(perch.max.y, flank.max.y);
  const ramp = map.brushes.find((b) => b.tag === 'centerRamp')!;
  assert.ok(ramp.min.y < flank.max.y && ramp.max.y > flank.max.y, 'flank top lies on the ramp faces');
});

test('players can walk under the center ramp', () => {
  for (const x of [-900, -240, 0, 300, 800, 1100]) {
    const t = world.traceBox(new V3(x, 2, 0), new V3(x, 140, 0), new V3(-16, 0, -16), new V3(16, 72, 16));
    assert.ok(t.fraction === 1 || t.endPos.y > 60, `head room at x=${x}`);
  }
});

test('4 corner jump pads launch to the flanks without losing speed', () => {
  const pads = map.triggers.filter((t) => t.kind === 'jumppad');
  assert.equal(pads.length, 4);
  const w = new World(map, { mode: 'training', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
  const p = w.local;
  for (const pad of pads) {
    const cx = (pad.min.x + pad.max.x) / 2, cz = (pad.min.z + pad.max.z) / 2;
    // standing still on the pad
    p.phys.pos.set(cx, 2, cz); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, 0); p.triggerCd = 0;
    p.input.cmd = emptyCmd();
    let landed = false;
    for (let i = 0; i < 400; i++) {
      w.step(SIM_DT);
      if (i > 20 && p.phys.onGround) { landed = true; break; }
    }
    const onFlank = Math.abs(p.phys.pos.x) > 1450 && Math.abs(p.phys.pos.x) < 2500 && p.phys.pos.y > 990;
    assert.ok(landed && onFlank, `pad (${cx}, ${cz}) → landed at ${p.phys.pos.toArray().map(Math.round)}`);
    // running into it fast: keeps the speed
    p.phys.pos.set(cx - Math.sign(cx) * 70, 2, cz); p.prevPos.copy(p.phys.pos); p.phys.vel.set(Math.sign(cx) * 800, 0, 0); p.triggerCd = 0;
    let launchedH = 0;
    for (let i = 0; i < 30; i++) { w.step(SIM_DT); if (p.phys.vel.y > 1000) { launchedH = Math.hypot(p.phys.vel.x, p.phys.vel.z); break; } }
    assert.ok(launchedH >= 790, `kept speed through the pad (${launchedH.toFixed(0)})`);
  }
});

test('everyone spawns with 150 HP and full armor', () => {
  const w = new World(map, { mode: 'bots', teamSize: 2, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 2, autoBhop: true });
  for (const p of w.players) { assert.equal(p.hp, 150); assert.equal(p.armor, ITEMS.spawnArmor); }
  assert.equal(ITEMS.maxHp, 150);
});
