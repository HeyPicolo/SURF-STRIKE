// =============================================================
//  Arsenal: tela para revisar os modelos (armas, faca, granadas, itens e luvas) girando sobre um
//  fundo neutro. Setas trocam de modelo, L alterna as versões (detalhado/simplificado/longe), Esc fecha.
//  Abre por ?arsenal na URL ou pelo botão no painel do Treino.
// =============================================================
import type { Renderer, GpuMesh } from '../render/Renderer';
import { trs, child, mat4 } from '../render/glm';
import { MODEL_LIST, Lod, ModelEntry } from '../entities/geometry';
import { TRI_BUDGET, LOD_FAR_DIST } from '../entities/style';

const BG = 0x8d939c;

export class Arsenal {
  active = false;
  idx = 0;
  lod: Lod = 'view';
  /** pausa a rotação (screenshots) e usa este ângulo */
  fixedYaw: number | null = null;
  private time = 0;
  private cache = new Map<string, { mesh: GpuMesh; tris: number; center: [number, number, number]; size: number }>();
  private el: HTMLDivElement | null = null;
  private onClose: () => void = () => {};
  private keyHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.code === 'ArrowRight') { this.show(this.idx + 1); e.preventDefault(); }
    else if (e.code === 'ArrowLeft') { this.show(this.idx - 1); e.preventDefault(); }
    else if (e.code === 'KeyL') { this.toggleLod(); e.preventDefault(); }
    else if (e.code === 'Escape') { this.close(); e.preventDefault(); }
  };

  constructor(private r: Renderer) {}

  get entries(): ModelEntry[] { return MODEL_LIST; }
  get entry(): ModelEntry { return MODEL_LIST[this.idx]; }

  open(onClose: () => void) {
    this.active = true;
    this.onClose = onClose;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'arsenal';
      this.el.innerHTML = `<div class="ars-top"><b>ARSENAL</b><span class="muted">modelos no estilo de blocos</span><button class="btn" id="ars-close">Fechar <span class="kbd">Esc</span></button></div>
        <div class="ars-bottom"><button class="btn" id="ars-prev">◀</button><div class="ars-info"><div id="ars-name"></div><div id="ars-meta" class="muted"></div></div><button class="btn" id="ars-next">▶</button>
        <button class="btn" id="ars-lod"></button></div>`;
      document.body.appendChild(this.el);
      this.el.querySelector<HTMLButtonElement>('#ars-prev')!.onclick = () => this.show(this.idx - 1);
      this.el.querySelector<HTMLButtonElement>('#ars-next')!.onclick = () => this.show(this.idx + 1);
      this.el.querySelector<HTMLButtonElement>('#ars-lod')!.onclick = () => this.toggleLod();
      this.el.querySelector<HTMLButtonElement>('#ars-close')!.onclick = () => this.close();
      window.addEventListener('keydown', this.keyHandler);
    }
    this.el.style.display = 'block';
    this.show(this.idx);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    if (this.el) this.el.style.display = 'none';
    this.onClose();
  }

  show(i: number) {
    const n = MODEL_LIST.length;
    this.idx = ((i % n) + n) % n;
    this.updateInfo();
  }

  setLod(l: Lod) { this.lod = l; this.updateInfo(); }
  /** Próxima versão disponível do modelo atual (detalhado → simplificado → longe). */
  toggleLod() { const ls = this.entry.lods; this.setLod(ls[(ls.indexOf(this.curLod()) + 1) % ls.length]); }
  /** Versão mostrada: a escolhida, se o modelo tiver; senão a principal dele. */
  curLod(): Lod { const ls = this.entry.lods; return ls.includes(this.lod) ? this.lod : ls[0]; }

  /** Modelo atual (cria a malha uma vez). */
  current() {
    const e = this.entry, lod = this.curLod(), key = `${e.id}:${lod}`;
    let c = this.cache.get(key);
    if (!c) {
      const mb = e.build(lod), b = mb.bounds();
      c = {
        mesh: this.r.createMesh(mb.toArray()), tris: mb.triCount,
        center: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2],
        size: Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]),
      };
      this.cache.set(key, c);
    }
    return c;
  }

  info() {
    const e = this.entry, c = this.current();
    return { idx: this.idx, count: MODEL_LIST.length, id: e.id, name: e.name, kind: e.kind, lod: this.curLod(), lods: e.lods, tris: c.tris, budget: TRI_BUDGET[e.kind === 'item' && this.curLod() !== 'far' ? 'world' : this.curLod()] };
  }

  private updateInfo() {
    if (!this.el) return;
    const e = this.entry, c = this.current();
    const inf = this.info(), lod = inf.lod;
    const where = { view: 'primeira pessoa', world: 'chão / terceira pessoa', far: `a mais de ${LOD_FAR_DIST} u` }[lod];
    this.el.querySelector('#ars-name')!.textContent = `${this.idx + 1}/${MODEL_LIST.length} · ${e.name}`;
    this.el.querySelector('#ars-meta')!.textContent = `${c.tris} triângulos (orçamento ${inf.budget}) · ${where}`;
    const lb = this.el.querySelector<HTMLButtonElement>('#ars-lod')!;
    const label = { view: 'Detalhado', world: e.kind === 'item' ? 'Completo' : 'Simplificado', far: 'Longe' }[lod];
    lb.innerHTML = e.lods.length > 1 ? `${label} <span class="kbd">L</span>` : 'Versão única';
    lb.disabled = e.lods.length < 2;
  }

  frame(dt: number) {
    this.time += dt;
    const c = this.current();
    const fov = 0.62, d = (c.size * 0.5) / Math.tan(fov / 2); // cabe a esfera envolvente
    this.r.beginFrame({ x: 0, y: d * 0.18, z: d, yaw: 0, pitch: -0.18, roll: 0, fovY: fov }, this.time, BG);
    this.r.setLight([-0.45, 0.85, 0.55]); // luz de estúdio: de cima, à esquerda, pela frente
    const yaw = this.fixedYaw ?? this.time * 0.6;
    const e = this.entry;
    // armas: vistas de lado (frente para a esquerda), com leve inclinação
    const base = trs(mat4(), 0, 0, 0, yaw + (e.kind === 'weapon' || e.kind === 'knife' || e.kind === 'glove' ? Math.PI / 2 : 0), 0, 0);
    const m = child(mat4(), base, -c.center[0], -c.center[1], -c.center[2]);
    this.r.drawMesh(c.mesh, m, { cull: true });
  }
}
