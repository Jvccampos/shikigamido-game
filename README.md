# Shikigamido

Jogo de cartas e tabuleiro online, com arena PixiJS 8, interface Preact, servidor Node/Fastify e sincronização por WebSocket. O servidor aplica as regras e envia a cada participante somente as informações que ele pode ver.

**Jogar:** https://shikigamido-game-production.up.railway.app

## Desenvolvimento

Node.js 22.12+ (Docker usa Node 24).

```sh
npm ci
npm run dev
```

Abra http://localhost:5175. Vite encaminha API e WebSocket ao servidor na porta 3000. `npm run build && npm start` serve a aplicação compilada em uma única porta. Assets originais são copiados para `public/` durante o build.

## Organização do código

- `shared/game.ts` é a entrada dos comandos. As regras ficam em `shared/rules/`: `board.ts` para caminhos e movimentos, `combat.ts` para combate, `responses.ts` para resolver a resposta após os passes, `spells.ts` para magias e habilidades, `turns.ts` para fases, `units.ts` para cura, invocação e morte, `setup.ts` para criação da partida e `core.ts` para operações compartilhadas. Servidor e treino usam o mesmo motor.
- `shared/model.ts` define o estado completo, comandos, eventos e efeitos nas unidades. `CommandDraft` admite seleções incompletas; `Cmd` exige os campos básicos de cada ação, e `isCommand` valida a forma das entradas antes de o motor verificar sua legalidade. `shared/room.ts` distingue lobby, partida salva e visão pública; `shared/protocol.ts` define os contratos HTTP e WebSocket. `shared/cards.ts` tipa e valida o catálogo ao carregar.
- `shared/visibility.ts` prepara a visão de cada jogador ou espectador, ocultando mãos, baralhos e peças secretas antes da transmissão. A arena recebe `GameView`; somente o motor recebe `Game`. Uma peça oculta tem atributos `null`, inclusive nas cópias históricas dos eventos.
- `shared/rules/forecast.ts` simula comandos usando apenas a visão pública e marca resultados incertos. As prévias e os comandos reais usam a mesma resolução de respostas em `shared/rules/responses.ts`. `shared/action-advice.ts` reúne as opções legais e formata títulos e custos para a interface.
- `client/index.tsx` reúne navegação e lobby. `client/deck-builder.tsx` mantém o editor de baralhos, inclusive o rascunho ao trocar de tela. `client/match-session.tsx` controla a sessão, os comandos e o bot enquanto a arena está aberta.
- `client/action-selection.ts` controla seleção, alvos, arraste, prévias e validação dos comandos em preparação. `client/match-interaction.tsx` conecta esse modelo ao ciclo da partida no Preact; `client/match-controls.tsx` apresenta as ações preparadas e chama seus callbacks. `client/card.tsx` apresenta cartas e leitura ampliada.
- `client/duel-presentation.ts` coordena a revisão exibida no tabuleiro, a animação de compra e os avisos de fase. Define quando a entrada e o bot podem prosseguir. `client/use-duel-presentation.ts` conecta esse modelo aos timers do navegador; `client/arena-notices.tsx` desenha o aviso e sua saída.
- `client/arena.tsx` compõe a interface da partida; `client/arena-hand.tsx` mantém a mão, seu arraste e leitura; `client/use-arena-scene.ts` cuida da criação, atualização e destruição da cena; `client/arena-scene.ts` controla o tabuleiro, a entrada e a sequência de animações PixiJS; `client/unit-renderer.ts` desenha cada peça; `client/field-renderer.ts` desenha e anima os elementos do campo (lagos, ventos, fogo, flores, pontes e o elo entre fendas) em uma camada entre os caminhos e as peças. Estados de apresentação e motivos de incerteza são tipados, separados dos textos exibidos. `client/theme.css` define as fontes (Cormorant Garamond para títulos e números de destaque, Alegreya Sans para a interface), a paleta e as superfícies compartilhadas (`.plaque`, `.stud`, `.rune-label`); os demais arquivos CSS do cliente consomem esses tokens. Os estilos das escolhas e do histórico ficam em `client/choices.css` e `client/journal.css`. `client/network.ts` mantém a conexão da sala e aplica a mesma verificação de revisão às respostas HTTP e WebSocket.
- `server/index.ts` trata salas e baralhos. `server/main.ts` fornece HTTP, sessões e WebSocket; `server/database.ts` concentra a persistência SQLite.

