# SURF STRIKE — Contexto do projeto

Registro vivo das decisões, do estado atual e das pendências. **Atualizado a cada rodada de mudanças, no mesmo commit.**
Serve para qualquer sessão (de código ou de apoio) entender o projeto sem reler o histórico inteiro.

- **Última rodada:** 11b (fecha a rodada 11) · 20/10/2026 · 11a = `5dfb809`
- **No ar:** https://surf-strike.vercel.app (deploy automático da Vercel a cada push na `main`)
- **Repositório:** github.com/HeyPicolo/SURF-STRIKE

## Como as sessões trabalham

- **Sessão de código:** é a única que edita e dá push na `main`. Em cada rodada: config/sim → cliente → testes e e2e → README e **este arquivo** → typecheck, testes, build, e2e → commit e push → confere o deploy READY.
- **Sessão de apoio:** só leitura. Atualiza o repositório, confere o último deploy, responde dúvidas, revisa e escreve prompts para a sessão de código.
- Pedidos novos chegam como "Rodada N" (texto ou anexo). Decisões ambíguas são resolvidas pela sessão de código, anotadas aqui e no README.
- Autor dos commits: `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`, com as linhas `Co-Authored-By` e `Claude-Session` no fim da mensagem.

## Como rodar

```
npm install
npm run dev            # servidor local com rebuild
npm run build          # gera dist/ (o que a Vercel publica)
npm test               # 183 testes unitários (node:test via tsx, ~60 s)
npm run skill:metrics  # corre o percurso de referência de todos os mapas, grava skillReference.ts e imprime a tabela de métricas
npm run skill:versions # regrava shared/maps/skillVersions.ts depois de mudar um mapa do Surf Skill
npm run skill:layout   # confere folga entre stages, lava, brushes cruzando, trechos não vizinhos e nuvens
npx tsc --noEmit -p tsconfig.json
CHROME_PATH=/opt/pw-browsers/chromium node scripts/e2e.mjs   # 31 verificações no navegador (screenshots em e2e-shots/, Arsenal em e2e-shots/arsenal/)
# ?arsenal na URL abre a tela Arsenal (revisão dos modelos)
```

## O jogo hoje

FPS de navegador: Combat Surf (física estilo Source/CS) + combate tático estilo CS2, visual low-poly. Renderizador WebGL2 próprio, sem Three.js. Simulação autoritativa em `shared/` (sem DOM, 100 ticks/s), cliente em `client/`. Multiplayer ainda não existe.

**Modos:** Partida contra bots (Team Elimination, 1v1 a 5v5, 4 dificuldades), **Surf Skill** (percursos contra o cronômetro) e Treino.

### Movimento
- Física Source: air strafe (airAccelerate 150, cap 30), gravidade 800, bhop (auto-bhop opcional), surf em rampas com normal Y < 0,7.
- **Sprint sempre ativo** (+30% no chão, sem tecla, sem stamina, atira correndo). **Shift = caminhar** (×0,55, passos silenciosos). Passos têm som espacial.
- **Slide:** Ctrl em movimento (≥ 200 u/s), exceto caminhando; cancelável com Espaço ou Ctrl.
- Faca na mão: +25% no chão. Queda do CLOUDS leva à própria base. Teleportes e jump pads não tiram velocidade.

### Combate
- Vida 150, colete 100 ao nascer (duelos: sem colete). Começa com faca borboleta + taser.
- Armas de fogo ×1,4 de dano (`DAMAGE.gunMul`); spread de todas ×0,5; recarga 45% mais rápida.
- Kestrel AR: spread 0,09 / ar 0,45 / movendo 0,3, recuo 0,45 / 0,2. Longbow precisa de perto, mira parada no zoom.
- Faca: alcance 80/70, folga de hitbox 14, 7 raios. Taser: 500 de dano, alcance 200, folga de hitbox 12, recarga 30 s.
- Slots: 1 primária, 2 pistola, 3 faca/taser, 4 granadas. F inspeciona.

### Classes
RUNNER (dash aéreo), JUMPER (teleporte), PREDATOR (silhuetas através das paredes), BERSERKER (fúria).

