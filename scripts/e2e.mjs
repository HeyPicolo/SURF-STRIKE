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
await S(() => { const w = window.__surf.game.world, p = w.local; const k = w.pickups.find((k) => k.kind === 'weapon' && k.active); k.weapon = 'rifle'; p.phys.pos.copy(k.pos); p.phys.pos.y += 2; p.phys.vel.set(0, 0, 0); });
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
check('7. dispara e causa dano', dummy.hp < 150 || !dummy.alive, JSON.stringify(dummy));
await page.screenshot({ path: join(shots, '04-shooting.png') });

// reload & switch
await page.keyboard.press('KeyR'); await waitSim(2.6);
const mag = await S(() => window.__surf.game.world.local.weapons[0].mag);
await page.keyboard.press('Digit3'); await waitSim(0.1);
const slot = await S(() => window.__surf.game.world.local.slot);
check('8. recarrega e alterna armas (3 = faca)', mag === 30 && slot === 2, `mag=${mag} slot=${slot}`);
await waitSim(0.7);
await page.keyboard.press('KeyF'); await waitSim(0.3);
const insp = await S(() => window.__surf.game.inspect);
check('8b. inspecionar a faca borboleta no F', !!insp && insp.weapon === 'knife', JSON.stringify(insp));
await page.mouse.down(); await waitSim(0.05); await page.mouse.up();


// sprint automático (W) + caminhar (Shift) + slide (Ctrl) + slide cancel (Space) pelo teclado
await S(() => { const w = window.__surf.game.world, p = w.local; p.phys.pos.set(14200, 2, 760); p.phys.vel.set(0, 0, 0); window.__surf.input.yaw = 0; window.__surf.input.pitch = 0; });
await waitSim(0.2);
await page.keyboard.down('KeyW'); await waitSim(0.6);
const sprint = await S(() => { const p = window.__surf.game.world.local; return { s: Math.hypot(p.phys.vel.x, p.phys.vel.z), on: p.sprinting }; });
await page.keyboard.down('ShiftLeft'); await waitSim(0.6);
const walk = await S(() => { const p = window.__surf.game.world.local; return { s: Math.hypot(p.phys.vel.x, p.phys.vel.z), on: p.sprinting, walking: p.walking }; });
await page.keyboard.down('ControlLeft'); await waitSim(0.05);
const walkSlide = await S(() => window.__surf.game.world.local.slideTime);
await page.keyboard.up('ControlLeft'); await page.keyboard.up('ShiftLeft'); await waitSim(0.6);
check('12. sprint automático e Shift caminha', sprint.on && walk.walking && !walk.on && sprint.s / walk.s > 2 && walkSlide === 0, `correndo=${sprint.s.toFixed(0)} caminhando=${walk.s.toFixed(0)} slideAoCaminhar=${walkSlide}`);
await page.keyboard.down('ControlLeft'); await waitSim(0.05);
const slide = await S(() => { const p = window.__surf.game.world.local; return { t: p.slideTime, s: Math.hypot(p.phys.vel.x, p.phys.vel.z), ducked: p.phys.ducked }; });
await page.screenshot({ path: join(shots, '08-slide.png') });
await waitSim(0.15);
await page.keyboard.press('Space'); await waitSim(0.05);
const cancel = await S(() => { const p = window.__surf.game.world.local; return { t: p.slideTime, ducked: p.phys.ducked }; });
await page.keyboard.up('ControlLeft'); await page.keyboard.up('KeyW');
check('13. slide com Ctrl em movimento e cancel com Espaço', slide.t > 0 && slide.ducked && cancel.t === 0 && !cancel.ducked, `slide=${JSON.stringify(slide)} cancel=${JSON.stringify(cancel)}`);

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

