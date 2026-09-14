import { useState } from "preact/hooks";
import { cards, phases, type Game, type GameEvent } from "../shared/game.js";
const cell = (u: any) =>
  !u
    ? ""
    : u.x < 0 || u.y > 6
      ? "Portal sul"
      : u.x > 6 || u.y < 0
        ? "Portal norte"
        : `${String.fromCharCode(65 + u.x)}${u.y + 1}`;
export function Journal(p: {
  game: Game;
  names: string[];
  seat: number;
  onClose: () => void;
  onFocus: (c: any) => void;
}) {
  const [tab, setTab] = useState("actions"),
    [filter, setFilter] = useState("all"),
    [discardSeat, setDiscardSeat] = useState(Math.max(0, p.seat));
  const events = [...(p.game.events || [])]
    .reverse()
    .filter((e) =>
      [
        "turn",
        "summon",
        "move",
        "combat",
        "discard",
        "destroy",
        "spell",
        "ability",
        "concede",
      ].includes(e.type),
    )
    .filter((e) =>
      filter === "all" || filter === "combat"
        ? filter === "all" || e.type === "combat"
        : ["summon", "spell", "discard", "ability"].includes(e.type),
    );
  function thumb(id?: string) {
    const c = cards.get(id || "");
    return c ? (
      <button
        className="event-card"
        onClick={() => p.onFocus(c)}
        title={`Ler ${c.name}`}
      >
        <img src={c.asset} alt={c.name} />
      </button>
    ) : (
      <span className="event-icon">{id === "hidden" ? "?" : "✦"}</span>
    );
  }
  function event(e: GameEvent) {
    const unit = "unit" in e ? e.unit : undefined,
      cardId = "cardId" in e ? e.cardId : unit?.cardId,
      seat = "seat" in e ? e.seat : unit?.owner;
    const c = cards.get(cardId || ""),
      name =
        c?.name ||
        (unit?.kind === "crystal"
          ? "Cristal de invocação"
          : unit?.kind === "curse"
            ? `Maldição ${unit.level || ""}`
            : "Carta oculta"),
      owner = p.names[seat ?? -1] || "";
    let title = "",
      detail = "";
    switch (e.type) {
      case "turn":
        title = `Turno ${e.turn}`;
        detail = "Compra automática · energia renovada";
        break;
      case "summon":
        title =
          unit?.kind === "curse" ? "Uma maldição surgiu" : `${owner} invocou`;
        detail = `${name} · ${cell(e.unit)}`;
        break;
      case "move":
        title = `${name} se moveu`;
        detail = `${owner} · destino ${cell(e.unit) || cell({ x: e.path?.at(-1)?.[0], y: e.path?.at(-1)?.[1] })}`;
        break;
      case "combat":
        return (
          <>
            <div className="event-duel">
              {thumb(e.attacker?.cardId)}
              <span>⚔</span>
              {thumb(e.defender?.cardId)}
            </div>
            <div className="event-body">
              <strong>{e.keyword}</strong>
              <p>
                {cards.get(e.attacker?.cardId)?.name || "Unidade"}{" "}
                <b>−{e.attackDamage}</b> →{" "}
                {cards.get(e.defender?.cardId)?.name || "Unidade"}
              </p>
              <p>
                Contra-ataque: <b>{e.defenseDamage} de dano</b>
              </p>
              <small>{phases[e.phase ?? 2]}</small>
            </div>
          </>
        );
      case "discard":
        title = `${owner} descartou`;
        detail = `${name} · +1 Reserva`;
        break;
      case "destroy":
        title = `${name} foi derrotado`;
        detail = owner;
        break;
      case "spell":
        title = name;
        detail = "Magia resolvida";
        break;
      case "ability":
        title = name;
        detail = "Habilidade ativada";
        break;
      case "concede":
        title = `${owner} concedeu`;
        detail = "Fim da partida";
        break;
      default:
        return null;
    }
    return (
      <>
        {thumb(cardId)}
        <div className="event-body">
          <strong>{title}</strong>
          <p>{detail}</p>
          {e.type !== "turn" && <small>{phases[e.phase ?? 1]}</small>}
        </div>
      </>
    );
  }
  return (
    <aside
      className="duel-journal"
      role="dialog"
      aria-label="Histórico da partida"
    >
      <header>
        <div>
          <small>PARTIDA · TURNO {p.game.turn}</small>
          <h2>Histórico</h2>
        </div>
        <button onClick={p.onClose} aria-label="Fechar histórico">
          ×
        </button>
      </header>
      <nav>
        <button
          className={tab === "actions" ? "active" : ""}
          onClick={() => setTab("actions")}
        >
          Ações
        </button>
        <button
          className={tab === "discard" ? "active" : ""}
          onClick={() => setTab("discard")}
        >
          Cartas descartadas
        </button>
      </nav>
      {tab === "actions" ? (
        <>
          <div className="journal-filters">
            {[
              ["all", "Todas"],
              ["combat", "Combates"],
              ["cards", "Cartas"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
            <span>Mais recentes primeiro</span>
          </div>
          <div className="journal-scroll">
            {events.length ? (
              events.map((e, i) => (
                <div key={e.id}>
                  {(i === 0 || events[i - 1].turn !== e.turn) && (
                    <h3 className="journal-turn">Turno {e.turn}</h3>
                  )}
                  <article className={`journal-event event-${e.type}`}>
                    {event(e)}
                  </article>
                </div>
              ))
            ) : (
              <p className="journal-empty">
                {p.game.setup
                  ? "As primeiras ações aparecem quando a batalha começa."
                  : "Nenhuma ação deste tipo por enquanto."}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="journal-players">
            {p.names.map((name, i) => (
              <button
                key={i}
                className={discardSeat === i ? "active" : ""}
                onClick={() => setDiscardSeat(i)}
              >
                {i === p.seat ? "Você" : name}{" "}
                <b>{p.game.players[i].discard.length}</b>
              </button>
            ))}
          </div>
          <div className="journal-scroll discard-gallery">
            {p.game.players[discardSeat].discard.length ? (
              [...new Set(p.game.players[discardSeat].discard)].map((id) => {
                const c = cards.get(id)!;
                return (
                  <button key={id} onClick={() => p.onFocus(c)}>
                    <img src={c.asset} alt={c.name} />
                    <span>{c.name}</span>
                    <b>
                      ×
                      {
                        p.game.players[discardSeat].discard.filter(
                          (x) => x === id,
                        ).length
                      }
                    </b>
                  </button>
                );
              })
            ) : (
              <p className="journal-empty">Nenhuma carta no descarte.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
