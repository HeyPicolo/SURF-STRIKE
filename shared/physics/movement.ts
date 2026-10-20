import { V3, forwardFromAngles, rightFromYaw } from '../math/vec3';
import { PHYSICS } from '../config/physics';
import { CollisionWorld, newTrace, TraceResult } from './trace';
import type { Brush } from './brush';

/** Input for one simulation tick (what a client would send to a server). */
export interface MoveCmd {
  forward: number;   // -1..1 (W/S)
  side: number;      // -1..1 (D = +1, A = -1)
  up: number;        // -1..1 (fly mode only)
  yaw: number;       // radians
  pitch: number;     // radians
  jump: boolean;     // jump held
  crouch: boolean;   // crouch held
  walk: boolean;     // walk key held (slow, silent, no sprint)
}

export function emptyCmd(): MoveCmd {
  return { forward: 0, side: 0, up: 0, yaw: 0, pitch: 0, jump: false, crouch: false, walk: false };
}

export interface MoveModifiers {
  speedMul: number;       // wishspeed multiplier on ground AND air (buffs/debuffs)
  groundSpeedMul?: number; // extra multiplier only on the ground (sprint, knife, weapon weight)
  airAccelMul: number;    // class passives
  airCapMul: number;
  autoBhop: boolean;
  fly: boolean;           // training noclip/fly
  /** Sliding: low friction, no ground acceleration (state owned by the game rules). */
  sliding?: boolean;
  slideFriction?: number;
  /** Skip ground friction but keep normal acceleration (exit of a teleporter). */
  noFriction?: boolean;
}

export const DEFAULT_MODS: MoveModifiers = { speedMul: 1, airAccelMul: 1, airCapMul: 1, autoBhop: true, fly: false };

/** Physical state of a character. Origin is at the feet, centered horizontally. */
export class PhysState {
  pos = new V3();
  vel = new V3();
  onGround = false;
  groundNormal = new V3(0, 1, 0);
  /** Touching a surf ramp this tick (normal.y in (0.05, walkable)). */
  surfing = false;
  surfNormal = new V3();
  ducked = false;
  jumpHeld = false;
  /** Seconds since last landing (for camera land bob). */
  landImpact = 0;
  lastSafe = new V3();
  stuckTicks = 0;
  /** plataforma `spawnOnly` em que o jogador foi colocado (sólida só para ele, até sair da zona); −1: nenhuma */
  spawnFloor = -1;
  mins = new V3(-PHYSICS.playerRadius, 0, -PHYSICS.playerRadius);
  maxs = new V3(PHYSICS.playerRadius, PHYSICS.playerHeight, PHYSICS.playerRadius);

  eyeHeight(): number { return this.ducked ? PHYSICS.crouchEyeHeight : PHYSICS.eyeHeight; }
}

export interface MoveEvents { jumped: boolean; landed: number; }

const MAX_CLIP_PLANES = 5;

/** Project velocity onto a plane (overbounce 1 = pure slide, which is what makes surfing work). */
export function clipVelocity(inVel: V3, n: V3, out: V3, overbounce = 1): V3 {
  const backoff = inVel.dot(n) * overbounce;
  out.set(inVel.x - n.x * backoff, inVel.y - n.y * backoff, inVel.z - n.z * backoff);
  // make sure we're not still moving into the plane due to float error
  const adjust = out.dot(n);
  if (adjust < 0) out.addScaled(n, -adjust);
  // tiny outward bias (Quake 3 "overclip" idea): guarantees the next sweep starts moving away from
  // the plane, which avoids the classic "ramp bug" where the player freezes while sliding.
  out.addScaled(n, 0.01);
  return out;
}

/** Ground acceleration. */
export function accelerate(vel: V3, wishDir: V3, wishSpeed: number, accel: number, dt: number): void {
  const current = vel.dot(wishDir);
  const add = wishSpeed - current;
  if (add <= 0) return;
  let accelSpeed = accel * dt * wishSpeed;
  if (accelSpeed > add) accelSpeed = add;
  vel.addScaled(wishDir, accelSpeed);
}

