// Flat-shaded low-poly mesh builder. Vertex layout: pos3, normal3, color3, emissive1 (10 floats).
export const STRIDE = 10;

export function hexToRgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

export type P = [number, number, number];
export type P2 = [number, number];
export type Axis = 'x' | 'y' | 'z';
/** Direção de uma face (para parafusos, recortes e trilhos). */
export type Dir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
type Color = number | [number, number, number];
/** Transformação afim: matriz 3×3 (linhas) + translação. */
type Xf = number[];

const IDENT: Xf = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function rotXf(rx: number, ry: number, rz: number): Xf {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz · Ry · Rx (gira em X, depois Y, depois Z)
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
    0, 0, 0,
  ];
}
function compose(a: Xf, b: Xf): Xf {
  // a ∘ b: p → a(b(p))
  const r: Xf = new Array(12).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let i = 0; i < 3; i++) r[9 + i] = a[i * 3] * b[9] + a[i * 3 + 1] * b[10] + a[i * 3 + 2] * b[11] + a[9 + i];
  return r;
}
/** Rotação que leva a normal +X da face local para `d`. */
function faceRot(d: Dir): [number, number, number] {
  switch (d) {
    case '+x': return [0, 0, 0];
    case '-x': return [0, Math.PI, 0];
    case '+y': return [0, 0, Math.PI / 2];
    case '-y': return [0, 0, -Math.PI / 2];
    case '+z': return [0, -Math.PI / 2, 0];
    case '-z': return [0, Math.PI / 2, 0];
  }
}

/** Triangulação por orelhas de um polígono simples (qualquer sentido). Vértices colineares são descartados. */
export function triangulate(pts: P2[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area >= 0 ? 1 : -1;
  const idx = pts.map((_, i) => i);
  const out: [number, number, number][] = [];
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: P2, a: P2, b: P2, c: P2) => {
    const d1 = cross(a, b, p) * sgn, d2 = cross(b, c, p) * sgn, d3 = cross(c, a, p) * sgn;
    return d1 > 1e-9 && d2 > 1e-9 && d3 > 1e-9;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cr = cross(a, b, c) * sgn;
      if (Math.abs(cr) < 1e-7) { idx.splice(k, 1); cut = true; break; } // colinear: some sem triângulo
      if (cr < 0) continue;
      let ok = true;
      for (const j of idx) if (j !== i0 && j !== i1 && j !== i2 && inside(pts[j], a, b, c)) { ok = false; break; }
      if (!ok) continue;
      out.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) {
    const [a, b, c] = idx;
    if (Math.abs(cross(pts[a], pts[b], pts[c])) > 1e-7) out.push([a, b, c]);
  }
  return out;
}

/** Recorta um polígono convexo à faixa v ∈ [v0, v1] (coordenada 1 do ponto). */
export function clipBand(pts: P2[], v0: number, v1: number): P2[] {
  const clip = (poly: P2[], keep: (p: P2) => boolean, cut: (a: P2, b: P2) => P2) => {
    const out: P2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) out.push(cut(a, b));
    }
    return out;
  };
  const at = (v: number) => (a: P2, b: P2): P2 => { const t = (v - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, v]; };
  return clip(clip(pts, (p) => p[1] >= v0, at(v0)), (p) => p[1] <= v1, at(v1));
}

function signedArea(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

function dedupe(pts: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p); }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-6) out.pop();
  return out;
}

/** Ponto 3D de um perfil 2D numa extrusão ao longo do eixo: 'x' → (z, y); 'y' → (x, z); 'z' → (x, y). */
function onAxis(axis: Axis, u: number, v: number, a: number): P {
  return axis === 'x' ? [a, v, u] : axis === 'y' ? [u, a, v] : [u, v, a];
}

export class MeshBuilder {
  data: number[] = [];
  private xf: Xf | null = null;
  /** Chanfros menores que isto viram caixas comuns (versões simplificadas). */
  minChamfer = 0;

  get vertexCount() { return this.data.length / STRIDE; }
  get triCount() { return this.data.length / STRIDE / 3; }

  /** Constrói `fn` num sistema local: posição `t`, rotação (radianos; X, depois Y, depois Z) e escala. */
  group(t: P, rot: [number, number, number] | null, fn: () => void, scale = 1) {
    const prev = this.xf;
    const local = rot ? rotXf(rot[0], rot[1], rot[2]) : IDENT.slice();
    if (scale !== 1) for (let i = 0; i < 9; i++) local[i] *= scale;
    local[9] = t[0]; local[10] = t[1]; local[11] = t[2];
    this.xf = compose(prev ?? IDENT, local);
    try { fn(); } finally { this.xf = prev; }
  }

