// =============================================================
//  World — simulação autoritativa do jogo (sem DOM).
//  O cliente envia PlayerInput por tick e lê o estado + eventos.
//  O mesmo código poderá rodar no servidor multiplayer.
// =============================================================
import { V3, DEG, forwardFromAngles, rightFromYaw, makeRng } from '../math/vec3';
import { PHYSICS, SPRINT } from '../config/physics';
import { WEAPONS, WeaponId, NadeKind, NADES, NADE_THROW_SPEED, NADE_SELF_DAMAGE, ITEMS, GUN_IDS, SLOT_KNIFE, SLOT_TASER, SLOT_NADES, reloadDuration } from '../config/weapons';
import { rollPool } from '../config/pickups';
import { CLASSES, ClassId, CLASS_IDS } from '../config/classes';
import { MATCH, BotDifficulty, BOT_NAMES } from '../config/match';
import { CollisionWorld, rayAabb, newTrace } from '../physics/trace';
import { Mover, MoveModifiers, MoveCmd } from '../physics/movement';
import type { MapDef, Team, PickupKind, Trigger, SpawnPoint } from '../maps/types';
import { Player, PlayerInput, WeaponState, hitboxes, emptyInput } from './player';
import { computeDamage, weaponHitDamage, computeSpread, fireInterval } from './combat';
import { ABILITIES, tryUseAbility } from './abilities';
import { MatchMachine, MatchTransition, MatchConfig } from './match';
import { BotBrain } from '../bots/brain';

export type GameMode = 'training' | 'bots';

export interface WorldConfig {
  mode: GameMode;
  teamSize: number;
  difficulty: BotDifficulty;
  local: { name: string; team: Team; classId: ClassId };
  seed: number;
  autoBhop: boolean;
  match?: Partial<MatchConfig>;
  /** Classes chosen for bots (random if absent). */
  botClasses?: ClassId[];
}

export interface PickupRuntime {
  id: number;
  kind: PickupKind;
  weapon?: WeaponId;
  pos: V3;
  active: boolean;
  respawnAt: number;
  dropped: boolean;
  ammo?: { mag: number; reserve: number };
}

export interface Grenade { id: number; kind: NadeKind; owner: number; pos: V3; prevPos: V3; vel: V3; fuse: number; }
export interface SmokeCloud { id: number; pos: V3; t: number; maxT: number; radius: number; }

export type SimEvent =
  | { t: 'shot'; pid: number; weapon: WeaponId; from: V3; to: V3; hitWorld: boolean; normal?: V3; pellet: number }
  | { t: 'hit'; attacker: number; victim: number; dmg: number; head: boolean; pos: V3; killed: boolean }
  | { t: 'kill'; killer: number; victim: number; weapon: string; head: boolean }
  | { t: 'pickup'; pid: number; kind: PickupKind; label: string }
  | { t: 'reload'; pid: number; weapon: WeaponId }
  | { t: 'empty'; pid: number }
  | { t: 'melee'; pid: number; heavy: boolean; hit: 'player' | 'world' | 'none'; pos: V3; normal?: V3; backstab: boolean }
  | { t: 'slide'; pid: number; phase: 'start' | 'cancel' | 'end' }
  | { t: 'switch'; pid: number }
  | { t: 'ability'; pid: number; cls: ClassId; pos: V3 }
  | { t: 'heal'; pid: number; amount: number }
  | { t: 'explode'; kind: NadeKind; pos: V3 }
  | { t: 'nadeThrow'; pid: number; kind: NadeKind }
  | { t: 'teleport'; pid: number; from: V3; to: V3; ability?: boolean; fall?: boolean }
  | { t: 'jumppad'; pid: number }
  | { t: 'jump'; pid: number }
  | { t: 'land'; pid: number; speed: number }
  | { t: 'match'; tr: MatchTransition }
  | { t: 'duel'; a: number; b: number; weapon: WeaponId; arena: number }
  | { t: 'message'; text: string };

export const NOBODY = -1;

export class World {
  readonly collision: CollisionWorld;
  readonly mover: Mover;
  players: Player[] = [];
  localId = 0;
  pickups: PickupRuntime[] = [];
  grenades: Grenade[] = [];
  smokes: SmokeCloud[] = [];
  events: SimEvent[] = [];
  time = 0;
  tick = 0;
  match: MatchMachine;
  rng: () => number;
  bots = new Map<number, BotBrain>();
  private nextId = 1;
  private checkpoints = new Map<number, { pos: V3; vel: V3; yaw: number; pitch: number }>();
  private duelQueue: number[] = [];
  duelArenaBusy: (number[] | null)[] = [];

  constructor(public map: MapDef, public config: WorldConfig) {
    this.collision = new CollisionWorld(map.brushes);
    this.mover = new Mover(this.collision);
    this.rng = makeRng(config.seed);
    this.match = new MatchMachine({ ...MATCH, ...(config.match ?? {}) });
    this.setupPlayers();
    this.resetPickups();
    if (config.mode === 'training') {
      this.match.phase = 'active';
      this.match.timer = Infinity;
    } else {
      this.match.openSelection();
      this.handleTransitions(this.match.startMatch());
    }
  }

  emit(e: SimEvent) { this.events.push(e); }
  drainEvents(): SimEvent[] { const e = this.events; this.events = []; return e; }

  get local(): Player { return this.players.find((p) => p.id === this.localId)!; }
  player(id: number): Player | undefined { return this.players.find((p) => p.id === id); }

  // ------------------------------------------------------------------ setup
  private setupPlayers() {
    const c = this.config;
    const local = new Player(this.nextId++, c.local.name, c.local.team, c.local.classId, false);
    local.autoBhop = c.autoBhop;
    this.localId = local.id;
    this.players.push(local);
    const names = [...BOT_NAMES].sort(() => this.rng() - 0.5);
    let ni = 0;
    if (c.mode === 'training') {
      this.map.trainingTargets.forEach((sp, i) => {
        const d = new Player(this.nextId++, `ALVO ${i + 1}`, 'red', 'runner', true);
        d.isDummy = true;
        this.players.push(d);
        this.bots.set(d.id, new BotBrain(this, d, 'easy', true));
        this.spawnAt(d, sp);
        d.resetForRound();
      });
      local.resetForRound();
      this.spawnAt(local, this.map.trainingSpawn);
      return;
    }
    const enemy: Team = c.local.team === 'blue' ? 'red' : 'blue';
    const pickClass = (i: number): ClassId => c.botClasses?.[i % c.botClasses.length] ?? CLASS_IDS[Math.floor(this.rng() * CLASS_IDS.length)];
    for (let i = 0; i < c.teamSize - 1; i++) {
      const b = new Player(this.nextId++, names[ni++ % names.length], c.local.team, pickClass(i), true);
      this.players.push(b);
      this.bots.set(b.id, new BotBrain(this, b, c.difficulty));
    }
    for (let i = 0; i < c.teamSize; i++) {
      const b = new Player(this.nextId++, names[ni++ % names.length], enemy, pickClass(i + 3), true);
      this.players.push(b);
      this.bots.set(b.id, new BotBrain(this, b, c.difficulty));
    }
  }