/**
 * Air acceleration with the Source "wishspeed cap": only the projection of velocity onto the
 * wish direction is capped (30 u/s), so strafing perpendicular to the velocity while turning the
 * mouse keeps adding speed — the basis of air-strafing and surf control.
 */
export function airAccelerate(vel: V3, wishDir: V3, wishSpeed: number, accel: number, cap: number, dt: number): void {
  const wishSpd = Math.min(wishSpeed, cap);
  const current = vel.dot(wishDir);
  const add = wishSpd - current;
  if (add <= 0) return;
  let accelSpeed = accel * wishSpeed * dt;
  if (accelSpeed > add) accelSpeed = add;
  vel.addScaled(wishDir, accelSpeed);
}

export function applyFriction(st: PhysState, dt: number, friction: number = PHYSICS.groundFriction): void {
  const speed = st.vel.len();
  if (speed < 0.1) { st.vel.set(0, st.vel.y, 0); return; }
  const control = speed < PHYSICS.stopSpeed ? PHYSICS.stopSpeed : speed;
  const drop = control * friction * dt;
  let newSpeed = speed - drop;
  if (newSpeed < 0) newSpeed = 0;
  st.vel.scale(newSpeed / speed);
}

/** Movement simulation (one fixed tick). Pure function of state + command + world. */
/**
 * Rampa só de surf (`surfOnly`: peças de curva e mapas que pedem): um contato com normal andável nela só pode vir de um plano de
 * bisel (aresta da crista ou da junta vista por uma caixa alinhada aos eixos). Em velocidade de surf
 * (≥ PHYSICS.surfBevelSpeed) isso não vira chão — senão o atrito, o "subir degrau" e o grudar no chão
 * travam o surf (o ramp bug). Parado ou devagar, continua dando para ficar em pé no cume. Nas rampas
 * retas comuns o comportamento não muda (os pousos perto do cume foram calibrados assim).
 */
/** distância (do centro dos pés à tampa) em que um contato conta como na junta */
const JOINT_REACH = 48;
const pureRampCache = new WeakMap<Brush, boolean>();
function pureRamp(b: Brush | null): boolean {
  if (!b || b.kind !== 'ramp') return false;
  let v = pureRampCache.get(b);
  if (v === undefined) {
    v = b.planes.slice(0, b.faces.length).every((pl) => pl.n.y < PHYSICS.walkableNormalY);
    pureRampCache.set(b, v);
  }
  return v;
}
/** O plano tocado é uma das faces de surf do brush (e não uma tampa ou um bisel)? */
function isSurfFace(b: Brush, n: V3): boolean {
  for (let i = 0; i < b.faces.length; i++) {
    const pl = b.planes[i];
    if (pl.n.y > 0.05 && pl.n.y < PHYSICS.walkableNormalY && pl.n.dot(n) > 0.9999) return true;
  }
  return false;
}
function rampBevel(b: Brush | null, st: PhysState): boolean {
  return !!b?.surfOnly && pureRamp(b) && Math.hypot(st.vel.x, st.vel.z) >= PHYSICS.surfBevelSpeed;
}

export class Mover {
  private tr: TraceResult = newTrace();
  private tr2: TraceResult = newTrace();
  private planes: V3[] = Array.from({ length: MAX_CLIP_PLANES }, () => new V3());
  private t1 = new V3(); private t2 = new V3(); private t3 = new V3(); private t4 = new V3();
  private fwd = new V3(); private right = new V3(); private wish = new V3();

  constructor(public world: CollisionWorld) {}

  move(st: PhysState, cmd: MoveCmd, dt: number, mods: MoveModifiers = DEFAULT_MODS): MoveEvents {
    const ev: MoveEvents = { jumped: false, landed: 0 };
    const wasOnGround = st.onGround;
    const fallSpeed = -st.vel.y;

    if (mods.fly) { this.flyNoclip(st, cmd, dt); return ev; }
    this.world.allowSpawnOnly = st.spawnFloor;
    try { return this.moveInner(st, cmd, dt, mods, ev, wasOnGround, fallSpeed); } finally { this.world.allowSpawnOnly = -1; }
  }

