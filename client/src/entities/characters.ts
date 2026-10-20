// =============================================================
//  Personagens no estilo de blocos (rodada 11b), sem GL: só MeshBuilder.
//  Peças e pivôs iguais aos de antes (as animações e o xray do PREDATOR dependem disso):
//    pernas: pivô no quadril (y = 32 no mundo, x = ±6), malha de y −32 a 0
//    torso: pivô no quadril, malha de y 0 a 25 (o pescoço fica em y 25 do torso = 57 no mundo)
//    cabeça: pivô no pescoço, malha de y 0 a ~16
//    braços: pivô no ombro, malha de y −27 a ~2
//  O volume do corpo e da cabeça acompanha o hitbox (corpo ±14 × ±14 até y 55; cabeça ±9 de 55 a 73).
//  Cor do time em placas grandes (colete, capacete, ombreiras, braçadeira); cor da classe como destaque.
// =============================================================
import { MeshBuilder } from '../render/mesh';
import type { ClassId } from '../../../shared/config/classes';
import { CLASSES } from '../../../shared/config/classes';
import type { Team } from '../../../shared/maps/types';
import { GLOVE, ITEM_STYLE, shade } from './style';

export const TEAM_COLORS: Record<Team, number> = { blue: 0x2f7bff, red: 0xff4757 };
export const TEAM_DARK: Record<Team, number> = { blue: 0x1d3f8f, red: 0x8f1f2b };

/** Cores comuns do uniforme (fosco). */
export const CHAR_STYLE = {
  suit: 0x464c56,
  suitDark: 0x353a43,
  pad: 0x2b2f37,
  boot: 0x24272d,
  sole: 0x4a4f58,
  face: 0x2a2d33,
  visor: 0x18202c,
  metal: 0x5a5f68,
  bolt: ITEM_STYLE.bolt,
};

export type CharPart = 'legL' | 'legR' | 'torso' | 'head' | 'armL' | 'armR';
export type CharLod = 'near' | 'mid' | 'far';

/** Distâncias (u) das versões dos personagens: perto até `near`, média até `mid`, longe depois. */
export const CHAR_LOD_DIST = { near: 400, mid: 1400 };

/** Orçamento de triângulos de um personagem inteiro (6 peças). */
export const CHAR_BUDGET = { near: 2500, mid: 900, far: 450 };

/** Onde cada peça fica na pose de descanso (igual a Game.drawCharacter): posição do pivô e rotação. */
export const CHAR_PIVOTS: Record<CharPart, { t: [number, number, number]; rot?: [number, number, number] }> = {
  legL: { t: [-6, 32, 0] }, legR: { t: [6, 32, 0] },
  torso: { t: [0, 32, 0] }, head: { t: [0, 57, 0] },
  armL: { t: [-13, 54, -1], rot: [-0.25, -0.45, 0] }, armR: { t: [15, 54, -1], rot: [-0.25, 0, 0] },
};

interface Ctx { m: MeshBuilder; team: number; dark: number; cls: number; hi: boolean; lo: boolean }

function leg(c: Ctx, side: -1 | 1, clsId: ClassId) {
  const { m, hi } = c, S = CHAR_STYLE;
  m.chamferBox(-4.8, -16, -5.6, 4.8, 0, 5.6, S.suit, 1.0, 'y');               // coxa
  m.chamferBox(-4.3, -27, -5, 4.3, -15.5, 5, S.suit, 0.9, 'y');              // canela
  m.chamferBox(-3.9, -20, -6.7, 3.9, -12.5, -4.6, S.pad, 0.6, 'z');          // joelheira
  m.chamferBox(-5.2, -32, -8.4, 5.2, -25.5, 5.8, S.boot, 0.9, 'x');          // bota
  if (hi) {
    m.bolt([0, -16.2, -6.7], '-z', 0.5, S.bolt);
    m.box(-5.3, -32, -8.5, 5.3, -31, 5.9, S.sole);                          // sola
    m.chamferBox(-5.35, -28.4, -8.5, 5.35, -27.3, 5.9, S.pad, 0.3, 'x');      // tira da bota
    // bolso na coxa (lado de fora) e faixa do time na canela
    m.chamferBox(side > 0 ? 4.6 : -6.1, -12.5, -3.2, side > 0 ? 6.1 : -4.6, -5.5, 3.2, S.suitDark, 0.5, 'x');
  }
  m.tapeBox('y', -4.3, -24.5, -5, 4.3, -22.5, 5, c.team, 1);
  if (clsId === 'runner') {
    // aletas aerodinâmicas na panturrilha
    m.prism('x', [[5, -26], [9.5, -22], [9.5, -19], [5, -17]], -0.7, 0.7, c.cls);
  }
}

