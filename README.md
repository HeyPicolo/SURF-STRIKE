# SURF STRIKE

FPS 3D competitivo para navegador, inspirado no Combat Surf: duas equipes, rampas de surf com física no estilo Source, armas espalhadas pelo mapa, classes com poderes e rounds de eliminação. Visual low-poly original, sobre um mar de nuvens.

Tudo aqui é original: modelos gerados por código, sons sintetizados com WebAudio, mapa CLOUDS desenhado para as trajetórias de surf da física implementada.

Decisões, estado atual e pendências de cada rodada ficam em [`CONTEXTO.md`](CONTEXTO.md).

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

No menu: **Jogar contra bots** (escolha 1v1 a 5v5, dificuldade, equipe e classe), **Surf Skill** (percursos contra o cronômetro, sem combate, veja abaixo) ou **Treinamento** (sozinho, com alvos, voo e checkpoints). Clique na arena para capturar o mouse; **Esc** pausa.

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

## Surf Skill

Terceiro modo, ao lado de Partida e Treino, inspirado nos mapas de Surf Skill do CS2. Não há combate: só você, a faca e a mesma física de surf do jogo (`PHYSICS`, air strafe, `clipVelocity`, bhop), contra o cronômetro. Nenhum valor do modo principal muda.

### Treino × Desafio

- **Treino**: SKY STEPS (T1), DRIFT CANYON (T2) e STORM SPIRE (T3), para aprender.
- **Desafio**: 12 mapas (D1 a D12) que testam de verdade o surf, do tier 2 ao 6, cada um mais difícil que o anterior (D1–D2 T2, D3–D4 T3, D5–D6 T4, D7–D9 T5, D10–D12 T6).
- Tiers de 1 a 6: T1 verde, T2 amarelo, T3 vermelho, T4 laranja escuro, T5 roxo, T6 preto com borda vermelha.
- O menu tem as abas Treino e Desafio. Cada card mostra número, nome, tier, formato, quantidade de stages ou checkpoints, PB, Sum of Best, top 10 e o selo de concluído.
- Desbloqueio progressivo (concluir um desafio libera o próximo): `SKILL.progressiveUnlock`, desligado por padrão.

### Formatos: staged e linear

- **Staged**: stages separados, cada um com zona de início e de fim. Desde a rodada 9, a zona de fim leva ao próximo stage **mantendo a velocidade**: o jogador entra no ar, logo acima do começo da primeira rampa, com a velocidade horizontal girada para a direção dela.
- **Linear**: um percurso contínuo dividido por **checkpoints**. Cada checkpoint é um portal (paredes ciano) no começo de uma rampa: passar por ele gera um split, sem parar. Cair leva ao último checkpoint tocado, parado, numa plataforma de retorno acima da rampa; o tempo continua. A plataforma de retorno só é sólida para quem reaparece nela: quem passa voando atravessa. Backspace volta ao último checkpoint e o menu (M) lista os checkpoints.
- Recordes, melhores segmentos, Sum of Best e splits funcionam igual para stages e checkpoints ("segmentos").

### Regras