  private moveInner(st: PhysState, cmd: MoveCmd, dt: number, mods: MoveModifiers, ev: MoveEvents, wasOnGround: boolean, fallSpeed: number): MoveEvents {

    this.handleDuck(st, cmd);
    this.unstick(st);
    this.categorize(st);

    // wish direction from view (pitch ignored, like Source)
    const sens = PHYSICS.movementSensitivity;
    forwardFromAngles(cmd.yaw, 0, this.fwd);
    rightFromYaw(cmd.yaw, this.right);
    const fm = clampUnit(cmd.forward * sens), sm = clampUnit(cmd.side * sens);
    this.wish.set(this.fwd.x * fm + this.right.x * sm, 0, this.fwd.z * fm + this.right.z * sm);
    let wishSpeed = Math.min(this.wish.len(), 1) * PHYSICS.maxGroundSpeed * mods.speedMul;
    this.wish.normalize();
    if (st.onGround) wishSpeed *= mods.groundSpeedMul ?? 1;
    if (st.ducked && st.onGround) wishSpeed *= PHYSICS.crouchSpeedFactor;

    // half gravity before move
    if (!st.onGround) st.vel.y -= PHYSICS.gravity * dt * 0.5;

    // jump (before friction → bunny hops keep their speed)
    if (cmd.jump) {
      if (st.onGround && (!st.jumpHeld || mods.autoBhop)) {
        st.vel.y = PHYSICS.jumpImpulse;
        st.onGround = false;
        st.jumpHeld = true;
        ev.jumped = true;
      }
    } else st.jumpHeld = false;

    if (st.onGround) {
      st.vel.y = 0;
      if (mods.sliding) {
        // slide: momentum carries the player, only low friction slows it down
        applyFriction(st, dt, mods.slideFriction ?? 1);
      } else {
        if (!mods.noFriction) applyFriction(st, dt);
        accelerate(st.vel, this.wish, wishSpeed, PHYSICS.groundAccelerate, dt);
      }
      this.clampVelocity(st);
      this.walkMove(st, dt);
    } else {
      airAccelerate(st.vel, this.wish, wishSpeed, PHYSICS.airAccelerate * mods.airAccelMul,
        PHYSICS.airWishSpeedCap * mods.airCapMul, dt);
      this.clampVelocity(st);
      st.surfing = false;
      this.flyMove(st, dt, null);
    }

    const touchedRamp = st.surfing;
    const touchedNormal = this.t4.copy(st.surfNormal);
    this.categorize(st);
    if (touchedRamp && !st.onGround && !st.surfing) { st.surfing = true; st.surfNormal.copy(touchedNormal); }
    if (!st.onGround) st.vel.y -= PHYSICS.gravity * dt * 0.5;
    else st.vel.y = 0;
    this.clampVelocity(st);

    if (!wasOnGround && st.onGround) { ev.landed = fallSpeed; st.landImpact = Math.min(1, fallSpeed / 600); }
    st.landImpact = Math.max(0, st.landImpact - dt * 4);

    if (!this.world.boxSolid(st.pos, st.mins, st.maxs)) st.lastSafe.copy(st.pos);
    return ev;
  }

  private flyNoclip(st: PhysState, cmd: MoveCmd, dt: number) {
    const f = forwardFromAngles(cmd.yaw, cmd.pitch, this.fwd);
    const r = rightFromYaw(cmd.yaw, this.right);
    const up = (cmd.jump ? 1 : 0) - (cmd.crouch ? 1 : 0) + cmd.up;
    this.wish.set(f.x * cmd.forward + r.x * cmd.side, f.y * cmd.forward + up, f.z * cmd.forward + r.z * cmd.side);
    const target = this.wish.lenSq() > 0 ? this.wish.normalize().scale(PHYSICS.noclipSpeed) : this.wish.set(0, 0, 0);
    st.vel.lerp(target, Math.min(1, dt * 8));
    st.pos.addScaled(st.vel, dt);
    st.onGround = false; st.surfing = false;
  }

