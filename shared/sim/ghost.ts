// =============================================================
//  Fantasma do Surf Skill — gravação, compressão e reprodução da melhor corrida.
//  Gravação por tick na simulação; armazenamento a 50 Hz (GHOST.rateTicks) com keyframes
//  absolutos periódicos e deltas quantizados em Int16 entre eles. Reprodução interpolada.
//  Fica em shared/ (sem DOM) para servir também a um backend no futuro.
// =============================================================
import { GHOST } from '../config/skill';
import type { V3 } from '../math/vec3';

/** bits de estado de cada amostra */
export const GF_GROUND = 1, GF_DUCK = 2, GF_SNAP = 4;
const GF_KEY = 128;

/** Trilha decodificada: amostra i corresponde ao tick i × rateTicks da corrida. */
export interface GhostTrack {
  rateTicks: number;
  count: number;
  /** duração da corrida (ticks) */
  totalTicks: number;
  /** tick em que a corrida entrou em cada segmento (0 para o primeiro) */
  segStart: number[];
  pos: Float32Array;   // 3 por amostra
  ang: Float32Array;   // yaw, pitch por amostra
  flags: Uint8Array;
  seg: Uint8Array;
}

/** Grava uma amostra por tick durante a corrida (em memória, sem perdas). */
export class GhostRecorder {
  private buf = new Float32Array(7 * 4096);
  ticks = 0;
  segStart: number[] = [0];
  push(p: V3, yaw: number, pitch: number, flags: number, seg: number) {
    const need = (this.ticks + 1) * 7;
    if (need > this.buf.length) { const nb = new Float32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    const o = this.ticks * 7;
    this.buf[o] = p.x; this.buf[o + 1] = p.y; this.buf[o + 2] = p.z;
    this.buf[o + 3] = yaw; this.buf[o + 4] = pitch; this.buf[o + 5] = flags; this.buf[o + 6] = seg;
    this.ticks++;
  }
  markSegment(seg: number, tick: number) { this.segStart[seg] = tick; }
  /** Reduz para a taxa de armazenamento (amostra i = tick i × rate). */
  toTrack(rateTicks = GHOST.rateTicks): GhostTrack {
    const count = Math.ceil(this.ticks / rateTicks);
    const t: GhostTrack = { rateTicks, count, totalTicks: Math.max(0, this.ticks - 1), segStart: [...this.segStart], pos: new Float32Array(count * 3), ang: new Float32Array(count * 2), flags: new Uint8Array(count), seg: new Uint8Array(count) };
    for (let i = 0; i < count; i++) {
      const tick = Math.min(this.ticks - 1, i * rateTicks), o = tick * 7;
      t.pos[i * 3] = this.buf[o]; t.pos[i * 3 + 1] = this.buf[o + 1]; t.pos[i * 3 + 2] = this.buf[o + 2];
      t.ang[i * 2] = this.buf[o + 3]; t.ang[i * 2 + 1] = this.buf[o + 4];
      let f = this.buf[o + 5];
      // teleporte entre a amostra anterior e esta? (ticks pulados também contam)
      for (let k = Math.max(0, (i - 1) * rateTicks + 1); k < tick; k++) f |= this.buf[k * 7 + 5] & GF_SNAP;
      t.flags[i] = f; t.seg[i] = this.buf[o + 6];
    }
    return t;
  }
}

// ------------------------------------------------------------------ binário

const MAGIC = 0x47483231; // "GH21"

export function encodeTrack(t: GhostTrack): ArrayBuffer {
  const q = GHOST.posQuant;
  const bytes: number[] = [];
  const dv = new DataView(new ArrayBuffer(8));
  const u8 = (x: number) => bytes.push(x & 255);
  const u16 = (x: number) => { dv.setUint16(0, x, true); bytes.push(dv.getUint8(0), dv.getUint8(1)); };
  const i16 = (x: number) => { dv.setInt16(0, x, true); bytes.push(dv.getUint8(0), dv.getUint8(1)); };
  const u32 = (x: number) => { dv.setUint32(0, x, true); for (let i = 0; i < 4; i++) bytes.push(dv.getUint8(i)); };
  const f32 = (x: number) => { dv.setFloat32(0, x, true); for (let i = 0; i < 4; i++) bytes.push(dv.getUint8(i)); };
  u32(MAGIC); u16(t.rateTicks); u32(t.count); u32(t.totalTicks); u8(t.segStart.length);
  for (const s of t.segStart) u32(s);
  // posição reconstruída (o delta é sempre contra o que o leitor vai reconstruir: sem deriva)
  let rx = 0, ry = 0, rz = 0;
  for (let i = 0; i < t.count; i++) {
    const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
    const dx = Math.round((x - rx) / q), dy = Math.round((y - ry) / q), dz = Math.round((z - rz) / q);
    const key = i % GHOST.keyEvery === 0 || Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > 32000;
    u8((t.flags[i] & 127) | (key ? GF_KEY : 0)); u8(t.seg[i]);
    if (key) { f32(x); f32(y); f32(z); dv.setFloat32(0, x, true); rx = dv.getFloat32(0, true); dv.setFloat32(0, y, true); ry = dv.getFloat32(0, true); dv.setFloat32(0, z, true); rz = dv.getFloat32(0, true); }
    else { i16(dx); i16(dy); i16(dz); rx += dx * q; ry += dy * q; rz += dz * q; }
    i16(Math.round((wrap(t.ang[i * 2]) / Math.PI) * 32767));
    i16(Math.round((t.ang[i * 2 + 1] / (Math.PI / 2)) * 32767));
  }
  return new Uint8Array(bytes).buffer;
}

export function decodeTrack(buf: ArrayBuffer): GhostTrack {
  const dv = new DataView(buf);
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const x = dv.getUint16(o, true); o += 2; return x; };
  const i16 = () => { const x = dv.getInt16(o, true); o += 2; return x; };
  const u32 = () => { const x = dv.getUint32(o, true); o += 4; return x; };
  const f32 = () => { const x = dv.getFloat32(o, true); o += 4; return x; };
  if (u32() !== MAGIC) throw new Error('gravação de fantasma inválida');
  const rateTicks = u16(), count = u32(), totalTicks = u32(), ns = u8();
  const segStart: number[] = [];
  for (let i = 0; i < ns; i++) segStart.push(u32());
  const t: GhostTrack = { rateTicks, count, totalTicks, segStart, pos: new Float32Array(count * 3), ang: new Float32Array(count * 2), flags: new Uint8Array(count), seg: new Uint8Array(count) };
  const q = GHOST.posQuant;
  let rx = 0, ry = 0, rz = 0;
  for (let i = 0; i < count; i++) {
    const f = u8(); t.seg[i] = u8();
    if (f & GF_KEY) { rx = f32(); ry = f32(); rz = f32(); } else { rx += i16() * q; ry += i16() * q; rz += i16() * q; }
    t.pos[i * 3] = rx; t.pos[i * 3 + 1] = ry; t.pos[i * 3 + 2] = rz;
    t.flags[i] = f & 127;
    t.ang[i * 2] = (i16() / 32767) * Math.PI;
    t.ang[i * 2 + 1] = (i16() / 32767) * (Math.PI / 2);
  }
  return t;
}

