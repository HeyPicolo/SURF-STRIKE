// Rodada 12a: progressão por arma, attachments e WeaponDef efetivo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../shared/config/weapons';
import { PROGRESSION, PROGRESSION_WEAPONS, DUEL_BUILDS } from '../shared/config/progression';
import { ATTACHMENTS, ATTACH_SLOTS, AttachSlot, MAX_ATTACHMENTS, POWER_CAP, WEAPON_ATTACHMENTS } from '../shared/config/attachments';
import { Build, effectiveDef, validateBuild, sanitizeBuild, ttkBody, describeAttachment, weaponSlots, statBars } from '../shared/sim/loadout';
import {
  xpToReach, totalXpForLevel, levelInfo, unlockedAt, nextUnlock, killXp, MatchXpTracker, applyMatchXp,
  emptyProgression, migrateProgression, MemoryProgressionStore, playerBuilds, devXp, botBuilds, BOT_BUILD,
} from '../shared/sim/progression';
import { World, SimEvent } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { makeRng, V3 } from '../shared/math/vec3';
import { wdef } from '../shared/sim/player';

const map = buildClouds();
const cfg = (o: object = {}) => ({ mode: 'bots' as const, teamSize: 3, difficulty: 'medium' as const, local: { name: 'eu', team: 'blue' as const, classId: 'runner' as const }, seed: 42, autoBhop: true, ...o });

// ------------------------------------------------------------------ curva e desbloqueios

test('curva: XP por nível cresce e o total bate com a fórmula', () => {
  for (let n = 3; n <= 30; n++) assert.ok(xpToReach(n) > xpToReach(n - 1));
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(30), 29 * PROGRESSION.levelBase + PROGRESSION.levelStep * (28 * 29) / 2);
  const li = levelInfo('rifle', totalXpForLevel(10) + 5);
  assert.equal(li.level, 10); assert.equal(li.intoLevel, 5); assert.equal(li.needed, xpToReach(11));
  assert.equal(levelInfo('pistol', 1e9).level, 20);
  assert.ok(levelInfo('pistol', 1e9).maxed);
  assert.equal(levelInfo('rifle', 1e9).level, 30);
  assert.equal(levelInfo('smg', -50).level, 1);
});

test('desbloqueios: ordem crescente, do nível 2 ao máximo, peças da categoria certa e sem repetir', () => {
  for (const w of PROGRESSION_WEAPONS) {
    const list = WEAPON_ATTACHMENTS[w];
    assert.equal(list[0].level, 2, w);
    assert.equal(list[list.length - 1].level, PROGRESSION.maxLevel[w], w);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].level >= list[i - 1].level, w);
    assert.equal(new Set(list.map((a) => a.id)).size, list.length, w);
    for (const a of list) assert.ok(ATTACHMENTS[a.id], a.id);
    assert.deepEqual(unlockedAt(w, 1), []);
    assert.equal(unlockedAt(w, PROGRESSION.maxLevel[w]).length, list.length);
    assert.equal(nextUnlock(w, 1)?.level, 2);
    assert.equal(nextUnlock(w, PROGRESSION.maxLevel[w]), null);
  }
});

test('toda peça é uma troca em cada arma: pelo menos um pró e um contra que valem nela', () => {
  for (const id of Object.keys(ATTACHMENTS)) {
    const d = describeAttachment(id);
    assert.ok(d.pros.length > 0 && d.cons.length > 0, id);
  }
  for (const w of PROGRESSION_WEAPONS) for (const { id } of WEAPON_ATTACHMENTS[w]) {
    const d = describeAttachment(id, w);
    assert.ok(d.pros.length > 0, `${w}/${id} sem prós`);
    assert.ok(d.cons.length > 0, `${w}/${id} sem contras`);
    // o efetivo muda algo de verdade na arma
    const e = effectiveDef(w, { [ATTACHMENTS[id].slot]: id }), b = WEAPONS[w];
    const changed = (Object.keys(b) as (keyof typeof b)[]).some((k) => typeof b[k] === 'number' && b[k] !== e[k]) || JSON.stringify(b.ads) !== JSON.stringify(e.ads) || Object.keys(e.fx).length > 0;
    assert.ok(changed, `${w}/${id} não muda nada`);
  }
});