// --- Surf Skill
await S(() => window.__surf.menu.act.quitToMenu());
await wait(300);
await page.click('button[data-go=skill]');
await wait(200);
check('15. menu do Surf Skill mostra os 3 mapas com tiers', await S(() => document.querySelectorAll('.skill-card').length === 3 && document.querySelector('.skill-card .tier').textContent.includes('TIER 1')));
await page.screenshot({ path: join(shots, '09-skill-menu.png') });
if (await page.isVisible('#skname')) await page.fill('#skname', 'Tester');
await page.click('[data-skill=sky_steps]');
await wait(800);
await S(() => { window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); });
const sk0 = await S(() => { const w = window.__surf.game.world; return { mode: w.config.mode, state: w.skill.state, ticks: w.skill.ticks, hud: document.getElementById('hud').classList.contains('mode-skill'), knifeOnly: w.local.weapons.filter(Boolean).map((x) => x.id).join(','), timer: document.getElementById('skill-timer').textContent, vitals: getComputedStyle(document.getElementById('vitals')).display }; });
check('16. Surf Skill abre no mapa 1, só com a faca e HUD próprio', sk0.mode === 'skill' && sk0.state === 'zone' && sk0.ticks === 0 && sk0.hud && sk0.knifeOnly === 'knife' && sk0.timer === '00:00.00' && sk0.vitals === 'none', JSON.stringify(sk0));
await page.keyboard.down('KeyW'); await waitSim(1.4); await page.keyboard.up('KeyW'); await waitSim(0.3);
const sk1 = await S(() => { const w = window.__surf.game.world; return { state: w.skill.state, ticks: w.skill.ticks, timer: document.getElementById('skill-timer').textContent }; });
check('17. sair da zona de início liga o cronômetro', sk1.state === 'running' && sk1.ticks > 0 && sk1.timer !== '00:00.00', JSON.stringify(sk1));
await page.screenshot({ path: join(shots, '10-skill-running.png') });
// queda: joga o jogador na lava do stage 1
const before = await S(() => window.__surf.game.world.skill.ticks);
await S(() => { const w = window.__surf.game.world, st = w.skill.stageDef; w.local.phys.pos.set(st.spawn.pos.x, st.fallY + 50, -2000); w.local.phys.vel.set(0, -500, 0); });
await waitSim(0.2);
const sk2 = await S(() => { const w = window.__surf.game.world, p = w.local, sp = w.skill.stageDef.spawn.pos; return { state: w.skill.state, ticks: w.skill.ticks, stage: w.skill.stage, dist: Math.hypot(p.phys.pos.x - sp.x, p.phys.pos.z - sp.z), falls: w.skill.falls }; });
check('18. cair volta ao início do stage e o tempo continua', sk2.state === 'running' && sk2.ticks > before && sk2.stage === 0 && sk2.dist < 60 && sk2.falls === 1, JSON.stringify(sk2));
await page.keyboard.press('KeyR'); await waitSim(0.1);
const sk3 = await S(() => { const w = window.__surf.game.world; return { state: w.skill.state, ticks: w.skill.ticks, timer: document.getElementById('skill-timer').textContent }; });
check('19. R reinicia o mapa e zera o cronômetro', sk3.state === 'zone' && sk3.ticks === 0 && sk3.timer === '00:00.00', JSON.stringify(sk3));
// percurso de referência completa o stage 1
await S(() => { window.__surf.game.autopilot = true; });
for (let i = 0; i < 400; i++) { await waitSim(0.25); if (await S(() => window.__surf.game.world.skill.stage >= 1)) break; }
await waitSim(0.2);
const sk4 = await S(() => { const w = window.__surf.game.world; return { stage: w.skill.stage, split: w.skill.lastSplit && w.skill.lastSplit.total, splitHud: document.getElementById('skill-split').className, splitText: document.getElementById('skill-split').textContent, stageHud: document.getElementById('skill-stage').textContent }; });
await page.screenshot({ path: join(shots, '11-skill-split.png') });
await S(() => { window.__surf.game.autopilot = false; });
check('20. completa o stage 1 pelo percurso de referência e mostra o split', sk4.stage === 1 && sk4.split > 0 && sk4.splitHud.includes('on') && sk4.splitText.includes('STAGE 1') && sk4.stageHud.startsWith('STAGE 2/5'), JSON.stringify(sk4));

