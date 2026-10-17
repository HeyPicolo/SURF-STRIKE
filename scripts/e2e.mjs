// Testes de navegador (fluxos principais) com Playwright + Chromium.
// Uso: npm run build && npm run test:e2e   (CHROME_PATH=/caminho/do/chrome opcional)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const shots = join(root, 'e2e-shots');
mkdirSync(shots, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  console.error('playwright-core não instalado. Rode: npm i -D playwright-core'); process.exit(1);
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const server = createServer((req, res) => {
  const p = join(dist, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(5199, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
// renderização por software (CI) é lenta: qualidade baixa para manter o FPS utilizável
await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('surfstrike.settings.v1') || '{}'); s.quality = 'low'; localStorage.setItem('surfstrike.settings.v1', JSON.stringify(s)); } catch {} });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text()); });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); };
const wait = (ms) => page.waitForTimeout(ms);
const S = (fn, arg) => page.evaluate(fn, arg);
/** Espera `sec` segundos de tempo de SIMULAÇÃO (independe do FPS da máquina). */
const waitSim = async (sec) => {
  const t0 = await S(() => window.__surf.game.world?.time ?? 0);
  for (let i = 0; i < 2000; i++) { await wait(30); const t = await S(() => window.__surf.game.world?.time ?? 0); if (t - t0 >= sec || t < t0) return; }
};

await page.goto('http://localhost:5199/');
await wait(1500);
check('1. menu abre', await page.isVisible('#main-nav'));
await page.screenshot({ path: join(shots, '01-menu.png') });

// --- training
await page.click('button[data-go=training]');
await page.click('#go');
await wait(800);
const inGame = await S(() => !!window.__surf.game.world);
check('2. entra na arena em primeira pessoa', inGame);
await S(() => { window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); });
await page.screenshot({ path: join(shots, '02-training-spawn.png') });

// camera control
const yaw0 = await S(() => window.__surf.game.world.local.yaw);
await S(() => { window.__surf.input.yaw += 0.6; });
await waitSim(0.1);
const yaw1 = await S(() => window.__surf.game.world.local.yaw);
await page.keyboard.down('KeyW'); await waitSim(0.6); await page.keyboard.up('KeyW');
const moved = await S(() => { const p = window.__surf.game.world.local; return Math.hypot(p.phys.pos.x - 0, p.phys.pos.z - 5450); });
check('3. câmera e personagem controláveis', Math.abs(yaw1 - yaw0 - 0.6) < 0.01 && moved > 50, `moved=${moved.toFixed(0)}`);

// surf: drop onto ramp A and hold strafe into it (look along the ramp)
await S(() => { const w = window.__surf.game.world, p = w.local; p.phys.pos.x = 170; p.phys.pos.y = 2050; p.phys.pos.z = 4300; p.phys.vel.x = 0; p.phys.vel.y = 0; p.phys.vel.z = -300; window.__surf.input.yaw = 0; window.__surf.input.pitch = -0.15; });
await page.keyboard.down('KeyA');
let maxSpeed = 0, surfTicks = 0;
for (let i = 0; i < 30; i++) {
  await waitSim(0.1);
  const st = await S(() => { const p = window.__surf.game.world.local.phys; return { s: Math.hypot(p.vel.x, p.vel.z), surf: p.surfing, z: p.pos.z, y: p.pos.y }; });
  maxSpeed = Math.max(maxSpeed, st.s); if (st.surf) surfTicks++;
  if (i === 12) await page.screenshot({ path: join(shots, '03-surfing.png') });
}
await page.keyboard.up('KeyA');
check('4/5. surfa na rampa ganhando velocidade', maxSpeed > 700 && surfTicks > 10, `max=${maxSpeed.toFixed(0)} surfSamples=${surfTicks}`);

// pickup weapon
await S(() => { const w = window.__surf.game.world, p = w.local; const k = w.pickups.find((k) => k.weapon === 'rifle' && k.active); p.phys.pos.copy(k.pos); p.phys.pos.y += 2; p.phys.vel.set(0, 0, 0); });
await waitSim(0.1);
await page.keyboard.press('KeyE');
await waitSim(0.1);
const hasRifle = await S(() => window.__surf.game.world.local.weapons[0]?.id);
check('6. coleta uma arma (E)', hasRifle === 'rifle');