  private clampVelocity(st: PhysState) {
    const m = PHYSICS.maxVelocity;
    st.vel.x = Math.max(-m, Math.min(m, st.vel.x));
    st.vel.y = Math.max(-m, Math.min(m, st.vel.y));
    st.vel.z = Math.max(-m, Math.min(m, st.vel.z));
  }

  private handleDuck(st: PhysState, cmd: MoveCmd) {
    if (cmd.crouch && !st.ducked) {
      st.ducked = true;
      st.maxs.y = PHYSICS.playerCrouchHeight;
      if (!st.onGround) {
        // in air: pull legs up (keep head in place) like Source
        const lift = PHYSICS.playerHeight - PHYSICS.playerCrouchHeight;
        const up = this.t1.copy(st.pos); up.y += lift;
        const t = this.world.traceBox(st.pos, up, st.mins, st.maxs, this.tr2);
        st.pos.copy(t.endPos);
      }
    } else if (!cmd.crouch && st.ducked) {
      const fullMaxs = this.t2.set(st.maxs.x, PHYSICS.playerHeight, st.maxs.z);
      if (!st.onGround) {
        // try to unduck by lowering the feet
        const lift = PHYSICS.playerHeight - PHYSICS.playerCrouchHeight;
        const down = this.t1.copy(st.pos); down.y -= lift;
        const t = this.world.traceBox(st.pos, down, st.mins, st.maxs, this.tr2);
        const p = this.t3.copy(t.endPos);
        if (!this.world.boxSolid(p, st.mins, fullMaxs)) { st.pos.copy(p); st.ducked = false; st.maxs.y = PHYSICS.playerHeight; return; }
      }
      if (!this.world.boxSolid(st.pos, st.mins, fullMaxs)) { st.ducked = false; st.maxs.y = PHYSICS.playerHeight; }
    }
  }

  /** If we start inside geometry, try small nudges; otherwise return to the last safe position. */
  private unstick(st: PhysState) {
    if (!this.world.boxSolid(st.pos, st.mins, st.maxs)) { st.stuckTicks = 0; return; }
    const offsets = [[0, 1, 0], [0, 4, 0], [0, 12, 0], [2, 0, 0], [-2, 0, 0], [0, 0, 2], [0, 0, -2], [0, -2, 0], [6, 6, 0], [-6, 6, 0], [0, 6, 6], [0, 6, -6], [0, 24, 0]];
    for (const o of offsets) {
      const p = this.t1.set(st.pos.x + o[0], st.pos.y + o[1], st.pos.z + o[2]);
      if (!this.world.boxSolid(p, st.mins, st.maxs)) { st.pos.copy(p); return; }
    }
    st.stuckTicks++;
    if (st.stuckTicks > 3) { st.pos.copy(st.lastSafe); st.vel.scale(0.5); st.stuckTicks = 0; }
  }

  private categorize(st: PhysState) {
    st.surfing = false;
    if (st.vel.y > 180) { st.onGround = false; return; }
    const down = this.t1.copy(st.pos); down.y -= 2;
    const t = this.world.traceBox(st.pos, down, st.mins, st.maxs, this.tr);
    if (t.fraction < 1 && t.normal.y >= PHYSICS.walkableNormalY && !rampBevel(t.brush, st)) {
      st.onGround = true;
      st.groundNormal.copy(t.normal);
      if (!t.startSolid) st.pos.copy(t.endPos);
    } else {
      st.onGround = false;
      if (t.fraction < 1 && t.normal.y > 0.05) { st.surfing = true; st.surfNormal.copy(t.normal); }
    }
    // also detect ramp contact sideways (pressing into a ramp face)
    if (!st.onGround && !st.surfing) {
      for (const sx of [-2, 2]) for (const sz of [-2, 2]) {
        const side = this.t1.set(st.pos.x + sx, st.pos.y - 1, st.pos.z + sz);
        const t2 = this.world.traceBox(st.pos, side, st.mins, st.maxs, this.tr);
        if (t2.fraction < 1 && t2.normal.y > 0.05 && t2.normal.y < PHYSICS.walkableNormalY) {
          st.surfing = true; st.surfNormal.copy(t2.normal); return;
        }
      }
    }
  }

