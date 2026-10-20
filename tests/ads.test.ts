// Rodada 11b: mirar pela alça (ADS) — a linha de visada do modelo fica no centro da tela, o tempo de
// entrada/saída é o da arma, o spread e a velocidade mudam conforme a config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WeaponId } from '../shared/config/weapons';
import { computeSpread } from '../shared/sim/combat';
import { World } from '../shared/sim/world';
import { buildClouds } from '../shared/maps/clouds';
import { SIM_DT } from '../shared/config/physics';
import { adsPose, VM_SCALE } from '../client/src/game/adsPose';
import { WEAPON_REFS } from '../client/src/entities/style';
import { weaponGeometry } from '../client/src/entities/geometry';
import { STRIDE } from '../client/src/render/mesh';
import { trs, perspective, multiply, mat4 } from '../client/src/render/glm';

const ADS: WeaponId[] = ['pistol', 'rifle', 'smg', 'shotgun'];

function project(M: Float32Array, p: [number, number, number], W = 1920, H = 1080) {
  const P = perspective(mat4(), (65 * Math.PI) / 180, W / H, 0.5, 400), T = multiply(mat4(), P, M);
  const [x, y, z] = p, cw = T[3] * x + T[7] * y + T[11] * z + T[15];
  return [((T[0] * x + T[4] * y + T[8] * z + T[12]) / cw * 0.5 + 0.5) * W, (1 - ((T[1] * x + T[5] * y + T[9] * z + T[13]) / cw * 0.5 + 0.5)) * H];
}

