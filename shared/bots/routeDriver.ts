// Percurso de referência do Surf Skill: guia um PhysState pelos pontos de um stage com o steer.ts
// dos bots (sem assistência: só física real) e pula quando o ponto pede bhop.
import { steerToward } from './steer';
import type { MoveCmd } from '../physics/movement';
import type { PhysState } from '../physics/movement';
import type { NavPoint } from '../maps/types';

export class RouteDriver {
  idx = 0;
  constructor(public route: NavPoint[], public assist = 0) {}
  get done() { return this.idx >= this.route.length; }
  drive(st: PhysState, cmd: MoveCmd, dt: number) {
    if (this.done) { cmd.forward = 0; cmd.side = 0; cmd.jump = false; return; }
    const target = this.route[this.idx];
    const prev = this.idx > 0 ? this.route[this.idx - 1].p : null;
    const r = steerToward(st, target, prev, cmd, dt, this.assist, true);
    if (target.jump) cmd.jump = true;
    if (r.reached) this.idx++;
  }
}

import type { World } from '../sim/world';

export interface ReferenceRunResult { finished: boolean; ticks: number; peak: number; falls: number; fail?: { segment: number; pos: [number, number, number] } }

/**
 * Corrida completa de um mapa do Surf Skill pelo percurso de referência, só com a física do jogo
 * (sem assistência). Nos mapas linear segue embalado pelos portais. Para no primeiro tombo
 * (`stopOnFall`) ou depois de `maxFalls` quedas.
 */
export function referenceRun(w: World, opts: { maxTicks?: number; stopOnFall?: boolean } = {}): ReferenceRunResult {
  const sk = w.skill!, p = w.local;
  const maxTicks = opts.maxTicks ?? 100 * 60 * 8;
  let drv = new RouteDriver(sk.stageDef.route), stage = sk.stage, peak = 0, falls = 0;
  for (let t = 0; t < maxTicks && sk.state !== 'finished'; t++) {
    if (sk.stage !== stage) { drv = new RouteDriver(sk.stageDef.route); if (sk.stage === stage + 1) drv.idx = sk.stageDef.flowFrom; stage = sk.stage; }
    drv.drive(p.phys, p.input.cmd, 1 / 100);
    w.step(1 / 100);
    peak = Math.max(peak, Math.hypot(p.phys.vel.x, p.phys.vel.z));
    for (const e of w.drainEvents()) {
      if (e.t !== 'skillReset') continue;
      falls++;
      if (opts.stopOnFall) return { finished: false, ticks: sk.ticks, peak, falls, fail: { segment: sk.stage, pos: p.phys.pos.toArray() as [number, number, number] } };
      drv = new RouteDriver(sk.stageDef.route);
    }
  }
  p.input.cmd.forward = 0; p.input.cmd.side = 0; p.input.cmd.jump = false;
  return { finished: sk.state === 'finished', ticks: sk.ticks, peak: Math.round(peak), falls };
}
