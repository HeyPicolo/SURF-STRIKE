// Partículas e efeitos visuais (cliente). Simulação simples e barata.
import type { Renderer } from '../render/Renderer';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; color: number; alpha: number; grav: number; drag: number; add: boolean; }
interface Tracer { ax: number; ay: number; az: number; bx: number; by: number; bz: number; life: number; max: number; color: number; width: number; }
interface Decal { x: number; y: number; z: number; nx: number; ny: number; nz: number; life: number; }
interface Ring { x: number; y: number; z: number; r0: number; r1: number; life: number; max: number; color: number; }

export class Effects {
  parts: Particle[] = [];
  tracers: Tracer[] = [];
  decals: Decal[] = [];
  rings: Ring[] = [];
  density = 1;
  enabled = true;

  emit(x: number, y: number, z: number, n: number, o: Partial<Particle> & { speed?: number; spread?: number; dir?: [number, number, number] }) {
    if (!this.enabled && !o.add) n = Math.ceil(n * 0.3);
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 100) * (0.4 + Math.random() * 0.8);
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      if (o.dir) { const s = o.spread ?? 0.5; dx = o.dir[0] + dx * s; dy = o.dir[1] + dy * s; dz = o.dir[2] + dz * s; }
      const max = (o.max ?? 0.6) * (0.6 + Math.random() * 0.8);
      if (this.parts.length > 4000) this.parts.shift();
      this.parts.push({
        x, y, z, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: max, max, size: o.size ?? 10, grow: o.grow ?? 0,
        color: o.color ?? 0xffffff, alpha: o.alpha ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 1.5, add: o.add ?? false,
      });
    }
  }

  tracer(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: number, width = 1.6, life = 0.09) {
    this.tracers.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, life, max: life, color, width });
  }

  /** Arco elétrico em zigue-zague (taser). */
  arc(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: number) {
    const n = 7;
    let px = a.x, py = a.y, pz = a.z;
    for (let i = 1; i <= n; i++) {
      const k = i / n, j = i === n ? 0 : 7;
      const x = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j, y = a.y + (b.y - a.y) * k + (Math.random() - 0.5) * j, z = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j;
      this.tracer({ x: px, y: py, z: pz }, { x, y, z }, color, 1.6, 0.16);
      px = x; py = y; pz = z;
    }
    this.emit(b.x, b.y, b.z, 10, { color, size: 8, speed: 160, max: 0.3, add: true });
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    this.emit(x, y, z, 6, { color: 0xfff2c0, size: 5, speed: 260, max: 0.25, add: true, dir: [nx, ny, nz], spread: 0.8, grav: 600 });
    this.emit(x, y, z, 3, { color: 0x9aa4b8, size: 14, speed: 40, max: 0.7, grow: 30, alpha: 0.5, dir: [nx, ny, nz], spread: 0.6 });
    this.decals.push({ x: x + nx * 0.6, y: y + ny * 0.6, z: z + nz * 0.6, nx, ny, nz, life: 8 });
    if (this.decals.length > 120) this.decals.shift();
  }

  blood(x: number, y: number, z: number, head: boolean) {
    this.emit(x, y, z, head ? 14 : 7, { color: 0xc4162c, size: head ? 9 : 7, speed: head ? 220 : 140, max: 0.45, grav: 700, alpha: 0.9 });
  }

  explosion(x: number, y: number, z: number, kind: string) {
    if (kind === 'he') {
      this.emit(x, y, z, 40, { color: 0xffa23c, size: 60, speed: 380, max: 0.5, add: true, grow: 80 });
      this.emit(x, y, z, 26, { color: 0x535b6b, size: 70, speed: 160, max: 1.6, grow: 90, alpha: 0.6, grav: -60 });
      this.emit(x, y, z, 18, { color: 0xffe9a8, size: 6, speed: 700, max: 0.6, add: true, grav: 800 });
      this.rings.push({ x, y: y + 4, z, r0: 10, r1: 380, life: 0.4, max: 0.4, color: 0xffb35c });
    } else if (kind === 'impulse') {
      this.emit(x, y, z, 34, { color: 0x37e3ff, size: 30, speed: 600, max: 0.45, add: true, grow: 40 });
      this.rings.push({ x, y: y + 4, z, r0: 10, r1: 340, life: 0.35, max: 0.35, color: 0x37e3ff });
    } else {
      this.emit(x, y, z, 8, { color: 0xdfe5ee, size: 40, speed: 100, max: 0.8, alpha: 0.6, grow: 60 });
    }
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter((d) => d.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  draw(r: Renderer) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      r.particle(p.x, p.y, p.z, p.color, p.alpha * Math.min(1, k * 2), p.size, p.add);
    }
    for (const t of this.tracers) {
      const k = t.life / t.max;
      r.ribbon(t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.width, t.color, 0.85 * k, true);
    }
    for (const d of this.decals) {
      // small dark quad oriented to the surface
      const s = 2.6;
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(d.ny) > 0.9) { ux = 1; uy = 0; }
      let ax = d.ny * uz - d.nz * uy, ay = d.nz * ux - d.nx * uz, az = d.nx * uy - d.ny * ux;
      const l = Math.hypot(ax, ay, az) || 1; ax = ax / l * s; ay = ay / l * s; az = az / l * s;
      const bx = (d.ny * az - d.nz * ay) / s * s, by = (d.nz * ax - d.nx * az) / s * s, bz = (d.nx * ay - d.ny * ax) / s * s;
      const bl = Math.hypot(bx, by, bz) || 1;
      const cx = bx / bl * s, cy = by / bl * s, cz = bz / bl * s;
      const a = Math.min(1, d.life) * 0.75;
      r.flatQuad([[d.x - ax - cx, d.y - ay - cy, d.z - az - cz], [d.x + ax - cx, d.y + ay - cy, d.z + az - cz], [d.x + ax + cx, d.y + ay + cy, d.z + az + cz], [d.x - ax + cx, d.y - ay + cy, d.z - az + cz]], 0x1b1f2a, a);
    }
    for (const g of this.rings) {
      const k = 1 - g.life / g.max;
      const rad = g.r0 + (g.r1 - g.r0) * k;
      const seg = 28;
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const w = 18;
        r.flatQuad([
          [g.x + Math.cos(a0) * rad, g.y, g.z + Math.sin(a0) * rad], [g.x + Math.cos(a1) * rad, g.y, g.z + Math.sin(a1) * rad],
          [g.x + Math.cos(a1) * (rad + w), g.y, g.z + Math.sin(a1) * (rad + w)], [g.x + Math.cos(a0) * (rad + w), g.y, g.z + Math.sin(a0) * (rad + w)],
        ], g.color, (1 - k) * 0.8, true);
      }
    }
  }

  clear() { this.parts = []; this.tracers = []; this.decals = []; this.rings = []; }
}
