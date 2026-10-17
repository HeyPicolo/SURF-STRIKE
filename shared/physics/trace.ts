import { V3 } from '../math/vec3';
import type { Brush, Plane } from './brush';

/** Quake/Source-style distance epsilon: keeps the box slightly off surfaces to avoid getting stuck. */
export const DIST_EPSILON = 0.03125;

export interface TraceResult {
  fraction: number;
  endPos: V3;
  normal: V3;
  startSolid: boolean;
  allSolid: boolean;
  brush: Brush | null;
}

export function newTrace(): TraceResult {
  return { fraction: 1, endPos: new V3(), normal: new V3(), startSolid: false, allSolid: false, brush: null };
}

/**
 * Collision world: a list of convex brushes with a uniform XZ grid for broad-phase.
 */
export class CollisionWorld {
  readonly brushes: Brush[];
  private cell = 512;
  private grid = new Map<number, Brush[]>();
  private big: Brush[] = []; // brushes spanning many cells
  private stamp = 0;
  private marks = new Map<number, number>();

  constructor(brushes: Brush[]) {
    this.brushes = brushes.filter((b) => !b.noCollide);
    for (const b of this.brushes) {
      const x0 = Math.floor(b.min.x / this.cell), x1 = Math.floor(b.max.x / this.cell);
      const z0 = Math.floor(b.min.z / this.cell), z1 = Math.floor(b.max.z / this.cell);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) { this.big.push(b); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = this.key(x, z);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(b);
      }
    }
  }

  private key(x: number, z: number) { return (x + 4096) * 8192 + (z + 4096); }

  /** Gather brushes overlapping an AABB. */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Brush[]): Brush[] {
    out.length = 0;
    this.stamp++;
    const x0 = Math.floor(minX / this.cell), x1 = Math.floor(maxX / this.cell);
    const z0 = Math.floor(minZ / this.cell), z1 = Math.floor(maxZ / this.cell);
    const test = (b: Brush) => {
      if (this.marks.get(b.id) === this.stamp) return;
      this.marks.set(b.id, this.stamp);
      if (b.max.x < minX || b.min.x > maxX || b.max.y < minY || b.min.y > maxY || b.max.z < minZ || b.min.z > maxZ) return;
      out.push(b);
    };
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) {
      for (const b of this.brushes) test(b);
      return out;
    }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.grid.get(this.key(x, z));
      if (arr) for (const b of arr) test(b);
    }
    for (const b of this.big) test(b);
    return out;
  }

  private tmp: Brush[] = [];

  /**
   * Sweep an axis-aligned box (mins/maxs relative to the origin) from start to end.
   * Continuous: no tunnelling regardless of speed.
   */
  traceBox(start: V3, end: V3, mins: V3, maxs: V3, out: TraceResult = newTrace(), ignoreKind?: string): TraceResult {
    out.fraction = 1; out.startSolid = false; out.allSolid = false; out.brush = null; out.normal.set(0, 0, 0);
    const pad = 1;
    const list = this.query(
      Math.min(start.x, end.x) + mins.x - pad, Math.min(start.y, end.y) + mins.y - pad, Math.min(start.z, end.z) + mins.z - pad,
      Math.max(start.x, end.x) + maxs.x + pad, Math.max(start.y, end.y) + maxs.y + pad, Math.max(start.z, end.z) + maxs.z + pad,
      this.tmp,
    );
    for (const b of list) {
      if (ignoreKind && b.kind === ignoreKind) continue;
      clipBoxToBrush(start, end, mins, maxs, b, out);
      if (out.allSolid) break;
    }
    if (out.fraction === 1) out.endPos.copy(end);
    else out.endPos.set(
      start.x + (end.x - start.x) * out.fraction,
      start.y + (end.y - start.y) * out.fraction,
      start.z + (end.z - start.z) * out.fraction,
    );
    return out;
  }

  private zero = new V3();
  traceRay(start: V3, end: V3, out: TraceResult = newTrace(), ignoreKind?: string): TraceResult {
    return this.traceBox(start, end, this.zero, this.zero, out, ignoreKind);
  }

  /** True if the box at `pos` overlaps any solid. */
  boxSolid(pos: V3, mins: V3, maxs: V3): boolean {
    const t = this.traceBox(pos, pos, mins, maxs);
    return t.startSolid;
  }
}

const ofs = new V3();

/** Port of the classic CM_ClipBoxToBrush algorithm (written from scratch). */
export function clipBoxToBrush(start: V3, end: V3, mins: V3, maxs: V3, brush: Brush, trace: TraceResult): void {
  let enterFrac = -1, leaveFrac = 1;
  let clipPlane: Plane | null = null;
  let getOut = false, startOut = false;
  for (const p of brush.planes) {
    const n = p.n;
    // support offset of the box along -n
    ofs.x = n.x < 0 ? maxs.x : mins.x;
    ofs.y = n.y < 0 ? maxs.y : mins.y;
    ofs.z = n.z < 0 ? maxs.z : mins.z;
    const dist = p.d - (ofs.x * n.x + ofs.y * n.y + ofs.z * n.z);
    const d1 = start.x * n.x + start.y * n.y + start.z * n.z - dist;
    const d2 = end.x * n.x + end.y * n.y + end.z * n.z - dist;
    if (d2 > 0) getOut = true;
    if (d1 > 0) startOut = true;
    if (d1 > 0 && d2 >= d1) return; // fully in front of this plane
    if (d1 <= 0 && d2 <= 0) continue;
    if (d1 > d2) {
      const f = (d1 - DIST_EPSILON) / (d1 - d2);
      if (f > enterFrac) { enterFrac = f; clipPlane = p; }
    } else {
      const f = (d1 + DIST_EPSILON) / (d1 - d2);
      if (f < leaveFrac) leaveFrac = f;
    }
  }
  if (!startOut) {
    trace.startSolid = true;
    if (!getOut) { trace.allSolid = true; trace.fraction = 0; trace.brush = brush; }
    return;
  }
  if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < trace.fraction && clipPlane) {
    if (enterFrac < 0) enterFrac = 0;
    trace.fraction = enterFrac;
    trace.normal.copy(clipPlane.n);
    trace.brush = brush;
  }
}

/** Ray vs axis-aligned box (absolute min/max). Returns entry distance fraction or -1. */
export function rayAabb(o: V3, d: V3, maxT: number, min: V3, max: V3): number {
  let tmin = 0, tmax = maxT;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const mn = a === 0 ? min.x : a === 1 ? min.y : min.z;
    const mx = a === 0 ? max.x : a === 1 ? max.y : max.z;
    if (Math.abs(da) < 1e-9) {
      if (oa < mn || oa > mx) return -1;
    } else {
      let t1 = (mn - oa) / da, t2 = (mx - oa) / da;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
