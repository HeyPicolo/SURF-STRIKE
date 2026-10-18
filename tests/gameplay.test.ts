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

// ---------------------------------------------------------------- v3: queda, teleporte, slide auto, Longbow, taser

test('falling off the map sends the player back to their own base', () => {
  const w = new World(buildClouds(), { mode: 'bots', teamSize: 2, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 5, autoBhop: true });
  w.match.phase = 'active'; w.match.timer = 99;
  for (const p of w.players) p.frozen = false;
  const blue = w.local, red = w.players.find((q) => q.team === 'red')!;
  for (const p of [blue, red]) { p.phys.pos.set(3000, -1100, 0); p.phys.vel.set(500, -900, 0); }
  w.step(SIM_DT);
  assert.ok(blue.phys.pos.z > 4800 && blue.phys.pos.y > 2300, `blue at base ${blue.phys.pos.toArray().map(Math.round)}`);
  assert.ok(red.phys.pos.z < -4800 && red.phys.pos.y > 2300, `red at base ${red.phys.pos.toArray().map(Math.round)}`);
  assert.ok(blue.phys.vel.len() < 20, 'arrives standing still');
});

test('teleporters keep the speed and turn it with the view', () => {
  const w = world(); const p = w.local;
  // blue plateau teleporter is at (0, 0, 1330) and sends to the blue spawn front facing yaw 0
  p.phys.pos.set(0, 2, 1398); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, -600);
  p.input.cmd.yaw = 0; w.step(SIM_DT);
  for (let i = 0; i < 20 && p.phys.pos.y < 2000; i++) w.step(SIM_DT);
  assert.ok(p.phys.pos.y > 2300, 'arrived at the spawn front');
  run(w, 20); // glide off the spawn platform
  assert.ok(Math.hypot(p.phys.vel.x, p.phys.vel.z) > 560, `speed kept: ${Math.hypot(p.phys.vel.x, p.phys.vel.z).toFixed(0)}`);
  // entering sideways (looking −X, moving −X) exits moving forward along the destination yaw (−Z)
  const w2 = world(); const q = w2.local;
  run(w2, 60); // let the trigger cooldown expire
  q.phys.pos.set(74, 2, 1330); q.prevPos.copy(q.phys.pos); q.phys.vel.set(-600, 0, 0);
  q.input.cmd.yaw = Math.PI / 2; w2.step(SIM_DT);
  for (let i = 0; i < 20 && q.phys.pos.y < 2000; i++) w2.step(SIM_DT);
  assert.ok(q.phys.pos.y > 2300, 'teleported');
  assert.ok(q.phys.vel.z < -540 && Math.abs(q.phys.vel.x) < 60, `exit velocity ${q.phys.vel.toArray().map(Math.round)}`);
});

test('crouch above 450 u/s slides without sprint (also right before landing)', () => {
  const w = world(); const p = arena(w);
  // slow: just crouches
  p.phys.vel.set(0, 0, -300);
  p.input.cmd.crouch = true; w.step(SIM_DT); p.input.cmd.crouch = false;
  assert.equal(p.slideTime, 0);
  run(w, 60);
  // fast, no sprint key: slides
  p.phys.pos.set(14200, 2, 760); p.phys.vel.set(0, 0, -650);
  w.step(SIM_DT);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.ok(p.slideTime > 0, 'slide without sprint');
  assert.ok(Math.hypot(p.phys.vel.x, p.phys.vel.z) > 600, 'keeps the speed');
  p.input.cmd.crouch = false; run(w, 120);
  // crouch pressed in the air, just before touching down
  p.phys.pos.set(14200, 22, 760); p.phys.vel.set(0, -250, -700); p.phys.onGround = false;
  p.input.cmd.crouch = true;
  let slid = false;
  run(w, 25, () => { if (p.slideTime > 0) slid = true; });
  assert.ok(slid, 'landing slide');
});

function aimAt(p: Player, target: V3) {
  const e = p.eyePos(new V3());
  p.input.cmd.yaw = Math.atan2(-(target.x - e.x), -(target.z - e.z));
  p.input.cmd.pitch = Math.atan2(target.y - e.y, Math.hypot(target.x - e.x, target.z - e.z));
}

function sniperRange(dist: number, shots: number) {
  const w = world(7); const p = w.local;
  const d = w.players.find((q) => q.isDummy)!;
  w.bots.delete(d.id); d.input.cmd.side = 0;
  d.phys.pos.set(14200, 2, -700); d.prevPos.copy(d.phys.pos); d.phys.vel.set(0, 0, 0);
  p.phys.pos.set(14200, 2, -700 + dist); p.phys.vel.set(0, 0, 0);
  p.giveWeapon('sniper'); p.weapons[0]!.mag = 99;
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  let hits = 0;
  for (let i = 0; i < shots; i++) {
    d.alive = true; d.hp = 1000; d.phys.pos.set(14200, 2, -700);
    aimAt(p, new V3(14200, 42, -700));
    const before = d.hp;
    p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
    if (d.hp < before) hits++;
    run(w, 150);
  }
  return hits;
}

