// Rodada 10: modelos no estilo de blocos (armas, balisong, granadas, itens, luvas) — sem GL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, triangulate, STRIDE } from '../client/src/render/mesh';
import { weaponGeometry, butterflyGeometry, nadeGeometry, pickupGeometry, gunGloveGeometry, knifeGloveGeometry, MODEL_LIST } from '../client/src/entities/geometry';
import { TRI_BUDGET, WEAPON_REFS, PALETTES } from '../client/src/entities/style';
import { trs, perspective, multiply, mat4, Mat4 } from '../client/src/render/glm';
import { WEAPONS, WeaponId } from '../shared/config/weapons';

const IDS = Object.keys(WEAPONS) as WeaponId[];

/** Caixas envolventes dos modelos da rodada 9 (antes do estilo novo): o tamanho na mão não pode mudar mais de 15%. */
const OLD_BOUNDS: Record<WeaponId, [[number, number, number], [number, number, number]]> = {
  knife: [[-1.41, -1.3, -16.6], [1.86, 1.25, 13.6]],
  pistol: [[-1.7, -7, -15], [1.7, 4, 3]],
  rifle: [[-1.9, -9, -32], [1.9, 7, 16]],
  smg: [[-1.9, -11, -19], [1.9, 5, 13]],
  shotgun: [[-2.2, -6, -36], [2.2, 5, 18]],
  sniper: [[-1.9, -7, -42], [1.9, 9, 22]],
  taser: [[-1.9, -7.5, -13.6], [1.9, 4.2, 3]],
};

/** Fração da tela coberta pela arma + mão em primeira pessoa antes do estilo novo (mesma projeção do jogo). */
const OLD_COVERAGE: Record<Exclude<WeaponId, 'knife'>, number> = { sniper: 0.0724, rifle: 0.0563, smg: 0.0413, shotgun: 0.0572, pistol: 0.0302, taser: 0.0311 };
const OLD_KNIFE_COVERAGE = 0.0354;

function triangles(m: MeshBuilder) {
  const d = m.data, out: number[][][] = [];
  for (let i = 0; i < d.length; i += STRIDE * 3) out.push([0, 1, 2].map((k) => [d[i + k * STRIDE], d[i + k * STRIDE + 1], d[i + k * STRIDE + 2]]));
  return out;
}

function checkClean(name: string, m: MeshBuilder) {
  assert.ok(m.triCount > 0, `${name}: vazio`);
  assert.ok(m.data.every(Number.isFinite), `${name}: NaN/Infinity`);
  for (const [a, b, c] of triangles(m)) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    assert.ok(area > 1e-6, `${name}: triângulo degenerado em ${JSON.stringify(a)}`);
  }
}

/** Rasteriza malhas na projeção do viewmodel (65°, 16:9) e devolve a fração da tela coberta. */
function coverage(parts: [Float32Array, Mat4][], W = 320, H = 180) {
  const P = perspective(mat4(), (65 * Math.PI) / 180, 16 / 9, 0.5, 400), grid = new Uint8Array(W * H);
  for (const [d, M] of parts) {
    const T = multiply(mat4(), P, M);
    const pr = (i: number) => {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      const cw = T[3] * x + T[7] * y + T[11] * z + T[15];
      return [((T[0] * x + T[4] * y + T[8] * z + T[12]) / cw * 0.5 + 0.5) * W, (1 - ((T[1] * x + T[5] * y + T[9] * z + T[13]) / cw * 0.5 + 0.5)) * H];
    };
    for (let t = 0; t < d.length; t += STRIDE * 3) {
      const a = pr(t), b = pr(t + STRIDE), c = pr(t + STRIDE * 2);
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area, w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) grid[y * W + x] = 1;
      }
    }
  }
  return grid.reduce((s, v) => s + v, 0) / (W * H);
}

test('triangle budget: weapons ≤2500 in first person, ≤600 on the ground/third person, ≤150 far away; items ≤600 / ≤150', () => {
  for (const id of IDS) {
    assert.ok(weaponGeometry(id, 'view').triCount <= TRI_BUDGET.view, `${id} view ${weaponGeometry(id, 'view').triCount}`);
    assert.ok(weaponGeometry(id, 'world').triCount <= TRI_BUDGET.world, `${id} world ${weaponGeometry(id, 'world').triCount}`);
    assert.ok(weaponGeometry(id, 'far').triCount <= TRI_BUDGET.far, `${id} far ${weaponGeometry(id, 'far').triCount}`);
  }
  const bf = butterflyGeometry();
  assert.ok(bf.blade.triCount + bf.safe.triCount + bf.bite.triCount + knifeGloveGeometry().triCount <= TRI_BUDGET.view);
  for (const k of ['he', 'smoke', 'impulse'] as const) {
    assert.ok(nadeGeometry(k, 'view').triCount <= TRI_BUDGET.view);
    assert.ok(nadeGeometry(k, 'world').triCount <= TRI_BUDGET.world, `granada ${k}`);
    assert.ok(nadeGeometry(k, 'far').triCount <= TRI_BUDGET.far, `granada ${k} longe`);
  }
  for (const k of ['ammo', 'medkit', 'armor', 'shield', 'speed', 'nade_he', 'nade_smoke', 'nade_impulse'] as const) {
    assert.ok(pickupGeometry(k).triCount <= TRI_BUDGET.world, `${k} ${pickupGeometry(k).triCount}`);
    assert.ok(pickupGeometry(k, 'far').triCount <= TRI_BUDGET.far, `${k} longe ${pickupGeometry(k, 'far').triCount}`);
  }
  assert.ok(gunGloveGeometry().triCount + weaponGeometry('sniper', 'view').triCount <= TRI_BUDGET.view + 600, 'luva + LONGBOW');
});

