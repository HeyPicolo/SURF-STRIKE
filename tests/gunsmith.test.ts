// Rodada 12c: regras do Arsenal (gunsmith) sem DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotOptions, equip, unequip, swapEquip, compareStats, weaponSummary, buildCount, xpFrac } from '../shared/sim/gunsmith';
import { emptyProgression, totalXpForLevel, levelInfo, devXp } from '../shared/sim/progression';
import { WEAPON_ATTACHMENTS, ATTACHMENTS, MAX_ATTACHMENTS } from '../shared/config/attachments';
import { PROGRESSION_WEAPONS } from '../shared/config/progression';
import { STAT_BARS } from '../shared/sim/loadout';

test('opções da categoria: liberadas e bloqueadas com o nível, equipada marcada, prós e contras', () => {
  const opts = slotOptions('rifle', 'optic', 10, { optic: 'reddot' });
  assert.deepEqual(opts.map((o) => o.id), ['reddot', 'holo', 'x2', 'x3']);
  const by = Object.fromEntries(opts.map((o) => [o.id, o]));
  assert.equal(by.reddot.unlocked, true); assert.equal(by.reddot.equipped, true);
  assert.equal(by.x3.unlocked, false); assert.equal(by.x3.level, 30);
  for (const o of opts) { assert.ok(o.pros.length && o.cons.length); assert.equal(o.name, ATTACHMENTS[o.id].name); }
});

test('equipar: bloqueada recusa, troca na mesma categoria sempre pode, 6ª peça pede para remover uma', () => {
  assert.deepEqual(equip('rifle', {}, 'x3', 10), { ok: false, reason: 'locked', level: 30 });
  assert.deepEqual(equip('rifle', {}, 'scopeVar', 30), { ok: false, reason: 'invalid' });
  let b = {};
  for (const a of ['supp', 'holo', 'gripVert', 'magExt', 'stockLight']) { const r = equip('rifle', b, a, 30); assert.ok(r.ok); b = (r as { build: object }).build; }
  assert.equal(buildCount(b), MAX_ATTACHMENTS);
  const r6 = equip('rifle', b, 'laserTac', 30);
  assert.equal(r6.ok, false);
  assert.equal((r6 as { reason: string }).reason, 'full');
  assert.equal((r6 as { equipped: string[] }).equipped.length, 5);
  const swap = equip('rifle', b, 'reddot', 30); // mesma categoria: troca
  assert.ok(swap.ok && (swap as { build: { optic: string } }).build.optic === 'reddot');
  const sw = swapEquip('rifle', b, 'muzzle', 'laserTac', 30);
  assert.ok(sw.ok);
  const nb = (sw as { build: Record<string, string> }).build;
  assert.equal(nb.laser, 'laserTac'); assert.equal(nb.muzzle, undefined); assert.equal(buildCount(nb), 5);
  assert.equal(buildCount(unequip(nb, 'laser')), 4);
});

test('barras de atributos: atual × seleção (verde se melhora, vermelho se piora)', () => {
  const c = compareStats('rifle', {}, { magazine: 'magFast' });
  assert.deepEqual(c.map((x) => x.stat), [...STAT_BARS]);
  assert.ok(c.find((x) => x.stat === 'Recarga')!.delta > 0);
  const d = compareStats('rifle', {}, { barrel: 'long' });
  assert.ok(d.find((x) => x.stat === 'Alcance')!.delta > 0);
  assert.ok(d.find((x) => x.stat === 'Mobilidade')!.delta < 0);
  for (const x of compareStats('rifle', {}, {})) assert.equal(x.delta, 0);
});

test('resumo da lista: nível, barra de XP, próximo desbloqueio e quantidade liberada', () => {
  const d = emptyProgression();
  d.xp.sniper = totalXpForLevel(6) + 10;
  const s = weaponSummary('sniper', d);
  assert.equal(s.info.level, 6);
  assert.equal(s.unlocked, WEAPON_ATTACHMENTS.sniper.filter((a) => a.level <= 6).length);
  assert.equal(s.total, WEAPON_ATTACHMENTS.sniper.length);
  assert.ok(s.next && s.next.level > 6);
  assert.ok(xpFrac(s.info) > 0 && xpFrac(s.info) < 1);
  const all = devXp.unlockAll(d);
  for (const w of PROGRESSION_WEAPONS) {
    const m = weaponSummary(w, all);
    assert.equal(m.next, null); assert.equal(m.unlocked, m.total); assert.equal(xpFrac(levelInfo(w, all.xp[w])), 1);
  }
});