// shoot a dummy
const dmg = await S(async () => {
  const w = window.__surf.game.world, p = w.local, d = w.players.find((q) => q.isDummy && q.alive);
  w.bots.delete(d.id); d.input.cmd.side = 0; d.input.cmd.forward = 0; d.phys.vel.set(0, 0, 0);
  p.phys.pos.set(d.phys.pos.x, d.phys.pos.y, d.phys.pos.z + 350); p.phys.vel.set(0, 0, 0);
  const e = { x: p.phys.pos.x, y: p.phys.pos.y + 64, z: p.phys.pos.z };
  const c = { x: d.phys.pos.x, y: d.phys.pos.y + 40, z: d.phys.pos.z };
  window.__surf.input.yaw = Math.atan2(-(c.x - e.x), -(c.z - e.z));
  window.__surf.input.pitch = Math.atan2(c.y - e.y, Math.hypot(c.x - e.x, c.z - e.z));
  return d.id;
});
await waitSim(0.1);
await page.mouse.down(); await waitSim(0.25); await page.mouse.up();
await waitSim(0.05);
const dummy = await S((id) => { const d = window.__surf.game.world.player(id); return { hp: d.hp, alive: d.alive, mag: window.__surf.game.world.local.weapons[0].mag }; }, dmg);
check('7. dispara e causa dano', dummy.hp < 100 || !dummy.alive, JSON.stringify(dummy));
await page.screenshot({ path: join(shots, '04-shooting.png') });

// reload & switch
await page.keyboard.press('KeyR'); await waitSim(2.6);
const mag = await S(() => window.__surf.game.world.local.weapons[0].mag);
await page.keyboard.press('Digit2'); await waitSim(0.1);
const slot = await S(() => window.__surf.game.world.local.slot);
check('8. recarrega e alterna armas', mag === 30 && slot === 1, `mag=${mag} slot=${slot}`);

// ability
await page.keyboard.press('KeyQ'); await waitSim(0.1);
const cd = await S(() => window.__surf.game.world.local.abilityCd);
check('9. habilidade com cooldown', cd > 10, `cd=${cd.toFixed(1)}`);

// kill
const killed = await S(() => {
  const w = window.__surf.game.world, p = w.local, d = w.players.find((q) => q.isDummy && q.alive);
  w.applyDamage(d, p, 999, true, false, 'test');
  return !d.alive;
});
check('10. elimina um inimigo', killed);

// --- bots match: round ends & score updates
await S(() => window.__surf.menu.act.quitToMenu());
await wait(300);
await page.click('button[data-go=play]');
await page.click('[data-choice=size] button[data-v="2"]');
await page.click('[data-choice=diff] button[data-v="god"]');
await page.click('#go');
await wait(1000);
await S(() => { window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); });
await waitSim(8);
await page.screenshot({ path: join(shots, '05-bots-round.png') });
// speed things up: let bots fight, make the local player die so the round resolves
await S(() => { const w = window.__surf.game.world; w.applyDamage(w.local, null, 999, false, false, 'test'); w.match.timer = Math.min(w.match.timer, 25); });
let scored = false;
for (let i = 0; i < 120 && !scored; i++) {
  await waitSim(0.5);
  scored = await S(() => { const s = window.__surf.game.world?.match.score; return !!s && s.blue + s.red > 0; });
  if (i === 6) await page.screenshot({ path: join(shots, '06-spectating.png') });
}
check('11. round termina e placar atualiza', scored, JSON.stringify(await S(() => window.__surf.game.world?.match.score)));
await page.keyboard.down('Tab'); await wait(200);
await page.screenshot({ path: join(shots, '07-scoreboard.png') });
await page.keyboard.up('Tab');

const fps = await S(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log(`fps (software renderer): ${fps}`);
check('sem erros no console', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram. Testes 12–13 (multiplayer) ainda não se aplicam.`);
process.exit(failed.length ? 1 : 0);
