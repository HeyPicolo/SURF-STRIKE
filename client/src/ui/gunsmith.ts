// =============================================================
//  ARSENAL (gunsmith, rodada 12c). Tela 1: lista das armas com nível, XP e próximo desbloqueio.
//  Tela 2: edição — arma em 3D de perfil (renderer do jogo), cards dos attachments em volta ligados
//  por linhas finas ao ponto de montagem (projetado a cada quadro), bloco de título no canto
//  inferior esquerdo e o painel de cada categoria com prós/contras e barras de atributos.
//  As regras ficam em shared/sim/gunsmith.ts; aqui só a interface.
// =============================================================
import type { Renderer, GpuMesh } from '../render/Renderer';
import { trs, child, mat4, Mat4 } from '../render/glm';
import { weaponGeometry } from '../entities/geometry';
import { MeshBuilder } from '../render/mesh';
import { slotPoint } from '../entities/attachGeometry';
import { ATTACH_SLOTS, AttachSlot, ATTACHMENTS, MAX_ATTACHMENTS, SLOT_LABEL } from '../../../shared/config/attachments';
import { PROGRESSION_WEAPONS, ProgWeaponId } from '../../../shared/config/progression';
import { Build, buildKey, sanitizeBuild } from '../../../shared/sim/loadout';
import { ProgressionStore, ProgressionData, levelInfo } from '../../../shared/sim/progression';
import { slotOptions, equip, unequip, swapEquip, compareStats, weaponSummary, buildCount, xpFrac, EquipResult } from '../../../shared/sim/gunsmith';
import { esc } from './hud';

const BG = 0x0c1016;

/**
 * Fundo com padrão geométrico sutil (triângulos em linhas finas), desenhado no próprio WebGL num
 * plano atrás da arma (uma camada CSS por cima do canvas causava falhas de composição).
 * Plano local: x em [−1,4; 1,4], y em [−0,8; 0,8], normal +Z.
 */
function patternGeometry(): MeshBuilder {
  const m = new MeshBuilder(), c = 0x0f1319, t = 0.002, h = 0.12, w = h * 1.1547;
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * t, ny = (dx / l) * t;
    m.quad([x0 - nx, y0 - ny, 0], [x1 - nx, y1 - ny, 0], [x1 + nx, y1 + ny, 0], [x0 + nx, y0 + ny, 0], c, 1, [0, 0, 1]);
  };
  for (let row = -7; row <= 7; row++) {
    const y = row * h, off = (row & 1) * w / 2;
    seg(-1.4, y, 1.4, y);
    for (let k = -14; k <= 14; k++) {
      const x = k * w + off;
      seg(x, y, x + w / 2, y + h); seg(x + w / 2, y + h, x + w, y);
    }
  }
  return m;
}

/** Descrição curta de cada arma (bloco do canto inferior esquerdo). */
export const WEAPON_BLURB: Record<ProgWeaponId, string> = {
  pistol: 'Pistola semiautomática leve. Saque rápido e precisa em movimento; a reserva para quando a primária seca.',
  rifle: 'Rifle de assalto versátil. Recuo controlável e bom alcance para lutar no chão e no ar.',
  smg: 'Submetralhadora de cadência alta. Feita para o surf agressivo e para lutas de perto.',
  shotgun: 'Escopeta de bombeamento. Devastadora de perto, perde força rápido com a distância.',
  sniper: 'Rifle de precisão de ferrolho. Um tiro na cabeça elimina; parada na luneta é mortal.',
};

/** Ícones simples de cada categoria (SVG original, traço fino). */
const ICON: Record<AttachSlot | 'add' | 'lock', string> = {
  muzzle: '<path d="M3 9h10v6H3zM13 10h5v4h-5zM18 8h3v8h-3z"/>',
  barrel: '<path d="M2 10h20v4H2zM6 10v4M11 10v4M16 10v4"/>',
  laser: '<path d="M3 8h9v8H3zM12 11h2v2h-2zM15 12h7" stroke-dasharray="2 1.5"/>',
  optic: '<path d="M4 9h16v6H4zM8 15v3M16 15v3"/><circle cx="12" cy="12" r="1.6"/>',
  stock: '<path d="M2 9h8l10 2v6h-4l-6-3H2z"/>',
  underbarrel: '<path d="M4 6h16v3H4zM10 9h4l-1 10h-2z"/>',
  magazine: '<path d="M8 3h8v4l-1 14H9L8 7z"/><path d="M8 9h8"/>',
  rearGrip: '<path d="M7 4h8l2 15-4 2-3-2z"/><path d="M9 9h6M9.5 12h6M10 15h6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
};
const icon = (k: keyof typeof ICON) => `<svg viewBox="0 0 24 24" class="gs-ico" aria-hidden="true">${ICON[k]}</svg>`;

