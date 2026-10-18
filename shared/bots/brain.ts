// =============================================================
//  BotBrain — IA que gera PlayerInput como um jogador humano:
//  olhar (yaw/pitch) + teclas. Usa a mesma física e as mesmas armas.
// =============================================================
import { V3, DEG, yawFromDir, angleDiff, forwardFromAngles, rightFromYaw } from '../math/vec3';
import { BOT_SKILL, BotDifficulty, BotSkill } from '../config/match';
import { WEAPONS, WeaponId, SLOT_NADES } from '../config/weapons';
import type { NavPoint, BotRoute } from '../maps/types';
import { emptyCmd } from '../physics/movement';
import { steerToward } from './steer';
import type { Player } from '../sim/player';
import type { World } from '../sim/world';

type Mode = 'route' | 'roam' | 'idle';

const WEAPON_PRIORITY: Record<WeaponId, number> = { rifle: 5, sniper: 4, smg: 3, shotgun: 2, pistol: 1, knife: 0 };

export class BotBrain {
  skill: BotSkill;
  mode: Mode = 'idle';
  route: BotRoute | null = null;
  routeIdx = 0;
  roamTarget: NavPoint | null = null;
  target: Player | null = null;
  seenTime = 0;          // how long the current target has been visible
  lostTime = 0;
  aimErrYaw = 0; aimErrPitch = 0; aimErrTimer = 0;
  aimHead = false;
  strafeDir = 1; strafeTimer = 0;
  burstLeft = 0; burstPause = 0;
  thinkTimer = 0;
  stuckTimer = 0; lastPos = new V3();
  noEnemyTime = 0;
  lookYaw = 0; lookPitch = 0;
  private steerCmd = emptyCmd();
  private tmp = new V3(); private tmp2 = new V3();
  private rand: () => number;

  constructor(public world: World, public p: Player, difficulty: BotDifficulty, public dummy = false) {
    this.skill = BOT_SKILL[difficulty];
    this.rand = world.rng;
  }

  onRoundStart() {
    const routes = this.world.map.routes[this.p.team];
    this.route = routes[Math.floor(this.rand() * routes.length)];
    this.routeIdx = 0;
    this.mode = 'route';
    this.target = null;
    this.lookYaw = this.p.yaw; this.lookPitch = 0;
    this.roamTarget = null;
    this.noEnemyTime = 0;
  }

  think(dt: number) {
    const p = this.p, w = this.world, inp = p.input;
    inp.fire = false; inp.alt = false; inp.reload = false; inp.use = false; inp.ability = false; inp.drop = false; inp.slot = null;
    if (!p.alive) return;

    if (this.dummy) { this.thinkDummy(dt); return; }
    if (p.frozen) { inp.cmd.forward = 0; inp.cmd.side = 0; inp.cmd.yaw = p.yaw; return; }

    // ---------- perception (10 Hz) ----------
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.1;
      this.perceive();
    }
    if (this.target && (!this.target.alive || this.target.inDuel !== p.inDuel)) this.target = null;

    // ---------- movement ----------
    const steer = this.steerCmd;
    let moveGoal: NavPoint | null = null, prev: V3 | null = null;
    if (p.inDuel >= 0 && this.target) {
      moveGoal = { p: this.target.phys.pos, mode: 'walk', r: 250 };
    } else if (this.mode === 'route' && this.route) {
      moveGoal = this.route.points[this.routeIdx];
      prev = this.routeIdx > 0 ? this.route.points[this.routeIdx - 1].p : null;
    } else if (this.mode === 'roam') {
      if (!this.roamTarget) this.pickRoamTarget();
      moveGoal = this.roamTarget;
    }
    if (p.phys.pos.y < -1500 && p.inDuel < 0) {
      // fell to the recovery layer: head to the nearest recovery pad
      moveGoal = { p: this.nearestRecoveryPad(), mode: 'walk', r: 40 };
      prev = null;
    }

    if (moveGoal) {
      const res = steerToward(p.phys, moveGoal, prev, steer, dt, this.skill.surfAssist);
      if (res.reached) {
        if (this.mode === 'route' && this.route && moveGoal === this.route.points[this.routeIdx]) {
          this.routeIdx++;
          if (this.routeIdx >= this.route.points.length) { this.mode = 'roam'; this.roamTarget = null; }
        } else if (this.mode === 'roam' && moveGoal === this.roamTarget) {
          this.roamTarget = null;
        }
      }
    } else { steer.forward = 0; steer.side = 0; steer.yaw = p.yaw; steer.jump = false; }