test('Longbow: accurate up close without scope, still inaccurate far away', () => {
  assert.equal(sniperRange(350, 12), 12, 'every close hip shot hits');
  assert.ok(sniperRange(1400, 12) < 12, 'far hip shots still spread');
});

test('Longbow: stays scoped after the shot', () => {
  const w = world(); const p = arena(w);
  p.giveWeapon('sniper');
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  p.input.alt = true; w.step(SIM_DT); p.input.alt = false;
  assert.ok(p.zoomed);
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.equal(p.weapons[0]!.mag, WEAPONS.sniper.mag - 1);
  assert.ok(p.zoomed, 'scope kept');
});

test('taser: starts loaded, one-shot kill in range, nothing out of range, recharges', () => {
  const w = world(); const p = arena(w);
  const d = w.players.find((q) => q.isDummy)!;
  w.bots.delete(d.id);
  d.input.cmd.side = 0; d.input.cmd.forward = 0;
  assert.equal(p.weapons[3]?.id, 'taser');
  assert.equal(p.weapons[3]!.mag, 1);
  // key 3 toggles knife ↔ taser
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null; w.step(SIM_DT);
  assert.equal(p.currentWeapon()!.id, 'taser');
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null; w.step(SIM_DT);
  assert.equal(p.currentWeapon()!.id, 'knife');
  // out of range (260u): the charge is spent, no damage
  d.phys.pos.set(14200, 2, 400); d.prevPos.copy(d.phys.pos); d.phys.vel.set(0, 0, 0);
  p.phys.pos.set(14200, 2, 660); p.phys.vel.set(0, 0, 0);
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  aimAt(p, new V3(14200, 40, 400));
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.equal(d.hp, 100, 'no damage out of range');
  assert.equal(p.weapons[3]!.mag, 0);
  run(w, 50);
  assert.equal(p.currentWeapon()!.id, 'knife', 'back to the knife after the shot');
  // recharge
  run(w, Math.round(WEAPONS.taser.recharge! / SIM_DT) + 5);
  assert.equal(p.weapons[3]!.mag, 1, 'recharged');
  // in range (140u) with armor: lethal
  d.armor = 100; d.phys.pos.set(14200, 2, 400); d.phys.vel.set(0, 0, 0);
  p.phys.pos.set(14200, 2, 540); p.phys.vel.set(0, 0, 0);
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  aimAt(p, new V3(14200, 40, 400));
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.equal(d.alive, false, `one-shot kill (hp ${d.hp}, slot ${p.currentWeapon()!.id}, mag ${p.weapons[3]!.mag}, dummy ${d.phys.pos.toArray().map(Math.round)})`);
});

test('taser is never dropped and never spawns on the map', () => {
  const w = world(); const p = arena(w);
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null; run(w, 40);
  p.input.drop = true; w.step(SIM_DT); p.input.drop = false;
  assert.ok(p.weapons[3], 'cannot drop the taser');
  for (let s = 1; s < 20; s++) assert.ok(!world(s).pickups.some((k) => k.weapon === 'taser'));
});

// ---------------------------------------------------------------- v4: bases sem armas, spread, recarga
import { computeSpread } from '../shared/sim/combat';
import { ACCURACY, RELOAD, reloadDuration } from '../shared/config/weapons';

test('bases never spawn weapons', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = world(seed);
    for (const k of w.pickups) {
      if (Math.abs(k.pos.z) > 4700) assert.notEqual(k.kind, 'weapon', `weapon at a base (seed ${seed})`);
    }
  }
});

test('spread is halved for every weapon', () => {
  assert.equal(ACCURACY.spreadMul, 0.5);
  for (const def of Object.values(WEAPONS)) {
    if (def.melee) continue;
    const s = computeSpread(def, { onGround: false, hSpeed: 0, ducked: false, zoomed: false });
    assert.ok(Math.abs(s - (def.spread + def.airSpread) * 0.5) < 1e-9, def.id);
  }
});

test('reloads are 45% faster', () => {
  assert.equal(RELOAD.speedMul, 1.45);
  const w = world(); const p = arena(w);
  p.giveWeapon('rifle');
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  run(w, 50);
  p.weapons[0]!.mag = 5;
  p.input.reload = true; w.step(SIM_DT); p.input.reload = false;
  const expected = reloadDuration(WEAPONS.rifle);
  assert.ok(Math.abs(expected - WEAPONS.rifle.reloadTime / 1.45) < 1e-9);
  let ticks = 0;
  while (p.weapons[0]!.mag < WEAPONS.rifle.mag && ticks < 500) { w.step(SIM_DT); ticks++; }
  assert.ok(Math.abs(ticks * SIM_DT - expected) < 0.03, `reload took ${(ticks * SIM_DT).toFixed(2)}s (expected ${expected.toFixed(2)}s)`);
});

test('the knife is the butterfly knife', () => {
  assert.equal(WEAPONS.knife.category, 'Faca borboleta');
});