/** Linhas de cima e de baixo (como na referência: cards em volta da arma). */
const TOP: AttachSlot[] = ['muzzle', 'barrel', 'laser', 'optic', 'stock'];
const BOTTOM: AttachSlot[] = ['underbarrel', 'magazine', 'rearGrip'];

type Screen = 'list' | 'edit';

export class Gunsmith {
  active = false;
  screen: Screen = 'list';
  weapon: ProgWeaponId = 'rifle';
  /** categoria aberta no painel */
  openSlot: AttachSlot | null = null;
  /** peça sob o mouse (pré-visualização no modelo) */
  hover: string | null = null;
  /** aviso de limite: peça que o jogador tentou equipar */
  pending: string | null = null;
  /** pausa o balanço/rotação (screenshots) */
  still = false;
  private data: ProgressionData;
  private el: HTMLDivElement | null = null;
  private time = 0;
  private dragYaw = 0; private dragPitch = 0;
  private dragging: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private cache = new Map<string, { mesh: GpuMesh; tris: number }>();
  private pattern: GpuMesh | null = null;
  private model: Mat4 = mat4();
  private center: [number, number, number] = [0, 0, 0];
  private size = 50;
  private cardPos = new Map<AttachSlot, { x: number; y: number; top: boolean }>();
  private layoutKey = '';
  private cardW = 150;
  private onClose: () => void = () => {};
  /** botão "Galeria" da lista */
  onGallery: () => void = () => {};
  /** clique de interface (sfx) */
  click: () => void = () => {};

