import { V3 } from '../math/vec3';

/** Plane: dot(n, p) = d. Normal points out of the solid. */
export interface Plane { n: V3; d: number; }

export type SurfaceKind = 'solid' | 'ramp' | 'glass' | 'bounce';

export interface BrushFace {
  /** Vertex indices (convex polygon, CCW seen from outside). */
  idx: number[];
}

/**
 * A convex solid used for both collision and rendering.
 * Collision planes include the face planes plus axial and edge "bevel" planes,
 * which makes sweeping an axis-aligned box against it exact (Minkowski sum).
 */
export interface Brush {
  id: number;
  verts: V3[];
  faces: BrushFace[];
  planes: Plane[];
  min: V3;
  max: V3;
  color: number;      // 0xRRGGBB albedo
  edgeGlow?: number;  // 0xRRGGBB emissive edge color (rendered as luminous trims)
  kind: SurfaceKind;
  /** Only rendered, not collidable (decor). */
  noCollide?: boolean;
  /** Only collidable, not rendered (clip). */
  invisible?: boolean;
  tag?: string;
  /** Stage/trecho do Surf Skill a que o brush pertence (layout e testes de sobreposição). */
  group?: number;
  /**
   * Normais das tampas internas de uma rampa emendada (juntas de curva): essas tampas encostam na peça
   * vizinha e nunca são parede de verdade (ver Mover.flyMove).
   */
  joints?: Plane[];
  /**
   * Rampa só de surf: em velocidade de surf, os biséis andáveis dela não contam como chão (ver
   * movement.ts). Ligado nas peças de curva e em mapas inteiros que pedem (ZENITH).
   */
  surfOnly?: boolean;
  /**
   * Sólido só para quem foi colocado em cima dele (plataforma de retorno de checkpoint): para quem
   * passa voando, atravessável. Ver CollisionWorld.allowSpawnOnly e PhysState.spawnFloor.
   */
  spawnOnly?: boolean;
}

let nextBrushId = 1;

