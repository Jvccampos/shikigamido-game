import { DeckBuilder } from "./deck-builder.js";
import type { MutationResponse, PublicRoom } from "../shared/room.js";
import type { CardFocus } from "./card.js";
import { E, Focus } from "./card.js";
import { MatchSession } from "./match-session.js";
import { enterAsGuest } from "./network.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  openLogin,
  signOut,
  useAuth,
  useMutation,
  useQuery,
  useRoom,
} from "./network.js";
import {
  cards as catalog,
  phases as PHASES,
  type Game,
} from "../shared/game.js";
import { practiceGame } from "../shared/practice.js";
import { publicRoom } from "../shared/visibility.js";
export function App() {
  const [loginOpen, setLoginOpen] = useState(false),
    [nickname, setNickname] = useState("");
  useEffect(() => {
    const open = () => setLoginOpen(true);
    window.addEventListener("shiki:login", open);
    return () => window.removeEventListener("shiki:login", open);
  }, []);
  const auth = useAuth(),
    decks = useQuery("myDecks"),
    myRooms = useQuery("myRooms");
  const createRoom = useMutation("createRoom"),
    joinRoom = useMutation("joinRoom"),
    lobbyCommand = useMutation("lobbyCommand");
  const [view, setView] = useState("inicio"),
    [element, setElement] = useState("agua"),
    [selectedDeck, setSelectedDeck] = useState(""),
    [code, setCode] = useState(
      () =>
        new URLSearchParams(location.search).get("sala") ||
        localStorage.getItem("shiki-room") ||
        "",
    ),
    [practice, setPractice] = useState<Game | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [focus, setFocus] = useState<CardFocus | null>(null);
  const liveRoom = useRoom(code, view === "sala" && !practice);
  const room = useMemo(
    () => (practice ? practiceRoom(practice) : liveRoom.data),
    [practice, liveRoom.data],
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const g = room && room.status !== "waiting" ? room.state : undefined,
    seat = room?.seat ?? -1;
  const flash = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  };
  useEffect(() => {
    if (!selectedDeck && decks.data?.[0]) setSelectedDeck(decks.data[0].id);
  }, [decks.data]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (e.key === "Escape") {
        setFocus(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function playerName(s: number) {
    const id = g?.players?.[s]?.id;
    return room?.members?.find((m) => m.id === id)?.name || `Jogador ${s + 1}`;
  }
  function practiceRoom(game: Game): PublicRoom | null {
    return publicRoom(
      {
        code: "TREINO",
        hostId: "practice-player",
        status: game.winner !== null || game.draw ? "finished" : "playing",
        spectators: [
          { id: "practice-player", name: "Você" },
          { id: "practice-bot", name: "Guardião do santuário" },
        ],
        state: game,
      },
      "practice-player",
    );
  }
  async function request(fn: () => Promise<MutationResponse>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      if (result?.room) liveRoom.receive(result.room);
      if (result?.error) flash(result.error);
      return result;
    } catch (e) {
      flash(
        e instanceof Error
          ? e.message
          : "Não foi possível conectar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  function startPractice() {
    const game = practiceGame(element);

    setPractice(game);

    setCode("TREINO");
    setView("sala");
  }
  async function enter(spectator = false) {
    setPractice(null);

    const r = await request(() =>
      joinRoom.mutate(code, selectedDeck || undefined, spectator),
    );
    if (r?.room) {
      localStorage.setItem("shiki-room", code);
      setView("sala");
    }
  }
  async function makeRoom() {
    setPractice(null);

    const r = await request(() => createRoom.mutate(selectedDeck));
    if (r?.room) {
      setCode(r.room.code);
      localStorage.setItem("shiki-room", r.room.code);
      setView("sala");
    }
  }
  return (
    <div
      className={`app ${view === "sala" && g?.players ? "in-game playing-arena" : ""}`}
    >
      {loginOpen && (
        <div className="modal-backdrop" onClick={() => setLoginOpen(false)}>
          <form
            className="login-dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await enterAsGuest(nickname);
                setLoginOpen(false);
              } catch (e) {
                flash(String(e));
              }
            }}
          >
            <button
              type="button"
              className="drawer-close"
              onClick={() => setLoginOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">ENTRE NO SANTUÁRIO</p>
            <h2>Como devemos chamar você?</h2>
            <input
              aria-label="Seu nome"
              placeholder="Nome de invocador"
              value={nickname}
              minLength={2}
              maxLength={32}
              required
              onInput={(e) => setNickname(e.currentTarget.value)}
            />
            <button className="gold" type="submit">
              Entrar e jogar →
            </button>
            <p>Seu perfil e seus baralhos ficam vinculados a este navegador.</p>
            {auth.googleEnabled && (
              <a className="outline" href="/auth/google">
                Continuar com Google
              </a>
            )}
          </form>
        </div>
      )}
      <header>
        <button className="brand" onClick={() => setView("inicio")}>
          <span className="seal">式</span>
          <span>
            <b>SHIKIGAMIDO</b>
            <small>O caminho dos familiares</small>
          </span>
        </button>
        <nav aria-label="Navegação principal">
          {[
            ["inicio", "Santuário"],
            ["decks", "Baralhos"],
            ["regras", "Como jogar"],
            ...(room ? [["sala", "Voltar à sala"]] : []),
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "on" : ""}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {auth.isAuthenticated ? (
          <button
            className="profile"
            onClick={() => void signOut()}
            title="Sair da conta"
          >
            {auth.displayName || "Minha conta"}
          </button>
        ) : (
          <button className="outline" onClick={() => openLogin()}>
            Entrar
          </button>
        )}
      </header>
      {view === "inicio" && (
        <main className="home">
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">UM DUELO DE CARTAS E CAMINHOS</p>
              <h1>
                SHIKIGAMIDO
                <em>O caminho dos familiares</em>
              </h1>
              <p>
                Invoque familiares, trace seu caminho e proteja seu Omionji. No
                santuário, até o centro tem um preço.
              </p>
              <div className="actions">
                <button className="gold" onClick={startPractice}>
                  Jogar treino local <span>↗</span>
                </button>
                <button className="outline" onClick={() => setView("decks")}>
                  Montar meu baralho
                </button>
              </div>
              <small>2 jogadores · 5 elementos · 107 cartas</small>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="arcane-ring" />
              <img
                className="hero-card back"
                src={catalog.get("chifre-de-fogo")!.asset}
              />
              <img
                className="hero-card front"
                src={catalog.get("omionji-agua")!.asset}
              />
              <span className="hero-kanji">式神道</span>
            </div>
          </section>
          <section className="home-bottom">
            <div>
              <p className="eyebrow">O SANTUÁRIO ESTÁ ABERTO</p>
              <h2>Encontre seu oponente.</h2>
              <p className="muted">
                Crie uma sala, convide seus amigos e escolha quem vai duelar.
                Quem ficar de fora pode acompanhar a batalha.
              </p>
              {!!myRooms.data?.length && (
                <div className="recent-rooms">
                  <h3>Suas salas recentes</h3>
                  {myRooms.data.slice(0, 4).map((r) => (
                    <button
                      key={r.code}
                      onClick={() => {
                        setCode(r.code);
                        setPractice(null);

                        setView("sala");
                      }}
                    >
                      {r.code}
                      <small>
                        {r.status === "waiting"
                          ? "Lobby"
                          : r.status === "finished"
                            ? "Concluída"
                            : "Em batalha"}{" "}
                        ↗
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="roomcard">
              <label>
                SEU BARALHO
                <select
                  value={selectedDeck}
                  onChange={(e) => setSelectedDeck(e.currentTarget.value)}
                >
                  <option value="">Selecione um baralho salvo</option>
                  {decks.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {E[d.element]?.[2]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="join-row">
                <label>
                  CÓDIGO DA SALA
                  <input
                    value={code === "TREINO" ? "" : code}
                    maxLength={6}
                    placeholder="EX.: A7C921"
                    onInput={(e) =>
                      setCode(
                        e.currentTarget.value
                          .replace(/[^a-z0-9]/gi, "")
                          .toUpperCase(),
                      )
                    }
                  />
                </label>
                <button
                  className="gold"
                  disabled={busy || code.length !== 6}
                  onClick={() => enter()}
                >
                  Entrar ↗
                </button>
              </div>
              <div className="actions">
                <button
                  className="outline"
                  disabled={busy || !selectedDeck}
                  onClick={makeRoom}
                >
                  Criar sala
                </button>
                <button
                  disabled={busy || code.length !== 6}
                  onClick={() => enter(true)}
                >
                  Assistir como espectador
                </button>
              </div>
              {!auth.isAuthenticated && (
                <small className="muted">
                  Entre para salvar baralhos e jogar online. O treino e os
                  espectadores não precisam de login.
                </small>
              )}
            </div>
          </section>
        </main>
      )}
      <DeckBuilder
        active={view === "decks"}
        element={element}
        onElement={setElement}
        decks={decks}
        selectedDeck={selectedDeck}
        onSelectedDeck={setSelectedDeck}
        authenticated={auth.isAuthenticated}
        busy={busy}
        request={request}
        onFocus={setFocus}
        flash={flash}
      />
      {view === "sala" && (
        <main className="game">
          <div className="gamebar">
            <button
              className="room-code"
              onClick={() => {
                void navigator.clipboard
                  .writeText(code)
                  .then(() => flash("Código copiado."))
                  .catch(() => flash(`Código: ${code}`));
              }}
            >
              <small>
                {practice ? "TREINO LOCAL" : "SALA · CLIQUE PARA COPIAR"}
              </small>
              <b>
                {code} <span>⧉</span>
              </b>
            </button>
            {g?.players && (
              <div className="phase-track">
                {PHASES.map((p, i) => (
                  <div
                    key={p}
                    className={
                      g.phase === i ? "now" : g.phase > i ? "done" : ""
                    }
                  >
                    <span>{i + 1}</span>
                    <small>{p}</small>
                  </div>
                ))}
              </div>
            )}
            <button className="outline" onClick={() => setView("inicio")}>
              Voltar ao santuário
            </button>
          </div>
          {!room && (
            <div className="empty">
              {liveRoom.error
                ? "Não foi possível carregar a sala."
                : "Carregando sala…"}
              <button onClick={() => void liveRoom.refetch()}>
                Tentar novamente
              </button>
            </div>
          )}
          {room?.status === "waiting" && (
            <section className="lobby">
              <p className="eyebrow">ANTES DA BATALHA</p>
              <h1>Reúna seus invocadores.</h1>
              <p className="muted">
                Compartilhe o código <b>{code}</b>. O criador escolhe os dois
                jogadores; os demais acompanham como espectadores.
              </p>
              <div className="lobby-seats">
                {([0, 1] as const).map((s) => (
                  <article key={s}>
                    <span className={`seat-orb owner-${s}`}>{s + 1}</span>
                    <p className="eyebrow">JOGADOR {s + 1}</p>
                    {room.hostId === auth.userId ? (
                      <select
                        aria-label={`Jogador ${s + 1}`}
                        value={room.state.seats?.[s] || ""}
                        disabled={busy}
                        onChange={(e) =>
                          void request(() =>
                            lobbyCommand.mutate(code, {
                              type: "seat",
                              seat: s,
                              userId: e.currentTarget.value || null,
                            }),
                          )
                        }
                      >
                        <option value="">Escolha um participante</option>
                        {room.members
                          .filter((m) => m.hasDeck)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.deckName}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <h2>
                        {room.members.find(
                          (m) => m.id === room.state.seats?.[s],
                        )?.name || "Vaga aberta"}
                      </h2>
                    )}
                  </article>
                ))}
              </div>
              <div className="lobby-members">
                <h3>Na sala · {room.members.length}</h3>
                {room.members.map((m) => (
                  <div key={m.id}>
                    <span>
                      {m.name}
                      {m.id === room.hostId ? " · criador" : ""}
                    </span>
                    <small>
                      {room.state.seats?.includes(m.id)
                        ? "Jogador"
                        : "Espectador"}{" "}
                      · {m.deckName || "Sem baralho"}
                    </small>
                  </div>
                ))}
              </div>
              {room.hostId === auth.userId ? (
                <button
                  className="gold start-battle"
                  disabled={
                    busy || !room.state.seats?.[0] || !room.state.seats?.[1]
                  }
                  onClick={() =>
                    void request(() =>
                      lobbyCommand.mutate(code, { type: "start" }),
                    )
                  }
                >
                  Iniciar batalha <span>⚔</span>
                </button>
              ) : (
                <p>Aguardando o criador iniciar a batalha.</p>
              )}
            </section>
          )}
          {g?.players && (
            <MatchSession
              key={code}
              game={g}
              seat={seat}
              code={code}
              names={[playerName(0), playerName(1)]}
              practice={practice}
              onPractice={setPractice}
              busy={busy}
              request={request}
              onFocus={setFocus}
              flash={flash}
              onExit={() => setView("inicio")}
            />
          )}
        </main>
      )}
      {view === "regras" && (
        <main className="rules">
          <p className="eyebrow">APRENDA O CAMINHO</p>
          <h1>
            Um baralho. Um Omionji.
            <br />
            <em>Cinco fases para decidir.</em>
          </h1>
          <p className="lead">
            Derrote o Omionji adversário para vencer. Os jogadores alternam em
            cada fase, seguindo a prioridade sorteada nos dados.
          </p>
          <div className="rulegrid">
            {PHASES.map((p, i) => (
              <article key={p}>
                <span>0{i + 1}</span>
                <h2>{p}</h2>
                <p>
                  {
                    [
                      "Ambos recuperam PE e compram uma carta. As maldições avançam a partir do turno 4.",
                      "Pague o custo e invoque junto de um cristal vivo. Monstros recém-invocados aguardam um turno para mover.",
                      "Mova duas unidades gratuitamente. Cada unidade adicional custa 1 PE. Siga os caminhos; entrar em um inimigo inicia combate.",
                      "Conjure magias lentas ou ative os efeitos de suas unidades. Magias rápidas podem responder às ações nos intervalos de prioridade.",
                      "Troque cartas da mão por PE permanente, até um máximo de 3 acumulados. Os demais pontos são renovados a cada turno.",
                    ][i]
                  }
                </p>
              </article>
            ))}
          </div>
          <section className="decisions">
            <h2>Como esta edição resolve as regras</h2>
            <p>
              O tabuleiro segue os caminhos do manual. Casas vizinhas sem
              caminho não são conectadas. Pular permite atravessar espaços
              ortogonais sem ligação quando não estão ocupados por inimigos.
            </p>
            <p>
              O centro abre no turno 3. Cada jogador escolhe uma unidade em
              segredo para avançar até sua velocidade na direção do centro. As
              escolhas são reveladas juntas; conflitos são resolvidos na ordem
              da prioridade sorteada. Essa movimentação especial não consome uma
              das duas movimentações da fase.
            </p>
            <p>
              Antes do combate, ambos podem responder com magias rápidas. Duas
              passagens de prioridade resolvem o topo da pilha; duas novas
              passagens resolvem o combate. Magias instantâneas resolvem
              imediatamente. Quick Attack só antecipa o dano do atacante. O dano
              normal é simultâneo; se ambos os Omionjis morrerem, há empate.
            </p>
            <p>
              O ciclo elemental segue as setas do diagrama: Vazio → Vento → Fogo
              → Água → Terra. O próximo elemento resiste 1 de dano; o elemento
              duas posições à frente recebe +1. Elementos duplos combinam os
              modificadores. O exemplo textual Água/Vento do manual diverge das
              setas; esta edição usa o diagrama.
            </p>
            <p>
              As cartas com Amaldiçoado são maldições neutras e ficam fora dos
              baralhos. Custos 0–1 formam o nível 1, custo 3 o nível 2 e custos
              4–5 o nível 3. Cada surgimento sorteia uma carta do nível
              correspondente, com seus atributos e efeitos impressos. Nível 3
              retorna como nível 3. Empates de caminho favorecem o centro e
              depois usam sorteio.
            </p>
            <p>
              A mão inicial tem 6 cartas, com uma troca opcional. Depois da
              preparação, ambos compram a carta da primeira fase de Compra. Um
              baralho vazio simplesmente deixa de comprar, pois o manual não
              prevê derrota por esgotamento.
            </p>
            <p>
              O Omionji fica fora das 30 cartas. Cada baralho permite até duas
              cópias de cada carta, mínimo de 20 do elemento principal e apenas
              magias desse elemento.
            </p>
            <p>
              Adjacência de efeitos inclui as oito casas vizinhas. Movimento e
              invocação exigem caminhos. Maiko move uma carta adjacente por uma
              conexão, uma vez por turno. Aota dá Quick Attack ao atacante
              aliado. Efeitos de busca mostram as cartas compatíveis para você
              escolher. Buscas opcionais podem ser dispensadas; as cartas do
              baralho permanecem privadas.
            </p>
          </section>
          <div className="actions">
            <button className="gold" onClick={startPractice}>
              Aprender jogando
            </button>
          </div>
        </main>
      )}
      {view === "sala" && !practice && liveRoom.error && (
        <div className="arena-connection" role="status">
          {liveRoom.error}
        </div>
      )}
      {focus && (
        <Focus
          {...focus}
          game={g}
          unit={g?.units?.find((u) => u.id === focus.unit?.id) || focus.unit}
          onClose={() => setFocus(null)}
        />
      )}
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}
      <footer>
        <span>式神道 · SHIKIGAMIDO</span>
        <small>Um duelo no caminho dos familiares.</small>
      </footer>
    </div>
  );
}
