// =============================================================
//  BotBrain — IA que gera PlayerInput como um jogador humano:
//  olhar (yaw/pitch) + teclas. Usa a mesma física e as mesmas armas.
//  Rodada 11: mira humanizada (HumanAim: reação com cauda, flick + correções com mola, tremor,
//  lead e recuo aprendidos), personalidade por bot, strafe irregular, olhar ocioso e audição.
//  O bot só mira/atira em quem viu (linha de visão); o que ouve só faz ele olhar para lá.
// =============================================================
import { V3, DEG, yawFromDir, angleDiff, forwardFromAngles, rightFromYaw, makeRng } from '../math/vec3';
import { BOT_SKILL, BOT_AIM, BOT_HEARING, BOT_LASER, BotDifficulty, BotSkill, BotAim } from '../config/match';
import { wdef } from '../sim/player';
import { WEAPONS, WeaponId, SLOT_NADES, SLOT_KNIFE, SLOT_TASER, ITEMS } from '../config/weapons';
import type { NavPoint, BotRoute } from '../maps/types';
import { emptyCmd } from '../physics/movement';
import { steerToward } from './steer';
import { HumanAim, SmoothNoise, gauss } from './aim';
import { Player, hitboxes } from '../sim/player';
import type { World } from '../sim/world';

type Mode = 'route' | 'roam' | 'idle';

const WEAPON_PRIORITY: Record<WeaponId, number> = { rifle: 5, sniper: 4, smg: 3, shotgun: 2, pistol: 1, knife: 0, taser: 0 };

/** Jeito de jogar de cada bot (sorteado com a seed). */
export interface BotPersonality {
  /** 0 = cauteloso, 1 = agressivo */
  aggression: number;
  /** distância preferida para lutar (u) */
  prefDist: number;
  /** multiplicador da tendência a mirar na cabeça */
  headMul: number;
  /** multiplicador do erro sob dano */
  nervousMul: number;
  /** duração média de cada trecho de strafe (s) */
  strafeMean: number;
  /** chance de agachar numa troca de tiros e de pular de vez em quando */
  crouchChance: number;
  jumpChance: number;
  /** chance de parar para atirar (counter-strafe) a média/longa distância */
  stopChance: number;
}

export class BotBrain {
  skill: BotSkill;
  aimCfg: BotAim;
  aim: HumanAim;
  persona: BotPersonality;
  mode: Mode = 'idle';
  route: BotRoute | null = null;
  routeIdx = 0;
  roamTarget: NavPoint | null = null;
  target: Player | null = null;
  seenTime = 0;          // tempo vendo o alvo atual
  lostTime = 0;          // tempo desde que perdeu o alvo de vista
  /** o alvo atual está visível agora (linha de visão) */
  hasLos = false;
  /** onde o alvo foi visto pela última vez (e com que velocidade) */
  lastSeen = new V3(); lastSeenVel = new V3();
  /** tempo de reação que falta para começar a mirar no alvo atual */
  reactLeft = 0;
  /** já começou a mirar (flick feito) no alvo atual */
  engaged = false;
  /** tempo para estabilizar antes do 1º tiro neste encontro (média/longa) */
  stableNeed = 0;
  /** reações sorteadas (para os testes) */
  reactions: number[] = [];
  strafeDir = 1; strafeTimer = 0; strafeStop = 0;
  /** parado para atirar (counter-strafe) por este tempo; e se a próxima rajada vai ser parada */
  holdStill = 0; counterNext = false;
  crouching = false; crouchTimer = 0;
  burstLeft = 0; burstPause = 0;
  thinkTimer = 0;
  stuckTimer = 0; lastPos = new V3();
  noEnemyTime = 0;
  /** olhar ocioso: para onde olhar e por quanto tempo */
  idleYaw = 0; idlePitch = 0; idleTimer = 0;
  heard: { pos: V3; time: number } | null = null;
  private aimH = 0.62; private aimHGoal = 0.62; private aimSide = 0; private aimSideGoal = 0; private aimPointTimer = 0;
  private hurt = 0; private lastHp = 0;
  private leadN: SmoothNoise; private recoilN: SmoothNoise;
  private time = 0;
  private steerCmd = emptyCmd();
  private tmp = new V3(); private tmp2 = new V3();
  /** PRNG da partida (rotas e escolhas de mapa) e PRNG próprio do bot (mira, personalidade) */
  private rand: () => number;
  private r: () => number;