- Sozinho, sem bots, armas, itens, classes, habilidades ou dano. Só a faca no viewmodel, com o bônus de +25% de velocidade dela e o sprint automático (configurável em `shared/config/skill.ts`).
- Os mapas de treino têm **5 stages**; os desafios, de 6 a 12 segmentos (stages ou checkpoints). Cada stage tem uma zona de início (paredes verdes), um percurso de rampas e uma zona de fim (paredes vermelhas) que leva direto à zona de início do próximo stage. O último termina na chegada (paredes douradas). O número do stage flutua logo à frente da plataforma de início.
- **Cronômetro**: começa quando você sai da zona de início do stage 1. É contado em ticks da simulação (100 Hz) e exibido como mm:ss.cc, sem relógio do sistema.
- **Zona de início**: dá para pular, e não há mais limitador de velocidade (o prespeed cap de 420 u/s das rodadas 7–8 está desligado em `SKILL.prespeedCap = Infinity`; o código continua e volta com 420).
- **Entre stages** (staged): a velocidade é mantida, como nos teleportes do CLOUDS. A horizontal é girada para a primeira rampa do próximo stage; a vertical acompanha a descida dela (até 2000 u/s para baixo); são 0,45 s sem atrito. Quem chega devagar entra mais alto, até a altura da plataforma de início, com a mesma energia de quem sai andando. A plataforma de fim de cada stage se estende 1800 u para a frente, para quem chega embalado não passar por cima.
- **Queda** na lava (ou abaixo dela) e Backspace: voltam ao início do stage atual, **parado**. O cronômetro **não** zera: o tempo perdido é a punição. Isso é o checkpoint de stage.
- **Splits**: ao entrar na zona de início de cada stage (e na chegada) o HUD mostra o tempo acumulado e o tempo do stage, com a diferença para o recorde pessoal em verde (melhor) ou vermelho (pior).
- **Prática**: salvar posição + velocidade (Z) e voltar a ela (X). Usar qualquer um dos dois marca a corrida como prática (o HUD mostra PRÁTICA) e ela não conta para recordes. Ir para outro stage pelo menu (M) também é prática e só funciona fora de uma corrida cronometrada.

### Teclas (remapeáveis)

| Tecla | Ação |
|---|---|
| R | Reiniciar mapa: volta ao stage 1 e zera o cronômetro |
| Backspace | Reiniciar stage: volta ao início do stage atual (o tempo continua) |
| M | Menu de stages ou checkpoints (o número escolhe; só fora de uma corrida cronometrada) |
| Z / X | Salvar posição / voltar a ela (prática) |
| H | Mostrar/esconder o fantasma |
| N ou Enter | Na tela de fim: Próximo mapa (SKY STEPS → DRIFT CANYON → STORM SPIRE → D1 … D12; some no ZENITH e respeita o desbloqueio progressivo) |

R, Z e X são as mesmas teclas de recarregar e dos checkpoints do treino: cada modo só usa as suas.

### Mapas e tiers

| Mapa | Tier | Rampas | Inclinação (normal Y) | Velocidade mínima de projeto | Maior gap | Percurso de referência |
|---|---|---|---|---|---|---|
| SKY STEPS | 1 · iniciante (verde) | meia-largura 300, uma ou duas por stage | 52° (0,62), sempre igual | até 424 u/s | 306 u | 33,4 s, pico de 1560 u/s |
| DRIFT CANYON | 2 · intermediário (amarelo) | meia-largura 170–180, até 3 por stage | 55–57° (0,55–0,57) | até 870 u/s | 902 u | 40,4 s, pico de 1820 u/s |
| STORM SPIRE | 3 · avançado (vermelho) | meia-largura 110–140, até 4 por stage, algumas com uma face só | 47° no limite (0,68) e 63° íngreme (0,45) | até 1197 u/s | 1300 u | 42,1 s, pico de 2360 u/s |

- **SKY STEPS**: 1 Primeiro contato (uma rampa reta), 2 Reta longa, 3 Degraus (duas rampas alinhadas), 4 Dupla (troca de face entre duas rampas), 5 Curva leve (a segunda rampa vira 15°). Chegadas grandes logo depois do fim de cada rampa.
- **DRIFT CANYON**: 1 Garganta (três rampas trocando de face), 2 Zigue (curva para a direita e de volta), 3 Desfiladeiro (descida forte, gap de 900 u e uma rampa quase plana que só mantém a velocidade), 4 Saltos (pista com buracos: atravessa no bhop), 5 Cânion final (curva, mudança de altura e bhop até a chegada).
- **STORM SPIRE**: 1 Relâmpago (três rampas no limite, trocando de face), 2 Alternância (quatro rampas de uma face só em lados alternados, gaps curtos), 3 Fenda (descida íngreme e gap de 1300 u), 4 Espiral (curvas de 28°, −5° e 25°), 5 Olho da tempestade (íngreme, gap longo com curva, transições rápidas e chegada estreita).

A "velocidade mínima de projeto" é, para o pior gap de cada mapa, a velocidade abaixo da qual quem sai da rampa (na inclinação da saída) cai antes de alcançar o próximo apoio, pela balística com a gravidade do jogo. As rampas de cada stage têm a cor do stage, e cada mapa tem sua cor de destaque.

