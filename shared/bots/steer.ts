// Movement steering for AI players. Produces the same MoveCmd a human would (look direction +
// WASD keys), so bots surf with the exact same physics. An optional "assist" (difficulty-scaled)
// gently rotates the horizontal velocity toward the target, compensating for imperfect timing.
import { V3, yawFromDir, angleDiff } from '../math/vec3';
import type { MoveCmd } from '../physics/movement';
import type { PhysState } from '../physics/movement';
import type { NavPoint } from '../maps/types';

export interface SteerResult { reached: boolean; }

const tmp = new V3();

export function steerToward(st: PhysState, target: NavPoint, prev: V3 | null, cmd: MoveCmd, dt: number, assistDegPerSec: number): SteerResult {
  const dx = target.p.x - st.pos.x, dz = target.p.z - st.pos.z;
  const dist = Math.hypot(dx, dz);
  const r = target.r ?? 80;
  let reached = dist < r;
  if (!reached && prev) {
    // passed the waypoint along the segment direction?
    tmp.set(target.p.x - prev.x, 0, target.p.z - prev.z);
    const segLen = tmp.hLen();
    if (segLen > 1) {
      const along = ((st.pos.x - target.p.x) * tmp.x + (st.pos.z - target.p.z) * tmp.z) / segLen;
      if (along > 0) reached = true;
    }
  }
  const desiredYaw = yawFromDir(dx, dz);
  cmd.forward = 0; cmd.side = 0; cmd.jump = false; cmd.crouch = false;

  const hs = Math.hypot(st.vel.x, st.vel.z);
  const velYaw = hs > 1 ? yawFromDir(st.vel.x, st.vel.z) : desiredYaw;

  if (target.mode === 'walk' && st.onGround) {
    cmd.yaw = desiredYaw;
    cmd.forward = 1;
  } else if (st.surfing) {
    // Like a human surfer: look along the ramp (its horizontal tangent), biased a little toward
    // the target, and hold the strafe key that points INTO the ramp.
    const nh = Math.hypot(st.surfNormal.x, st.surfNormal.z) || 1;
    const nx = st.surfNormal.x / nh, nz = st.surfNormal.z / nh;
    let tx = -nz, tz = nx;
    if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
    const tangentYaw = yawFromDir(tx, tz);
    cmd.yaw = tangentYaw + Math.max(-0.45, Math.min(0.45, angleDiff(tangentYaw, desiredYaw)));
    // right vector for yaw: (cos, 0, -sin)
    const rx = Math.cos(cmd.yaw), rz = -Math.sin(cmd.yaw);
    // Height control: the route's surf waypoints sit on the face. Above the line → let gravity
    // pull us down the face (gains speed); below it → hold the key into the ramp to climb back.
    let refY = target.p.y;
    if (prev) {
      const sx = target.p.x - prev.x, sz = target.p.z - prev.z;
      const L2 = sx * sx + sz * sz;
      if (L2 > 1) {
        const k = Math.max(0, Math.min(1, ((st.pos.x - prev.x) * sx + (st.pos.z - prev.z) * sz) / L2));
        refY = prev.y + (target.p.y - prev.y) * k;
      }
    }
    const outward = st.vel.x * nx + st.vel.z * nz;
    const above = st.pos.y - refY;
    if (above < -20 || (above < 60 && outward > 20) || outward > 220) cmd.side = rx * -nx + rz * -nz > 0 ? 1 : -1;
  } else if (!st.onGround) {
    // air strafe: look along velocity, strafe toward the turn
    const turn = angleDiff(velYaw, desiredYaw);
    if (Math.abs(turn) > 0.05) {
      cmd.side = turn > 0 ? -1 : 1; // positive yaw = left turn → hold A
      cmd.yaw = velYaw + (turn > 0 ? 1 : -1) * 0.12;
    } else {
      cmd.yaw = velYaw;
    }
  } else {
    // on ground but target is surf/air: walk to it (e.g. walking off a ledge)
    cmd.yaw = desiredYaw;
    cmd.forward = 1;
  }

  // assist: rotate horizontal velocity toward the desired direction (bots only)
  if (assistDegPerSec > 0 && !st.onGround && !st.surfing && hs > 50) {
    const turn = angleDiff(velYaw, desiredYaw);
    const maxRot = assistDegPerSec * Math.PI / 180 * dt;
    const rot = Math.max(-maxRot, Math.min(maxRot, turn));
    const ny = velYaw + rot;
    st.vel.x = -Math.sin(ny) * hs;
    st.vel.z = -Math.cos(ny) * hs;
  }
  return { reached };
}