  constructor(public world: World, public p: Player, difficulty: BotDifficulty, public dummy = false) {
    this.skill = BOT_SKILL[difficulty];
    this.aimCfg = BOT_AIM[difficulty];
    this.rand = world.rng;
    this.r = makeRng(Math.floor(world.rng() * 2147483646) + 1);
    this.aim = new HumanAim(this.aimCfg, this.r);
    this.leadN = new SmoothNoise(this.r); this.recoilN = new SmoothNoise(this.r);
    const r = this.r;
    const aggression = r();
    this.persona = {
      aggression,
      prefDist: 500 + (1 - aggression) * 1100 + r() * 300,
      headMul: 0.7 + r() * 0.6,
      nervousMul: 0.5 + r(),
      strafeMean: 0.3 + r() * 0.5,
      crouchChance: 0.1 + r() * 0.3,
      jumpChance: 0.05 + r() * 0.2 * aggression,
      stopChance: 0.3 + r() * 0.5,
    };
    this.lastHp = p.hp;
  }

  get lookYaw() { return this.aim.outYaw; }
  get lookPitch() { return this.aim.outPitch; }
  resetLook(yaw: number, pitch: number) { this.aim.reset(yaw, pitch); this.idleYaw = yaw; this.idlePitch = pitch; }

  onRoundStart() {
    const routes = this.world.map.routes[this.p.team];
    this.route = routes[Math.floor(this.rand() * routes.length)];
    this.routeIdx = 0;
    this.mode = 'route';
    this.target = null; this.engaged = false;
    this.resetLook(this.p.yaw, 0);
    this.roamTarget = null;
    this.noEnemyTime = 0;
    this.heard = null;
  }

  think(dt: number) {
    const p = this.p, w = this.world, inp = p.input;
    inp.fire = false; inp.alt = false; inp.aim = null; inp.reload = false; inp.use = false; inp.ability = false; inp.drop = false; inp.slot = null;
    if (!p.alive) return;

    if (this.dummy) { this.thinkDummy(dt); return; }
    if (p.frozen) { inp.cmd.forward = 0; inp.cmd.side = 0; inp.cmd.yaw = p.yaw; return; }
    this.time += dt;
    // susto: tomar dano deixa a mira pior por um tempo (nervosismo)
    if (p.hp < this.lastHp) this.hurt = Math.min(1.5, this.hurt + (this.lastHp - p.hp) / 60);
    this.lastHp = p.hp;
    this.hurt = Math.max(0, this.hurt - dt * 0.6);

    // ---------- percepção (10 Hz) ----------
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.1;
      this.perceive();
    }
    if (this.target && (!this.target.alive || this.target.inDuel !== p.inDuel)) { this.target = null; this.engaged = false; }
    if (this.target && this.reactLeft > 0) this.reactLeft -= dt;
    const reacted = !!this.target && this.reactLeft <= 0;

    // ---------- movimento ----------
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

    const fighting = reacted && this.hasLos;
    const knifeOnly = w.firstWeaponSlot(p) === SLOT_KNIFE;
    let crouch = false;
    if (reacted && p.phys.onGround) {
      const toT = this.tmp.copy(this.hasLos ? this.target!.phys.pos : this.lastSeen).sub(p.phys.pos);
      const dist = toT.hLen();
      steer.yaw = yawFromDir(toT.x, toT.z);
      if (knifeOnly) {
        // só com a faca: corre direto para o inimigo e só para de correr perto dele
        steer.forward = dist > 45 ? 1 : 0;
        steer.side = dist > 200 ? this.strafeDir * 0.35 : 0;
        this.nextStrafe(dt);
      } else {
        const pd = this.persona.prefDist;
        steer.forward = dist > pd * 1.5 ? 1 : dist < pd * 0.45 ? -0.7 : (this.persona.aggression > 0.6 && dist > pd ? 0.5 : 0);
        this.nextStrafe(dt);
        steer.side = this.strafeStop > 0 ? 0 : this.strafeDir;
        // counter-strafe: para de andar para atirar (rajada) e para estabilizar o 1º tiro a média/longa distância
        if (this.holdStill > 0) { this.holdStill -= dt; steer.side = 0; if (steer.forward > 0) steer.forward = 0; }
        else if (fighting && dist > 600 && this.aim.sinceFlick < this.stableNeed + 0.15 && this.counterNext) steer.side = 0;
        // agacha às vezes no meio da troca de tiros (curta/média)
        this.crouchTimer -= dt;
        if (this.crouchTimer <= 0) { this.crouching = fighting && dist < 1200 && this.r() < this.persona.crouchChance; this.crouchTimer = 0.6 + this.r() * 1.4; }
        crouch = this.crouching;
        if (fighting && this.r() < this.persona.jumpChance * dt) steer.jump = true;
      }
    }

