// =============================================================
//  Surf Skill — lógica do modo dentro da simulação (sem DOM).
//  Zonas de início/fim, cronômetro em ticks, splits contra o PB, quedas (checkpoint de stage),
//  reinícios, ir para stage e prática (saveloc). Emite SimEvents que o cliente traduz em HUD e som.
//  Nada daqui toca na lógica de rounds/duelos.
// =============================================================
import { V3 } from '../math/vec3';
import { SKILL } from '../config/skill';
import { PHYSICS } from '../config/physics';
import type { MoveCmd } from '../physics/movement';
import type { SkillCourseDef, SkillSegmentDef, TriggerVolume } from '../maps/types';
import type { Player } from './player';
import { splitDiff } from './records';
import { GhostRecorder, GhostTrack, GF_DUCK, GF_GROUND, GF_SNAP } from './ghost';
import { insideObb } from '../maps/skillKit';

export type SkillState = 'zone' | 'running' | 'finished';
export type SkillResetReason = 'fall' | 'stage' | 'map' | 'goto' | 'loadloc';

export type SkillEvent =
  | { t: 'skillStart'; stage: number; practice: boolean }
  | { t: 'skillSplit'; stage: number; total: number; stageTicks: number; diffTotal: number | null; diffStage: number | null; practice: boolean }
  | { t: 'skillReset'; reason: SkillResetReason; stage: number }
  | { t: 'skillFinish'; total: number; splits: number[]; stages: number[]; practice: boolean; diff: number | null; ghost: GhostTrack | null }
  | { t: 'skillSave' }
  | { t: 'skillDenied'; text: string };

/** Comandos do modo enviados pelo jogador neste tick. */
export interface SkillInput {
  restartMap: boolean;
  restartStage: boolean;
  saveLoc: boolean;
  loadLoc: boolean;
  /** 0-based; null = nada */
  gotoStage: number | null;
}
export const emptySkillInput = (): SkillInput => ({ restartMap: false, restartStage: false, saveLoc: false, loadLoc: false, gotoStage: null });

export interface SkillPb { splits: number[]; stages: number[]; ticks: number }

interface SavedLoc { pos: V3; vel: V3; yaw: number; pitch: number; stage: number; ducked: boolean }

export function insideVolume(z: TriggerVolume, p: V3, mins: V3, maxs: V3): boolean {
  if (z.obb) {
    const half = (maxs.y - mins.y) / 2;
    return insideObb(z.obb, { x: p.x, y: p.y + mins.y + half, z: p.z } as V3, maxs.x, half);
  }
  return p.x + maxs.x > z.min.x && p.x + mins.x < z.max.x && p.y + maxs.y > z.min.y && p.y + mins.y < z.max.y && p.z + maxs.z > z.min.z && p.z + mins.z < z.max.z;
}

export class SkillRun {
  state: SkillState = 'zone';
  /** stage atual (0-based) */
  stage = 0;
  /** tempo do mapa em ticks */
  ticks = 0;
  /** total no início do stage atual (split anterior) */
  stageStartTick = 0;
  /** total acumulado ao concluir cada stage */
  splits: number[] = [];
  /** tempo de cada stage concluído */
  stageTimes: number[] = [];
  /** corrida invalidada para recordes (saveloc / ir para stage) */
  practice = false;
  /** dentro da zona de início do stage atual */
  inStart = true;
  saved: SavedLoc | null = null;
  /** corrida de comparação (recorde pessoal) */
  pb: SkillPb | null = null;
  lastSplit: Extract<SkillEvent, { t: 'skillSplit' }> | null = null;
  finish: Extract<SkillEvent, { t: 'skillFinish' }> | null = null;
  falls = 0;
  /** gravação da corrida atual (só corridas válidas: prática não grava) */
  recorder: GhostRecorder | null = null;
  /** tick do mapa em que o segmento atual começou (para o fantasma por segmento) */
  segmentEnteredAt = 0;
  private snapNext = false;

  constructor(public course: SkillCourseDef, private emit: (e: SkillEvent) => void) {}