Metadados (nome, tier, cores, nomes dos stages e altura dos spawns) ficam em `shared/config/skill.ts`; as posições dos stages saem do layout automático (abaixo); os construtores dos mapas ficam em `shared/maps/skySteps.ts`, `driftCanyon.ts` e `stormSpire.ts`, usando o kit `shared/maps/skillKit.ts`.

### Layout dos stages (rodada 9)

- Os stages dos mapas staged não ficam mais numa grade escrita à mão. O construtor monta cada stage em coordenadas locais, mede o **envelope** real (brushes, lava, zonas, anel e número) e empacota os stages em fileiras com folga mínima de `STAGE_LAYOUT.clearance` (3000 u) entre envelopes, centralizados e dentro de ±38000 u. Se não couber em planta, usa duas camadas em altitudes diferentes (hoje só o OBSIDIAN GAUNTLET).
- A lava de cada stage tem folga de 1200 u em volta das rampas (era 2500, e invadia o stage vizinho); a queda continua detectada abaixo do `fallY` do stage.
- Nuvens: as que caem a menos de 600 u de um brush, zona ou trecho do percurso de referência (o corredor de voo inclui os gaps) descem para baixo da pista ou somem.
- `npm run skill:layout` confere tudo (folga entre stages, lava, brushes cruzando, trechos não vizinhos dos mapas linear a menos de 400 u, nuvens no corredor); o mesmo vale como teste.

### Mapas de desafio

Inspirados no estilo e na progressão de técnica dos mapas de surf skill mais conhecidos do CS:GO/CS2, mas com nomes, layouts e geometria originais, no visual low-poly do jogo e com paleta própria em cada mapa. Construtores em `shared/maps/desafios/`.

- **D1 · CORAL RUSH** (T2, staged, 6 stages): stages curtos e limpos, rampas médias e retas, transições simples. Cada stage começa com um salto grande da plataforma até a primeira rampa: largar caminhando faz cair antes dela.
- **D2 · VELVET DUNES** (T2, linear, 5 checkpoints): rampas longas em sequência com curvas abertas de 18–24° numa grande espiral descendente. Ensina a manter a velocidade por bastante tempo.
- **D3 · LANTERN PASS** (T3, staged, 7 stages): linhas mais apertadas, curvas de 25 a 35° feitas na própria rampa e trocas de face rápidas entre rampas curtas.
- **D4 · GLACIER RUN** (T3, linear, 6 checkpoints): rampas ascendentes (sobe-se com o embalo da anterior e sai-se lançado para cima) e gaps de mais tempo de ar, em voltas largas sobre a geleira.
- **D5 · IRON CATHEDRAL** (T4, staged, 8 stages): túneis e tetos baixos (125–150 u acima do cume) com rampas estreitas; entre túneis o salto precisa ser baixo e controlado.
- **D6 · SKYWIRE** (T4, linear, 6 checkpoints): air control, com gaps de 900–1360 u e curva de 14–22° no ar, pousando em rampas desalinhadas; subidas curtas seguram a velocidade.
- **D7 · ECLIPSE BOWL** (T5, staged, 8 stages): curvas fechadas — 90°, bacias e U-turns de 180° feitos na própria rampa, com rampas de subida entre elas.
- **D8 · REBEL SIGNAL** (T5, staged, 9 stages): cada stage pede uma técnica diferente (túnel, subidas, curvas de 90°, bhop, cabos com curva no ar, faces únicas alternadas, retorno de 180°); os dois últimos misturam tudo.
- **D9 · HOLLOW MOON** (T5, linear, 7 checkpoints): rampas de uma face só (normal Y 0,50, meia-largura 110) em lados alternados, espiral descendente e quedas bruscas (gaps de 520–560 u caindo 700–860 u em rampas de pouso longas).
- **D10 · THUNDERHEAD** (T6, linear, 8 checkpoints): seções de velocidade mínima — gaps de 1500–1860 u com pouca queda, calculados para ~1700 u/s: mais devagar, o arco acaba antes da rampa.
- **D11 · OBSIDIAN GAUNTLET** (T6, staged, 11 stages): todas as técnicas com rampas no limite (meia-largura 100, normal Y 0,42–0,46) e pouca margem: túnel, subidas, curvas, bhop em pistas estreitas, cabos, faces únicas, U-turns, velocidade mínima, quedas bruscas e uma manopla final com tudo.
- **D12 · ZENITH** (T6, linear, 11 checkpoints): a maratona. Uma espiral de ~78 000 u de altura com rampas de meia-largura 96 (normal Y 0,41), duas seções por checkpoint (faces alternadas, velocidade mínima, túnel, face única, queda brusca, subida) e curvas largas de 90° feitas para o teto de velocidade (3500 u/s). O último trecho sobe até o cume, marcado por uma coluna de anéis dourados e quatro pilares.

