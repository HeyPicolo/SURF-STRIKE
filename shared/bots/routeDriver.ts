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