    // engage: strafe on the ground while fighting
    const fighting = !!this.target && this.seenTime > this.skill.reaction;
    const cw = p.currentWeapon();
    const knifeOnly = !!cw && !!WEAPONS[cw.id].melee && w.firstWeaponSlot(p) === p.slot;
    let sprintWish = !fighting && this.mode === 'roam' && p.phys.onGround;
    if (fighting && p.phys.onGround) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeDir = this.rand() < 0.5 ? -1 : 1; this.strafeTimer = 0.35 + this.rand() * 0.7; }
      const toT = this.tmp.copy(this.target!.phys.pos).sub(p.phys.pos);
      const dist = toT.hLen();
      const ty = yawFromDir(toT.x, toT.z);
      steer.yaw = ty;
      if (knifeOnly) {
        // só com a faca: corre direto para o inimigo e só para de correr perto dele
        steer.forward = dist > 45 ? 1 : 0;
        steer.side = dist > 200 ? this.strafeDir * 0.35 : 0;
        sprintWish = dist > 320;
      } else {
        steer.forward = dist > 1400 ? 1 : dist < 300 ? -0.6 : 0;
        steer.side = this.strafeDir;
        if (this.skill.abilityUse > 0.6 && this.rand() < 0.004) steer.jump = true;
      }
    }

    // ---------- look / aim ----------
    let wantYaw = steer.yaw, wantPitch = 0;
    if (this.target && this.seenTime > this.skill.reaction * 0.5) {
      const aim = this.aimPoint(this.target);
      const eye = p.eyePos(this.tmp2);
      const d = aim.sub(eye);
      wantYaw = yawFromDir(d.x, d.z) + this.aimErrYaw * DEG;
      wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.aimErrPitch * DEG;
      // recoil control (better bots compensate more)
      const rc = Math.min(1, this.skill.aimSpeed / 600);
      wantPitch -= p.punchPitch * DEG * rc;
      wantYaw -= p.punchYaw * DEG * rc;
      this.aimErrTimer -= dt;
      if (this.aimErrTimer <= 0) {
        this.aimErrTimer = 0.35 + this.rand() * 0.3;
        const e = this.skill.aimError * Math.max(0.35, 1 - this.seenTime * 0.4);
        this.aimErrYaw = (this.rand() * 2 - 1) * e;
        this.aimErrPitch = (this.rand() * 2 - 1) * e * 0.6;
        this.aimHead = this.rand() < this.skill.headshotBias;
      }
      const maxTurn = this.skill.aimSpeed * DEG * dt;
      this.lookYaw += clampAbs(angleDiff(this.lookYaw, wantYaw), maxTurn);
      this.lookPitch += clampAbs(wantPitch - this.lookPitch, maxTurn);
    } else {
      // natural look: follow movement direction smoothly
      const maxTurn = 540 * DEG * dt;
      this.lookYaw += clampAbs(angleDiff(this.lookYaw, wantYaw), maxTurn);
      this.lookPitch += clampAbs(-this.lookPitch * 0.5, maxTurn);
    }

    // convert steering wish (relative to steer.yaw) into keys relative to the actual look yaw
    const sf = forwardFromAngles(steer.yaw, 0, this.tmp), sr = rightFromYaw(steer.yaw, this.tmp2);
    const wx = sf.x * steer.forward + sr.x * steer.side, wz = sf.z * steer.forward + sr.z * steer.side;
    const lf = forwardFromAngles(this.lookYaw, 0, new V3()), lr = rightFromYaw(this.lookYaw, new V3());
    let fwd = wx * lf.x + wz * lf.z, side = wx * lr.x + wz * lr.z;
    const m = Math.max(Math.abs(fwd), Math.abs(side));
    if (m > 0.01) { fwd /= m; side /= m; }
    inp.cmd.forward = fwd; inp.cmd.side = side;
    inp.cmd.yaw = this.lookYaw; inp.cmd.pitch = this.lookPitch;
    inp.cmd.jump = steer.jump; inp.cmd.crouch = false;
    // tactical sprint when travelling on foot (it raises the weapon, so never while trading shots)
    inp.cmd.sprint = sprintWish && fwd > 0.5;

    // ---------- weapons ----------
    this.handleWeapons(dt, fighting);
    this.handleAbility(fighting);
    this.handlePickups();
    this.checkStuck(dt);
  }

  private thinkDummy(dt: number) {
    const inp = this.p.input;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeDir *= -1; this.strafeTimer = 1.2; }
    inp.cmd.forward = 0;
    inp.cmd.side = this.strafeDir * 0.5;
    inp.cmd.yaw = this.p.yaw;
    inp.cmd.jump = false;
  }

  private perceive() {
    const p = this.p, w = this.world;
    const eye = p.eyePos(new V3());
    const fwd = forwardFromAngles(p.yaw, 0, new V3());
    let best: Player | null = null, bestD = Infinity;
    const predatorSense = p.classId === 'predator' && p.abilityActive > 0;
    for (const q of w.players) {
      if (!q.alive || q.team === p.team || q.inDuel !== p.inDuel) continue;
      const qe = q.eyePos(new V3()); qe.y -= 10;
      const d = qe.distTo(eye);
      if (d > this.skill.viewDistance) continue;
      const to = qe.clone().sub(eye).normalize();
      const inFov = to.x * fwd.x + to.z * fwd.z > -0.2 || q.id === p.lastAttacker;
      if (!inFov) continue;
      const tr = w.collision.traceRay(eye, qe, undefined, 'glass');
      if (tr.fraction < 1) { if (!(predatorSense && d < 2000)) continue; }
      else if (w.smokeBlocks(eye, qe)) continue;
      const score = d * (q === this.target ? 0.7 : 1);
      if (score < bestD) { bestD = score; best = q; }
    }
    if (best) {
      if (best !== this.target) { this.seenTime = 0; this.target = best; }
      else this.seenTime += 0.1;
      this.lostTime = 0;
      this.noEnemyTime = 0;
    } else {
      this.lostTime += 0.1;
      this.noEnemyTime += 0.1;
      if (this.lostTime > 1.2) { this.target = null; this.seenTime = 0; }
      else if (this.target) this.seenTime = Math.max(0, this.seenTime - 0.1);
    }
  }

  private aimPoint(t: Player): V3 {
    const base = t.phys.pos.clone();
    // lead slightly with target velocity (bots predict like players do)
    const lead = this.skill.aimSpeed > 400 ? 0.06 : 0.02;
    base.addScaled(t.phys.vel, lead);
    base.y += this.aimHead ? t.phys.maxs.y - 8 : t.phys.maxs.y * 0.6;
    return base;
  }

  private handleWeapons(dt: number, fighting: boolean) {
    const p = this.p, inp = p.input;
    // best weapon available: primary > pistol > knife
    const bestSlot = this.world.firstWeaponSlot(p);
    if (p.slot !== SLOT_NADES && p.slot !== bestSlot && p.switchTime <= 0) inp.slot = bestSlot;
    if (p.slot === SLOT_NADES) {
      if (fighting && p.switchTime <= 0 && p.fireCooldown <= 0) inp.fire = !p.prevInput.fire;
      else if (!fighting) inp.slot = bestSlot;
      return;
    }
    const w = p.currentWeapon();
    if (!w) return;
    const def = WEAPONS[w.id];
    if (def.melee) {
      if (!fighting) return;
      const t = this.target!;
      const d = t.phys.pos.distTo(p.phys.pos);
      const to = t.eyePos(new V3()).sub(p.eyePos(new V3())).normalize();
      const look = forwardFromAngles(this.lookYaw, this.lookPitch, new V3());
      if (d < def.melee.range + 20 && look.dot(to) > 0.85) {
        if (this.rand() < 0.25 * this.skill.abilityUse) inp.alt = !p.prevInput.alt; // heavy stab
        else inp.fire = true;
      }
      return;
    }
    if (!fighting) {
      if (w.mag < def.mag * 0.4 && w.reserve > 0 && p.reloadTime <= 0) inp.reload = true;
      if (p.zoomed) inp.alt = true;
      this.burstLeft = 0;
      return;
    }
    if (w.mag === 0 && w.reserve > 0) { inp.reload = true; return; }
    const t = this.target!;
    const eye = p.eyePos(new V3());
    const aim = this.aimPoint(t).sub(eye);
    const dist = aim.len();
    const lookDir = forwardFromAngles(this.lookYaw, this.lookPitch, new V3());
    const angErr = Math.acos(Math.max(-1, Math.min(1, lookDir.dot(aim.normalize())))) / DEG;
    const tolerance = Math.max(1.2, Math.atan2(16, dist) / DEG * 1.6) + this.skill.aimError * 0.4;
    // sniper: scope when the target is far
    if (def.zoom > 0 && def.id === 'sniper' && !p.zoomed && dist > 700 && p.fireCooldown <= 0) inp.alt = true;
    // grenade opportunity
    if (p.nades.he > 0 && dist > 400 && dist < 1100 && this.rand() < 0.003 * this.skill.abilityUse) { inp.slot = SLOT_NADES; return; }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (angErr < tolerance && p.fireCooldown <= 0) {
      if (def.auto) {
        inp.fire = true;
        if (p.prevInput.fire === false) this.burstLeft = this.skill.burst;
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = 0.15 + this.rand() * 0.25;
      } else {
        inp.fire = !p.prevInput.fire;
      }
    } else if (def.auto && p.prevInput.fire && angErr < tolerance * 2) inp.fire = true;
  }

  private handleAbility(fighting: boolean) {
    const p = this.p, inp = p.input;
    if (p.abilityCd > 0 || p.noAbilities || this.rand() > this.skill.abilityUse * 0.05) return;
    switch (p.classId) {
      case 'runner':
        if (fighting && this.target && this.target.phys.pos.distTo(p.phys.pos) > 700) inp.ability = true;
        else if (!p.phys.onGround && this.mode === 'route' && Math.hypot(p.phys.vel.x, p.phys.vel.z) < 500 && !p.phys.surfing) inp.ability = true;
        break;
      case 'jumper':
        if (fighting && p.hp < 45) inp.ability = true; // escape/reposition
        break;
      case 'predator':
        if (!this.target && this.noEnemyTime > 3 && this.mode === 'roam') inp.ability = true;
        break;
      case 'berserker':
        if (fighting && p.hp < 70) inp.ability = true;
        break;
    }
  }

  private handlePickups() {
    const p = this.p;
    const k = this.world.nearestWeaponPickup(p);
    if (!k || !k.weapon) return;
    const cur = p.weapons[WEAPONS[k.weapon].slot];
    if (!cur || WEAPON_PRIORITY[k.weapon] > WEAPON_PRIORITY[cur.id] || (cur.id === k.weapon && cur.reserve < WEAPONS[cur.id].mag)) p.input.use = true;
  }

  private pickRoamTarget() {
    const w = this.world, p = this.p;
    // go for a weapon if we only have the pistol (or just the knife: look further)
    if (!p.weapons[0]) {
      let best: V3 | null = null, bd = p.weapons[1] ? 2600 : 4200;
      for (const k of w.pickups) {
        if (!k.active || k.kind !== 'weapon') continue;
        if (Math.abs(k.pos.y - p.phys.pos.y) > 120) continue; // same level only
        const d = k.pos.distTo(p.phys.pos);
        if (d < bd) { bd = d; best = k.pos; }
      }
      if (best) { this.roamTarget = { p: best.clone(), mode: 'walk', r: 40 }; return; }
    }
    // otherwise a combat node on the same level
    const nodes = w.map.combatNodes.filter((n) => Math.abs(n.y - p.phys.pos.y) < 200);
    const list = nodes.length ? nodes : w.map.combatNodes;
    // bias toward the enemy half to make fights happen
    const enemyDir = p.team === 'blue' ? -1 : 1;
    let pick = list[Math.floor(this.rand() * list.length)];
    if (this.rand() < 0.5) {
      const ahead = list.filter((n) => n.z * enemyDir > p.phys.pos.z * enemyDir - 200);
      if (ahead.length) pick = ahead[Math.floor(this.rand() * ahead.length)];
    }
    this.roamTarget = { p: pick.clone(), mode: 'walk', r: 90 };
  }

  private nearestRecoveryPad(): V3 {
    let best = new V3(0, -1800, 0), bd = Infinity;
    for (const t of this.world.map.triggers) {
      if (t.kind !== 'teleport' || t.max.y > -1500) continue;
      const c = new V3((t.min.x + t.max.x) / 2, t.min.y, (t.min.z + t.max.z) / 2);
      const d = c.distTo(this.p.phys.pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  private checkStuck(dt: number) {
    const p = this.p;
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.5) {
      const moved = p.phys.pos.distTo(this.lastPos);
      this.lastPos.copy(p.phys.pos);
      this.stuckTimer = 0;
      if (moved < 40 && !p.frozen && (this.mode === 'roam' || (this.mode === 'route' && p.phys.onGround && this.routeIdx > 1))) {
        p.input.cmd.jump = true;
        this.roamTarget = null;
        if (this.mode === 'route') this.mode = 'roam';
      }
    }
  }
}

function clampAbs(v: number, m: number) { return v > m ? m : v < -m ? -m : v; }
