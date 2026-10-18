import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDamage, furyMultiplier, weaponHitDamage, computeSpread } from '../shared/sim/combat';
import { WEAPONS } from '../shared/config/weapons';
import { MatchMachine } from '../shared/sim/match';
import { World } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { SIM_DT } from '../shared/config/physics';
import { CLASSES } from '../shared/config/classes';
import { tryUseAbility } from '../shared/sim/abilities';
import { V3 } from '../shared/math/vec3';
import { BotBrain } from '../shared/bots/brain';

const base = { head: false, explosion: false, attackerFury: false, attackerHp: 100, victimTired: false, victimArmor: 0, victimShield: 0 };

test('damage: plain body shot', () => {
  assert.equal(computeDamage({ ...base, base: 30 }).hpDamage, 30);
});

test('damage: armor absorbs half on body, nothing on head', () => {
  assert.equal(computeDamage({ ...base, base: 40, victimArmor: 50 }).hpDamage, 20);
  assert.equal(computeDamage({ ...base, base: 40, victimArmor: 50, head: true }).hpDamage, 40);
});

test('damage: shield absorbs fully first', () => {
  const r = computeDamage({ ...base, base: 70, victimShield: 50 });
  assert.equal(r.shieldDamage, 50);
  assert.equal(r.hpDamage, 20);
});

test('damage: berserker fury scales with missing HP', () => {
  assert.equal(furyMultiplier(100), 1);
  assert.ok(Math.abs(furyMultiplier(0) - (1 + CLASSES.berserker.params.maxBonus)) < 1e-9);
  const low = computeDamage({ ...base, base: 30, attackerFury: true, attackerHp: 20 }).hpDamage;
  assert.ok(low > 30 * 1.5);
});

test('damage: jumper tired reduces body more than head (headshots still lethal)', () => {
  const body = computeDamage({ ...base, base: 100, victimTired: true }).hpDamage;
  const head = computeDamage({ ...base, base: 100, victimTired: true, head: true }).hpDamage;
  assert.ok(body < head);
  assert.ok(weaponHitDamage(WEAPONS.rifle, 500, true) * (1 - CLASSES.jumper.params.headReduction) >= 100, 'rifle headshot still one-taps a tired jumper');
});

test('weapons: headshot multiplier, falloff and air spread', () => {
  assert.ok(weaponHitDamage(WEAPONS.rifle, 0, true) > weaponHitDamage(WEAPONS.rifle, 0, false) * 3);
  assert.ok(weaponHitDamage(WEAPONS.shotgun, 1500, false) < WEAPONS.shotgun.damage * 0.2);
  const ground = computeSpread(WEAPONS.rifle, { onGround: true, hSpeed: 0, ducked: false, zoomed: false });
  const air = computeSpread(WEAPONS.rifle, { onGround: false, hSpeed: 1500, ducked: false, zoomed: false });
  assert.ok(air > ground && air < 2, `air spread stays modest (${air}°)`);
  assert.ok(computeSpread(WEAPONS.sniper, { onGround: true, hSpeed: 0, ducked: false, zoomed: true }) < 0.1);
});

test('match state machine: prep → countdown → active → roundEnd → next round → match end', () => {
  const m = new MatchMachine({ roundsToWin: 2, roundTime: 10, prepTime: 1, countdown: 1, roundEndTime: 1, duelTime: 5 });
  m.openSelection();
  assert.equal(m.phase, 'select');
  m.startMatch();
  assert.equal(m.phase, 'prep');
  const alive = { blue: 2, red: 2 };
  m.update(1.01, alive, () => null); assert.equal(m.phase, 'countdown');
  m.update(1.01, alive, () => null); assert.equal(m.phase, 'active');
  m.update(0.1, { blue: 1, red: 0 }, () => null); assert.equal(m.phase, 'roundEnd');
  assert.equal(m.score.blue, 1);
  m.update(1.01, alive, () => null); assert.equal(m.phase, 'prep'); assert.equal(m.round, 2);
  m.update(1.01, alive, () => null); m.update(1.01, alive, () => null);
  m.update(0.1, { blue: 1, red: 0 }, () => null);
  const tr = m.update(1.01, alive, () => null);
  assert.equal(m.phase, 'matchEnd');
  assert.ok(tr.some((t) => t.type === 'matchEnd' && t.winner === 'blue'));
});

test('match state machine: timeout → duel phase → tiebreak', () => {
  const m = new MatchMachine({ roundsToWin: 6, roundTime: 2, prepTime: 0.1, countdown: 0.1, roundEndTime: 1, duelTime: 1 });
  m.openSelection(); m.startMatch();
  const alive = { blue: 2, red: 2 };
  m.update(0.2, alive, () => null); m.update(0.2, alive, () => null);
  assert.equal(m.phase, 'active');
  const tr = m.update(2.1, alive, () => null);
  assert.equal(m.phase, 'duel');
  assert.ok(tr.some((t) => t.type === 'startDuels'));
  m.update(1.1, alive, () => 'red');
  assert.equal(m.phase, 'roundEnd');
  assert.equal(m.score.red, 1);
});

