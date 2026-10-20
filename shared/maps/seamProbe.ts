// =============================================================
//  Sonda das emendas: surfa cada cadeia de peças emendadas (curvas contínuas, retas emendadas) de um
//  mapa com várias velocidades, alturas na face e sentidos de strafe, e mede a maior queda de
//  velocidade horizontal num tick perto de uma junta e os ticks "no chão" numa rampa pura (ramp bug).
//  Usada pelo teste de emendas e por scripts de diagnóstico.
// =============================================================
import type { MapDef, CurvePiece } from './types';
import { V3, yawFromDir } from '../math/vec3';
import { CollisionWorld, newTrace } from '../physics/trace';
import { Mover, PhysState, emptyCmd } from '../physics/movement';
import { SIM_DT, PHYSICS } from '../config/physics';

export interface SeamProbeOpts { speeds: number[]; qs: number[]; strafes: (1 | -1)[]; nearJoint: number }
export const SEAM_PROBE: SeamProbeOpts = { speeds: [800, 1400, 2000, 2600, 3000], qs: [0.15, 0.35, 0.6, 0.85], strafes: [-1, 1], nearJoint: 220 };

export interface SeamFinding { segment: number; chain: number; speed: number; q: number; strafe: number; drop: number; ground: number; at: [number, number, number] }
export interface SeamReport { runs: number; worst: SeamFinding | null; groundRuns: SeamFinding[] }

const MODS = { speedMul: 1, groundSpeedMul: 1.625, airAccelMul: 1, airCapMul: 1, autoBhop: false, fly: false };

function facePoint(p: CurvePiece, f: number, q: number, lift = 0): V3 {
  const fx = p.e.x - p.s.x, fz = p.e.z - p.s.z, l = Math.hypot(fx, fz);
  const sx = -fz / l, sz = fx / l;
  return new V3(p.s.x + fx * f + sx * p.ride * p.hw * q, p.s.y + (p.e.y - p.s.y) * f - p.h * q + lift, p.s.z + fz * f + sz * p.ride * p.hw * q);
}

/** Peça onde o ponto está (projeção ao longo do eixo da peça entre 0 e 1), ou −1. */
function pieceAt(chain: CurvePiece[], p: V3): number {
  let best = -1, bd = Infinity;
  chain.forEach((c, i) => {
    const fx = c.e.x - c.s.x, fz = c.e.z - c.s.z, l2 = fx * fx + fz * fz;
    const t = ((p.x - c.s.x) * fx + (p.z - c.s.z) * fz) / l2;
    if (t < -0.02 || t > 1.02) return;
    const d = Math.abs(((p.x - c.s.x) * fz - (p.z - c.s.z) * fx) / Math.sqrt(l2));
    if (d < bd) { bd = d; best = i; }
  });
  return bd < chain[Math.max(0, best)].hw * 1.5 + 40 ? best : -1;
}

export interface ProbeTick { t: number; piece: number; pos: V3; vel: V3; hs: number; near: boolean; onGround: boolean }

/** Uma passada por uma cadeia: começa na primeira peça, a `q` de profundidade na face, a `speed` u/s. */
export function runChain(cw: CollisionWorld, mv: Mover, chain: CurvePiece[], speed: number, q: number, strafe: 1 | -1, nearJoint: number, onTick?: (k: ProbeTick, ps: PhysState) => void): { worst: number; ground: number; at: [number, number, number]; started: boolean } {
  const tr = newTrace();
  const joints = chain.slice(0, -1).map((c) => c.e);
  const p0 = chain[0], len0 = Math.hypot(p0.e.x - p0.s.x, p0.e.z - p0.s.z);
  const f0 = Math.max(0, 1 - Math.min(500, len0 * 0.8) / len0);
  const ps = new PhysState();
  ps.pos.copy(facePoint(p0, f0, q, 60));
  const fx = p0.e.x - p0.s.x, fz = p0.e.z - p0.s.z, l = Math.hypot(fx, fz);
  ps.vel.set((fx / l) * speed, ((p0.e.y - p0.s.y) / l) * speed, (fz / l) * speed);
  if (cw.boxSolid(ps.pos, ps.mins, ps.maxs)) return { worst: 0, ground: 0, at: [0, 0, 0], started: false };
  const cmd = emptyCmd();
  let prev = speed, worst = 0, ground = 0, at: [number, number, number] = [0, 0, 0];
  for (let t = 0; t < 400; t++) {
    const k = pieceAt(chain, ps.pos);
    if (k < 0) break;
    const c = chain[k];
    cmd.yaw = yawFromDir(c.e.x - c.s.x, c.e.z - c.s.z);
    cmd.forward = 0; cmd.side = strafe;
    mv.move(ps, cmd, SIM_DT, MODS);
    const hs = Math.hypot(ps.vel.x, ps.vel.z);
    const near = joints.some((j) => Math.hypot(ps.pos.x - j.x, ps.pos.z - j.z) < nearJoint + c.hw);
    if (near && prev > 300) {
      const drop = (prev - hs) / prev;
      if (drop > worst) { worst = drop; at = [Math.round(ps.pos.x), Math.round(ps.pos.y), Math.round(ps.pos.z)]; }
    }
    if (ps.onGround && hs >= PHYSICS.surfBevelSpeed) {
      const d = ps.pos.clone(); d.y -= 3;
      const r = cw.traceBox(ps.pos, d, ps.mins, ps.maxs, tr);
      if (r.brush?.kind === 'ramp') ground++;
    }
    onTick?.({ t, piece: k, pos: ps.pos, vel: ps.vel, hs, near, onGround: ps.onGround }, ps);
    prev = hs;
  }
  return { worst, ground, at, started: true };
}

export function probeSeams(map: MapDef, opts: SeamProbeOpts = SEAM_PROBE): SeamReport {
  const cw = new CollisionWorld(map.brushes), mv = new Mover(cw);
  const rep: SeamReport = { runs: 0, worst: null, groundRuns: [] };
  (map.skill?.segments ?? []).forEach((seg, si) => (seg.curves ?? []).forEach((chain, ci) => {
    if (chain.length < 2) return;
    for (const speed of opts.speeds) for (const q of opts.qs) for (const strafe of opts.strafes) {
      const r = runChain(cw, mv, chain, speed, q, strafe, opts.nearJoint);
      if (!r.started) continue;
      rep.runs++;
      const f: SeamFinding = { segment: si, chain: ci, speed, q, strafe, drop: r.worst, ground: r.ground, at: r.at };
      if (!rep.worst || r.worst > rep.worst.drop) rep.worst = f;
      if (r.ground) rep.groundRuns.push(f);
    }
  }));
  return rep;
}