  private keyHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.code === 'Escape') { e.preventDefault(); this.back(); }
    else if (this.openSlot && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
      const opts = [...this.root.querySelectorAll<HTMLButtonElement>('.gs-opt')];
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      const n = opts[(i + (e.code === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length];
      n?.focus(); e.preventDefault();
    }
  };

  constructor(private r: Renderer, private store: ProgressionStore) {
    this.data = store.load();
  }

  private get root(): HTMLDivElement { return this.el!; }
  get level(): number { return levelInfo(this.weapon, this.data.xp[this.weapon]).level; }
  get build(): Build { return sanitizeBuild(this.weapon, this.data.builds[this.weapon], this.level); }

  /** Abre o Arsenal (na lista ou direto numa arma). */
  open(onClose: () => void, weapon?: ProgWeaponId) {
    this.active = true;
    this.onClose = onClose;
    this.data = this.store.load();
    if (!this.el) this.mount();
    this.el!.style.display = 'block';
    window.addEventListener('keydown', this.keyHandler);
    if (weapon) this.edit(weapon); else this.showList();
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.openSlot = null; this.pending = null; this.hover = null;
    if (this.el) this.el.style.display = 'none';
    window.removeEventListener('keydown', this.keyHandler);
    this.onClose();
  }

  /** Recarrega os dados salvos (ex.: depois do modo dev) e redesenha. */
  refresh() { this.data = this.store.load(); if (this.screen === 'list') this.showList(); else this.renderEdit(); }

  /** Esc: fecha aviso → painel → edição → Arsenal. */
  back() {
    this.click();
    if (this.pending) { this.pending = null; this.renderEdit(); }
    else if (this.openSlot) { this.openSlot = null; this.hover = null; this.renderEdit(); }
    else if (this.screen === 'edit') this.showList();
    else this.close();
  }

  private mount() {
    const el = document.createElement('div');
    el.id = 'gunsmith';
    el.innerHTML = `<svg id="gs-lines"></svg><div id="gs-ui"></div>`;
    document.body.appendChild(el);
    this.el = el;
    // arrastar no fundo gira a arma um pouco
    el.addEventListener('pointerdown', (e) => {
      if (this.screen !== 'edit' || (e.target as HTMLElement).closest('button, input, .gs-panel, .gs-card')) return;
      this.dragging = { x: e.clientX, y: e.clientY, yaw: this.dragYaw, pitch: this.dragPitch };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragYaw = Math.max(-0.7, Math.min(0.7, this.dragging.yaw + (e.clientX - this.dragging.x) * 0.006));
      this.dragPitch = Math.max(-0.35, Math.min(0.35, this.dragging.pitch + (e.clientY - this.dragging.y) * 0.004));
    });
    window.addEventListener('pointerup', () => { this.dragging = null; });
  }

  private save(b: Build) {
    this.data = { ...this.data, builds: { ...this.data.builds, [this.weapon]: b } };
    this.store.save(this.data);
  }

  // ------------------------------------------------------------------ tela 1: lista

  showList() {
    this.screen = 'list'; this.openSlot = null; this.pending = null; this.hover = null;
    this.data = this.store.load();
    const cards = PROGRESSION_WEAPONS.map((w) => {
      const s = weaponSummary(w, this.data);
      return `<button class="gs-wcard" data-weapon="${w}">
        <div class="gs-wname">${esc(s.name)}</div><div class="gs-wcat">${esc(s.category)}</div>
        <div class="gs-lvl"><i class="diamond"></i>Nível ${s.info.level}<span class="muted">/ ${s.info.max}</span></div>
        <div class="gs-xpbar"><i style="width:${(xpFrac(s.info) * 100).toFixed(1)}%"></i></div>
        <div class="gs-xptext">${s.info.maxed ? 'Nível máximo' : `${s.info.intoLevel.toLocaleString('pt-BR')} / ${s.info.needed.toLocaleString('pt-BR')} XP`}</div>
        <div class="gs-next">${s.next ? `Nível ${s.next.level}: ${esc(s.next.name)}` : 'Tudo liberado'}</div>
        <div class="gs-unl">${s.unlocked}/${s.total} attachments · ${buildCount(s.build)}/${MAX_ATTACHMENTS} equipados</div>
      </button>`;
    }).join('');
    this.root.querySelector('#gs-ui')!.innerHTML = `<div class="gs-top"><b class="gs-brand">ARSENAL</b><span class="muted">progressão e attachments das armas</span>
        <button class="btn" id="gs-gallery">Galeria</button><button class="btn" id="gs-close">Voltar <span class="kbd">Esc</span></button></div>
      <div class="gs-list">${cards}</div>
      <p class="gs-hint muted">XP só nas partidas contra bots (mais na dificuldade maior). Cada nível libera um attachment da arma.</p>`;
    this.root.querySelector<HTMLButtonElement>('#gs-close')!.onclick = () => { this.click(); this.close(); };
    this.root.querySelector<HTMLButtonElement>('#gs-gallery')!.onclick = () => { this.click(); this.close(); this.onGallery(); };
    this.root.querySelectorAll<HTMLButtonElement>('.gs-wcard').forEach((b) => {
      b.onclick = () => { this.click(); this.edit(b.dataset.weapon as ProgWeaponId); };
      b.onmouseenter = b.onfocus = () => { this.weapon = b.dataset.weapon as ProgWeaponId; };
    });
    this.root.querySelector<HTMLButtonElement>('.gs-wcard')?.focus({ preventScroll: true });
    this.root.querySelector('#gs-lines')!.innerHTML = '';
  }

  // ------------------------------------------------------------------ tela 2: edição

  edit(w: ProgWeaponId) {
    this.screen = 'edit'; this.weapon = w; this.openSlot = null; this.pending = null; this.hover = null;
    this.dragYaw = 0; this.dragPitch = 0;
    const b = weaponGeometry(w, 'view').bounds();
    this.center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    this.size = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    this.cardPos.clear();
    this.renderEdit();
  }

  /** Abre o painel de uma categoria. */
  openPanel(slot: AttachSlot) { this.openSlot = slot; this.hover = null; this.pending = null; this.renderEdit(); }

  /** Tenta equipar (o resultado também vale para os testes). */
  tryEquip(att: string): EquipResult {
    const r = equip(this.weapon, this.build, att, this.level);
    if (r.ok) { this.save(r.build); this.hover = null; this.openSlot = null; this.renderEdit(); }
    else if (r.reason === 'full') { this.pending = att; this.renderEdit(); }
    return r;
  }

  remove(slot: AttachSlot) { this.save(unequip(this.build, slot)); this.hover = null; this.renderEdit(); }
  resetBuild() { this.save({}); this.openSlot = null; this.hover = null; this.renderEdit(); }

  private renameBuild(name: string) {
    const n = name.trim().slice(0, 24);
    this.data = { ...this.data, buildNames: { ...this.data.buildNames, [this.weapon]: n || undefined } };
    this.store.save(this.data);
  }

  /** Build mostrado no modelo (com a pré-visualização da peça sob o mouse). */
  shownBuild(): Build {
    const b = this.build;
    if (!this.hover) return b;
    const a = ATTACHMENTS[this.hover];
    return a ? { ...b, [a.slot]: this.hover } : b;
  }

  renderEdit() {
    const w = this.weapon, s = weaponSummary(w, this.data), build = this.build, info = s.info;
    const name = this.data.buildNames[w] || s.name;
    const cards = s.slots.map((slot) => {
      const att = build[slot];
      return `<button class="gs-card ${att ? 'on' : 'empty'} ${this.openSlot === slot ? 'sel' : ''}" data-slot="${slot}">
        ${icon(att ? slot : 'add')}<span class="gs-cslot">${SLOT_LABEL[slot]}</span><span class="gs-catt">${att ? esc(ATTACHMENTS[att].name) : 'Vazio'}</span></button>`;
    }).join('');
    this.root.querySelector('#gs-ui')!.innerHTML = `
      <div class="gs-top"><b class="gs-brand">ARSENAL</b><span class="muted">${esc(s.name)} · arraste para girar</span>
        <button class="btn" id="gs-reset">Resetar build</button><button class="btn" id="gs-back">Voltar <span class="kbd">Esc</span></button></div>
      <div class="gs-cards">${cards}</div>
      <div class="gs-info">
        <input class="gs-title" id="gs-title" value="${esc(name)}" maxlength="24" spellcheck="false" aria-label="Nome do build" />
        <div class="gs-cat">${esc(s.category)}</div>
        <div class="gs-lvl"><i class="diamond"></i>Nível ${info.level}<span class="muted">/ ${info.max}</span>
          <span class="gs-xpbar small"><i style="width:${(xpFrac(info) * 100).toFixed(1)}%"></i></span>
          <span class="muted">${info.maxed ? 'máximo' : `${info.intoLevel.toLocaleString('pt-BR')} / ${info.needed.toLocaleString('pt-BR')} XP`}</span></div>
        <p class="gs-desc">${esc(WEAPON_BLURB[w])}</p>
      </div>
      <div class="gs-count">Attachments <b>${buildCount(build)}/${MAX_ATTACHMENTS}</b></div>
      ${this.openSlot ? this.panelHtml(this.openSlot) : ''}
      ${this.pending ? this.limitHtml(this.pending) : ''}`;
    const ui = this.root.querySelector('#gs-ui')!;
    ui.querySelector<HTMLButtonElement>('#gs-back')!.onclick = () => { this.click(); this.openSlot = null; this.pending = null; this.showList(); };
    ui.querySelector<HTMLButtonElement>('#gs-reset')!.onclick = () => { this.click(); this.resetBuild(); };
    const title = ui.querySelector<HTMLInputElement>('#gs-title')!;
    title.onchange = () => this.renameBuild(title.value);
    title.onkeydown = (e) => { if (e.code === 'Enter' || e.code === 'Escape') { title.blur(); e.stopPropagation(); } };
    ui.querySelectorAll<HTMLButtonElement>('.gs-card').forEach((b) => b.onclick = () => { this.click(); this.openPanel(b.dataset.slot as AttachSlot); });
    // posição já calculada (sem pular um quadro); sem posição ainda, o card espera o primeiro layout
    ui.querySelectorAll<HTMLElement>('.gs-card').forEach((c) => {
      const p = this.cardPos.get(c.dataset.slot as AttachSlot);
      if (p) { c.style.left = `${p.x.toFixed(1)}px`; c.style.top = `${p.y.toFixed(1)}px`; c.style.width = `${this.cardW}px`; }
      else if (this.r.canvas.clientWidth >= 760) c.style.visibility = 'hidden';
    });
    ui.querySelectorAll<HTMLButtonElement>('.gs-opt').forEach((b) => {
      const att = b.dataset.att!;
      b.onmouseenter = b.onfocus = () => { if (this.hover !== att) { this.hover = att; this.updateDetails(); } };
      b.onclick = () => { this.click(); if (!b.classList.contains('locked')) this.tryEquip(att); };
    });
    ui.querySelector<HTMLButtonElement>('#gs-remove')?.addEventListener('click', () => { this.click(); this.remove(this.openSlot!); });
    ui.querySelector<HTMLButtonElement>('#gs-pclose')?.addEventListener('click', () => { this.click(); this.openSlot = null; this.hover = null; this.renderEdit(); });
    ui.querySelectorAll<HTMLButtonElement>('.gs-swap').forEach((b) => b.onclick = () => {
      this.click();
      const r = swapEquip(this.weapon, this.build, b.dataset.slot as AttachSlot, this.pending!, this.level);
      this.pending = null;
      if (r.ok) { this.save(r.build); this.openSlot = null; this.hover = null; }
      this.renderEdit();
    });
    ui.querySelector<HTMLButtonElement>('#gs-cancel')?.addEventListener('click', () => { this.click(); this.pending = null; this.renderEdit(); });
    if (this.openSlot) this.updateDetails();
    (ui.querySelector<HTMLButtonElement>(this.pending ? '.gs-swap' : this.openSlot ? '.gs-opt.on, .gs-opt:not(.locked)' : '.gs-card') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private panelHtml(slot: AttachSlot): string {
    const opts = slotOptions(this.weapon, slot, this.level, this.build);
    const list = opts.map((o) => `<button class="gs-opt ${o.unlocked ? '' : 'locked'} ${o.equipped ? 'on' : ''}" data-att="${o.id}" ${o.unlocked ? '' : 'aria-disabled="true"'}>
      <span class="gs-oname">${esc(o.name)}</span>${o.equipped ? '<span class="gs-tag">equipado</span>' : ''}${o.unlocked ? '' : `<span class="gs-lock">${icon('lock')}Nível ${o.level}</span>`}</button>`).join('');
    return `<div class="gs-panel"><div class="gs-phead">${icon(slot)}<b>${SLOT_LABEL[slot]}</b><button class="btn small" id="gs-pclose">Fechar</button></div>
      <div class="gs-opts">${list}</div><div class="gs-details" id="gs-details"></div>
      <div class="gs-pactions">${this.build[slot] ? '<button class="btn" id="gs-remove">Remover</button>' : ''}</div></div>`;
  }

  /** Prós/contras e barras de atributos (atual × seleção). */
  private updateDetails() {
    const box = this.root.querySelector('#gs-details');
    if (!box || !this.openSlot) return;
    const slot = this.openSlot, att = this.hover ?? this.build[slot];
    if (!att) { box.innerHTML = '<p class="muted">Passe o mouse sobre uma peça para ver o efeito.</p>'; return; }
    const o = slotOptions(this.weapon, slot, this.level, this.build).find((x) => x.id === att)!;
    const next = { ...this.build, [slot]: att };
    const cmp = compareStats(this.weapon, this.build, next);
    const bars = cmp.map((c) => {
      const lo = Math.min(c.current, c.next), hi = Math.max(c.current, c.next), cls = c.delta > 0.5 ? 'up' : c.delta < -0.5 ? 'down' : '';
      return `<div class="gs-stat"><span>${c.stat}</span><div class="gs-sbar"><i class="base" style="width:${lo.toFixed(1)}%"></i>${cls ? `<i class="${cls}" style="left:${lo.toFixed(1)}%;width:${(hi - lo).toFixed(1)}%"></i>` : ''}</div></div>`;
    }).join('');
    box.innerHTML = `<div class="gs-dname">${esc(o.name)}${o.unlocked ? '' : ` <span class="gs-lock">${icon('lock')}Nível ${o.level}</span>`}</div>
      <ul class="gs-pros">${o.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><ul class="gs-cons">${o.cons.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <div class="gs-stats">${bars}</div>`;
  }

  private limitHtml(att: string): string {
    const b = this.build, eq = ATTACH_SLOTS.filter((s) => b[s]);
    return `<div class="gs-modal" role="dialog"><div class="gs-mcard"><h3>Limite de ${MAX_ATTACHMENTS} attachments</h3>
      <p>Para equipar <b>${esc(ATTACHMENTS[att].name)}</b>, remova uma peça:</p>
      <div class="gs-mlist">${eq.map((s) => `<button class="btn gs-swap" data-slot="${s}">${icon(s)} ${SLOT_LABEL[s]} · ${esc(ATTACHMENTS[b[s]!].name)}</button>`).join('')}</div>
      <button class="btn" id="gs-cancel">Cancelar</button></div></div>`;
  }

  // ------------------------------------------------------------------ 3D e linhas

  private mesh(w: ProgWeaponId, b: Build) {
    const key = buildKey(w, b);
    let c = this.cache.get(key);
    if (!c) { const g = weaponGeometry(w, 'view', b); c = { mesh: this.r.createMesh(g.toArray()), tris: g.triCount }; this.cache.set(key, c); }
    return c;
  }

  /** Ponto de montagem projetado na tela (px CSS). */
  projectSlot(slot: AttachSlot): { x: number; y: number } | null {
    const p = slotPoint(this.weapon, slot, this.shownBuild()), M = this.model;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], z = M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14];
    const s = this.r.project(x, y, z);
    return s ? { x: s.x, y: s.y } : null;
  }

  /** Linhas atuais (card → ponto da arma), para os testes. */
  lines(): { slot: AttachSlot; card: { x: number; y: number }; point: { x: number; y: number } }[] {
    const out: { slot: AttachSlot; card: { x: number; y: number }; point: { x: number; y: number } }[] = [];
    if (this.screen !== 'edit' || !this.el) return out;
    for (const card of this.root.querySelectorAll<HTMLElement>('.gs-card.on')) {
      const slot = card.dataset.slot as AttachSlot, rc = card.getBoundingClientRect(), pt = this.projectSlot(slot);
      if (!pt || rc.width === 0) continue;
      const top = rc.top + rc.height / 2 < pt.y;
      out.push({ slot, card: { x: rc.left + rc.width / 2, y: top ? rc.bottom : rc.top }, point: pt });
    }
    return out;
  }

  frame(dt: number) {
    this.time += dt;
    const W = this.r.canvas.clientWidth, H = this.r.canvas.clientHeight, narrow = W < 760;
    const fov = 0.62;
    const w = this.screen === 'edit' ? this.weapon : this.weapon;
    if (this.screen === 'list') {
      const b = weaponGeometry(w, 'view').bounds();
      this.center = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      this.size = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    }
    const d = (this.size * 0.5) / Math.tan(fov / 2) * (this.screen === 'list' ? 1.6 : narrow ? 1.25 : 1.05);
    // a arma fica no centro-direita (a câmera vai um pouco para a esquerda); em tela estreita, no alto
    const camX = this.screen === 'list' ? 0 : narrow ? 0 : -this.size * 0.12, camY = this.screen === 'list' ? this.size * 0.55 : narrow ? -this.size * 0.3 : -this.size * 0.02;
    this.r.beginFrame({ x: camX, y: camY, z: d, yaw: 0, pitch: 0, roll: 0, fovY: fov }, this.time, BG);
    this.r.setLight([-0.45, 0.8, 0.6]);
    // padrão de fundo num plano atrás da arma, cobrindo a tela
    if (!this.pattern) this.pattern = this.r.createMesh(patternGeometry().toArray());
    const back = this.size * 1.2, span = (d + back) * Math.tan(fov / 2) * 1.25;
    this.r.drawMesh(this.pattern, trs(mat4(), camX, camY, -back, 0, 0, 0, span), {});
    const t = this.still ? 0 : this.time;
    const sway = this.screen === 'list' ? t * 0.35 : Math.sin(t * 0.6) * 0.06;
    const yaw = Math.PI / 2 + this.dragYaw + sway, pitch = this.dragPitch + (this.still ? 0 : Math.sin(t * 0.45) * 0.025);
    const base = trs(mat4(), 0, 0, 0, yaw, pitch, 0);
    this.model = child(this.model, base, -this.center[0], -this.center[1], -this.center[2]);
    const shown = this.screen === 'edit' ? this.shownBuild() : sanitizeBuild(w, this.data.builds[w], levelInfo(w, this.data.xp[w]).level);
    if (!(this.screen === 'list' && narrow)) this.r.drawMesh(this.mesh(w, shown).mesh, this.model, { cull: true });
    if (this.screen === 'edit') this.layout(W, H, narrow);
  }

  /** Posiciona os cards (em volta da arma) e desenha as linhas até os pontos de montagem. */
  private layout(W: number, H: number, narrow: boolean) {
    const svg = this.root.querySelector('#gs-lines')!;
    const cards = [...this.root.querySelectorAll<HTMLElement>('.gs-card')];
    if (narrow) { svg.innerHTML = ''; for (const c of cards) { c.style.left = ''; c.style.top = ''; } return; }
    const cw = Math.min(170, Math.max(120, W * 0.13)), gap = 10;
    this.cardW = cw;
    for (const c of cards) c.style.visibility = '';
    const rows: [AttachSlot[], number][] = [[TOP, H * 0.13], [BOTTOM, H * 0.6]];
    // os cards ficam parados (posição calculada uma vez por arma/tamanho de tela); só as linhas acompanham o giro
    const key = `${this.weapon}:${W}x${H}`;
    if (key !== this.layoutKey) { this.layoutKey = key; this.cardPos.clear(); }
    for (const [order, y] of rows) {
      const fixed = cards.filter((c) => order.includes(c.dataset.slot as AttachSlot)).every((c) => this.cardPos.has(c.dataset.slot as AttachSlot));
      if (fixed) {
        for (const c of cards) { const p = this.cardPos.get(c.dataset.slot as AttachSlot); if (p && order.includes(c.dataset.slot as AttachSlot)) { c.style.left = `${p.x.toFixed(1)}px`; c.style.top = `${p.y.toFixed(1)}px`; c.style.width = `${cw}px`; } }
        continue;
      }
      const row = cards.filter((c) => order.includes(c.dataset.slot as AttachSlot)).map((c) => ({ c, slot: c.dataset.slot as AttachSlot, x: this.projectSlot(c.dataset.slot as AttachSlot)?.x ?? W / 2 }));
      row.sort((a, b) => a.x - b.x);
      // espalha sem sobrepor, perto do ponto da peça, dentro da tela
      const xs = row.map((r) => r.x - cw / 2);
      const minX = W * 0.2, maxX = W - 16 - cw;
      for (let i = 0; i < xs.length; i++) xs[i] = Math.max(i ? xs[i - 1] + cw + gap : minX, Math.min(maxX, xs[i]));
      for (let i = xs.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - cw - gap);
      row.forEach((r, i) => {
        const x = xs[i];
        this.cardPos.set(r.slot, { x, y, top: order === TOP });
        r.c.style.left = `${x.toFixed(1)}px`; r.c.style.top = `${y.toFixed(1)}px`; r.c.style.width = `${cw}px`;
      });
    }
    // linhas finas: do card até o ponto da arma (projetado a cada quadro)
    // os elementos da linha são reaproveitados (só os atributos mudam a cada quadro)
    const ls = this.lines(), NS = 'http://www.w3.org/2000/svg';
    while (svg.childElementCount < ls.length * 2) { svg.appendChild(document.createElementNS(NS, 'path')); svg.appendChild(document.createElementNS(NS, 'circle')); }
    while (svg.childElementCount > ls.length * 2) svg.lastElementChild!.remove();
    ls.forEach((l, i) => {
      const path = svg.children[i * 2], dot = svg.children[i * 2 + 1];
      const my = (l.card.y + l.point.y) / 2;
      path.setAttribute('d', `M${l.card.x.toFixed(1)},${l.card.y.toFixed(1)} L${l.card.x.toFixed(1)},${my.toFixed(1)} L${l.point.x.toFixed(1)},${l.point.y.toFixed(1)}`);
      path.setAttribute('data-slot', l.slot);
      dot.setAttribute('cx', l.point.x.toFixed(1)); dot.setAttribute('cy', l.point.y.toFixed(1)); dot.setAttribute('r', '3.2');
    });
  }
}