  get stageDef(): SkillSegmentDef { return this.course.segments[this.stage]; }
  get stageCount() { return this.course.segments.length; }
  get linear() { return this.course.format === 'linear'; }
  /** tempo do stage atual (ticks) */
  get stageTicks() { return this.state === 'running' ? this.ticks - this.stageStartTick : 0; }

  /** Antes do movimento: bloqueia o pulo dentro da zona de início. */
  filterCmd(p: Player, cmd: MoveCmd): MoveCmd {
    if (SKILL.blockJumpInStart && cmd.jump && this.inStart && this.state !== 'finished') {
      // pulo só depois de sair da zona (impede bhop para ganhar prespeed)
      if (insideVolume(this.stageDef.startZone, p.phys.pos, p.phys.mins, p.phys.maxs)) return { ...cmd, jump: false };
    }
    return cmd;
  }

  /** Comandos do modo (reiniciar, ir para stage, saveloc). Chamado antes do movimento. */
  actions(p: Player, inp: SkillInput) {
    if (inp.restartMap) { this.restartMap(p); return; }
    if (inp.gotoStage !== null) {
      const n = inp.gotoStage;
      if (n < 0 || n >= this.stageCount) return;
      if (this.state === 'running' && !this.practice) {
        this.emit({ t: 'skillDenied', text: 'Ir para stage só fora de uma corrida cronometrada (R reinicia, ou use a prática)' });
        return;
      }
      if (n === 0) { this.restartMap(p); return; }
      this.practice = true;
      this.recorder = null;
      this.state = 'zone';
      this.ticks = 0; this.stageStartTick = 0; this.splits = []; this.stageTimes = [];
      this.lastSplit = null; this.finish = null;
      this.stage = n;
      this.place(p, this.stageDef);
      this.emit({ t: 'skillReset', reason: 'goto', stage: n });
      return;
    }
    if (inp.restartStage) {
      this.place(p, this.stageDef);
      this.emit({ t: 'skillReset', reason: 'stage', stage: this.stage });
      return;
    }
    if (inp.saveLoc) {
      this.saved = { pos: p.phys.pos.clone(), vel: p.phys.vel.clone(), yaw: p.yaw, pitch: p.pitch, stage: this.stage, ducked: p.phys.ducked };
      if (this.state === 'running') { this.practice = true; this.recorder = null; }
      this.emit({ t: 'skillSave' });
    }
    if (inp.loadLoc && this.saved) {
      const s = this.saved;
      this.practice = true;
      this.recorder = null;
      if (this.state === 'finished') this.state = 'running';
      this.stage = s.stage;
      p.phys.pos.copy(s.pos); p.prevPos.copy(s.pos); p.phys.lastSafe.copy(s.pos); p.phys.vel.copy(s.vel);
      p.yaw = s.yaw; p.pitch = s.pitch; p.input.cmd.yaw = s.yaw; p.input.cmd.pitch = s.pitch;
      p.phys.ducked = s.ducked; p.phys.maxs.y = s.ducked ? PHYSICS.playerCrouchHeight : PHYSICS.playerHeight;
      p.resetMovementState();
      this.inStart = insideVolume(this.stageDef.startZone, p.phys.pos, p.phys.mins, p.phys.maxs);
      this.emit({ t: 'skillReset', reason: 'loadloc', stage: this.stage });
    }
  }

