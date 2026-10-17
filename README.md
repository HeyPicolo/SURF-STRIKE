# SURF STRIKE

FPS 3D competitivo para navegador, inspirado no Combat Surf: duas equipes, rampas de surf com física no estilo Source, armas espalhadas pelo mapa, classes com poderes e rounds de eliminação. Visual low-poly original, sobre um mar de nuvens.

Tudo aqui é original: modelos gerados por código, sons sintetizados com WebAudio, mapa CLOUDS desenhado para as trajetórias de surf da física implementada.

## Requisitos

- Node.js 18 ou superior
- Chrome, Edge ou Firefox recentes com WebGL2 (aceleração de hardware ativa)

## Como instalar e rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173 (rebuild automático)
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | Testes automáticos: física de movimento, mapa navegável, dano, cooldowns, máquina de estados, partida completa de bots |
| `npm run typecheck` | Checagem de tipos TypeScript |
| `npm run build` | Build de produção em `dist/` (sirva a pasta com qualquer servidor estático) |
| `npm run build:single` | Gera `dist/surf-strike.html`, o jogo inteiro em um único arquivo |
| `npm run test:e2e` | Teste de navegador dos fluxos principais (requer `playwright-core` e um Chrome; use `CHROME_PATH=...`). Rode `npm run build` antes |

## Como jogar

No menu: **Jogar contra bots** (escolha 1v1 a 5v5, dificuldade, equipe e classe) ou **Treinamento** (sozinho, com alvos, voo e checkpoints). Clique na arena para capturar o mouse; **Esc** pausa.

### Surf em 30 segundos

1. Saia da plataforma de spawn e caia sobre uma face inclinada de rampa.
2. Olhe ao longo da rampa e **segure A ou D na direção da rampa** (a tecla que "empurra" você contra ela). Não use W: no ar, W não acelera.
3. A gravidade faz você ganhar velocidade descendo a rampa. A velocidade aparece abaixo da mira.
4. Para curvar no ar (air-strafe): segure A e gire o mouse para a esquerda (ou D + direita), suavemente.
5. Segure Espaço para bunny hop automático (pode ser desligado em Configurações).

### Controles

| Tecla | Ação |
|---|---|
| W A S D | Movimento (A/D para surfar e fazer air-strafe) |
| Mouse | Câmera e mira |
| Clique esquerdo | Atirar / lançar granada |
| Clique direito | Zoom (rifle e sniper) / lançamento curto de granada |
| Espaço | Pular / bunny hop |
| Shift | Agachar |
| R | Recarregar |
| E | Pegar arma |
| Q | Habilidade da classe |
| G | Soltar arma |
| 1 / 2 / 3 | Primária / pistola / granadas (3 de novo alterna o tipo) |
| Tab | Placar |
| Esc | Pausa e configurações |
| T / V / Z / X | Treino: reiniciar posição / voar / salvar checkpoint / carregar checkpoint |

Todas as teclas podem ser remapeadas em Configurações.

## Regras (Team Elimination)

- Azul contra Vermelho, até 5v5, 100 HP, sem respawn no round.
- Rounds de 90 s. Primeiro a 6 rounds vence.
- Se o tempo acabar, os sobreviventes são levados a arenas 1v1: vida 100, sem colete, sem poderes, mesma arma sorteada para os dois. Quem sobra espera e enfrenta o vencedor de um duelo. Se os duelos também esgotarem o tempo, vence a equipe com mais vida somada.
- Itens e armas voltam ao lugar no início de cada round. Quem morre deixa a arma no chão.

Estados da partida: lobby → seleção → preparação → contagem → round ativo → (duelos) → fim do round → resultado.

## Classes

| Classe | Habilidade (Q) | Passiva |
|---|---|---|
| RUNNER | Dash Aéreo: impulso na direção da mira, 15 s. Abate zera o cooldown | Controle Aéreo: +18% aceleração aérea |
| JUMPER | Teleporte até 1600u no ponto mirado, mantendo o momentum, 20 s | Cansaço: 3 s com −30% de velocidade e −20% de dano no corpo (−8% na cabeça) |
| PREDATOR | Sede de Sangue (8 s): silhuetas inimigas através das paredes e névoa de sangue até o inimigo mais próximo, 25 s. Abate zera o cooldown | Sedento: cada abate dá +8% velocidade e +12% cadência por 12 s (até 3x) |
| BERSERKER | Fúria (8 s): até +70% de dano conforme a vida perdida; abates curam 30. Cooldown 30 s | Recuperação: fora da fúria e 4 s sem combate, regenera 6 HP/s |

Novas classes: adicione a definição em `shared/config/classes.ts` e um handler em `shared/sim/abilities.ts`.

## Mapa CLOUDS

Arena flutuante simétrica no eixo Z (Azul em +Z, Vermelho em −Z):

