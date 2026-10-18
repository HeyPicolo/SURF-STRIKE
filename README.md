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

### Sprint, caminhar e slide

- **O sprint é automático**: andando no chão você já corre com +30% de velocidade, sem tecla, sem stamina e com a arma pronta para atirar. Passos fazem barulho, e os outros jogadores ouvem quando você está perto.
- **Shift** caminha: anula o sprint, fica bem mais lento e os passos ficam em silêncio.
- **Ctrl em movimento** faz um slide: um impulso de velocidade agachado (a partir de 200 u/s, em qualquer direção). Caminhando com Shift, o Ctrl só agacha. Apertar Ctrl até 0,3 s antes de pousar também conta.
- **Slide cancel**: apertar Espaço ou Ctrl de novo no meio do slide levanta na hora, sem a trava de 0,35 s do fim natural do slide. Com Espaço, você sai pulando e mantém o embalo.

### Controles

| Tecla | Ação |
|---|---|
| W A S D | Movimento (A/D para surfar e fazer air-strafe) |
| Mouse | Câmera e mira |
| Clique esquerdo | Atirar / golpe de faca / disparo do taser / lançar granada |
| Clique direito | Zoom (rifle e sniper) / estocada de faca / lançamento curto de granada |
| Espaço | Pular / bunny hop / cancelar slide |
| Shift | Caminhar (sem sprint e sem som de passos) |
| Ctrl | Agachar / slide (em movimento) / cancelar slide |
| R | Recarregar |
| E | Pegar arma |
| Q | Habilidade da classe |
| G | Soltar arma |
| F | Inspecionar a arma na mão |
| 1 / 2 / 3 / 4 | Primária / pistola / faca e taser (3 de novo alterna) / granadas (4 de novo alterna o tipo) |
| Tab | Placar |
| Esc | Pausa e configurações |
| T / V / Z / X | Treino: reiniciar posição / voar / salvar checkpoint / carregar checkpoint |

Todas as teclas podem ser remapeadas em Configurações.

**Sobre o Ctrl:** no navegador, Ctrl+W fecha a aba e Ctrl+T abre outra. Por isso o jogo entra em tela cheia ao capturar o mouse e usa o Keyboard Lock do Chrome e do Edge, que entrega essas combinações ao jogo. No Firefox (ou com a opção "Tela cheia ao jogar" desligada) isso não é possível; o jogo então pede confirmação antes de fechar a aba durante uma partida. Se preferir, troque o agachar para outra tecla em Configurações.

## Regras (Team Elimination)

- Azul contra Vermelho, até 5v5, 150 HP e colete cheio (100) ao nascer, sem respawn no round.
- Rounds de 90 s. Primeiro a 6 rounds vence.
- Se o tempo acabar, os sobreviventes são levados a arenas 1v1: vida cheia (150), sem colete, sem poderes, mesma arma sorteada para os dois. Quem sobra espera e enfrenta o vencedor de um duelo. Se os duelos também esgotarem o tempo, vence a equipe com mais vida somada.
- Todos começam o round com a faca borboleta (BALISONG) e o taser de choque (VOLT-1). A faca dá +25% de velocidade no chão enquanto está na mão.
- O taser tem uma carga: elimina com um disparo até 200 u (cerca de 5 m) e não faz nada além disso. Depois do disparo, volta para a melhor arma e recarrega sozinho em 30 s. Não cai ao morrer e não aparece no mapa. Nos duelos 1v1 entra só a faca e a arma sorteada.
- Quem cai do mapa volta automaticamente para a base do próprio time.
- Os pontos de item do mapa têm posições fixas, mas o item de cada ponto é sorteado a cada round. Pontos espelhados entre os dois times recebem sempre o mesmo item; os pontos do eixo central são únicos. As bases (plataformas de spawn) não têm armas, só utilitários: as armas ficam no platô, nos flancos e no Poleiro.
- Quem morre deixa a arma de fogo no chão. A faca não pode ser solta.

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
- **Rota B, Riptide** (magenta): duas rampas estreitas e íngremes em sequência, rápida e arriscada, termina na quina do platô, ao lado do jump pad que leva ao flanco direito.
- **Rota C, Halo** (dourado): rampa longa que leva ao Poleiro elevado, com a sniper e visão do centro.
- Centro com um pódio de arma forte e uma rampa central de surf reta (sem desnível) e de perfil baixo, bem acima do platô, ligando o Poleiro ao flanco direito. Os dois flancos ficam na mesma altura, dentro da altura da rampa. Para atravessar, entre embalado e mantenha-se na metade de cima da face; dá para andar e lutar por baixo dela.
- Quatro jump pads nas quinas do platô: os do lado +X lançam para o flanco direito, os do lado −X para o Poleiro. Eles não tiram velocidade: quem entra mais rápido que o pad sai com a própria velocidade, na direção do pad.
- O resto do mapa: teletransportadores de volta ao spawn, e uma camada de nuvens embaixo; quem cai abaixo do platô volta automaticamente para a própria base. Do platô, os flancos são alcançados pelos jump pads; a rota C termina no Poleiro e a rota B na quina do platô, ao lado de um jump pad. Os teletransportadores mantêm a velocidade de quem entra (girada para a direção de saída) e dão 0,45 s sem atrito no chão, então dá para sair embalado e emendar na rampa.

