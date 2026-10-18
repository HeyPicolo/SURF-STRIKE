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

const menu = new Menu(settings, {
  startBots: (s: MatchSetup) => startGame('bots', s.classId, s),
  startTraining: (cls: ClassId) => startGame('training', cls),
  resume: () => resume(),
  quitToMenu: () => { game.stop(); input.enabled = false; input.unlock(); menu.showMain(); },
  settingsChanged: () => game.applySettings(),
  click: () => { sfx.ensure(); sfx.uiClick(); },
});

game = new Game(renderer, input, hud, sfx, settings, map, {
  onPause: () => pause(),
  onMatchEnd: (w: World) => { input.enabled = false; input.unlock(); menu.showResults(w); },
});

function startGame(mode: 'bots' | 'training', classId: ClassId, s?: MatchSetup) {
  sfx.ensure();
  menu.hideAll();
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
(window as unknown as { __surf: unknown }).__surf = { game, input, menu, settings };

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