### Métricas dos mapas

Gerada por `npm run skill:metrics`, que corre o percurso de referência de cada mapa (só física, sem assistência) e grava o tempo e o pico em `shared/maps/skillReference.ts`.

| Mapa | Tier | Formato | Segmentos | Meia-largura mín/média | Normal Y | Maior gap | Vel. mínima | Tempo de ar | Transições | Curva máx. | Referência | Pico | Índice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SKY STEPS | T1 | staged | 5 | 300 / 300 | 0.62–0.62 | 306 u | 424 u/s | 0.91 s | 8 | 15° | 00:21.69 | 1691 u/s | 52.2 |
| DRIFT CANYON | T2 | staged | 5 | 170 / 176 | 0.55–0.57 | 902 u | 870 u/s | 1.11 s | 10 | 34° | 00:28.77 | 1822 u/s | 80.1 |
| STORM SPIRE | T3 | staged | 5 | 110 / 129 | 0.45–0.68 | 1300 u | 1197 u/s | 1.27 s | 17 | 33° | 00:38.30 | 2276 u/s | 109.1 |
| D1 · CORAL RUSH | T2 | staged | 6 | 195 / 195 | 0.52–0.52 | 460 u | 552 u/s | 0.93 s | 38 | 12° | 01:06.77 | 2710 u/s | 112.6 |
| D2 · VELVET DUNES | T2 | linear | 6 | 210 / 210 | 0.54–0.54 | 356 u | 469 u/s | 0.99 s | 42 | 24° | 01:23.17 | 2317 u/s | 120.4 |
| D3 · LANTERN PASS | T3 | staged | 7 | 150 / 157 | 0.51–0.54 | 301 u | 383 u/s | 0.94 s | 31 | 60° | 01:45.75 | 2640 u/s | 131.8 |
| D4 · GLACIER RUN | T3 | linear | 7 | 165 / 165 | 0.54–0.54 | 840 u | 869 u/s | 0.99 s | 43 | 50° | 01:46.13 | 2634 u/s | 148.8 |
| D5 · IRON CATHEDRAL | T4 | staged | 8 | 132 / 137 | 0.52–0.54 | 320 u | 864 u/s | 0.95 s | 55 | 45° | 02:09.61 | 2806 u/s | 167.9 |
| D6 · SKYWIRE | T4 | linear | 7 | 150 / 155 | 0.53–0.54 | 1359 u | 1027 u/s | 1.47 s | 50 | 75° | 02:15.52 | 2722 u/s | 184 |
| D7 · ECLIPSE BOWL | T5 | staged | 8 | 125 / 125 | 0.52–0.52 | 320 u | 450 u/s | 0.96 s | 30 | 300° | 03:09.53 | 2482 u/s | 203.6 |
| D8 · REBEL SIGNAL | T5 | staged | 9 | 122 / 124 | 0.51–0.68 | 1148 u | 1102 u/s | 1.22 s | 61 | 180° | 02:27.58 | 2645 u/s | 210.7 |
| D9 · HOLLOW MOON | T5 | linear | 8 | 110 / 110 | 0.50–0.50 | 560 u | 471 u/s | 1.36 s | 75 | 90° | 03:02.45 | 2970 u/s | 222 |
| D10 · THUNDERHEAD | T6 | linear | 9 | 115 / 117 | 0.50–0.52 | 1860 u | 1609 u/s | 1.19 s | 55 | 90° | 03:29.99 | 3198 u/s | 243.7 |
| D11 · OBSIDIAN GAUNTLET | T6 | staged | 11 | 100 / 101 | 0.42–0.46 | 1800 u | 1627 u/s | 1.31 s | 97 | 180° | 03:21.80 | 3345 u/s | 288.1 |
| D12 · ZENITH | T6 | linear | 12 | 96 / 141 | 0.41–0.50 | 1550 u | 1515 u/s | 1.36 s | 132 | 90° | 05:25.36 | 3448 u/s | 357.2 |

