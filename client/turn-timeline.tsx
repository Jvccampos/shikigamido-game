import { useEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import { turnTimeline } from "../shared/turn-timeline.js";

export function TurnTimeline({
  game,
  names,
  open,
  onOpen,
  onClose,
}: {
  game: GameView;
  names: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(7);
  const turns = turnTimeline(game, names, count);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  if (!turns.length) return null;
  return (
    <>
      <aside className="turn-timeline-preview" aria-label="Próximos turnos">
        <button onClick={onOpen} aria-label="Abrir linha do tempo de turnos">
          <span>Linha do tempo</span>
          <span aria-hidden="true">↗</span>
        </button>
        <ol>
          {turns.slice(0, 4).map(({ turn, mana, events }) => (
            <li
              key={turn}
              aria-current={turn === game.turn ? "step" : undefined}
            >
              <b>T{turn}</b>
              <div>
                <strong>
                  {turn === game.turn ? "Agora" : `${mana} PE máximos`}
                </strong>
                {events.length ? (
                  events
                    .slice(0, 3)
                    .map((event, i) => <span key={i}>{event.label}</span>)
                ) : (
                  <span>Renovação de energia e compra</span>
                )}
                {events.length > 3 && (
                  <small>+{events.length - 3} eventos</small>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
      {open && (
        <dialog
          ref={dialog}
          className="turn-timeline-dialog"
          aria-labelledby="turn-timeline-title"
          onClose={onClose}
          onClick={(event) => {
            if (event.target === dialog.current) dialog.current?.close();
          }}
        >
          <header>
            <div>
              <small>
                TURNO {game.turn} · {game.setup ? "PREPARAÇÃO" : "EM CURSO"}
              </small>
              <h2 id="turn-timeline-title">Linha do tempo de turnos</h2>
            </div>
            <button
              autoFocus
              aria-label="Fechar linha do tempo"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </header>
          <p>
            A energia renova e cada jogador compra uma carta no início de cada
            turno. A mana máxima aumenta a cada dois turnos.
          </p>
          <p className="timeline-note">
            Efeitos previstos enquanto as cartas permanecerem em campo. Novas
            jogadas podem mudar os prazos.
          </p>
          <ol className="timeline-turns">
            {turns.map(({ turn, mana, events }) => (
              <li
                key={turn}
                className="timeline-turn"
                aria-current={turn === game.turn ? "step" : undefined}
              >
                <div className="timeline-turn-heading">
                  <h3>Turno {turn}</h3>
                  {turn === game.turn && (
                    <span>{game.setup ? "Preparação" : "Atual"}</span>
                  )}
                  <b>{mana} PE máximos</b>
                </div>
                <ol className="timeline-events">
                  {(["start", "end"] as const).map((timing) => {
                    const entries = events.filter((e) => e.timing === timing);
                    if (!entries.length && timing === "end") return null;
                    return (
                      <li key={timing}>
                        <h4>
                          {timing === "start"
                            ? turn === game.turn && !game.setup
                              ? "Início deste turno · já ocorreu"
                              : "No início do turno"
                            : "No fim do turno"}
                        </h4>
                        {entries.length ? (
                          entries.map((entry, i) => (
                            <div
                              key={i}
                              className={`timeline-event timeline-${entry.kind}`}
                            >
                              <strong>{entry.label}</strong>
                              <p>{entry.detail}</p>
                            </div>
                          ))
                        ) : (
                          <p className="timeline-empty">
                            Renovação de energia e compra de carta.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
          <footer>
            <p>
              Após o turno 3, as maldições avançam no início dos turnos. Outras
              podem surgir conforme os combates.
            </p>
            <button onClick={() => setCount(count + 6)}>
              Ver mais 6 turnos
            </button>
          </footer>
        </dialog>
      )}
    </>
  );
}