### Mapa CLOUDS (partida)
Bases ligadas por rampas (rotas A, B1, B2, C), rampa central reta (ápice 1150), flancos na mesma altura, 4 jump pads nas quinas do platô, arenas de duelo em x ≈ 14000.

### Surf Skill (rodadas 7 e 8)
- Sozinho, só a faca (com bônus) e sprint automático, sem dano. Configuração em `shared/config/skill.ts`.
- 3 mapas × 5 stages: **SKY STEPS** (T1), **DRIFT CANYON** (T2), **STORM SPIRE** (T3). Construtores em `shared/maps/skySteps.ts`, `driftCanyon.ts`, `stormSpire.ts`, com o kit `skillKit.ts` e o registro `skillMaps.ts`.
- Lógica em `shared/sim/skill.ts` (zonas, cronômetro em ticks, splits, quedas, reinícios, prática) e recordes em `shared/sim/records.ts` (PB, melhores stages, Sum of Best, top 10, versão por hash da geometria). Armazenamento: interface `RecordStore`, hoje `client/src/skill/localStore.ts` (localStorage).
- Teclas: R reinicia o mapa, Backspace reinicia o stage (linear: último checkpoint), M abre o menu de stages/checkpoints, Z/X salvam e carregam a posição (prática), H mostra/esconde o fantasma.
- **Rodada 8a:** categorias Treino (os 3 mapas) e Desafio (12 mapas); tiers 1–6 (`TIER_COLORS`, `TIER_STYLE`, `TIER_LABELS`); formatos **staged** e **linear** (checkpoints = portal + plataforma de retorno 430 u acima do cume; queda medida por trecho); tudo generalizado para "segmentos" (`map.skill.segments`); zonas podem ser caixas orientadas (`TriggerVolume.obb`); pulo liberado na zona de início com o cap valendo também no tick de saída; desbloqueio progressivo em `SKILL.progressiveUnlock` (desligado).
- **Fantasma** (`shared/sim/ghost.ts`): gravação por tick na sim (`SkillRun.recorder`), 50 Hz com keyframes + deltas Int16 (~12 B/amostra; limite `GHOST.maxBytes5min` = 256 KB), `GhostStore` no IndexedDB (`client/src/skill/ghostStore.ts`), PB substitui o fantasma da corrida, melhores segmentos guardam o seu trecho, sincronia "corrida inteira" ou "por segmento", diferença ao vivo no HUD. Prática não grava.
- Versões estáticas: `shared/maps/skillVersions.ts` (o menu não constrói mapas; só o mapa escolhido é construído e fica em cache). Os hashes dos mapas de treino continuam os da rodada 7.
- Mapa oculto `teste_curto` (linear, 1 checkpoint) só para testes/e2e.
- **Rodada 8b — desafios D1–D6** (`shared/maps/desafios/`): CORAL RUSH (T2 staged 6, salto inicial que pune largada lenta), VELVET DUNES (T2 linear 5 cp, espiral de curvas abertas), LANTERN PASS (T3 staged 7, curvas de 25–35° na rampa), GLACIER RUN (T3 linear 6 cp, rampas ascendentes), IRON CATHEDRAL (T4 staged 8, túneis), SKYWIRE (T4 linear 6 cp, gaps longos com curva no ar). Métricas e índice em `skillMetrics.ts`; tempos de referência em `skillReference.ts` (gerado). Índices: D1 114 · D2 120 · D3 145 · D4 149 · D5 166 · D6 190 (STORM SPIRE 111,5).
- **Rodada 8c — desafios D7–D12:** ECLIPSE BOWL (T5 staged 8, curvas de 90°/bacias/U-turns), REBEL SIGNAL (T5 staged 9, uma técnica por stage), HOLLOW MOON (T5 linear 7 cp, faces únicas alternadas, espiral, quedas bruscas), THUNDERHEAD (T6 linear 8 cp, gaps de velocidade mínima ~1700 u/s via `gapDrop`), OBSIDIAN GAUNTLET (T6 staged 11, tudo com meia-largura 100 e normal 0,42), ZENITH (T6 linear 11 cp, maratona de 5:23 com 2 seções por checkpoint, chegada no cume com anéis dourados via `LinearSpec.finale`). Índices: D7 208 · D8 219 · D9 224 · D10 254 · D11 305 · D12 357.
- **Rodada 9a — layout, nuvens, emendas, checkpoints:**
  - Layout automático dos stages (`packStages` no skillKit): cada stage é construído em coordenadas locais, o envelope (brushes + lava + zonas + anel + número) é medido e os stages são empacotados em fileiras com `STAGE_LAYOUT.clearance` = 3000 u; se não couber em ±38000, duas camadas de altitude (só o OBSIDIAN GAUNTLET). Os mapas staged em config só têm nomes e `layoutY`. Lava com folga de 1200 u (`STAGE_LAYOUT.lavaPad`). `Brush.group` = índice do stage/trecho. Checador: `shared/maps/skillLayout.ts` (teste e `npm run skill:layout`).
  - Nuvens a menos de 600 u de brush, zona ou percurso de referência descem (−1800/−3600) ou somem (`clearClouds` em `mapDefFrom`).
  - Emendas: peças emendadas com tampas em meia-esquadria (`miterRamp`; a cunha `seamFiller` saiu). Juntas internas ficam em `Brush.joints`; no `flyMove`, bater numa tampa/bisel de junta sobe a caixa para a face (`liftOntoFace`). Brushes `surfOnly` (todas as peças de curva; todas as rampas do ZENITH) não viram chão por bisel em velocidade ≥ `PHYSICS.surfBevelSpeed` (500). Sonda: `shared/maps/seamProbe.ts` (teste em `tests/skill-layout.test.ts`). O `slick` da 8c foi substituído por isso.
  - **Não** ligar `surfOnly` em rampas retas comuns sem recalibrar: os pousos perto do cume dos mapas foram calibrados com o bisel virando chão por um tick (ligar em tudo quebrou D2, D3, D5, D6, D9 e D11).
  - Curvas recalibradas por ficarem rápidas sem o "freio" do ramp bug: LANTERN PASS 2600, IRON CATHEDRAL 2400, SKYWIRE 2600 (descida 40 por peça), HOLLOW MOON 2400 + reta final de 3 faces.
  - Checkpoints: a plataforma `skill-cp-k` é `spawnOnly` — sólida só para o jogador colocado nela (`PhysState.spawnFloor`, ligado em `SkillRun.place` e no loadloc; desligado quando ele sai da zona e não está mais no chão). Números, suporte e anéis já eram só visuais.
  - **PB e fantasma invalidados** (hash novo) em todos os 15 mapas: staged pelo layout, linear pelas emendas e pelas plataformas. Os hashes de treino fixados no teste agora são os da rodada 9.