function torso(c: Ctx, clsId: ClassId) {
  const { m, hi } = c, S = CHAR_STYLE;
  m.chamferBox(-11, 0, -7.5, 11, 23, 7.5, S.suit, 1.2, 'y');                 // tronco
  m.chamferBox(-10.6, 3.6, -10.2, 10.6, 22, 10.2, c.dark, 1.6, 'y');          // colete
  // placas grandes na cor do time (frente, costas e laterais)
  m.chamferBox(-8.6, 9, -11.6, 8.6, 21.2, -9.8, c.team, 1.0, 'z');
  m.chamferBox(-8.6, 9, 9.8, 8.6, 21.2, 11.6, c.team, 1.0, 'z');
  for (const s of [-1, 1]) m.chamferBox(s > 0 ? 10.4 : -11.8, 6, -6, s > 0 ? 11.8 : -10.4, 18, 6, c.team, 0.7, 'x');
  // cinto com compartimentos
  m.chamferBox(-12, 0, -8.6, 12, 3.6, 8.6, S.pad, 0.8, 'y');
  m.chamferBox(-1.6, 0.4, -9.1, 1.6, 3.2, -8.5, S.metal, 0.3, 'z');          // fivela
  // emblema da classe no peito
  m.chamferBox(-2.8, 15.5, -12.1, 2.8, 19.2, -11.5, c.cls, 0.5, 'z');
  // gola
  m.chamferBox(-6.5, 22, -6.5, 6.5, 25, 6.5, S.suitDark, 1.2, 'y');
  if (hi) {
    for (const x of [-7.6, 7.6]) for (const y of [10, 20.2]) { m.bolt([x, y, -11.6], '-z', 0.42, S.bolt); m.bolt([x, y, 11.6], '+z', 0.42, S.bolt); }
    for (const x of [-6.8, -2.3, 2.3, 6.8]) {                               // bolsos da frente
      m.chamferBox(x - 1.9, 4.2, -11.4, x + 1.9, 8.6, -10, S.pad, 0.4, 'z');
      m.chamferBox(x - 2, 7.6, -11.6, x + 2, 8.8, -10, shade(S.pad, 1.25), 0.3, 'z');
    }
    for (const s of [-1, 1]) m.chamferBox(s * 11.5 - 1.5, 0.3, -4, s * 11.5 + 1.5, 3.3, 4, S.suitDark, 0.4, 'x'); // compartimentos do cinto
    for (const s of [-1, 1]) m.box(s > 0 ? 3 : -5, 18, -10.6, s > 0 ? 5 : -3, 24.5, -9.6, S.pad); // alças
  }
  // identidade da classe nas costas / ombros
  if (clsId === 'runner') {
    for (const s of [-1, 1]) m.group([s * 6, 0, 0], null, () => m.prism('x', [[11.6, 12], [15.6, 22], [15.6, 27.5], [11.6, 21]], -0.8, 0.8, c.cls));
    if (hi) m.tube('z', [0, 13, 0], 1.6, 11.6, 13.4, S.metal, 8);
  } else if (clsId === 'berserker') {
    // ombreiras pesadas presas no colete
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 9 : -16, x1 = s > 0 ? 16 : -9;
      m.chamferBox(x0, 17, -9.5, x1, 26.5, 9.5, S.pad, 1.4, 'z');
      m.chamferBox(x0 - 0.2, 24.8, -9.7, x1 + 0.2, 26.9, 9.7, c.cls, 0.8, 'z');
      if (hi) for (const z of [-5.5, 0, 5.5]) m.bolt([s * 12.5, 26.9, z], '+y', 0.5, S.bolt);
    }
  } else if (clsId === 'predator') {
    // espinhos na coluna
    for (let i = 0; i < 4; i++) m.group([0, 6 + i * 4.6, 11.6], null, () => m.prism('x', [[0, 0], [3.6, 1.2], [0, 3.2]], -0.9, 0.9, c.cls));
  } else if (clsId === 'jumper') {
    // núcleo giroscópico nas costas
    m.tube('z', [0, 14, 0], 3.4, 11.6, 14.6, S.metal, 8);
    m.tube('z', [0, 14, 0], 2.2, 14.6, 15.4, c.cls, 8, { emissive: 0.5 });
    m.torus(0, 14, 13.1, 5.2, 0.7, hi ? 12 : 8, 4, c.cls, 0);
  }
}