function wrap(a: number) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

/** Recorte de um segmento (re-baseado para começar no tick 0). */
export function sliceTrack(t: GhostTrack, seg: number): GhostTrack | null {
  const from = t.segStart[seg];
  if (from === undefined) return null;
  const to = t.segStart[seg + 1] ?? t.totalTicks;
  const i0 = Math.floor(from / t.rateTicks), i1 = Math.min(t.count - 1, Math.ceil(to / t.rateTicks));
  if (i1 <= i0) return null;
  const n = i1 - i0 + 1;
  const out: GhostTrack = { rateTicks: t.rateTicks, count: n, totalTicks: to - from, segStart: [0], pos: t.pos.slice(i0 * 3, (i1 + 1) * 3), ang: t.ang.slice(i0 * 2, (i1 + 1) * 2), flags: t.flags.slice(i0, i1 + 1), seg: t.seg.slice(i0, i1 + 1) };
  out.flags[0] |= GF_SNAP;
  return out;
}

// ------------------------------------------------------------------ reprodução

export interface GhostFrame { x: number; y: number; z: number; yaw: number; pitch: number; flags: number; seg: number; ended: boolean }

/** Amostra a trilha num tick fracionário (interpola; não interpola através de teleportes). */
export function sampleTrack(t: GhostTrack, tick: number, out: GhostFrame): GhostFrame {
  const ft = Math.max(0, tick) / t.rateTicks;
  let i = Math.floor(ft);
  out.ended = tick > t.totalTicks;
  if (i >= t.count - 1) { i = t.count - 1; return fill(t, i, i, 0, out); }
  const a = ft - i;
  if (t.flags[i + 1] & GF_SNAP) return fill(t, a < 0.5 ? i : i + 1, a < 0.5 ? i : i + 1, 0, out);
  return fill(t, i, i + 1, a, out);
}

