// Percurso de referência do Surf Skill: guia um PhysState pelos pontos de um stage com o steer.ts
// dos bots (sem assistência: só física real) e pula quando o ponto pede bhop.
import { steerToward } from './steer';
import type { MoveCmd } from '../physics/movement';
import type { PhysState } from '../physics/movement';
import type { NavPoint } from '../maps/types';

export class RouteDriver {
  idx = 0;
  /**
   * Controle de velocidade: acima disto (u/s), no ar ou surfando, segura para trás (o "freio" no ar do
   * Source) na medida do excesso. Infinity = sem freio.
   */
  maxSpeed = Infinity;
  /** teto por ponto da rota (substitui maxSpeed onde existir) */
  speedCap: number[] | null = null;
  constructor(public route: NavPoint[], public assist = 0) {}
  get done() { return this.idx >= this.route.length; }
  drive(st: PhysState, cmd: MoveCmd, dt: number) {
    if (this.done) { cmd.forward = 0; cmd.side = 0; cmd.jump = false; return; }
    const target = this.route[this.idx];
    const prev = this.idx > 0 ? this.route[this.idx - 1].p : null;
    const r = steerToward(st, target, prev, cmd, dt, this.assist, true, this.speedCap !== null);
    if (target.jump) cmd.jump = true;
    if (r.reached) this.idx++;
    const hs = Math.hypot(st.vel.x, st.vel.z);
    const cap = this.speedCap?.[Math.min(this.idx, this.route.length - 1)] ?? this.maxSpeed;
    if (hs > cap) {
      // freio: a tecla para trás em relação ao olhar, que acompanha a velocidade
      // o freio no ar do Source tira até ~450 u/s por tick com a tecla toda: dosa para parar no teto
      cmd.forward = -Math.min(1, Math.max(0.02, (hs - cap) / 450));
    }
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
    if (sk.stage !== stage) {
      const carried = sk.stage === stage + 1;
      drv = new RouteDriver(sk.stageDef.route);
      if (carried) {
        drv.idx = sk.stageDef.flowFrom;
        // staged: entrou embalado (velocidade mantida) — controla a velocidade pelo perfil do stage
        if (sk.course.format === 'staged') drv.speedCap = speedProfile(w, sk.stage);
      }
      stage = sk.stage;
    }
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

/** Controle de velocidade de quem chega embalado: até 15% + 300 u/s acima do que o stage tem saindo parado. */
export const CARRY_CONTROL = { mul: 1.15, add: 300 };

const profileCache = new WeakMap<object, Map<number, number[]>>();

/**
 * Perfil de velocidade de um stage saindo parado do spawn (percurso de referência, num mundo à parte):
 * maior velocidade horizontal a caminho de cada ponto da rota, já com a folga de CARRY_CONTROL. É o teto
 * do controle de velocidade de quem chega embalado do stage anterior (o "freio" no ar).
 */
export function speedProfile(w: World, k: number): number[] {
  let byMap = profileCache.get(w.map);
  if (!byMap) profileCache.set(w.map, (byMap = new Map()));
  const hit = byMap.get(k);
  if (hit) return hit;
  const W = w.constructor as new (m: World['map'], c: World['config']) => World;
  const w2 = new W(w.map, w.config), sk = w2.skill!, p = w2.local;
  if (k > 0) { p.input.skill.gotoStage = k; w2.step(1 / 100); p.input.skill.gotoStage = null; w2.drainEvents(); }
  const route = sk.stageDef.route, d = new RouteDriver(route);
  const prof: number[] = new Array(route.length).fill(0);
  for (let t = 0; t < 9000 && sk.stage === k && sk.state !== 'finished'; t++) {
    const i = Math.min(d.idx, prof.length - 1);
    prof[i] = Math.max(prof[i], Math.hypot(p.phys.vel.x, p.phys.vel.z));
    d.drive(p.phys, p.input.cmd, 1 / 100); w2.step(1 / 100);
    if (w2.drainEvents().some((e) => e.t === 'skillReset')) break;
  }
  for (let i = 1; i < prof.length; i++) if (!prof[i]) prof[i] = prof[i - 1];
  const caps = prof.map((v) => v * CARRY_CONTROL.mul + CARRY_CONTROL.add);
  byMap.set(k, caps);
  return caps;
}
