// =============================================================
//  Game — loop principal do cliente: input → simulação em timestep
//  fixo (100 Hz) → renderização interpolada + HUD + áudio.
// =============================================================
import { World, WorldConfig, SimEvent } from '../../../shared/sim/world';
import { Player, hitboxes } from '../../../shared/sim/player';
import { SIM_DT, PHYSICS, SPRINT } from '../../../shared/config/physics';
import { WEAPONS, WeaponId, NADES, ITEMS, SLOT_NADES, reloadDuration } from '../../../shared/config/weapons';
import { CLASSES, ClassId } from '../../../shared/config/classes';
import { V3, DEG, forwardFromAngles, rightFromYaw } from '../../../shared/math/vec3';
import type { MapDef, Team, PickupKind } from '../../../shared/maps/types';
import { Renderer, GpuMesh } from '../render/Renderer';
import { trs, child, mat4, multiply, Mat4 } from '../render/glm';
import { buildWorldMesh } from '../maps/worldMesh';
import { buildCharacter, buildWeapon, buildPickup, buildGrenade, buildCube, buildButterflyParts, ButterflyParts, CharacterMeshes, TEAM_COLORS, PICKUP_COLORS } from '../entities/models';
import { ViewPose, REST, butterflyDraw, butterflyInspect, gunInspect, nadeInspect, BF_DRAW_TIME, BF_INSPECT_TIME, GUN_INSPECT_TIME, NADE_INSPECT_TIME } from './viewAnims';
import { Effects } from './effects';
import { Input } from './input';
import type { Settings } from './settings';
import { keyLabel, saveSettings } from './settings';
import { Hud, esc } from '../ui/hud';
import { Sfx } from '../audio/sfx';
import type { SkillEvent } from '../../../shared/sim/skill';
import { RouteDriver } from '../../../shared/bots/routeDriver';
import { GhostSet, GhostTrack, GhostFrame, sampleTrack, nearestTick, GF_DUCK, GF_GROUND } from '../../../shared/sim/ghost';
import { GHOST, segmentWord } from '../../../shared/config/skill';
import { SkillMapMeta, formatTicks } from '../../../shared/config/skill';

interface MapMeshes { world: GpuMesh; glass: GpuMesh; zones: GpuMesh }

interface Assets {
  maps: Map<string, MapMeshes>;
  chars: Map<string, CharacterMeshes>;
  weapons: Map<WeaponId, GpuMesh>;
  pickups: Map<PickupKind, GpuMesh>;
  grenade: GpuMesh;
  flash: GpuMesh;
  hand: GpuMesh;
  butterfly: ButterflyParts;
}

export interface GameCallbacks {
  onPause: () => void;
  onMatchEnd: (w: World) => void;
  /** Surf Skill: eventos do cronômetro (recordes ficam por conta de quem criou o jogo) */
  onSkillEvent?: (w: World, e: SkillEvent) => void;
}

