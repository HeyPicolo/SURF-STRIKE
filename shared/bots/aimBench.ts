// =============================================================
//  Bancada de mira dos bots (testes e scripts/bot-aim-bench.ts): um bot com o KESTREL AR atira num
//  alvo que anda de lado (ou surfa) a uma distância fixa, num mapa plano montado só para isso.
// =============================================================
import { World } from '../sim/world';
import { V3, yawFromDir } from '../math/vec3';
import { SIM_DT } from '../config/physics';
import type { BotDifficulty } from '../config/match';
import type { MapDef } from '../maps/types';
import { buildClouds } from '../maps/clouds';
import { boxBrush } from '../physics/brush';
import { BotBrain } from './brain';

export interface BenchResult { shots: number; hits: number; hitRate: number; firstHit: { mean: number; min: number; max: number; all: number[] }; shotsBeforeLos: number }

export interface BenchOpts {
  seeds: number[];
  seconds: number;
  /** o alvo anda de lado ('strafe'), surfa rápido em zigue-zague ('surf') ou fica parado ('still') */
  target?: 'strafe' | 'surf' | 'still';
  /** ângulo inicial entre a mira e o alvo (graus) */
  startOff?: number;
  weapon?: 'rifle' | 'smg' | 'pistol' | 'sniper' | 'shotgun';
  /** callback por tick (para testes de perfil de mira) */
  onTick?: (w: World, bot: BotBrain, t: number) => void;
}

let flatMap: MapDef | null = null;
/** Campo plano aberto (só um chão), com o resto dos dados do CLOUDS (spawns, rotas). */
function arena(): MapDef {
  if (flatMap) return flatMap;
  const c = buildClouds();
  const floor = boxBrush(new V3(-12000, -100, -12000), new V3(12000, 0, 12000), { color: 0x888888 });
  flatMap = { ...c, brushes: [floor], triggers: [], pickups: [], trainingSpawn: { pos: new V3(0, 2, 0), yaw: 0 }, trainingTargets: [{ pos: new V3(0, 2, -1000), yaw: 0 }] };
  return flatMap;
}

export function aimBench(diff: BotDifficulty, dist: number, o: BenchOpts): BenchResult {
  let shots = 0, hits = 0, beforeLos = 0;
  const firsts: number[] = [];
  for (const seed of o.seeds) {
    const w = new World(arena(), { mode: 'training', teamSize: 1, difficulty: diff, local: { name: 'bot', team: 'blue', classId: 'runner' }, seed, autoBhop: true });
    const p = w.local;
    const d = w.players.find((q) => q.isDummy)!;
    const base = new V3(0, 0, 0);
    p.phys.pos.copy(base).add(new V3(0, 1, dist)); p.prevPos.copy(p.phys.pos);
    d.phys.pos.copy(base).add(new V3(0, 1, 0)); d.prevPos.copy(d.phys.pos);
    p.giveWeapon(o.weapon ?? 'rifle');
    const slot = (o.weapon ?? 'rifle') === 'pistol' ? 1 : 0;
    p.slot = slot; p.switchTime = 0;
    const brain = new BotBrain(w, p, diff);
    w.bots.set(p.id, brain);
    brain.onRoundStart();
    brain.mode = 'idle';
    const toT = d.phys.pos.clone().sub(p.phys.pos);
    const off = ((o.startOff ?? 60) * Math.PI) / 180;
    p.yaw = yawFromDir(toT.x, toT.z) + off; p.input.cmd.yaw = p.yaw;
    brain.resetLook(p.yaw, 0);
    // alvo: anda de lado / surfa (velocidade alta trocando de direção) / parado
    const kind = o.target ?? 'strafe';
    w.bots.delete(d.id);
    let first = -1, t = 0, dir = 1, flip = 0.9;
    const target = d.phys.pos.clone();
    const N = Math.round(o.seconds / SIM_DT);
    for (let i = 0; i < N; i++) {
      t = i * SIM_DT;
      d.hp = 1e6; d.armor = 0;
      if (kind === 'strafe') { flip -= SIM_DT; if (flip <= 0) { dir = -dir; flip = 0.6 + ((i * 7919) % 100) / 100; } d.phys.vel.set(dir * 250, 0, 0); }
      else if (kind === 'surf') { flip -= SIM_DT; if (flip <= 0) { dir = -dir; flip = 0.8; } d.phys.vel.set(dir * 1400, 0, 300 * dir); }
      else { d.phys.vel.set(0, 0, 0); }
      if (Math.abs(target.x) > 3000) { target.x = Math.sign(target.x) * 3000; dir = -Math.sign(target.x); }
      d.phys.pos.copy(target);
      w.events.length = 0;
      w.step(SIM_DT);
      // trajetória exata do alvo (a física moveria com atrito): posição prevista para o próximo tick
      target.addScaled(d.phys.vel.set(kind === 'strafe' ? dir * 250 : kind === 'surf' ? dir * 1400 : 0, 0, kind === 'surf' ? 300 * dir : 0), SIM_DT);
      if (kind === 'surf') target.y = base.y + 1 + 60 * Math.abs(Math.sin(t));
      d.phys.pos.copy(target);
      p.phys.pos.x = base.x; p.phys.pos.z = base.z + dist; // o bot fica no lugar (só mira)
      for (const e of w.events) {
        if (e.t === 'shot' && e.pid === p.id && e.pellet === 0) { shots++; if (!brain.hasLos) beforeLos++; }
        if (e.t === 'hit' && e.attacker === p.id) { hits++; if (first < 0) first = t; }
      }
      o.onTick?.(w, brain, t);
      p.weapons[slot]!.reserve = 999;
    }
    firsts.push(first < 0 ? o.seconds : first);
  }
  const mean = firsts.reduce((a, b) => a + b, 0) / firsts.length;
  return { shots, hits, hitRate: shots ? hits / shots : 0, firstHit: { mean, min: Math.min(...firsts), max: Math.max(...firsts), all: firsts }, shotsBeforeLos: beforeLos };
}
