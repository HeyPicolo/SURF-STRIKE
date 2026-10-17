// Minimal mutable 3D vector used by the simulation (Y is up, units are "Source-like" units: 1u ≈ 2.5cm).
export class V3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: V3): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone(): V3 { return new V3(this.x, this.y, this.z); }
  add(v: V3): this { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v: V3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s: number): this { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v: V3, s: number): this { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v: V3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  len(): number { return Math.hypot(this.x, this.y, this.z); }
  lenSq(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  hLen(): number { return Math.hypot(this.x, this.z); }
  normalize(): this { const l = this.len(); if (l > 1e-9) this.scale(1 / l); return this; }
  crossVectors(a: V3, b: V3): this {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  distTo(v: V3): number { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v: V3, t: number): this { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  equals(v: V3, eps = 1e-6): boolean { return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps && Math.abs(this.z - v.z) < eps; }
  toArray(): [number, number, number] { return [this.x, this.y, this.z]; }
  static from(a: readonly number[]): V3 { return new V3(a[0], a[1], a[2]); }
}

export const v3 = (x = 0, y = 0, z = 0) => new V3(x, y, z);

export const DEG = Math.PI / 180;

/** Forward vector for yaw/pitch (radians). yaw=0 looks toward -Z, positive yaw turns left. */
export function forwardFromAngles(yaw: number, pitch: number, out = new V3()): V3 {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function rightFromYaw(yaw: number, out = new V3()): V3 {
  return out.set(Math.cos(yaw), 0, -Math.sin(yaw));
}

export function yawFromDir(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Deterministic PRNG (mulberry32) — used so simulations are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
