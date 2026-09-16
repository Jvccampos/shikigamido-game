import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import {
  turnTimeline,
  type TimelineTurn,
  type TurnEvent,
} from "../shared/turn-timeline.js";

const kinds: Record<TurnEvent["kind"], { label: string; symbol: string }> = {
  mana: { label: "Mana", symbol: "+" },
  curse: { label: "Maldições", symbol: "◆" },
  center: { label: "Centro", symbol: "◎" },
  effect: { label: "Magias", symbol: "✦" },
};

function TimelineTrack({
  turns,
  current,
  setup,
}: {
  turns: TimelineTurn[];
  current: number;
  setup?: boolean;
}) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState<{
    turn: number;
    left: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const selected = turns.find((t) => t.turn === active?.turn);
  const dismiss = () => {
    clearTimeout(leaveTimer.current);
    pinned.current = false;
    setActive(null);
  };
  useEffect(() => {
    dismiss();
    if (scroller.current) scroller.current.scrollLeft = 0;
  }, [current]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!group.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    return () => {
      clearTimeout(leaveTimer.current);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  function show(turn: number, button: HTMLButtonElement) {
    clearTimeout(leaveTimer.current);
    const rect = button.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 20;
    const above = rect.top - 24;
    const useBelow = below >= 120 || below >= above;
    setActive({
      turn,
      left: Math.max(
        12,
        Math.min(
          innerWidth - Math.min(340, innerWidth - 24) - 12,
          rect.left + rect.width / 2 - 170,
        ),
      ),
      top: useBelow
        ? rect.bottom + 8
        : Math.max(12, rect.top - Math.min(380, above) - 8),
      maxHeight: Math.min(380, useBelow ? below : above),
    });
  }
  return (
    <div
      ref={group}
      className="timeline-track-group"
      onMouseEnter={() => clearTimeout(leaveTimer.current)}
      onMouseLeave={() => {
        if (!pinned.current)
          leaveTimer.current = setTimeout(() => setActive(null), 160);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && active) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <ol
        ref={scroller}
        className="timeline-track"
        aria-label="Turnos da partida"
        onScroll={dismiss}
      >
        {turns.map(({ turn, events }) => {
          const markers = (Object.keys(kinds) as TurnEvent["kind"][]).filter(
            (kind) => events.some((event) => event.kind === kind),
          );
          return (
            <li key={turn} className="timeline-stop">
              <button
                className="timeline-node"
                aria-current={turn === current ? "step" : undefined}
                aria-label={`Turno ${turn}${turn === current ? ", atual" : ""}. ${markers.length ? markers.map((kind) => kinds[kind].label).join(", ") : "Renovação de energia e compra"}`}
                aria-describedby={active?.turn === turn ? id : undefined}
                onMouseEnter={(event) => {
                  pinned.current = false;
                  show(turn, event.currentTarget);
                }}
                onFocus={(event) => show(turn, event.currentTarget)}
                onBlur={() => {
                  if (!pinned.current) setActive(null);
                }}
                onClick={(event) => {
                  pinned.current = true;
                  show(turn, event.currentTarget);
                }}
              >
                <span className="timeline-turn-label">
                  T{turn}
                  {turn === current && <small>Atual</small>}
                </span>
                <span className="timeline-dot" aria-hidden="true" />
                <span className="timeline-markers" aria-hidden="true">
                  {markers.map((kind) => (
                    <i key={kind} className={`timeline-${kind}`}>
                      {kinds[kind].symbol}
                    </i>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {selected && active && (
        <div
          id={id}
          role="tooltip"
          className="timeline-tooltip"
          style={{
            left: active.left,
            top: active.top,
            maxHeight: active.maxHeight,
          }}
        >
          <div className="timeline-tooltip-heading">
            <b>
              Turno {selected.turn}
              {selected.turn === current ? " · Atual" : ""}
            </b>
            <span>{selected.mana} PE máximos</span>
          </div>
          {(["start", "end"] as const).map((timing) => {
            const events = selected.events.filter(
              (event) => event.timing === timing,
            );
            if (!events.length && timing === "end") return null;
            return (
              <div key={timing}>
                <h4>
                  {timing === "end"
                    ? "No fim do turno"
                    : selected.turn === current && !setup
                      ? "Início deste turno · já ocorreu"
                      : "No início do turno"}
                </h4>
                {!events.length && (
                  <p>Renovação de energia e compra de carta.</p>
                )}
                {events.map((event, i) => (
                  <div
                    key={i}
                    className={`timeline-event timeline-${event.kind}`}
                  >
                    <strong>{event.label}</strong>
                    <p>{event.detail}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="timeline-legend" aria-label="Cores dos eventos">
      {Object.entries(kinds).map(([kind, { label, symbol }]) => (
        <span key={kind}>
          <i className={`timeline-${kind}`} aria-hidden="true">
            {symbol}
          </i>
          {label}
        </span>
      ))}
    </div>
  );
}

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
      <aside className="turn-timeline-bar" aria-label="Linha do tempo">
        <div className="timeline-bar-heading">
          <span>TURNOS</span>
          <Legend />
          <button onClick={onOpen} aria-label="Ampliar linha do tempo">
            ↗
          </button>
        </div>
        <TimelineTrack turns={turns} current={game.turn} setup={game.setup} />
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
          <div className="timeline-dialog-heading">
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
          </div>
          <p>
            Passe o mouse, selecione pelo teclado ou toque em um turno para ver
            os eventos.
          </p>
          <Legend />
          <TimelineTrack turns={turns} current={game.turn} setup={game.setup} />
          <div className="timeline-dialog-footer">
            <span>
              A energia renova e cada jogador compra uma carta no início de cada
              turno. Os efeitos previstos podem mudar com novas jogadas.
            </span>
            <button onClick={() => setCount(count + 6)}>
              Ver mais 6 turnos
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
