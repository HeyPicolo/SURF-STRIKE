// =============================================================
//  HumanAim — movimento de mira de um bot como o de uma mão humana com mouse (rodada 11).
//
//  1. Flick balístico: ao ganhar um alvo novo (ou o alvo pular muito), a mira faz um movimento de
//     jerk mínimo (acelera e desacelera) até um ponto final com erro proporcional à amplitude
//     (overshoot/undershoot, lei de Fitts). O tempo do flick segue Fitts.
//  2. Correções: uma mola amortecida segue uma estimativa ATRASADA do alvo (filtro de 1ª ordem com
//     estimativa de velocidade). O atraso cresce com a velocidade angular do alvo; quando o alvo
//     muda de direção, a estimativa continua um instante para o lado antigo.
//  3. Tremor: ruído suave contínuo (value noise com interpolação suave), somado na saída.
//
//  Sem Math.random: todo sorteio vem do PRNG do bot.
// =============================================================
import type { BotAim } from '../config/match';
import { angleDiff } from '../math/vec3';

const DEG = Math.PI / 180;

/** Ruído suave 1D determinístico (value noise com smoothstep), saída em ~[-1, 1]. */
export class SmoothNoise {
  private knots: number[];
  constructor(rand: () => number, n = 64) { this.knots = Array.from({ length: n }, () => rand() * 2 - 1); }
  at(t: number): number {
    const n = this.knots.length, i = Math.floor(t), f = t - i;
    const a = this.knots[((i % n) + n) % n], b = this.knots[(((i + 1) % n) + n) % n];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
}

/** Normal padrão (Box–Muller) a partir de um PRNG. */
export function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface AimSample { yaw: number; pitch: number }

export class HumanAim {
  /** ângulos da "mão" (sem o tremor) e velocidade angular (rad/s) */
  yaw = 0; pitch = 0; vy = 0; vp = 0;
  /** saída (com o tremor) */
  outYaw = 0; outPitch = 0;
  phase: 'idle' | 'flick' | 'track' = 'idle';
  /** tempo desde o fim do último flick (s) */
  sinceFlick = 0;
  /** número de flicks e quantos passaram do ponto (para os testes) */
  flicks = 0; overshoots = 0;
  private fl = { t: 0, T: 0, y0: 0, p0: 0, y1: 0, p1: 0, ampY: 0, ampP: 0 };
  private est = { yaw: 0, pitch: 0, vy: 0, vp: 0, init: false };
  private rawPrev = { yaw: 0, pitch: 0, init: false };
  private nY: SmoothNoise; private nP: SmoothNoise;
  private time = 0;

  constructor(public cfg: BotAim, private rand: () => number) {
    this.nY = new SmoothNoise(rand); this.nP = new SmoothNoise(rand);
  }

  reset(yaw: number, pitch: number) {
    this.yaw = this.outYaw = yaw; this.pitch = this.outPitch = pitch; this.vy = this.vp = 0;
    this.phase = 'idle'; this.est.init = false; this.rawPrev.init = false;
  }

  /** Esquece a estimativa do alvo (alvo novo): o próximo update parte do zero. */
  forgetTarget() { this.est.init = false; this.rawPrev.init = false; if (this.phase !== 'idle') this.phase = 'track'; }

  /** Começa um flick até (yaw, pitch); `width` = largura angular do alvo (rad) para a lei de Fitts. */
  startFlick(yaw: number, pitch: number, width: number, vYaw = 0, vPitch = 0) {
    const c = this.cfg;
    // tempo do flick (Fitts) e ponto final previsto: onde o alvo vai estar quando a mão chegar
    let dy = angleDiff(this.yaw, yaw), dp = pitch - this.pitch;
    const amp0 = Math.hypot(dy, dp);
    const T0 = c.flickTime + c.flickTimePerBit * Math.log2(1 + amp0 / Math.max(width, 0.2 * DEG));
    dy += vYaw * T0 * 0.8; dp += vPitch * T0 * 0.8;
    const amp = Math.hypot(dy, dp);
    if (amp < 1e-4) return;
    const bits = Math.log2(1 + amp / Math.max(width, 0.2 * DEG));
    const T = (c.flickTime + c.flickTimePerBit * bits) * (0.85 + 0.3 * this.rand());
    // ponto final: erro ao longo do movimento (overshoot/undershoot) e um pouco de lado
    const along = 1 + c.overshoot + gauss(this.rand) * c.flickError;
    const side = gauss(this.rand) * c.flickError * 0.35;
    const ux = dy / amp, uy = dp / amp;
    const ey = dy * along - uy * side * amp, ep = dp * along + ux * side * amp;
    this.fl = { t: 0, T, y0: this.yaw, p0: this.pitch, y1: this.yaw + ey, p1: this.pitch + ep, ampY: dy, ampP: dp };
    this.phase = 'flick';
    this.flicks++;
    if (along > 1) this.overshoots++;
  }