- **Rodada 9b — regras e Próximo mapa:**
  - `SKILL.prespeedCap = Infinity` (o código do cap continua; 420 religa). Pulo na base liberado.
  - Staged: a zona de fim chama `SkillRun.carry` (se `SKILL.keepVelocityBetweenStages`): o jogador vai para `segment.carry` (no ar, 48 u acima da linha de surf a 5% da primeira rampa; mais alto quem chega devagar, até a plataforma: `carry.rise` × (1 − v/`carryRiseUntil`)), com a velocidade horizontal girada para a primeira rampa, a vertical acompanhando a descida (até `carryMaxDown` = 2000) e `teleportGlide` (0,45 s sem atrito). Queda e Backspace continuam parados no spawn. Plataforma de fim de cada stage estendida 1800 u para a frente (`CARRY_ENTRY.endExtend`). `flowFrom` dos stages = 1.
  - `SKILL.rulesVersion` = 2 entra na chave dos recordes e fantasmas (`recordVersion(hash)` em `records.ts`; usado no `main.ts`). PBs antigos (cap, parado entre stages) ficam de fora.
  - Percurso de referência ao chegar embalado (`referenceRun`): `RouteDriver.speedCap` = perfil do stage saindo parado (`speedProfile`, ×1,15 + 300) — freia (tecla para trás, dosada para ~450 u/s por tick) só acima disso; e `bevelAsAir`: um bisel "andável" na crista não vale como face para a direção do bot. Os bots da partida não mudaram.
  - Movimento: `liftOntoFace` escolhe a face do mesmo lado da que o jogador surfava.
  - Ajustes de mapa para a velocidade mantida: DRIFT CANYON (pistas do bhop mais longas, buracos menores), REBEL SIGNAL e OBSIDIAN GAUNTLET (bhop com 4–5 pistas longas, chegada logo depois), OBSIDIAN GAUNTLET Vidro (`curveStage(..., 2300, 1.1, 300)`) e Manopla (curva de −120° na face de dentro, 2900 u/s), CORAL RUSH (+1 rampa por stage).
  - "Próximo mapa" na tela de fim (`nextSkillMap`/`skillMapOrder` em config; atalho N, Enter pelo foco). Do TESTE CURTO vai para o SKY STEPS; some no ZENITH; respeita `progressiveUnlock`.
  - Checagem completa dos dois jeitos: teste por mapa (corrida embalada + cada segmento parado) e `tests/skill-rules9.test.ts` (entrada a 600–3500 u/s e chegada a 3500 u/s em todo stage).
  - O bot de referência é caótico: mexer numa curva ou numa pista de bhop pode fazer outro stage falhar. Depois de qualquer ajuste, rode `npm test` (os testes dos desafios rodam a corrida embalada e cada segmento parado) e `npm run skill:metrics`.