  /** Espelha em X tudo o que `fn` constrói (peças simétricas dos dois lados). */
  mirrorX(fn: () => void) {
    const prev = this.xf;
    this.xf = compose(prev ?? IDENT, [-1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    try { fn(); } finally { this.xf = prev; }
  }

  private tp(p: P): P {
    const m = this.xf;
    if (!m) return p;
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9], m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10], m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]];
  }

  /**
   * Triangle with automatic flat normal (CCW = front). With `out` (a direction pointing out of the
   * solid, in local coordinates) the winding is fixed so the front face looks out — needed for
   * back-face culling (weapons and items are drawn with culling on).
   */
  tri(a: P, b: P, c: P, color: Color, emissive = 0, out?: P) {
    if (this.xf) { a = this.tp(a); b = this.tp(b); c = this.tp(c); }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (out) {
      const m = this.xf, o: P = m ? [m[0] * out[0] + m[1] * out[1] + m[2] * out[2], m[3] * out[0] + m[4] * out[1] + m[5] * out[2], m[6] * out[0] + m[7] * out[1] + m[8] * out[2]] : out;
      if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const [r, g, bl] = typeof color === 'number' ? hexToRgb(color) : color;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, emissive);
  }

  /** Convex polygon (fan). `out`: see tri(). */
  poly(pts: P[], color: number | [number, number, number], emissive = 0, out?: P) {
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], color, emissive, out);
  }

  quad(a: P, b: P, c: P, d: P, color: number | [number, number, number], emissive = 0, out?: P) {
    this.tri(a, b, c, color, emissive, out); this.tri(a, c, d, color, emissive, out);
  }

  /** Axis-aligned box from min to max. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | [number, number, number], emissive = 0, topColor?: number) {
    const tc = topColor ?? color;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], tc, emissive, [0, 1, 0]); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, emissive, [0, -1, 0]); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, emissive, [0, 0, 1]); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, emissive, [0, 0, -1]); // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, emissive, [1, 0, 0]); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, emissive, [-1, 0, 0]); // -x
  }

  /** Centered box. */
  cbox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number | [number, number, number], emissive = 0) {
    this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, color, emissive);
  }

  /** Low-poly cylinder along Y. */
  cylinder(cx: number, cy: number, cz: number, r: number, h: number, sides: number, color: number, emissive = 0, r2 = r) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0: P = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], p1: P = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
      const q0: P = [cx + Math.cos(a0) * r2, cy + h, cz + Math.sin(a0) * r2], q1: P = [cx + Math.cos(a1) * r2, cy + h, cz + Math.sin(a1) * r2];
      this.quad(p0, q0, q1, p1, color, emissive);
      this.tri([cx, cy + h, cz], q1, q0, color, emissive);
      this.tri([cx, cy, cz], p0, p1, color, emissive);
    }
  }

  /** Icosphere-ish low-poly blob (octahedron subdivided once). */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number | [number, number, number], emissive = 0, jitter = 0, seed = 1) {
    const verts: P[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
    const mid = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      let i = mid.get(k);
      if (i === undefined) {
        const m: P = [(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2];
        const l = Math.hypot(...m); verts.push([m[0] / l, m[1] / l, m[2] / l]); i = verts.length - 1; mid.set(k, i);
      }
      return i;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of faces) { const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pts = verts.map((v) => { const j = 1 + (rnd() - 0.5) * jitter; return [cx + v[0] * rx * j, cy + v[1] * ry * j, cz + v[2] * rz * j] as P; });
    for (const [a, b, c] of faces) this.tri(pts[a], pts[b], pts[c], color, emissive);
  }

  /** Beam (square cross-section) between two points — used for glowing edge trims. */
  beam(a: P, b: P, thick: number, color: number, emissive = 1) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    const d: P = [dx / len, dy / len, dz / len];
    // two perpendicular axes
    const up: P = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u: P = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    const ul = Math.hypot(...u); u = [u[0] / ul * thick, u[1] / ul * thick, u[2] / ul * thick];
    let w: P = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    const wl = Math.hypot(...w); w = [w[0] / wl * thick, w[1] / wl * thick, w[2] / wl * thick];
    const c = (p: P, su: number, sw: number): P => [p[0] + u[0] * su + w[0] * sw, p[1] + u[1] * su + w[1] * sw, p[2] + u[2] * su + w[2] * sw];
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = corners[i], [s1, t1] = corners[(i + 1) % 4];
      const o: P = [u[0] * (s0 + s1) + w[0] * (t0 + t1), u[1] * (s0 + s1) + w[1] * (t0 + t1), u[2] * (s0 + s1) + w[2] * (t0 + t1)];
      this.quad(c(a, s0, t0), c(b, s0, t0), c(b, s1, t1), c(a, s1, t1), color, emissive, o);
    }
  }

  /** Flat ring (annulus) on the XZ plane. */
  ring(cx: number, cy: number, cz: number, r0: number, r1: number, sides: number, color: number, emissive = 1) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (r: number, a: number): P => [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r];
      this.quad(p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0), color, emissive);
      this.quad(p(r1, a0), p(r1, a1), p(r0, a1), p(r0, a0), color, emissive);
    }
  }

  /** Torus standing upright (axis = Z) */
  torus(cx: number, cy: number, cz: number, R: number, r: number, seg: number, sides: number, color: number, emissive = 1, yaw = 0) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const pt = (i: number, j: number): P => {
      const u = (i / seg) * Math.PI * 2, v = (j / sides) * Math.PI * 2;
      const x = (R + r * Math.cos(v)) * Math.cos(u), y = (R + r * Math.cos(v)) * Math.sin(u), z = r * Math.sin(v);
      return [cx + x * cyw + z * syw, cy + y, cz - x * syw + z * cyw];
    };
    const ctr = (i: number): P => { const u = ((i + 0.5) / seg) * Math.PI * 2, x = R * Math.cos(u), y = R * Math.sin(u); return [cx + x * cyw, cy + y, cz - x * syw]; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1), k = ctr(i);
      const o: P = [(a[0] + b[0] + c[0] + d[0]) / 4 - k[0], (a[1] + b[1] + c[1] + d[1]) / 4 - k[1], (a[2] + b[2] + c[2] + d[2]) / 4 - k[2]];
      this.quad(a, b, c, d, color, emissive, o);
    }
  }

  // ---------------------------------------------------------------- primitivas do estilo de blocos

  /** Prisma: perfil 2D (polígono simples, côncavo ou não) extrudado de a0 a a1 ao longo do eixo. */
  prism(axis: Axis, profile: P2[], a0: number, a1: number, color: Color, capColor?: Color, emissive = 0) {
    const pts = dedupe(profile);
    if (pts.length < 3 || Math.abs(a1 - a0) < 1e-6) return;
    const cap = capColor ?? color, dir = Math.sign(a1 - a0);
    const o0 = onAxis(axis, 0, 0, -dir), o1 = onAxis(axis, 0, 0, dir);
    for (const [i, j, k] of triangulate(pts)) {
      this.tri(onAxis(axis, ...pts[i], a0), onAxis(axis, ...pts[j], a0), onAxis(axis, ...pts[k], a0), cap, emissive, o0);
      this.tri(onAxis(axis, ...pts[i], a1), onAxis(axis, ...pts[k], a1), onAxis(axis, ...pts[j], a1), cap, emissive, o1);
    }
    const sg = signedArea(pts) >= 0 ? 1 : -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const o = onAxis(axis, (q[1] - p[1]) * sg, -(q[0] - p[0]) * sg, 0);
      this.quad(onAxis(axis, ...p, a0), onAxis(axis, ...q, a0), onAxis(axis, ...q, a1), onAxis(axis, ...p, a1), color, emissive, o);
    }
  }

  /**
   * Placa de espessura variável no eixo X: perfil (z, y, meia espessura). Usada para lâminas
   * facetadas (o fio fica fino e o dorso grosso). `open` = arestas sem face lateral (emendas internas).
   */
  slabX(pts: [number, number, number][], color: Color, sideColor?: Color, open: number[] = []) {
    const p2: P2[] = pts.map((p) => [p[0], p[1]]);
    for (const [i, j, k] of triangulate(p2)) {
      const A = pts[i], B = pts[j], C = pts[k];
      this.tri([A[2], A[1], A[0]], [B[2], B[1], B[0]], [C[2], C[1], C[0]], color, 0, [1, 0, 0]);
      this.tri([-A[2], A[1], A[0]], [-C[2], C[1], C[0]], [-B[2], B[1], B[0]], color, 0, [-1, 0, 0]);
    }
    const sg = signedArea(p2) >= 0 ? 1 : -1;
    for (let i = 0; i < pts.length; i++) {
      if (open.includes(i)) continue;
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) continue;
      const o: P = [0, -(b[0] - a[0]) * sg, (b[1] - a[1]) * sg];
      this.quad([a[2], a[1], a[0]], [b[2], b[1], b[0]], [-b[2], b[1], b[0]], [-a[2], a[1], a[0]], sideColor ?? color, 0, o);
    }
  }

  /** Caixa com as 4 arestas paralelas ao eixo chanfradas (chanfro c; 0 = caixa comum). */
  chamferBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color, c = 0.35, axis: Axis = 'z', capColor?: Color) {
    const [u0, u1, v0, v1, a0, a1] = axis === 'x' ? [z0, z1, y0, y1, x0, x1] : axis === 'y' ? [x0, x1, z0, z1, y0, y1] : [x0, x1, y0, y1, z0, z1];
    const k = c < this.minChamfer ? 0 : Math.max(0, Math.min(c, (u1 - u0) * 0.45, (v1 - v0) * 0.45));
    const prof: P2[] = k < 1e-4 ? [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
      : [[u0 + k, v0], [u1 - k, v0], [u1, v0 + k], [u1, v1 - k], [u1 - k, v1], [u0 + k, v1], [u0, v1 - k], [u0, v0 + k]];
    this.prism(axis, prof, a0, a1, color, capColor);
  }

  /** Cilindro facetado ao longo de um eixo (r → r2), de a0 a a1. A fase põe uma face plana em cima. */
  tube(axis: Axis, c: P, r: number, a0: number, a1: number, color: Color, sides = 8, opts: { r2?: number; caps?: 'both' | 'none' | 'start' | 'end'; emissive?: number } = {}) {
    const r2 = opts.r2 ?? r, caps = opts.caps ?? 'both', em = opts.emissive ?? 0;
    if (Math.abs(a1 - a0) < 1e-6) return;
    const [cu, cv] = axis === 'x' ? [c[2], c[1]] : axis === 'y' ? [c[0], c[2]] : [c[0], c[1]];
    const ring = (rad: number, a: number) => Array.from({ length: sides }, (_, i) => {
      const t = (i + 0.5) / sides * Math.PI * 2;
      return onAxis(axis, cu + Math.cos(t) * rad, cv + Math.sin(t) * rad, a);
    });
    const A = ring(r, a0), B = ring(r2, a1), dir = Math.sign(a1 - a0);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, t = (i + 1) / sides * Math.PI * 2;
      this.quad(A[i], A[j], B[j], B[i], color, em, onAxis(axis, Math.cos(t), Math.sin(t), 0));
    }
    if (caps === 'both' || caps === 'start') this.poly(A, color, em, onAxis(axis, 0, 0, -dir));
    if (caps === 'both' || caps === 'end') this.poly([...B].reverse(), color, em, onAxis(axis, 0, 0, dir));
  }

  /** Parafuso: cabeça sextavada saindo da superfície no ponto p, na direção d. */
  bolt(p: P, d: Dir, r: number, color: Color) {
    const h = r * 0.55;
    this.group(p, faceRot(d), () => this.tube('x', [0, 0, 0], r, -0.02, h, color, 6, { caps: 'end' }));
  }

  /** Trilho com dentes (picatinny) de z0 a z1, apoiado na face `d` em (cx, cy). */
  rail(cx: number, cy: number, z0: number, z1: number, w: number, color: Color, d: Dir = '+y', opts: { pitch?: number; base?: number; tooth?: number; teeth?: boolean } = {}) {
    const pitch = opts.pitch ?? 1.3, base = opts.base ?? 0.32, tooth = opts.tooth ?? 0.34;
    const rot: [number, number, number] = d === '+y' ? [0, 0, 0] : d === '-y' ? [0, 0, Math.PI] : d === '+x' ? [0, 0, -Math.PI / 2] : [0, 0, Math.PI / 2];
    this.group([cx, cy, 0], rot, () => {
      this.chamferBox(-w / 2, 0, z0, w / 2, base, z1, color, 0.08);
      if (opts.teeth === false) { this.chamferBox(-w / 2 - 0.1, base, z0, w / 2 + 0.1, base + tooth, z1, color, 0.12); return; }
      const n = Math.max(1, Math.floor((z1 - z0) / pitch));
      const off = (z1 - z0 - n * pitch) / 2;
      for (let i = 0; i < n; i++) {
        const a = z0 + off + i * pitch + pitch * 0.18;
        this.box(-w / 2 - 0.12, base, a, w / 2 + 0.12, base + tooth, a + pitch * 0.62, color);
      }
    });
  }

  /**
   * Recorte raso numa face (hexágono ou retângulo): fundo escuro + "parede" de baixo clara, que
   * imita a luz batendo dentro do furo. `shape` em coordenadas da face (horizontal, vertical).
   */
  inset(c: P, d: Dir, shape: P2[], color: Color, lipColor?: Color, lip = 0.22) {
    this.group(c, faceRot(d), () => {
      const s = dedupe(shape);
      this.poly(s.map(([h, v]) => [0.02, v, -h] as P), color, 0, [1, 0, 0]);
      if (!lipColor) return;
      // parede inferior: arestas cujo ponto médio está abaixo do centro
      for (let i = 0; i < s.length; i++) {
        const a = s[i], b = s[(i + 1) % s.length];
        if ((a[1] + b[1]) / 2 >= -1e-6) continue;
        this.quad([0.03, a[1], -a[0]], [0.03, b[1], -b[0]], [0.03, b[1] + lip, -b[0] * 0.92], [0.03, a[1] + lip, -a[0] * 0.92], lipColor, 0, [1, 0, 0]);
      }
    });
  }

  /** Hexágono deitado (pontas para os lados) para recortes de guarda-mão. */
  static hex(r: number, squash = 0.72): P2[] {
    return Array.from({ length: 6 }, (_, i) => { const t = i / 6 * Math.PI * 2; return [Math.cos(t) * r * 1.2, Math.sin(t) * r * squash] as P2; });
  }
  static rect(w: number, h: number): P2[] { return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; }

  /** Fita enrolada numa seção de caixa (bandas um pouco mais grossas que a peça). */
  tapeBox(axis: Axis, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color, bands = 2, e = 0.13) {
    const [a0, a1] = axis === 'x' ? [x0, x1] : axis === 'y' ? [y0, y1] : [z0, z1];
    const gap = 0.07, bw = (a1 - a0 - gap * (bands - 1)) / bands;
    for (let i = 0; i < bands; i++) {
      const s = a0 + i * (bw + gap), t = s + bw, ee = e + (i % 2) * 0.04;
      const g = (lo: number, hi: number, ax: Axis): [number, number] => (ax === axis ? [s, t] : [lo - ee, hi + ee]);
      const [bx0, bx1] = g(x0, x1, 'x'), [by0, by1] = g(y0, y1, 'y'), [bz0, bz1] = g(z0, z1, 'z');
      this.chamferBox(bx0, by0, bz0, bx1, by1, bz1, color, 0.18, axis);
    }
  }

  /** Fita enrolada num cilindro. */
  tapeTube(axis: Axis, c: P, r: number, a0: number, a1: number, color: Color, bands = 2, sides = 8) {
    const gap = 0.07, bw = (a1 - a0 - gap * (bands - 1)) / bands;
    for (let i = 0; i < bands; i++) {
      const s = a0 + i * (bw + gap);
      this.tube(axis, c, r + 0.12 + (i % 2) * 0.04, s, s + bw, color, sides, { caps: 'none' });
    }
  }

  /** Fita num prisma em X (perfil convexo em (z, y)): bandas recortadas na faixa y ∈ [y0, y1], infladas. */
  tapeProfileX(profile: P2[], y0: number, y1: number, x0: number, x1: number, color: Color, bands = 2, e = 0.13) {
    const gap = 0.07, bh = (y1 - y0 - gap * (bands - 1)) / bands;
    for (let i = 0; i < bands; i++) {
      const s = y0 + i * (bh + gap), band = dedupe(clipBand(profile, s, s + bh));
      if (band.length < 3) continue;
      const cz = band.reduce((a, p) => a + p[0], 0) / band.length;
      const ee = e + (i % 2) * 0.04;
      const out = band.map(([z, y]) => [z + Math.sign(z - cz) * ee, y] as P2);
      this.prism('x', out, x0 - ee, x1 + ee, color);
    }
  }

  /** Caixa envolvente (para testes e enquadramento). */
  bounds(): { min: P; max: P } {
    const min: P = [Infinity, Infinity, Infinity], max: P = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.data.length; i += STRIDE) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], this.data[i + k]); max[k] = Math.max(max[k], this.data[i + k]); }
    return { min, max };
  }

  toArray(): Float32Array { return new Float32Array(this.data); }
}