  get flickProgress() { return this.phase === 'flick' ? this.fl.t / this.fl.T : 1; }

  /**
   * Avança a mira. `target`: ângulos desejados neste tick (null = sem alvo; a mão para devagar).
   * `stiffMul` deixa a mola mais mole (olhar ocioso). `noiseMul` aumenta o tremor (nervosismo).
   */
  update(dt: number, target: AimSample | null, opts: { stiffMul?: number; noiseMul?: number; lagMul?: number } = {}) {
    const c = this.cfg;
    this.time += dt;
    let goalY = this.yaw, goalP = this.pitch, gvy = 0, gvp = 0;
    if (target) {
      // estimativa atrasada do alvo, com velocidade (continua para o lado antigo quando o alvo vira)
      if (!this.rawPrev.init) { this.rawPrev = { yaw: target.yaw, pitch: target.pitch, init: true }; }
      const rvy = angleDiff(this.rawPrev.yaw, target.yaw) / dt, rvp = (target.pitch - this.rawPrev.pitch) / dt;
      this.rawPrev.yaw = target.yaw; this.rawPrev.pitch = target.pitch;
      if (!this.est.init) this.est = { yaw: target.yaw, pitch: target.pitch, vy: 0, vp: 0, init: true };
      const angSpeed = Math.hypot(this.est.vy, this.est.vp) / DEG; // graus/s
      const tau = (c.trackLag + c.trackLagPerSpeed * angSpeed / 100) * (opts.lagMul ?? 1);
      const a = dt / (tau + dt);
      this.est.vy += (Math.max(-20, Math.min(20, rvy)) - this.est.vy) * a;
      this.est.vp += (Math.max(-20, Math.min(20, rvp)) - this.est.vp) * a;
      this.est.yaw += this.est.vy * dt; this.est.pitch += this.est.vp * dt;
      this.est.yaw += angleDiff(this.est.yaw, target.yaw) * a;
      this.est.pitch += (target.pitch - this.est.pitch) * a;
      goalY = this.est.yaw; goalP = this.est.pitch; gvy = this.est.vy; gvp = this.est.vp;
      if (this.phase === 'idle') this.phase = 'track';
    }

    if (this.phase === 'flick') {
      const f = this.fl;
      f.t += dt;
      const s = Math.min(1, f.t / f.T);
      // jerk mínimo: posição 10s³ − 15s⁴ + 6s⁵ (velocidade em sino: acelera e desacelera)
      const k = s * s * s * (10 - 15 * s + 6 * s * s);
      const ny = f.y0 + angleDiff(f.y0, f.y1) * k, np = f.p0 + (f.p1 - f.p0) * k;
      this.vy = angleDiff(this.yaw, ny) / dt; this.vp = (np - this.pitch) / dt;
      this.yaw = ny; this.pitch = np;
      if (s >= 1) { this.phase = target ? 'track' : 'idle'; this.sinceFlick = 0; }
    } else {
      // mola amortecida até a estimativa (amortecimento relativo à velocidade do alvo)
      const kk = c.stiffness * (opts.stiffMul ?? 1), cc = 2 * c.damping * Math.sqrt(kk);
      const ay = kk * angleDiff(this.yaw, goalY) - cc * (this.vy - gvy);
      const ap = kk * (goalP - this.pitch) - cc * (this.vp - gvp);
      this.vy += ay * dt; this.vp += ap * dt;
      const vmax = c.maxTurn * DEG, v = Math.hypot(this.vy, this.vp);
      if (v > vmax) { this.vy *= vmax / v; this.vp *= vmax / v; }
      this.yaw += this.vy * dt; this.pitch += this.vp * dt;
      this.sinceFlick += dt;
    }
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    // tremor contínuo
    const tr = c.tremor * DEG * (opts.noiseMul ?? 1), ts = this.time * c.tremorRate;
    this.outYaw = this.yaw + this.nY.at(ts) * tr;
    this.outPitch = this.pitch + this.nP.at(ts + 17.3) * tr * 0.7;
  }

  /** Velocidade angular estimada do alvo (rad/s), pela estimativa atrasada. */
  get targetVel(): [number, number] { return [this.est.vy, this.est.vp]; }

  /** Velocidade angular atual da mão (graus/s). */
  get speed() { return Math.hypot(this.vy, this.vp) / DEG; }
}