function head(c: Ctx, clsId: ClassId) {
  const { m, hi } = c, S = CHAR_STYLE;
  m.chamferBox(-5.4, -1, -5.4, 5.4, 6, 5.4, S.suitDark, 1.0, 'y');            // pescoço
  m.chamferBox(-6.6, 2, -7.2, 6.6, 10, 6.6, S.face, 1.2, 'y');               // balaclava
  m.chamferBox(-8, 8, -8.5, 8, 15.4, 8.2, c.team, 1.8, 'y');                 // capacete (cor do time)
  m.chamferBox(-6.6, 15.4, -7.1, 6.6, 16.3, 6.8, c.team, 1.4, 'y');          // topo do capacete
  m.chamferBox(-8.5, 7.8, -9, 8.5, 9, 8.7, c.dark, 1.9, 'y');                // aba
  m.chamferBox(-6.4, 9.2, -9.4, 6.4, 12.8, -8.2, S.visor, 0.4, 'z');         // viseira
  for (const s of [-1, 1]) m.tube('x', [0, 9.5, 0.8], 2.3, s * 7.8, s * 9.2, S.pad, 8); // protetores de ouvido
  if (clsId === 'predator') {
    // visor de caçador: duas fendas na cor da classe e chifres/antenas
    for (const s of [-1, 1]) m.group([s * 3.1, 11, -9.45], [0, 0, s * 0.25], () => m.box(-2, -0.45, -0.1, 2, 0.45, 0.1, c.cls, 0.8));
    for (const s of [-1, 1]) m.group([s * 6.2, 15, -1], [0, 0, -s * 0.35], () => m.prism('z', [[-0.9, 0], [0.9, 0], [0, 2.6]], -0.9, 0.9, shade(c.cls, 0.75)));
  } else {
    m.box(-6.2, 12.1, -9.55, 6.2, 12.6, -9.3, c.cls, 0.55);                  // faixa da classe na viseira
  }
  if (hi) {
    for (const s of [-1, 1]) m.bolt([s * 8, 12.5, 2.5], s > 0 ? '+x' : '-x', 0.45, S.bolt);
    m.chamferBox(-1.5, 13.4, -9.4, 1.5, 15, -8.3, S.metal, 0.3, 'z');         // suporte frontal
  }
  if (clsId === 'runner') m.tapeBox('y', -8, 13, -8.5, 8, 14.4, 8.2, c.cls, 1);
  else if (clsId === 'berserker') m.prism('z', [[-1.4, 16.3], [1.4, 16.3], [0.6, 17.6], [-0.6, 17.6]], -6, 7, c.cls);
  else if (clsId === 'jumper') m.group([0, 16.6, 0], [Math.PI / 2, 0, 0], () => m.torus(0, 0, 0, 6.6, 0.55, hi ? 14 : 8, 4, c.cls, 0.3));
}

function arm(c: Ctx) {
  const { m, hi } = c, S = CHAR_STYLE, G = GLOVE;
  m.chamferBox(-4.6, -6, -5.2, 4.6, 1.2, 5.2, c.dark, 1.0, 'y');             // ombreira
  m.chamferBox(-4.9, -0.6, -5.5, 4.9, 2, 5.5, c.team, 1.0, 'y');             // placa do time em cima
  m.chamferBox(-3.4, -14.5, -3.6, 3.4, -5, 3.6, S.suit, 0.8, 'y');           // braço
  m.tapeBox('y', -3.4, -12, -3.6, 3.4, -8.5, 3.6, c.team, hi ? 2 : 1);       // braçadeira
  m.chamferBox(-3.2, -22, -3.4, 3.2, -14, 3.4, S.suit, 0.8, 'y');            // antebraço
  if (hi) m.chamferBox(-3.5, -20.5, -3.7, 3.5, -15.5, -2.8, S.pad, 0.4, 'z'); // protetor
  // luva igual à do viewmodel
  m.chamferBox(-3.5, -27, -3.7, 3.5, -21.4, 3.7, G.base, 0.7, 'y');
  m.chamferBox(-3.2, -26, -4.1, 3.2, -22.5, -3.6, G.plate, 0.3, 'z');
  m.tapeBox('y', -3.5, -22.4, -3.7, 3.5, -21.2, 3.7, c.dark, 1); // fita do pulso na cor escura do time
  if (hi) m.bolt([4.6, -2, 0], '+x', 0.45, S.bolt);
}