    // ---------- olhar / mira ----------
    this.updateLook(dt, steer.yaw);

    // converte o desejo de movimento (relativo a steer.yaw) em teclas relativas ao olhar
    const ly = this.lookYaw;
    const sf = forwardFromAngles(steer.yaw, 0, this.tmp), sr = rightFromYaw(steer.yaw, this.tmp2);
    const wx = sf.x * steer.forward + sr.x * steer.side, wz = sf.z * steer.forward + sr.z * steer.side;
    const lf = forwardFromAngles(ly, 0, new V3()), lr = rightFromYaw(ly, new V3());
    let fwd = wx * lf.x + wz * lf.z, side = wx * lr.x + wz * lr.z;
    const m = Math.max(Math.abs(fwd), Math.abs(side));
    if (m > 0.01) { fwd /= m; side /= m; }
    inp.cmd.forward = fwd; inp.cmd.side = side;
    inp.cmd.yaw = ly; inp.cmd.pitch = this.lookPitch;
    inp.cmd.jump = steer.jump; inp.cmd.crouch = crouch;
    inp.cmd.walk = false; // bots never walk (the sprint is automatic)

    // ---------- armas ----------
    this.handleWeapons(dt, fighting);
    // a mão tremer no instante do clique (o tiro sai um pouco fora de onde o bot "via")
    if (inp.fire && !p.prevInput.fire || (inp.fire && p.fireCooldown <= 0)) {
      const j = this.aimCfg.clickJitter * DEG;
      inp.cmd.yaw += gauss(this.r) * j; inp.cmd.pitch += gauss(this.r) * j * 0.7;
    }
    this.handleAbility(fighting);
    this.handlePickups();
    this.checkStuck(dt);
  }

  /** Trechos de strafe com duração irregular, paradas curtas e trocas de lado nem sempre alternadas. */
  private nextStrafe(dt: number) {
    this.strafeTimer -= dt;
    if (this.strafeStop > 0) this.strafeStop -= dt;
    if (this.strafeTimer <= 0) {
      const r = this.r;
      this.strafeTimer = this.persona.strafeMean * Math.exp(gauss(r) * 0.45);
      if (r() < 0.22) this.strafeStop = 0.12 + r() * 0.3;
      if (r() < 0.75) this.strafeDir = -this.strafeDir as 1 | -1;
    }
  }

  /** Velocidade angular aproximada do alvo vista daqui (rad/s), com o erro de leitura do bot. */
  private angVel(t: Player): { yaw: number; pitch: number } {
    const to = t.phys.pos.clone().sub(this.p.phys.pos);
    const d = Math.max(50, to.hLen());
    const rt = rightFromYaw(yawFromDir(to.x, to.z), new V3());
    const lateral = t.phys.vel.x * rt.x + t.phys.vel.z * rt.z;
    const k = 1 + this.aimCfg.leadError * gauss(this.r) * 0.5;
    return { yaw: (-lateral / d) * k, pitch: (t.phys.vel.y / d) * k * 0.5 };
  }

  /** Ângulos para mirar num ponto a partir do olho. */
  private anglesTo(pt: V3): { yaw: number; pitch: number; dist: number } {
    const eye = this.p.eyePos(this.tmp2);
    const d = pt.clone().sub(eye);
    return { yaw: yawFromDir(d.x, d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)), dist: d.len() };
  }

  private updateLook(dt: number, moveYaw: number) {
    const p = this.p, c = this.aimCfg, t = this.target;
    if (t && this.reactLeft > 0 && this.hasLos) {
      // viu e ainda está reagindo: a mão fica onde estava (sem continuar o olhar ocioso)
      this.aim.update(dt, null, { noiseMul: 1 });
      return;
    }
    if (t && this.reactLeft <= 0) {
      // ponto de mira: corpo/ombro/cabeça mudando devagar; lead e recuo aprendidos (com erro)
      this.aimPointTimer -= dt;
      if (this.aimPointTimer <= 0) {
        this.aimPointTimer = 0.9 + this.r() * 1.6;
        const head = this.r() < Math.min(0.95, this.skill.headshotBias * this.persona.headMul);
        this.aimHGoal = head ? 0.9 : 0.5 + this.r() * 0.2;
        this.aimSideGoal = head ? 0 : (this.r() * 2 - 1) * 6;
      }
      const k = 1 - Math.exp(-dt * 3);
      this.aimH += (this.aimHGoal - this.aimH) * k; this.aimSide += (this.aimSideGoal - this.aimSide) * k;
      let pt: V3;
      if (this.hasLos) {
        // lead aprendido: compensa o próprio atraso de rastreamento, com erro proporcional à dificuldade
        const lead = c.trackLag * 0.5 * (1 + c.leadError * this.leadN.at(this.time * 0.6) * 1.5);
        pt = t.phys.pos.clone().addScaled(t.phys.vel, lead);
        pt.y += t.phys.maxs.y * this.aimH;
        const rt = rightFromYaw(this.lookYaw, new V3());
        pt.addScaled(rt, this.aimSide);
      } else {
        // perdeu de vista: continua mirando onde ele sumiu (um pouco adiante) por um instante
        pt = this.lastSeen.clone().addScaled(this.lastSeenVel, Math.min(this.lostTime, c.preAim) * 0.5);
        pt.y += t.phys.maxs.y * this.aimH;
      }
      const a = this.anglesTo(pt);
      // controle de recuo aprendido: compensa parte do soco, com erro que cresce na rajada
      const rc = c.recoilControl * (1 + c.recoilError * (this.recoilN.at(this.time * 0.8) + Math.min(1, p.shotsFired / 12) * 0.8));
      a.pitch -= p.punchPitch * DEG * rc;
      a.yaw -= p.punchYaw * DEG * rc;
      if (!this.engaged) {
        this.engaged = true;
        this.aim.forgetTarget();
        this.aim.startFlick(a.yaw, a.pitch, Math.atan2(18, a.dist), this.angVel(t).yaw, this.angVel(t).pitch);
      } else if (this.aim.phase !== 'flick') {
        const err = Math.hypot(angleDiff(this.aim.yaw, a.yaw), a.pitch - this.aim.pitch) / DEG;
        if (err > 20) { const [vy, vp] = this.aim.targetVel; this.aim.startFlick(a.yaw, a.pitch, Math.atan2(18, a.dist), vy, vp); } // o alvo "pulou": novo flick
      }
      this.aim.update(dt, a, { noiseMul: 1 + c.nervous * this.persona.nervousMul * this.hurt });
      return;
    }
    // olhar ocioso: direção do movimento na maior parte do tempo, ângulos prováveis, sons e conferidas
    this.idleTimer -= dt;
    const flying = !p.phys.onGround || p.phys.surfing;
    if (this.idleTimer <= 0) {
      const r = this.r;
      this.idleTimer = 0.6 + r() * 1.6;
      const heard = this.heard && this.world.time - this.heard.time < 2.5 ? this.heard : null;
      const roll = r();
      if (heard && roll < 0.8) {
        const a = this.anglesTo(heard.pos.clone().add(new V3(0, 40, 0)));
        this.idleYaw = a.yaw; this.idlePitch = a.pitch;
      } else if (flying || roll < 0.5) {
        this.idleYaw = moveYaw + (r() * 2 - 1) * 0.15; this.idlePitch = -0.05 + (r() * 2 - 1) * 0.08;
      } else if (roll < 0.8) {
        // um ângulo provável: um ponto de combate ou entrada de rampa à frente
        const nodes = this.world.map.combatNodes;
        let best: V3 | null = null, bs = -Infinity;
        for (let i = 0; i < 6 && nodes.length; i++) {
          const n = nodes[Math.floor(r() * nodes.length)];
          const d = n.clone().sub(p.phys.pos), dist = d.hLen();
          if (dist < 300 || dist > 4000) continue;
          const off = Math.abs(angleDiff(moveYaw, yawFromDir(d.x, d.z)));
          const sc = -off - dist / 8000;
          if (off < 1.9 && sc > bs) { bs = sc; best = n; }
        }
        if (best) { const a = this.anglesTo(best.clone().add(new V3(0, 50, 0))); this.idleYaw = a.yaw; this.idlePitch = a.pitch; }
        else { this.idleYaw = moveYaw; this.idlePitch = 0; }
      } else {
        // confere o lado
        this.idleYaw = moveYaw + (r() < 0.5 ? -1 : 1) * (1.0 + r() * 0.9); this.idlePitch = (r() * 2 - 1) * 0.1;
        this.idleTimer = 0.4 + r() * 0.5;
      }
    }
    // no ar / surfando, a direção do movimento manda (mantém o surf estável)
    if (flying && Math.abs(angleDiff(this.idleYaw, moveYaw)) > 0.5) this.idleYaw = moveYaw;
    this.aim.update(dt, { yaw: this.aim.yaw + angleDiff(this.aim.yaw, this.idleYaw), pitch: this.idlePitch }, { stiffMul: flying ? 0.6 : 0.3, lagMul: 0.5 });
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

  /** Reação a um alvo novo: log-normal (cauda longa), mais lenta na periferia e contra quem surfa. */
  private sampleReaction(q: Player, switching: boolean): number {
    const c = this.aimCfg, p = this.p;
    const to = q.phys.pos.clone().sub(p.phys.pos);
    const off = Math.abs(angleDiff(this.lookYaw, yawFromDir(to.x, to.z))) / DEG;
    const qs = Math.hypot(q.phys.vel.x, q.phys.vel.z);
    let t = c.reactionMedian * Math.exp(gauss(this.r) * c.reactionSigma);
    t *= 1 + c.reactionPeriph * Math.min(1, off / 90);
    t *= 1 + c.reactionSpeed * Math.min(1, qs / 1500);
    if (switching) t += c.switchDelay;
    this.reactions.push(t);
    if (this.reactions.length > 50) this.reactions.shift();
    return t;
  }

  private perceive() {
    const p = this.p, w = this.world;
    const eye = p.eyePos(new V3());
    const fwd = forwardFromAngles(this.lookYaw, 0, new V3());
    let best: Player | null = null, bestD = Infinity;
    const predatorSense = p.classId === 'predator' && p.abilityActive > 0;
    for (const q of w.players) {
      if (!q.alive || q.team === p.team || q.inDuel !== p.inDuel) continue;
      const qe = q.eyePos(new V3()); qe.y -= 10;
      const d = qe.distTo(eye);
      // audição: passos de quem corre perto (sem precisar ver) — só faz o bot olhar para lá
      if (d < BOT_HEARING.step && q.phys.onGround && Math.hypot(q.phys.vel.x, q.phys.vel.z) > 150 && !q.walking) this.heard = { pos: q.phys.pos.clone(), time: w.time };
      const qw = q.currentWeapon();
      const laser = !!qw && !!wdef(qw).fx.laser;
      if (d > this.skill.viewDistance * (laser ? BOT_LASER.viewMul : 1)) continue;
      const to = qe.clone().sub(eye).normalize();
      const inFov = to.x * fwd.x + to.z * fwd.z > -0.2 || q.id === p.lastAttacker || (laser && BOT_LASER.anyAngle);
      if (!inFov) continue;
      const tr = w.collision.traceRay(eye, qe, undefined, 'glass');
      // só vê quem tem linha de visão (o sentido do PREDATOR, habilidade da classe, revela até 2000 u)
      if (tr.fraction < 1) { if (!(predatorSense && d < 2000)) continue; }
      else if (w.smokeBlocks(eye, qe)) continue;
      const score = d * (q === this.target ? 0.7 : 1);
      if (score < bestD) { bestD = score; best = q; }
    }
    // tiros e pulos ouvidos
    for (let i = w.noises.length - 1; i >= 0; i--) {
      const n = w.noises[i];
      if (w.time - n.time > 0.3) break;
      const q = w.player(n.pid);
      if (!q || q.team === p.team) continue;
      if (n.pos.distTo(p.phys.pos) < (n.kind === 'shot' ? (n.suppressed ? BOT_HEARING.shotSuppressed : BOT_HEARING.shot) : BOT_HEARING.jump)) { this.heard = { pos: n.pos.clone(), time: n.time }; break; }
    }
    this.hasLos = !!best;
    if (best) {
      if (best !== this.target) {
        const switching = !!this.target && this.engaged;
        this.target = best; this.seenTime = 0; this.engaged = false;
        this.reactLeft = this.sampleReaction(best, switching);
        const d = best.phys.pos.distTo(p.phys.pos);
        const [a, b] = this.aimCfg.stabilize;
        this.stableNeed = d > 600 ? a + (b - a) * this.r() : 0;
        this.counterNext = this.r() < this.aimCfg.counterStrafe;
      } else if (this.lostTime > 0.6 && this.engaged) {
        // reapareceu depois de um tempo sumido: reage de novo (mais rápido: já sabia que ele estava ali)
        this.reactLeft = this.sampleReaction(best, false) * 0.5; this.engaged = false;
      } else this.seenTime += 0.1;
      this.lastSeen.copy(best.phys.pos); this.lastSeenVel.copy(best.phys.vel);
      this.lostTime = 0;
      this.noEnemyTime = 0;
    } else {
      this.lostTime += 0.1;
      this.noEnemyTime += 0.1;
      if (this.lostTime > 1.2) { this.target = null; this.seenTime = 0; this.engaged = false; }
    }
  }

  private handleWeapons(dt: number, fighting: boolean) {
    const p = this.p, inp = p.input;
    // best weapon available: primary > pistol > knife
    let bestSlot = this.world.firstWeaponSlot(p);
    // só com faca e o inimigo bem perto: saca o taser (um disparo elimina)
    if (fighting && bestSlot === SLOT_KNIFE && this.world.taserReady(p)
      && this.target!.phys.pos.distTo(p.phys.pos) < WEAPONS.taser.range - 40) bestSlot = SLOT_TASER;
    if (p.slot !== SLOT_NADES && p.slot !== bestSlot && p.switchTime <= 0) inp.slot = bestSlot;
    if (p.slot === SLOT_NADES) {
      if (fighting && p.switchTime <= 0 && p.fireCooldown <= 0) inp.fire = !p.prevInput.fire;
      else if (!fighting) inp.slot = bestSlot;
      return;
    }
    const w = p.currentWeapon();
    if (!w) return;
    const def = wdef(w);
    const look = forwardFromAngles(this.lookYaw, this.lookPitch, new V3());
    if (def.recharge) {
      if (!fighting || w.mag <= 0) return;
      const t = this.target!;
      const to = t.eyePos(new V3()).sub(p.eyePos(new V3()));
      const d = to.len();
      if (d < def.range - 15 && look.dot(to.normalize()) > 0.97 && p.switchTime <= 0 && this.aim.phase !== 'flick') inp.fire = !p.prevInput.fire;
      return;
    }
    if (def.melee) {
      if (!fighting) return;
      const t = this.target!;
      const d = t.phys.pos.distTo(p.phys.pos);
      const to = t.eyePos(new V3()).sub(p.eyePos(new V3())).normalize();
      if (d < def.melee.range + 20 && look.dot(to) > 0.85) {
        if (this.r() < 0.25 * this.skill.abilityUse) inp.alt = !p.prevInput.alt; // heavy stab
        else inp.fire = true;
      }
      return;
    }
    if (!fighting) {
      if (w.mag < def.mag * 0.4 && w.reserve > 0 && p.reloadTime <= 0) inp.reload = true;
      if (def.zoom > 0 || def.ads) inp.aim = false;
      this.burstLeft = 0;
      return;
    }
    if (w.mag === 0 && w.reserve > 0) { inp.reload = true; return; }
    const t = this.target!;
    const eye = p.eyePos(new V3());
    // a mira está "em cima" dele? raio do olho contra a caixa do alvo, com folga por dificuldade
    // (quem é pior aperta o gatilho com a mira só perto do alvo)
    const dist = t.phys.pos.distTo(p.phys.pos);
    const margin = this.aimCfg.fireMargin + dist * Math.tan(this.aimCfg.fireAngle * DEG);
    hitboxes(t, HB_HEAD, HB_BODY);
    const onBox = (m: number) => rayHitsBox(eye, look, ZERO, HB_BODY.min, HB_BODY.max, m) || rayHitsBox(eye, look, ZERO, HB_HEAD.min, HB_HEAD.max, m);
    const onTarget = onBox(margin), nearTarget = onBox(Math.max(margin, 0) * 2 + 10);
    // LONGBOW: luneta a média/longa distância (estado desejado; o sim respeita recarga/troca)
    if (def.zoom > 0) inp.aim = dist > 700;
    // ADS a média/longa distância (o sim respeita o tempo de entrada da arma)
    if (def.ads) inp.aim = dist > 700;
    // grenade opportunity
    if (p.nades.he > 0 && dist > 400 && dist < 1100 && this.r() < 0.003 * this.skill.abilityUse) { inp.slot = SLOT_NADES; return; }
    // não atira no meio do flick; a média/longa distância espera a mira estabilizar
    if (this.aim.phase === 'flick') return;
    if (dist > 600 && this.aim.sinceFlick < this.stableNeed && p.shotsFired === 0) return;
    if (def.zoom > 0 && def.id === 'sniper' && dist > 700 && !p.zoomed) return;
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (onTarget && p.fireCooldown <= 0) {
      if (def.auto) {
        inp.fire = true;
        if (p.prevInput.fire === false) {
          this.burstLeft = Math.max(2, Math.round(this.skill.burst * (0.6 + this.r() * 0.8) * (dist > 1500 ? 0.4 : dist > 800 ? 0.7 : 1)));
          if (this.counterNext) this.holdStill = this.burstLeft * fireIntervalOf(def) + 0.1;
          this.counterNext = this.r() < this.aimCfg.counterStrafe;
        }
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = 0.12 + this.r() * 0.3 + (dist > 1200 ? 0.15 : 0);
      } else {
        inp.fire = !p.prevInput.fire;
        if (inp.fire) { if (this.counterNext) this.holdStill = 0.25; this.counterNext = this.r() < this.aimCfg.counterStrafe; }
      }
    } else if (def.auto && p.prevInput.fire && nearTarget && this.burstLeft > 0) { inp.fire = true; this.burstLeft--; }
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
        if (fighting && p.hp < ITEMS.maxHp * 0.3) inp.ability = true; // escape/reposition
        break;
      case 'predator':
        if (!this.target && this.noEnemyTime > 3 && this.mode === 'roam') inp.ability = true;
        break;
      case 'berserker':
        if (fighting && p.hp < ITEMS.maxHp * 0.47) inp.ability = true;
        break;
    }
  }

  private handlePickups() {
    const p = this.p;
    const k = this.world.nearestWeaponPickup(p);
    if (!k || !k.weapon) return;
    const cur = p.weapons[WEAPONS[k.weapon].slot];
    if (!cur || WEAPON_PRIORITY[k.weapon] > WEAPON_PRIORITY[cur.id] || (cur.id === k.weapon && cur.reserve < wdef(cur).mag)) p.input.use = true;
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

const HB_HEAD = { min: new V3(), max: new V3() }, HB_BODY = { min: new V3(), max: new V3() }, ZERO = new V3();

function fireIntervalOf(def: { rpm: number }): number { return 60 / def.rpm; }

/** O raio (origem o, direção d unitária) passa pela caixa pos+mins..pos+maxs aumentada de `m`? */
export function rayHitsBox(o: V3, d: V3, pos: V3, mins: V3, maxs: V3, m: number): boolean {
  let t0 = 0, t1 = 1e9;
  const lo = [pos.x + mins.x - m, pos.y + mins.y - m, pos.z + mins.z - m], hi = [pos.x + maxs.x + m, pos.y + maxs.y + m, pos.z + maxs.z + m];
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < lo[k] || oo[k] > hi[k]) return false; continue; }
    let a = (lo[k] - oo[k]) / dd[k], b = (hi[k] - oo[k]) / dd[k];
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

