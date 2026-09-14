import { useEffect, useMemo, useState } from "preact/hooks";
import {
  signInWithGoogle,
  signOut,
  useAuth,
  useMutation,
  useQuery,
} from "sited/client";

type Card = {
  id: string;
  name: string;
  kind: "unit" | "spell";
  types: string[];
  stats: any;
  effect_text: string;
  asset: string;
};
type Deck = {
  id: string;
  name: string;
  element: string;
  omionji: string;
  cardIds: string[];
};
const E: any = {
  agua: ["#38bdf8", "水"],
  fogo: ["#fb5b3f", "火"],
  terra: ["#d8a846", "土"],
  vento: ["#5ee6b0", "風"],
  vazio: ["#b084f5", "空"],
};
const PHASES = ["Compra", "Invocação", "Movimento", "Magia", "Descarte"];

export function App() {
  const auth = useAuth();
  const decks = useQuery<Deck[]>("myDecks");
  const saveDeck = useMutation<[any], any>("saveDeck");
  const createRoom = useMutation<[string], any>("createRoom");
  const joinRoom = useMutation<[string, string | undefined, boolean], any>(
    "joinRoom",
  );
  const command = useMutation<[string, unknown], any>("gameCommand");
  const [cards, setCards] = useState<Card[]>([]),
    [view, setView] = useState("inicio"),
    [element, setElement] = useState("agua"),
    [name, setName] = useState("Maré ancestral"),
    [chosen, setChosen] = useState<string[]>([]),
    [selectedDeck, setSelectedDeck] = useState(""),
    [code, setCode] = useState(""),
    [room, setRoom] = useState<any>(null),
    [toast, setToast] = useState(""),
    [selectedCard, setSelectedCard] = useState(""),
    [selectedUnit, setSelectedUnit] = useState(""),
    [selectedUnit2, setSelectedUnit2] = useState(""),
    [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null),
    [extraPe, setExtraPe] = useState(0);
  const liveRoom = useQuery<any>("room", [code]);
  useEffect(() => {
    fetch("/data/cards.json")
      .then((r) => r.json())
      .then((d) => setCards(d.cards));
  }, []);
  useEffect(() => {
    if (!selectedDeck && decks.data?.[0]) setSelectedDeck(decks.data[0].id);
  }, [decks.data]);
  useEffect(() => {
    if (view !== "sala" || code.length !== 6) return;
    const timer = window.setInterval(() => void liveRoom.refetch(), 1500);
    return () => window.clearInterval(timer);
  }, [view, code]);
  useEffect(() => {
    if (view === "sala" && liveRoom.data) setRoom(liveRoom.data);
  }, [liveRoom.data, view]);
  const filtered = useMemo(
    () => cards.filter((c) => c.types.includes(element) || c.kind === "unit"),
    [cards, element],
  );
  const mainCount = chosen.filter((id) =>
    cards.find((c) => c.id === id)?.types.includes(element),
  ).length;
  const valid =
    chosen.length === 30 &&
    mainCount >= 20 &&
    !chosen.some((id) => {
      const c = cards.find((x) => x.id === id);
      return c?.kind === "spell" && !c.types.includes(element);
    });
  const flash = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2600);
  };
  const add = (id: string) => {
    if (chosen.length < 30) setChosen([...chosen, id]);
  };
  async function save() {
    const r = await saveDeck.mutate({
      name,
      element,
      omionji: `Omionji de ${element}`,
      cardIds: chosen,
    });
    if (r.error) flash(r.error);
    else {
      flash("Baralho salvo");
      setSelectedDeck(r.deck.id);
      await decks.refetch();
    }
  }
  async function makeRoom() {
    if (!selectedDeck) return flash("Selecione um baralho");
    const r = await createRoom.mutate(selectedDeck);
    if (r.error) return flash(r.error);
    setRoom(r.room);
    setCode(r.room.code);
    setView("sala");
  }
  async function enter(spectator = false) {
    const r = await joinRoom.mutate(code, selectedDeck || undefined, spectator);
    if (r.error) return flash(r.error);
    setRoom(r.room);
    setView("sala");
  }
  async function act(cmd: unknown) {
    const r = await command.mutate(code, cmd);
    if (r.error) return flash(r.error);
    setRoom(r.room);
    setSelectedCard("");
    setSelectedUnit("");
    setSelectedUnit2("");
    setSelectedCell(null);
    setExtraPe(0);
  }
  const seat =
      room?.hostId === auth.userId ? 0 : room?.guestId === auth.userId ? 1 : -1,
    me = seat >= 0 ? room?.state?.players?.[seat] : null;
  return (
    <div className="app">
      <header>
        <button className="brand" onClick={() => setView("inicio")}>
          <span className="seal">式</span>
          <b>SHIKIGAMIDO</b>
          <small>O caminho dos familiares</small>
        </button>
        <nav>
          {[
            ["inicio", "Santuário"],
            ["decks", "Baralhos"],
            ["regras", "Regras"],
          ].map((x) => (
            <button
              className={view === x[0] ? "on" : ""}
              onClick={() => setView(x[0])}
            >
              {x[1]}
            </button>
          ))}
        </nav>
        <div>
          {auth.isAuthenticated ? (
            <button className="profile" onClick={() => void signOut()}>
              <span>{auth.displayName[0]}</span>
              {auth.displayName}
            </button>
          ) : (
            <button className="gold" onClick={() => signInWithGoogle()}>
              Entrar com Google
            </button>
          )}
        </div>
      </header>
      {view === "inicio" && (
        <main className="home">
          <section className="welcome">
            <p className="eyebrow">◆ SANTUÁRIO DE DUELOS</p>
            <h1>
              Comande seus <i>shikigami.</i>
              <br />
              Domine o centro.
            </h1>
            <p>
              Um duelo tático em cinco fases, onde cada movimento e cada
              resposta podem decidir o destino do seu Omionji.
            </p>
            <div className="actions">
              <button className="gold" onClick={() => setView("decks")}>
                Criar baralho
              </button>
              <button onClick={() => setView("regras")}>Como jogar</button>
            </div>
          </section>
          <section className="portal">
            <div className="moon">
              <span>式</span>
            </div>
            <div className="roomcard">
              <h2>Entrar em uma sala</h2>
              <label>
                ID DA SALA
                <input
                  value={code}
                  maxLength={6}
                  placeholder="KITSUN"
                  onInput={(e: any) =>
                    setCode(e.currentTarget.value.toUpperCase())
                  }
                />
              </label>
              <label>
                BARALHO
                <select
                  value={selectedDeck}
                  onChange={(e: any) => setSelectedDeck(e.currentTarget.value)}
                >
                  <option value="">Selecione</option>
                  {decks.data?.map((d) => (
                    <option value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <button className="gold" onClick={() => enter(false)}>
                Entrar como jogador
              </button>
              <button onClick={() => enter(true)}>◉ Assistir partida</button>
              <div className="or">OU</div>
              <button onClick={makeRoom}>Criar nova sala</button>
            </div>
          </section>
          <section className="features">
            {[
              [
                "⚔",
                "Duelo tático",
                "Cinco fases alternadas; prioridade clara a cada ação.",
              ],
              [
                "✦",
                "102 cartas reais",
                "Todo o conjunto do Tabletop Simulator, com efeitos e atributos.",
              ],
              [
                "◉",
                "Partidas observáveis",
                "Crie um ID, convide um rival e receba espectadores.",
              ],
            ].map((x) => (
              <article>
                <b>{x[0]}</b>
                <h3>{x[1]}</h3>
                <p>{x[2]}</p>
              </article>
            ))}
          </section>
        </main>
      )}
      {view === "decks" && (
        <main className="builder">
          <aside>
            <p className="eyebrow">FORJA DE BARALHO</p>
            <h1>{name}</h1>
            <label>
              Nome
              <input
                value={name}
                onInput={(e: any) => setName(e.currentTarget.value)}
              />
            </label>
            <div className="elements">
              {Object.keys(E).map((k) => (
                <button
                  className={element === k ? "active" : ""}
                  style={`--e:${E[k][0]}`}
                  onClick={() => {
                    setElement(k);
                    setChosen([]);
                  }}
                >
                  {E[k][1]}
                  <small>{k}</small>
                </button>
              ))}
            </div>
            <div className="deckstats">
              <b>{chosen.length}/30 cartas</b>
              <span className={mainCount >= 20 ? "ok" : ""}>
                {mainCount}/20 do elemento
              </span>
            </div>
            <div className="decklist">
              {chosen.map((id, i) => {
                const c = cards.find((x) => x.id === id);
                return (
                  <button
                    onClick={() => setChosen(chosen.filter((_, j) => j !== i))}
                  >
                    {c?.name}
                    <span>×</span>
                  </button>
                );
              })}
            </div>
            <button
              className="gold"
              disabled={!valid || saveDeck.isLoading}
              onClick={save}
            >
              Salvar baralho
            </button>
            <div className="saved">
              <h3>Meus baralhos</h3>
              {decks.data?.map((d) => (
                <button
                  className={selectedDeck === d.id ? "sel" : ""}
                  onClick={() => setSelectedDeck(d.id)}
                >
                  {d.name}
                  <small>{d.element}</small>
                </button>
              ))}
            </div>
          </aside>
          <section>
            <div className="toolbar">
              <h2>Biblioteca de cartas</h2>
              <span>{filtered.length} disponíveis</span>
            </div>
            <div className="cards">
              {filtered.map((c) => (
                <button
                  className="card"
                  onClick={() => add(c.id)}
                  title={c.effect_text}
                >
                  <img src={c.asset} />
                  <div>
                    <b>{c.name}</b>
                    <small>
                      {c.kind === "spell"
                        ? `Magia ${c.stats.speed}`
                        : `${c.stats.attack} ATQ · ${c.stats.health} VIDA · ${c.stats.speed} VEL`}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>
      )}
      {view === "sala" && (
        <main className="game">
          <div className="gamebar">
            <div>
              <span>SALA</span>
              <b>{code}</b>
            </div>
            <div className="phase">
              {PHASES.map((p, i) => (
                <span className={room?.state?.phase === i ? "now" : ""}>
                  {i + 1}
                  <small>{p}</small>
                </span>
              ))}
            </div>
            <button onClick={() => setView("inicio")}>Sair</button>
          </div>
          {room?.status === "waiting" ? (
            <section className="waiting">
              <div className="moon">
                <span>待</span>
              </div>
              <h1>Aguardando um desafiante</h1>
              <p>
                Compartilhe o ID <b>{code}</b>. Espectadores podem entrar sem
                ocupar a segunda vaga.
              </p>
            </section>
          ) : (
            <section className="battle">
              <aside>
                <h3>Turno {room?.state?.turn}</h3>
                <p>
                  PE{" "}
                  <b>
                    {me?.pe}/{me?.maxPe}
                  </b>{" "}
                  + <b>{me?.permanentPe || 0}</b> permanente
                </p>
                <p>
                  Prioridade: <b>Jogador {(room?.state?.priority ?? 0) + 1}</b>
                </p>
                <div className="hand">
                  <h4>Sua mão</h4>
                  {me?.hand?.map((id: string) => {
                    const c = cards.find((x) => x.id === id);
                    return (
                      <button
                        className={selectedCard === id ? "picked" : ""}
                        onClick={() => setSelectedCard(id)}
                      >
                        {c?.name}
                        <small>
                          {c?.stats?.cost} PE · {c?.kind}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="commands">
                  <small>
                    Alvo 1: {selectedUnit || "—"} · Alvo 2: {selectedUnit2 || "—"} · Casa: {selectedCell ? `${selectedCell.x + 1},${selectedCell.y + 1}` : "—"}
                  </small>
                  <button
                    className="gold"
                    onClick={() => act({ type: "pass" })}
                  >
                    {room?.state?.stack?.length
                      ? "Passar prioridade"
                      : "Encerrar fase"}
                  </button>
                  <button
                    disabled={
                      !selectedCard ||
                      (cards.find((c) => c.id === selectedCard)?.kind !== "spell") ||
                      (cards.find((c) => c.id === selectedCard)?.stats?.speed === "slow" &&
                        room?.state?.phase !== 3)
                    }
                    onClick={() =>
                      act({
                        type: "cast",
                        cardId: selectedCard,
                        targetId: selectedUnit,
                        targetId2: selectedUnit2,
                        x: selectedCell?.x,
                        y: selectedCell?.y,
                        extraPe,
                      })
                    }
                  >
                    Conjurar selecionada
                  </button>
                  {selectedCard === "mamoru-n-9-wonder-wall" && (
                    <label>
                      PE extra na parede
                      <input type="number" min="0" max="9" value={extraPe} onInput={(e) => setExtraPe(Number((e.target as HTMLInputElement).value))} />
                    </label>
                  )}
                  <button onClick={() => { setSelectedUnit(""); setSelectedUnit2(""); setSelectedCell(null); }}>Limpar alvos</button>
                  <button
                    disabled={!selectedCard || room?.state?.phase !== 4}
                    onClick={() =>
                      act({ type: "discard", cardId: selectedCard })
                    }
                  >
                    Descartar por PE
                  </button>
                  {room?.state?.turn === 1 && !me?.mulligan && (
                    <button
                      onClick={() =>
                        act({
                          type: "mulligan",
                          cardIds: selectedCard ? [selectedCard] : [],
                        })
                      }
                    >
                      Mulligan selecionada
                    </button>
                  )}
                  <button
                    className="danger"
                    onClick={() => act({ type: "concede" })}
                  >
                    Conceder
                  </button>
                </div>
              </aside>
              <div>
                <div className="board">
                  {Array.from({ length: 49 }, (_, i) => {
                    const x = i % 7,
                      y = Math.floor(i / 7),
                      playable = ![1, 5].includes(y) || [0, 1, 3, 5, 6].includes(x),
                      u = room?.state?.units?.find(
                        (z: any) => z.x === x && z.y === y,
                      );
                    return (
                      <button
                        className={
                          (!playable ? "void " : "") +
                          (i === 24 ? "center " : "") +
                          (u?.kind === "curse" ? "curse " : "") +
                          (selectedUnit === u?.id ? "selected" : "")
                        }
                        onClick={() => {
                          if (u) {
                            setSelectedUnit(u.id);
                          } else if (selectedUnit && playable) {
                            void act({ type: "move", unitId: selectedUnit, x, y });
                          } else if (selectedCard && playable) {
                            const c = cards.find((z) => z.id === selectedCard);
                            if (c?.kind === "unit") void act({ type: "summon", cardId: selectedCard, x, y });
                          }
                        }}
                        disabled={!playable && !u}
                      >
                        {u ? (
                          <span>
                            {u.kind === "omionji"
                              ? "陰"
                              : u.kind === "crystal"
                                ? "◆"
                              : u.kind === "curse"
                                ? "告"
                                : "式"}
                            <small>
                              {cards.find((c) => c.id === u.cardId)?.name ||
                                `Maldição Nv ${u.level}`}
                              <br />
                              {u.attack} ATQ · {u.hp}/{u.maxHp}
                            </small>
                          </span>
                        ) : (
                          ""
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="boardhint">
                  Selecione uma unidade e depois uma casa para mover; selecione
                  uma carta e uma casa de cristal para invocar.
                </p>
              </div>
              <aside className="log">
                <h3>Crônica da partida</h3>
                {!!room?.state?.stack?.length && (
                  <div className="stack">
                    <b>Pilha de ativações</b>
                    {[...room.state.stack].reverse().map((item: any) => (
                      <span>{cards.find((c) => c.id === item.cardId)?.name}</span>
                    ))}
                    <small>{room?.state?.passes || 0}/2 passes</small>
                  </div>
                )}
                {room?.state?.winner !== null &&
                  room?.state?.winner !== undefined && (
                    <strong>Jogador {room.state.winner + 1} venceu!</strong>
                  )}
                {[...(room?.state?.log || [])].reverse().map((x: string) => (
                  <p>{x}</p>
                ))}
              </aside>
            </section>
          )}
        </main>
      )}
      {view === "regras" && (
        <main className="rules">
          <p className="eyebrow">MANUAL INTERATIVO</p>
          <h1>Regras implementadas</h1>
          <p className="lead">
            A mesa automatiza preparação, PE, fases, maldições e vitória.
            Jogadores escolhem cartas, alvos, movimentos e respostas.
          </p>
          <div className="rulegrid">
            {[
              [
                "01",
                "Objetivo",
                "Derrote o Omionji rival. Ambos começam em campo e não contam como monstros.",
              ],
              [
                "02",
                "Turno alternado",
                "Compra, Invocação, Movimento, Magia e Descarte. O primeiro jogador age e o rival responde em cada fase.",
              ],
              [
                "03",
                "Energia",
                "PE é restaurado na compra; o máximo sobe nos turnos ímpares. Descartes geram até 3 PE permanentes.",
              ],
              [
                "04",
                "Combate",
                "Dano simultâneo, salvo Quick Attack/Slow Defense. Fraqueza soma dano e resistência reduz.",
              ],
              [
                "05",
                "Maldições",
                "Surgem no turno 3, movem-se automaticamente ao Omionji mais próximo e priorizam o caminho central.",
              ],
              [
                "06",
                "Magias e respostas",
                "Lentas na fase de magia; rápidas respondem; instantâneas resolvem sem resposta.",
              ],
            ].map((x) => (
              <article>
                <span>{x[0]}</span>
                <h2>{x[1]}</h2>
                <p>{x[2]}</p>
              </article>
            ))}
          </div>
          <section className="decisions">
            <h2>Decisões para ambiguidades</h2>
            <p>
              <b>Empate das maldições:</b> centro, depois sorteio uniforme
              registrado no log.
            </p>
            <p>
              <b>Janelas de resposta:</b> pilha LIFO; cada jogador alterna
              prioridade até ambos passarem. Magia instantânea não abre janela.
            </p>
            <p>
              <b>Centro no turno 3:</b> escolha simultânea selada; conflitos
              resolvem por Velocidade, depois sorteio.
            </p>
            <p>
              <b>Omionji ausente nas artes:</b> cada deck recebe um Omionji-base
              do elemento (2 ATQ, 12 VIDA, 2 VEL) até as cartas oficiais serem
              fornecidas.
            </p>
          </section>
        </main>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
