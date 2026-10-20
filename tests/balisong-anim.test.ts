// Rodada 11a: sacar da balisong com giro contínuo (sem parar em cada quadro-chave) e final igual ao REST;
// a inspeção da balisong, das armas e da granada não mudou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { butterflyDraw, butterflyInspect, gunInspect, nadeInspect, BF_DRAW_TIME, REST, ViewPose } from '../client/src/game/viewAnims';

const KEYS = Object.keys(REST) as (keyof ViewPose)[];
const TAU = Math.PI * 2;

test('balisong draw: continuous angles (no jumps between frames) and continuous speed through the keyframes', () => {
  const dt = 0.001;
  let prev = butterflyDraw(0), maxStep = 0, prevV: Record<string, number> = {}, maxDv = 0;
  for (let t = dt; t <= BF_DRAW_TIME + 1e-9; t += dt) {
    const p = butterflyDraw(t);
    for (const k of KEYS) {
      const step = Math.abs(p[k] - prev[k]);
      maxStep = Math.max(maxStep, step);
      const v = step / dt * Math.sign(p[k] - prev[k]);
      if (prevV[k] !== undefined) maxDv = Math.max(maxDv, Math.abs(v - prevV[k]));
      prevV[k] = v;
    }
    prev = p;
  }
  assert.ok(maxStep < 0.06, `salto de ${maxStep.toFixed(3)} rad num milissegundo`);
  // a velocidade não "zera e recomeça" nos quadros: a variação de velocidade por ms é pequena
  assert.ok(maxDv < 1.5, `mudança brusca de velocidade (${maxDv.toFixed(2)} rad/s em 1 ms)`);
  // o giro do cabo "bite" é contínuo: só aumenta (depois da pequena antecipação) até travar aberto
  let decreasing = 0;
  for (let t = 0.08; t < 0.32; t += 0.005) if (butterflyDraw(t + 0.005).bite < butterflyDraw(t).bite - 1e-6) decreasing++;
  assert.equal(decreasing, 0, 'o cabo gira sem voltar no meio');
  // nos quadros-chave do meio do giro a velocidade não zera (com smoothstep por trecho ela zerava)
  for (const t of [0.16, 0.26]) {
    const v = (butterflyDraw(t + 0.002).bite - butterflyDraw(t - 0.002).bite) / 0.004;
    assert.ok(v > 5, `velocidade do cabo em ${t}s: ${v.toFixed(1)} rad/s`);
  }
});

test('balisong draw: starts closed with a small anticipation, settles open, ends equal to REST, same total time', () => {
  assert.equal(BF_DRAW_TIME, 0.55);
  const s = butterflyDraw(0);
  assert.ok(Math.abs(s.blade - Math.PI) < 1e-6 && Math.abs(s.bite) < 1e-6, 'começa fechada');
  assert.ok(s.oy > -5, 'não "pula" de muito baixo');
  assert.ok(butterflyDraw(0.07).bite < 0, 'antecipação: o cabo recua antes do giro');
  assert.ok(butterflyDraw(0.33).blade > TAU, 'passa um pouco do ponto ao travar aberta');
  const end = butterflyDraw(BF_DRAW_TIME);
  for (const k of KEYS) {
    const v = k === 'blade' || k === 'bite' ? ((end[k] % TAU) + TAU) % TAU : end[k];
    assert.ok(Math.abs(v) < 1e-6 || Math.abs(v - TAU) < 1e-6, `${k} final ${end[k]}`);
  }
});

test('other view animations are unchanged (balisong inspect, gun inspect, grenade inspect)', () => {
  const r = (p: ViewPose) => KEYS.map((k) => +p[k].toFixed(4));
  assert.deepEqual([0.2, 0.7, 1.3, 2.0, 2.5].map((t) => r(butterflyInspect(t))), [[-2.1224, 1.516, 0.3032, 0.3335, 0, 0.2122, 0, 0], [-3.5, 2.5, 0.5, 0.55, 0, 0.35, 0.9159, 4.0575], [-3.5, 2.5, 0.5, 0.55, 0, 5.5273, 5.1773, 11.4605], [-3.5, 2.543, 0.5, 0.535, 0.0387, 12.9164, 6.2832, 12.5664], [-2.1224, 2.1224, 0.3032, 0.1213, 0.5458, 12.7786, 6.2832, 12.5664]]);
  assert.deepEqual([0.3, 1.2, 2.1].map((t) => r(gunInspect(t))), [[-3.375, 1.6875, 0.8438, 0.8016, 0, -0.2953, 0, 0], [-3.8438, 2.1562, 1, 0.8469, 0.1403, -0.0781, 0, 0], [-2.4052, 2.4052, 0.8017, -0.1603, 0.2004, 0.6013, 0, 0]]);
  assert.deepEqual([0.2, 0.9, 1.3].map((t) => r(nadeInspect(t))), [[-3.7037, 2.2222, 0, 0, 0, 2.3271, 0, 0], [-1, 2.5, 0, 0, 0.5, 7.854, 0, 0], [0, 0, 0, 0, 0, 11.7519, 0, 0]]);
});