  /** TryPlayerMove: slide along up to 4 planes. Conserves momentum when sliding on ramps. */
  flyMove(st: PhysState, dt: number, _ground: V3 | null): number {
    const primal = this.t3.copy(st.vel);
    const original = this.t4.copy(st.vel);
    let numPlanes = 0;
    let timeLeft = dt;
    let blocked = 0;
    const end = this.t1;
    const newVel = this.t2;
    for (let bump = 0; bump < 4; bump++) {
      if (st.vel.lenSq() < 1e-6) break;
      end.set(st.pos.x + st.vel.x * timeLeft, st.pos.y + st.vel.y * timeLeft, st.pos.z + st.vel.z * timeLeft);
      const t = this.world.traceBox(st.pos, end, st.mins, st.maxs, this.tr);
      if (t.allSolid) { st.vel.set(0, 0, 0); return 3; }
      if (t.fraction > 0) { st.pos.copy(t.endPos); original.copy(st.vel); numPlanes = 0; }
      if (t.fraction === 1) break;
      if (t.fraction === 0 && !t.startSolid) {
        // anti ramp-bug: we are resting inside the epsilon shell — nudge out along the normal
        const nudged = this.t1.copy(st.pos).addScaled(t.normal, 0.06);
        if (!this.world.boxSolid(nudged, st.mins, st.maxs)) st.pos.copy(nudged);
      }

      // junta de curva: a caixa entrou na peça seguinte pela tampa ou por um bisel dela (numa dobra
      // côncava a face seguinte fica um pouco acima da atual). A tampa é interna, não é parede: sobe para
      // a face da peça seguinte e continua surfando.
      if (t.brush?.joints?.length && !isSurfFace(t.brush, t.normal)
        && t.brush.joints.some((pl) => Math.abs(pl.n.dot(st.pos) - pl.d) < JOINT_REACH) && this.liftOntoFace(st, t.brush)) {
        timeLeft -= timeLeft * t.fraction;
        continue;
      }

      if (t.normal.y > PHYSICS.walkableNormalY) blocked |= 1;
      if (t.normal.y === 0) blocked |= 2;
      if (t.normal.y > 0.05 && t.normal.y < PHYSICS.walkableNormalY) {
        st.surfing = true; st.surfNormal.copy(t.normal);
        if (PHYSICS.surfFriction > 0) st.vel.scale(Math.max(0, 1 - PHYSICS.surfFriction * dt));
      }

      timeLeft -= timeLeft * t.fraction;
      if (numPlanes >= MAX_CLIP_PLANES) { st.vel.set(0, 0, 0); break; }
      this.planes[numPlanes++].copy(t.normal);

      if (numPlanes === 1 && !st.onGround) {
        clipVelocity(original, this.planes[0], newVel, 1);
        st.vel.copy(newVel);
        original.copy(newVel);
      } else {
        let i = 0;
        for (; i < numPlanes; i++) {
          clipVelocity(original, this.planes[i], st.vel, 1);
          let j = 0;
          for (; j < numPlanes; j++) {
            if (j !== i && st.vel.dot(this.planes[j]) < 0) break;
          }
          if (j === numPlanes) break;
        }
        if (i === numPlanes) {
          if (numPlanes !== 2) { st.vel.set(0, 0, 0); break; }
          const dir = newVel.crossVectors(this.planes[0], this.planes[1]).normalize();
          const d = dir.dot(st.vel);
          st.vel.copy(dir).scale(d);
        }
      }
      // don't reverse direction (prevents jittering in corners)
      if (st.vel.dot(primal) <= 0) { st.vel.set(0, 0, 0); break; }
    }
    return blocked;
  }

