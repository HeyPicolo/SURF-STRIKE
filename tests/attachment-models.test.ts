// Rodada 12b: attachments nos modelos (pontos de montagem, peça padrão escondida, orçamento, visada das miras).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, STRIDE } from '../client/src/render/mesh';
import { weaponGeometry } from '../client/src/entities/geometry';
import { MOUNTS, BARRELS, muzzleRef, sightRef, laserRef, drawAttachment, barrelFor } from '../client/src/entities/attachGeometry';
import { TRI_BUDGET, WEAPON_REFS } from '../client/src/entities/style';
import { adsPose, VM_SCALE } from '../client/src/game/adsPose';
import { ATTACHMENTS, MAX_ATTACHMENTS, WEAPON_ATTACHMENTS, AttachSlot } from '../shared/config/attachments';
import { PROGRESSION_WEAPONS, ProgWeaponId } from '../shared/config/progression';
import { Build, weaponSlots } from '../shared/sim/loadout';

const MOUNTED: AttachSlot[] = ['optic', 'laser', 'underbarrel', 'stock', 'magazine'];

function tris(m: MeshBuilder) {
  const d = m.data, out: { p: number[][]; color: number[]; em: number }[] = [];
  for (let i = 0; i < d.length; i += STRIDE * 3) out.push({ p: [0, 1, 2].map((k) => [d[i + k * STRIDE], d[i + k * STRIDE + 1], d[i + k * STRIDE + 2]]), color: [d[i + 6], d[i + 7], d[i + 8]], em: d[i + 9] });
  return out;
}
function checkClean(name: string, m: MeshBuilder) {
  assert.ok(m.data.every(Number.isFinite), `${name}: NaN`);
  for (const { p: [a, b, c] } of tris(m)) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    assert.ok(area > 1e-6, `${name}: triângulo degenerado em ${JSON.stringify(a)}`);
  }
}
const list = (w: ProgWeaponId) => WEAPON_ATTACHMENTS[w].map((a) => a.id);
function* allBuilds(w: ProgWeaponId): Generator<Build> {
  const slots = weaponSlots(w), by = slots.map((s) => list(w).filter((id) => ATTACHMENTS[id].slot === s));
  const cur: Build = {};
  function* rec(i: number, n: number): Generator<Build> {
    if (i === slots.length) { yield { ...cur }; return; }
    yield* rec(i + 1, n);
    if (n >= MAX_ATTACHMENTS) return;
    for (const id of by[i]) { cur[slots[i]] = id; yield* rec(i + 1, n + 1); delete cur[slots[i]]; }
  }
  yield* rec(0, 0);
}

test('pontos de montagem: toda categoria de cada arma tem onde prender, perto da arma', () => {
  for (const w of PROGRESSION_WEAPONS) {
    const b = weaponGeometry(w, 'view').bounds();
    for (const s of weaponSlots(w)) {
      if (s === 'barrel' || s === 'muzzle' || s === 'rearGrip') { assert.ok(BARRELS[w], `${w}: sem cano`); continue; }
      const mt = MOUNTS[w][s];
      assert.ok(mt, `${w}: sem ponto de montagem para ${s}`);
      for (let k = 0; k < 3; k++) assert.ok(mt!.p[k] >= b.min[k] - 3 && mt!.p[k] <= b.max[k] + 3, `${w}.${s} fora da arma (${mt!.p})`);
    }
  }
});

test('peça padrão some quando o build troca a categoria; a peça nova aparece', () => {
  for (const w of PROGRESSION_WEAPONS) {
    const base: string[] = [];
    weaponGeometry(w, 'view', {}, base);
    for (const id of list(w)) {
      const slot = ATTACHMENTS[id].slot, parts: string[] = [];
      weaponGeometry(w, 'view', { [slot]: id }, parts);
      assert.ok(parts.includes('att:' + id), `${w}/${id}: peça não desenhada`);
      assert.ok(!parts.includes('default:' + slot), `${w}/${id}: a peça padrão de ${slot} continua`);
      // as outras categorias continuam com a padrão
      for (const d of base) if (d !== 'default:' + slot) assert.ok(parts.includes(d), `${w}/${id}: sumiu ${d}`);
    }
  }
});

