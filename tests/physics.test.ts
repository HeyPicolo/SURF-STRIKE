import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V3, DEG } from '../shared/math/vec3';
import { boxBrush, rampBrush, boxAt } from '../shared/physics/brush';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd, clipVelocity, airAccelerate, hSpeed } from '../shared/physics/movement';
import { PHYSICS, SIM_DT } from '../shared/config/physics';

const C = { color: 0x888888 };

function flatWorld() {
  return new CollisionWorld([boxBrush(new V3(-5000, -100, -5000), new V3(5000, 0, 5000), C)]);
}

test('clipVelocity removes only the component into the plane', () => {
  const n = new V3(0, Math.cos(60 * DEG), Math.sin(60 * DEG)).normalize();
  const v = new V3(500, -300, -200);
  const out = clipVelocity(v, n, new V3());
  assert.ok(Math.abs(out.dot(n)) < 0.02);
  // tangential part preserved
  assert.equal(Math.round(out.x), 500);
});

test('ground acceleration reaches max ground speed and friction stops the player', () => {
  const w = flatWorld();
  const m = new Mover(w);
  const st = new PhysState();
  st.pos.set(0, 0, 0);
  const cmd = emptyCmd();
  cmd.forward = 1;
  for (let i = 0; i < 200; i++) m.move(st, cmd, SIM_DT);
  assert.ok(st.onGround, 'should be on ground');
  assert.ok(Math.abs(hSpeed(st) - PHYSICS.maxGroundSpeed) < 2, `speed ${hSpeed(st)}`);
  cmd.forward = 0;
  for (let i = 0; i < 100; i++) m.move(st, cmd, SIM_DT);
  assert.ok(hSpeed(st) < 1);
});

test('air strafing (strafe + turn) gains speed beyond the ground cap', () => {
  const w = new CollisionWorld([]);
  const m = new Mover(w);
  const st = new PhysState();
  st.pos.set(0, 100000, 0);
  st.vel.set(0, 0, -300); // moving toward -Z (yaw 0)
  const cmd = emptyCmd();
  cmd.side = 1; // hold D
  let yaw = 0;
  const start = hSpeed(st);
  for (let i = 0; i < 300; i++) {
    yaw -= 1.2 * DEG; // turn right with the mouse while holding D
    cmd.yaw = yaw;
    m.move(st, cmd, SIM_DT);
  }
  assert.ok(hSpeed(st) > start + 150, `air strafe should gain speed: ${start} -> ${hSpeed(st)}`);
});

test('pure W in the air does not accelerate (needs strafing)', () => {
  const w = new CollisionWorld([]);
  const m = new Mover(w);
  const st = new PhysState();
  st.pos.set(0, 100000, 0);
  st.vel.set(0, 0, -400);
  const cmd = emptyCmd(); cmd.forward = 1;
  for (let i = 0; i < 200; i++) m.move(st, cmd, SIM_DT);
  assert.ok(hSpeed(st) <= 401);
});

test('airAccelerate wish cap: projection onto wishdir never exceeds the cap from accel alone', () => {
  const vel = new V3(0, 0, 0);
  airAccelerate(vel, new V3(1, 0, 0), 250, 150, 30, SIM_DT);
  assert.ok(vel.x <= 30 + 1e-9);
});

/** Ridge ramp descending along -Z with 60° slopes. */
function rampWorld() {
  const ramp1 = rampBrush(new V3(0, 2000, 0), new V3(0, 1200, -3000), 400, 700, 'both', C);
  const ramp2 = rampBrush(new V3(0, 1000, -3300), new V3(0, 200, -6300), 400, 700, 'both', C);
  return { world: new CollisionWorld([ramp1, ramp2]), ramp1, ramp2 };
}

function surfRun(world: CollisionWorld, ticks: number, side: 1 | -1, record?: (st: PhysState, i: number) => void) {
  const m = new Mover(world);
  const st = new PhysState();
  // drop onto the right (+X) face of the ridge, a bit below the apex
  st.pos.set(side * 160, 2000 - 260, -100);
  st.vel.set(0, 0, -200);
  const cmd = emptyCmd();
  cmd.yaw = 0; // facing -Z, along the ramp
  cmd.side = -side; // press into the ramp (A when on the +X face)
  for (let i = 0; i < ticks; i++) {
    m.move(st, cmd, SIM_DT);
    record?.(st, i);
  }
  return st;
}