// ------------------------------------------------------------------ build e teto de poder

test('build: limite de 5, uma por categoria, só peças da arma e liberadas', () => {
  const six: Build = { muzzle: 'comp', barrel: 'long', laser: 'laserTac', optic: 'reddot', stock: 'stockLight', underbarrel: 'gripVert' };
  assert.equal(validateBuild('rifle', six).ok, false);
  assert.ok(validateBuild('rifle', six).errors.some((e) => e.includes(String(MAX_ATTACHMENTS))));
  assert.equal(Object.keys(sanitizeBuild('rifle', six)).length, MAX_ATTACHMENTS);
  assert.equal(validateBuild('rifle', { muzzle: 'long' }).ok, false); // categoria errada
  assert.equal(validateBuild('pistol', { optic: 'x3' }).ok, false); // não é da pistola
  assert.equal(validateBuild('rifle', { optic: 'x3' }, 10).ok, false); // bloqueada
  assert.equal(validateBuild('rifle', { optic: 'x3' }, 30).ok, true);
  assert.deepEqual(sanitizeBuild('rifle', { optic: 'x3', muzzle: 'comp' }, 2), { muzzle: 'comp' });
});

/** Todos os builds válidos (≤ 5 peças, uma por categoria) de uma arma. */
function* allBuilds(w: (typeof PROGRESSION_WEAPONS)[number]): Generator<Build> {
  const slots = weaponSlots(w);
  const bySlot = slots.map((s) => WEAPON_ATTACHMENTS[w].map((a) => a.id).filter((id) => ATTACHMENTS[id].slot === s));
  const cur: Build = {};
  function* rec(i: number, n: number): Generator<Build> {
    if (i === slots.length) { yield { ...cur }; return; }
    yield* rec(i + 1, n);
    if (n >= MAX_ATTACHMENTS) return;
    for (const id of bySlot[i]) { cur[slots[i] as AttachSlot] = id; yield* rec(i + 1, n + 1); delete cur[slots[i] as AttachSlot]; }
  }
  yield* rec(0, 0);
}

test('teto de poder: TODAS as combinações ficam em ±25% da base e o TTK não cai abaixo do mínimo', () => {
  const [lo, hi] = POWER_CAP.default;
  const keys = ['damage', 'falloffHalf', 'range', 'mag', 'reserve', 'reloadTime', 'spread', 'airSpread', 'moveSpread', 'kick', 'kickSide', 'recover', 'moveSpeedMul', 'zoom', 'zoomSpread'] as const;
  let count = 0;
  for (const w of PROGRESSION_WEAPONS) {
    const base = WEAPONS[w], ttk0 = ttkBody(base);
    for (const b of allBuilds(w)) {
      count++;
      assert.ok(validateBuild(w, b).ok);
      const d = effectiveDef(w, b);
      for (const k of keys) {
        const bv = base[k] as number, v = d[k] as number;
        if (!bv) continue;
        // inteiros (pente/reserva) podem arredondar meia unidade
        const slack = k === 'mag' || k === 'reserve' ? 0.5 : 1e-9;
        assert.ok(v >= bv * lo - slack && v <= bv * hi + slack, `${w} ${JSON.stringify(b)} ${k}: ${v} vs ${bv}`);
      }
      assert.ok(d.rpm <= base.rpm * hi + 1e-9, `${w} rpm`);
      assert.ok(ttkBody(d) >= ttk0 * POWER_CAP.ttkMinFrac - 1e-9, `${w} ${JSON.stringify(b)} TTK ${ttkBody(d)} < ${ttk0}`);
      if (base.ads && d.ads) for (const k of ['time', 'moveMul', 'spreadMul'] as const) assert.ok(d.ads[k] >= base.ads[k] * lo - 1e-9 && d.ads[k] <= base.ads[k] * hi + 1e-9, `${w} ads.${k}`);
      for (const v of Object.values(statBars(d))) assert.ok(v >= 0 && v <= 100);
    }
  }
  assert.ok(count > 10000, `combinações testadas: ${count}`);
});