- `curveFor(..., { stepDeg: 5 })`: passos de 5° (D7, D8 e D11) — com a meia-esquadria não é mais necessário para o degrau, mas mantém as curvas mais redondas.
- Como projetar um mapa que o percurso de referência completa: curvas grandes na rampa (`curveFor`, face de dentro); curvas em gaps ≤ ~24° com a face de fora; queda do gap proporcional ao tempo de ar na velocidade esperada (ver `dropFor` no SKYWIRE); túneis com queda curta; checkpoint sempre seguido de uma descida longa (quem volta dele começa devagar); chegadas generosas; espiral para caber em ±40000. Depois de mudar um mapa: `npm run skill:versions` e `npm run skill:metrics`.
- Kit (`skillKit.ts`): `Course` (encadeia rampas: `next`, `curve` contínua com emendas fechadas por cunha, `checkpoint`, `bhop`), rampas ascendentes, túneis (`ceiling`), rampas de uma face, `buildLinear` e métricas de projeto por segmento (meia-largura, inclinação, gaps, velocidade mínima balística, tempo de ar, transições, curva máxima).
- Percurso de referência: `shared/bots/routeDriver.ts` (usa o `steerToward` com `idealStrafe`, sem assistência). Completa todos os segmentos dos 15 mapas só com física; também existe `game.autopilot` no cliente para testes.

