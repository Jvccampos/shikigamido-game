import { Arena } from "./arena.js";
import { enterAsGuest } from "./network.js";
import { abilities } from "../shared/abilities.js";
import { yokaiIds, masculineIds } from "../shared/traits.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  openLogin,
  signOut,
  useAuth,
  useMutation,
  useQuery,
} from "./network.js";
import {
  allCards,
  cards as catalog,
  phases as PHASES,
  validateDeck,
  summonCells,
  moveOptions,
  route,
  apply,
  kw,
  type Game,
  type Unit,
  type Cmd,
  type Seat,
} from "../shared/game.js";
import { spellSpecs, transferableKeywords } from "../shared/spells.js";
import { practiceGame, starterDeck, botCommand } from "../shared/practice.js";
import { publicRoom } from "../shared/visibility.js";
const E: Record<string, [string, string, string]> = {
  agua: ["#68c5ef", "水", "Água"],
  fogo: ["#f57b62", "火", "Fogo"],
  terra: ["#d7ae67", "地", "Terra"],
  vento: ["#8cd8b6", "風", "Vento"],
  vazio: ["#be9aee", "空", "Vazio"],
};
const SPEED: Record<string, string> = {
  slow: "Lenta",
  fast: "Rápida",
  instant: "Instantânea",
};
function unitName(u: any) {
  return (
    catalog.get(u?.cardId)?.name ||
    (u?.kind === "crystal"
      ? "Cristal de invocação"
      : u?.kind === "curse"
        ? `Maldição · nível ${u.level}`
        : u?.kind === "omionji"
          ? "Omionji"
          : u?.kind === "wall"
            ? "Parede de terra"
            : "Carta oculta")
  );
}
function Stat({
  value,
  base,
  label,
  icon,
}: {
  value: number;
  base: number;
  label: string;
  icon: string;
}) {
  return (
    <span
      className={`stat ${value < base ? "down" : value > base ? "up" : "equal"}`}
      title={`${label}: ${value}. Original: ${base}.`}
    >
      <small>{icon}</small>
      {value}
      {value !== base && <sup>{value > base ? "↑" : "↓"}</sup>}
    </span>
  );
}
function Stats({ unit, card }: { unit?: any; card: any }) {
  return card?.kind === "spell" ? (
    <span className="spell-speed">
      {SPEED[card.stats.speed]} · {card.stats.cost} PE
    </span>
  ) : (
    <div className="stats">
      <Stat
        value={unit?.attack ?? card?.stats.attack ?? 0}
        base={card?.stats.attack ?? unit?.attack ?? 0}
        label="Ataque"
        icon="⚔"
      />
      <Stat
        value={unit?.hp ?? card?.stats.health ?? 0}
        base={card?.stats.health ?? unit?.maxHp ?? 0}
        label="Vida"
        icon="♥"
      />
      <Stat
        value={unit?.speed ?? card?.stats.speed ?? 0}
        base={card?.stats.speed ?? unit?.speed ?? 0}
        label="Velocidade"
        icon="➟"
      />
    </div>
  );
}
function CardFace({
  card,
  unit,
  compact = false,
}: {
  card: any;
  unit?: any;
  compact?: boolean;
}) {
  return (
    <div
      className={`card-face ${compact ? "compact" : ""}`}
      style={{ "--element": E[card?.types?.[0] || "vazio"][0] }}
    >
      {card?.asset ? (
        <img
          src={card.asset}
          alt={card.name}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="card-placeholder">
          <span>
            {unit?.kind === "crystal"
              ? "◆"
              : unit?.kind === "curse"
                ? "禍"
                : "式"}
          </span>
          <b>{unitName(unit)}</b>
        </div>
      )}
      {unit && unit.cardId !== "hidden" && <Stats unit={unit} card={card} />}
    </div>
  );
}
function Focus({
  card,
  unit,
  onClose,
}: {
  card: any;
  unit?: any;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        e.preventDefault();
        close.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        className="card-focus"
        role="dialog"
        aria-modal="true"
        aria-label={card?.name || unitName(unit)}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={close}
          className="close"
          onClick={onClose}
          aria-label="Fechar carta"
        >
          ×
        </button>
        <CardFace card={card} unit={unit} />
        <div className="focus-text">
          <p className="eyebrow">
            {card?.types?.map((e: string) => E[e][2]).join(" · ") ||
              "Peça do tabuleiro"}
          </p>
          <h2>{card?.name || unitName(unit)}</h2>
          <Stats unit={unit} card={card} />
          <p>
            {card?.effect_text ||
              (unit?.kind === "crystal"
                ? "Tem 3 de vida. Invoque monstros nos espaços conectados a este cristal."
                : unit?.kind === "curse"
                  ? "Avança automaticamente até o Omionji mais próximo. Ao ser destruída, retorna ao portal com um nível a mais, até nível 3."
                  : "")}
          </p>
          {unit && (
            <p className="muted">
              Atributos atuais. <span className="up">Verde ↑ acima</span> ·{" "}
              <span className="down">vermelho ↓ abaixo</span> do valor original.
            </p>
          )}
          {(yokaiIds.has(card?.id) || masculineIds.has(card?.id)) && (
            <p className="muted">
              Para efeitos de combate:{" "}
              {[
                yokaiIds.has(card?.id) && "Yokai",
                masculineIds.has(card?.id) && "masculino",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {unit?.statuses && (
            <div className="status-tags">
              {statusLabels(unit).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          )}
          <small>Esc para fechar</small>
        </div>
      </section>
    </div>
  );
}
function statusLabels(u: any) {
  const s = u.statuses || {};
  return [
    s.shield && "Escudo",
    s.burn && `Burn ${s.burn}`,
    s.softStun && "Imobilizado",
    s.stun && "Atordoado",
    s.centerBonus && "Bônus do centro",
    s.hidden && "Oculto",
    s.block && `Block ${s.block}`,
    s.range && `Range ${s.range}`,
    u.equipment?.length && `${u.equipment.length} equipamento(s)`,
  ].filter(Boolean) as string[];
}
export function App() {
  const [loginOpen, setLoginOpen] = useState(false),
    [nickname, setNickname] = useState("");
  useEffect(() => {
    const open = () => setLoginOpen(true);
    window.addEventListener("shiki:login", open);
    return () => window.removeEventListener("shiki:login", open);
  }, []);
  const auth = useAuth(),
    decks = useQuery<any[]>("myDecks"),
    myRooms = useQuery<any[]>("myRooms");
  const saveDeck = useMutation<[any], any>("saveDeck"),
    deleteDeck = useMutation<[string], any>("deleteDeck"),
    createRoom = useMutation<[string], any>("createRoom"),
    joinRoom = useMutation<[string, string | undefined, boolean], any>(
      "joinRoom",
    ),
    command = useMutation<[string, Cmd, number], any>("gameCommand"),
    lobbyCommand = useMutation<[string, any], any>("lobbyCommand");
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
    [room, setRoom] = useState<any>(null),
    [practice, setPractice] = useState<Game | null>(null),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [sceneBusy, setSceneBusy] = useState(false),
    [focus, setFocus] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null),
    [drag, setDrag] = useState<any>(null),
    [targetIds, setTargetIds] = useState<string[]>([]),
    [cells, setCells] = useState<{ x: number; y: number }[]>([]),
    [choice, setChoice] = useState(""),
    [extra, setExtra] = useState(0),
    [mulligan, setMulligan] = useState<number[]>([]),
    [startY, setStartY] = useState(2),
    [concede, setConcede] = useState(false);
  const liveRoom = useQuery<any>("room", [practice ? "" : code]);
  const toastTimer = useRef<any>(null),
    lastRevision = useRef(-1),
    hovered = useRef<any>(null),
    localRef = useRef(practice);
  localRef.current = practice;
  const g = room?.state as Game | undefined,
    seat = room?.seat ?? -1,
    me = seat >= 0 ? g?.players?.[seat] : null,
    myTurn = !!g && seat === g.priority && !g.setup && !g.centerPending,
    finished = !!g && ((g.winner !== null && g.winner !== undefined) || g.draw),
    selectedCard =
      selected?.kind === "hand" ? catalog.get(selected.cardId) : null,
    selectedUnit = g?.units?.find((u) => u.id === selected?.unitId);
  const flash = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  };
  const clear = () => {
    setTargetMode(false);
    setSelected(null);
    setTargetIds([]);
    setCells([]);
    setExtra(0);
    setChoice("");
    setDrag(null);
  };
  function receive(r: any) {
    if (!r) return;
    const rev = r.state?.revision ?? -1;
    if (r.code === code && rev >= 0 && rev < lastRevision.current) return;
    lastRevision.current = rev;
    setRoom(r);
  }
  useEffect(() => {
    if (!selectedDeck && decks.data?.[0]) setSelectedDeck(decks.data[0].id);
  }, [decks.data]);
  useEffect(() => {
    if (view === "sala" && !practice && liveRoom.data?.code === code)
      receive(liveRoom.data);
  }, [liveRoom.data, view, !!practice]);
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
        clear();
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
    if (!practice || practice.winner !== null || practice.draw || sceneBusy)
      return;
    if (!(
      (practice.setup && !practice.players[1].ready) ||
      (practice.centerPending &&
        !Object.hasOwn(practice.centerChoices || {}, 1)) ||
      (!practice.setup && !practice.centerPending && practice.priority === 1)
    ))
      return;
    const timer = setTimeout(() => {
      const original = localRef.current;
      if (!original) return;
      const next = structuredClone(original);
      let cmd = botCommand(next, 1);
      let error = apply(next, 1, cmd);
      if (error) {
        const clean = structuredClone(original);
        if (!apply(clean, 1, { type: "pass" })) {
          clean.revision = (clean.revision || 0) + 1;
          setPractice(clean);
          setRoom(practiceRoom(clean));
        }
        return;
      }
      next.revision = (next.revision || 0) + 1;
      setPractice(next);
      setRoom(practiceRoom(next));
    }, 750);
    return () => clearTimeout(timer);
  }, [practice, sceneBusy]);
  function playerName(s: number) {
    const id = g?.players?.[s]?.id;
    return (
      room?.members?.find((m: any) => m.id === id)?.name || `Jogador ${s + 1}`
    );
  }
  function practiceRoom(game: Game) {
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
  async function request(fn: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      if (result?.room) receive(result.room);
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
    if (busy || sceneBusy) return;
    if (practice) {
      const next = structuredClone(practice),
        error = apply(next, 0, cmd);
      if (error) return flash(error);
      next.revision = (next.revision || 0) + 1;
      setPractice(next);
      setRoom(practiceRoom(next));
      clear();
      return;
    }
    const r = await request(() => command.mutate(code, cmd, g?.revision || 0));
    if (r && !r.error) clear();
  }
  useEffect(() => {
    if (
      g &&
      !g.setup &&
      g.phase === 0 &&
      myTurn &&
      !g.stack.length &&
      !g.combat &&
      !busy
    ) {
      const timer = setTimeout(() => void act({ type: "pass" }), 500);
      return () => clearTimeout(timer);
    }
  }, [g?.revision, busy]);
  function startPractice() {
    const game = practiceGame(element);
    setSceneBusy(false);
    lastRevision.current = -1;
    setPractice(game);
    setRoom(practiceRoom(game));
    setCode("TREINO");
    setStartY(2);
    clear();
    setView("sala");
  }
  async function enter(spectator = false) {
    setPractice(null);
    lastRevision.current = -1;
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
    lastRevision.current = -1;
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
  function pickHand(index: number) {
    if (g?.setup) {
      if (me?.mulligan || me?.ready) return;
      setMulligan(
        mulligan.includes(index)
          ? mulligan.filter((i) => i !== index)
          : [...mulligan, index],
      );
      return;
    }
    clear();
    setSelected({ kind: "hand", cardId: me!.hand[index], index });
  }
  useEffect(() => {
    if (!g?.setup || me?.mulligan || me?.ready) setMulligan([]);
  }, [g?.setup, me?.mulligan, me?.ready]);
  const [targetMode, setTargetMode] = useState(false);
  const active = drag || selected,
    activeCard = active?.kind === "hand" ? catalog.get(active.cardId) : null,
    activeUnit = g?.units?.find((u) => u.id === active?.unitId);
  const highlights = useMemo(() => {
    if (!g || seat < 0 || finished || g.setup) return [];
    if (g.followup?.seat === seat) {
      const u = g.units.find((u) => u.id === g.followup!.unitId);
      return u
        ? Array.from({ length: 49 }, (_, i) => ({
            x: i % 7,
            y: Math.floor(i / 7),
          })).filter((v) => {
            const p = route(g, u, v.x, v.y);
            return (
              p &&
              p.length > 0 &&
              p.length <= g.followup!.distance &&
              !g.units.some((u) => u.x === v.x && u.y === v.y)
            );
          })
        : [];
    }
    if (activeCard?.kind === "unit" && myTurn && g.phase === 1)
      return summonCells(g, seat as Seat);
    if (activeUnit && myTurn && g.phase === 2)
      return moveOptions(g, activeUnit);
    return [];
  }, [g?.revision, active?.unitId, active?.cardId, myTurn, finished]);
  function chooseTarget(u: Unit) {
    setTargetIds((prev) =>
      prev.includes(u.id)
        ? prev.filter((id) => id !== u.id)
        : [...prev.slice(-1), u.id],
    );
  }
  function dropAt(x: number, y: number, u?: Unit, data = active) {
    setDrag(null);
    if (g?.followup?.seat === seat) {
      void act({ type: "followup", x, y });
      return;
    }
    if (!data) return;
    if (data.kind === "unit") {
      if (data.unitId === u?.id) return;
      if (g?.phase === 2 && g.priority === seat)
        void act({ type: "move", unitId: data.unitId, x, y });
      return;
    }
    const card = catalog.get(data.cardId);
    if (!card) return;
    if (card.kind === "unit") {
      void act({
        type: "summon",
        cardId: card.id,
        handIndex: data.index,
        choice: data.fromDeck ? "library" : undefined,
        x,
        y,
        targetId: targetIds[0],
        targetId2: targetIds[1],
      });
      return;
    }
    const spec = spellSpecs[card.id];
    setSelected(data);
    const t = u ? [u.id] : [];
    setTargetIds(t);
    setCells([{ x, y }]);
    if (
      [
        "unit",
        "ally",
        "windAlly",
        "omionjiFire",
        "combat",
        "lake",
        "none",
      ].includes(spec.target)
    )
      void act({
        type: "cast",
        cardId: card.id,
        handIndex: data.index,
        targetId: u?.id,
        x,
        y,
      });
  }
  function cellClick(x: number, y: number, u?: Unit) {
    if (g?.followup?.seat === seat) {
      void act({ type: "followup", x, y });
      return;
    }
    if (g?.setup) {
      if (x === (seat ? 6 : 0) && (y === 2 || y === 4)) setStartY(y);
      return;
    }
    if (g?.centerPending) {
      if (u && u.owner === seat) setSelected({ kind: "unit", unitId: u.id });
      return;
    }
    if (selectedCard?.kind === "spell") {
      if (u) chooseTarget(u);
      setCells((prev) => [...prev.slice(-1), { x, y }]);
      return;
    }
    if (
      selectedUnit &&
      !targetMode &&
      g?.phase === 2 &&
      selectedUnit.owner === seat &&
      selectedUnit.id !== u?.id &&
      (!u || u.owner !== seat || u.kind === "curse")
    ) {
      dropAt(x, y, u, selected);
      return;
    }
    if (selectedCard?.kind === "unit") {
      if (u) {
        chooseTarget(u);
        setCells([{ x, y }]);
      } else dropAt(x, y, u, selected);
      return;
    }
    if (u) {
      if (
        selectedUnit &&
        u.id !== selectedUnit.id &&
        (targetMode || g?.phase !== 2)
      ) {
        chooseTarget(u);
        setCells([{ x, y }]);
      } else {
        clear();
        setSelected({ kind: "unit", unitId: u.id });
      }
    } else setCells((prev) => [...prev.slice(-1), { x, y }]);
  }
  const abilitySpec = selectedUnit
    ? abilities[selectedUnit.cardId] ||
      (selectedUnit.statuses?.construir
        ? abilities["kuma-no-tsuno"]
        : undefined)
    : undefined;
  const canPlay =
    !!me && !g?.setup && !g?.centerPending && !finished && !busy && !sceneBusy;
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
                        lastRevision.current = -1;
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
                {[0, 1].map((s) => (
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
                          .filter((m: any) => m.hasDeck)
                          .map((m: any) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {m.deckName}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <h2>
                        {room.members.find(
                          (m: any) => m.id === room.state.seats?.[s],
                        )?.name || "Vaga aberta"}
                      </h2>
                    )}
                  </article>
                ))}
              </div>
              <div className="lobby-members">
                <h3>Na sala · {room.members.length}</h3>
                {room.members.map((m: any) => (
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
              highlights={highlights}
              selected={selected}
              targets={targetIds}
              mulligan={mulligan}
              startY={startY}
              busy={busy || sceneBusy}
              onPresentationBusy={setSceneBusy}
              onExit={() => setView("inicio")}
              onAct={act}
              onHand={pickHand}
              onCell={cellClick}
              onSelect={(u) => {
                if (
                  u.owner === seat &&
                  !targetMode &&
                  selected?.kind !== "hand"
                ) {
                  clear();
                  setSelected({ kind: "unit", unitId: u.id });
                }
              }}
              onDrag={setDrag}
              onDrop={dropAt}
              onFocus={(card, unit) => setFocus({ card, unit })}
              onStartY={setStartY}
              onMulligan={() => {
                void act({ type: "mulligan", handIndices: mulligan });
                setMulligan([]);
              }}
              onClear={clear}
              onConcede={() => setConcede(true)}
              controls={
                <>
                  {" "}
                  <div className="selection-panel">
                    <p className="eyebrow">
                      {selectedCard
                        ? "CARTA SELECIONADA"
                        : selectedUnit
                          ? "UNIDADE SELECIONADA"
                          : "SUA PRÓXIMA AÇÃO"}
                    </p>
                    {selectedCard || selectedUnit ? (
                      <>
                        <button
                          onClick={() =>
                            setFocus({
                              card:
                                selectedCard ||
                                catalog.get(selectedUnit!.cardId),
                              unit: selectedUnit,
                            })
                          }
                        >
                          <CardFace
                            card={
                              selectedCard || catalog.get(selectedUnit!.cardId)
                            }
                            unit={selectedUnit}
                          />
                        </button>
                        <h3>{selectedCard?.name || unitName(selectedUnit)}</h3>
                        <p>
                          {selectedCard?.effect_text ||
                            catalog.get(selectedUnit?.cardId || "")
                              ?.effect_text}
                        </p>
                        {selectedUnit && (
                          <div className="status-tags">
                            {statusLabels(selectedUnit).map((s) => (
                              <span key={s}>{s}</span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="selection-seal">式</span>
                        <h3>
                          {seat < 0
                            ? "Assista ao duelo"
                            : g.setup
                              ? "Sua primeira escolha"
                              : myTurn
                                ? "O caminho é seu."
                                : "Observe o campo."}
                        </h3>
                        <p>
                          {g.setup
                            ? "Selecione cartas da mão para trocar, ou confirme para mantê-las."
                            : "Passe o cursor em uma carta e pressione F para ler seus efeitos."}
                        </p>
                      </>
                    )}
                    {selectedCard?.kind === "spell" && (
                      <div className="target-controls">
                        <p>{spellSpecs[selectedCard.id]?.hint}</p>
                        {targetIds.map((id, i) => (
                          <small key={id}>
                            Alvo {i + 1}:{" "}
                            {unitName(g.units.find((u) => u.id === id))}
                          </small>
                        ))}
                        {cells.map((c, i) => (
                          <small key={i}>
                            Casa {i + 1}: {c.x + 1}, {c.y + 1}
                          </small>
                        ))}
                        {["discardVoid", "discardCat"].includes(
                          spellSpecs[selectedCard.id].target,
                        ) && (
                          <select
                            aria-label="Carta do descarte"
                            value={choice}
                            onChange={(e) => setChoice(e.currentTarget.value)}
                          >
                            <option value="">Escolha no descarte</option>
                            {[...new Set(me?.discard || [])]
                              .filter((id) =>
                                selectedCard.id === "ritual-do-gato-sete-vidas"
                                  ? /gato|neko/.test(id)
                                  : catalog.get(id)?.kind === "unit" &&
                                    catalog.get(id)?.types.includes("vazio"),
                              )
                              .map((id) => (
                                <option key={id} value={id}>
                                  {catalog.get(id)?.name}
                                </option>
                              ))}
                          </select>
                        )}
                        {selectedCard.id === "gishiki-n-9-mimetismo" && (
                          <select
                            aria-label="Keyword"
                            value={choice}
                            onChange={(e) => setChoice(e.currentTarget.value)}
                          >
                            <option value="">Escolha a keyword</option>
                            {transferableKeywords.map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        )}
                        {selectedCard.id ===
                          "mamorudo-n-17-defesa-da-fagulha" && (
                          <select
                            aria-label="Papel no combate"
                            value={choice}
                            onChange={(e) => setChoice(e.currentTarget.value)}
                          >
                            <option value="attacker">Atacante</option>
                            <option value="defender">Defensor</option>
                          </select>
                        )}
                        {[
                          "mamoru-n-9-wonder-wall",
                          "mamoru-n-5-transferencia-espiritual",
                        ].includes(selectedCard.id) && (
                          <label>
                            {selectedCard.id === "mamoru-n-9-wonder-wall"
                              ? "PE extra"
                              : "Dano transferido"}
                            <input
                              type="number"
                              min="0"
                              max="99"
                              value={extra}
                              onInput={(e) =>
                                setExtra(Number(e.currentTarget.value))
                              }
                            />
                          </label>
                        )}
                        <button
                          className="gold"
                          disabled={!canPlay}
                          onClick={() =>
                            act({
                              type: "cast",
                              cardId: selectedCard.id,
                              handIndex: selected.index,
                              targetId: targetIds[0],
                              targetId2: targetIds[1],
                              x: cells[0]?.x,
                              y: cells[0]?.y,
                              x2: cells[1]?.x,
                              y2: cells[1]?.y,
                              extraPe: extra,
                              choice,
                            })
                          }
                        >
                          Conjurar ·{" "}
                          {selectedCard.stats.cost +
                            (selectedCard.id === "mamoru-n-9-wonder-wall"
                              ? extra
                              : 0)}{" "}
                          PE
                        </button>
                      </div>
                    )}
                    {selectedUnit &&
                      selectedUnit.owner === seat &&
                      (abilitySpec ||
                        kw(selectedUnit, "Range") ||
                        selectedUnit.statuses?.range) && (
                        <div className="target-controls">
                          <button
                            className="outline"
                            onClick={() => setTargetMode(!targetMode)}
                          >
                            {targetMode
                              ? "Modo de alvos ativo · voltar a mover"
                              : "Escolher alvos para efeito ou Range"}
                          </button>
                          <small>
                            {abilitySpec?.hint ||
                              "Escolha um alvo para o ataque à distância."}
                          </small>
                          {targetIds.map((id) => (
                            <small key={id}>
                              Alvo: {unitName(g.units.find((u) => u.id === id))}
                            </small>
                          ))}
                          {cells.map((v, i) => (
                            <small key={i}>
                              Casa: {v.x + 1}, {v.y + 1}
                            </small>
                          ))}
                          {selectedUnit.cardId === "chama-marinha" && (
                            <select
                              value={choice}
                              onChange={(e) => setChoice(e.currentTarget.value)}
                            >
                              <option value="">Elemento de combate</option>
                              {catalog
                                .get(selectedUnit.cardId)
                                ?.types.map((e: string) => (
                                  <option key={e} value={e}>
                                    {E[e][2]}
                                  </option>
                                ))}
                            </select>
                          )}
                          {abilitySpec && (
                            <button
                              className="outline"
                              disabled={!canPlay}
                              onClick={() =>
                                act({
                                  type: "ability",
                                  unitId: selectedUnit.id,
                                  targetId: targetIds[0],
                                  x: cells[0]?.x,
                                  y: cells[0]?.y,
                                  choice,
                                })
                              }
                            >
                              {abilitySpec.label}
                            </button>
                          )}
                          {(kw(selectedUnit, "Range") ||
                            selectedUnit.statuses?.range) > 0 && (
                            <button
                              className="outline"
                              disabled={!canPlay || !targetIds[0]}
                              onClick={() =>
                                act({
                                  type: "attack",
                                  unitId: selectedUnit.id,
                                  targetId: targetIds[0],
                                })
                              }
                            >
                              Ataque à distância
                            </button>
                          )}
                        </div>
                      )}
                    {g.duel &&
                      !g.duel.opponentId &&
                      g.duel.seat !== seat &&
                      me && (
                        <button
                          className="gold"
                          disabled={
                            !selectedUnit ||
                            selectedUnit.kind !== "unit" ||
                            selectedUnit.owner !== seat
                          }
                          onClick={() =>
                            act({ type: "duel", unitId: selectedUnit?.id })
                          }
                        >
                          Escolher para o duelo
                        </button>
                      )}
                    {g.duel?.opponentId && g.duel.seat === seat && (
                      <div className="target-controls">
                        <p>Seu monstro deve atacar ou defender?</p>
                        <button
                          className="gold"
                          onClick={() =>
                            act({ type: "duel", choice: "attacker" })
                          }
                        >
                          Meu monstro ataca
                        </button>
                        <button
                          className="outline"
                          onClick={() =>
                            act({ type: "duel", choice: "defender" })
                          }
                        >
                          Meu monstro defende
                        </button>
                      </div>
                    )}
                    {selectedCard?.kind === "unit" && (
                      <div className="target-controls">
                        {targetIds.map((id) => (
                          <small key={id}>
                            Alvo da invocação:{" "}
                            {unitName(g.units.find((u) => u.id === id))}
                          </small>
                        ))}
                        {["anubis-o-gato-da-morte"].includes(
                          selectedCard.id,
                        ) && (
                          <>
                            <small>
                              Selecione o gato a sacrificar no campo.
                            </small>
                            <button
                              className="gold"
                              disabled={!targetIds[0]}
                              onClick={() =>
                                act({
                                  type: "summon",
                                  cardId: selectedCard.id,
                                  handIndex: selected.index,
                                  choice: selected.fromDeck
                                    ? "library"
                                    : undefined,
                                  targetId: targetIds[0],
                                })
                              }
                            >
                              Invocar por sacrifício
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {selected && (
                      <button className="clear-selection" onClick={clear}>
                        Limpar seleção · Esc
                      </button>
                    )}
                  </div>
                  {!!(me as any)?.summonableDeck?.length &&
                    g.phase === 1 &&
                    myTurn && (
                      <div className="stack-panel">
                        <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
                        {(me as any).summonableDeck.map((id: string) => (
                          <button
                            key={id}
                            onClick={() => {
                              clear();
                              setSelected({
                                kind: "hand",
                                cardId: id,
                                index: -1,
                                fromDeck: true,
                              });
                            }}
                          >
                            {catalog.get(id)?.name}
                          </button>
                        ))}
                      </div>
                    )}
                  {(g.stack.length > 0 || g.combat) && (
                    <div className="stack-panel">
                      <p className="eyebrow">RESPOSTAS · {g.passes}/2 PASSES</p>
                      {g.combat && (
                        <p>
                          ⚔{" "}
                          {unitName(
                            g.units.find((u) => u.id === g.combat?.attackerId),
                          )}{" "}
                          →{" "}
                          {unitName(
                            g.units.find((u) => u.id === g.combat?.defenderId),
                          )}
                        </p>
                      )}
                      {[...g.stack].reverse().map((s, i) => (
                        <button
                          key={i}
                          onClick={() =>
                            setFocus({ card: catalog.get(s.cardId) })
                          }
                        >
                          {i === 0 ? "↳ " : ""}
                          {catalog.get(s.cardId)?.name}
                        </button>
                      ))}
                      <small>A última magia resolve primeiro.</small>
                    </div>
                  )}
                </>
              }
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
              O manual não fornece fichas numéricas das maldições. Valores
              provisórios: níveis 1, 2 e 3 têm 6/9/12 de vida, 2/3/4 de ataque e
              1 de velocidade. Nível 3 retorna como nível 3. Empates de caminho
              favorecem o centro e depois usam sorteio.
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
              aliado. As habilidades opcionais de busca usam a primeira carta
              compatível do baralho embaralhado.
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