O **índice de dificuldade** (`shared/maps/skillMetrics.ts`) é a soma ponderada das métricas, cada uma normalizada: 12 × (200 / meia-largura média) + 10 × ((0,7 − normal Y mínima) / 0,3) + 10 × (maior gap / 1000) + 10 × (velocidade mínima / 1000) + 8 × tempo de ar máximo + 15 × (transições / 20) + 10 × (curva máxima / 90°) + 30 × (tempo de referência / 1 min) + 10 × (pico / 2000). Pesa técnica e resistência (quanto mais longo, mais chances de errar). Um teste garante que ele cresce estritamente do D1 ao último desafio e que todo desafio fica acima do STORM SPIRE.

### Fantasma

- Toda corrida válida é gravada por tick (posição, olhar, no chão/agachado). Quando ela vira PB, a gravação vira o fantasma daquele mapa; cada stage/checkpoint que vira o melhor segmento guarda também o seu trecho.
- Durante a corrida o fantasma corre ao lado, sincronizado pelo cronômetro (começa quando o seu começa), interpolado entre as amostras. Personagem translúcido ciano, sem colisão e sem passos, com a plaquinha "PB 01:23.45"; some suavemente perto da câmera.
- O HUD mostra a diferença ao vivo para o fantasma (à frente/atrás, em segundos), além dos splits.
- Configurações: mostrar fantasma (tecla H), opacidade e sincronia "corrida inteira" (padrão) ou "por segmento" (em cada stage/checkpoint o fantasma recomeça daquele ponto com o melhor segmento).
- Prática (saveloc, menu de stages) não grava.
- Armazenamento: 50 Hz, keyframes absolutos a cada 50 amostras e deltas em Int16 (1/8 u) entre eles, cerca de 12 bytes por amostra (uma corrida de 5 min fica em ~180 KB; o limite em config é 256 KB). Fica no IndexedDB pela interface `GhostStore` (`shared/sim/ghost.ts`), com a mesma chave (mapa + hash da geometria) dos recordes.

### Recordes e ranking

Tudo local por enquanto (localStorage), mas a lógica fica em `shared/sim/records.ts` para ser reaproveitada no multiplayer:

- Por mapa: recorde pessoal (PB) com os splits da corrida PB, melhor tempo de cada stage (melhor segmento), **Sum of Best**, tentativas e conclusões.
- Ranking local: top 10 com nome e data. O nome é pedido na primeira vez e pode ser trocado em Configurações.
- A chave de armazenamento leva um hash da geometria e das zonas do mapa: mudar o mapa invalida os recordes antigos em vez de deixá-los inconsistentes. Os hashes ficam em `shared/maps/skillVersions.ts` (gerado por `npm run skill:versions`; um teste confere), então o menu lê os recordes sem construir os mapas. Só o mapa escolhido é construído.
- O armazenamento é a interface `RecordStore` (hoje `client/src/skill/localStore.ts`); trocar por um backend não mexe no resto.

### Decisões de design

Onde o pedido deixava espaço, segui o mais próximo do Surf Skill do CS2:

