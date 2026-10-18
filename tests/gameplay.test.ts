// Tactical Sprint, Slide/Slide Cancel, faca e spawns aleatórios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { SIM_DT, PHYSICS, SPRINT } from '../shared/config/physics';
import { WEAPONS } from '../shared/config/weapons';
import { V3 } from '../shared/math/vec3';
import { CollisionWorld } from '../shared/physics/trace';
import { Mover, PhysState, emptyCmd } from '../shared/physics/movement';
import type { Player } from '../shared/sim/player';

function world(seed = 1) {
  return new World(buildClouds(), { mode: 'training', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed, autoBhop: true });
}

/** Put the player on the flat duel-arena floor, facing −Z with room to run. */
function arena(w: World): Player {
  const p = w.local;
  p.phys.pos.set(14200, 2, 760); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, 0);
  p.input.cmd.yaw = 0; p.input.cmd.pitch = 0;
  for (let i = 0; i < 10; i++) w.step(SIM_DT);
  return p;
}

/** Step the world; keeps the runner inside the arena by wrapping z (velocity is untouched). */
function run(w: World, ticks: number, f?: (i: number) => void) {
  for (let i = 0; i < ticks; i++) {
    f?.(i);
    const p = w.local;
    if (p.phys.pos.x > 13000 && p.phys.pos.z < -600) { p.phys.pos.z += 1300; p.prevPos.copy(p.phys.pos); }
    w.step(SIM_DT);
  }
}

const hs = (p: Player) => Math.hypot(p.phys.vel.x, p.phys.vel.z);

test('knife in hand: ground speed +25%', () => {
  const w = world(); const p = arena(w);
  assert.equal(p.currentWeapon()!.id, 'knife');
  p.input.cmd.forward = 1;
  run(w, 120);
  assert.ok(Math.abs(hs(p) - PHYSICS.maxGroundSpeed * 1.25) < 3, `speed ${hs(p)}`);
});

test('knife bonus does not change air acceleration (surf balance)', () => {
  const m = new Mover(new CollisionWorld([]));
  const a = new PhysState(), b = new PhysState();
  for (const st of [a, b]) { st.pos.set(0, 1e5, 0); st.vel.set(0, 0, -500); }
  const cmd = emptyCmd(); cmd.side = 1;
  for (let i = 0; i < 200; i++) {
    cmd.yaw = -i * 0.02;
    m.move(a, cmd, SIM_DT, { speedMul: 1, groundSpeedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: true, fly: false });
    m.move(b, cmd, SIM_DT, { speedMul: 1, groundSpeedMul: 1.625, airAccelMul: 1, airCapMul: 1, autoBhop: true, fly: false });
  }
  assert.ok(a.vel.equals(b.vel, 1e-6));
});

test('tactical sprint: ~30% faster, weapon raised, stamina runs out', () => {
  const w = world(); const p = arena(w);
  p.input.cmd.forward = 1;
  run(w, 100);
  const walk = hs(p);
  p.input.cmd.sprint = true;
  run(w, 100);
  assert.ok(p.sprinting);
  assert.ok(Math.abs(hs(p) / walk - SPRINT.speedMul) < 0.02, `ratio ${hs(p) / walk}`);
  assert.ok(w.weaponBlocked(p), 'cannot attack while sprinting');
  // keep sprinting until the hidden stamina is gone
  let stopAt = -1, lockedAtStop = false;
  run(w, 600, (i) => { if (stopAt < 0 && !p.sprinting) { stopAt = i; lockedAtStop = p.staminaLocked; } });
  const total = (100 + stopAt) * SIM_DT;
  assert.ok(stopAt > 0 && Math.abs(total - SPRINT.stamina) < 0.1, `sprinted ${total.toFixed(2)}s`);
  assert.ok(lockedAtStop, 'exhausted');
  assert.ok(p.sprinting, 'stamina regenerated and sprint resumed while still holding Shift');
});

test('sprint-to-fire delay is much longer than walk-to-fire', () => {
  const w = world(); const p = arena(w);
  p.giveWeapon('rifle');
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  // walking: shoots right away
  p.input.cmd.forward = 1;
  run(w, 30);
  const mag0 = p.weapons[0]!.mag;
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.equal(p.weapons[0]!.mag, mag0 - 1, 'walking fires immediately');
  run(w, 30);
  // sprinting: press fire → sprint ends, the weapon takes SPRINT.sprintToFire to come down
  p.input.cmd.sprint = true;
  run(w, 60);
  assert.ok(p.sprinting);
  const mag1 = p.weapons[0]!.mag;
  let ticks = 0;
  p.input.fire = true;
  while (p.weapons[0]!.mag === mag1 && ticks < 200) { w.step(SIM_DT); ticks++; }
  const delay = ticks * SIM_DT;
  assert.ok(Math.abs(delay - SPRINT.sprintToFire) < 0.05, `sprint-to-fire ${delay.toFixed(2)}s`);
});