// --- Surf Skill (rodada 8): aba Desafio, D1, pulo na base, segmento completo, corrida curta e fantasma
await S(() => { window.__surf.game.autopilot = false; window.__surf.input.keys.clear(); window.__surf.menu.act.quitToMenu(); });
await wait(300);
await page.click('button[data-go=skill]');
await wait(200);
await page.click('[data-tab=desafio]');
await wait(200);
const tab = await S(() => ({ on: document.querySelector('[data-tab=desafio]').classList.contains('on'), cards: document.querySelectorAll('.skill-card').length, first: document.querySelector('.skill-card h3')?.textContent }));
check('22. abre a aba Desafio com os mapas de desafio', tab.on && tab.cards >= 6 && tab.first === 'CORAL RUSH', JSON.stringify(tab));
await page.screenshot({ path: join(shots, '12-skill-desafio.png') });
await page.click('[data-skill=coral_rush]');
await wait(800);
await S(() => { window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); });
const d1 = await S(() => ({ map: window.__surf.game.world.map.name, state: window.__surf.game.world.skill.state }));
await page.keyboard.down('KeyW'); await waitSim(0.35); await page.keyboard.down('Space');
let maxZone = 0, exitV = -1;
for (let i = 0; i < 80; i++) {
  await waitSim(0.05);
  const r = await S(() => { const w = window.__surf.game.world; return { st: w.skill.state, v: Math.hypot(w.local.phys.vel.x, w.local.phys.vel.z) }; });
  if (r.st === 'zone') maxZone = Math.max(maxZone, r.v); else { exitV = r.v; break; }
}
const jumped = await S(() => ({ state: window.__surf.game.world.skill.state, jumps: true }));
await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
// rodada 9: sem prespeed cap — uma velocidade alta dentro da zona de início não é cortada
await page.keyboard.press('KeyR'); await waitSim(0.2);
// um tick da simulação logo depois de dar a velocidade (sem depender do FPS do navegador de teste)
const noCap = await S(() => { const w = window.__surf.game.world; w.local.phys.vel.set(0, 0, -1200); w.step(0.01); return { st: w.skill.state, v: Math.hypot(w.local.phys.vel.x, w.local.phys.vel.z) }; });
check('21. entra no D1, pula na base e não há limitador de velocidade na zona', d1.map === 'CORAL RUSH' && d1.state === 'zone' && jumped.state === 'running' && noCap.v > 800, `pulou=${jumped.state} saida=${exitV.toFixed(0)} semCap=${noCap.v.toFixed(0)}`);
await page.keyboard.press('KeyR'); await waitSim(0.2);
// completa o stage 1 do D1 pelo percurso de referência
await page.keyboard.press('KeyR'); await waitSim(0.2);
await S(() => { window.__surf.game.autopilot = true; });
for (let i = 0; i < 400; i++) { await waitSim(0.25); if (await S(() => window.__surf.game.world.skill.stage >= 1)) break; }
const d1s = await S(() => { const w = window.__surf.game.world; return { stage: w.skill.stage, split: w.skill.lastSplit && w.skill.lastSplit.total, hud: document.getElementById('skill-stage').textContent }; });
await page.screenshot({ path: join(shots, '12b-skill-d1.png') });
await S(() => { window.__surf.game.autopilot = false; });
check('25. completa um segmento do D1 e vê o split', d1s.stage === 1 && d1s.split > 0 && d1s.hud.startsWith('STAGE 2/6'), JSON.stringify(d1s));
// corrida curta de teste até o fim
await S(() => { window.__surf.menu.act.startSkill('teste_curto'); window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); window.__surf.game.autopilot = true; });
for (let i = 0; i < 200; i++) { await waitSim(0.25); if (await S(() => window.__surf.game.world?.skill?.state === 'finished')) break; }
const fin = await S(() => window.__surf.game.world.skill.state);
for (let i = 0; i < 40; i++) { await wait(150); if (await S(() => !!window.__surf.game.ghosts?.pb)) break; }
const hasGhost = await S(() => !!window.__surf.game.ghosts?.pb);
await wait(2200); // tela de fim
const finishPanel = await page.isVisible('.skill-total');
await page.screenshot({ path: join(shots, '13-skill-finish.png') });
check('23. termina uma corrida curta e guarda o fantasma do PB', fin === 'finished' && hasGhost && finishPanel, `estado=${fin} fantasma=${hasGhost} tela=${finishPanel}`);
await page.click('#skagain');
await wait(300);
await S(() => { window.__surf.game.autopilot = false; window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); });
// segunda tentativa à mão: sai da zona andando e para; o fantasma segue o caminho do PB
await page.keyboard.down('KeyW'); await waitSim(0.9); await page.keyboard.up('KeyW');
await waitSim(1.2);
const ghost2 = await S(() => ({ state: window.__surf.game.world.skill.state, visible: window.__surf.game.ghostVisible, diff: window.__surf.game.ghostDiff, label: document.getElementById('ghost-label')?.textContent || '' }));
await page.screenshot({ path: join(shots, '14-skill-ghost.png') });
await S(() => { window.__surf.game.autopilot = false; });
check('24. o fantasma aparece na tentativa seguinte, com a diferença ao vivo', ghost2.state === 'running' && ghost2.visible && ghost2.diff !== null && ghost2.label.startsWith('PB'), JSON.stringify(ghost2));
// rodada 9: tela de fim → "Próximo mapa" carrega o mapa seguinte direto na zona de início
await S(() => { window.__surf.game.autopilot = false; window.__surf.input.keys.clear(); window.__surf.menu.act.startSkill('teste_curto'); window.__surf.input.enabled = true; window.__surf.game.paused = false; document.getElementById('panel').classList.add('hidden'); window.__surf.game.autopilot = true; });
for (let i = 0; i < 200; i++) { await waitSim(0.25); if (await S(() => window.__surf.game.world?.skill?.state === 'finished')) break; }
for (let i = 0; i < 40; i++) { await wait(150); if (await page.isVisible('#sknext')) break; }
const nextBtn = await page.isVisible('#sknext');
await S(() => { window.__surf.game.autopilot = false; });
if (nextBtn) await page.click('#sknext');
await wait(800);
const nextMap = await S(() => ({ map: window.__surf.game.world?.map?.name, state: window.__surf.game.world?.skill?.state, panel: !document.getElementById('panel').classList.contains('hidden') }));
await page.screenshot({ path: join(shots, '15-skill-next.png') });
check('26. "Próximo mapa" na tela de fim carrega o mapa seguinte na zona de início', nextBtn && nextMap.map === 'SKY STEPS' && nextMap.state === 'zone' && !nextMap.panel, JSON.stringify({ nextBtn, ...nextMap }));