As opções extras de magia ficam em `shared/spells.ts`; interface e sugestões de ações consultam essas definições. `shared/effects.ts` aplica efeitos e controla sua expiração usando os campos das partidas salvas. A leitura de keywords em `kw` reúne os valores impressos e concedidos, inclusive os nomes antigos de campos. `resolveSpell` recebe um objeto com os alvos e as escolhas da magia.

O histórico usa eventos estruturados, incluindo magias anuladas e alvos ausentes. Partidas antigas ainda podem conter `log`, mas ele não é transmitido nem atualizado e é removido ao salvar a próxima ação.

Os testes de salas usam SQLite em memória através do mesmo módulo de persistência da aplicação. A checagem de tipos inclui os testes e rejeita declarações e parâmetros sem uso.

`shared/random.ts` usa a aleatoriedade nativa nas partidas reais. Testes podem fornecer uma semente explícita para reproduzir compras, combates e movimentos de maldições. A semente nunca aparece na visão pública da sala. Partidas registram a versão das regras; estados antigos sem esse campo continuam compatíveis com a versão 1.

## Jogar

- Treino local disponível sem login. O bot é um adversário básico para experimentar movimentação e combate.
- Para multiplayer, entre com um nome, salve um baralho de 30 cartas e crie uma sala. Compartilhe o código. O criador escolhe os dois jogadores e inicia; os demais acompanham como espectadores.
- Máximo de duas cópias por carta; cada cópia na mão é identificada pela posição, e cada peça tem um ID próprio.
- Arraste cartas para invocar ou conjurar, e peças para mover/atacar. Destinos legais de invocação e movimento ficam iluminados. Clique/toque permite seleção e indicação de destino; efeitos com múltiplos alvos abrem controles contextuais.
- F sobre uma carta, botão de ampliar ou botão direito na peça abre a leitura. Ataque, vida e velocidade atuais aparecem na peça, com redução em vermelho e aumento em verde.
- Preparação em duas etapas: selecione cartas para trocar (ou mantenha a mão), depois escolha um dos dois selos iluminados para seu Omionji.
- A compra e a renovação de energia acontecem automaticamente antes da invocação. Energia renova por turno; Reserva permanece até ser gasta.
- No descarte, escolha uma ou mais cartas inteiras para converter em Reserva, até o limite de 3. Magias também podem ser descartadas. Descartar encerra a fase de descarte; com a reserva cheia ou a mão vazia, a escolha não abre.
- Combates, conjurações e maldições são apresentados em sequência no tabuleiro. A pilha mostra quem tem a prioridade e qual magia resolve primeiro.
- O histórico organiza ações por turno e permite filtrar combates ou consultar as cartas descartadas. O menu também reúne tela cheia e concessão.

O perfil por nome usa um cookie de sessão de 30 dias neste navegador. Sair ou apagar cookies perde acesso ao perfil. Não é uma conta recuperável por apelido.

## Publicação e persistência

`Dockerfile` gera uma imagem que serve cliente, API e WebSocket. `docker compose up --build` usa volume persistente em `/data`. No Railway, o serviço tem um volume em `/data`, `DATABASE_PATH=/data/shikigamido.db`, `PUBLIC_URL` com o domínio HTTPS e domínio apontando à porta definida por `PORT` (8080 no deploy atual). Use uma única réplica: SQLite e as notificações WebSocket pertencem a este processo. Reiniciar preserva sessões, baralhos e partidas; navegadores reconectam automaticamente.

