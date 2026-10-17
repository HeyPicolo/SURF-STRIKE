// Flat-shaded low-poly mesh builder. Vertex layout: pos3, normal3, color3, emissive1 (10 floats).
export const STRIDE = 10;

export function hexToRgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

type P = [number, number, number];

export class MeshBuilder {
  data: number[] = [];

  get vertexCount() { return this.data.length / STRIDE; }

  /** Triangle with automatic flat normal (CCW = front). */
  tri(a: P, b: P, c: P, color: number | [number, number, number], emissive = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const [r, g, bl] = typeof color === 'number' ? hexToRgb(color) : color;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, r, g, bl, emissive);
  }

  /** Convex polygon (fan). */
  poly(pts: P[], color: number | [number, number, number], emissive = 0) {
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], color, emissive);
  }

  quad(a: P, b: P, c: P, d: P, color: number | [number, number, number], emissive = 0) {
    this.tri(a, b, c, color, emissive); this.tri(a, c, d, color, emissive);
  }

  /** Axis-aligned box from min to max. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | [number, number, number], emissive = 0, topColor?: number) {
    const tc = topColor ?? color;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], tc, emissive); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, emissive); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, emissive); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, emissive); // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, emissive); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, emissive); // -x
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
      this.quad(c(a, s0, t0), c(b, s0, t0), c(b, s1, t1), c(a, s1, t1), color, emissive);
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
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), color, emissive);
  }

  toArray(): Float32Array { return new Float32Array(this.data); }
}