function faceNormal(verts: V3[], idx: number[]): V3 {
  // Newell's method — robust for any planar polygon
  const n = new V3();
  for (let i = 0; i < idx.length; i++) {
    const a = verts[idx[i]], b = verts[idx[(i + 1) % idx.length]];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

function addSupportPlane(planes: Plane[], verts: V3[], n: V3): void {
  if (n.lenSq() < 1e-8) return;
  n.normalize();
  for (const p of planes) if (p.n.dot(n) > 0.99999) return;
  let d = -Infinity;
  for (const v of verts) d = Math.max(d, v.dot(n));
  planes.push({ n, d });
}

export interface BrushOptions {
  color: number;
  edgeGlow?: number;
  kind?: SurfaceKind;
  noCollide?: boolean;
  invisible?: boolean;
  tag?: string;
}

/** Build a brush from a convex vertex set + face list. Face winding is fixed automatically. */
export function makeBrush(verts: V3[], faces: number[][], opt: BrushOptions): Brush {
  const center = new V3();
  for (const v of verts) center.add(v);
  center.scale(1 / verts.length);

  const outFaces: BrushFace[] = [];
  const planes: Plane[] = [];
  for (const f of faces) {
    let idx = f.slice();
    let n = faceNormal(verts, idx);
    // ensure normal points away from the center
    const toFace = verts[idx[0]].clone().sub(center);
    if (toFace.dot(n) < 0) { idx = idx.reverse(); n = n.scale(-1); }
    outFaces.push({ idx });
    addSupportPlane(planes, verts, n.clone());
  }
  // axial bevels
  const axes = [new V3(1, 0, 0), new V3(-1, 0, 0), new V3(0, 1, 0), new V3(0, -1, 0), new V3(0, 0, 1), new V3(0, 0, -1)];
  for (const a of axes) addSupportPlane(planes, verts, a.clone());
  // edge bevels: cross(edge, axis) for every edge
  const edges: [number, number][] = [];
  for (const f of outFaces) {
    for (let i = 0; i < f.idx.length; i++) {
      const a = f.idx[i], b = f.idx[(i + 1) % f.idx.length];
      if (!edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
    }
  }
  for (const [a, b] of edges) {
    const e = verts[b].clone().sub(verts[a]).normalize();
    for (const ax of axes.slice(0, 6).filter((_, i) => i % 2 === 0)) {
      const c = new V3().crossVectors(e, ax);
      if (c.lenSq() < 1e-6) continue;
      // keep only if it's a genuine supporting plane that touches this edge
      for (const s of [1, -1]) {
        const n = c.clone().normalize().scale(s);
        let d = -Infinity;
        for (const v of verts) d = Math.max(d, v.dot(n));
        if (Math.abs(verts[a].dot(n) - d) < 0.01) addSupportPlane(planes, verts, n);
      }
    }
  }
  const min = new V3(Infinity, Infinity, Infinity), max = new V3(-Infinity, -Infinity, -Infinity);
  for (const v of verts) {
    min.x = Math.min(min.x, v.x); min.y = Math.min(min.y, v.y); min.z = Math.min(min.z, v.z);
    max.x = Math.max(max.x, v.x); max.y = Math.max(max.y, v.y); max.z = Math.max(max.z, v.z);
  }
  return {
    id: nextBrushId++, verts, faces: outFaces, planes, min, max,
    color: opt.color, edgeGlow: opt.edgeGlow, kind: opt.kind ?? 'solid',
    noCollide: opt.noCollide, invisible: opt.invisible, tag: opt.tag,
  };
}

/** Axis-aligned box brush. */
export function boxBrush(min: V3, max: V3, opt: BrushOptions): Brush {
  const v = [
    new V3(min.x, min.y, min.z), new V3(max.x, min.y, min.z), new V3(max.x, max.y, min.z), new V3(min.x, max.y, min.z),
    new V3(min.x, min.y, max.z), new V3(max.x, min.y, max.z), new V3(max.x, max.y, max.z), new V3(min.x, max.y, max.z),
  ];
  const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  return makeBrush(v, f, opt);
}

/** Box centered at c with size s. */
export function boxAt(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, opt: BrushOptions): Brush {
  return boxBrush(new V3(cx - sx / 2, cy - sy / 2, cz - sz / 2), new V3(cx + sx / 2, cy + sy / 2, cz + sz / 2), opt);
}

/**
 * Generic prism: a convex 2D cross-section (points given as [u, v] in a local frame) extruded from
 * `start` to `end`. Local frame: `side` is the horizontal axis perpendicular to the extrusion
 * direction, and v is world up. Cross-sections keep their vertical orientation even when the
 * extrusion slopes (the prism is sheared), so ramp faces stay perfectly planar.
 */
export function prismBrush(start: V3, end: V3, section: [number, number][], opt: BrushOptions): Brush {
  const dir = end.clone().sub(start);
  const flat = new V3(dir.x, 0, dir.z).normalize();
  const side = new V3(-flat.z, 0, flat.x); // perpendicular horizontal
  const verts: V3[] = [];
  for (const base of [start, end]) {
    for (const [u, v] of section) {
      verts.push(new V3(base.x + side.x * u, base.y + v, base.z + side.z * u));
    }
  }
  const n = section.length;
  const faces: number[][] = [];
  faces.push([...Array(n).keys()]);
  faces.push([...Array(n).keys()].map((i) => i + n));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, j + n, i + n]);
  }
  return makeBrush(verts, faces, opt);
}

/**
 * Surf ramp: triangular prism ("ridge") with the apex along the line start→end.
 * `halfWidth` is the horizontal distance from apex to the base edge, `height` the apex height.
 * Slope angle = atan(height / halfWidth). For surfing the angle must be > ~45.6°.
 * `sides` = 'both' (classic ski-style ridge) | 'left' | 'right' (single surfable face + vertical back).
 */
export function rampBrush(
  start: V3, end: V3, halfWidth: number, height: number,
  sides: 'both' | 'left' | 'right', opt: BrushOptions,
): Brush {
  let section: [number, number][];
  if (sides === 'both') section = [[-halfWidth, -height], [halfWidth, -height], [0, 0]];
  else if (sides === 'left') section = [[-halfWidth, -height], [0, -height], [0, 0]];
  else section = [[0, -height], [halfWidth, -height], [0, 0]];
  return prismBrush(start, end, section, { kind: 'ramp', ...opt });
}

export function pointInBrush(b: Brush, p: V3, eps = 0): boolean {
  for (const pl of b.planes) if (pl.n.dot(p) - pl.d > eps) return false;
  return true;
}
