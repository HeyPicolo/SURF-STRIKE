// Animações da arma em primeira pessoa (puramente visuais, só no cliente).
// Cada animação é uma lista de quadros-chave interpolados com suavização.

export interface ViewPose {
  /** deslocamento da arma (unidades da câmera) */
  ox: number; oy: number; oz: number;
  /** rotação extra da arma inteira (rad) */
  yaw: number; pitch: number; roll: number;
  /** faca borboleta: ângulo da lâmina e do cabo "bite" em relação ao cabo "safe" (0 = aberta) */
  blade: number; bite: number;
}

export const REST: ViewPose = { ox: 0, oy: 0, oz: 0, yaw: 0, pitch: 0, roll: 0, blade: 0, bite: 0 };

type Key = [number, Partial<ViewPose>];

const PI = Math.PI, TAU = Math.PI * 2;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Expande quadros parciais (campos ausentes herdam o quadro anterior). */
function track(keys: Key[]): { t: number; p: ViewPose }[] {
  let prev: ViewPose = { ...REST };
  return keys.map(([t, k]) => { prev = { ...prev, ...k }; return { t, p: prev }; });
}

function sample(tr: { t: number; p: ViewPose }[], t: number): ViewPose {
  if (t <= tr[0].t) return tr[0].p;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (t <= b.t) {
      const k = smooth((t - a.t) / (b.t - a.t));
      const out = { ...a.p };
      for (const key of Object.keys(out) as (keyof ViewPose)[]) out[key] = a.p[key] + (b.p[key] - a.p[key]) * k;
      return out;
    }
  }
  return tr[tr.length - 1].p;
}

// Sacar a borboleta: sobe fechada, o cabo "bite" se solta e a lâmina dá a volta até abrir.
const BF_DRAW = track([
  [0.0, { oy: -7, oz: 2, roll: -1.3, blade: PI, bite: 0 }],
  [0.16, { oy: -2, oz: 1, roll: -0.6, blade: PI, bite: PI * 0.9 }],
  [0.38, { oy: -0.5, oz: 0, roll: -0.15, blade: TAU, bite: TAU }],
  [0.55, { oy: 0, roll: 0, blade: TAU, bite: TAU }],
]);
export const BF_DRAW_TIME = 0.55;

// Inspecionar a borboleta: traz para a frente, fecha e abre duas vezes,
// gira no eixo da lâmina e mostra a ponta antes de voltar.
const BF_INSPECT = track([
  [0.0, {}],
  [0.35, { ox: -3.5, oy: 2.5, oz: 0.5, yaw: 0.55, roll: 0.35 }],
  [0.6, { bite: PI }],
  [0.88, { blade: PI, bite: TAU }],                 // fechada
  [1.12, { bite: TAU + PI, roll: 0.35 + PI }],      // o cabo sai girando
  [1.42, { blade: TAU, bite: 2 * TAU, roll: 0.35 + TAU }], // abre de novo
  [1.95, { roll: 0.35 + 2 * TAU }],                 // giro completo no eixo da lâmina
  [2.35, { pitch: 0.9, yaw: 0.2, oy: 3.5 }],        // ponta para cima
  [2.7, { ox: 0, oy: 0, oz: 0, yaw: 0, pitch: 0, roll: 2 * TAU }],
]);
export const BF_INSPECT_TIME = 2.7;

// Inspecionar armas de fogo: vira de lado, mostra o topo e volta.
const GUN_INSPECT = track([
  [0.0, {}],
  [0.4, { ox: -4, oy: 2, oz: 1, yaw: 0.95, roll: -0.35 }],
  [1.1, { yaw: 1.05, roll: -0.25, pitch: 0.12 }],
  [1.5, { yaw: -0.25, roll: 0.85, pitch: 0.25, ox: -3, oy: 3 }],
  [2.0, { yaw: -0.2, roll: 0.75 }],
  [2.35, { ox: 0, oy: 0, oz: 0, yaw: 0, pitch: 0, roll: 0 }],
]);
export const GUN_INSPECT_TIME = 2.35;

// Granada: joga de uma mão para outra girando.
const NADE_INSPECT = track([
  [0.0, {}],
  [0.3, { ox: -5, oy: 3, roll: PI }],
  [0.7, { ox: -2, oy: 5, roll: TAU, pitch: 1 }],
  [1.1, { ox: 0, oy: 0, roll: TAU * 1.5, pitch: 0 }],
  [1.4, { roll: TAU * 2 }],
]);
export const NADE_INSPECT_TIME = 1.4;

export function butterflyDraw(t: number): ViewPose { return sample(BF_DRAW, t); }
export function butterflyInspect(t: number): ViewPose { return sample(BF_INSPECT, t); }
export function gunInspect(t: number): ViewPose { return sample(GUN_INSPECT, t); }
export function nadeInspect(t: number): ViewPose { return sample(NADE_INSPECT, t); }