test('no degenerate triangles or NaN in any model (both detail levels)', () => {
  for (const e of MODEL_LIST) for (const lod of e.lods) checkClean(`${e.id}/${lod}`, e.build(lod));
  const bf = butterflyGeometry();
  checkClean('blade', bf.blade); checkClean('safe', bf.safe); checkClean('bite', bf.bite);
});

test('weapon bounding boxes stay within ±15% of the previous models (same size in the hand)', () => {
  for (const id of IDS) for (const lod of ['view', 'world', 'far'] as const) {
    const b = weaponGeometry(id, lod).bounds(), [mn, mx] = OLD_BOUNDS[id];
    for (let k = 0; k < 3; k++) {
      const size = mx[k] - mn[k], ax = 'xyz'[k];
      assert.ok(Math.abs(b.min[k] - mn[k]) <= 0.15 * size, `${id}/${lod} min ${ax}: ${b.min[k].toFixed(2)} (antes ${mn[k]})`);
      assert.ok(Math.abs(b.max[k] - mx[k]) <= 0.15 * size, `${id}/${lod} max ${ax}: ${b.max[k].toFixed(2)} (antes ${mx[k]})`);
    }
  }
});

test('first person: weapon + glove do not cover more of the screen than before', () => {
  const gun = trs(mat4(), 9, -9.5, -21, -0.06, 0, 0, 0.72), glove = gunGloveGeometry().toArray();
  for (const id of Object.keys(OLD_COVERAGE) as (keyof typeof OLD_COVERAGE)[]) {
    const c = coverage([[weaponGeometry(id, 'view').toArray(), gun], [glove, gun]]);
    assert.ok(c <= OLD_COVERAGE[id] * 1.01, `${id}: ${(c * 100).toFixed(2)}% da tela (antes ${(OLD_COVERAGE[id] * 100).toFixed(2)}%)`);
  }
  const knife = trs(mat4(), 7.5, -8.3, -17, 0.12, 0.12, -0.35, 0.95), bf = butterflyGeometry();
  const ck = coverage([[bf.blade.toArray(), knife], [bf.safe.toArray(), knife], [bf.bite.toArray(), knife], [knifeGloveGeometry().toArray(), knife]]);
  assert.ok(ck <= OLD_KNIFE_COVERAGE * 1.01, `balisong: ${(ck * 100).toFixed(2)}%`);
});

test('balisong: three separate parts with the pivots at the origin (blade to −Z, handles to +Z, safe on +X, bite on −X)', () => {
  const { blade, safe, bite } = butterflyGeometry();
  const nearPin = (m: MeshBuilder) => triangles(m).some((t) => t.some((p) => Math.hypot(p[1], p[2]) < 0.5));
  for (const [name, m] of [['blade', blade], ['safe', safe], ['bite', bite]] as const) {
    const b = m.bounds();
    for (let k = 0; k < 3; k++) assert.ok(b.min[k] <= 0 && b.max[k] >= 0 || k === 0, `${name}: pivô fora da peça no eixo ${'xyz'[k]}`);
    assert.ok(nearPin(m), `${name}: sem pino na origem`);
  }
  assert.ok(blade.bounds().min[2] < -15 && blade.bounds().max[2] <= 1, 'lâmina para −Z');
  for (const h of [safe, bite]) assert.ok(h.bounds().max[2] > 12 && h.bounds().min[2] >= -1, 'cabo para +Z');
  assert.ok(safe.bounds().min[0] > 0.2 && bite.bounds().max[0] < -0.2, 'safe em +X, bite em −X');
  assert.ok(Math.abs(blade.bounds().min[0]) <= 0.4 && Math.abs(blade.bounds().max[0]) <= 0.4, 'lâmina cabe entre os cabos');
});