function trainingWorld() {
  return new World(buildClouds(), { mode: 'training', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
}

test('ability cooldowns: runner dash goes on cooldown and resets on kill', () => {
  const w = trainingWorld();
  const p = w.local;
  assert.ok(tryUseAbility(w, p));
  assert.equal(p.abilityCd, CLASSES.runner.ability.cooldown);
  assert.equal(tryUseAbility(w, p), false, 'cannot use during cooldown');
  for (let i = 0; i < 100; i++) w.step(SIM_DT);
  assert.ok(Math.abs(p.abilityCd - (CLASSES.runner.ability.cooldown - 1)) < 0.05);
  // kill a dummy → cooldown reset
  const dummy = w.players.find((q) => q.isDummy)!;
  w.applyDamage(dummy, p, 500, true, false, 'test');
  assert.equal(dummy.alive, false);
  assert.equal(p.abilityCd, 0);
});

test('shooting a dummy: hitscan damage, ammo, reload, weapon switching', () => {
  const w = trainingWorld();
  const p = w.local;
  const d = w.players.find((q) => q.isDummy)!;
  // place the player in front of the dummy, aim at its chest
  p.phys.pos.copy(d.phys.pos).add(new V3(0, 0, 400));
  p.prevPos.copy(p.phys.pos);
  w.bots.delete(d.id); // keep the dummy still
  const eye = p.eyePos(new V3());
  const chest = d.phys.pos.clone(); chest.y += 40;
  p.input.cmd.yaw = Math.atan2(-(chest.x - eye.x), -(chest.z - eye.z));
  p.input.cmd.pitch = Math.atan2(chest.y - eye.y, Math.hypot(chest.x - eye.x, chest.z - eye.z));
  // starts with only the knife; give a pistol and select it
  assert.equal(p.currentWeapon()!.id, 'knife');
  assert.equal(p.weapons[1], null, 'no pistol at round start');
  p.giveWeapon('pistol');
  p.input.slot = 1; w.step(SIM_DT); p.input.slot = null;
  for (let i = 0; i < 40; i++) w.step(SIM_DT); // switch time
  const mag0 = p.weapons[1]!.mag;
  p.input.fire = true;
  w.step(SIM_DT);
  p.input.fire = false;
  w.step(SIM_DT);
  assert.equal(p.weapons[1]!.mag, mag0 - 1);
  assert.ok(d.hp < 100, `dummy took damage (hp ${d.hp})`);
  // reload
  p.input.reload = true; w.step(SIM_DT); p.input.reload = false;
  assert.ok(p.reloadTime > 0);
  for (let i = 0; i < 200; i++) w.step(SIM_DT);
  assert.equal(p.weapons[1]!.mag, WEAPONS.pistol.mag);
  // switch: give a rifle and select slot 1 (index 0); knife is slot 3 (index 2)
  p.giveWeapon('rifle');
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  assert.equal(p.currentWeapon()!.id, 'rifle');
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null;
  assert.equal(p.currentWeapon()!.id, 'knife');
});

test('picking up a weapon with E and auto pickups', () => {
  const w = trainingWorld();
  const p = w.local;
  const gun = w.pickups.find((k) => k.kind === 'weapon')!;
  assert.ok(gun, 'map has weapon pickups');
  p.phys.pos.copy(gun.pos); p.phys.pos.y += 2;
  p.input.use = true; w.step(SIM_DT); p.input.use = false;
  assert.equal(p.weapons[WEAPONS[gun.weapon!].slot]?.id, gun.weapon);
  assert.equal(gun.active, false);
  const med = w.pickups.find((k) => k.kind !== 'weapon' && k.active)!;
  med.kind = 'medkit';
  p.hp = 40;
  p.phys.pos.copy(med.pos); p.phys.pos.y += 2;
  w.step(SIM_DT);
  assert.equal(p.hp, 90);
});

test('bot match runs: bots surf, fight, and rounds end with a score', () => {
  const w = new World(buildClouds(), {
    mode: 'bots', teamSize: 3, difficulty: 'hard', local: { name: 'eu', team: 'blue', classId: 'predator' }, seed: 42, autoBhop: true,
    match: { roundTime: 60, duelTime: 30 },
  });
  // make the local player a bot as well so the match resolves without input
  w.bots.set(w.localId, new BotBrain(w, w.local, 'hard'));
  w.bots.get(w.localId)!.onRoundStart();
  let kills = 0, rounds = 0, shots = 0;
  for (let t = 0; t < 240 / SIM_DT && rounds < 2; t++) {
    w.step(SIM_DT);
    for (const e of w.drainEvents()) {
      if (e.t === 'kill') kills++;
      if (e.t === 'shot') shots++;
      if (e.t === 'match' && e.tr.type === 'roundEnd') rounds++;
    }
  }
  assert.ok(shots > 20, `bots shoot (${shots})`);
  assert.ok(kills >= 3, `bots get kills (${kills})`);
  assert.ok(rounds >= 1, `at least one round ended (${rounds}), score ${JSON.stringify(w.match.score)}`);
});