test('slide only from sprint, gives a speed burst, ends with a recovery lock', () => {
  const w = world(); const p = arena(w);
  p.input.cmd.forward = 1;
  run(w, 80);
  // crouching while walking does not slide
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.equal(p.slideTime, 0);
  p.input.cmd.crouch = false; run(w, 30);
  p.input.cmd.sprint = true; run(w, 60);
  const before = hs(p);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.ok(p.slideTime > 0, 'slide started');
  assert.ok(hs(p) >= SPRINT.slideStartSpeed - 5 && hs(p) > before, `slide speed ${hs(p)} (was ${before})`);
  assert.ok(p.phys.ducked);
  run(w, 100);
  assert.equal(p.slideTime, 0);
  assert.ok(p.slideRecover > 0 || p.phys.ducked, 'natural end: recovery lock (or still crouched)');
});

test('slide cancel with jump: stands up instantly, no recovery lock, sprint reset', () => {
  const w = world(); const p = arena(w);
  p.input.cmd.forward = 1; p.input.cmd.sprint = true;
  run(w, 250); // burn some stamina
  const staminaBefore = p.stamina;
  assert.ok(staminaBefore < SPRINT.stamina - 1);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.ok(p.slideTime > 0);
  run(w, 20);
  p.input.cmd.jump = true; w.step(SIM_DT); p.input.cmd.jump = false;
  assert.equal(p.slideTime, 0);
  assert.equal(p.slideRecover, 0);
  assert.equal(p.stamina, SPRINT.stamina, 'tactical sprint reset');
  assert.ok(!p.phys.onGround, 'slide-jump keeps going');
  assert.ok(!p.phys.ducked, 'standing even with Ctrl still held');
});

test('slide cancel with crouch: stands back up and can sprint again', () => {
  const w = world(); const p = arena(w);
  p.input.cmd.forward = 1; p.input.cmd.sprint = true;
  run(w, 60);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  p.input.cmd.crouch = false; run(w, 10);
  assert.ok(p.slideTime > 0);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.equal(p.slideTime, 0);
  run(w, 5);
  assert.ok(!p.phys.ducked, 'stood up although crouch is held');
  p.input.cmd.crouch = false; run(w, 40);
  assert.ok(p.sprinting, 'sprinting again right after the cancel');
});

test('knife: light hit in front, heavy backstab kills', () => {
  const w = world(); const p = arena(w);
  const d = w.players.find((q) => q.isDummy)!;
  w.bots.delete(d.id);
  // dummy faces −Z, attacker stands in front facing +Z
  d.phys.pos.set(14200, 2, 0); d.prevPos.copy(d.phys.pos); d.input.cmd = { ...d.input.cmd, yaw: 0, side: 0, forward: 0 };
  p.phys.pos.set(14200, 2, -50); p.input.cmd.yaw = Math.PI; p.input.cmd.pitch = -0.15;
  run(w, 5);
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.ok(Math.abs((100 - d.hp) - WEAPONS.knife.damage) < 1 || 100 - d.hp > 60, `front light hit dealt ${100 - d.hp}`);
  run(w, 120);
  // move behind the dummy (both facing −Z) and stab with the heavy attack
  d.hp = 100;
  p.phys.pos.set(14200, 2, 50); p.input.cmd.yaw = 0;
  run(w, 5);
  p.input.alt = true; w.step(SIM_DT); p.input.alt = false;
  assert.equal(d.alive, false, 'heavy backstab is lethal');
});

test('random pickups: same spots, varied items, mirrored between teams', () => {
  const map = buildClouds();
  const seen = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const w = world(seed);
    // mirrored spots (same group) always get the same item
    const byGroup = new Map<string, string>();
    w.pickups.forEach((k, i) => {
      const g = map.pickups[i].group;
      assert.ok(k.pos.equals(map.pickups[i].pos), 'positions are fixed');
      const item = k.kind + (k.weapon ?? '');
      if (!g) return;
      if (byGroup.has(g)) assert.equal(byGroup.get(g), item, `group ${g} mirrored`);
      byGroup.set(g, item);
    });
    seen.add(w.pickups.map((k) => k.kind + (k.weapon ?? '')).join(','));
  }
  assert.ok(seen.size > 6, `item layout varies between rounds (${seen.size} layouts)`);
});

test('CLOUDS has no jump pads', () => {
  assert.equal(buildClouds().triggers.filter((t) => t.kind === 'jumppad').length, 0);
});

test('round start: everyone has only the knife', () => {
  const w = new World(buildClouds(), { mode: 'bots', teamSize: 3, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 3, autoBhop: true });
  for (const p of w.players) {
    assert.equal(p.currentWeapon()!.id, 'knife');
    assert.equal(p.weapons[0], null); assert.equal(p.weapons[1], null);
  }
});
