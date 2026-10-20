// Animações da arma em primeira pessoa (puramente visuais, só no cliente).
// Cada animação é uma lista de quadros-chave interpolados com suavização (smoothstep por trecho);
// o começo do sacar da balisong usa uma spline com velocidade contínua.

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

/**
 * Spline de Hermite com tangentes de Catmull-Rom (tempos não uniformes): a velocidade é contínua
 * nos quadros-chave (não para e recomeça como o smoothstep por segmento). A velocidade é zero só no
 * primeiro e no último quadro (easing no começo e no fim do trecho inteiro).
 */
function sampleSpline(tr: { t: number; p: ViewPose }[], t: number): ViewPose {
  const n = tr.length;
  if (t <= tr[0].t) return { ...tr[0].p };
  if (t >= tr[n - 1].t) return { ...tr[n - 1].p };
  let i = 1;
  while (t > tr[i].t) i++;
  const a = tr[i - 1], b = tr[i], h = b.t - a.t, u = (t - a.t) / h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  const tan = (j: number, key: keyof ViewPose) => (j === 0 || j === n - 1 ? 0 : (tr[j + 1].p[key] - tr[j - 1].p[key]) / (tr[j + 1].t - tr[j - 1].t));
  const out = { ...a.p };
  for (const key of Object.keys(out) as (keyof ViewPose)[]) out[key] = h00 * a.p[key] + h10 * h * tan(i - 1, key) + h01 * b.p[key] + h11 * h * tan(i, key);
  return out;
}

// Sacar a borboleta (rodada 11): a faca entra fechada na mão, o pulso recua (antecipação) e dá o
// impulso, o cabo "bite" se solta e dá a volta em torno da lâmina num giro contínuo enquanto a
// lâmina abre meia volta; passa um pouco do ponto ao travar aberta e assenta. Até 0,38 s usa a
// spline acima; dali em diante é o final de antes, sem mudança (assentar e voltar à posição).
const BF_DRAW_OPEN = track([
  [0.0, { oy: -4.5, oz: 1.5, roll: -0.9, blade: PI, bite: 0 }],          // fechada, entrando
  [0.07, { oy: -2.8, oz: 1.2, roll: -1.05, blade: PI - 0.1, bite: -0.25 }], // antecipação: pulso recua
  [0.16, { oy: -1.3, oz: 0.7, roll: -0.5, blade: PI + 0.4, bite: PI * 0.85 }], // impulso: o bite se solta
  [0.26, { oy: -0.65, oz: 0.2, roll: -0.22, blade: PI * 1.75, bite: PI * 1.75 }],
  [0.33, { oy: -0.45, oz: 0, roll: -0.12, blade: TAU + 0.14, bite: TAU + 0.1 }], // passa do ponto ao travar
  [0.38, { oy: -0.5, oz: 0, roll: -0.15, blade: TAU, bite: TAU }],       // aberta (igual ao quadro de antes)
]);
const BF_DRAW_SETTLE = track([
  [0.38, { oy: -0.5, oz: 0, roll: -0.15, blade: TAU, bite: TAU }],
  [0.55, { oy: 0, oz: 0, roll: 0, blade: TAU, bite: TAU }],
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

export function butterflyDraw(t: number): ViewPose { return t < 0.38 ? sampleSpline(BF_DRAW_OPEN, t) : sample(BF_DRAW_SETTLE, t); }
export function butterflyInspect(t: number): ViewPose { return sample(BF_INSPECT, t); }
export function gunInspect(t: number): ViewPose { return sample(GUN_INSPECT, t); }
export function nadeInspect(t: number): ViewPose { return sample(NADE_INSPECT, t); }