/** Versão "longe": só blocos com as cores (time, classe, uniforme). */
function farPart(c: Ctx, part: CharPart, clsId: ClassId) {
  const { m } = c, S = CHAR_STYLE;
  switch (part) {
    case 'legL': case 'legR':
      m.box(-4.6, -27, -5.4, 4.6, 0, 5.4, S.suit); m.box(-5, -32, -8, 5, -27, 5.6, S.boot); m.box(-4.4, -24.5, -5.1, 4.4, -22.5, 5.1, c.team); break;
    case 'torso':
      m.box(-10.6, 0, -10.2, 10.6, 22, 10.2, c.dark); m.box(-8.6, 9, -11.6, 8.6, 21.2, 11.6, c.team); m.box(-12, 0, -8.6, 12, 3.6, 8.6, S.pad);
      m.box(-6.5, 22, -6.5, 6.5, 25, 6.5, S.suitDark);
      if (clsId === 'berserker') { m.box(-16, 17, -9.5, -9, 26.5, 9.5, S.pad); m.box(9, 17, -9.5, 16, 26.5, 9.5, S.pad); }
      else if (clsId === 'runner') m.box(-6.8, 12, 11.6, 6.8, 26, 15.6, c.cls);
      else if (clsId === 'jumper') m.box(-3.4, 10.6, 11.6, 3.4, 17.4, 15.4, c.cls);
      else m.box(-0.9, 6, 11.6, 0.9, 22, 15, c.cls);
      break;
    case 'head':
      m.box(-6.6, -1, -7.2, 6.6, 10, 6.6, S.face); m.box(-8, 8, -8.5, 8, 16.3, 8.2, c.team); m.box(-6.4, 9.2, -9.4, 6.4, 12.8, -8.2, S.visor);
      m.box(-6.2, 12.1, -9.55, 6.2, 12.6, -9.3, c.cls, 0.55); break;
    case 'armL': case 'armR':
      m.box(-4.8, -6, -5.4, 4.8, 2, 5.4, c.team); m.box(-3.4, -22, -3.6, 3.4, -6, 3.6, S.suit); m.box(-3.5, -27, -3.7, 3.5, -22, 3.7, GLOVE.base);
      m.box(-3.5, -12, -3.7, 3.5, -8.5, 3.7, c.team); break;
  }
}

/** As seis peças de um personagem (cada uma no seu pivô). */
export function characterGeometry(team: Team, cls: ClassId, lod: CharLod = 'near'): Record<CharPart, MeshBuilder> {
  const parts = {} as Record<CharPart, MeshBuilder>;
  for (const part of Object.keys(CHAR_PIVOTS) as CharPart[]) {
    const m = new MeshBuilder();
    const c: Ctx = { m, team: TEAM_COLORS[team], dark: TEAM_DARK[team], cls: CLASSES[cls].color, hi: lod === 'near', lo: lod !== 'near' };
    if (lod === 'far') { m.minChamfer = 99; farPart(c, part, cls); }
    else if (lod === 'mid') {
      // média distância: as mesmas peças sem parafusos, bolsos e chanfros pequenos
      m.minChamfer = 1.3;
      if (part === 'legL' || part === 'legR') leg(c, part === 'legL' ? -1 : 1, cls);
      else if (part === 'torso') torso(c, cls);
      else if (part === 'head') head(c, cls);
      else arm(c);
    }
    else if (part === 'legL' || part === 'legR') leg(c, part === 'legL' ? -1 : 1, cls);
    else if (part === 'torso') torso(c, cls);
    else if (part === 'head') head(c, cls);
    else arm(c);
    parts[part] = m;
  }
  return parts;
}

/** Personagem montado na pose de descanso (Arsenal e testes). `noArms` deixa os braços de fora. */
export function characterAssembled(team: Team, cls: ClassId, lod: CharLod = 'near', noArms = false): MeshBuilder {
  const parts = characterGeometry(team, cls, lod), out = new MeshBuilder();
  for (const part of Object.keys(CHAR_PIVOTS) as CharPart[]) {
    if (noArms && (part === 'armL' || part === 'armR')) continue;
    const pv = CHAR_PIVOTS[part];
    out.group(pv.t, pv.rot ?? null, () => {
      const d = parts[part].data;
      for (let i = 0; i < d.length; i += 30) {
        const P = (k: number): [number, number, number] => [d[i + k * 10], d[i + k * 10 + 1], d[i + k * 10 + 2]];
        out.tri(P(0), P(1), P(2), [d[i + 6], d[i + 7], d[i + 8]], d[i + 9]);
      }
    });
  }
  return out;
}