test('WeaponDef efetivo: sem build = base; com build muda o atributo e o cache devolve o mesmo objeto', () => {
  assert.equal(effectiveDef('rifle').damage, WEAPONS.rifle.damage);
  const d = effectiveDef('rifle', { magazine: 'magExt' });
  assert.ok(d.mag > WEAPONS.rifle.mag);
  assert.equal(effectiveDef('rifle', { magazine: 'magExt' }), d);
  assert.equal(effectiveDef('rifle', { muzzle: 'supp' }).fx.suppressed, true);
  assert.equal(effectiveDef('rifle', { optic: 'x2' }).ads?.fov, 0.5);
  for (const s of ATTACH_SLOTS) assert.ok(typeof s === 'string');
});

// ------------------------------------------------------------------ XP

test('XP de abate: base, headshot, longa distância, no ar e multiabate', () => {
  const sum = (g: { amount: number }[]) => g.reduce((s, x) => s + x.amount, 0);
  const X = PROGRESSION.xp;
  assert.equal(sum(killXp('rifle', { head: false, dist: 100, air: false, streak: 1 })), X.kill);
  assert.equal(sum(killXp('rifle', { head: true, dist: 100, air: false, streak: 1 })), X.kill + X.headshot);
  const far = WEAPONS.rifle.falloffHalf * PROGRESSION.longRangeFrac.rifle;
  assert.equal(sum(killXp('rifle', { head: false, dist: far, air: true, streak: 1 })), X.kill + X.longRange + X.airKill);
  assert.equal(sum(killXp('smg', { head: false, dist: 10, air: false, streak: 2 })), X.kill + X.multikill2);
  assert.equal(sum(killXp('smg', { head: false, dist: 10, air: false, streak: 4 })), X.kill + X.multikill3);
});

function fakeWorld(time = 10, held = 'rifle', team = 'blue') {
  return { time, player: () => ({ team, currentWeapon: () => ({ id: held }) }) } as unknown as World;
}

test('MatchXpTracker: dano, abate, assistência, vitória rateada e multiplicador de dificuldade', () => {
  const t = new MatchXpTracker(1, 'bots', 'hard');
  const w = fakeWorld();
  const ev: SimEvent[] = [
    { t: 'hit', attacker: 1, victim: 5, dmg: 100, head: false, pos: new V3(), killed: false, weaponId: 'rifle' },
    { t: 'hit', attacker: 1, victim: 5, dmg: 100, head: false, pos: new V3(), killed: true, weaponId: 'smg' },
    { t: 'kill', killer: 1, victim: 5, weapon: 'x', head: true, weaponId: 'smg', dist: 50, air: false, assists: [] },
    { t: 'kill', killer: 3, victim: 6, weapon: 'x', head: false, weaponId: 'rifle', dist: 50, air: false, assists: [1] },
    { t: 'match', tr: { type: 'roundEnd', winner: 'blue', reason: 'elimination' } as never },
  ];
  t.feed(ev, w);
  const m = PROGRESSION.difficultyMul.hard, X = PROGRESSION.xp;
  // rifle: 50 dano + metade da assistência + metade do round; smg: 50 dano + abate + headshot + metade + metade
  const rifle = Math.round(100 * X.perDamage * m) + Math.round(X.assist / 2 * m) + Math.round(X.roundWin / 2 * m);
  const smg = Math.round(100 * X.perDamage * m) + Math.round(X.kill * m) + Math.round(X.headshot * m) + Math.round(X.assist / 2 * m) + Math.round(X.roundWin / 2 * m);
  assert.equal(t.total.rifle, rifle);
  assert.equal(t.total.smg, smg);
  assert.ok(t.log.length >= 6);
});

