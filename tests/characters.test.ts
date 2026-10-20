// Rodada 11b: personagens no estilo de blocos — pivôs no lugar, volume igual ao hitbox, orçamento e malha limpa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterGeometry, characterAssembled, CHAR_BUDGET, CHAR_PIVOTS, CharPart } from '../client/src/entities/characters';
import { STRIDE, MeshBuilder } from '../client/src/render/mesh';
import { Player, hitboxes } from '../shared/sim/player';
import { V3 } from '../shared/math/vec3';
import type { ClassId } from '../shared/config/classes';
import type { Team } from '../shared/maps/types';

const CLS: ClassId[] = ['runner', 'berserker', 'predator', 'jumper'];
const TEAMS: Team[] = ['blue', 'red'];

function clean(name: string, m: MeshBuilder) {
  assert.ok(m.data.every(Number.isFinite), `${name}: NaN`);
  const d = m.data;
  for (let i = 0; i < d.length; i += STRIDE * 3) {
    const a = [d[i], d[i + 1], d[i + 2]], b = [d[i + STRIDE], d[i + STRIDE + 1], d[i + STRIDE + 2]], c = [d[i + 2 * STRIDE], d[i + 2 * STRIDE + 1], d[i + 2 * STRIDE + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    assert.ok(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 2e-6, `${name}: triângulo degenerado`);
  }
}

test('characters: triangle budget (near and far) and no degenerate triangles, for the 4 classes × 2 teams', () => {
  for (const cls of CLS) for (const team of TEAMS) for (const lod of ['near', 'mid', 'far'] as const) {
    const g = characterGeometry(team, cls, lod);
    const n = Object.values(g).reduce((s, m) => s + m.triCount, 0);
    assert.ok(n <= CHAR_BUDGET[lod], `${cls}/${team}/${lod}: ${n} triângulos`);
    for (const [k, m] of Object.entries(g)) clean(`${cls}/${team}/${lod}/${k}`, m);
  }
});

test('characters: the pieces keep their pivots (legs at the hip, torso from the hip, head at the neck, arms at the shoulder)', () => {
  const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(2)} (esperado ${b})`);
  for (const cls of CLS) for (const lod of ['near', 'mid', 'far'] as const) {
    const g = characterGeometry('blue', cls, lod);
    for (const leg of ['legL', 'legR'] as CharPart[]) { const b = g[leg].bounds(); near(b.max[1], 0, 0.5, `${cls} ${leg} topo`); near(b.min[1], -32, 0.5, `${cls} ${leg} pé`); }
    const t = g.torso.bounds(); near(t.min[1], 0, 0.5, `${cls} torso base`); assert.ok(t.max[1] <= 28, `${cls} torso topo ${t.max[1]}`);
    const h = g.head.bounds(); assert.ok(h.min[1] >= -1.5 && h.max[1] <= 18, `${cls} cabeça ${h.min[1]}..${h.max[1]}`);
    for (const arm of ['armL', 'armR'] as CharPart[]) { const b = g[arm].bounds(); near(b.max[1], 2, 1.5, `${cls} ${arm} ombro`); near(b.min[1], -27, 1.5, `${cls} ${arm} mão`); }
  }
  // os pivôs de montagem são os do jogo
  assert.deepEqual(CHAR_PIVOTS.legL.t, [-6, 32, 0]); assert.deepEqual(CHAR_PIVOTS.torso.t, [0, 32, 0]); assert.deepEqual(CHAR_PIVOTS.head.t, [0, 57, 0]);
  assert.equal(CHAR_PIVOTS.armR.t[1], 54); assert.equal(CHAR_PIVOTS.armL.t[1], 54);
});

test('characters: body and head fill the same volume as the hitbox (what you see is what you hit)', () => {
  const p = new Player(1, 'x', 'blue', 'runner', false);
  p.phys.pos.set(0, 0, 0);
  const H = { min: new V3(), max: new V3() }, B = { min: new V3(), max: new V3() };
  hitboxes(p, H, B);
  for (const cls of CLS) for (const lod of ['near', 'mid', 'far'] as const) {
    const b = characterAssembled('red', cls, lod, true).bounds();
    const tol = 2.5;
    assert.ok(b.min[0] >= B.min.x - tol && b.max[0] <= B.max.x + tol, `${cls}/${lod}: largura ${b.min[0]}..${b.max[0]}`);
    assert.ok(b.min[2] >= B.min.z - tol && b.max[2] <= B.max.z + tol, `${cls}/${lod}: profundidade ${b.min[2]}..${b.max[2]}`);
    assert.ok(b.min[1] >= -0.5 && b.max[1] <= H.max.y + 2.2, `${cls}/${lod}: altura ${b.min[1]}..${b.max[1]}`);
    assert.ok(b.max[0] - b.min[0] >= 0.8 * (B.max.x - B.min.x), `${cls}/${lod}: estreito demais`);
    assert.ok(b.max[2] - b.min[2] >= 0.75 * (B.max.z - B.min.z), `${cls}/${lod}: raso demais`);
    assert.ok(b.max[1] >= H.max.y - 1.5, `${cls}/${lod}: baixo demais (${b.max[1]})`);
    // a cabeça fica dentro do hitbox da cabeça
    const hb = characterGeometry('red', cls, lod).head.bounds();
    const hmin = [hb.min[0], hb.min[1] + 57, hb.min[2]], hmax = [hb.max[0], hb.max[1] + 57, hb.max[2]];
    assert.ok(hmin[0] >= H.min.x - 1 && hmax[0] <= H.max.x + 1 && hmin[2] >= H.min.z - 1 && hmax[2] <= H.max.z + 1, `${cls}/${lod}: cabeça fora do hitbox em planta`);
    assert.ok(hmin[1] >= H.min.y - 3.5 && hmax[1] <= H.max.y + 2.2, `${cls}/${lod}: cabeça ${hmin[1]}..${hmax[1]}`);
  }
});

test('characters: team color is on big plates (helmet, vest, shoulders) and each class has its own detail', () => {
  const colorShare = (m: MeshBuilder, rgb: number) => {
    const r = ((rgb >> 16) & 255) / 255, g = ((rgb >> 8) & 255) / 255, b = (rgb & 255) / 255;
    let n = 0; for (let i = 0; i < m.data.length; i += STRIDE) if (Math.abs(m.data[i + 6] - r) < 1e-3 && Math.abs(m.data[i + 7] - g) < 1e-3 && Math.abs(m.data[i + 8] - b) < 1e-3) n++;
    return n / (m.data.length / STRIDE);
  };
  for (const cls of CLS) {
    const blue = characterGeometry('blue', cls), red = characterGeometry('red', cls);
    for (const part of ['torso', 'head', 'armL'] as CharPart[]) assert.ok(colorShare(blue[part], 0x2f7bff) > 0.1 && colorShare(red[part], 0xff4757) > 0.1, `${cls} ${part}: pouca cor do time`);
  }
  const tris = CLS.map((c) => characterGeometry('blue', c).torso.triCount);
  assert.equal(new Set(tris).size, 4, 'cada classe tem um torso diferente');
});