- Rodada 9: o fim de cada stage leva ao próximo mantendo a velocidade (antes levava parado à zona de início). As regras novas entram na chave dos recordes e fantasmas (`SKILL.rulesVersion` = 2, junto do hash do mapa): os PBs com cap e parados entre stages não se misturam com os novos. Todos os PBs e fantasmas dos 15 mapas foram zerados nesta rodada.
- Percurso de referência ao chegar embalado: mantém a velocidade de saída do stage anterior e só freia (a tecla para trás no ar, como um jogador controlando a velocidade) quando passa de 15% + 300 u/s da velocidade que o próprio stage tem saindo parado naquele ponto. Os testes rodam cada stage dos dois jeitos: saindo parado do spawn e chegando embalado na corrida inteira. Um teste extra joga o jogador a 600–3500 u/s na entrada de cada stage e confere que ele pousa na primeira rampa sem bater, e a 3500 u/s na chegada sem passar por cima.
- Ajustes para a velocidade mantida: pistas de bhop mais longas e menos numerosas (DRIFT CANYON, REBEL SIGNAL, OBSIDIAN GAUNTLET), pistas de chegada logo depois do bhop, curvas do OBSIDIAN GAUNTLET mais abertas (Vidro, Manopla), uma rampa a mais por stage no CORAL RUSH (o mapa ficou curto e o índice dele caiu abaixo do STORM SPIRE).
- O tempo de cada stage vai de um split ao próximo, então os 5 stages somam exatamente o tempo total, e o Sum of Best faz sentido.
- Cair no stage 1 depois de largar não zera o cronômetro (só o R zera), para manter a regra "cair não zera o tempo".
- Na tela de fim, a comparação de cada stage é com o stage da corrida PB anterior (estrela dourada quando o stage virou o melhor da história).
- Rodada 8: o pulo na zona de início foi liberado. Rodada 9: o cap foi desligado.
- Nos mapas linear, a plataforma de retorno de cada checkpoint fica atrás do portal e bem acima da linha de voo (pelo menos 430 u acima do cume, mais se a rampa anterior lança para cima). Desde a rodada 9 ela é sólida só para quem foi colocado nela (queda, Backspace, menu): o jogador fica com ela como chão até sair da zona e da plataforma; para quem passa voando ela não existe (antes, 40 de 112 passagens de teste em alturas diferentes batiam nela). Os números e anéis sempre foram só visuais.
- Curvas: mudanças grandes de direção são feitas na própria rampa (segmentos curvos emendados, surfando a face de dentro), com o raio calculado para a velocidade esperada (`Course.curveFor`): acima dela o jogador sobe na face. Nos gaps, as curvas são menores, e surfa-se a face de fora da curva segurando para dentro.
- Túneis: entre duas rampas de túnel a queda é curta (70–100 u); vindo de rampa aberta, a boca do túnel fica no meio da rampa e o teto do gap é horizontal (um teto inclinado empurraria o jogador para baixo). A queda é medida por trecho (abaixo da parte mais baixa do trecho), para não precisar cair até o fundo do mapa.
- O fantasma do PB só é trocado quando a corrida vira PB (como no CS2): quem já tinha recorde da rodada 7 ganha o fantasma ao bater o próprio tempo.
- **Emendas sem ramp bug (rodada 9)**: as peças de curva (e as retas emendadas) têm as tampas em meia-esquadria: na junta as duas peças usam a mesma seção, e as faces se encontram exatamente (antes sobrava um degrau de ~q·meia-largura·tan α·(1 − cos θ) e uma fresta tapada por uma cunha). Na dobra côncava da face de dentro, a caixa do jogador às vezes entra na peça seguinte pela tampa ou por um bisel dela: esses planos são internos, então o movimento sobe a caixa para a face da peça seguinte e o surf continua (`Mover.liftOntoFace`). E nas peças de curva (`surfOnly`; no ZENITH, em todas as rampas) um contato com bisel "andável" não vira chão em velocidade de surf (≥ 500 u/s): sem atrito, sem subir degrau, sem grudar no chão. Antes, no LANTERN PASS, 316 das 880 passadas do teste de emendas ficavam "no chão" numa rampa; agora nenhuma, em nenhum mapa, e a maior perda num tick perto de uma junta é 2,6%.
- Sem o "freio" do ramp bug, algumas curvas ficaram rápidas demais para o raio antigo e foram reprojetadas para a velocidade real: LANTERN PASS (2300 → 2600 u/s), IRON CATHEDRAL (2100 → 2400), SKYWIRE (2400 → 2600, descendo menos na curva) e HOLLOW MOON (2300 → 2400, com uma reta final de três faces).
- Para caber em ±40000, a maratona desce menos por rampa (descidas × 0,3, rampas × 1,9 de comprimento) e as transições comuns caem 190 u em vez de 300. 
- Os cabos (curva no ar) ficaram fora do ZENITH: na velocidade da maratona as viradas no ar não fecham; eles aparecem no D6, D8 e D11.

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
- `skill.ts`: regras do Surf Skill (faca, prespeed cap desligado, velocidade mantida entre stages, versão das regras, pulo na zona, ranking, fantasma, layout dos stages) e metadados dos 15 mapas.