| | T1 SKY STEPS | T2 DRIFT CANYON | T3 STORM SPIRE |
|---|---|---|---|
| Meia-largura | 300 | 170–180 | 110–140 |
| Inclinação (normal Y) | 52° (0,62) | 55–57° (0,55–0,57) | 47° (0,68) e 63° (0,45) |
| Velocidade mínima no pior gap | 353 u/s | 619 u/s | 794 u/s |
| Maior gap | 306 u | 902 u | 1300 u |
| Percurso de referência | 33,4 s · pico 1560 u/s | 40,4 s · pico 1820 u/s | 42,1 s · pico 2360 u/s |

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `shared/config/physics.ts` | `PHYSICS` e `SPRINT` (sprint automático, caminhar, slide) |
| `shared/config/weapons.ts` | armas, `DAMAGE`, `ACCURACY`, `RELOAD`, `ITEMS`, slots |
| `shared/config/skill.ts` | regras do Surf Skill e metadados dos mapas/stages |
| `shared/sim/world.ts` | núcleo da simulação (modos `bots`, `training`, `skill`) |
| `shared/sim/skill.ts`, `records.ts` | Surf Skill e recordes |
| `shared/maps/clouds.ts` | mapa da partida |
| `shared/bots/brain.ts`, `steer.ts`, `routeDriver.ts` | IA, direção de surf, percurso de referência |
| `client/src/game/Game.ts` | loop, input, eventos, câmera, viewmodel, passos, HUD do Surf Skill |
| `shared/bots/aim.ts`, `aimBench.ts` | mira humanizada dos bots (flick + mola + tremor) e a bancada de mira (`scripts/bot-aim-bench.ts`) |
| `client/src/entities/style.ts` | guia de estilo das armas/itens: paletas, `STYLE` (espessuras), `TRI_BUDGET`, `WEAPON_REFS` (boca, luneta), `PICKUP_COLORS` |
| `client/src/entities/geometry.ts` | geometria das armas, balisong, granadas, itens e luvas (sem GL, 2 versões: `view`/`world`); `MODEL_LIST` |
| `client/src/render/mesh.ts` | `MeshBuilder` e as primitivas do estilo de blocos |
| `client/src/entities/characters.ts` | personagens no estilo de blocos (3 versões: perto/média/longe), pivôs e paleta do time |
| `client/src/game/adsPose.ts` | posição do viewmodel no ADS (linha de visada no centro) |
| `client/src/ui/arsenal.ts` | tela Arsenal (`?arsenal` ou botão no painel do Treino) |
| `client/src/ui/menu.ts`, `hud.ts` | menus (inclui seleção de mapa e tela de fim do Surf Skill) e HUD |
| `client/src/maps/worldMesh.ts` | malha do mapa, paredes das zonas, número do stage |
| `client/src/audio/sfx.ts` | sons sintetizados |
| `tests/*.test.ts`, `scripts/e2e.mjs` | testes unitários e de navegador |

## Histórico das rodadas

| Rodada · commit | O que mudou |
|---|---|
| 1 · `d38f7ce` | Jogo completo a partir da especificação; deploy na Vercel ligado ao GitHub. |
| 2 · `fe6d704` | Sprint tático com stamina, slide e slide cancel, agachar no Ctrl, faca inicial (+25%), itens aleatórios, sem jump pads. |
| 3 · `9d4d6ce` | Queda leva à base, teleportes com velocidade, slide acima de 450 u/s, Longbow parada no zoom e precisa de perto, taser inicial. |
| 4 · `9f598b7` | Sem armas nas bases, spread −50%, rampa central no lugar da ponte, faca borboleta com animações, inspeção no F, recarga +45%. |
| 5 · `5ef55f7` | Colete ao nascer, vida 150, rampa central reta e mais alta, flancos nivelados, 4 jump pads sem perda de velocidade. |
| 6 · `4adcdcb` | Dano ×1,4, Kestrel mais precisa, sprint automático, Shift caminha (silencioso), sons de passos, slide em movimento, hitbox maior de faca/taser. |
| 7 · `e9a4c25` | **Surf Skill**: 3 mapas com 5 stages, cronômetro em ticks, splits contra o PB, quedas para o início do stage, prática, recordes locais, Sum of Best, ranking, menu, HUD, sons, 16 testes e 6 verificações e2e novas. |
| 8a · `a615840` | Infraestrutura do Surf Skill para os desafios: Treino × Desafio, tiers 1–6, formatos staged/linear com checkpoints, segmentos genéricos, fantasma do PB (gravação, IndexedDB, sincronia, diferença ao vivo), pulo nas bases, menu com abas, versões estáticas dos mapas, kit estendido. |
| 8b · `e3bfd84` | Desafios D1–D6, métricas e índice de dificuldade, tabela no README, testes de cada segmento, das emendas das curvas e do índice crescente. |
| 8c · `6ecdbba` | Desafios D7–D12, `gapDrop`, `stepDeg`, rampas lisas no ZENITH, chegada de destaque, tabela dos 15 mapas, índice crescente até o D12. |
| 9a · `d1eb0fa` | Layout automático dos stages pelo envelope, lava menor, nuvens fora da pista, emendas em meia-esquadria sem ramp bug, plataformas de checkpoint atravessáveis, `skill:layout`. |
| 9b · `4c552ce` | Sem prespeed cap, velocidade mantida entre stages, versão das regras na chave dos recordes, Próximo mapa, referência com controle de velocidade, ajustes de bhop e curvas, recalibração. |
| 10 · `48ddb63` | Visual novo das armas, balisong, granadas, itens e luvas no estilo de blocos (paletas por arma, fitas, parafusos, trilhos, recortes), duas versões de detalhe, tela Arsenal, testes de orçamento/caixa/cobertura e e2e com screenshots. Só visual. |
| 11a · `5dfb809` | Luneta da LONGBOW sem cliques perdidos (sprint automático engolia o clique; mira desejada guardada; alternar/segurar), bots com mira humana (reação com cauda, flick + correções, tremor, lead/recuo aprendidos, personalidade, audição), início do sacar da balisong contínuo. |
| 11b | ADS nas armas de ferro (alça/massa/red dot do modelo no centro, FOV, tempo, sensibilidade, movimento e spread em config) e personagens no estilo de blocos (3 versões, hitbox igual, cor do time em placas). |