  spawnAt(p: Player, sp: SpawnPoint) {
    p.phys.pos.copy(sp.pos);
    p.prevPos.copy(sp.pos);
    p.phys.lastSafe.copy(sp.pos);
    p.phys.vel.set(0, 0, 0);
    p.yaw = sp.yaw; p.pitch = 0;
    p.input.cmd.yaw = sp.yaw; p.input.cmd.pitch = 0;
  }

  /** Recria os itens do mapa. Pontos com pool sorteiam o item; o mesmo `group` recebe o mesmo item. */
  resetPickups() {
    const byGroup = new Map<string, { kind: PickupKind; weapon?: WeaponId }>();
    this.pickups = this.map.pickups.map((ps) => {
      let kind = ps.kind, weapon = ps.weapon as WeaponId | undefined;
      if (ps.pool) {
        let pick = ps.group ? byGroup.get(ps.group) : undefined;
        if (!pick) {
          const e = rollPool(ps.pool, this.rng);
          pick = { kind: e.kind, weapon: e.weapon };
          if (ps.group) byGroup.set(ps.group, pick);
        }
        kind = pick.kind; weapon = pick.weapon;
      }
      return { id: this.nextId++, kind, weapon: kind === 'weapon' ? weapon : undefined, pos: ps.pos.clone(), active: true, respawnAt: 0, dropped: false };
    });
  }

  private startRound() {
    this.grenades = [];
    this.smokes = [];
    this.resetPickups();
    this.duelQueue = [];
    this.duelArenaBusy = this.map.duelArenas.map(() => null);
    const idx: Record<Team, number> = { blue: 0, red: 0 };
    for (const p of this.players) {
      p.resetForRound();
      const sps = this.map.spawns[p.team];
      this.spawnAt(p, sps[idx[p.team]++ % sps.length]);
      p.frozen = true;
      this.bots.get(p.id)?.onRoundStart();
    }
  }

  private handleTransitions(trs: MatchTransition[]) {
    for (const tr of trs) {
      this.emit({ t: 'match', tr });
      if (tr.type === 'roundStart') this.startRound();
      if (tr.type === 'enter' && tr.phase === 'active') for (const p of this.players) p.frozen = false;
      if (tr.type === 'enter' && tr.phase === 'countdown') for (const p of this.players) p.frozen = true;
      if (tr.type === 'startDuels') this.startDuels();
      if (tr.type === 'enter' && tr.phase === 'roundEnd') for (const p of this.players) p.frozen = false;
    }
  }

  aliveCount(): Record<Team, number> {
    const c = { blue: 0, red: 0 };
    for (const p of this.players) if (p.alive) c[p.team]++;
    return c;
  }

  // ------------------------------------------------------------------ duels
  private startDuels() {
    const blues = this.players.filter((p) => p.alive && p.team === 'blue');
    const reds = this.players.filter((p) => p.alive && p.team === 'red');
    this.grenades = [];
    this.smokes = [];
    this.duelArenaBusy = this.map.duelArenas.map(() => null);
    const n = Math.min(blues.length, reds.length, this.map.duelArenas.length);
    for (let i = 0; i < n; i++) this.beginDuel(i, blues[i], reds[i]);
    const rest = [...blues.slice(n), ...reds.slice(n)];
    this.duelQueue = rest.map((p) => p.id);
    for (const p of rest) this.prepareDuelist(p, null, this.map.waitingRoom);
    this.emit({ t: 'message', text: 'TEMPO ESGOTADO — DUELOS 1v1!' });
  }

  private prepareDuelist(p: Player, weapon: WeaponId | null, sp: SpawnPoint) {
    p.hp = ITEMS.maxHp; p.armor = 0; p.shield = 0; p.shieldTime = 0; // duelo: vida cheia, sem colete
    p.nades = { he: 0, smoke: 0, impulse: 0 };
    p.abilityActive = 0; p.tired = 0; p.speedBoost = 0; p.predatorStacks = 0;
    p.noAbilities = true;
    p.reloadTime = 0; p.zoomed = false; p.punchPitch = 0; p.punchYaw = 0;
    p.resetMovementState();
    if (weapon) {
      p.weapons = [null, null, null, null];
      p.giveWeapon('knife'); // nos duelos: faca + a arma sorteada (sem taser)
      const ws = p.giveWeapon(weapon);
      ws.reserve = WEAPONS[weapon].mag * 4;
      p.slot = WEAPONS[weapon].slot;
    }
    this.spawnAt(p, sp);
    p.phys.ducked = false; p.phys.maxs.y = PHYSICS.playerHeight;
  }

  private beginDuel(arena: number, a: Player, b: Player) {
    const pool: WeaponId[] = ['rifle', 'smg', 'shotgun', 'sniper', 'pistol'];
    const weapon = pool[Math.floor(this.rng() * pool.length)];
    const ar = this.map.duelArenas[arena];
    this.prepareDuelist(a, weapon, ar.a);
    this.prepareDuelist(b, weapon, ar.b);
    a.inDuel = arena; b.inDuel = arena;
    this.duelArenaBusy[arena] = [a.id, b.id];
    this.emit({ t: 'duel', a: a.id, b: b.id, weapon, arena });
  }

  private onDuelDeath(victim: Player) {
    const arena = victim.inDuel;
    if (arena < 0) return;
    const pair = this.duelArenaBusy[arena];
    this.duelArenaBusy[arena] = null;
    victim.inDuel = -1;
    const winnerId = pair?.find((id) => id !== victim.id);
    const winner = winnerId !== undefined ? this.player(winnerId) : undefined;
    if (!winner || !winner.alive) return;
    // next challenger of the opposite team?
    const qi = this.duelQueue.findIndex((id) => { const q = this.player(id); return !!q && q.alive && q.team !== winner.team; });
    if (qi >= 0) {
      const challenger = this.player(this.duelQueue[qi])!;
      this.duelQueue.splice(qi, 1);
      this.beginDuel(arena, winner, challenger);
    } else {
      winner.inDuel = -1;
      this.prepareDuelist(winner, null, this.map.waitingRoom);
      this.duelQueue.push(winner.id);
    }
  }

  private tiebreak(): Team | null {
    const hp = { blue: 0, red: 0 };
    for (const p of this.players) if (p.alive) hp[p.team] += p.hp;
    if (hp.blue === hp.red) return null;
    return hp.blue > hp.red ? 'blue' : 'red';
  }