test('XP só no modo contra bots; vitória em duelo vale para a arma do duelo', () => {
  const tr = new MatchXpTracker(1, 'training', 'medium');
  tr.feed([{ t: 'hit', attacker: 1, victim: 5, dmg: 100, head: false, pos: new V3(), killed: false, weaponId: 'rifle' }], fakeWorld());
  assert.deepEqual(tr.total, {});
  const t = new MatchXpTracker(1, 'bots', 'medium');
  t.feed([{ t: 'duelWin', winner: 1, loser: 4, weapon: 'sniper' }], fakeWorld());
  assert.equal(t.total.sniper, PROGRESSION.xp.duelWin);
});

test('applyMatchXp: soma, sobe de nível e lista os desbloqueios', () => {
  const d = emptyProgression();
  const { data, levelUps } = applyMatchXp(d, { rifle: totalXpForLevel(4) });
  assert.equal(levelInfo('rifle', data.xp.rifle).level, 4);
  assert.equal(levelUps.length, 1);
  assert.equal(levelUps[0].from, 1); assert.equal(levelUps[0].to, 4);
  assert.deepEqual(levelUps[0].unlocked, unlockedAt('rifle', 4));
  assert.equal(d.xp.rifle, 0); // não muda o original
});

// ------------------------------------------------------------------ dados salvos

test('store: migração do schema 1, lixo, builds com peças bloqueadas e reset', () => {
  const s = new MemoryProgressionStore();
  assert.deepEqual(s.load(), emptyProgression());
  s.setRaw({ version: 1, weapons: { rifle: { xp: 1234, level: 3 }, knife: { xp: 99 } } });
  assert.equal(s.load().xp.rifle, 1234);
  assert.equal(s.load().schema, 2);
  assert.deepEqual(migrateProgression('lixo'), emptyProgression());
  assert.deepEqual(migrateProgression({ schema: 99, xp: { rifle: 5 } }), emptyProgression());
  const d = emptyProgression();
  d.xp.rifle = totalXpForLevel(3);
  d.builds.rifle = { muzzle: 'comp', optic: 'x3' }; // x3 só no 30
  s.save(d);
  assert.deepEqual(s.load().builds.rifle, { muzzle: 'comp' });
  assert.deepEqual(playerBuilds(s.load()).rifle, { muzzle: 'comp' });
  s.reset();
  assert.deepEqual(s.load(), emptyProgression());
});

test('modo dev: dar XP, liberar tudo e zerar', () => {
  let d = devXp.grant(emptyProgression(), 'smg', 5000);
  assert.equal(d.xp.smg, 5000);
  d = devXp.unlockAll(d);
  for (const w of PROGRESSION_WEAPONS) assert.equal(levelInfo(w, d.xp[w]).level, PROGRESSION.maxLevel[w]);
  assert.deepEqual(devXp.reset(), emptyProgression());
});

// ------------------------------------------------------------------ sim: builds na partida

test('builds dos bots: determinísticos pela seed, mais peças em dificuldades maiores', () => {
  assert.deepEqual(botBuilds('hard', makeRng(7)), botBuilds('hard', makeRng(7)));
  for (const w of PROGRESSION_WEAPONS) {
    const b = botBuilds('god', makeRng(3))[w]!;
    assert.equal(Object.keys(b).length, Math.min(MAX_ATTACHMENTS, weaponSlots(w).length));
    assert.ok(validateBuild(w, b).ok);
    const e = botBuilds('easy', makeRng(3))[w]!;
    assert.ok(Object.keys(e).length <= BOT_BUILD.easy.count[1]);
    assert.ok(validateBuild(w, e, Math.round(PROGRESSION.maxLevel[w] * BOT_BUILD.easy.levelFrac)).ok);
  }
  const a = new World(map, cfg({ difficulty: 'hard' })), b = new World(map, cfg({ difficulty: 'hard' }));
  assert.deepEqual(a.players.map((p) => p.builds), b.players.map((p) => p.builds));
  const c = new World(map, cfg({ difficulty: 'hard', seed: 43 }));
  assert.notDeepEqual(a.players.map((p) => p.builds), c.players.map((p) => p.builds));
});

