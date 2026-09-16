import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { E, SPEED, CardFace, type CardFocus } from "./card.js";
import { openLogin, mutate, type useQuery } from "./network.js";
import { allCards, cards as catalog, validateDeck } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import type { MutationResponse } from "../shared/room.js";

export function DeckBuilder({
  active,
  element,
  onElement: setElement,
  decks,
  selectedDeck,
  onSelectedDeck: setSelectedDeck,
  authenticated,
  busy,
  request,
  onFocus: setFocus,
  flash,
}: {
  active: boolean;
  element: string;
  onElement: (value: string) => void;
  decks: ReturnType<typeof useQuery<"myDecks">>;
  selectedDeck: string;
  onSelectedDeck: (id: string) => void;
  authenticated: boolean;
  busy: boolean;
  request: (
    fn: () => Promise<MutationResponse>,
  ) => Promise<MutationResponse | undefined>;
  onFocus: (focus: CardFocus) => void;
  flash: (message: string) => void;
}) {
  const [deckName, setDeckName] = useState("Maré ancestral"),
    [chosen, setChosen] = useState<string[]>([]),
    [editId, setEditId] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const hovered = useRef<CardFocus | null>(null);
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (e.key.toLowerCase() === "f" && hovered.current) {
        setFocus(hovered.current);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, setFocus]);
  async function save() {
    if (!authenticated) {
      openLogin();
      return;
    }
    const r = await request(() =>
      mutate("saveDeck", {
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
  if (!active) return null;
  return (
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
          onClick={() => setFocus({ card: catalog.get(`omionji-${element}`) })}
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
              Escolha suas cartas à direita ou comece com um baralho inicial.
            </p>
          )}
        </div>
        <small className="muted">
          30 cartas · mínimo 20 do elemento · até 2 cópias. Magias do elemento
          principal.
        </small>
        <button className="gold" disabled={!!deckError || busy} onClick={save}>
          {authenticated ? "Salvar baralho" : "Entrar para salvar"}
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
                    await request(() => mutate("deleteDeck", d.id));
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
                  {c.kind === "spell" && c.stats.variable ? "X" : c.stats.cost} PE ·{" "}
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
  );
}
