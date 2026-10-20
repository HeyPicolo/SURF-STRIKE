// Menus, painéis de configuração, seleção de classe e telas de resultado.
import { CLASSES, CLASS_IDS, ClassId } from '../../../shared/config/classes';
import { BOT_SKILL, BotDifficulty, MATCH } from '../../../shared/config/match';
import { WEAPONS } from '../../../shared/config/weapons';
import { PHYSICS } from '../../../shared/config/physics';
import type { World } from '../../../shared/sim/world';
import type { Team } from '../../../shared/maps/types';
import { Settings, saveSettings, ACTION_LABELS, Action, keyLabel, DEFAULT_KEYS } from '../game/settings';
import { esc } from './hud';
import { SkillMapMeta, TIER_COLORS, TIER_LABELS, TIER_STYLE, SKILL, formatTicks, formatDiff, skillMapsOf, SkillCategory, segmentWord, SkillTier, nextSkillMap, skillMapMeta } from '../../../shared/config/skill';
import { MapRecords, FinishResult, sumOfBest } from '../../../shared/sim/records';
import type { SkillEvent } from '../../../shared/sim/skill';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export interface MatchSetup { teamSize: number; difficulty: BotDifficulty; team: Team; classId: ClassId; }

export interface MenuActions {
  startBots(s: MatchSetup): void;
  startTraining(classId: ClassId): void;
  /** tela Arsenal (revisão dos modelos) */
  openArsenal?(): void;
  resume(): void;
  quitToMenu(): void;
  settingsChanged(): void;
  click(): void;
  startSkill(mapId: string): void;
  skillRecords(mapId: string): MapRecords;
  skillRestart(): void;
}

export class Menu {
  setup: MatchSetup;
  private listening: { action: Action; btn: HTMLButtonElement } | null = null;
  inGame = false;