  // ------------------------------------------------------------------ main step
  step(dt: number) {
    this.time += dt;
    this.tick++;
    for (const p of this.players) p.prevPos.copy(p.phys.pos);

    for (const [id, brain] of this.bots) {
      const p = this.player(id);
      if (p) brain.think(dt);
    }
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateGrenades(dt);
    this.updateSmokes(dt);
    this.updatePickups();

    if (this.config.mode !== 'training') {
      this.handleTransitions(this.match.update(dt, this.aliveCount(), () => this.tiebreak()));
    }
  }

  private updatePlayer(p: Player, dt: number) {
    const inp = p.input;
    // timers
    p.triggerCd = Math.max(0, p.triggerCd - dt);
    if (!p.alive) {
      if (p.isDummy) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          const idx = this.players.filter((q) => q.isDummy).indexOf(p);
          p.resetForRound();
          this.spawnAt(p, this.map.trainingTargets[idx % this.map.trainingTargets.length]);
        }
      }
      p.prevInput = { ...inp, cmd: { ...inp.cmd } };
      return;
    }
    p.abilityCd = Math.max(0, p.abilityCd - dt);
    p.abilityActive = Math.max(0, p.abilityActive - dt);
    p.tired = Math.max(0, p.tired - dt);
    p.speedBoost = Math.max(0, p.speedBoost - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.switchTime = Math.max(0, p.switchTime - dt);
    p.teleportGlide = Math.max(0, p.teleportGlide - dt);
    for (const ws of p.weapons) {
      if (ws?.recharge !== undefined && ws.recharge > 0) { ws.recharge -= dt; if (ws.recharge <= 0) { ws.recharge = 0; ws.mag = WEAPONS[ws.id].mag; } }
    }
    if (p.shieldTime > 0) { p.shieldTime -= dt; if (p.shieldTime <= 0) p.shield = 0; }
    ABILITIES[p.classId].tick?.(this, p, dt);

    // look
    p.yaw = inp.cmd.yaw;
    p.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, inp.cmd.pitch));

    // movement
    const frozen = p.frozen || (this.match.frozen && this.config.mode !== 'training');
    const rawCmd = frozen ? { ...inp.cmd, forward: 0, side: 0, jump: false, up: 0, sprint: false } : inp.cmd;
    const cmd = this.updateSprintSlide(p, rawCmd, dt);
    const mods: MoveModifiers = {
      speedMul: p.speedMul(),
      groundSpeedMul: p.groundSpeedMul(),
      sliding: p.slideTime > 0,
      noFriction: p.teleportGlide > 0,
      slideFriction: SPRINT.slideFriction,
      airAccelMul: (p.classId === 'runner' ? CLASSES.runner.params.airAccelMul : 1) * (p.speedBoost > 0 ? ITEMS.speedAirMul : 1),
      airCapMul: p.classId === 'runner' ? CLASSES.runner.params.airCapMul : 1,
      autoBhop: p.autoBhop,
      fly: p.fly,
    };
    p.entrySpeed = Math.hypot(p.phys.vel.x, p.phys.vel.z);
    const ev = this.mover.move(p.phys, cmd, dt, mods);
    if (ev.jumped) this.emit({ t: 'jump', pid: p.id });
    if (ev.landed > 250) this.emit({ t: 'land', pid: p.id, speed: ev.landed });

    this.checkTriggers(p);
    if (p.phys.pos.y < this.map.fallY) this.sendToBase(p);

    // weapons / actions — disabled while frozen in prep
    const canAct = !frozen && (this.match.combatEnabled || this.config.mode === 'training' || this.match.phase === 'roundEnd');
    if (canAct) this.handleActions(p, dt);
    this.recoverRecoil(p, dt);
    this.autoPickups(p);

    p.prevInput = { ...inp, cmd: { ...inp.cmd } };
  }

  /**
   * Tactical Sprint + Slide. Returns the command the physics should use this tick
   * (crouch forced while sliding, suppressed right after a slide cancel).
   */
  private updateSprintSlide(p: Player, cmd: MoveCmd, dt: number): MoveCmd {
    const st = p.phys;
    const prev = p.prevInput.cmd;
    const crouchEdge = cmd.crouch && !prev.crouch;
    const jumpEdge = cmd.jump && !prev.jump;
    if (!cmd.crouch) p.crouchSuppressed = false;
    p.crouchBuffer = Math.max(0, p.crouchBuffer - dt);
    if (crouchEdge && !st.onGround) p.crouchBuffer = SPRINT.slideLandBuffer;
    p.slideCooldown = Math.max(0, p.slideCooldown - dt);
    p.slideRecover = Math.max(0, p.slideRecover - dt);
    const hs = Math.hypot(st.vel.x, st.vel.z);

    // ---- slide ----
    if (p.slideTime > 0) {
      p.slideTime -= dt;
      if (jumpEdge || crouchEdge) {
        // slide cancel: levanta na hora (sem a trava de recuperação) e reseta o sprint tático
        p.slideTime = 0;
        p.crouchSuppressed = true;
        p.stamina = SPRINT.stamina; p.staminaLocked = false;
        p.slideCooldown = SPRINT.slideCooldown;
        this.emit({ t: 'slide', pid: p.id, phase: 'cancel' });
      } else if (p.slideTime <= 0 || !st.onGround || hs < SPRINT.slideEndSpeed) {
        p.slideTime = 0;
        if (st.onGround) p.slideRecover = SPRINT.slideRecoverTime;
        p.slideCooldown = SPRINT.slideCooldown;
        this.emit({ t: 'slide', pid: p.id, phase: 'end' });
      }
    } else if (
      // slide: agachar durante o sprint, ou agachar em alta velocidade (sem sprint). Agachar logo antes
      // de pousar também conta, para emendar o slide na queda de uma rampa.
      (crouchEdge || (p.crouchBuffer > 0 && cmd.crouch)) && st.onGround && p.slideCooldown <= 0 && !p.fly && !p.crouchSuppressed &&
      ((p.sprinting && hs >= SPRINT.slideMinStartSpeed) || hs > SPRINT.autoSlideSpeed)
    ) {
      p.crouchBuffer = 0;
      p.slideTime = SPRINT.slideTime;
      p.sprinting = false;
      const target = Math.min(Math.max(hs, SPRINT.slideStartSpeed), hs + SPRINT.slideMaxBoost);
      st.vel.x *= target / hs; st.vel.z *= target / hs;
      p.zoomed = false;
      this.emit({ t: 'slide', pid: p.id, phase: 'start' });
    }

    const sliding = p.slideTime > 0;
    const crouch = sliding || (cmd.crouch && !p.crouchSuppressed);

    // ---- tactical sprint ----
    if (p.staminaLocked && p.stamina >= SPRINT.restartStamina) p.staminaLocked = false;
    const wantsSprint = cmd.sprint && cmd.forward > 0 && !p.input.fire && !crouch && !sliding && p.slideRecover <= 0 && !p.fly;
    const canSprint = wantsSprint && !p.staminaLocked && p.stamina > 0 && !st.ducked && (st.onGround || p.sprinting);
    if (canSprint && !p.sprinting) { p.zoomed = false; }
    p.sprinting = canSprint;
    if (p.sprinting) {
      if (st.onGround) p.stamina -= dt;
      if (p.stamina <= 0) { p.stamina = 0; p.staminaLocked = true; p.sprinting = false; }
      p.sinceSprint = 0;
      // arma levantada: ao sair do sprint, leva este tempo para poder atirar
      const w = p.currentWeapon();
      p.raiseTime = w && WEAPONS[w.id].melee ? SPRINT.sprintToFireKnife : SPRINT.sprintToFire;
    } else {
      p.sinceSprint += dt;
      if (p.sinceSprint > SPRINT.regenDelay) p.stamina = Math.min(SPRINT.stamina, p.stamina + SPRINT.regenRate * dt);
      p.raiseTime = Math.max(0, p.raiseTime - dt);
    }

    if (crouch === cmd.crouch) return cmd;
    return { ...cmd, crouch };
  }

  /** Weapon is raised (sprinting) or still being lowered: no shooting. */
  weaponBlocked(p: Player): boolean { return p.sprinting || p.raiseTime > SPRINT.walkToFire; }

  /** Caiu do mapa: volta automaticamente para a base do próprio time (parado). */
  sendToBase(p: Player) {
    const from = p.phys.pos.clone();
    const sps = this.config.mode === 'training' || p.isDummy ? [this.map.trainingSpawn] : this.map.spawns[p.team];
    const sp = sps[Math.floor(this.rng() * sps.length)];
    this.spawnAt(p, sp);
    p.slideTime = 0; p.sprinting = false;
    p.phys.ducked = false; p.phys.maxs.y = PHYSICS.playerHeight;
    p.triggerCd = 0.5;
    this.emit({ t: 'teleport', pid: p.id, from, to: p.phys.pos.clone(), fall: true });
    this.bots.get(p.id)?.onRoundStart();
  }

  private edge(p: Player, key: 'fire' | 'alt' | 'reload' | 'use' | 'ability' | 'drop') {
    return p.input[key] && !p.prevInput[key];
  }

  private handleActions(p: Player, dt: number) {
    const inp = p.input;
    // slot switching
    const slotEdge = inp.slot !== null && inp.slot !== p.prevInput.slot;
    if (inp.slot === SLOT_KNIFE && slotEdge && (p.slot === SLOT_KNIFE || p.slot === SLOT_TASER)) {
      // tecla 3 alterna entre faca e taser (o taser só com carga)
      if (p.slot === SLOT_KNIFE && this.taserReady(p)) this.switchTo(p, SLOT_TASER);
      else if (p.slot === SLOT_TASER) this.switchTo(p, SLOT_KNIFE);
    } else if (inp.slot !== null && inp.slot !== p.slot) {
      if (inp.slot === SLOT_NADES) {
        if (this.hasNades(p)) { p.lastWeaponSlot = p.slot; this.switchTo(p, SLOT_NADES); }
      } else if (inp.slot === SLOT_TASER) { if (this.taserReady(p)) this.switchTo(p, SLOT_TASER); }
      else if (p.weapons[inp.slot]) this.switchTo(p, inp.slot);
    } else if (inp.slot === SLOT_NADES && p.slot === SLOT_NADES && slotEdge) this.cycleNade(p);

    if (this.edge(p, 'ability')) tryUseAbility(this, p);
    if (this.edge(p, 'use')) this.tryUsePickup(p);
    if (this.edge(p, 'drop')) this.dropCurrent(p);

    const blocked = this.weaponBlocked(p);
    if (p.slot === SLOT_NADES) {
      if (!this.hasNades(p)) { this.switchTo(p, p.weapons[p.lastWeaponSlot] ? p.lastWeaponSlot : this.firstWeaponSlot(p)); return; }
      if (!blocked && (this.edge(p, 'fire') || this.edge(p, 'alt')) && p.fireCooldown <= 0 && p.switchTime <= 0) {
        this.throwNade(p, inp.alt && !inp.fire);
      }
      return;
    }
    const w = p.currentWeapon();
    if (!w) return;
    const def = WEAPONS[w.id];
    if (def.recharge) {
      // taser: um disparo, depois volta para a melhor arma e recarrega sozinho
      if (w.mag <= 0) { if (p.switchTime <= 0) this.switchTo(p, this.firstWeaponSlot(p)); return; }
      if (!blocked && this.edge(p, 'fire') && p.fireCooldown <= 0 && p.switchTime <= 0) {
        this.fire(p, w);
        w.recharge = def.recharge;
      }
      return;
    }
    if (def.melee) {
      if (blocked || p.fireCooldown > 0 || p.switchTime > 0) return;
      if (this.edge(p, 'alt')) this.melee(p, true);
      else if (inp.fire) this.melee(p, false);
      return;
    }
    // zoom
    if (this.edge(p, 'alt') && def.zoom > 0 && p.reloadTime <= 0 && !p.sprinting) p.zoomed = !p.zoomed;
    // reload
    if (p.reloadTime > 0) {
      p.reloadTime -= dt;
      if (p.reloadTime <= 0) {
        const take = Math.min(def.mag - w.mag, w.reserve);
        w.mag += take; w.reserve -= take; p.reloadTime = 0;
      }
      return;
    }
    if (this.edge(p, 'reload') && w.mag < def.mag && w.reserve > 0) { this.startReload(p, w); return; }
    const wantsFire = inp.fire && (def.auto || !p.prevInput.fire);
    if (wantsFire && !blocked && p.fireCooldown <= 0 && p.switchTime <= 0) {
      if (w.mag <= 0) {
        if (w.reserve > 0) this.startReload(p, w);
        else { this.emit({ t: 'empty', pid: p.id }); p.fireCooldown = 0.3; }
      } else this.fire(p, w);
    }
  }

  taserReady(p: Player) { const t = p.weapons[SLOT_TASER]; return !!t && t.mag > 0; }

  /** Best weapon slot available: primary, then pistol, then knife. */
  firstWeaponSlot(p: Player) { return p.weapons[0] ? 0 : p.weapons[1] ? 1 : SLOT_KNIFE; }
  private hasNades(p: Player) { return p.nades.he + p.nades.smoke + p.nades.impulse > 0; }
  private cycleNade(p: Player) {
    const kinds: NadeKind[] = ['he', 'smoke', 'impulse'];
    let i = kinds.indexOf(p.nadeSel);
    for (let k = 0; k < 3; k++) { i = (i + 1) % 3; if (p.nades[kinds[i]] > 0) { p.nadeSel = kinds[i]; break; } }
  }

  switchTo(p: Player, slot: number) {
    if (slot === p.slot) return;
    if (slot < SLOT_NADES) p.lastWeaponSlot = slot;
    p.slot = slot;
    p.switchTime = 0.35;
    p.reloadTime = 0;
    p.zoomed = false;
    p.shotsFired = 0;
    if (slot === SLOT_NADES && p.nades[p.nadeSel] <= 0) this.cycleNade(p);
    this.emit({ t: 'switch', pid: p.id });
  }

  private startReload(p: Player, w: WeaponState) {
    p.reloadTime = reloadDuration(WEAPONS[w.id]);
    p.zoomed = false;
    this.emit({ t: 'reload', pid: p.id, weapon: w.id });
  }

  // ------------------------------------------------------------------ shooting
  private eye = new V3(); private dir = new V3(); private fwd = new V3(); private right = new V3(); private up = new V3();
  private end = new V3(); private tr = newTrace();
  private hbHead = { min: new V3(), max: new V3() }; private hbBody = { min: new V3(), max: new V3() };

  private fire(p: Player, w: WeaponState) {
    const def = WEAPONS[w.id];
    w.mag--;
    const rateMul = 1 + (p.classId === 'predator' ? p.predatorStacks * CLASSES.predator.params.stackFireRate : 0);
    p.fireCooldown = fireInterval(def, rateMul);
    p.lastShotTime = this.time;
    const spread = computeSpread(def, { onGround: p.phys.onGround, hSpeed: Math.hypot(p.phys.vel.x, p.phys.vel.z), ducked: p.phys.ducked, zoomed: p.zoomed });
    const aimYaw = p.yaw + p.punchYaw * DEG;
    const aimPitch = p.pitch + p.punchPitch * DEG;
    forwardFromAngles(aimYaw, aimPitch, this.fwd);
    rightFromYaw(aimYaw, this.right);
    this.up.crossVectors(this.right, this.fwd).normalize();
    p.eyePos(this.eye);
    const dmgBy = new Map<number, { dmg: number; head: boolean; pos: V3 }>();
    // precisão de perto: se o centro da mira já acerta um inimigo próximo, o tiro vai exatamente nele
    let shotSpread = spread;
    if (def.preciseRange && this.centerRayHitsEnemy(p, this.eye, this.fwd, def.preciseRange)) shotSpread = 0;
    for (let k = 0; k < def.pellets; k++) {
      const a = Math.tan(shotSpread * DEG * Math.sqrt(this.rng()));
      const th = this.rng() * Math.PI * 2;
      this.dir.copy(this.fwd).addScaled(this.right, Math.cos(th) * a).addScaled(this.up, Math.sin(th) * a).normalize();
      this.end.copy(this.eye).addScaled(this.dir, def.range);
      const wt = this.collision.traceRay(this.eye, this.end, this.tr, 'glass');
      let best = wt.fraction * def.range;
      let victim: Player | null = null, head = false;
      for (const q of this.players) {
        if (q === p || !q.alive || q.team === p.team) continue;
        if (q.inDuel !== p.inDuel) continue;
        hitboxes(q, this.hbHead, this.hbBody);
        const th2 = rayAabb(this.eye, this.dir, best, this.hbHead.min, this.hbHead.max);
        if (th2 >= 0 && th2 < best) { best = th2; victim = q; head = true; }
        const tb = rayAabb(this.eye, this.dir, best, this.hbBody.min, this.hbBody.max);
        if (tb >= 0 && tb < best) { best = tb; victim = q; head = false; }
      }
      const hitPos = this.eye.clone().addScaled(this.dir, best);
      this.emit({ t: 'shot', pid: p.id, weapon: w.id, from: this.eye.clone(), to: hitPos, hitWorld: !victim && wt.fraction < 1, normal: !victim && wt.fraction < 1 ? wt.normal.clone() : undefined, pellet: k });
      if (victim) {
        const dmg = weaponHitDamage(def, best, head);
        const cur = dmgBy.get(victim.id);
        if (cur) { cur.dmg += dmg; cur.head = cur.head || head; } else dmgBy.set(victim.id, { dmg, head, pos: hitPos });
      }
    }
    // recoil (visual + functional)
    const grow = 1 + Math.min(p.shotsFired, 12) * 0.05;
    p.punchPitch = Math.min(14, p.punchPitch + def.kick * (0.8 + 0.4 * this.rng()) * grow);
    p.punchYaw += (this.rng() * 2 - 1) * def.kickSide * grow;
    p.punchYaw = Math.max(-5, Math.min(5, p.punchYaw));
    p.shotsFired++;
    for (const [vid, d] of dmgBy) this.applyDamage(this.player(vid)!, p, d.dmg, d.head, false, WEAPONS[w.id].name, d.pos);
  }

  private centerRayHitsEnemy(p: Player, eye: V3, dir: V3, range: number): boolean {
    const end = eye.clone().addScaled(dir, range);
    const wt = this.collision.traceRay(eye, end, newTrace(), 'glass');
    const limit = wt.fraction * range;
    for (const q of this.players) {
      if (q === p || !q.alive || q.team === p.team || q.inDuel !== p.inDuel) continue;
      hitboxes(q, this.hbHead, this.hbBody);
      if (rayAabb(eye, dir, limit, this.hbHead.min, this.hbHead.max) >= 0) return true;
      if (rayAabb(eye, dir, limit, this.hbBody.min, this.hbBody.max) >= 0) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ knife
  private meleeDirs = [[0, 0], [7, 0], [-7, 0], [0, 6], [0, -6]];
  private melee(p: Player, heavy: boolean) {
    const def = WEAPONS.knife, m = def.melee!;
    const rateMul = 1 + (p.classId === 'predator' ? p.predatorStacks * CLASSES.predator.params.stackFireRate : 0);
    p.fireCooldown = (heavy ? m.heavyInterval : fireInterval(def)) / rateMul;
    p.lastShotTime = this.time;
    p.lastMeleeHeavy = heavy;
    const range = heavy ? m.heavyRange : m.range;
    p.eyePos(this.eye);
    let victim: Player | null = null, head = false, best = range, hitDir = new V3();
    let worldHit: { pos: V3; normal: V3 } | null = null;
    for (const [dy, dp] of this.meleeDirs) {
      forwardFromAngles(p.yaw + dy * DEG, p.pitch + dp * DEG, this.dir);
      this.end.copy(this.eye).addScaled(this.dir, range);
      const wt = this.collision.traceRay(this.eye, this.end, this.tr, 'glass');
      const limit = wt.fraction * range;
      if (wt.fraction < 1 && !worldHit && dy === 0 && dp === 0) worldHit = { pos: this.eye.clone().addScaled(this.dir, limit), normal: wt.normal.clone() };
      for (const q of this.players) {
        if (q === p || !q.alive || q.team === p.team || q.inDuel !== p.inDuel) continue;
        hitboxes(q, this.hbHead, this.hbBody);
        for (const b of [this.hbHead, this.hbBody]) { b.min.x -= m.hitPadding; b.min.y -= m.hitPadding * 0.5; b.min.z -= m.hitPadding; b.max.x += m.hitPadding; b.max.z += m.hitPadding; }
        const th = rayAabb(this.eye, this.dir, Math.min(best, limit), this.hbHead.min, this.hbHead.max);
        if (th >= 0 && (th < best || (victim === q && !head))) { best = th; victim = q; head = true; hitDir.copy(this.dir); }
        const tb = rayAabb(this.eye, this.dir, Math.min(best, limit), this.hbBody.min, this.hbBody.max);
        if (tb >= 0 && tb < best) { best = tb; victim = q; head = false; hitDir.copy(this.dir); }
      }
      if (victim && dy === 0 && dp === 0) break; // centro acertou: não precisa testar as bordas
    }
    if (victim) {
      // pelas costas: atacante e vítima olhando para o mesmo lado
      const vf = forwardFromAngles(victim.yaw, 0, new V3());
      const h = Math.hypot(hitDir.x, hitDir.z) || 1;
      const backstab = (vf.x * hitDir.x + vf.z * hitDir.z) / h > 0.55;
      const dmg = backstab
        ? (heavy ? m.heavyBackstabDamage : m.backstabDamage)
        : heavy ? m.heavyDamage * (head ? m.heavyHeadMult : 1) : def.damage * (head ? def.headMult : 1);
      const pos = this.eye.clone().addScaled(hitDir, best);
      this.emit({ t: 'melee', pid: p.id, heavy, hit: 'player', pos, backstab });
      this.applyDamage(victim, p, dmg, head && !backstab, false, def.name, pos);
    } else if (worldHit) {
      this.emit({ t: 'melee', pid: p.id, heavy, hit: 'world', pos: worldHit.pos, normal: worldHit.normal, backstab: false });
    } else {
      this.emit({ t: 'melee', pid: p.id, heavy, hit: 'none', pos: this.eye.clone(), backstab: false });
    }
  }

  private recoverRecoil(p: Player, dt: number) {
    const w = p.currentWeapon();
    const def = w ? WEAPONS[w.id] : WEAPONS.pistol;
    const sinceShot = this.time - p.lastShotTime;
    // o recuo começa a voltar logo após o intervalo de tiro (no máximo 0,3 s, para armas lentas como a Longbow)
    if (sinceShot > Math.min(fireInterval(def) * 1.2, 0.3)) {
      const r = def.recover * dt;
      p.punchPitch = Math.abs(p.punchPitch) <= r ? 0 : p.punchPitch - Math.sign(p.punchPitch) * r;
      p.punchYaw = Math.abs(p.punchYaw) <= r ? 0 : p.punchYaw - Math.sign(p.punchYaw) * r;
      if (sinceShot > 0.4) p.shotsFired = 0;
    }
  }

  applyDamage(victim: Player, attacker: Player | null, base: number, head: boolean, explosion: boolean, weaponLabel: string, pos?: V3) {
    if (!victim.alive || base <= 0) return;
    if (attacker && attacker !== victim && attacker.team === victim.team) return; // sem fogo amigo
    if (this.config.mode !== 'training' && !this.match.combatEnabled) return;
    const res = computeDamage({
      base, head, explosion,
      attackerFury: !!attacker && attacker.classId === 'berserker' && attacker.abilityActive > 0,
      attackerHp: attacker?.hp ?? ITEMS.maxHp,
      victimTired: victim.classId === 'jumper' && victim.tired > 0,
      victimArmor: victim.armor,
      victimShield: victim.shield,
    });
    victim.shield = Math.max(0, victim.shield - res.shieldDamage);
    victim.armor = Math.max(0, victim.armor - res.armorDamage);
    const before = victim.hp;
    victim.hp -= res.hpDamage;
    victim.lastCombat = this.time;
    if (attacker) {
      attacker.lastCombat = this.time;
      if (attacker !== victim) {
        attacker.stats.damage += Math.round(Math.min(before, res.hpDamage) + res.armorDamage + res.shieldDamage);
        victim.damagedBy.set(attacker.id, (victim.damagedBy.get(attacker.id) ?? 0) + res.total);
        victim.lastAttacker = attacker.id;
      }
    }
    const killed = victim.hp <= 0;
    this.emit({ t: 'hit', attacker: attacker?.id ?? NOBODY, victim: victim.id, dmg: Math.round(res.total), head, pos: pos ?? victim.phys.pos.clone(), killed });
    if (killed) this.killPlayer(victim, attacker, weaponLabel, head);
  }

  private killPlayer(victim: Player, killer: Player | null, weaponLabel: string, head: boolean) {
    victim.alive = false;
    victim.hp = 0;
    victim.deathPos.copy(victim.phys.pos);
    victim.stats.deaths++;
    victim.respawnTimer = 3;
    if (killer && killer !== victim) {
      killer.stats.kills++;
      if (head) killer.stats.headshots++;
      ABILITIES[killer.classId].onKill?.(this, killer);
    }
    for (const [aid, dmg] of victim.damagedBy) {
      if (aid !== killer?.id && dmg >= 40) { const a = this.player(aid); if (a) a.stats.assists++; }
    }
    // queda de armas ao morrer
    const drop = victim.weapons[0] ?? victim.weapons[1];
    if (drop && victim.inDuel < 0 && !victim.isDummy) this.spawnDropped(drop, victim.phys.pos);
    victim.weapons = [null, null, null, null];
    this.emit({ t: 'kill', killer: killer?.id ?? NOBODY, victim: victim.id, weapon: weaponLabel, head });
    if (victim.inDuel >= 0) this.onDuelDeath(victim);
  }

  // ------------------------------------------------------------------ grenades
  private throwNade(p: Player, lob: boolean) {
    const kind = p.nadeSel;
    if (p.nades[kind] <= 0) return;
    p.nades[kind]--;
    const dir = forwardFromAngles(p.yaw, p.pitch + 4 * DEG, new V3());
    const pos = p.eyePos(new V3()).addScaled(dir, 18);
    const speed = lob ? NADE_THROW_SPEED * 0.45 : NADE_THROW_SPEED;
    const vel = dir.clone().scale(speed).addScaled(p.phys.vel, 0.7);
    // avoid spawning inside walls
    const t = this.collision.traceBox(p.eyePos(new V3()), pos, new V3(-3, -3, -3), new V3(3, 3, 3));
    this.grenades.push({ id: this.nextId++, kind, owner: p.id, pos: t.endPos.clone(), prevPos: t.endPos.clone(), vel, fuse: NADES[kind].fuse });
    p.fireCooldown = 0.6;
    this.emit({ t: 'nadeThrow', pid: p.id, kind });
    if (p.nades[kind] <= 0) {
      if (this.hasNades(p)) this.cycleNade(p);
      else this.switchTo(p, p.weapons[p.lastWeaponSlot] ? p.lastWeaponSlot : this.firstWeaponSlot(p));
    }
  }

  private nmin = new V3(-3, -3, -3); private nmax = new V3(3, 3, 3);
  private updateGrenades(dt: number) {
    const keep: Grenade[] = [];
    for (const g of this.grenades) {
      g.prevPos.copy(g.pos);
      g.fuse -= dt;
      g.vel.y -= PHYSICS.gravity * dt;
      const end = g.pos.clone().addScaled(g.vel, dt);
      const t = this.collision.traceBox(g.pos, end, this.nmin, this.nmax, this.tr);
      g.pos.copy(t.endPos);
      let hitPlayer = false;
      for (const q of this.players) {
        if (!q.alive || q.id === g.owner) continue;
        if (Math.abs(q.phys.pos.x - g.pos.x) < 20 && Math.abs(q.phys.pos.z - g.pos.z) < 20 && g.pos.y > q.phys.pos.y && g.pos.y < q.phys.pos.y + q.phys.maxs.y) hitPlayer = true;
      }
      const def = NADES[g.kind];
      if ((t.fraction < 1 || hitPlayer) && def.impactDetonate) { this.explode(g); continue; }
      if (t.fraction < 1) {
        const n = t.normal;
        const vn = g.vel.dot(n);
        g.vel.addScaled(n, -2 * vn).scale(0.45);
        if (n.y > 0.7 && g.vel.len() < 40) g.vel.set(0, 0, 0);
      }
      if (g.fuse <= 0) { this.explode(g); continue; }
      if (g.pos.y < this.map.killY) continue;
      keep.push(g);
    }
    this.grenades = keep;
  }

  private explode(g: Grenade) {
    const def = NADES[g.kind];
    const owner = this.player(g.owner) ?? null;
    this.emit({ t: 'explode', kind: g.kind, pos: g.pos.clone() });
    if (g.kind === 'smoke') {
      this.smokes.push({ id: this.nextId++, pos: g.pos.clone().add(new V3(0, 40, 0)), t: 0, maxT: def.duration, radius: def.radius });
      return;
    }
    for (const q of this.players) {
      if (!q.alive) continue;
      const center = q.phys.pos.clone(); center.y += 36;
      const d = center.distTo(g.pos);
      if (d > def.radius) continue;
      const t = this.collision.traceRay(g.pos, center, newTrace(), 'glass');
      if (t.fraction < 0.99) continue;
      const k = 1 - d / def.radius;
      const dir = center.clone().sub(g.pos).normalize();
      if (g.kind === 'impulse') {
        q.phys.vel.addScaled(dir, def.force * (0.4 + 0.6 * k));
        q.phys.vel.y += 260 * k;
        q.phys.onGround = false;
        if (q.phys.pos.y - g.pos.y > -20) q.phys.pos.y += 1;
      } else {
        q.phys.vel.addScaled(dir, def.force * k);
        let dmg = def.damage * k;
        if (q === owner) dmg *= NADE_SELF_DAMAGE;
        this.applyDamage(q, owner, dmg, false, true, def.name, center);
      }
    }
  }

  private updateSmokes(dt: number) {
    for (const s of this.smokes) s.t += dt;
    this.smokes = this.smokes.filter((s) => s.t < s.maxT);
  }

  /** Line of sight blocked by smoke? (used by bots) */
  smokeBlocks(a: V3, b: V3): boolean {
    for (const s of this.smokes) {
      const r = s.radius * Math.min(1, s.t / 1.2) * (s.t > s.maxT - 2 ? (s.maxT - s.t) / 2 : 1);
      // distance from segment to sphere center
      const ab = b.clone().sub(a);
      const t = Math.max(0, Math.min(1, s.pos.clone().sub(a).dot(ab) / ab.lenSq()));
      const closest = a.clone().addScaled(ab, t);
      if (closest.distTo(s.pos) < r * 0.85) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ pickups
  private spawnDropped(ws: WeaponState, at: V3) {
    const t = this.collision.traceRay(at.clone().add(new V3(0, 20, 0)), at.clone().add(new V3(0, -2000, 0)));
    const pos = t.endPos.clone();
    this.pickups.push({ id: this.nextId++, kind: 'weapon', weapon: ws.id, pos, active: true, respawnAt: 0, dropped: true, ammo: { mag: ws.mag, reserve: ws.reserve } });
  }

  private dropCurrent(p: Player) {
    if (p.slot >= SLOT_KNIFE) return; // a faca não pode ser solta
    const w = p.currentWeapon();
    if (!w) return;
    const fwd = forwardFromAngles(p.yaw, 0, new V3());
    this.spawnDropped(w, p.phys.pos.clone().addScaled(fwd, 60));
    p.weapons[p.slot] = null;
    this.switchTo(p, this.firstWeaponSlot(p));
    this.emit({ t: 'message', text: `${WEAPONS[w.id].name} solta` });
  }

  /** Nearest weapon pickup in reach (for the "E" prompt). */
  nearestWeaponPickup(p: Player): PickupRuntime | null {
    let best: PickupRuntime | null = null, bd = ITEMS.weaponPickupRadius;
    for (const k of this.pickups) {
      if (!k.active || k.kind !== 'weapon') continue;
      const d = Math.hypot(k.pos.x - p.phys.pos.x, k.pos.y + 20 - (p.phys.pos.y + 20), k.pos.z - p.phys.pos.z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  private tryUsePickup(p: Player) {
    const k = this.nearestWeaponPickup(p);
    if (!k || !k.weapon) return;
    const def = WEAPONS[k.weapon];
    const cur = p.weapons[def.slot];
    if (cur && cur.id === k.weapon) {
      cur.reserve = Math.min(def.reserve * 2, cur.reserve + (k.ammo ? k.ammo.mag + k.ammo.reserve : def.mag + def.reserve));
    } else {
      if (cur) this.spawnDropped(cur, p.phys.pos);
      const ws = p.giveWeapon(k.weapon);
      if (k.ammo) { ws.mag = k.ammo.mag; ws.reserve = k.ammo.reserve; }
      p.switchTime = 0;
      this.switchTo(p, def.slot);
      p.switchTime = 0.3;
    }
    this.consumePickup(k);
    this.emit({ t: 'pickup', pid: p.id, kind: 'weapon', label: def.name });
  }

  private consumePickup(k: PickupRuntime) {
    if (k.dropped) { this.pickups = this.pickups.filter((x) => x !== k); return; }
    k.active = false;
    k.respawnAt = this.config.mode === 'training' ? this.time + ITEMS.respawnTrainingSeconds : Infinity;
  }

  private autoPickups(p: Player) {
    if (!p.alive) return;
    const pos = p.phys.pos;
    for (const k of this.pickups) {
      if (!k.active || k.kind === 'weapon') continue;
      const dy = (k.pos.y + 20) - (pos.y + 36);
      if (Math.hypot(k.pos.x - pos.x, k.pos.z - pos.z) > ITEMS.pickupRadius || Math.abs(dy) > 70) continue;
      let label = '';
      switch (k.kind) {
        case 'medkit':
          if (p.hp >= ITEMS.maxHp) continue;
          p.hp = Math.min(ITEMS.maxHp, p.hp + ITEMS.medkitHeal); label = `+${ITEMS.medkitHeal} VIDA`; break;
        case 'armor':
          if (p.armor >= ITEMS.maxArmor || p.inDuel >= 0) continue;
          p.armor = Math.min(ITEMS.maxArmor, p.armor + ITEMS.armorAmount); label = `+${ITEMS.armorAmount} COLETE`; break;
        case 'ammo': {
          let took = false;
          for (const w of p.weapons) if (w && !WEAPONS[w.id].melee && !WEAPONS[w.id].recharge) { const d = WEAPONS[w.id]; if (w.reserve < d.reserve * 2) { w.reserve = Math.min(d.reserve * 2, w.reserve + d.mag * 2); took = true; } }
          if (!took) continue;
          label = 'MUNIÇÃO'; break;
        }
        case 'nade_he': case 'nade_smoke': case 'nade_impulse': {
          const nk = k.kind.slice(5) as NadeKind;
          if (p.nades[nk] >= 1) continue;
          p.nades[nk]++;
          if (!this.hasNadesOther(p, nk)) p.nadeSel = nk;
          label = NADES[nk].name.toUpperCase(); break;
        }
        case 'shield':
          if (p.inDuel >= 0) continue;
          p.shield = ITEMS.shieldAmount; p.shieldTime = ITEMS.shieldDuration; label = 'ESCUDO TEMPORÁRIO'; break;
        case 'speed': {
          p.speedBoost = ITEMS.speedDuration;
          const h = Math.hypot(p.phys.vel.x, p.phys.vel.z);
          if (h > 10) { p.phys.vel.x += p.phys.vel.x / h * ITEMS.speedBoostImpulse; p.phys.vel.z += p.phys.vel.z / h * ITEMS.speedBoostImpulse; }
          label = 'VELOCIDADE+'; break;
        }
        default: continue;
      }
      this.consumePickup(k);
      this.emit({ t: 'pickup', pid: p.id, kind: k.kind, label });
    }
  }

  private hasNadesOther(p: Player, except: NadeKind) {
    return (Object.keys(p.nades) as NadeKind[]).some((k) => k !== except && p.nades[k] > 0);
  }

  private updatePickups() {
    if (this.config.mode !== 'training') return;
    for (const k of this.pickups) if (!k.active && this.time >= k.respawnAt) k.active = true;
  }

  // ------------------------------------------------------------------ triggers
  private checkTriggers(p: Player) {
    if (p.triggerCd > 0) return;
    const st = p.phys;
    for (const tr of this.map.triggers) {
      if (!overlap(st.pos, st.mins, st.maxs, tr)) continue;
      if (tr.kind === 'teleport') {
        const from = st.pos.clone();
        const d = tr.teamDest ? tr.teamDest[p.team] : { pos: tr.dest, yaw: tr.destYaw };
        st.pos.copy(d.pos);
        if (!tr.keepVelocity) st.vel.set(0, 0, 0);
        else {
          // mantém a velocidade, girada junto com a visão: quem entra correndo para frente sai correndo para frente
          const dy = d.yaw - p.yaw, c = Math.cos(dy), sn = Math.sin(dy);
          const vx = st.vel.x, vz = st.vel.z;
          st.vel.x = vx * c + vz * sn;
          st.vel.z = -vx * sn + vz * c;
          st.onGround = false;
          p.teleportGlide = PHYSICS.teleportGlide;
        }
        p.yaw = d.yaw; p.input.cmd.yaw = d.yaw;
        this.emit({ t: 'teleport', pid: p.id, from, to: st.pos.clone() });
      } else {
        const inH = Math.max(p.entrySpeed, Math.hypot(st.vel.x, st.vel.z));
        st.vel.copy(tr.velocity);
        if (tr.keepSpeed) {
          // sem perder velocidade: segue na direção do pad com a maior velocidade entre a de entrada e a do pad
          const padH = Math.hypot(tr.velocity.x, tr.velocity.z) || 1;
          const h = Math.max(padH, inH);
          st.vel.x = tr.velocity.x / padH * h; st.vel.z = tr.velocity.z / padH * h;
        }
        st.onGround = false;
        st.pos.y += 2;
        this.emit({ t: 'jumppad', pid: p.id });
      }
      p.triggerCd = 0.5;
      return;
    }
  }

  // ------------------------------------------------------------------ training helpers
  saveCheckpoint(p: Player) {
    this.checkpoints.set(p.id, { pos: p.phys.pos.clone(), vel: p.phys.vel.clone(), yaw: p.yaw, pitch: p.pitch });
  }
  loadCheckpoint(p: Player): boolean {
    const c = this.checkpoints.get(p.id);
    if (!c) return false;
    p.phys.pos.copy(c.pos); p.prevPos.copy(c.pos); p.phys.vel.copy(c.vel);
    p.input.cmd.yaw = c.yaw; p.input.cmd.pitch = c.pitch;
    return true;
  }
  resetPosition(p: Player) {
    this.spawnAt(p, this.map.trainingSpawn);
  }

  /** Random weapon helper for tests/tools. */
  randomWeapon(): WeaponId { return GUN_IDS[Math.floor(this.rng() * GUN_IDS.length)]; }
}

function overlap(pos: V3, mins: V3, maxs: V3, t: Trigger): boolean {
  return pos.x + maxs.x > t.min.x && pos.x + mins.x < t.max.x &&
    pos.y + maxs.y > t.min.y && pos.y + mins.y < t.max.y &&
    pos.z + maxs.z > t.min.z && pos.z + mins.z < t.max.z;
}

export { emptyInput };
