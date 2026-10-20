// Rodada 11a: a luneta da LONGBOW abre/fecha com o clique direito em qualquer situação (sprint
// automático, pulo, surf, depois de atirar, depois de um slide), e cliques durante a recarga/troca ficam guardados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { SIM_DT, SPRINT } from '../shared/config/physics';
import type { Player } from '../shared/sim/player';

function setup() {
  const w = new World(buildClouds(), { mode: 'training', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
  const p = w.local;
  p.phys.pos.set(14200, 2, 760); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, 0);
  p.input.cmd.yaw = 0; p.input.cmd.pitch = 0;
  p.giveWeapon('sniper'); p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  run(w, 50); // tempo de troca
  return { w, p };
}
function run(w: World, n: number) {
  for (let i = 0; i < n; i++) {
    const p = w.local;
    if (p.phys.pos.x > 13000 && p.phys.pos.z < -600) { p.phys.pos.z += 1300; p.prevPos.copy(p.phys.pos); }
    w.step(SIM_DT);
  }
}
/** Clique rápido: aperta e solta dentro de um único tick (o cliente manda a borda nesse tick). */
function click(w: World, p: Player) { p.input.alt = true; w.step(SIM_DT); p.input.alt = false; w.step(SIM_DT); }

test('with the automatic sprint, walking: one right click opens the scope and another closes it', () => {
  const { w, p } = setup();
  assert.ok(SPRINT.autoSprint);
  p.input.cmd.forward = 1; run(w, 60);
  assert.ok(p.sprinting, 'andando = sprint automático');
  click(w, p); assert.equal(p.zoomed, true, 'abriu andando');
  run(w, 20); assert.equal(p.zoomed, true);
  click(w, p); assert.equal(p.zoomed, false, 'fechou andando');
});

test('scope toggles while jumping, while surfing and right after a shot', () => {
  const { w, p } = setup();
  p.input.cmd.forward = 1; run(w, 40);
  p.input.cmd.jump = true; run(w, 3); p.input.cmd.jump = false;
  assert.ok(!p.phys.onGround, 'no ar');
  click(w, p); assert.equal(p.zoomed, true, 'abriu no ar');
  click(w, p); assert.equal(p.zoomed, false, 'fechou no ar');
  // surf: rampa A do CLOUDS
  p.input.cmd.forward = 0;
  p.phys.pos.set(170, 2050, 4300); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, -300); p.input.cmd.yaw = 0; p.input.cmd.side = -1;
  let surfed = false;
  for (let i = 0; i < 120 && !surfed; i++) { w.step(SIM_DT); surfed = p.phys.surfing; }
  assert.ok(surfed, 'surfando');
  click(w, p); assert.equal(p.zoomed, true, 'abriu surfando');
  click(w, p); assert.equal(p.zoomed, false, 'fechou surfando');
  p.input.cmd.side = 0;
  // logo depois de atirar (no meio do intervalo entre tiros)
  p.phys.pos.set(14200, 2, 760); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, 0); run(w, 30);
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false;
  assert.ok(p.fireCooldown > 0, 'acabou de atirar');
  click(w, p); assert.equal(p.zoomed, true, 'abriu logo depois do tiro');
  p.input.fire = true; w.step(SIM_DT); p.input.fire = false; run(w, 5);
  assert.equal(p.zoomed, true, 'continua na luneta depois do tiro');
  click(w, p); assert.equal(p.zoomed, false);
});

test('after a slide a click opens the scope; clicks during the slide, reload and weapon switch are kept', () => {
  const { w, p } = setup();
  p.input.cmd.forward = 1; run(w, 80);
  click(w, p); assert.equal(p.zoomed, true);
  p.input.cmd.crouch = true; w.step(SIM_DT);
  assert.ok(p.slideTime > 0, 'slide');
  assert.equal(p.zoomed, false, 'o slide tira da luneta');
  click(w, p); assert.equal(p.zoomed, false, 'durante o slide não mira...');
  run(w, 120); p.input.cmd.crouch = false; run(w, 30);
  assert.equal(p.slideTime, 0);
  assert.equal(p.zoomed, true, '...mas o clique ficou guardado e vale quando o slide acaba');
  click(w, p); assert.equal(p.zoomed, false);
  click(w, p); assert.equal(p.zoomed, true, 'depois do slide: clique abre');
  click(w, p);
  // recarga: o clique durante a recarga vale ao terminar
  p.weapons[0]!.mag = 1; p.input.reload = true; w.step(SIM_DT); p.input.reload = false;
  assert.ok(p.reloadTime > 0, 'recarregando');
  click(w, p); assert.equal(p.zoomed, false, 'não mira recarregando');
  run(w, 400);
  assert.equal(p.reloadTime, 0);
  assert.equal(p.zoomed, true, 'clique guardado aplicado ao fim da recarga');
  click(w, p);
  // troca de arma: sair e voltar para a LONGBOW e clicar durante a troca
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null; run(w, 50);
  p.input.slot = 0; w.step(SIM_DT); p.input.slot = null;
  assert.ok(p.switchTime > 0);
  click(w, p); assert.equal(p.zoomed, false, 'trocando');
  run(w, 50); assert.equal(p.zoomed, true, 'clique guardado aplicado ao fim da troca');
});

test('hold mode: aim follows the button (input.aim) and a quick tap still scopes for a tick', () => {
  const { w, p } = setup();
  p.input.aim = true; w.step(SIM_DT); assert.equal(p.zoomed, true);
  run(w, 10); assert.equal(p.zoomed, true);
  p.input.aim = false; w.step(SIM_DT); assert.equal(p.zoomed, false);
  p.input.aim = null;
  // armas sem luneta: o clique direito não mira (a faca usa o direito para a estocada)
  p.input.slot = 2; w.step(SIM_DT); p.input.slot = null; run(w, 50);
  click(w, p); assert.equal(p.zoomed, false);
});