## Decisões tomadas (não desfazer sem pedido)

- **Rodada 11b:**
  - ADS: `WEAPONS[id].ads`. O zoom 0,8 do KESTREL virou ADS (`zoom` = 0), com a mesma lupa e a mesma velocidade de 75% mirando.
  - `Player.adsK` anda no tempo da arma (linear no sim, suavizado no cliente). A luneta da LONGBOW continua instantânea.
  - O spread do ADS é multiplicado pelo progresso (`adsK`). Os bots usam ADS a mais de 700 u.
  - Linha de visada dos modelos horizontal (mesma altura na alça e na massa), sem rotação no ADS. Mudanças nos modelos para isso:
    - KESTREL: massa mais baixa (5,6) e alça vazada;
    - BREAKER-12: ghost ring;
    - VEX-9: massa da altura das orelhas da alça;
    - HORNET: ganhou um red dot. O ponto é o segundo emissivo da arma; interpretado como o retículo, não como LED.
  - Personagens:
    - 3 versões por distância (perto < 400 u, média < 1400 u, longe);
    - desenhados com descarte de faces de trás;
    - a fita do pulso usa a cor escura do time (a luva azul do viewmodel confundiria o time vermelho).
- **Rodada 11a:**
  - Luneta:
    - o clique troca a mira *desejada* (`Player.aimWant`); a mira efetiva só fica bloqueada por recarga, troca, slide e sprint com `SPRINT.raiseWeapon`;
    - um clique durante esses bloqueios fica guardado e vale no fim (escolhido em vez de cancelar a recarga);
    - recarregar e trocar de arma tiram da mira, como no CS; o slide também tira;
    - `PlayerInput.aim` (true/false) é o modo "segurar" e também o que os bots usam; null = "alternar".
  - Bots:
    - mira em `shared/bots/aim.ts`, parâmetros em `BOT_AIM`; cada bot tem um PRNG próprio tirado da seed;
    - aperta o gatilho com o raio da mira sobre o hitbox (folga `fireMargin` + `fireAngle`), com tremida no clique (`clickJitter`);
    - as taxas de acerto subiram em média/longa distância e ficaram em ordem por dificuldade (tabela no README); o GOD continua letal;
    - o sentido do PREDATOR continua revelando inimigos através das paredes para os bots: é a habilidade da classe, e o jogador PREDATOR também vê através delas;
    - audição: tiros (3200 u), pulos/pousos (900 u) e passos de quem corre (650 u) só viram direção do olhar ocioso, nunca alvo.
  - Balisong: só o começo do sacar mudou (spline até 0,38 s); o final e a inspeção ficaram exatamente como estavam.