## Arquitetura

```
shared/            lógica sem DOM (roda igual no cliente e, futuramente, no servidor)
  math/            vetores, PRNG determinístico
  config/          física, armas, classes, regras
  physics/         brushes convexos, sweep de caixa contínuo (sem tunelamento), movimento estilo Source
  maps/            CLOUDS (geometria, pickups, triggers, rotas de bots, arenas de duelo) e os 3 mapas do Surf Skill
  sim/             World autoritativo: jogadores, combate hitscan, granadas, pickups, habilidades, máquina de estados;
                   skill.ts (zonas, cronômetro, splits, prática) e records.ts (PB, Sum of Best, ranking)
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
- Surf Skill: 3 mapas de treino (T1 a T3) e 12 de desafio (D1 a D12, T2 a T6) nos formatos staged e linear, cronômetro em ticks, splits contra o PB, quedas para o início do stage ou para o último checkpoint, prática com saveloc, recordes, Sum of Best, ranking local e fantasma do PB
- HUD, menus, configurações (sensibilidade, FOV, volumes, qualidade, efeitos, auto-bhop, velocidade, teclas), áudio sintetizado

### Pendente

- **Multiplayer online** (criar sala, código de convite, sincronização). Os botões existem e explicam isso; a simulação já é separada e autoritativa, pronta para rodar em um servidor Node com Socket.IO. Testes 12 e 13 da especificação dependem disso.
- Predição/reconciliação de rede e interpolação de entidades remotas (dependem do multiplayer).
- Animações de personagem são procedurais e simples; não há ragdoll.
- Os bots navegam por rotas e nós predefinidos do mapa; não há navmesh genérico.

## Testes

- `npm test`: 153 testes (física, mapa, dano, spread, cooldowns, estados, coleta, sprint, slide, faca, taser, Longbow, teleportes, queda para a base, spawns aleatórios, partida completa de bots e, no Surf Skill, cronômetro, zonas, prespeed, splits, quedas, reinícios, prática, recordes, versão do mapa, formato linear com checkpoints, fantasma (gravação, compressão, PB, sincronia por segmento, tamanho), regras de projeto dos desafios (inclinação, largura mínima, zonas), cada segmento de cada mapa completado pelo percurso de referência (de ponta a ponta e a partir de cada stage/checkpoint), emendas das curvas a 2400 u/s, sonda das emendas de todos os mapas (800–3000 u/s, várias alturas na face, os dois strafes), layout dos stages, nuvens fora da pista, plataformas de checkpoint atravessáveis, regras sem cap, velocidade mantida entre stages, entrada embalada e chegada a 3500 u/s em todo stage, versão das regras na chave dos recordes, ordem do Próximo mapa e o índice de dificuldade crescente).
- `npm run test:e2e`: abre o jogo no Chromium e verifica menu, entrada na arena, controle, surf com ganho de velocidade, coleta de arma, dano, recarga e troca, sprint automático, caminhar e slide pelo teclado, habilidade, eliminação e fim de round com placar; no Surf Skill, menu dos mapas, cronômetro ao sair da zona, queda de volta ao início do stage, reinício do mapa e um stage completo com split; aba Desafio, entrar no D1 e pular na base (sem limitador de velocidade), completar um segmento do D1, uma corrida curta de teste até o fim, o fantasma aparecendo na tentativa seguinte e o botão Próximo mapa carregando o mapa seguinte.