- **Rota A, Ridge** (verde-água): rampa dupla larga e longa, para iniciantes, termina no platô central.
- **Rota B, Riptide** (magenta): duas rampas estreitas e íngremes em sequência, rápida e arriscada, termina no flanco direito (shotgun, SMG, velocidade).
- **Rota C, Halo** (dourado): rampa longa que leva ao Poleiro elevado, com a sniper e visão do centro.
- Centro com rifle no pódio, pontes aéreas (escudo temporário no meio), jump pads, teletransportadores de volta ao spawn, e uma camada de nuvens embaixo para recuperar quedas, com pads que devolvem cada jogador ao seu spawn.

Cada rota foi validada por simulação: um bot sai do spawn e surfa até a área de combate sem cair (`tests/map.test.ts`).

## Parâmetros

Todos centralizados em `shared/config/`:

- `physics.ts`: gravidade 800, aceleração no chão 10, aceleração aérea 150, teto de wishspeed aéreo 30, atrito 5.2, atrito de surf 0, velocidade máxima 3500/eixo, pulo 302, raio do jogador 16, sensibilidade de movimento, 100 ticks/s.
- `weapons.ts`: dano, multiplicador de headshot, cadência, pente, recarga, spread no chão e no ar, recuo, queda de dano, zoom; granadas e itens.
- `classes.ts`: cooldowns, durações e números das passivas.
- `match.ts`: tempos de round, rounds para vencer, perfis de dificuldade dos bots (reação, velocidade de mira, erro, headshots, uso de habilidades).

## Arquitetura

```
shared/            lógica sem DOM (roda igual no cliente e, futuramente, no servidor)
  math/            vetores, PRNG determinístico
  config/          física, armas, classes, regras
  physics/         brushes convexos, sweep de caixa contínuo (sem tunelamento), movimento estilo Source
  maps/            CLOUDS (geometria, pickups, triggers, rotas de bots, arenas de duelo)
  sim/             World autoritativo: jogadores, combate hitscan, granadas, pickups, habilidades, máquina de estados
  bots/            IA que gera o mesmo input de um humano (olhar + teclas)
client/
  index.html, styles.css
  src/render/      renderizador WebGL2 próprio (low-poly flat shading, céu, névoa, partículas)
  src/maps/        mesh estática do mapa
  src/entities/    modelos de personagens, armas e pickups
  src/game/        loop (timestep fixo 100 Hz + render interpolado), input, efeitos, configurações
  src/ui/          HUD e menus
  src/audio/       sons sintetizados
tests/             testes automáticos (node:test via tsx)
scripts/           dev server, build, e2e
```

A simulação recebe `PlayerInput` por tick e emite eventos; o cliente só desenha e toca sons. Física em timestep fixo, desacoplada do FPS.

### Por que não Three.js/React

O ambiente onde o projeto foi construído não tinha acesso ao registro npm nem a CDNs, então não era possível baixar e testar Three.js, React ou Rapier. Em vez de entregar código sem testar, o jogo usa um renderizador WebGL2 pequeno e próprio (~500 linhas, sem dependências de runtime), e o HUD é DOM puro, atualizado só quando um valor muda. A colisão também é própria (brushes convexos com sweep contínuo, como nos motores clássicos de FPS), o que se mostrou mais adequado ao surf do que um motor de física genérico. Trocar o renderizador por Three.js no futuro afeta só `client/src/render` e `client/src/game/Game.ts`.

## Status

### Funcionando

- Física de surf: rampas, projeção de velocidade, air-strafe, conservação de momentum, transições entre rampas, bunny hop com auto-bhop, colisão contínua, anti-travamento, recuperação de quedas
- Combate: hitscan com cabeça/corpo, 5 armas com dados próprios, recuo funcional e visual, spread baixo no ar, recarga, troca, zoom, muzzle flash, tracers, impactos, hitmarker, indicador de dano, kill feed, armas caem ao morrer, soltar arma
- Pickups: armas (E), munição, kit médico, colete, 3 granadas (explosiva, fumaça, impulso), escudo temporário, velocidade
- 4 classes com habilidades, cooldowns, efeitos visuais e passivas
- Partidas contra bots de 1v1 a 5v5, 4 dificuldades, rounds, duelos 1v1 no fim do tempo, placar, tela de resultado
- Modo treino com alvos, voo, checkpoints e reinício
- HUD, menus, configurações (sensibilidade, FOV, volumes, qualidade, efeitos, auto-bhop, velocidade, teclas), áudio sintetizado

### Pendente

- **Multiplayer online** (criar sala, código de convite, sincronização). Os botões existem e explicam isso; a simulação já é separada e autoritativa, pronta para rodar em um servidor Node com Socket.IO. Testes 12 e 13 da especificação dependem disso.
- Predição/reconciliação de rede e interpolação de entidades remotas (dependem do multiplayer).
- Animações de personagem são procedurais e simples; não há ragdoll.
- Os bots navegam por rotas e nós predefinidos do mapa; não há navmesh genérico.

## Testes

- `npm test`: 34 testes (física, mapa, dano, spread, cooldowns, estados, coleta, partida completa de bots).
- `npm run test:e2e`: abre o jogo no Chromium e verifica menu, entrada na arena, controle, surf com ganho de velocidade, coleta de arma, dano, recarga e troca, habilidade, eliminação e fim de round com placar.
