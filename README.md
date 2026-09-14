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

- `shared/game.ts` aplica comandos e regras. Servidor e treino usam o mesmo motor; a arena apenas apresenta o resultado.
- `shared/visibility.ts` prepara a visão de cada jogador ou espectador, ocultando mãos, baralhos e peças secretas antes da transmissão.
- `client/index.tsx` reúne navegação, baralhos, lobby e comandos. `client/arena.tsx` controla a interface da partida; `client/arena-scene.ts` desenha e anima o tabuleiro PixiJS.
- `server/index.ts` trata salas e baralhos. `server/main.ts` fornece HTTP, sessões e WebSocket; `server/database.ts` concentra a persistência SQLite.

Os testes de salas usam SQLite em memória através do mesmo módulo de persistência da aplicação. O build rejeita declarações e parâmetros sem uso.

## Jogar

- Treino local disponível sem login. O bot é um adversário básico para experimentar movimentação e combate.
- Para multiplayer, entre com um nome, salve um baralho de 30 cartas e crie uma sala. Compartilhe o código. O criador escolhe os dois jogadores e inicia; os demais acompanham como espectadores.
- Máximo de duas cópias por carta; cada cópia na mão é identificada pela posição, e cada peça tem um ID próprio.
- Arraste cartas para invocar ou conjurar, e peças para mover/atacar. Destinos legais de invocação e movimento ficam iluminados. Clique/toque permite seleção e indicação de destino; efeitos com múltiplos alvos abrem controles contextuais.
- F sobre uma carta, botão de ampliar ou botão direito na peça abre a leitura. Ataque, vida e velocidade atuais aparecem na peça, com redução em vermelho e aumento em verde.
- Preparação em duas etapas: selecione cartas para trocar (ou mantenha a mão), depois escolha um dos dois selos iluminados para seu Omionji.
- A compra e a renovação de energia acontecem automaticamente antes da invocação. Energia renova por turno; Reserva permanece até ser gasta.
- No descarte, escolha uma ou mais cartas inteiras para converter em Reserva, até o limite de 3. Magias também podem ser descartadas.
- Combates, conjurações e maldições são apresentados em sequência no tabuleiro. A pilha mostra quem tem a prioridade e qual magia resolve primeiro.
- O histórico organiza ações por turno e permite filtrar combates ou consultar as cartas descartadas. O menu também reúne tela cheia e concessão.

O perfil por nome usa um cookie de sessão de 30 dias neste navegador. Sair ou apagar cookies perde acesso a um perfil sem Google. Não é uma conta recuperável por apelido.

## Publicação e persistência

`Dockerfile` gera uma imagem que serve cliente, API e WebSocket. `docker compose up --build` usa volume persistente em `/data`. No Railway, o serviço tem um volume em `/data`, `DATABASE_PATH=/data/shikigamido.db`, `PUBLIC_URL` com o domínio HTTPS e domínio apontando à porta definida por `PORT` (8080 no deploy atual). Use uma única réplica: SQLite e as notificações WebSocket pertencem a este processo. Reiniciar preserva sessões, baralhos e partidas; navegadores reconectam automaticamente.

```sh
railway up --detach
```

O site anterior em d.ellep.dev permanece separado. Dados e sessões dele não foram importados para o novo servidor.

## Login Google

Opcional e desativado por decisão do autor nesta versão de testes. Para habilitar no futuro, configure `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no Railway. Crie um cliente OAuth Web com redirecionamento autorizado:

```
https://shikigamido-game-production.up.railway.app/auth/google/callback
```

Use o painel de variáveis do Railway para os segredos; não os coloque no código. O botão Google aparece quando as duas variáveis estão presentes. Um perfil local pode ser associado ao Google ao entrar pela primeira vez.

## Verificação

```sh
npm run typecheck
npm test
npm run test:browser
node --import tsx scripts/arena-multiplayer.mjs
node --import tsx scripts/spell-ux.mjs
node --import tsx scripts/combat-smoke.mjs
node scripts/ui-sweep.mjs
node scripts/readability-smoke.mjs
```

Os testes cobrem baralhos, cópias, grafo, fases, combate, efeitos, privacidade, lobby, revisões concorrentes, SQLite, HTTP e WebSocket. Os scripts de navegador criam perfis/salas de QA, exercitam o arraste real, acompanham com um espectador e salvam capturas em `.sited/qa/` (pasta local ignorada). `TEST_URL` permite executar os mesmos fluxos contra o deploy.

## Interpretações ainda provisórias

- Os arquivos recebidos não incluem fichas de maldição: níveis 1/2/3 usam ataque 2/3/4, vida 6/9/12 e velocidade 1. Precisam de confirmação do autor.
- A vantagem elemental segue o diagrama do manual; há um exemplo textual contraditório.
- Espécie e gênero não são metadados completos do catálogo; os efeitos correspondentes usam listas explícitas em `shared/traits.ts`, que devem ser revisadas pelo autor.
- Os cinco Omionjis usam as imagens e efeitos enviados pelo autor. O catálogo contém 102 cartas de baralho e cinco Omionjis.

A arte do cenário foi gerada para esta interface. As cartas conservam as imagens fornecidas pelo autor; a procedência das ilustrações originais está no catálogo.