// rodada 10: armas novas em primeira pessoa (1/2/3/4), tiro, recarga, inspeção e a balisong abrindo/fechando
await S(() => { const s = window.__surf; s.game.autopilot = false; s.input.keys.clear(); s.game.stop(); s.menu.act.startTraining('runner'); s.input.enabled = true; s.game.paused = false; document.getElementById('panel').classList.add('hidden'); s.settings.viewBob = false; });
await wait(500);
await S(() => { const w = window.__surf.game.world, p = w.local; p.giveWeapon('rifle'); p.giveWeapon('pistol'); p.nades.he = 1; p.nades.smoke = 1; p.phys.pos.set(0, 2, 5450); p.phys.vel.set(0, 0, 0); window.__surf.input.yaw = Math.PI; window.__surf.input.pitch = -0.05; });
const fpRes = [];
for (const [key, label] of [['Digit1', 'rifle'], ['Digit2', 'pistol'], ['Digit3', 'knife'], ['Digit3', 'taser'], ['Digit4', 'nade']]) {
  await page.keyboard.press(key); await waitSim(0.9);
  const cur = await S(() => { const p = window.__surf.game.world.local; return p.slot === 4 ? 'nade' : p.currentWeapon()?.id; });
  let fired = true, reloaded = true;
  if (label === 'rifle' || label === 'pistol') {
    const m0 = await S(() => window.__surf.game.world.local.currentWeapon().mag);
    await page.mouse.down(); await waitSim(0.15); await page.mouse.up(); await waitSim(0.3);
    const m1 = await S(() => window.__surf.game.world.local.currentWeapon().mag);
    fired = m1 < m0;
    await page.keyboard.press('KeyR'); await waitSim(2.8);
    const m2 = await S(() => { const ws = window.__surf.game.world.local.currentWeapon(); return { mag: ws.mag, max: ws.def?.mag ?? null }; });
    reloaded = m2.mag > m1;
  }
  await waitSim(0.3);
  await page.keyboard.press('KeyF'); await waitSim(0.25);
  const insp = await S(() => window.__surf.game.inspect);
  await page.screenshot({ path: join(shots, `16-fp-${label}.png`) });
  await waitSim(label === 'knife' ? 2.0 : 1.3);
  fpRes.push({ label, cur, fired, reloaded, insp: !!insp });
}
check('27. Treino: saca cada arma (1/2/3/4), atira, recarrega e inspeciona com os modelos novos', fpRes.every((r) => r.cur === r.label && r.fired && r.reloaded && r.insp), JSON.stringify(fpRes));
// balisong: a animação de sacar abre (lâmina e cabo giram uma volta) e a inspeção fecha e abre de novo
await page.keyboard.press('Digit2'); await waitSim(0.5);
await page.keyboard.press('Digit3'); await waitSim(0.05);
const bf = await S(async () => {
  const g = window.__surf.game, p = g.world.local, out = [];
  for (let i = 0; i < 12; i++) { const ps = g.viewPose(p, true); out.push(+(ps.blade % (2 * Math.PI)).toFixed(2)); await new Promise((r) => setTimeout(r, 60)); }
  return out;
});
await waitSim(0.8);
await page.keyboard.press('KeyF');
const bfInsp = await S(async () => {
  const g = window.__surf.game, p = g.world.local, out = [];
  for (let i = 0; i < 30; i++) { const ps = g.viewPose(p, true); out.push(+Math.abs(Math.cos(ps.blade / 2)).toFixed(2)); await new Promise((r) => setTimeout(r, 70)); }
  return out;
});
await page.screenshot({ path: join(shots, '17-fp-balisong-inspect.png') });
// cos(blade/2): 1 = aberta (0 ou 2π), 0 = fechada (π)
const opened = bf.some((b) => Math.abs(b - Math.PI) < 0.6) && Math.abs(bf[bf.length - 1]) < 0.3;
const closedInInspect = bfInsp.some((c) => c < 0.25) && bfInsp.some((c) => c > 0.9);
check('28. balisong abre ao sacar e fecha/abre na inspeção (três peças nos pinos)', opened && closedInInspect, JSON.stringify({ draw: bf, inspect: bfInsp.join(',') }));