export class Game {
  world: World | null = null;
  private assets: Assets | null = null;
  private acc = 0;
  private time = 0;
  private fx = new Effects();
  private viewKick = 0;
  private viewKickYaw = 0;
  private bobPhase = 0;
  private eyeSmooth: number = PHYSICS.eyeHeight;
  private specIdx = 0;
  private swayX = 0; private swayY = 0; private lastYaw = 0; private lastPitch = 0;
  private flashTime = 0;
  /** início da animação de sacar a faca borboleta (relógio do cliente) */
  private knifeDrawStart = -10;
  /** inspeção em andamento (tecla F) */
  private inspect: { start: number; slot: number; weapon: string } | null = null;
  private sprintPose = 0;
  private slideRoll = 0;
  private fovKick = 0;
  private switchAnim = 0;
  private animPhase = new Map<number, number>();
  paused = false;
  private labels = new Map<number, HTMLDivElement>();
  private tmpM = mat4(); private tmpM2 = mat4(); private tmpM3 = mat4();
  private scoreboardHeld = false;
  private lastEnded = false;
  /** mapa da partida atual (o do construtor é o do menu) */
  private activeMap: MapDef;
  // ---- Surf Skill ----
  skillMeta: SkillMapMeta | null = null;
  skillMenuOpen = false;
  private pendingGoto: number | null = null;
  private pendingRestart = false;
  /** percurso de referência dirigindo o jogador (testes automáticos / depuração) */
  autopilot = false;
  private apDriver: RouteDriver | null = null;
  private apStage = -1;
  // ---- fantasma ----
  ghosts: GhostSet | null = null;
  /** o fantasma está sendo desenhado neste quadro (testes automáticos) */
  ghostVisible = false;
  private ghostPlayer = new Player(-77, 'PB', 'blue', 'runner', true);
  private ghostFrame: GhostFrame = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, seg: 0, ended: false };
  private ghostPrev = new V3();
  private ghostLabel: HTMLDivElement | null = null;
  private ghostHint = -1;
  /** diferença ao vivo para o fantasma (ticks; positivo = atrás) */
  ghostDiff: number | null = null;

  constructor(
    public r: Renderer, public input: Input, public hud: Hud, public sfx: Sfx,
    public settings: Settings, public map: MapDef, public cb: GameCallbacks,
  ) {
    this.activeMap = map;
    input.onKey = (code) => {
      // menu de stages aberto: 1–9 escolhe o stage
      if (!this.skillMenuOpen || !this.world?.skill) return false;
      const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
      if (m) {
        const n = Number(m[1]) - 1;
        if (n >= 0 && n < this.world.skill.stageCount) { this.pendingGoto = n; this.skillMenuOpen = false; return true; }
      }
      if (code === this.settings.keys.skillMenu || code === 'Escape') { this.skillMenuOpen = false; return true; }
      return false;
    };
    input.onAction = (a) => {
      if (!this.world || this.paused) return;
      const w = this.world, p = w.local;
      if (a === 'inspect') this.startInspect();
      if (w.config.mode === 'skill' && a === 'skillMenu') this.skillMenuOpen = !this.skillMenuOpen;
      if (w.config.mode === 'skill' && a === 'ghostToggle') {
        this.settings.ghostShow = !this.settings.ghostShow; saveSettings(this.settings);
        this.hud.toast(this.settings.ghostShow ? 'FANTASMA LIGADO' : 'FANTASMA DESLIGADO', '#7fe9ff');
      }
      if (w.config.mode === 'training') {
        if (a === 'resetPos') { w.resetPosition(p); this.syncView(); this.hud.toast('Posição reiniciada'); }
        if (a === 'fly') { p.fly = !p.fly; this.hud.toast(p.fly ? 'Voo ativado' : 'Voo desativado'); }
        if (a === 'saveCp') { w.saveCheckpoint(p); this.hud.toast('Checkpoint salvo'); }
        if (a === 'loadCp') { if (w.loadCheckpoint(p)) { this.syncView(); this.hud.toast('Checkpoint carregado'); } }
      }
    };
  }

  /** Build GPU assets once (map + models). */
  loadAssets() {
    if (this.assets) return;
    const r = this.r;
    const weapons = new Map<WeaponId, GpuMesh>();
    for (const id of Object.keys(WEAPONS) as WeaponId[]) weapons.set(id, buildWeapon(r, id));
    const pickups = new Map<PickupKind, GpuMesh>();
    for (const k of ['ammo', 'medkit', 'armor', 'nade_he', 'nade_smoke', 'nade_impulse', 'shield', 'speed'] as PickupKind[]) pickups.set(k, buildPickup(r, k));
    const handMb = buildCube(r, 0x262b38, 0);
    this.assets = {
      maps: new Map(), chars: new Map(), weapons, pickups,
      grenade: buildGrenade(r), flash: buildCube(r, 0xffe3a0, 1), hand: handMb, butterfly: buildButterflyParts(r),
    };
  }

  /** Malhas estáticas de um mapa (criadas uma vez por mapa). */
  private mapMeshes(map: MapDef): MapMeshes {
    let m = this.assets!.maps.get(map.name);
    if (!m) {
      const wm = buildWorldMesh(map);
      m = { world: this.r.createMesh(wm.opaque), glass: this.r.createMesh(wm.glass), zones: this.r.createMesh(wm.zones) };
      this.assets!.maps.set(map.name, m);
    }
    return m;
  }

  private charMeshes(team: Team, cls: ClassId): CharacterMeshes {
    const key = team + cls;
    let c = this.assets!.chars.get(key);
    if (!c) { c = buildCharacter(this.r, team, cls); this.assets!.chars.set(key, c); }
    return c;
  }

  start(cfg: WorldConfig, map: MapDef = this.map) {
    this.loadAssets();
    this.activeMap = map;
    this.mapMeshes(map);
    this.world = new World(map, cfg);
    this.skillMenuOpen = false; this.pendingGoto = null; this.pendingRestart = false;
    this.ghosts = null; this.ghostDiff = null; this.ghostHint = -1;
    if (cfg.mode !== 'skill') this.skillMeta = null;
    this.hud.skillMode(cfg.mode === 'skill');
    this.hud.clearTransient();
    this.acc = 0;
    this.fx.clear();
    this.applySettings();
    this.syncView();
    this.lastEnded = false;
    this.knifeDrawStart = this.time; this.inspect = null;
    this.hud.show(true);
    this.paused = false;
    this.clearLabels();
  }

  stop() {
    this.world = null;
    this.ghosts = null; this.ghostVisible = false;
    this.ghostLabel?.remove(); this.ghostLabel = null;
    this.hud.skillMode(false);
    this.skillMenuOpen = false;
    this.hud.show(false);
    this.clearLabels();
    this.sfx.setWind(0);
  }

  applySettings() {
    const s = this.settings;
    const q = s.quality;
    this.r.resolutionScale = q === 'low' ? 0.6 : q === 'medium' ? 0.8 : 1;
    this.fx.density = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
    this.fx.enabled = s.effects;
    this.sfx.setVolumes(s.masterVolume, s.sfxVolume);
    if (this.world) for (const p of this.world.players) if (!p.isBot) p.autoBhop = s.autoBhop;
  }

  syncView() {
    if (!this.world) return;
    const p = this.world.local;
    this.input.yaw = p.input.cmd.yaw = p.yaw;
    this.input.pitch = p.input.cmd.pitch = p.pitch;
    this.lastYaw = this.input.yaw; this.lastPitch = this.input.pitch;
  }

  // ------------------------------------------------------------------ loop
  frame(dt: number) {
    const w = this.world;
    this.time += dt;
    if (!w) return;
    if (!this.paused) {
      this.acc += Math.min(dt, 0.1);
      let first = true, steps = 0;
      while (this.acc >= SIM_DT && steps < 10) {
        this.buildLocalInput(first);
        first = false;
        w.step(SIM_DT);
        this.processEvents(w.drainEvents());
        this.footsteps(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      this.fx.update(dt);
    }
    this.render(dt);
    if (w.match.phase === 'matchEnd' && !this.lastEnded) {
      this.lastEnded = true;
      setTimeout(() => { if (this.world === w) this.cb.onMatchEnd(w); }, 2500);
    }
  }

  private buildLocalInput(first: boolean) {
    const w = this.world!, p = w.local, inp = p.input, i = this.input;
    const h = (a: Parameters<Input['held']>[0]) => (i.held(a) ? 1 : 0);
    inp.cmd.yaw = i.yaw; inp.cmd.pitch = i.pitch;
    inp.cmd.forward = h('forward') - h('back');
    inp.cmd.side = h('right') - h('left');
    inp.cmd.up = 0;
    // toques rápidos (apertar e soltar entre dois ticks) contam por pelo menos um tick:
    // importante para o slide (toque no Ctrl) e para o slide cancel (toque no Espaço)
    inp.cmd.jump = i.held('jump') || (first && i.consume('jump'));
    inp.cmd.crouch = i.held('crouch') || (first && i.consume('crouch'));
    inp.cmd.walk = i.held('walk');
    const live = i.locked || i.enabled;
    inp.fire = live && (i.mouse[0] || (first && i.consumeMouse(0)));
    inp.alt = live && (first ? i.consumeMouse(2) : false);
    if (first) {
      inp.reload = i.consume('reload');
      inp.use = i.consume('use');
      inp.ability = i.consume('ability');
      inp.drop = i.consume('drop');
      inp.slot = i.consume('slot1') ? 0 : i.consume('slot2') ? 1 : i.consume('slot3') ? 2 : i.consume('slot4') ? SLOT_NADES : null;
    } else { inp.reload = inp.use = inp.ability = inp.drop = false; inp.slot = null; }
    const sk = inp.skill;
    if (first && w.config.mode === 'skill') {
      sk.restartMap = i.consume('skillRestart') || this.pendingRestart;
      sk.restartStage = i.consume('skillStage');
      sk.saveLoc = i.consume('skillSave');
      sk.loadLoc = i.consume('skillLoad');
      sk.gotoStage = this.pendingGoto;
      this.pendingRestart = false; this.pendingGoto = null;
    } else { sk.restartMap = sk.restartStage = sk.saveLoc = sk.loadLoc = false; sk.gotoStage = null; }
    p.autoBhop = this.settings.autoBhop;
    if (this.autopilot && w.skill) {
      if (!this.apDriver || this.apStage !== w.skill.stage) {
        // chegou embalado pelo portal de um checkpoint: segue a rota sem a saída da plataforma
        const flowing = !!this.apDriver && this.apStage === w.skill.stage - 1;
        this.apDriver = new RouteDriver(w.skill.stageDef.route);
        if (flowing) this.apDriver.idx = w.skill.stageDef.flowFrom;
        this.apStage = w.skill.stage;
      }
      this.apDriver.drive(p.phys, inp.cmd, SIM_DT);
      inp.cmd.walk = false; inp.cmd.crouch = false;
      this.input.yaw = inp.cmd.yaw; this.input.pitch = inp.cmd.pitch = 0;
    }
  }

  // ------------------------------------------------------------------ events
  private processEvents(events: SimEvent[]) {
    const w = this.world!;
    const me = w.local;
    const viewer = this.viewed();
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          const p = w.player(e.pid);
          if (!p) break;
          const isMe = p.id === viewer.id;
          if (e.pellet === 0) {
            if (isMe) { this.flashTime = 0.05; this.viewKick = Math.min(1, this.viewKick + 0.5); }
            const [pan, g] = this.spatial(e.from);
            this.sfx.shot(e.weapon, isMe ? 0 : pan, isMe ? 1 : g);
            if (!isMe) this.fx.emit(e.from.x, e.from.y - 6, e.from.z, 3, { color: 0xffd27a, size: 18, speed: 40, max: 0.06, add: true });
          }
          // tracer starts from the muzzle (approx.) for the viewer
          const from = isMe ? this.muzzleWorld(p) : e.from;
          if (e.weapon === 'taser') this.fx.arc(from, e.to, 0x7fe9ff);
          else if (e.weapon !== 'shotgun' || e.pellet % 3 === 0) this.fx.tracer(from, e.to, e.weapon === 'sniper' ? 0xbfffe0 : 0xfff0b0, e.weapon === 'sniper' ? 2.6 : 1.4, e.weapon === 'sniper' ? 0.35 : 0.08);
          if (e.hitWorld && e.normal) this.fx.impact(e.to.x, e.to.y, e.to.z, e.normal.x, e.normal.y, e.normal.z);
          break;
        }
        case 'hit': {
          this.fx.blood(e.pos.x, e.pos.y, e.pos.z, e.head);
          if (e.attacker === viewer.id && e.victim !== viewer.id) { this.hud.hitmarker(e.head, e.killed); this.sfx.hitmarker(e.head); }
          if (e.victim === viewer.id) {
            const a = w.player(e.attacker);
            this.hud.damageFrom(viewer, a && a !== viewer ? { x: a.phys.pos.x, z: a.phys.pos.z } : null, e.dmg);
            this.sfx.hurt();
          }
          break;
        }
        case 'kill': {
          const killer = w.player(e.killer), victim = w.player(e.victim)!;
          this.hud.killfeed(killer, victim, e.weapon, e.head, e.killer === me.id || e.victim === me.id);
          this.fx.emit(victim.deathPos.x, victim.deathPos.y + 40, victim.deathPos.z, 30, { color: TEAM_COLORS[victim.team], size: 14, speed: 300, max: 0.8, add: true, grav: 300 });
          if (e.killer === me.id && e.victim !== me.id) { this.sfx.kill(); this.hud.toast(e.head ? 'ELIMINAÇÃO  HEADSHOT' : 'ELIMINAÇÃO', e.head ? '#ffd23c' : '#ffffff'); }
          if (e.victim === me.id && w.config.mode !== 'training') {
            this.hud.banner('ELIMINADO', killer && killer !== me ? `por ${killer.name} com ${e.weapon}` : '', 'red', 2.2);
            this.specIdx = 0;
          }
          break;
        }
        case 'pickup':
          if (e.pid === me.id) { this.sfx.pickup(); this.hud.toast(e.label, '#7fffd4'); }
          break;
        case 'reload': if (e.pid === viewer.id) this.sfx.reload(); break;
        case 'melee': {
          const isMe = e.pid === viewer.id;
          const [pan, g] = this.spatial(e.pos);
          this.sfx.knife(e.hit, e.heavy, isMe ? 0 : pan, isMe ? 1 : g);
          if (isMe) this.viewKick = Math.min(1, this.viewKick + (e.heavy ? 0.6 : 0.3));
          if (e.hit === 'world' && e.normal) this.fx.impact(e.pos.x, e.pos.y, e.pos.z, e.normal.x, e.normal.y, e.normal.z);
          if (e.backstab && e.pid === me.id) this.hud.toast('PELAS COSTAS', '#ffd23c');
          break;
        }
        case 'slide':
          if (e.pid === viewer.id) this.sfx.slide(e.phase);
          if (e.phase === 'start') { const p = w.player(e.pid); if (p) this.fx.emit(p.phys.pos.x, p.phys.pos.y + 4, p.phys.pos.z, 8, { color: 0xdfe6f0, size: 16, speed: 90, max: 0.5, alpha: 0.5, grow: 20 }); }
          break;
        case 'empty': if (e.pid === viewer.id) this.sfx.empty(); break;
        case 'switch':
          if (e.pid === viewer.id) {
            this.sfx.switchWeapon(); this.switchAnim = 1; this.inspect = null;
            if (viewer.slot === 2) this.knifeDrawStart = this.time;
          }
          break;
        case 'ability': {
          const p = w.player(e.pid)!;
          const col = CLASSES[e.cls].color;
          this.fx.emit(e.pos.x, e.pos.y + 36, e.pos.z, 30, { color: col, size: 22, speed: 260, max: 0.6, add: true });
          if (e.pid === viewer.id || p.phys.pos.distTo(viewer.phys.pos) < 2000) this.sfx.ability(e.cls);
          if (e.pid === me.id) this.hud.toast(CLASSES[e.cls].ability.name.toUpperCase(), '#' + col.toString(16).padStart(6, '0'));
          break;
        }
        case 'heal': if (e.pid === me.id) this.hud.toast(`+${e.amount} VIDA`, '#7fffd4'); break;
        case 'teleport':
          this.fx.emit(e.from.x, e.from.y + 36, e.from.z, 24, { color: 0x9b7bff, size: 20, speed: 200, max: 0.5, add: true });
          this.fx.emit(e.to.x, e.to.y + 36, e.to.z, 24, { color: 0x9b7bff, size: 20, speed: 200, max: 0.5, add: true });
          if (e.pid === me.id) {
            this.sfx.teleport();
            if (!e.ability) this.syncView();
            if (e.fall) this.hud.toast('VOCÊ CAIU — DE VOLTA À BASE', '#9cc2ff');
          }
          break;
        case 'jumppad': if (e.pid === me.id) this.sfx.jumppad(); break;
        case 'jump': if (e.pid === me.id) this.sfx.jump(); break;
        case 'land': if (e.pid === me.id) this.sfx.land(e.speed); break;
        case 'explode': {
          this.fx.explosion(e.pos.x, e.pos.y, e.pos.z, e.kind);
          const [pan, g] = this.spatial(e.pos);
          this.sfx.explosion(pan, g, e.kind);
          break;
        }
        case 'nadeThrow': if (e.pid === me.id) this.switchAnim = 0.6; break;
        case 'duel': {
          const a = w.player(e.a)!, b = w.player(e.b)!;
          if (a.id === me.id || b.id === me.id) {
            const foe = a.id === me.id ? b : a;
            this.hud.banner('DUELO 1v1', `contra ${foe.name} — ${WEAPONS[e.weapon].name}, sem poderes`, '', 3);
            this.syncView();
          }
          break;
        }
        case 'message': this.hud.toast(e.text); break;
        case 'skillStart': this.sfx.skillStart(); this.cb.onSkillEvent?.(w, e); break;
        case 'skillSplit': {
          const n = w.skill!.stageCount;
          this.hud.skillSplit(e, n, w.skill!.course.format);
          if (e.stage < n - 1) {
            this.sfx.skillSplit(e.diffTotal === null ? null : e.diffTotal <= 0);
            this.syncView();
            this.fx.emit(me.phys.pos.x, me.phys.pos.y + 40, me.phys.pos.z, 26, { color: 0x3ddc84, size: 18, speed: 220, max: 0.6, add: true });
          }
          this.cb.onSkillEvent?.(w, e);
          break;
        }
        case 'skillReset':
          this.apDriver = null;
          if (e.reason === 'map' || e.reason === 'goto') { this.hud.clearTransient(); this.ghostHint = -1; }
          this.syncView();
          this.sfx.skillReset(e.reason === 'fall');
          if (e.reason === 'fall') this.hud.toast(`CAIU — DE VOLTA AO STAGE ${e.stage + 1}`, '#ff9f5a');
          else if (e.reason === 'map') this.hud.toast('MAPA REINICIADO', '#9cc2ff');
          else if (e.reason === 'goto') this.hud.toast(`STAGE ${e.stage + 1} · PRÁTICA`, '#ffd23c');
          else if (e.reason === 'loadloc') this.hud.toast('POSIÇÃO CARREGADA · PRÁTICA', '#ffd23c');
          this.cb.onSkillEvent?.(w, e);
          break;
        case 'skillFinish':
          this.sfx.skillFinish();
          this.hud.banner(e.practice ? 'CONCLUÍDO (PRÁTICA)' : 'CONCLUÍDO', formatTicks(e.total), '', 3);
          this.cb.onSkillEvent?.(w, e);
          break;
        case 'skillSave': this.hud.toast('POSIÇÃO SALVA · PRÁTICA', '#ffd23c'); break;
        case 'skillDenied': this.hud.toast(e.text, '#ff9f5a'); break;
        case 'match': this.onMatch(e.tr);
      }
    }
  }

  private onMatch(tr: import('../../../shared/sim/match').MatchTransition) {
    const w = this.world!;
    const me = w.local;
    if (tr.type === 'roundStart') {
      this.syncView();
      this.knifeDrawStart = this.time; this.inspect = null;
      this.fx.clear();
      this.hud.banner(`ROUND ${tr.round}`, `${CLASSES[me.classId].name} — ${CLASSES[me.classId].ability.name} [${keyLabel(this.settings.keys.ability)}]`, me.team, 2.4);
    } else if (tr.type === 'enter' && tr.phase === 'countdown') {
      this.countdownBeeps();
    } else if (tr.type === 'enter' && tr.phase === 'active') {
      this.hud.banner('LUTE!', 'Elimine a equipe adversária', me.team, 1.2);
      this.sfx.beep(true);
    } else if (tr.type === 'roundEnd') {
      const won = tr.winner === me.team;
      const title = tr.winner ? (tr.winner === 'blue' ? 'AZUL VENCE O ROUND' : 'VERMELHO VENCE O ROUND') : 'EMPATE';
      const sub = tr.reason === 'tiebreak' ? 'Desempate por vida restante' : tr.reason === 'duel' ? 'Decidido nos duelos' : '';
      this.hud.banner(title, sub, tr.winner ?? '', 3.5);
      if (tr.winner) (won ? this.sfx.victory() : this.sfx.defeat());
    } else if (tr.type === 'matchEnd') {
      const won = tr.winner === me.team;
      this.hud.banner(won ? 'VITÓRIA' : 'DERROTA', `${w.match.score.blue} × ${w.match.score.red}`, tr.winner, 4);
      won ? this.sfx.victory() : this.sfx.defeat();
    }
  }

  private countdownBeeps() {
    const w = this.world;
    let n = 3;
    const tick = () => {
      if (this.world !== w || n <= 0) return;
      this.hud.banner(String(n), '', '', 0.9);
      this.sfx.beep(false);
      n--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  /** Passos: correndo fazem barulho (ouvido por quem está perto); caminhando (Shift) ou agachado, silêncio. */
  private stepAcc = new Map<number, number>();
  private footsteps(dt: number) {
    const w = this.world!, viewer = this.viewed();
    for (const p of w.players) {
      const hs = Math.hypot(p.phys.vel.x, p.phys.vel.z);
      const silent = !p.alive || p.walking || p.phys.ducked || p.slideTime > 0 || p.fly || !p.phys.onGround || hs < 120;
      if (silent) { this.stepAcc.set(p.id, p.walking ? 0 : (this.stepAcc.get(p.id) ?? 0)); continue; }
      let acc = (this.stepAcc.get(p.id) ?? 0) + hs * dt;
      const stride = 105;
      if (acc >= stride) {
        acc -= stride;
        if (p === viewer) this.sfx.step(0, 0.32, hs);
        else {
          const [pan, g] = this.spatial(p.phys.pos);
          if (g > 0.35) this.sfx.step(pan, g * 0.55, hs);
        }
      }
      this.stepAcc.set(p.id, acc);
    }
  }

  /** Stereo pan & gain for a world position relative to the viewer. */
  private spatial(pos: V3): [number, number] {
    const v = this.viewed();
    const dx = pos.x - v.phys.pos.x, dz = pos.z - v.phys.pos.z;
    const d = Math.hypot(dx, pos.y - v.phys.pos.y, dz);
    const r = rightFromYaw(this.input.yaw);
    const pan = d > 1 ? (dx * r.x + dz * r.z) / Math.hypot(dx, dz) : 0;
    const gain = Math.min(1, 900 / (d + 300));
    return [pan * 0.8, gain];
  }

  /** The player the camera follows (local or spectated teammate). */
  viewed(): Player {
    const w = this.world!;
    const me = w.local;
    if (me.alive || w.config.mode === 'training') return me;
    const mates = w.players.filter((p) => p.alive && p.team === me.team);
    const pool = mates.length ? mates : w.players.filter((p) => p.alive);
    if (!pool.length) return me;
    return pool[this.specIdx % pool.length];
  }

  cycleSpectate() { this.specIdx++; }

  private muzzleWorld(p: Player): V3 {
    const f = forwardFromAngles(this.input.yaw, this.input.pitch), r = rightFromYaw(this.input.yaw);
    const e = p.eyePos();
    return e.addScaled(f, 30).addScaled(r, 7).add(new V3(0, -6, 0));
  }

  // ------------------------------------------------------------------ render
  private render(dt: number) {
    const w = this.world!, r = this.r, A = this.assets!;
    const alpha = this.paused ? 1 : this.acc / SIM_DT;
    const viewer = this.viewed();
    const me = w.local;
    const isMe = viewer === me;
    const vpos = new V3().copy(viewer.prevPos).lerp(viewer.phys.pos, alpha);

    // view angles: local = immediate mouse; spectating = their angles
    const yaw = isMe ? this.input.yaw : viewer.yaw;
    const pitch = isMe ? this.input.pitch : viewer.pitch;
    this.eyeSmooth += (viewer.eyeHeight - this.eyeSmooth) * Math.min(1, dt * 14);
    const hs = Math.hypot(viewer.phys.vel.x, viewer.phys.vel.z);
    if (viewer.phys.onGround && hs > 30) this.bobPhase += dt * hs * 0.035;
    // com a Longbow no zoom a mira fica parada: sem balanço, sem pouso e sem recuo visual
    const wsView = viewer.currentWeapon();
    const scopedStatic = viewer.zoomed && !!wsView && wsView.id === 'sniper';
    const bobAmt = this.settings.viewBob && viewer.phys.onGround && !scopedStatic ? Math.min(1, hs / 250) : 0;
    const bob = Math.sin(this.bobPhase) * 1.4 * bobAmt;
    const land = scopedStatic ? 0 : -viewer.phys.landImpact * 7;
    this.viewKick = Math.max(0, this.viewKick - dt * 6);
    const punchVis = scopedStatic ? 0 : 0.5;
    const camPitch = pitch + viewer.punchPitch * DEG * punchVis;
    const camYaw = yaw + viewer.punchYaw * DEG * punchVis;
    // FOV (horizontal setting at 16:9 → vertical), zoom
    const ws = viewer.currentWeapon();
    let tanH = Math.tan((this.settings.fov * DEG) / 2) * (9 / 16);
    let sensMul = 1;
    if (viewer.zoomed && ws && WEAPONS[ws.id].zoom > 0) { tanH *= WEAPONS[ws.id].zoom; sensMul = WEAPONS[ws.id].zoom; }
    this.input.sensMul = isMe ? sensMul : 1;
    // sprint/slide: leve abertura de FOV e inclinação da câmera no slide (sem afetar a mira)
    const kickGoal = viewer.slideTime > 0 ? 1 : viewer.sprinting ? 0.25 : 0;
    this.fovKick += (kickGoal - this.fovKick) * Math.min(1, dt * 8);
    this.slideRoll += ((viewer.slideTime > 0 ? 0.045 : 0) - this.slideRoll) * Math.min(1, dt * 10);
    if (!viewer.zoomed) tanH *= 1 + this.fovKick * 0.06;
    const fovY = 2 * Math.atan(tanH);
    r.beginFrame({ x: vpos.x, y: vpos.y + this.eyeSmooth + bob + land, z: vpos.z, yaw: camYaw, pitch: camPitch, roll: this.settings.viewBob ? this.slideRoll : 0, fovY }, this.time);

    // world
    const MM = this.mapMeshes(w.map);
    r.drawMesh(MM.world, null, { grid: 1 });

    // pickups
    const t = this.time;
    for (const k of w.pickups) {
      if (!k.active) continue;
      const bobY = Math.sin(t * 2 + k.id) * 4 + 18;
      const spin = t * 1.6 + k.id;
      const mesh = k.kind === 'weapon' ? A.weapons.get(k.weapon!)! : A.pickups.get(k.kind)!;
      const col = k.kind === 'weapon' ? 0xffffff : PICKUP_COLORS[k.kind];
      const scale = k.kind === 'weapon' ? 1.25 : 1.3;
      r.drawMesh(mesh, trs(this.tmpM, k.pos.x, k.pos.y + bobY, k.pos.z, spin, k.kind === 'weapon' ? 0 : 0, k.kind === 'weapon' ? 0.3 : 0, scale), { emissive: 0.15 + 0.1 * Math.sin(t * 4 + k.id) });
      // glow base & light column
      const glowCol = k.kind === 'weapon' ? (k.weapon === 'sniper' || k.weapon === 'rifle' ? 0xffc93d : 0xffffff) : col;
      this.groundRing(k.pos.x, k.pos.y + 1.5, k.pos.z, 22, glowCol, 0.55);
      if (!k.dropped) r.ribbon(k.pos.x, k.pos.y, k.pos.z, k.pos.x, k.pos.y + 90, k.pos.z, 10, glowCol, 0.12, true);
      if (Math.random() < 0.15 * this.fx.density) this.fx.emit(k.pos.x, k.pos.y + 10, k.pos.z, 1, { color: glowCol, size: 5, speed: 20, max: 1, add: true, grav: -40 });
    }

    // teleporter columns
    for (const tg of w.map.triggers) {
      const cx = (tg.min.x + tg.max.x) / 2, cz = (tg.min.z + tg.max.z) / 2, y = tg.min.y;
      if (tg.kind === 'teleport') {
        for (let i = 0; i < 3; i++) {
          const a = t * 1.5 + i * 2.1, rr = (tg.max.x - tg.min.x) * 0.38;
          r.ribbon(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, cx + Math.cos(a) * rr, y + 140, cz + Math.sin(a) * rr, 8, tg.color, 0.35, true);
        }
      } else {
        const k = (t * 1.4) % 1;
        this.groundRing(cx, y + 6 + k * 60, cz, 50, tg.color, (1 - k) * 0.6);
      }
    }

    // grenades
    for (const g of w.grenades) {
      const gp = new V3().copy(g.prevPos).lerp(g.pos, alpha);
      r.drawMesh(A.grenade, trs(this.tmpM, gp.x, gp.y, gp.z, t * 8, t * 5), { tint: NADES[g.kind].color, tintMix: 0.6, emissive: 0.3 });
      if (Math.random() < 0.6) this.fx.emit(gp.x, gp.y, gp.z, 1, { color: NADES[g.kind].color, size: 6, speed: 5, max: 0.3, add: true });
    }
    // smoke clouds
    for (const s of w.smokes) {
      const grow = Math.min(1, s.t / 1.2), fade = s.t > s.maxT - 2 ? (s.maxT - s.t) / 2 : 1;
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * s.radius * 0.7 * grow;
        this.fx.emit(s.pos.x + Math.cos(a) * rr, s.pos.y + (Math.random() - 0.3) * s.radius * 0.6 * grow, s.pos.z + Math.sin(a) * rr, 1,
          { color: 0xdfe5ee, size: 220 * grow, speed: 6, max: 2.2, alpha: 0.55 * fade, grow: 30 });
      }
    }

    // players
    const predatorSense = viewer.classId === 'predator' && viewer.abilityActive > 0;
    let nearestEnemy: Player | null = null, nd = Infinity;
    for (const p of w.players) {
      if (!p.alive) continue;
      if (p === viewer) continue;
      const pp = new V3().copy(p.prevPos).lerp(p.phys.pos, alpha);
      this.drawCharacter(p, pp, dt);
      if (p.team !== viewer.team) {
        const d = pp.distTo(vpos);
        if (d < nd && p.inDuel === viewer.inDuel) { nd = d; nearestEnemy = p; }
        if (predatorSense && d < CLASSES.predator.params.revealRange && p.inDuel === viewer.inDuel) {
          const flicker = 0.5 + 0.5 * Math.sin(t * 18 + p.id);
          this.drawCharacter(p, pp, 0, { xray: true, tint: 0xff1030, alpha: 0.35 + flicker * 0.4 });
        }
      }
      // blob shadow
      this.blobShadow(pp);
    }
    if (predatorSense && nearestEnemy) this.bloodMist(vpos, nearestEnemy, alpha);
    if (!isMe || w.config.mode === 'training') { /* no self shadow */ }

    // teammate name tags
    this.updateLabels(w, viewer, alpha);

    this.fx.draw(r);
    r.drawMesh(MM.glass, null, { alpha: 0.28, emissive: 0.4 });
    if (w.skill) r.drawMesh(MM.zones, null, { alpha: 0.16 + 0.05 * Math.sin(this.time * 3), emissive: 1 });
    if (w.skill) this.drawGhost(w, vpos, alpha, dt); else this.ghostVisible = false;
    r.flushEffects();

    // first-person weapon (viewmodel)
    if (viewer.alive && !(viewer.zoomed && ws && ws.id === 'sniper')) this.drawViewmodel(viewer, dt, hs, yaw, pitch);

    // HUD
    let prompt: string | null = null;
    if (isMe && me.alive) {
      const k = w.nearestWeaponPickup(me);
      if (k && k.weapon) prompt = `<kbd>${keyLabel(this.settings.keys.use)}</kbd>Pegar ${esc(WEAPONS[k.weapon].name)}`;
    }
    this.hud.update(w, viewer, { showSpeed: this.settings.showSpeed || w.config.mode !== 'bots', training: w.config.mode === 'training', dt, spectating: !isMe, nearPrompt: prompt });
    if (w.skill && this.skillMeta) this.hud.skillUpdate(w, this.skillMeta, dt, this.skillHelp(), this.skillMenuOpen ? this.skillMenuHtml() : null, this.ghostDiff, this.ghostVisible || (this.settings.ghostShow && !!this.ghosts?.pb));
    else this.hud.scoreboard(w, this.input.held('scoreboard') || w.match.phase === 'matchEnd', me.id);
    if (w.config.mode === 'training') {
      const K = (a: keyof Settings['keys']) => `<span class="kbd">${keyLabel(this.settings.keys[a])}</span>`;
      this.hud.trainingHelp(true, `${K('resetPos')} reiniciar posição &nbsp; ${K('fly')} voar ${me.fly ? '(ligado)' : ''}<br>${K('saveCp')} salvar checkpoint &nbsp; ${K('loadCp')} carregar<br>Pickups reaparecem em ${ITEMS.respawnTrainingSeconds}s. Alvos ressurgem em 3s.`);
    } else this.hud.trainingHelp(false, '');
    this.sfx.setWind(this.paused ? 0 : Math.hypot(viewer.phys.vel.x, viewer.phys.vel.y * 0.5, viewer.phys.vel.z));
  }

  private skillHelp(): string {
    const K = (a: keyof Settings['keys']) => `<span class="kbd">${keyLabel(this.settings.keys[a])}</span>`;
    const linear = this.world?.skill?.linear;
    return `${K('skillRestart')} reiniciar mapa &nbsp; ${K('skillStage')} ${linear ? 'último checkpoint' : 'reiniciar stage'}<br>${K('skillMenu')} menu de ${linear ? 'checkpoints' : 'stages'} &nbsp; ${K('ghostToggle')} fantasma<br>`
      + `${K('skillSave')} salvar posição &nbsp; ${K('skillLoad')} voltar a ela <span style="opacity:.7">(prática)</span>`;
  }

  private skillMenuHtml(): string {
    const sk = this.world!.skill!;
    const locked = sk.state === 'running' && !sk.practice;
    const linear = sk.linear;
    const label = (i: number) => (linear ? (i === 0 ? 'Largada' : `Checkpoint ${i}`) : `Stage ${i + 1}`);
    const rows = sk.course.segments.map((st, i) => `<div class="row"><span class="kbd">${i + 1}</span><span>${label(i)} · ${esc(st.name)}</span></div>`).join('');
    return `<h3>${linear ? 'Checkpoints' : 'Stages'}</h3>${rows}<div class="muted">${locked
      ? `Ir para um ${segmentWord(sk.course.format)} só vale fora de uma corrida cronometrada. Reinicie o mapa ou use a prática.`
      : `Escolha um número. Começar de outro ponto que não a largada conta como prática (sem recorde).`}</div>`;
  }

  /** Recebe os fantasmas guardados do mapa atual. */
  setGhosts(set: GhostSet | null) { this.ghosts = set; this.ghostHint = -1; }

  /** Fantasma do PB: corre ao lado, sincronizado pelo cronômetro; some perto da câmera. */
  private drawGhost(w: World, cam: V3, alpha: number, dt: number) {
    const sk = w.skill!;
    this.ghostVisible = false;
    this.ghostDiff = null;
    const set = this.ghosts;
    const hide = () => { if (this.ghostLabel) this.ghostLabel.style.display = 'none'; };
    if (!set || !this.settings.ghostShow || sk.state === 'finished') { hide(); return; }
    // por segmento: o fantasma recomeça em cada stage/checkpoint com o melhor segmento (também na prática)
    const segMode = this.settings.ghostSync === 'segment' || (sk.practice && sk.stage > 0);
    let track: GhostTrack | null, t: number, ghostTicks: number | null;
    const running = sk.state === 'running' && !this.paused;
    if (segMode) {
      track = set.segments[sk.stage] ?? null;
      t = sk.state === 'running' ? sk.ticks - sk.segmentEnteredAt + (running ? alpha : 0) : 0;
      ghostTicks = set.segTicks[sk.stage] ?? null;
    } else {
      track = set.pb;
      t = sk.state === 'running' ? sk.ticks + (running ? alpha : 0) : 0;
      ghostTicks = set.pbTicks;
    }
    if (!track) { hide(); return; }
    const f = sampleTrack(track, t, this.ghostFrame);
    if (f.ended) { hide(); return; }
    // diferença ao vivo: em que tempo o fantasma passou pelo ponto onde você está
    if (sk.state === 'running') {
      const me = w.local.phys.pos;
      const gt = nearestTick(track, me, segMode ? null : sk.stage, this.ghostHint);
      if (gt >= 0) {
        this.ghostHint = gt / track.rateTicks;
        this.ghostDiff = (segMode ? sk.ticks - sk.segmentEnteredAt : sk.ticks) - gt;
      }
    }
    const gp = new V3(f.x, f.y, f.z);
    const dist = gp.distTo(cam);
    const fade = Math.max(0, Math.min(1, (dist - GHOST.fadeNear) / (GHOST.fadeFar - GHOST.fadeNear)));
    const a = this.settings.ghostOpacity * fade;
    // animação: velocidade a partir do deslocamento
    const g = this.ghostPlayer;
    if (dt > 0) g.phys.vel.set((f.x - this.ghostPrev.x) / dt, 0, (f.z - this.ghostPrev.z) / dt);
    if (g.phys.vel.hLen() > 4000) g.phys.vel.set(0, 0, 0);
    this.ghostPrev.copy(gp);
    g.yaw = f.yaw; g.pitch = f.pitch;
    g.phys.onGround = !!(f.flags & GF_GROUND); g.phys.ducked = !!(f.flags & GF_DUCK); g.phys.surfing = false;
    g.slideTime = 0; g.sprinting = false;
    if (a > 0.02) {
      this.drawCharacter(g, gp, dt, { xray: false, tint: 0x9ff4ff, alpha: a });
      this.ghostVisible = true;
    }
    // plaquinha
    const s = this.r.project(gp.x, gp.y + 96, gp.z);
    if (!this.ghostLabel) {
      this.ghostLabel = document.createElement('div');
      this.ghostLabel.id = 'ghost-label';
      document.body.appendChild(this.ghostLabel);
    }
    if (s && a > 0.02) {
      this.ghostLabel.style.display = 'block';
      this.ghostLabel.textContent = `${segMode ? 'MELHOR' : 'PB'} ${ghostTicks !== null ? formatTicks(ghostTicks) : ''}`;
      this.ghostLabel.style.left = `${s.x}px`; this.ghostLabel.style.top = `${s.y}px`;
      this.ghostLabel.style.opacity = String(Math.min(1, a * 2));
    } else hide();
  }

  /** Reinicia o mapa no próximo tick (tela de fim → Reiniciar). */
  skillRestart() { this.pendingRestart = true; }

  /** Avisos de recorde vindos de quem guarda os recordes. */
  skillRecordFeedback(newPb: boolean, rank: number | null) {
    if (newPb) { this.sfx.skillRecord(); this.hud.banner('NOVO RECORDE', rank ? `#${rank} no ranking local` : '', '', 3.5); }
  }

  private groundRing(x: number, y: number, z: number, rad: number, color: number, a: number) {
    const seg = 16;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      this.r.flatQuad([
        [x + Math.cos(a0) * rad, y, z + Math.sin(a0) * rad], [x + Math.cos(a1) * rad, y, z + Math.sin(a1) * rad],
        [x + Math.cos(a1) * (rad + 5), y, z + Math.sin(a1) * (rad + 5)], [x + Math.cos(a0) * (rad + 5), y, z + Math.sin(a0) * (rad + 5)],
      ], color, a, true);
    }
  }

  private blobShadow(p: V3) {
    const w = this.world!;
    const tr = w.collision.traceRay(new V3(p.x, p.y + 4, p.z), new V3(p.x, p.y - 900, p.z));
    if (tr.fraction >= 1) return;
    const y = tr.endPos.y + 0.8, s = 18 * (1 - tr.fraction * 0.6), a = 0.35 * (1 - tr.fraction);
    this.r.flatQuad([[p.x - s, y, p.z - s], [p.x + s, y, p.z - s], [p.x + s, y, p.z + s], [p.x - s, y, p.z + s]], 0x0b1530, a);
  }

  private bloodMist(from: V3, target: Player, alpha: number) {
    const tp = new V3().copy(target.prevPos).lerp(target.phys.pos, alpha);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = Math.random();
      const x = from.x + (tp.x - from.x) * k, z = from.z + (tp.z - from.z) * k;
      const y = from.y + 30 + (tp.y - from.y) * k + Math.sin(k * Math.PI) * 60;
      this.fx.emit(x + (Math.random() - 0.5) * 30, y, z + (Math.random() - 0.5) * 30, 1, { color: 0xb3001b, size: 26, speed: 10, max: 0.7, alpha: 0.5, grow: 20 });
    }
  }

  private drawCharacter(p: Player, pos: V3, dt: number, xr?: { xray: boolean; tint: number; alpha: number }) {
    const r = this.r, cm = this.charMeshes(p.team, p.classId);
    const hs = Math.hypot(p.phys.vel.x, p.phys.vel.z);
    let ph = this.animPhase.get(p.id) ?? 0;
    if (p.phys.onGround && dt > 0) ph += dt * hs * 0.045;
    this.animPhase.set(p.id, ph);
    const air = !p.phys.onGround;
    const swing = air ? 0 : Math.sin(ph) * Math.min(0.9, hs / 250) * 0.8;
    const duck = p.phys.ducked ? 18 : 0;
    // lean while surfing (toward the ramp)
    let roll = 0;
    if (p.phys.surfing) {
      const n = p.phys.surfNormal; const rgt = rightFromYaw(p.yaw);
      roll = -(n.x * rgt.x + n.z * rgt.z) * 0.35;
    }
    const opts = xr ? { xray: xr.xray, tint: xr.tint, tintMix: 1, emissive: 1, alpha: xr.alpha } : (p.classId === 'berserker' && p.abilityActive > 0 ? { emissive: 0.25, tint: 0xff9f1c, tintMix: 0.25 } : undefined);
    const root = trs(this.tmpM, pos.x, pos.y, pos.z, p.yaw, 0, roll);
    const hip = 32 - duck * 0.7;
    // legs
    const legL = air ? 0.7 : swing, legR = air ? 0.2 : -swing;
    r.drawMesh(cm.legL, child(this.tmpM2, root, -6, hip, 0, 0, legL, 0, 1, 1 - duck / 60), opts);
    r.drawMesh(cm.legR, child(this.tmpM2, root, 6, hip, 0, 0, legR, 0, 1, 1 - duck / 60), opts);
    // torso
    const torso = child(this.tmpM3, root, 0, hip, 0, 0, p.slideTime > 0 ? 0.45 : p.phys.ducked ? -0.25 : air ? -0.08 : p.sprinting ? -0.18 : 0);
    r.drawMesh(cm.torso, torso, opts);
    r.drawMesh(cm.head, child(this.tmpM2, torso, 0, 25, 0, 0, p.pitch * 0.6), opts);
    // arms aim with pitch
    const armPitch = p.weaponRaised ? 0.6 : Math.PI / 2 + p.pitch; // correndo: arma levantada junto ao peito
    const armR = child(mat4(), torso, 15, 22, -1, 0, armPitch, 0);
    r.drawMesh(cm.armR, armR, opts);
    r.drawMesh(cm.armL, child(this.tmpM2, torso, -13, 22, -1, -0.45, armPitch, 0), opts);
    // weapon in hand
    const wpn = p.slot < SLOT_NADES ? p.weapons[p.slot] : null;
    if (wpn && !xr) {
      const handM = child(this.tmpM2, armR, -4, -24, 0, 0, -Math.PI / 2, 0, 0.9);
      r.drawMesh(this.assets!.weapons.get(wpn.id)!, handM);
    }
    // ability FX
    if (!xr && p.abilityActive > 0 && Math.random() < 0.5) {
      this.fx.emit(pos.x, pos.y + 40, pos.z, 1, { color: CLASSES[p.classId].color, size: 12, speed: 40, max: 0.5, add: true, grav: -50 });
    }
    if (!xr && p.tired > 0 && Math.random() < 0.3) this.fx.emit(pos.x, pos.y + 70, pos.z, 1, { color: 0x9b7bff, size: 8, speed: 15, max: 0.6, add: true });
  }

  /** Tecla F: inspeciona a arma na mão (só visual). */
  private startInspect() {
    const p = this.world?.local;
    if (!p || !p.alive || p.weaponRaised || p.slideTime > 0 || p.reloadTime > 0 || p.switchTime > 0) return;
    const ws = p.currentWeapon();
    this.inspect = { start: this.time, slot: p.slot, weapon: ws?.id ?? 'nade' };
    this.knifeDrawStart = -10;
  }

  /** Pose extra da animação atual (sacar/inspecionar), ou cancela a inspeção se o jogador agiu. */
  private viewPose(p: Player, isKnife: boolean): ViewPose {
    const ins = this.inspect;
    if (ins) {
      const ws = p.currentWeapon();
      const cancelled = p.slot !== ins.slot || (ws?.id ?? 'nade') !== ins.weapon || p.weaponRaised || p.slideTime > 0 || p.reloadTime > 0
        || this.input.mouse[0] || this.input.mouse[2] || !p.alive;
      const t = this.time - ins.start;
      const dur = isKnife ? BF_INSPECT_TIME : p.slot === SLOT_NADES ? NADE_INSPECT_TIME : GUN_INSPECT_TIME;
      if (cancelled || t > dur) this.inspect = null;
      else return isKnife ? butterflyInspect(t) : p.slot === SLOT_NADES ? nadeInspect(t) : gunInspect(t);
    }
    if (isKnife && this.time - this.knifeDrawStart < BF_DRAW_TIME) return butterflyDraw(this.time - this.knifeDrawStart);
    return REST;
  }

  private drawViewmodel(p: Player, dt: number, hs: number, yaw: number, pitch: number) {
    const r = this.r;
    const ws = p.currentWeapon();
    const vp = r.beginViewmodel(65 * DEG);
    void vp;
    // sway from mouse movement
    const dyaw = yaw - this.lastYaw, dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw; this.lastPitch = pitch;
    this.swayX += (-dyaw * 40 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (dpitch * 40 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-4, Math.min(4, this.swayX)); this.swayY = Math.max(-4, Math.min(4, this.swayY));
    const bobA = this.settings.viewBob && p.phys.onGround ? Math.min(1, hs / 250) : 0;
    const bx = Math.cos(this.bobPhase * 0.5) * 0.8 * bobA, by = Math.abs(Math.sin(this.bobPhase * 0.5)) * 0.8 * bobA;
    this.switchAnim = Math.max(0, this.switchAnim - dt * 3.5);
    let reloadK = 0;
    if (p.reloadTime > 0 && ws) { const tot = reloadDuration(WEAPONS[ws.id]); const k = 1 - p.reloadTime / tot; reloadK = Math.sin(Math.min(1, k) * Math.PI); }
    const kick = this.viewKick;
    const air = !p.phys.onGround ? 1 : 0;
    // sprint tático: arma levantada; volta à posição de tiro durante o sprint-to-fire delay
    const isKnife = !!ws && !!WEAPONS[ws.id].melee;
    const lowerTime = isKnife ? SPRINT.sprintToFireKnife : SPRINT.sprintToFire;
    const poseGoal = p.weaponRaised ? 1 : Math.min(1, p.raiseTime / lowerTime);
    this.sprintPose += (poseGoal - this.sprintPose) * Math.min(1, dt * (p.weaponRaised ? 9 : 30));
    const sp = this.sprintPose * (1 - this.switchAnim);
    // armas de fogo sobem e giram para o lado; a faca só baixa e recua um pouco
    const sx = isKnife ? 1 : -3, sy = isKnife ? -3 : 2.5, sz = isKnife ? -1 : 3, syaw = isKnife ? 0.25 : 0.75, spitch = isKnife ? -0.25 : 0.55, sroll = isKnife ? 0.15 : 0.5;
    let x = 9 + this.swayX + bx + sp * sx, y = -9.5 - this.swayY - by - this.switchAnim * 14 - reloadK * 6 - air * 0.6 - p.phys.landImpact * 2 + sp * sy, z = -21 + kick * 3 + sp * sz;
    let yawO = -0.06 + this.swayX * 0.01 + sp * syaw, pitchO = kick * 0.12 - reloadK * 0.5 + sp * spitch, rollO = reloadK * 0.6 + sp * sroll;
    if (isKnife) {
      // golpe da faca: leve = corte da direita para a esquerda, pesado = estocada para frente
      const since = (this.world?.time ?? 0) - p.lastShotTime;
      if (p.lastMeleeHeavy && since < 0.55) {
        const k = since / 0.55, wind = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        z += k < 0.35 ? wind * 4 : -wind * 9; pitchO -= wind * 0.3; x -= wind * 2;
      } else if (!p.lastMeleeHeavy && since < 0.3) {
        const k = since / 0.3;
        yawO += 1.2 - k * 2.4; x += 3 - k * 9; rollO -= 0.6 * Math.sin(k * Math.PI);
      }
    }
    if (isKnife) {
      x -= 1.5; y += 1.2; z += 4; yawO += 0.18; pitchO += 0.12; rollO -= 0.35;
      y += this.switchAnim * 14; // a faca usa a própria animação de sacar no lugar do "abaixar"
    }
    // animação de sacar / inspecionar (tecla F)
    const pose = this.viewPose(p, isKnife);
    x += pose.ox; y += pose.oy; z += pose.oz; yawO += pose.yaw; pitchO += pose.pitch; rollO += pose.roll;
    const m = trs(this.tmpM, x, y, z, yawO, pitchO, rollO, isKnife ? 0.95 : 0.72);
    if (p.slot === SLOT_NADES) {
      const nk = p.nadeSel;
      r.drawMesh(this.assets!.grenade, trs(this.tmpM2, x, y + 2, z - 4, this.time + pose.roll, pose.pitch, 0, 1.4), { tint: NADES[nk].color, tintMix: 0.7, emissive: 0.2 });
    } else if (ws && isKnife) {
      // faca borboleta: o cabo "safe" fica na mão; a lâmina e o cabo "bite" giram nos pinos
      const bf = this.assets!.butterfly;
      r.drawMesh(bf.safe, m);
      r.drawMesh(bf.blade, child(this.tmpM2, m, 0, 0, 0, 0, pose.blade, 0));
      r.drawMesh(bf.bite, child(this.tmpM2, m, 0, 0, 0, 0, pose.bite, 0));
      r.drawMesh(this.assets!.hand, child(this.tmpM2, m, 0.9, 0, 7, 0, 0, 0, 2.6, 4.4, 7));
    } else if (ws) {
      r.drawMesh(this.assets!.weapons.get(ws.id)!, m);
      r.drawMesh(this.assets!.hand, child(this.tmpM2, m, 0, -3, 1, 0, 0, 0, 5, 7, 5));
      // muzzle flash
      if (this.flashTime > 0 && !isKnife) {
        this.flashTime -= dt;
        const len = ws.id === 'sniper' ? -44 : ws.id === 'shotgun' ? -38 : ws.id === 'rifle' ? -34 : ws.id === 'smg' ? -21 : -16;
        const s = 3 + Math.random() * 3;
        r.drawMesh(this.assets!.flash, child(this.tmpM2, m, 0, 2.2, len - 2, Math.random() * 3, Math.random() * 3, Math.random() * 3, s, s, s * 2));
      }
    }
    void multiply; void hitboxes;
  }

  // ------------------------------------------------------------------ labels
  private updateLabels(w: World, viewer: Player, alpha: number) {
    const seen = new Set<number>();
    for (const p of w.players) {
      if (!p.alive || p === viewer || p.team !== viewer.team || p.inDuel !== viewer.inDuel) continue;
      const pp = new V3().copy(p.prevPos).lerp(p.phys.pos, alpha);
      const s = this.r.project(pp.x, pp.y + 92, pp.z);
      if (!s) continue;
      seen.add(p.id);
      let el = this.labels.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.style.cssText = 'position:fixed;pointer-events:none;font:600 12px Rubik,sans-serif;color:#fff;text-shadow:0 1px 3px #000;transform:translate(-50%,-100%);white-space:nowrap';
        document.body.appendChild(el);
        this.labels.set(p.id, el);
      }
      el.textContent = `▾ ${p.name}`;
      el.style.color = p.team === 'blue' ? '#9cc2ff' : '#ffa1aa';
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      el.style.opacity = s.depth > 6000 ? '0.5' : '1';
    }
    for (const [id, el] of this.labels) if (!seen.has(id)) { el.remove(); this.labels.delete(id); }
  }

  private clearLabels() { for (const el of this.labels.values()) el.remove(); this.labels.clear(); }

  /** Render a slow flyover of the map for the menu background. */
  menuFrame(dt: number) {
    this.loadAssets();
    this.time += dt;
    const t = this.time * 0.05;
    const x = Math.sin(t) * 8200, z = Math.cos(t) * 9000;
    const yaw = Math.atan2(x, z);
    this.r.beginFrame({ x, y: 3900, z, yaw, pitch: -0.3, roll: 0, fovY: 0.95 }, this.time);
    const MM = this.mapMeshes(this.map);
    this.r.drawMesh(MM.world, null, { grid: 1 });
    for (const tg of this.map.triggers) {
      if (tg.kind !== 'teleport') continue;
      const cx = (tg.min.x + tg.max.x) / 2, cz = (tg.min.z + tg.max.z) / 2;
      this.r.ribbon(cx, tg.min.y, cz, cx, tg.min.y + 140, cz, 18, tg.color, 0.35, true);
    }
    this.r.drawMesh(MM.glass, null, { alpha: 0.28, emissive: 0.4 });
    this.r.flushEffects();
  }
}

export type { Mat4 };