  /**
   * Põe a caixa por cima da face surfável de `b` em que ela menos penetra (até PHYSICS.stepSize) e tira
   * da velocidade a parte que entra nessa face. Usado nas juntas internas das rampas emendadas.
   */
  private liftOntoFace(st: PhysState, b: Brush): boolean {
    let best = Infinity, bn: V3 | null = null;
    for (let i = 0; i < b.faces.length; i++) {
      const pl = b.planes[i];
      if (pl.n.y <= 0.05 || pl.n.y >= PHYSICS.walkableNormalY) continue;
      // canto da caixa mais fundo em relação ao plano
      const cx = pl.n.x >= 0 ? st.mins.x : st.maxs.x, cy = pl.n.y >= 0 ? st.mins.y : st.maxs.y, cz = pl.n.z >= 0 ? st.mins.z : st.maxs.z;
      const pen = pl.d - (pl.n.x * (st.pos.x + cx) + pl.n.y * (st.pos.y + cy) + pl.n.z * (st.pos.z + cz));
      if (pen > -0.5 && pen < best) { best = pen; bn = pl.n; }
    }
    if (!bn || best > PHYSICS.stepSize) return false;
    const p = this.t1.copy(st.pos).addScaled(bn, Math.max(0, best) + 0.05);
    if (this.world.boxSolid(p, st.mins, st.maxs)) return false;
    st.pos.copy(p);
    const into = st.vel.dot(bn);
    if (into < 0) st.vel.addScaled(bn, -into);
    st.surfing = true; st.surfNormal.copy(bn);
    return true;
  }

  /** Ground move with stair stepping and slope sticking. */
  private walkMove(st: PhysState, dt: number) {
    st.vel.y = 0;
    const spd = st.vel.len();
    if (spd < 1) { st.vel.set(0, 0, 0); return; }

    // try direct move first
    const dest = this.t1.set(st.pos.x + st.vel.x * dt, st.pos.y, st.pos.z + st.vel.z * dt);
    const direct = this.world.traceBox(st.pos, dest, st.mins, st.maxs, this.tr);
    if (direct.fraction === 1) { st.pos.copy(direct.endPos); this.stayOnGround(st); return; }

    // step move: compare plain slide vs stepped slide
    const startPos = st.pos.clone(), startVel = st.vel.clone();
    this.flyMove(st, dt, st.groundNormal);
    const downPos = st.pos.clone(), downVel = st.vel.clone();

    st.pos.copy(startPos); st.vel.copy(startVel);
    const up = this.t1.set(st.pos.x, st.pos.y + PHYSICS.stepSize, st.pos.z);
    const tu = this.world.traceBox(st.pos, up, st.mins, st.maxs, this.tr);
    if (!tu.startSolid && !tu.allSolid) st.pos.copy(tu.endPos);
    this.flyMove(st, dt, st.groundNormal);
    const down = this.t1.set(st.pos.x, st.pos.y - PHYSICS.stepSize - 1, st.pos.z);
    const td = this.world.traceBox(st.pos, down, st.mins, st.maxs, this.tr);
    if (!td.startSolid && !td.allSolid) st.pos.copy(td.endPos);
    if (td.fraction === 1 || td.normal.y < PHYSICS.walkableNormalY) {
      st.pos.copy(downPos); st.vel.copy(downVel); return;
    }
    const dDown = (downPos.x - startPos.x) ** 2 + (downPos.z - startPos.z) ** 2;
    const dUp = (st.pos.x - startPos.x) ** 2 + (st.pos.z - startPos.z) ** 2;
    if (dDown > dUp) { st.pos.copy(downPos); st.vel.copy(downVel); }
    else st.vel.y = downVel.y;
  }

  private stayOnGround(st: PhysState) {
    const start = this.t2.set(st.pos.x, st.pos.y + 2, st.pos.z);
    const end = this.t3.set(st.pos.x, st.pos.y - PHYSICS.stepSize, st.pos.z);
    const t = this.world.traceBox(start, end, st.mins, st.maxs, this.tr2);
    if (t.fraction > 0 && t.fraction < 1 && !t.startSolid && t.normal.y >= PHYSICS.walkableNormalY) {
      st.pos.y = t.endPos.y;
    }
  }
}

function clampUnit(v: number) { return v > 1 ? 1 : v < -1 ? -1 : v; }

/** Horizontal speed in u/s. */
export function hSpeed(st: PhysState): number { return Math.hypot(st.vel.x, st.vel.z); }