test('surfing a ramp: stays on the ramp face, never treated as ground, gains speed from gravity', () => {
  const { world } = rampWorld();
  let surfTicks = 0, groundTicks = 0;
  const st = surfRun(world, 300, 1, (s) => { if (s.surfing) surfTicks++; if (s.onGround) groundTicks++; });
  assert.equal(groundTicks, 0, 'ramp must not count as ground');
  assert.ok(surfTicks > 200, `should be surfing most of the time (got ${surfTicks})`);
  assert.ok(hSpeed(st) > 600, `should gain speed sliding down (speed ${hSpeed(st)})`);
  assert.ok(st.pos.x > 0, 'still on the +X face');
});

test('surf ramp transition conserves momentum (ramp1 → ramp2)', () => {
  const { world } = rampWorld();
  let speedAtEnd1 = 0, minSpeedAfter = Infinity, reached2 = false;
  surfRun(world, 700, 1, (s) => {
    if (s.pos.z > -3000) speedAtEnd1 = s.vel.len();
    else if (s.pos.z < -3400) {
      minSpeedAfter = Math.min(minSpeedAfter, s.vel.len());
      if (s.surfing) reached2 = true;
    }
  });
  assert.ok(reached2, 'should reach and surf the second ramp');
  assert.ok(minSpeedAfter > speedAtEnd1 * 0.9, `momentum kept: ${speedAtEnd1.toFixed(0)} -> min ${minSpeedAfter.toFixed(0)}`);
});

test('no tunnelling through a thin wall at max velocity', () => {
  const wall = boxAt(0, 100, -500, 1000, 400, 8, C);
  const floor = boxBrush(new V3(-5000, -100, -5000), new V3(5000, 0, 5000), C);
  const world = new CollisionWorld([wall, floor]);
  const m = new Mover(world);
  const st = new PhysState();
  st.pos.set(0, 50, 0);
  st.vel.set(0, 0, -PHYSICS.maxVelocity);
  const cmd = emptyCmd();
  for (let i = 0; i < 50; i++) m.move(st, cmd, SIM_DT);
  assert.ok(st.pos.z > -500, `should be stopped by the wall, z=${st.pos.z}`);
});

test('bunny hop keeps horizontal speed with auto-bhop (no ground friction on landing)', () => {
  const m = new Mover(flatWorld());
  const st = new PhysState();
  st.pos.set(0, 0, 0);
  st.vel.set(0, 0, -600);
  const cmd = emptyCmd(); cmd.jump = true;
  let jumps = 0;
  for (let i = 0; i < 400; i++) { const ev = m.move(st, cmd, SIM_DT); if (ev.jumped) jumps++; }
  assert.ok(jumps >= 4, `should jump repeatedly (${jumps})`);
  assert.ok(hSpeed(st) > 590, `speed conserved: ${hSpeed(st)}`);
});

test('without auto-bhop, holding jump only jumps once', () => {
  const m = new Mover(flatWorld());
  const st = new PhysState();
  const cmd = emptyCmd(); cmd.jump = true;
  let jumps = 0;
  for (let i = 0; i < 300; i++) { const ev = m.move(st, cmd, SIM_DT, { speedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: false, fly: false }); if (ev.jumped) jumps++; }
  assert.equal(jumps, 1);
});

test('steps up small stairs and stays on slopes', () => {
  const floor = boxBrush(new V3(-5000, -100, -5000), new V3(5000, 0, 5000), C);
  const step = boxBrush(new V3(-200, 0, -400), new V3(200, 16, -200), C);
  const m = new Mover(new CollisionWorld([floor, step]));
  const st = new PhysState();
  const cmd = emptyCmd(); cmd.forward = 1;
  for (let i = 0; i < 260; i++) m.move(st, cmd, SIM_DT);
  assert.ok(st.pos.z < -400, `walked over the step, z=${st.pos.z}`);
});

test('player wedged into geometry gets un-stuck', () => {
  const floor = boxBrush(new V3(-500, -100, -500), new V3(500, 0, 500), C);
  const m = new Mover(new CollisionWorld([floor]));
  const st = new PhysState();
  st.pos.set(0, -1, 0);
  st.lastSafe.set(0, 10, 0);
  for (let i = 0; i < 10; i++) m.move(st, emptyCmd(), SIM_DT);
  assert.ok(st.pos.y >= 0);
});
