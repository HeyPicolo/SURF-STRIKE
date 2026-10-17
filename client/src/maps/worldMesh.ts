// Builds the static render mesh for a map (brushes + glowing trims + decor).
import type { MapDef } from '../../../shared/maps/types';
import type { Brush } from '../../../shared/physics/brush';
import { MeshBuilder, hexToRgb } from '../render/mesh';

type P = [number, number, number];

function shade(c: number, k: number): [number, number, number] {
  const [r, g, b] = hexToRgb(c);
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

export interface WorldMeshes { opaque: Float32Array; glass: Float32Array; }

export function buildWorldMesh(map: MapDef): WorldMeshes {
  const mb = new MeshBuilder();
  const glass = new MeshBuilder();
  for (const b of map.brushes) {
    if (b.invisible) continue;
    const target = b.kind === 'glass' ? glass : mb;
    addBrush(target, b);
    if (b.edgeGlow !== undefined) addTrims(mb, b);
  }
  for (const d of map.decor) {
    switch (d.kind) {
      case 'cloud': cloud(mb, d.pos.x, d.pos.y, d.pos.z, d.scale, d.rot ?? 0); break;
      case 'island': island(mb, d.pos.x, d.pos.y, d.pos.z, d.scale, d.rot ?? 0); break;
      case 'ring': mb.torus(d.pos.x, d.pos.y, d.pos.z, d.scale, 14, 28, 6, d.color ?? 0xffffff, 1); break;
      case 'pylon': {
        mb.cylinder(d.pos.x, d.pos.y, d.pos.z, 60, 900, 6, 0x4a5368, 0, 40);
        mb.cylinder(d.pos.x, d.pos.y + 900, d.pos.z, 46, 30, 6, d.color ?? 0xffffff, 1);
        break;
      }
    }
  }
  // trigger pads (static base)
  for (const t of map.triggers) {
    const cx = (t.min.x + t.max.x) / 2, cz = (t.min.z + t.max.z) / 2, y = t.min.y + 1;
    const r = Math.min(t.max.x - t.min.x, t.max.z - t.min.z) / 2;
    if (t.kind === 'teleport') {
      mb.cylinder(cx, y - 1, cz, r + 14, 6, 10, 0x2d3446);
      mb.ring(cx, y + 6, cz, r - 6, r + 8, 20, t.color, 1);
    } else {
      mb.box(t.min.x, y - 1, t.min.z, t.max.x, y + 5, t.max.z, 0x2d3446);
      // chevrons pointing in the launch direction
      const dx = t.velocity.x, dz = t.velocity.z, l = Math.hypot(dx, dz) || 1;
      const fx = dx / l, fz = dz / l, sx = -fz, sz = fx;
      for (let k = -1; k <= 1; k++) {
        const ox = cx + fx * k * 22, oz = cz + fz * k * 22;
        const tip: P = [ox + fx * 14, y + 7, oz + fz * 14];
        const l1: P = [ox - fx * 6 + sx * 22, y + 7, oz - fz * 6 + sz * 22];
        const r1: P = [ox - fx * 6 - sx * 22, y + 7, oz - fz * 6 - sz * 22];
        mb.tri(l1, tip, r1, t.color, 1);
      }
    }
  }
  return { opaque: mb.toArray(), glass: glass.toArray() };
}

function addBrush(mb: MeshBuilder, b: Brush) {
  for (const f of b.faces) {
    const pts = f.idx.map((i) => [b.verts[i].x, b.verts[i].y, b.verts[i].z] as P);
    // face normal (outward) — color variation by orientation gives the low-poly look
    const a = pts[0], c1 = pts[1], c2 = pts[2];
    const ux = c1[0] - a[0], uy = c1[1] - a[1], uz = c1[2] - a[2];
    const vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2];
    const ny = (uz * vx - ux * vz) / (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) || 1);
    let col = shade(b.color, 1);
    if (ny < -0.5) col = shade(b.color, 0.72);
    else if (b.kind === 'ramp' && ny > 0.05 && ny < 0.7) col = shade(b.color, 1.04);
    mb.poly(pts, col, 0);
  }
}

/** Luminous trims on "top" edges (edges touching an upward-facing face). */
function addTrims(mb: MeshBuilder, b: Brush) {
  const glow = b.edgeGlow!;
  const edges = new Map<string, { a: number; b: number; up: boolean }>();
  for (const f of b.faces) {
    const v0 = b.verts[f.idx[0]], v1 = b.verts[f.idx[1]], v2 = b.verts[f.idx[2]];
    const ny = ((v1.z - v0.z) * (v2.x - v0.x) - (v1.x - v0.x) * (v2.z - v0.z));
    const len = Math.hypot(
      (v1.y - v0.y) * (v2.z - v0.z) - (v1.z - v0.z) * (v2.y - v0.y),
      ny,
      (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x),
    ) || 1;
    const up = ny / len > 0.25;
    for (let i = 0; i < f.idx.length; i++) {
      const a = f.idx[i], c = f.idx[(i + 1) % f.idx.length];
      const k = a < c ? `${a}_${c}` : `${c}_${a}`;
      const e = edges.get(k);
      if (e) e.up = e.up || up; else edges.set(k, { a, b: c, up });
    }
  }
  const center = b.verts.reduce((acc, v) => [acc[0] + v.x / b.verts.length, acc[1] + v.y / b.verts.length, acc[2] + v.z / b.verts.length], [0, 0, 0]);
  const thick = b.kind === 'ramp' ? 5 : 3.2;
  for (const e of edges.values()) {
    if (!e.up) continue;
    const A = b.verts[e.a], B = b.verts[e.b];
    // push slightly outward from the brush center so the trim isn't z-fighting
    const push = (v: { x: number; y: number; z: number }): P => {
      const dx = v.x - center[0], dy = v.y - center[1], dz = v.z - center[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      return [v.x + dx / l * 2.5, v.y + dy / l * 2.5, v.z + dz / l * 2.5];
    };
    mb.beam(push(A), push(B), thick, glow, 1);
  }
}

function cloud(mb: MeshBuilder, x: number, y: number, z: number, s: number, rot: number) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = rot + i * 1.7;
    const ox = Math.cos(a) * s * 0.6 * (i / n), oz = Math.sin(a) * s * 0.4 * (i / n);
    const r = s * (0.55 + 0.35 * Math.sin(i * 2.1 + rot));
    mb.blob(x + ox, y + (i % 2) * s * 0.12, z + oz, r, r * 0.45, r * 0.8, [0.97, 0.98, 1.0], 0.35, 0.25, i + Math.floor(rot * 100));
  }
}

function island(mb: MeshBuilder, x: number, y: number, z: number, s: number, rot: number) {
  // inverted rock cone + grass cap + a little tower
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const a0 = rot + (i / sides) * Math.PI * 2, a1 = rot + ((i + 1) / sides) * Math.PI * 2;
    const p0: P = [x + Math.cos(a0) * s, y, z + Math.sin(a0) * s], p1: P = [x + Math.cos(a1) * s, y, z + Math.sin(a1) * s];
    mb.tri(p1, p0, [x, y - s * 1.3, z], i % 2 ? 0x8a7a6a : 0x76685b);
    mb.tri(p0, p1, [x, y + s * 0.05, z], 0x7fd18b);
  }
  mb.cylinder(x + s * 0.2, y, z - s * 0.1, s * 0.08, s * 0.6, 6, 0xe9eef6);
  mb.cylinder(x + s * 0.2, y + s * 0.6, z - s * 0.1, s * 0.12, s * 0.15, 6, 0x7c5cff, 0.8, 0);
}