test('reference points: muzzle at the front of each gun, scope axis on the LONGBOW', () => {
  for (const id of Object.keys(WEAPON_REFS) as (keyof typeof WEAPON_REFS)[]) {
    const b = weaponGeometry(id, 'view').bounds(), mz = WEAPON_REFS[id].muzzle;
    assert.ok(Math.abs(b.min[2] - mz.z) <= 1.5, `${id}: boca em z ${mz.z}, frente do modelo em ${b.min[2].toFixed(2)}`);
    assert.ok(mz.y > b.min[1] && mz.y < b.max[1], `${id}: altura da boca`);
  }
  const sy = WEAPON_REFS.sniper.scopeY!;
  const scope = triangles(weaponGeometry('sniper', 'view')).filter((t) => t.every((p) => Math.abs(p[1] - sy) < 1.2 && Math.abs(p[0]) < 1.2) && Math.min(...t.map((p) => p[2])) < -9 && Math.max(...t.map((p) => p[2])) > -9);
  assert.ok(scope.length > 0, 'tubo da luneta no eixo scopeY');
});

test('style: each weapon keeps its identification color (WEAPONS[id].color) in its palette', () => {
  for (const id of IDS) {
    const p = PALETTES[id], c = WEAPONS[id].color;
    assert.ok([p.body, p.dark, p.accent, p.bolt].includes(c), `${id}: cor ${c.toString(16)} fora da paleta`);
  }
});

test('mesh primitives: ear clipping of concave profiles, chamfered boxes and tape bands', () => {
  const chevron: [number, number][] = [[-6.5, 2.4], [0, 8.9], [6.5, 2.4], [6.5, 5.6], [0, 12.1], [-6.5, 5.6]];
  assert.equal(triangulate(chevron).length, 4);
  assert.equal(triangulate([[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]]).length, 3, 'vértice colinear sai sem triângulo degenerado');
  const m = new MeshBuilder();
  m.chamferBox(0, 0, 0, 2, 1, 4, 0xffffff, 0.2);
  assert.equal(m.triCount, 28);
  const b = new MeshBuilder(); b.minChamfer = 0.38; b.chamferBox(0, 0, 0, 2, 1, 4, 0xffffff, 0.2);
  assert.equal(b.triCount, 12, 'versão simplificada sem chanfro pequeno');
  const t = new MeshBuilder(); t.tapeBox('z', -1, -1, 0, 1, 1, 2, 0x2d5cb3, 2);
  const tb = t.bounds();
  assert.ok(tb.max[0] > 1 && tb.min[1] < -1, 'fita fica por cima da peça');
});

test('faces point out of the solids (weapons and items are drawn with back-face culling)', () => {
  // volume com sinal de uma malha fechada: positivo só se todas as faces olham para fora
  const vol = (m: MeshBuilder) => triangles(m).reduce((v, [a, b, c]) => v + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
  const allOut = (m: MeshBuilder, ctr: [number, number, number]) => triangles(m).every(([a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const g = [(a[0] + b[0] + c[0]) / 3 - ctr[0], (a[1] + b[1] + c[1]) / 3 - ctr[1], (a[2] + b[2] + c[2]) / 3 - ctr[2]];
    return n[0] * g[0] + n[1] * g[1] + n[2] * g[2] > -1e-9;
  });
  const cases: [string, (m: MeshBuilder) => void, [number, number, number], boolean][] = [
    ['box', (m) => m.box(-1, -2, -3, 1, 2, 3, 0), [0, 0, 0], true],
    ['chamferBox z', (m) => m.chamferBox(-1, -2, -3, 1, 2, 3, 0, 0.4), [0, 0, 0], true],
    ['chamferBox x', (m) => m.chamferBox(-1, -2, -3, 1, 2, 3, 0, 0.4, 'x'), [0, 0, 0], true],
    ['tube y (afunilado)', (m) => m.tube('y', [0, 0, 0], 2, -1, 1, 0, 8, { r2: 1 }), [0, 0, 0], true],
    ['tube z invertido', (m) => m.tube('z', [0, 0, 0], 1, 2, -2, 0, 6), [0, 0, 0], true],
    ['prism côncavo', (m) => m.prism('z', [[-6.5, 2.4], [0, 8.9], [6.5, 2.4], [6.5, 5.6], [0, 12.1], [-6.5, 5.6]], -1, 1, 0), [0, 7, 0], false],
    ['slabX (lâmina)', (m) => m.slabX([[0.6, 1.1, 0.3], [-9.5, 1.25, 0.3], [-16.6, -0.2, 0.04], [-1.5, -1.3, 0.04], [0.6, -0.9, 0.25]], 0), [0, 0, -5], false],
    ['espelhado e girado', (m) => m.mirrorX(() => m.group([1, 2, 3], [0.3, 0.7, -0.4], () => m.box(-1, -1, -1, 1, 1, 1, 0))), [-1, 2, 3], true],
  ];
  for (const [name, build, ctr, convex] of cases) {
    const m = new MeshBuilder(); build(m);
    assert.ok(vol(m) > 0, `${name}: faces para dentro`);
    if (convex) assert.ok(allOut(m, ctr), `${name}: alguma face para dentro`);
  }
});