- **Rodada 10 (visual das armas):**
  - Só visual: nenhum número de gameplay nem animação mudou. Personagens, mapas e HUD ficaram de fora.
  - Guia de estilo resumido:
    - blocos chanfrados (`STYLE.chamfer` 0,4) e cilindros de 8 lados (6 na versão simplificada);
    - parafusos sextavados cinza-claro (`boltR` 0,24), trilhos com dentes a cada 1,3 u e recortes com parede clara embaixo;
    - fita em bandas a 0,13 u acima da peça, na cor de destaque;
    - fosco: os filetes neon saíram e o único LED é o de carga do VOLT-1.
  - Paletas em `PALETTES`. A cor de identificação de cada arma continua na paleta (teste). Como as cores de id são escuras, entraram como peça escura dominante (cano/caixa/coronha) e o corpo ganhou uma cor clara (areia, oliva, cinza frio, branco-gelo).
  - Na LONGBOW, a referência tem cano e luneta marrom-grafite; aqui são verde-grafite, para manter a cor de id (mais próximo da referência sem perder a identidade).
  - Orçamento:
    - `view` ≤ 2500 triângulos (LONGBOW ~2070, a mais pesada);
    - `world` ≤ 600 (terceira pessoa, arma no chão, granada lançada, itens);
    - `far` ≤ 150, a partir de 1100 u (`LOD_FAR_DIST`).
  - A versão `far` não foi pedida. Entrou porque 38 itens com ~450 triângulos cada somavam mais que o mapa CLOUDS inteiro (13,7 mil).
  - Na versão `world`, `minChamfer` 0,38 descarta os chanfros pequenos e somem parafusos, dentes e recortes.
  - Pontos de referência (`WEAPON_REFS`):
    - a boca de cada arma ficou onde o clarão já saía (z −44/−34/−21/−38/−16; VOLT-1 −13,6);
    - a luneta fica em y 7,8;
    - a luva usa a mesma caixa da mão antiga (z 0..3,5 · y −6,5..0,5 nas armas; z 3,5..10,5 na balisong) e é desenhada sem escala.
  - Tamanho na mão: as caixas envolventes ficaram a ±15% das antigas. A fração da tela coberta em primeira pessoa (arma + mão) é igual ou menor que antes; o teste rasteriza na mesma projeção do jogo. Para isso, a luneta e a coronha da HORNET ficaram mais enxutas.
  - Granadas: uma malha por tipo (a faixa colorida já vem no modelo). Antes, uma malha única era tingida na hora de desenhar.
  - BREAKER-12: o porta-cartuchos fica no lado esquerdo, o que aparece em primeira pessoa.
  - Arsenal: fundo neutro (`beginFrame` com `bg`) e luz de estúdio (`setLight`), só na tela de revisão.
  - Faces orientadas para fora em todas as primitivas novas (`tri(..., out)`). Armas, itens, luvas e granadas são desenhados com `cull: true`; o mapa e os personagens continuam sem descarte.
  - Desempenho:
    - medido no renderizador por software dos testes (SwiftShader), no Treino com a LONGBOW na mão: ~9,1 FPS contra ~9,9 antes (−8%);
    - por quadro são ~21,4 mil triângulos contra 18,4 mil. A diferença é quase toda a arma na mão (2,5 mil triângulos com a luva, contra 120). No SwiftShader o custo cresce com o número de vértices;
    - numa GPU de verdade isso é desprezível, mas não deu para medir aqui. Se cair FPS em máquina fraca, o primeiro corte é a versão `view` (dentes do trilho e parafusos).

- **Rodada 8a:** pulo na zona de início liberado (o cap de 420 continua, inclusive saindo no ar), por isso os recordes da rodada 7 continuam valendo. O fantasma do PB só é trocado quando a corrida vira PB. A "velocidade mínima de projeto" passou a ser balística (considera a inclinação da saída), então os números dos mapas de treino subiram (424 / 870 / 1197 u/s) sem mudar a geometria. O steer dos bots ganhou `idealStrafe` só para o percurso de referência.
- **Rodada 7:** a linha da especificação sobre a zona de início veio cortada; interpretado como prespeed cap 420 u/s + pulo bloqueado, em toda zona de início. O fim de cada stage leva direto, parado, à zona de início do próximo. O tempo de cada stage vai de um split ao seguinte (os 5 somam o total). Cair no stage 1 depois de largar não zera o tempo (só o R zera). Ir para outro stage ou usar Z/X marca a corrida como prática. O strafe ideal no `steerToward` só é usado pelo percurso de referência; os bots da partida continuam como antes.
- **Rodada 6:** o sprint tático antigo continua no código e volta com `SPRINT.raiseWeapon` e `SPRINT.useStamina` = true. Teclas antigas de sprint migram para caminhar.
- **Gerais:** sem Three.js (renderizador próprio); toda configuração em `shared/config/`; a simulação não pode depender do DOM.