test('pegar arma do chão: entra com o build de quem pega, não o de quem soltou', () => {
  const w = new World(map, cfg({ localBuilds: { rifle: { muzzle: 'supp', magazine: 'magExt' } } }));
  const me = w.local, bot = w.players.find((p) => p.isBot)!;
  bot.builds = { rifle: { optic: 'reddot' } };
  const dropped = bot.giveWeapon('rifle');
  assert.deepEqual(dropped.build, { optic: 'reddot' });
  dropped.mag = 3;
  const wa = w as unknown as { spawnDropped: (ws: unknown, at: V3) => void; tryUsePickup: (p: unknown) => void };
  wa.spawnDropped(dropped, me.phys.pos.clone());
  wa.tryUsePickup(me);
  const mine = me.weapons[WEAPONS.rifle.slot]!;
  assert.equal(mine.id, 'rifle');
  assert.deepEqual(mine.build, { muzzle: 'supp', magazine: 'magExt' });
  assert.equal(mine.mag, 3);
  assert.ok(wdef(mine).fx.suppressed);
});

test('duelo: regra da config (base = arma sem attachments para os dois)', () => {
  const w = new World(map, cfg({ localBuilds: { sniper: { barrel: 'long' } } }));
  const me = w.local;
  (w as unknown as { prepareDuelist: (p: unknown, wp: string, sp: unknown) => void }).prepareDuelist(me, 'sniper', map.duelArenas[0].a);
  const ws = me.weapons[WEAPONS.sniper.slot]!;
  if (DUEL_BUILDS === 'base') assert.equal(ws.build, undefined);
  else assert.deepEqual(ws.build, { barrel: 'long' });
  assert.equal(ws.reserve, wdef(ws).mag * 4);
});

test('Treino usa o build do jogador; o efetivo vale no tiro (pente) e na mobilidade', () => {
  const w = new World(map, cfg({ mode: 'training', localBuilds: { smg: { magazine: 'magDrum', barrel: 'short' } } }));
  const ws = w.local.giveWeapon('smg');
  assert.equal(ws.mag, effectiveDef('smg', { magazine: 'magDrum', barrel: 'short' }).mag);
  assert.ok(ws.mag > WEAPONS.smg.mag);
  w.local.slot = WEAPONS.smg.slot;
  assert.ok(Math.abs(w.local.groundSpeedMul() - effectiveDef('smg', ws.build).moveSpeedMul) < 1e-9);
});

test('kill traz arma, distância, no ar e assistências; o supressor encurta a audição dos bots', () => {
  const w = new World(map, cfg({ mode: 'training', localBuilds: { rifle: { muzzle: 'supp' } } }));
  const me = w.local, dummy = w.players.find((p) => p.isDummy)!;
  w.drainEvents();
  w.applyDamage(dummy, me, 500, false, false, 'RIFLE', undefined, 'rifle');
  const evs = w.drainEvents();
  const k = evs.find((e) => e.t === 'kill') as Extract<SimEvent, { t: 'kill' }>;
  const h = evs.find((e) => e.t === 'hit') as Extract<SimEvent, { t: 'hit' }>;
  assert.ok(h.dealt! < h.dmg && h.dealt! <= 150 + 100 + 1, `excesso de dano não vale XP: ${h.dealt} de ${h.dmg}`);
  assert.equal(k.weaponId, 'rifle');
  assert.ok((k.dist ?? 0) > 0);
  assert.equal(typeof k.air, 'boolean');
  assert.ok(Array.isArray(k.assists));
  me.giveWeapon('rifle'); me.slot = WEAPONS.rifle.slot;
  w.emit({ t: 'shot', pid: me.id, weapon: 'rifle', from: new V3(), to: new V3(), hitWorld: false, pellet: 0 });
  assert.equal(w.noises[w.noises.length - 1].suppressed, true);
});