  /** Depois do movimento: cronômetro, zonas, prespeed, quedas, splits e chegada. */
  postMove(p: Player) {
    const st = p.phys;
    if (this.state === 'running') this.ticks++;
    const sd = this.stageDef;

    // queda na lava (ou abaixo do mapa): volta ao início do stage atual, parado. O tempo continua.
    if (st.pos.y < sd.fallY || sd.fall.some((z) => insideVolume(z, st.pos, st.mins, st.maxs))) {
      this.falls++;
      this.place(p, sd);
      this.emit({ t: 'skillReset', reason: 'fall', stage: this.stage });
      this.record(p);
      return;
    }

    const inStart = insideVolume(sd.startZone, st.pos, st.mins, st.maxs);
    if (inStart || this.inStart) {
      // prespeed cap: dentro da zona (e no tick em que sai dela) a velocidade horizontal é limitada
      const hs = Math.hypot(st.vel.x, st.vel.z);
      if (hs > SKILL.prespeedCap) { st.vel.x *= SKILL.prespeedCap / hs; st.vel.z *= SKILL.prespeedCap / hs; }
    }
    if (this.inStart && !inStart && this.state === 'zone') {
      // saiu da zona de início: o cronômetro começa
      this.state = 'running';
      this.ticks = 0;
      this.stageStartTick = 0;
      this.segmentEnteredAt = 0;
      this.splits = []; this.stageTimes = [];
      this.lastSplit = null; this.finish = null;
      // só uma corrida completa e válida (largando do primeiro segmento, sem prática) grava fantasma
      this.recorder = !this.practice && this.stage === 0 ? new GhostRecorder() : null;
      this.emit({ t: 'skillStart', stage: this.stage, practice: this.practice });
    }
    this.inStart = inStart;

    if (this.state === 'running' && insideVolume(sd.endZone, st.pos, st.mins, st.maxs)) {
      const total = this.ticks;
      const stageTicks = total - this.stageStartTick;
      this.splits[this.stage] = total;
      this.stageTimes[this.stage] = stageTicks;
      const { diffTotal, diffStage } = this.practice ? { diffTotal: null, diffStage: null } : splitDiff(this.pb, this.stage, total, stageTicks);
      const split = { t: 'skillSplit' as const, stage: this.stage, total, stageTicks, diffTotal, diffStage, practice: this.practice };
      this.lastSplit = split;
      this.emit(split);
      if (this.stage === this.stageCount - 1) {
        this.record(p);
        this.state = 'finished';
        const diff = this.pb && !this.practice ? total - this.pb.ticks : null;
        const ghost = this.recorder && !this.practice ? this.recorder.toTrack() : null;
        this.recorder = null;
        this.finish = { t: 'skillFinish', total, splits: [...this.splits], stages: [...this.stageTimes], practice: this.practice, diff, ghost };
        this.emit(this.finish);
        return;
      }
      this.stage++;
      this.stageStartTick = total;
      this.segmentEnteredAt = total;
      this.recorder?.markSegment(this.stage, total);
      if (this.linear) {
        // linear: passa pelo portal sem parar
        this.inStart = insideVolume(this.stageDef.startZone, st.pos, st.mins, st.maxs);
      } else {
        // staged: o fim do stage leva direto à zona de início do próximo
        this.place(p, this.stageDef);
      }
    }
    if (this.state === 'running') this.record(p);
  }

  /** Grava o tick atual da corrida (posição, olhar, estado). */
  private record(p: Player) {
    if (!this.recorder || this.state !== 'running') return;
    // um tick por tick de cronômetro: o fantasma fica sincronizado com o tempo oficial
    while (this.recorder.ticks <= this.ticks) {
      const f = (p.phys.onGround ? GF_GROUND : 0) | (p.phys.ducked ? GF_DUCK : 0) | (this.snapNext ? GF_SNAP : 0);
      this.recorder.push(p.phys.pos, p.yaw, p.pitch, f, this.stage);
      this.snapNext = false;
    }
  }

  restartMap(p: Player) {
    this.state = 'zone';
    this.stage = 0;
    this.ticks = 0; this.stageStartTick = 0;
    this.splits = []; this.stageTimes = [];
    this.practice = false;
    this.lastSplit = null; this.finish = null;
    this.falls = 0;
    this.recorder = null;
    this.segmentEnteredAt = 0;
    this.place(p, this.stageDef);
    this.emit({ t: 'skillReset', reason: 'map', stage: 0 });
  }

  /** Coloca o jogador no spawn de um stage, parado. */
  place(p: Player, sd: SkillSegmentDef) {
    this.snapNext = true;
    p.phys.pos.copy(sd.spawn.pos); p.prevPos.copy(sd.spawn.pos); p.phys.lastSafe.copy(sd.spawn.pos);
    p.phys.vel.set(0, 0, 0);
    p.phys.onGround = false; p.phys.surfing = false;
    p.phys.ducked = false; p.phys.maxs.y = PHYSICS.playerHeight;
    p.yaw = sd.spawn.yaw; p.pitch = 0;
    p.input.cmd.yaw = sd.spawn.yaw; p.input.cmd.pitch = 0;
    p.resetMovementState();
    this.inStart = true;
  }
}