Cada rota foi validada por simulação: um bot sai do spawn e surfa até a área de combate sem cair (`tests/map.test.ts`).

## Parâmetros

Todos centralizados em `shared/config/`:

- `physics.ts`: gravidade 800, aceleração no chão 10, aceleração aérea 150, teto de wishspeed aéreo 30, atrito 5.2, atrito de surf 0, velocidade máxima 3500/eixo, pulo 302, raio do jogador 16, sensibilidade de movimento, 100 ticks/s.
- `physics.ts` → `SPRINT`: sprint automático (`autoSprint`; `raiseWeapon` e `useStamina` religam o sprint tático antigo), velocidade do sprint e do caminhar, impulso, duração e atrito do slide, trava de recuperação.
- `weapons.ts` → `ITEMS.maxHp` (150) e `ITEMS.spawnArmor` (100).
- `weapons.ts` → `ACCURACY.spreadMul` (0,5: metade do spread de todas as armas) e `RELOAD.speedMul` (1,45: recarga 45% mais rápida).
- `weapons.ts`: `DAMAGE.gunMul` (multiplicador de dano das armas de fogo, 1,4×), dano, multiplicador de headshot, cadência, pente, recarga, spread no chão e no ar, recuo, queda de dano, zoom; faca borboleta (golpe leve 45, estocada 75, pelas costas 135/300, alcance e folga do hitbox); taser (`hitPadding` do hitbox); granadas e itens.
- `pickups.ts`: pools de itens sorteados por ponto do mapa e seus pesos.
- Longbow: `preciseRange` (900 u) faz o tiro sem zoom ir exatamente na mira quando o alvo está perto; com zoom ela fica parada (sem balanço nem recuo visual) e continua no zoom depois do tiro.
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
- Sprint automático, caminhar silencioso no Shift, sons de passos, slide ao agachar em movimento, slide cancel com pulo ou agachar
- Armas de fogo com +40% de dano, Kestrel AR com metade do spread e menos recuo, hitbox maior para faca e taser
- Faca borboleta com animação de sacar (o cabo se solta e a lâmina dá a volta) e de inspecionar (flips, giro e ponta para cima); inspeção de todas as armas no F
- Taser de choque inicial (um disparo elimina de perto, recarga de 30 s), queda do mapa leva à base, teleportes com velocidade, slide automático acima de 450 u/s
- Faca inicial com golpe leve, estocada e dano pelas costas; +25% de velocidade com ela na mão; bots lutam com faca até achar uma arma
- Combate: hitscan com cabeça/corpo, 5 armas de fogo com dados próprios, recuo funcional e visual, spread baixo no ar, recarga, troca, zoom, muzzle flash, tracers, impactos, hitmarker, indicador de dano, kill feed, armas caem ao morrer, soltar arma
- Pickups: armas (E), munição, kit médico, colete, 3 granadas (explosiva, fumaça, impulso), escudo temporário, velocidade, sorteados por round e espelhados entre os times
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

- `npm test`: 65 testes (física, mapa, dano, spread, cooldowns, estados, coleta, sprint, slide, faca, taser, Longbow, teleportes, queda para a base, spawns aleatórios, partida completa de bots).
- `npm run test:e2e`: abre o jogo no Chromium e verifica menu, entrada na arena, controle, surf com ganho de velocidade, coleta de arma, dano, recarga e troca, sprint automático, caminhar e slide pelo teclado, habilidade, eliminação e fim de round com placar.