function fill(t: GhostTrack, i: number, j: number, a: number, out: GhostFrame): GhostFrame {
  const P = t.pos, A = t.ang;
  out.x = P[i * 3] + (P[j * 3] - P[i * 3]) * a;
  out.y = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * a;
  out.z = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * a;
  out.yaw = A[i * 2] + wrap(A[j * 2] - A[i * 2]) * a;
  out.pitch = A[i * 2 + 1] + (A[j * 2 + 1] - A[i * 2 + 1]) * a;
  out.flags = a < 0.5 ? t.flags[i] : t.flags[j];
  out.seg = a < 0.5 ? t.seg[i] : t.seg[j];
  return out;
}

/**
 * Tick da trilha em que o fantasma passou mais perto de `p` (dentro do segmento `seg`, se dado).
 * Usado para a diferença ao vivo ("à frente/atrás"). `hint` acelera a busca em torno da última resposta.
 */
export function nearestTick(t: GhostTrack, p: { x: number; y: number; z: number }, seg: number | null, hint = -1): number {
  let best = -1, bd = Infinity;
  const scan = (i0: number, i1: number) => {
    for (let i = Math.max(0, i0); i <= Math.min(t.count - 1, i1); i++) {
      if (seg !== null && t.seg[i] !== seg) continue;
      const dx = t.pos[i * 3] - p.x, dy = t.pos[i * 3 + 1] - p.y, dz = t.pos[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  };
  if (hint >= 0) scan(hint - 60, hint + 120);
  if (best < 0 || bd > 400 * 400) scan(0, t.count - 1);
  return best < 0 ? -1 : best * t.rateTicks;
}

// ------------------------------------------------------------------ conjunto por mapa

/** Fantasmas guardados de um mapa: o da corrida PB e o melhor de cada segmento. */
export interface GhostSet {
  pb: GhostTrack | null;
  pbTicks: number | null;
  segments: (GhostTrack | null)[];
  segTicks: (number | null)[];
}
export const emptyGhostSet = (n: number): GhostSet => ({ pb: null, pbTicks: null, segments: Array(n).fill(null), segTicks: Array(n).fill(null) });

/**
 * Atualiza os fantasmas depois de uma corrida válida, segundo o resultado dos recordes:
 * PB novo substitui o fantasma da corrida; cada segmento que virou o melhor da história
 * ("gold") substitui o fantasma daquele segmento.
 */
export function updateGhostSet(set: GhostSet, track: GhostTrack, total: number, stageTimes: number[], newPb: boolean, gold: boolean[]): GhostSet {
  const out: GhostSet = { pb: set.pb, pbTicks: set.pbTicks, segments: [...set.segments], segTicks: [...set.segTicks] };
  if (newPb) { out.pb = track; out.pbTicks = total; }
  stageTimes.forEach((tm, i) => {
    if (!gold[i]) return;
    const clip = sliceTrack(track, i);
    if (clip) { out.segments[i] = clip; out.segTicks[i] = tm; }
  });
  return out;
}

/** Forma serializável (ArrayBuffers) para guardar. */
export interface StoredGhostSet { pb: ArrayBuffer | null; pbTicks: number | null; segments: (ArrayBuffer | null)[]; segTicks: (number | null)[] }
export function packGhostSet(s: GhostSet): StoredGhostSet {
  return { pb: s.pb ? encodeTrack(s.pb) : null, pbTicks: s.pbTicks, segments: s.segments.map((x) => (x ? encodeTrack(x) : null)), segTicks: [...s.segTicks] };
}
export function unpackGhostSet(s: StoredGhostSet, n: number): GhostSet {
  const segs = Array.from({ length: n }, (_, i) => (s.segments?.[i] ? decodeTrack(s.segments[i] as ArrayBuffer) : null));
  return { pb: s.pb ? decodeTrack(s.pb) : null, pbTicks: s.pbTicks ?? null, segments: segs, segTicks: Array.from({ length: n }, (_, i) => s.segTicks?.[i] ?? null) };
}

/** Armazenamento dos fantasmas (IndexedDB no cliente; um backend no futuro). Mesma chave dos recordes. */
export interface GhostStore {
  load(mapId: string, version: string, segments: number): Promise<GhostSet>;
  save(mapId: string, version: string, set: GhostSet): Promise<void>;
}

export class MemoryGhostStore implements GhostStore {
  private data = new Map<string, StoredGhostSet>();
  async load(mapId: string, version: string, n: number): Promise<GhostSet> {
    const s = this.data.get(`${mapId}.${version}`);
    return s ? unpackGhostSet(s, n) : emptyGhostSet(n);
  }
  async save(mapId: string, version: string, set: GhostSet): Promise<void> { this.data.set(`${mapId}.${version}`, packGhostSet(set)); }
}
