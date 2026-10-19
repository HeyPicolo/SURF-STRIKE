import { Renderer } from './render/Renderer';
import { Game } from './game/Game';
import { Input } from './game/input';
import { loadSettings } from './game/settings';
import { Hud } from './ui/hud';
import { Menu, MatchSetup } from './ui/menu';
import { Sfx } from './audio/sfx';
import { buildClouds } from '../../shared/maps/clouds';
import type { ClassId } from '../../shared/config/classes';
import type { World } from '../../shared/sim/world';
import type { SkillEvent } from '../../shared/sim/skill';
import { getSkillMap } from '../../shared/maps/skillMaps';
import { skillMapMeta } from '../../shared/config/skill';
import { addAttempt, applyFinish, MapRecords } from '../../shared/sim/records';
import { SKILL_MAP_VERSIONS } from '../../shared/maps/skillVersions';
import { updateGhostSet, emptyGhostSet } from '../../shared/sim/ghost';
import { LocalRecordStore } from './skill/localStore';
import { IdbGhostStore } from './skill/ghostStore';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const settings = loadSettings();

function fail(msg: string) {
  document.getElementById('error')!.classList.remove('hidden');
  document.getElementById('error-msg')!.textContent = msg;
  document.getElementById('menu')!.classList.add('hidden');
}

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  fail(`${(e as Error).message} Use uma versão recente do Chrome, Edge ou Firefox com aceleração de hardware ativada.`);
  throw e;
}

const sfx = new Sfx();
const hud = new Hud();
const input = new Input(canvas, settings);
const map = buildClouds();
let game: Game;

// ---- Surf Skill: recordes locais (a lógica fica em shared/sim/records.ts) ----
const records = new LocalRecordStore();
const ghosts = new IdbGhostStore();
let skillMapId: string | null = null;
/** Recordes sem construir o mapa: a versão vem de skillVersions.ts (gerado e conferido nos testes). */
function skillRecords(id: string): MapRecords {
  return records.load(id, SKILL_MAP_VERSIONS[id], skillMapMeta(id).segments.length);
}
function startSkill(id: string) {
  sfx.ensure();
  menu.hideAll();
  const m = getSkillMap(id);
  const rec = skillRecords(id);
  skillMapId = id;
  game.skillMeta = skillMapMeta(id);
  game.start({
    mode: 'skill', teamSize: 1, difficulty: 'easy',
    local: { name: settings.playerName, team: 'blue', classId: 'runner' },
    seed: 1, autoBhop: settings.autoBhop,
    skillPb: rec.pb ? { ticks: rec.pb.ticks, splits: rec.pb.splits, stages: rec.pb.stages } : null,
  }, m);
  // fantasmas guardados (IndexedDB, assíncrono): aparecem assim que carregarem
  const w0 = game.world;
  ghosts.load(id, SKILL_MAP_VERSIONS[id], m.skill!.segments.length).then((g) => { if (game.world === w0) game.setGhosts(g); }).catch(() => { /* sem fantasma */ });
  resume();
}
function onSkillEvent(w: World, e: SkillEvent) {
  if (!skillMapId) return;
  const id = skillMapId;
  if (e.t === 'skillStart' && !e.practice) records.save(addAttempt(skillRecords(id)));
  if (e.t !== 'skillFinish') return;
  const before = skillRecords(id);
  let res = null;
  let rec = before;
  if (!e.practice) {
    res = applyFinish(before, { ticks: e.total, splits: e.splits, stages: e.stages, name: settings.playerName, date: new Date().toISOString() });
    rec = res.rec;
    records.save(rec);
    if (rec.pb) w.skill!.pb = { ticks: rec.pb.ticks, splits: rec.pb.splits, stages: rec.pb.stages };
    game.skillRecordFeedback(res.newPb, res.rank);
    // fantasma: PB novo substitui o da corrida; segmentos recorde substituem os de segmento
    if (e.ghost) {
      const n = w.skill!.stageCount, track = e.ghost;
      const base = game.ghosts ? Promise.resolve(game.ghosts) : ghosts.load(id, SKILL_MAP_VERSIONS[id], n).catch(() => emptyGhostSet(n));
      base.then((cur) => {
        const next = updateGhostSet(cur, track, e.total, e.stages, res!.newPb, res!.goldStages);
        if (game.world === w) game.setGhosts(next);
        return ghosts.save(id, SKILL_MAP_VERSIONS[id], next);
      }).catch(() => { /* indisponível */ });
    }
  }
  // tela de fim depois de um instante (dá tempo de ver a chegada)
  setTimeout(() => {
    if (game.world !== w) return;
    game.paused = true; input.enabled = false; input.unlock();
    menu.showSkillFinish(skillMapMeta(id), e, before.pb, res, rec);
  }, 1800);
}

const menu = new Menu(settings, {
  startBots: (s: MatchSetup) => startGame('bots', s.classId, s),
  startTraining: (cls: ClassId) => startGame('training', cls),
  resume: () => resume(),
  quitToMenu: () => { game.stop(); input.enabled = false; input.unlock(); menu.showMain(); },
  settingsChanged: () => game.applySettings(),
  click: () => { sfx.ensure(); sfx.uiClick(); },
  startSkill: (id: string) => startSkill(id),
  skillRecords: (id: string) => skillRecords(id),
  skillRestart: () => { game.skillRestart(); resume(); },
});

game = new Game(renderer, input, hud, sfx, settings, map, {
  onPause: () => pause(),
  onMatchEnd: (w: World) => { input.enabled = false; input.unlock(); menu.showResults(w); },
  onSkillEvent: (w: World, e: SkillEvent) => onSkillEvent(w, e),
});

function startGame(mode: 'bots' | 'training', classId: ClassId, s?: MatchSetup) {
  sfx.ensure();
  menu.hideAll();
  skillMapId = null;
  game.start({
    mode,
    teamSize: s?.teamSize ?? 1,
    difficulty: s?.difficulty ?? 'medium',
    local: { name: settings.playerName, team: s?.team ?? 'blue', classId },
    seed: (Math.random() * 1e9) | 0,
    autoBhop: settings.autoBhop,
  });
  resume();
}

function resume() {
  menu.hidePanel();
  input.enabled = true;
  input.clearEdges();
  game.paused = false;
  input.lock();
}

function pause() {
  if (!game.world) return;
  game.paused = true;
  input.enabled = false;
  menu.showPause();
}

input.onUnlock = () => { if (game.world && !game.paused && game.world.match.phase !== 'matchEnd') pause(); };

canvas.addEventListener('click', () => {
  if (!game.world) return;
  if (!input.locked && !game.paused) input.lock();
  else if (game.world && !game.world.local.alive) game.cycleSpectate();
});
window.addEventListener('keydown', (e) => {
  // fallback when pointer lock is unavailable (e.g. embedded frames)
  if (e.code === 'Escape' && game.world && !input.locked && !game.paused) pause();
});

// Agachar fica no Ctrl: se o navegador não deixar capturar Ctrl+W (sem tela cheia ou no Firefox),
// pelo menos pede confirmação antes de fechar a aba no meio de uma partida.
window.addEventListener('beforeunload', (e) => {
  if (game.world && game.world.match.phase !== 'matchEnd') { e.preventDefault(); e.returnValue = ''; }
});

// expose for automated browser tests / debugging
(window as unknown as { __surf: unknown }).__surf = { game, input, menu, settings, records, skillRecords };

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (game.world) game.frame(dt);
    else game.menuFrame(dt);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