## Problemas já resolvidos (não reintroduzir)

- Jogador travando na rampa → overclip 0,01 e empurrão na colisão.
- Toques rápidos perdidos entre ticks → pulo e agachar consumidos por pelo menos um tick.
- Recuo da Longbow não voltava → atraso de recuperação = mín(intervalo × 1,2; 0,3 s).
- Teleporte e jump pad perdiam velocidade → teleportGlide (0,45 s sem atrito) e velocidade de entrada registrada antes do movimento.
- Transições do Surf Skill: o próximo apoio precisa ficar abaixo da trajetória (drop ≥ ~300 com gap 300); use `chainRamp` e `endAfter` do kit. Spawns ficam 2 u acima do piso.
- Banner/toasts da partida anterior apareciam no modo seguinte → `hud.clearTransient()` no início de cada jogo (e ao reiniciar o mapa no Surf Skill).
- Mudar o kit sem querer altera o hash dos mapas de treino e zera recordes → o teste de versões fixa os hashes (da rodada 9).
- Stages se sobrepondo (grade fixa menor que os stages, lava com pad 2500) → layout automático com folga de 3000 u e teste de sobreposição.
- Surf travando nas curvas (degrau nas emendas + bisel virando chão) → meia-esquadria, `liftOntoFace` e `surfOnly`; teste de sonda em todos os mapas.
- Mapas muito rápidos (≥ 3000 u/s): curvas feitas para o teto de 3500 com rampas mais largas (meia-largura 160) senão o jogador sobe na crista; transição para uma rampa que desce muito mais que a anterior faz quem vem rápido passar por cima (comece o trecho com descida suave); duas rampas seguidas na mesma face com o driver derivando no ar pousam na crista (alterne as faces); cabos (curva no ar) não fecham nessa velocidade.
- Teste de "segmento completável" dá 90 s por segmento (os trechos do ZENITH saindo parados levam ~63 s).

## Pendências e ideias

- Multiplayer online (a simulação já é separada do cliente; recordes e fantasmas já têm as interfaces `RecordStore` e `GhostStore` para um backend).
- Calibrar jogando a rodada 11b: tempos e FOV do ADS, se a BREAKER-12 com ADS ficou forte demais, a leitura da cor do time de longe (versão "longe" dos personagens) e as distâncias das versões.
- Calibrar jogando a rodada 11a: letalidade do Avançado e do GOD (acertam bem mais de longe que antes), tempo de reação do Fácil (1º acerto ~2 s de perto) e se o olhar ocioso atrapalha a leitura de quem está sendo observado.
- Ajustar olhando o jogo (rodada 10): contraste das cores escuras de id (KESTREL, HORNET) em mapas claros, tamanho dos recortes hexagonais da LONGBOW, luvas (hoje grafite com fita azul para todas as armas) e se vale estender o estilo aos personagens.
- Calibrar jogando a rodada 9: como fica chegar embalado em cada stage (principalmente bhop e curvas logo depois da entrada), se a extensão de 1800 u das chegadas é o bastante, e os tempos de referência que caíram abaixo da faixa (D8 2:28, D11 3:22).
- Calibrar jogando os desafios: velocidade mínima do THUNDERHEAD/ZENITH (1700 u/s pode ser pouco ou demais para humanos), largura das curvas do ZENITH (feitas para 3500 u/s), U-turns do ECLIPSE BOWL e quedas bruscas do HOLLOW MOON.
- Calibrar jogando: gaps do STORM SPIRE (stages 3 e 5, feitos no limite do percurso de referência), ritmo da pista de bhop do DRIFT CANYON (stage 4, espaçada para ~1170 u/s), prespeed cap (420), atraso da tela de fim (1,8 s), dano ×1,4 e caminhar ×0,55.
- Renderização por software nos testes roda a ~15 FPS (às vezes ~1,5 FPS nesta máquina, e aí as verificações e2e 4/5, 7, 13 e 18 oscilam — também no commit da 8b); em GPU real é normal.
