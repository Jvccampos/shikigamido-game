# Shikigamido

Jogo de cartas e tabuleiro online para dois jogadores, com espectadores.
Arena em PixiJS 8, interface em Preact, servidor em Cloudflare Worker com um
Durable Object. O servidor aplica as regras e envia a cada participante só o
que ele pode ver.

**Jogar:** https://shikigamido.ellep.dev

## Como jogar

- **Treino:** sem login, contra um bot básico.
- **Multiplayer:** entre com um nome, monte um baralho de 30 cartas (no máximo
  duas cópias de cada) e crie uma sala. Compartilhe o código; o criador escolhe
  os dois jogadores e inicia, os demais assistem.
- **Preparação:** troque cartas da mão (ou mantenha) e escolha um dos dois selos
  iluminados para o seu Omionji.
- **Turno:** compra e energia são automáticas. Arraste cartas para invocar ou
  conjurar e peças para mover ou atacar; destinos legais ficam iluminados.
  Energia renova a cada turno; Reserva fica até ser gasta.
- **Descarte:** converta até 3 cartas em Reserva. Descartar encerra a fase.
- **Leitura:** `F` sobre uma carta, o botão de ampliar ou o botão direito na
  peça. A pilha mostra quem tem prioridade; o histórico organiza ações por
  turno. O menu tem tela cheia e concessão.

O perfil é um cookie de 30 dias neste navegador. Apagar cookies perde o perfil.

## Desenvolvimento

Node.js 24.

```sh
npm ci
npm run dev      # Vite em http://localhost:5175 + wrangler dev na porta 3000
npm run check    # formatação, lint, tipos e testes; o CI roda o mesmo
```

Testes de navegador (Playwright, não rodam no CI):

```sh
npx playwright install chromium
npm run test:browser        # todos os cenários
npm run test:multiplayer    # só lobby, reconexão e arraste
```

Capturas e relatórios ficam em `.sited/`. `TEST_URL=https://...` roda a suíte
contra um deploy.

## Código

- `shared/`: o motor. `game.ts` recebe comandos; `rules/` tem tabuleiro,
  combate, magias, turnos, unidades, maldições e previsão; `model.ts` define
  estado, comandos e eventos; `visibility.ts` monta a visão de cada jogador;
  `cards.ts` carrega e valida o catálogo. Servidor, cliente e bot usam o mesmo
  motor.
- `client/`: navegação e lobby (`index.tsx`), editor de baralhos, sessão de
  partida, arena PixiJS (`arena-scene.ts`, `unit-renderer.ts`,
  `field-renderer.ts`), seleção de ações e `network.ts` para HTTP e WebSocket.
- `server/`: `index.ts` trata salas e baralhos; `app.ts` é o HTTP com
  `Request`/`Response` padrão; `worker.ts` tem o Worker e o Durable Object
  `Game`, que guarda os WebSockets; `database.ts` é a persistência SQLite, com
  drivers para o Durable Object e para o `node:sqlite` dos testes.
- `tests/`: regras, catálogo, privacidade, salas e HTTP em `node --test`;
  `tests/browser/` são os cenários Playwright.

## Publicação

Um Worker serve `dist/client` como assets e encaminha `/api/*`, `/socket`,
`/healthz` e `/admin/*` a um único Durable Object. Sessões, baralhos e partidas
ficam no SQLite dele. A configuração está em `wrangler.jsonc`.

```sh
npm run build
CLOUDFLARE_API_TOKEN=... npm run deploy
```

O segredo `ADMIN_TOKEN` (`npx wrangler secret put ADMIN_TOKEN`) protege
`GET /admin/export`, que devolve todos os dados em JSON, e `POST /admin/import`,
que só aceita esse JSON em um banco vazio. Em desenvolvimento, crie `.dev.vars`
com `ADMIN_TOKEN=dev-token`.

## Regras ainda provisórias

- As oito cartas com Amaldiçoado são as maldições; o custo define o nível
  (até 1, até 3, acima de 3).
- A vantagem elemental segue o diagrama do manual, que tem um exemplo textual
  contraditório.
- Espécie e gênero usam listas explícitas em `shared/traits.ts`, a revisar.
- O catálogo tem 94 cartas de baralho, oito maldições e cinco Omionjis. As
  cartas usam as imagens do autor; a arte do cenário foi gerada para esta
  interface.