// rodada 10: tela Arsenal com todos os modelos (detalhado e simplificado) e screenshot de cada um
const arsDir = join(shots, 'arsenal');
mkdirSync(arsDir, { recursive: true });
await S(() => { const s = window.__surf; s.game.stop(); s.input.enabled = false; s.input.unlock(); s.openArsenal(); });
await wait(300);
const arsVisible = await page.isVisible('#arsenal');
const arsList = await S(() => window.__surf.arsenal.entries.map((e) => ({ id: e.id, lods: e.lods })));
const arsInfo = [];
for (let i = 0; i < arsList.length; i++) for (const lod of arsList[i].lods) {
  const info = await S(([i, lod]) => { const a = window.__surf.arsenal; a.show(i); a.setLod(lod); a.fixedYaw = -0.45; return a.info(); }, [i, lod]);
  await wait(120);
  await page.screenshot({ path: join(arsDir, `${String(i + 1).padStart(2, '0')}-${info.id}-${lod}.png`) });
  arsInfo.push(info);
}
await page.keyboard.press('ArrowRight'); await wait(100);
const arrowIdx = await S(() => window.__surf.arsenal.idx);
await S(() => { window.__surf.arsenal.fixedYaw = null; });
await page.keyboard.press('Escape'); await wait(300);
const backToMenu = await page.isVisible('#main-nav') && !(await S(() => window.__surf.arsenal.active));
const overBudget = arsInfo.filter((x) => x.tris > x.budget);
check('29. Arsenal mostra todos os modelos (setas, versões de detalhe, triângulos) e volta ao menu', arsVisible && arsInfo.length >= 40 && overBudget.length === 0 && arrowIdx === 0 && backToMenu, `modelos=${arsList.length} capturas=${arsInfo.length} acima=${overBudget.length} seta=${arrowIdx} menu=${backToMenu}`);

const fps = await S(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
console.log(`fps (software renderer): ${fps}`);
check('sem erros no console', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram. Os testes de multiplayer da especificação ainda não se aplicam.`);
process.exit(failed.length ? 1 : 0);
