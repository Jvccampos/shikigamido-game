import type { MutationResponse, PublicRoom } from "../shared/room.js";
import type { CardFocus } from "./card.js";
import { E, SPEED, CardFace, Focus } from "./card.js";
import { useMatchInteraction } from "./match-interaction.js";
import { Arena } from "./arena.js";
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
  allCards,
  cards as catalog,
  phases as PHASES,
  validateDeck,
  apply,
  type Game,
  type Cmd,
} from "../shared/game.js";
import { practiceGame, starterDeck, botCommand } from "../shared/practice.js";
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
  const saveDeck = useMutation("saveDeck"),
    deleteDeck = useMutation("deleteDeck"),
    createRoom = useMutation("createRoom"),
    joinRoom = useMutation("joinRoom"),
    command = useMutation("gameCommand"),
    lobbyCommand = useMutation("lobbyCommand");
  const [view, setView] = useState("inicio"),
    [element, setElement] = useState("agua"),
    [deckName, setDeckName] = useState("Maré ancestral"),
    [chosen, setChosen] = useState<string[]>([]),
    [editId, setEditId] = useState(""),
    [selectedDeck, setSelectedDeck] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [code, setCode] = useState(
      () =>
        new URLSearchParams(location.search).get("sala") ||
        localStorage.getItem("shiki-room") ||
        "",
    ),
    [practice, setPractice] = useState<Game | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [sceneBusy, setSceneBusy] = useState(false),
    [noticeBusy, setNoticeBusy] = useState(false),
    [focus, setFocus] = useState<CardFocus | null>(null);
  const [concede, setConcede] = useState(false);
  const liveRoom = useRoom(code, view === "sala" && !practice);
  const room = useMemo(
    () => (practice ? practiceRoom(practice) : liveRoom.data),
    [practice, liveRoom.data],
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(),
    hovered = useRef<CardFocus | null>(null),
    localRef = useRef(practice);
  localRef.current = practice;
  const g = room && room.status !== "waiting" ? room.state : undefined,
    seat = room?.seat ?? -1,
    myTurn = !!g && seat === g.priority && !g.setup && !g.centerPending;
  const interaction = useMatchInteraction(
    g,
    seat,
    busy || sceneBusy,
    act,
    setFocus,
    code,
  );
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
        interaction.arena.onClear();
      }
      if (e.key.toLowerCase() === "f" && hovered.current) {
        setFocus(hovered.current);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (
      !practice ||
      practice.winner !== null ||
      practice.draw ||
      sceneBusy ||
      noticeBusy
    )
      return;
    if (!(
      (practice.setup && !practice.players[1].ready) ||
      (practice.centerPending &&
        !Object.hasOwn(practice.centerChoices || {}, 1)) ||
      (!practice.setup &&
        !practice.centerPending &&
        (practice.searches?.[0]?.seat ?? practice.priority) === 1)
    ))
      return;
    const timer = setTimeout(() => {
      const original = localRef.current;
      if (!original) return;
      const next = structuredClone(original);
      const cmd = botCommand(next, 1);
      const error = apply(next, 1, cmd);
      if (error) {
        const clean = structuredClone(original);
        if (!apply(clean, 1, { type: "pass" })) {
          clean.revision = (clean.revision || 0) + 1;
          setPractice(clean);
        }
        return;
      }
      // Conversion is a single choice. Hand over the phase without another
      // thinking pause after every discarded card and the final pass.
      if (cmd.type === "discardMany") apply(next, 1, { type: "pass" });
      next.revision = (next.revision || 0) + 1;
      setPractice(next);
    }, 750);
    return () => clearTimeout(timer);
  }, [practice, sceneBusy, noticeBusy]);
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
  async function act(cmd: Cmd) {
    if (busy || sceneBusy) return false;
    if (practice) {
      const next = structuredClone(practice),
        error = apply(next, 0, cmd);
      if (error) {
        flash(error);
        return false;
      }
      next.revision = (next.revision || 0) + 1;
      setPractice(next);

      return true;
    }
    const r = await request(() => command.mutate(code, cmd, g?.revision || 0));
    return !!r && !r.error;
  }
  useEffect(() => {
    if (
      g &&
      !g.setup &&
      g.phase === 0 &&
      myTurn &&
      !g.stack.length &&
      !g.combat &&
      !g.searches?.length &&
      !busy
    ) {
      const timer = setTimeout(() => void act({ type: "pass" }), 500);
      return () => clearTimeout(timer);
    }
  }, [g?.revision, busy]);
  function startPractice() {
    const game = practiceGame(element);
    setSceneBusy(false);

    setPractice(game);

    setCode("TREINO");
    interaction.reset();
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
  async function save() {
    if (!auth.isAuthenticated) {
      openLogin();
      return;
    }
    const r = await request(() =>
      saveDeck.mutate({
        id: editId || undefined,
        name: deckName,
        element,
        omionji: `omionji-${element}`,
        cardIds: chosen,
      }),
    );
    if (r?.deck) {
      setEditId(r.deck.id);
      setSelectedDeck(r.deck.id);
      flash("Baralho salvo.");
      await decks.refetch();
    }
  }
  const mainCount = chosen.filter((id) =>
      catalog.get(id)?.types.includes(element),
    ).length,
    deckError = validateDeck({ element, cardIds: chosen });
  const filtered = useMemo(
    () =>
      allCards
        .filter(
          (c) =>
            c.kind !== "omionji" &&
            c.kind !== "curse" &&
            (c.kind === "unit" || c.types.includes(element)) &&
            (filter === "all" ||
              (filter === "main" && c.types.includes(element)) ||
              filter === c.kind) &&
            `${c.name} ${c.effect_text}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) => a.stats.cost - b.stats.cost || a.name.localeCompare(b.name),
        ),
    [element, search, filter],
  );
  const count = (id: string) => chosen.filter((x) => x === id).length;
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
      {view === "decks" && (
        <main className="builder">
          <aside>
            <p className="eyebrow">SEU ARSENAL</p>
            <h1>{editId ? "Editar baralho" : "Novo baralho"}</h1>
            <label>
              NOME
              <input
                value={deckName}
                maxLength={80}
                onInput={(e) => setDeckName(e.currentTarget.value)}
              />
            </label>
            <div className="elements">
              {Object.entries(E).map(([id, [color, symbol, label]]) => (
                <button
                  key={id}
                  className={element === id ? "active" : ""}
                  style={{ "--element": color }}
                  onClick={() => {
                    setElement(id);
                    setChosen([]);
                    setEditId("");
                  }}
                  aria-label={label}
                >
                  {symbol}
                  <small>{label}</small>
                </button>
              ))}
            </div>
            <button
              className="omionji-mini"
              onClick={() =>
                setFocus({ card: catalog.get(`omionji-${element}`) })
              }
            >
              <img src={catalog.get(`omionji-${element}`)!.asset} alt="" />
              <span>
                <small>SEU OMIONJI</small>
                <b>{catalog.get(`omionji-${element}`)!.name}</b>
                <small>Começa em campo · fora das 30 cartas ↗</small>
              </span>
            </button>
            <div className="deck-progress">
              <b>
                {chosen.length}
                <small> / 30 cartas</small>
              </b>
              <span className={mainCount >= 20 ? "up" : "muted"}>
                {mainCount}/20 de {E[element][2]}
              </span>
              <div>
                <i style={{ width: `${(chosen.length / 30) * 100}%` }} />
              </div>
            </div>
            <button
              className="outline"
              onClick={() => {
                const d = starterDeck(element);
                setChosen(d.cardIds);
                setDeckName(d.name);
                setEditId("");
              }}
            >
              Usar baralho inicial
            </button>
            <div className="decklist">
              {[...new Set(chosen)].map((id) => (
                <div key={id}>
                  <button onClick={() => setFocus({ card: catalog.get(id) })}>
                    {catalog.get(id)?.name}
                  </button>
                  <span>{count(id)}×</span>
                  <button
                    aria-label={`Remover ${catalog.get(id)?.name}`}
                    onClick={() => {
                      const next = [...chosen];
                      next.splice(next.indexOf(id), 1);
                      setChosen(next);
                    }}
                  >
                    −
                  </button>
                </div>
              ))}
              {!chosen.length && (
                <p className="empty">
                  Escolha suas cartas à direita ou comece com um baralho
                  inicial.
                </p>
              )}
            </div>
            <small className="muted">
              30 cartas · mínimo 20 do elemento · até 2 cópias. Magias do
              elemento principal.
            </small>
            <button
              className="gold"
              disabled={!!deckError || busy}
              onClick={save}
            >
              {auth.isAuthenticated ? "Salvar baralho" : "Entrar para salvar"}
            </button>
            {!!decks.data?.length && (
              <div className="saved">
                <h3>Meus baralhos</h3>
                {decks.data.map((d) => (
                  <div key={d.id}>
                    <button
                      className={selectedDeck === d.id ? "sel" : ""}
                      onClick={() => {
                        setEditId(d.id);
                        setSelectedDeck(d.id);
                        setDeckName(d.name);
                        setElement(d.element);
                        setChosen(d.cardIds);
                      }}
                    >
                      {d.name}
                      <small>{E[d.element]?.[2]}</small>
                    </button>
                    <button
                      aria-label={`Excluir ${d.name}`}
                      onClick={async () => {
                        await request(() => deleteDeck.mutate(d.id));
                        if (editId === d.id) setEditId("");
                        if (selectedDeck === d.id) setSelectedDeck("");
                        await decks.refetch();
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
          <section>
            <div className="toolbar">
              <div>
                <p className="eyebrow">BIBLIOTECA</p>
                <h2>Escolha seus familiares.</h2>
              </div>
              <span>{filtered.length} cartas</span>
            </div>
            <div className="catalog-filters">
              <input
                aria-label="Buscar cartas"
                placeholder="Buscar nome ou keyword…"
                value={search}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <select
                aria-label="Filtrar cartas"
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
              >
                <option value="all">Todas compatíveis</option>
                <option value="main">Elemento principal</option>
                <option value="unit">Monstros</option>
                <option value="spell">Magias</option>
              </select>
            </div>
            <div className="cards">
              {filtered.map((c) => (
                <article className="catalog-card" key={c.id}>
                  <button
                    className="art-button"
                    onClick={() => setFocus({ card: c })}
                    onMouseEnter={() => (hovered.current = { card: c })}
                    onMouseLeave={() => (hovered.current = null)}
                    aria-label={`Ler ${c.name}`}
                  >
                    <CardFace card={c} />
                    <span className="zoom-cue">⤢ Ler carta</span>
                  </button>
                  <div className="catalog-meta">
                    <b>{c.name}</b>
                    <small>
                      {c.stats.cost} PE ·{" "}
                      {c.kind === "spell" ? SPEED[c.stats.speed] : "Monstro"}
                    </small>
                  </div>
                  <button
                    className="add-card"
                    disabled={count(c.id) >= 2 || chosen.length >= 30}
                    onClick={() =>
                      setChosen((prev) =>
                        prev.length < 30 &&
                        prev.filter((id) => id === c.id).length < 2
                          ? [...prev, c.id]
                          : prev,
                      )
                    }
                  >
                    {count(c.id) >= 2
                      ? "2 / 2 cópias"
                      : `+ Adicionar${count(c.id) ? " · 1/2" : ""}`}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}
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
            <Arena
              game={g}
              seat={seat}
              code={code}
              names={[playerName(0), playerName(1)]}
              {...interaction.arena}
              busy={busy || sceneBusy}
              onPresentationBusy={setSceneBusy}
              onNoticeBusy={setNoticeBusy}
              onExit={() => setView("inicio")}
              onConcede={() => setConcede(true)}
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
      {concede && (
        <div className="modal-scrim">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Conceder partida"
          >
            <h2>Conceder esta partida?</h2>
            <p>Seu oponente será declarado vencedor.</p>
            <div className="actions">
              <button
                className="outline"
                autoFocus
                onClick={() => setConcede(false)}
              >
                Continuar jogando
              </button>
              <button
                className="danger"
                onClick={() => {
                  setConcede(false);
                  void act({ type: "concede" });
                }}
              >
                Conceder
              </button>
            </div>
          </section>
        </div>
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