  constructor(public settings: Settings, public act: MenuActions) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem('surfstrike.setup') ?? 'null'); } catch { return null; } })();
    this.setup = { teamSize: 3, difficulty: 'medium', team: 'blue', classId: 'runner', ...(saved ?? {}) };
    // atalho N na tela de fim do Surf Skill: próximo mapa (Enter também, pelo foco no botão principal)
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || $('panel').classList.contains('hidden')) return;
      const b = document.getElementById('sknext');
      if (b) { e.preventDefault(); b.click(); }
    });
    $('main-nav').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      this.act.click();
      const go = b.dataset.go!;
      if (go === 'play') this.showPlay();
      else if (go === 'training') this.showTraining();
      else if (go === 'skill') this.showSkill();
      else if (go === 'create' || go === 'join') this.showMultiplayer(go);
      else if (go === 'classes') this.showClasses();
      else if (go === 'settings') this.showSettings();
      else if (go === 'credits') this.showCredits();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.listening) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') {
        this.settings.keys[this.listening.action] = e.code;
        saveSettings(this.settings);
      }
      this.listening.btn.classList.remove('listening');
      this.listening.btn.textContent = keyLabel(this.settings.keys[this.listening.action]);
      this.listening = null;
    }, true);
  }

  showMain() { this.hidePanel(); $('menu').classList.remove('hidden'); this.inGame = false; }
  hideAll() { $('menu').classList.add('hidden'); this.hidePanel(); }
  hidePanel() { $('panel').classList.add('hidden'); }

  private panel(html: string) {
    $('panel-body').innerHTML = html;
    $('panel').classList.remove('hidden');
    if (!this.inGame) $('menu').classList.add('hidden');
    $('panel-body').querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => b.onclick = () => { this.act.click(); this.inGame ? this.showPause() : this.showMain(); });
    const first = $('panel-body').querySelector<HTMLElement>('button.primary');
    first?.focus({ preventScroll: true });
  }

  private saveSetup() { try { localStorage.setItem('surfstrike.setup', JSON.stringify(this.setup)); } catch { /* ignore */ } }

  private classCards(selected: ClassId) {
    return `<div class="class-grid">${CLASS_IDS.map((id) => {
      const c = CLASSES[id];
      return `<button class="class-card ${id === selected ? 'on' : ''}" data-class="${id}" style="--c:${hex(c.color)}">
        <div class="cn">${c.name}</div><div class="cr">${c.role}</div>
        <div class="ab"><b>${c.ability.name} — ${c.ability.cooldown}s</b>${c.ability.desc}</div>
        <div class="ab"><b>Passiva: ${c.passive.name}</b>${c.passive.desc}</div></button>`;
    }).join('')}</div>`;
  }

  private bindClassCards(onPick: (id: ClassId) => void) {
    $('panel-body').querySelectorAll<HTMLButtonElement>('.class-card').forEach((b) => b.onclick = () => {
      this.act.click();
      $('panel-body').querySelectorAll('.class-card').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(b.dataset.class as ClassId);
    });
  }

  private choiceRow(name: string, options: [string, string, string?][], value: string) {
    return `<div class="choice-row" data-choice="${name}">${options.map(([v, l, cls]) => `<button class="choice ${cls ?? ''} ${v === value ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  private bindChoices(on: (name: string, v: string) => void) {
    $('panel-body').querySelectorAll<HTMLElement>('[data-choice]').forEach((row) => {
      row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.onclick = () => {
        this.act.click();
        row.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        on(row.dataset.choice!, b.dataset.v!);
      });
    });
  }

  showPlay() {
    const s = this.setup;
    this.panel(`<h2>Partida contra bots</h2>
      <p>Team Elimination: sem respawn no round, ${MATCH.roundTime}s por round, primeiro a ${MATCH.roundsToWin} rounds vence. Todos começam com a faca borboleta e o taser; as armas estão espalhadas pelo mapa e mudam a cada round. Se o tempo acabar, os sobreviventes vão para duelos 1v1 sem colete e sem poderes, com a mesma arma sorteada para os dois.</p>
      <h4>Tamanho das equipes</h4>${this.choiceRow('size', [['1', '1v1'], ['2', '2v2'], ['3', '3v3'], ['4', '4v4'], ['5', '5v5']], String(s.teamSize))}
      <h4>Dificuldade dos bots</h4>${this.choiceRow('diff', (Object.keys(BOT_SKILL) as BotDifficulty[]).map((d) => [d, BOT_SKILL[d].label]), s.difficulty)}
      <h4>Sua equipe</h4>${this.choiceRow('team', [['blue', 'Equipe Azul', 'team-blue'], ['red', 'Equipe Vermelha', 'team-red']], s.team)}
      <h4>Sua classe</h4>${this.classCards(s.classId)}
      <div class="panel-actions"><button class="btn primary" id="go">Iniciar partida</button><button class="btn" data-back>Voltar</button></div>`);
    this.bindChoices((n, v) => {
      if (n === 'size') s.teamSize = +v;
      if (n === 'diff') s.difficulty = v as BotDifficulty;
      if (n === 'team') s.team = v as Team;
      this.saveSetup();
    });
    this.bindClassCards((id) => { s.classId = id; this.saveSetup(); });
    $('go').onclick = () => { this.act.click(); this.saveSetup(); this.act.startBots({ ...s }); };
  }

  showTraining() {
    this.panel(`<h2>Treinamento</h2>
      <p>Arena CLOUDS sozinho, com alvos para testar armas. Todos os pickups reaparecem. Você pode reiniciar a posição, salvar checkpoints de surf e voar livremente. O medidor de velocidade fica sempre visível.</p>
      <h4>Classe</h4>${this.classCards(this.setup.classId)}
      <div class="panel-actions"><button class="btn primary" id="go">Entrar no treino</button><button class="btn" id="arsenal-btn">Arsenal</button><button class="btn" data-back>Voltar</button></div>`);
    this.bindClassCards((id) => { this.setup.classId = id; this.saveSetup(); });
    $('go').onclick = () => { this.act.click(); this.act.startTraining(this.setup.classId); };
    $('arsenal-btn').onclick = () => { this.act.click(); this.act.openArsenal?.(); };
  }

  // ------------------------------------------------------------------ Surf Skill
  private skillTab: SkillCategory = 'treino';

  /** Selo do tier (T6: preto com borda vermelha). */
  private tierBadge(t: SkillTier) {
    const st = TIER_STYLE[t];
    return `<span class="tier-badge" style="background:${st.bg};color:${st.fg};border-color:${st.border}">T${t}</span>`;
  }

  showSkill(tab: SkillCategory = this.skillTab) {
    this.skillTab = tab;
    const s = this.settings;
    const t = (ticks: number | null | undefined) => (ticks === null || ticks === undefined ? '—' : formatTicks(ticks));
    const list = skillMapsOf(tab);
    let prevDone = true;
    const cards = list.map((m) => {
      const rec = this.act.skillRecords(m.id);
      const sob = sumOfBest(rec);
      const done = rec.completions > 0;
      // desbloqueio progressivo (desligado por padrão): só nos desafios
      const locked = tab === 'desafio' && SKILL.progressiveUnlock && !prevDone;
      prevDone = done;
      const n = m.format === 'linear' ? m.segments.length - 1 : m.segments.length;
      const top = rec.top.length
        ? `<table>${rec.top.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${formatTicks(e.ticks)}</td><td style="opacity:.6">${new Date(e.date).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</table>`
        : '<p class="muted" style="font-size:12px">Nenhum tempo ainda. Seja o primeiro.</p>';
      return `<div class="skill-card ${locked ? 'locked' : ''}" style="--c:${TIER_COLORS[m.tier]}">
        <div class="card-head">${this.tierBadge(m.tier)}<span class="tier">${m.num ? `DESAFIO ${m.num} · ` : ''}${TIER_LABELS[m.tier]}</span>${done ? '<span class="done-seal">✓ CONCLUÍDO</span>' : ''}</div>
        <h3>${m.name}</h3>
        <div class="fmt">${m.format === 'staged' ? 'Staged' : 'Linear'} · ${n} ${segmentWord(m.format, n !== 1)}</div>
        <p>${m.desc}</p>
        <div class="stats">
          <span>Recorde pessoal</span><b>${t(rec.pb?.ticks)}</b>
          <span>Sum of Best</span><b>${t(sob)}</b>
          <span>Tentativas</span><b>${rec.attempts} · ${rec.completions} concluídas</b>
        </div>
        <details${rec.top.length ? '' : ' open'}><summary>Top ${SKILL.topN} local</summary>${top}</details>
        ${locked ? '<button class="btn" disabled>Conclua o desafio anterior</button>' : `<button class="btn primary" data-skill="${m.id}">Jogar ${m.name}</button>`}
      </div>`;
    }).join('');
    const askName = !s.skillNameSet;
    const empty = tab === 'desafio' && list.length === 0
      ? '<p class="muted">Os 12 mapas de desafio chegam nas próximas atualizações.</p>' : '';
    this.panel(`<h2>Surf Skill</h2>
      <p>Sem combate: só você, a faca e a física do surf contra o cronômetro. O tempo começa quando você sai da zona verde e termina na zona dourada. Cair leva de volta ao início do stage (ou ao último checkpoint), mas o relógio continua correndo.</p>
      ${askName ? `<div class="skill-name"><span>Seu nome no ranking</span><input type="text" id="skname" maxlength="16" value="${esc(s.playerName === 'Jogador' ? '' : s.playerName)}" placeholder="Jogador"></div><p class="muted" style="font-size:12px;margin-top:0">Dá para trocar depois em Configurações.</p>` : `<p class="muted">Jogando como <b>${esc(s.playerName)}</b> (troque em Configurações).</p>`}
      <div class="skill-tabs">
        <button class="choice ${tab === 'treino' ? 'on' : ''}" data-tab="treino">Treino</button>
        <button class="choice ${tab === 'desafio' ? 'on' : ''}" data-tab="desafio">Desafio</button>
      </div>
      <p class="muted" style="font-size:12px">${tab === 'treino' ? 'Três mapas para aprender: tier 1 a 3.' : 'Doze mapas que testam de verdade o seu surf, cada um mais difícil que o anterior (tier 2 a 6).'}</p>
      ${empty}<div class="skill-maps">${cards}</div>
      <div class="panel-actions"><button class="btn" data-back>Voltar</button></div>`);
    $('panel-body').querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => { this.act.click(); this.saveName(askName); this.showSkill(b.dataset.tab as SkillCategory); });
    $('panel-body').querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((b) => b.onclick = () => {
      this.act.click();
      this.saveName(askName);
      this.act.startSkill(b.dataset.skill!);
    });
  }

  private saveName(askName: boolean) {
    if (!askName) return;
    const el = document.getElementById('skname') as HTMLInputElement | null;
    if (!el) return;
    const v = el.value.trim();
    if (!v) return;
    this.settings.playerName = v;
    this.settings.skillNameSet = true;
    saveSettings(this.settings);
  }

  /** Tela de fim: tempo total, os segmentos (tempo, PB, diferença) e Próximo mapa / Reiniciar / Voltar. */
  showSkillFinish(meta: SkillMapMeta, e: Extract<SkillEvent, { t: 'skillFinish' }>, prevPb: MapRecords['pb'], res: FinishResult | null, rec: MapRecords) {
    this.inGame = true;
    const cls = (d: number | null) => (d === null ? '' : d < 0 ? 'better' : d > 0 ? 'worse' : 'even');
    const linear = meta.format === 'linear';
    const rows = meta.segments.map((st, i) => {
      const time = e.stages[i];
      const pbStage = prevPb?.stages[i] ?? null;
      const diff = pbStage !== null && time !== undefined ? time - pbStage : null;
      const gold = res?.goldStages[i] ? ' <span style="color:#ffd23c">★</span>' : '';
      return `<tr><td>${linear ? (i === 0 ? 'Largada' : `CP ${i}`) : i + 1} · ${esc(st.name)}</td><td>${time !== undefined ? formatTicks(time) : '—'}${gold}</td><td>${pbStage !== null ? formatTicks(pbStage) : '—'}</td><td class="${cls(diff)}">${diff !== null ? formatDiff(diff) : '—'}</td></tr>`;
    }).join('');
    const sob = sumOfBest(rec);
    // próximo mapa na ordem (some no último; respeita o desbloqueio progressivo)
    const next = nextSkillMap(meta.id, (id) => (id === meta.id ? rec : this.act.skillRecords(id)).completions > 0);
    const head = e.practice
      ? '<div class="skill-record" style="color:#ffd23c">PRÁTICA — tempo não conta para recordes</div>'
      : res?.newPb ? `<div class="skill-record">NOVO RECORDE${res.rank ? ` · #${res.rank} no ranking local` : ''}</div>`
      : e.diff !== null ? `<div class="${cls(e.diff)}" style="font-family:var(--display);font-weight:700;font-size:20px">${formatDiff(e.diff)} do seu recorde</div>` : '';
    this.panel(`<h2>${meta.name} concluído</h2>
      <div class="skill-total">${formatTicks(e.total)}</div>
      ${head}
      <table class="skill-res"><tr><th>${linear ? 'Trecho' : 'Stage'}</th><th>Tempo</th><th>PB</th><th>Diferença</th></tr>${rows}</table>
      <p class="muted">Recorde pessoal: <b>${rec.pb ? formatTicks(rec.pb.ticks) : '—'}</b> · Sum of Best: <b>${sob !== null ? formatTicks(sob) : '—'}</b> · ${rec.attempts} tentativas, ${rec.completions} concluídas</p>
      <div class="panel-actions">${next ? `<button class="btn primary" id="sknext" title="Atalho: N ou Enter">Próximo mapa · ${esc(skillMapMeta(next).name)} <span class="kbd" style="margin:0 0 0 8px">N</span></button><button class="btn" id="skagain">Reiniciar</button>` : '<button class="btn primary" id="skagain">Reiniciar</button>'}<button class="btn" id="sktomenu">Voltar ao menu</button></div>`);
    $('skagain').onclick = () => { this.act.click(); this.hidePanel(); this.act.skillRestart(); };
    $('sktomenu').onclick = () => { this.act.click(); this.inGame = false; this.act.quitToMenu(); };
    if (next) $('sknext').onclick = () => { this.act.click(); this.act.startSkill(next); };
  }

  showMultiplayer(kind: 'create' | 'join') {
    this.panel(`<h2>${kind === 'create' ? 'Criar sala' : 'Entrar em sala'}</h2>
      <p>O multiplayer online ainda não está disponível nesta versão. A simulação do jogo já roda separada do cliente e é autoritativa sobre vida, dano, pickups, timers e placar, que é a base para o servidor de salas.</p>
      <p class="muted">Enquanto isso, as partidas contra bots usam exatamente as mesmas regras.</p>
      <div class="panel-actions"><button class="btn primary" id="go">Jogar contra bots</button><button class="btn" data-back>Voltar</button></div>`);
    $('go').onclick = () => { this.act.click(); this.showPlay(); };
  }

  showClasses() {
    this.panel(`<h2>Classes</h2><p>Todas usam as armas do mapa e começam com 150 de vida e colete cheio. A classe muda como você se move e luta. A escolhida aqui vira sua classe padrão.</p>
      ${this.classCards(this.setup.classId)}
      <div class="panel-actions"><button class="btn primary" data-back>Pronto</button></div>`);
    this.bindClassCards((id) => { this.setup.classId = id; this.saveSetup(); });
  }

  showSettings() {
    const s = this.settings;
    const range = (id: string, label: string, min: number, max: number, step: number, val: number) =>
      `<label class="set-row"><span>${label}</span><span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"> <output id="${id}-o">${val}</output></span></label>`;
    const check = (id: string, label: string, val: boolean) => `<label class="set-row"><span>${label}</span><input type="checkbox" id="${id}" ${val ? 'checked' : ''}></label>`;
    const keys = (Object.keys(ACTION_LABELS) as Action[]).map((a) =>
      `<div class="set-row"><span>${ACTION_LABELS[a]}</span><button class="keybind" data-action="${a}">${keyLabel(s.keys[a])}</button></div>`).join('');
    this.panel(`<h2>Configurações</h2>
      <div class="settings-grid">
        <div>
          <h4>Controle</h4>
          ${range('sens', 'Sensibilidade do mouse', 0.2, 8, 0.05, s.sensitivity)}
          ${range('fov', 'Campo de visão', 80, 120, 1, s.fov)}
          ${check('bhop', 'Auto-bhop (segurar Espaço)', s.autoBhop)}
          ${check('speed', 'Exibir velocidade', s.showSpeed)}
          ${check('bob', 'Balanço da câmera', s.viewBob)}
          <label class="set-row"><span>Mira (botão direito)</span><select id="aimmode"><option value="toggle">Alternar (clique)</option><option value="hold">Segurar</option></select></label>
          ${check('fslock', 'Tela cheia ao jogar (protege Ctrl+W)', s.fullscreenLock)}
          <label class="set-row"><span>Nome</span><input type="text" id="pname" maxlength="16" value="${esc(s.playerName)}"></label>
          <h4>Áudio</h4>
          ${range('vol', 'Volume geral', 0, 1, 0.05, s.masterVolume)}
          ${range('sfx', 'Volume dos efeitos', 0, 1, 0.05, s.sfxVolume)}
          <h4>Vídeo</h4>
          <label class="set-row"><span>Qualidade gráfica</span><select id="quality"><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option></select></label>
          ${check('fx', 'Efeitos visuais completos', s.effects)}
          <h4>Surf Skill</h4>
          ${check('ghost', 'Mostrar fantasma do recorde', s.ghostShow)}
          ${range('gopa', 'Opacidade do fantasma', 0.1, 1, 0.05, s.ghostOpacity)}
          <label class="set-row"><span>Sincronia do fantasma</span><select id="gsync"><option value="run">Corrida inteira</option><option value="segment">Por segmento (melhor de cada stage)</option></select></label>
        </div>
        <div><h4>Teclas <span class="muted">(clique e pressione uma tecla)</span></h4>${keys}
          <div class="panel-actions"><button class="btn" id="resetkeys">Restaurar teclas padrão</button></div></div>
      </div>
      <div class="panel-actions"><button class="btn primary" data-back>Salvar e voltar</button></div>`);
    ($('quality') as HTMLSelectElement).value = s.quality;
    ($('gsync') as HTMLSelectElement).value = s.ghostSync;
    ($('aimmode') as HTMLSelectElement).value = s.aimMode;
    ($('aimmode') as HTMLSelectElement).onchange = (e) => { s.aimMode = (e.target as HTMLSelectElement).value as Settings['aimMode']; this.changed(); };
    ($('gsync') as HTMLSelectElement).onchange = (e) => { s.ghostSync = (e.target as HTMLSelectElement).value as Settings['ghostSync']; this.changed(); };
    const bindRange = (id: string, set: (v: number) => void) => {
      const el = $(id) as HTMLInputElement;
      el.oninput = () => { set(+el.value); $(id + '-o').textContent = el.value; this.changed(); };
    };
    bindRange('sens', (v) => (s.sensitivity = v));
    bindRange('fov', (v) => (s.fov = v));
    bindRange('vol', (v) => (s.masterVolume = v));
    bindRange('sfx', (v) => (s.sfxVolume = v));
    bindRange('gopa', (v) => (s.ghostOpacity = v));
    const bindCheck = (id: string, set: (v: boolean) => void) => { const el = $(id) as HTMLInputElement; el.onchange = () => { set(el.checked); this.changed(); }; };
    bindCheck('bhop', (v) => (s.autoBhop = v));
    bindCheck('speed', (v) => (s.showSpeed = v));
    bindCheck('bob', (v) => (s.viewBob = v));
    bindCheck('fslock', (v) => (s.fullscreenLock = v));
    bindCheck('fx', (v) => (s.effects = v));
    bindCheck('ghost', (v) => (s.ghostShow = v));
    ($('quality') as HTMLSelectElement).onchange = (e) => { s.quality = (e.target as HTMLSelectElement).value as Settings['quality']; this.changed(); };
    ($('pname') as HTMLInputElement).oninput = (e) => { s.playerName = (e.target as HTMLInputElement).value.trim() || 'Jogador'; s.skillNameSet = true; this.changed(); };
    $('panel-body').querySelectorAll<HTMLButtonElement>('.keybind').forEach((b) => b.onclick = () => {
      if (this.listening) { this.listening.btn.classList.remove('listening'); this.listening.btn.textContent = keyLabel(s.keys[this.listening.action]); }
      this.listening = { action: b.dataset.action as Action, btn: b };
      b.classList.add('listening'); b.textContent = '…';
    });
    $('resetkeys').onclick = () => { s.keys = { ...DEFAULT_KEYS }; this.changed(); this.showSettings(); };
  }

  private changed() { saveSettings(this.settings); this.act.settingsChanged(); }

  showCredits() {
    this.panel(`<h2>Créditos</h2>
      <p>SURF STRIKE é um protótipo original de FPS de surf competitivo. Personagens, armas, arena, efeitos e sons foram criados do zero para este projeto: modelos low-poly gerados por código, áudio sintetizado com WebAudio e um renderizador WebGL2 próprio.</p>
      <p>Inspirado no gênero Combat Surf da comunidade de jogos de tiro, sem usar nenhum recurso de outros jogos.</p>
      <h4>Física</h4><p class="muted">Movimento no estilo Source: gravidade ${PHYSICS.gravity}, aceleração aérea ${PHYSICS.airAccelerate}, teto de velocidade aérea ${PHYSICS.airWishSpeedCap}, ${PHYSICS.tickRate} ticks/s.</p>
      <h4>Arsenal</h4><p class="muted">${Object.values(WEAPONS).map((w) => `${w.name} (${w.category})`).join(', ')}.</p>
      <div class="panel-actions"><button class="btn primary" data-back>Voltar</button></div>`);
  }

  showPause() {
    this.inGame = true;
    this.panel(`<h2>Pausado</h2><p class="muted">Clique em Continuar para voltar à arena.</p>
      <div class="panel-actions" style="flex-direction:column;align-items:flex-start">
        <button class="btn primary" id="resume">Continuar</button>
        <button class="btn" id="psettings">Configurações</button>
        <button class="btn" id="quit">Sair para o menu</button>
      </div>`);
    $('resume').onclick = () => { this.act.click(); this.hidePanel(); this.act.resume(); };
    $('psettings').onclick = () => { this.act.click(); this.showSettings(); };
    $('quit').onclick = () => { this.act.click(); this.inGame = false; this.act.quitToMenu(); };
  }

  showResults(w: World) {
    this.inGame = false;
    const me = w.local;
    const won = w.match.matchWinner === me.team;
    const all = [...w.players].sort((a, b) => b.stats.kills * 100 + b.stats.damage - (a.stats.kills * 100 + a.stats.damage));
    const mvp = all[0];
    const rows = all.map((p) => `<tr><td style="color:${p.team === 'blue' ? '#9cc2ff' : '#ffa1aa'}">${esc(p.name)}${p.id === me.id ? ' (você)' : ''}</td><td>${CLASSES[p.classId].name}</td><td>${p.stats.kills}</td><td>${p.stats.deaths}</td><td>${p.stats.headshots}</td><td>${p.stats.damage}</td></tr>`).join('');
    this.panel(`<h2>${won ? 'Vitória' : 'Derrota'}</h2>
      <div class="result-score"><span class="b">${w.match.score.blue}</span><span>×</span><span class="r">${w.match.score.red}</span></div>
      <p>MVP: <b>${esc(mvp.name)}</b> com ${mvp.stats.kills} abates e ${mvp.stats.damage} de dano.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px" class="results"><tr style="opacity:.6;font-size:12px"><td>Jogador</td><td>Classe</td><td>Abates</td><td>Mortes</td><td>HS</td><td>Dano</td></tr>${rows}</table>
      <div class="panel-actions"><button class="btn primary" id="again">Jogar novamente</button><button class="btn" id="tomenu">Menu principal</button></div>`);
    $('again').onclick = () => { this.act.click(); this.hidePanel(); this.act.startBots({ ...this.setup }); };
    $('tomenu').onclick = () => { this.act.click(); this.act.quitToMenu(); };
  }
}