O serviço de produção está conectado a `Jvccampos/shikigamido-game`, branch `main`, com deploy automático e **Wait for CI** habilitados. Cada push na `main` publica uma nova versão depois que o workflow `Check` passa; uma falha no CI impede a publicação. O Railway compila o `Dockerfile` e verifica `/healthz` antes de ativar a versão. Acompanhe as verificações na aba Actions do GitHub e a publicação no histórico de deploys do Railway.

Não é necessário executar `railway up` após um push. Para uma publicação manual excepcional, use `railway up --detach` com o projeto, ambiente e serviço de produção selecionados no CLI.

O site anterior em d.ellep.dev permanece separado. Dados e sessões dele não foram importados para o novo servidor.

## Verificação

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm run test:multiplayer
```

O comando `check` verifica formatação, lint e tipos, depois executa os testes de regras, catálogo, privacidade, salas, SQLite, HTTP e WebSocket. O CI executa o mesmo comando.

`tests/interactions.test.ts` cobre mortes simultâneas, ressurreição, respostas na pilha, alvos removidos, efeitos temporários e privacidade dos eventos. `tests/recovery.test.ts` inicia um servidor em outro processo, joga um movimento, encerra o processo com `SIGKILL`, reabre o mesmo SQLite e verifica sessões, visão do espectador, rejeição de comandos antigos e continuação da partida. Usa um diretório temporário e remove os dados ao terminar.

```sh
npm run format       # Aplica Prettier ao código, estilos e documentação
npm run format:check # Verifica sem alterar arquivos
npm run lint         # ESLint para JavaScript e TypeScript
npm run lint:fix     # Aplica as correções automáticas disponíveis
```

As configurações ficam em `.prettierrc.json` e `eslint.config.mjs`. O Prettier cuida da formatação; o ESLint usa as regras recomendadas para detectar erros e código desnecessário. O lint proíbe `any` no cliente, servidor e motor; fixtures de teste podem representar entradas malformadas. Assets, catálogo original, arquivos gerados e dados locais ficam fora da formatação. Não há hooks de commit ou ferramentas adicionais para executar esses comandos.

`test:browser` compila a aplicação e inicia um servidor isolado na porta 3187 com SQLite em memória. Exercita a preparação e a leitura em quatro tamanhos de tela. O multiplayer tem cenários separados para organizar o lobby, receber uma resposta HTTP atrasada, reconectar um espectador e arrastar cartas e peças. Cada cenário renderiza uma única arena; os demais participantes usam a API real. `test:multiplayer` executa somente esses cenários. Falhas deixam capturas e traces em `.sited/playwright-results/` e um relatório em `.sited/playwright-report/`. Os testes de navegador são executados localmente ou contra um deploy com `TEST_URL`; não rodam no CI. O GitHub Actions executa apenas `npm run check` a cada push e pull request.

Os cenários visuais estão em `tests/browser/`. A fixture `scenario` usa o motor real com transporte isolado para reproduzir magias, combate e busca; as fixtures de multiplayer usam HTTP e WebSocket reais. Capturas ficam em `.sited/qa*/`. `TEST_URL` permite executar a suíte contra um deploy; os cenários de multiplayer criam perfis e salas de QA nesse servidor.

## Interpretações ainda provisórias

- As oito cartas com Amaldiçoado são as maldições. O custo determina o nível: até 1 → nível 1; até 3 → nível 2; acima de 3 → nível 3. Cada surgimento sorteia uma carta do nível correspondente.
- A vantagem elemental segue o diagrama do manual; há um exemplo textual contraditório.
- Espécie e gênero não são metadados completos do catálogo; os efeitos correspondentes usam listas explícitas em `shared/traits.ts`, que devem ser revisadas pelo autor.
- Os cinco Omionjis usam as imagens e efeitos enviados pelo autor. O catálogo contém 94 cartas de baralho, oito maldições e cinco Omionjis.

A arte do cenário foi gerada para esta interface. As cartas conservam as imagens fornecidas pelo autor; a procedência das ilustrações originais está no catálogo.