test('orçamento: toda combinação ≤ 2500 triângulos em primeira pessoa e ≤ 800 perto; sem triângulos degenerados', () => {
  let n = 0;
  for (const w of PROGRESSION_WEAPONS) {
    for (const id of list(w)) for (const lod of ['view', 'world'] as const) checkClean(`${w}/${id}/${lod}`, weaponGeometry(w, lod, { [ATTACHMENTS[id].slot]: id }));
    for (const b of allBuilds(w)) {
      if (Object.keys(b).length < MAX_ATTACHMENTS - 1) continue; // as maiores (4 e 5 peças)
      n++;
      const v = weaponGeometry(w, 'view', b).triCount, wd = weaponGeometry(w, 'world', b).triCount;
      assert.ok(v <= TRI_BUDGET.view, `${w} ${JSON.stringify(b)}: ${v} triângulos`);
      assert.ok(wd <= TRI_BUDGET.worldBuild, `${w} ${JSON.stringify(b)}: ${wd} triângulos (perto)`);
    }
    // a versão longe ignora o build
    assert.equal(weaponGeometry(w, 'far', { muzzle: 'supp' }).triCount, weaponGeometry(w, 'far').triCount);
  }
  assert.ok(n > 1000, `combinações: ${n}`);
});

test('miras: a retícula/lente fica no centro da linha de visada e o ADS a põe no eixo da câmera', () => {
  const RED = [255 / 255, 59 / 255, 48 / 255], LENS = [0x3b / 255, 0x4f / 255, 0x63 / 255];
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  for (const w of PROGRESSION_WEAPONS) for (const id of list(w).filter((a) => ATTACHMENTS[a].slot === 'optic')) {
    const m = new MeshBuilder();
    drawAttachment(m, w, 'optic', id, true);
    const t = tris(m);
    const ret = t.filter((x) => x.em > 0.5 && near(x.color, RED));
    const THERM = [0xff / 255, 0x8a / 255, 0x3d / 255];
    const lens = t.filter((x) => near(x.color, LENS) || near(x.color, THERM));
    const pts = (ret.length ? ret : lens).flatMap((x) => x.p);
    assert.ok(pts.length > 0, `${w}/${id}: sem retícula nem lente`);
    const mid = (k: number) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2, cx = mid(0), cy = mid(1);
    assert.ok(Math.abs(cx) < 0.05, `${w}/${id}: retícula fora do centro em x (${cx})`);
    if (w === 'sniper') { assert.ok(Math.abs(cy - WEAPON_REFS.sniper.scopeY!) < 0.05, `${w}/${id}: lente fora do eixo da luneta (${cy})`); continue; }
    const s = sightRef(w, { optic: id })!;
    assert.ok(Math.abs(cy - s.y) < 0.05, `${w}/${id}: retícula em y ${cy.toFixed(2)}, visada ${s.y.toFixed(2)}`);
    const a = adsPose(w, { optic: id })!;
    assert.ok(Math.abs(a.y + VM_SCALE * s.y) < 1e-9 && a.x === 0, `${w}/${id}: ADS fora do eixo`);
    // a mira fica acima das miras de ferro (não tapa a retícula)
    assert.ok(s.y >= (WEAPON_REFS[w].sight?.y ?? 0) - 1e-9 || w === 'smg', `${w}/${id}: retícula abaixo da massa`);
  }
});

test('boca e laser: o tiro sai da ponta do cano/peça do build; o laser fica no lado visível', () => {
  for (const w of PROGRESSION_WEAPONS) {
    const z0 = muzzleRef(w).z;
    assert.ok(Math.abs(z0 - WEAPON_REFS[w].muzzle.z) <= 1.2, `${w}: boca padrão mudou (${z0})`);
    if (list(w).includes('long')) assert.ok(muzzleRef(w, { barrel: 'long' }).z < z0);
    if (list(w).includes('short')) assert.ok(muzzleRef(w, { barrel: 'short' }).z > z0);
    if (list(w).includes('supp')) assert.ok(muzzleRef(w, { muzzle: 'supp' }).z < z0 - 4);
    assert.ok(barrelFor(w, { barrel: 'heavy' }).r >= barrelFor(w).r);
    assert.equal(laserRef(w), null);
    for (const l of list(w).filter((a) => ATTACHMENTS[a].slot === 'laser')) {
      const p = laserRef(w, { laser: l })!;
      assert.ok(p && (p[0] < 0 || w === 'pistol'), `${w}/${l}: laser fora do lado esquerdo`);
    }
  }
});