/** Primeiro triângulo atingido por um raio no modelo (Möller–Trumbore): distância ou Infinity. */
function rayHit(d: number[], o: number[], dir: number[]): number {
  let best = Infinity;
  for (let i = 0; i < d.length; i += STRIDE * 3) {
    const a = [d[i], d[i + 1], d[i + 2]], b = [d[i + STRIDE], d[i + STRIDE + 1], d[i + STRIDE + 2]], c = [d[i + 2 * STRIDE], d[i + 2 * STRIDE + 1], d[i + 2 * STRIDE + 2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const pv = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (Math.abs(det) < 1e-12) continue;
    const tv = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
    if (u < 0 || u > 1) continue;
    const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = (dir[0] * qv[0] + dir[1] * qv[1] + dir[2] * qv[2]) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
    if (t > 1e-4 && t < best) best = t;
  }
  return best;
}

test('ADS sight alignment: rear sight and front sight/dot project to the screen center (16:9, within 2 px)', () => {
  for (const id of ADS) {
    const a = adsPose(id)!, s = WEAPON_REFS[id as Exclude<WeaponId, 'knife'>].sight!;
    const M = trs(mat4(), a.x, a.y, a.z, 0, 0, 0, VM_SCALE);
    for (const z of [s.rearZ, s.frontZ]) {
      const [px, py] = project(M, [0, s.y, z]);
      assert.ok(Math.hypot(px - 960, py - 540) < 2, `${id}: ponto de visada em z ${z} projeta a ${Math.hypot(px - 960, py - 540).toFixed(1)} px do centro`);
    }
    assert.ok(a.z < -4, `${id}: alça na frente do olho`);
  }
});

test('ADS sights exist on the models: looking through the rear sight you see the front sight (line of sight is open)', () => {
  for (const id of ADS) {
    const s = WEAPON_REFS[id as Exclude<WeaponId, 'knife'>].sight!, d = weaponGeometry(id, 'view').data;
    const t = rayHit(d, [0, s.y - 0.05, s.rearZ + 6], [0, 0, -1]);
    const hitZ = s.rearZ + 6 - t;
    assert.ok(Math.abs(hitZ - s.frontZ) < 1.3, `${id}: o olho bate em z ${hitZ.toFixed(2)} (massa/ponto em ${s.frontZ})`);
    // logo acima da linha de visada não há nada no caminho até depois da massa
    const above = rayHit(d, [0, s.y + 0.15, s.rearZ + 6], [0, 0, -1]);
    assert.ok(s.rearZ + 6 - above < s.frontZ || above === Infinity, `${id}: algo tapa a visada acima da linha`);
  }
});

function setup(id: WeaponId) {
  const w = new World(buildClouds(), { mode: 'training', teamSize: 1, difficulty: 'easy', local: { name: 'eu', team: 'blue', classId: 'runner' }, seed: 1, autoBhop: true });
  const p = w.local;
  p.phys.pos.set(14200, 2, 760); p.prevPos.copy(p.phys.pos); p.phys.vel.set(0, 0, 0);
  p.giveWeapon(id); p.input.slot = WEAPONS[id].slot; w.step(SIM_DT); p.input.slot = null;
  for (let i = 0; i < 50; i++) w.step(SIM_DT);
  return { w, p };
}

test('ADS enter/exit follows the weapon time; LONGBOW scope stays instant; knife/taser/grenades have no ADS', () => {
  for (const id of ADS) {
    const { w, p } = setup(id);
    const T = WEAPONS[id].ads!.time, n = Math.round(T / SIM_DT);
    p.input.alt = true; w.step(SIM_DT); p.input.alt = false;
    assert.ok(p.zoomed);
    for (let i = 1; i < Math.round(n / 2); i++) w.step(SIM_DT);
    assert.ok(Math.abs(p.adsK - 0.5) < 0.08, `${id}: metade do tempo → ${p.adsK.toFixed(2)}`);
    for (let i = 0; i < n; i++) w.step(SIM_DT);
    assert.equal(p.adsK, 1, `${id}: mira toda`);
    p.input.alt = true; w.step(SIM_DT); p.input.alt = false;
    for (let i = 1; i < Math.round(n / 2); i++) w.step(SIM_DT);
    assert.ok(p.adsK > 0.35 && p.adsK < 0.65, `${id}: saindo na metade → ${p.adsK.toFixed(2)}`);
    for (let i = 0; i < n; i++) w.step(SIM_DT);
    assert.equal(p.adsK, 0);
  }
  const { w, p } = setup('sniper');
  p.input.alt = true; w.step(SIM_DT); p.input.alt = false;
  assert.equal(p.adsK, 1, 'luneta instantânea');
  for (const slot of [2, 3]) {
    p.input.alt = true; p.input.alt = false;
    const { w: w2, p: p2 } = setup('pistol');
    p2.input.slot = slot; w2.step(SIM_DT); p2.input.slot = null; for (let i = 0; i < 50; i++) w2.step(SIM_DT);
    p2.input.alt = true; w2.step(SIM_DT); p2.input.alt = false; for (let i = 0; i < 30; i++) w2.step(SIM_DT);
    assert.equal(p2.zoomed, false); assert.equal(p2.adsK, 0);
  }
  void w;
});

test('ADS spread and movement multipliers come from config', () => {
  for (const id of ADS) {
    const def = WEAPONS[id], st = { onGround: true, hSpeed: 0, ducked: false, zoomed: true };
    const hip = computeSpread(def, { ...st, ads: 0 }), ads = computeSpread(def, { ...st, ads: 1 });
    assert.ok(Math.abs(ads / hip - def.ads!.spreadMul) < 1e-9, `${id}: spread ${ads / hip}`);
    assert.ok(def.ads!.spreadMul >= 0.65 && def.ads!.spreadMul < 1, `${id}: ganho modesto`);
    const { p } = setup(id);
    const base = p.speedMul(); p.adsK = 1;
    assert.ok(Math.abs(p.speedMul() / base - def.ads!.moveMul) < 1e-9, `${id}: velocidade mirando`);
  }
  // as outras estatísticas não mudam: a LONGBOW continua com a luneta de antes
  assert.equal(WEAPONS.sniper.zoom, 0.28);
  assert.equal(WEAPONS.sniper.ads, undefined);
});
