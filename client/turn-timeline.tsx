import { useEffect, useId, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { JSX } from "preact";
import type { GameView } from "../shared/room.js";
import {
  turnTimeline,
  type TimelineTurn,
  type TurnEvent,
} from "../shared/turn-timeline.js";

const kinds: Record<TurnEvent["kind"], { label: string }> = {
  mana: { label: "Mana" },
  curse: { label: "Maldições" },
  center: { label: "Centro" },
  effect: { label: "Magias" },
};

export function EventIcon({ kind }: { kind: TurnEvent["kind"] }) {
  const paths = {
    mana: "M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0C19 11 14 7 12 3ZM9 15c0 2 1 3 3 3",
    curse: "m5 8-1-5 5 3h6l5-3-1 5v6l-4 6H9l-4-6V8Zm3 3 2 2m6-2-2 2m-4 3h4",
    center: "m12 3 9 9-9 9-9-9 9-9Zm0 5v8m-4-4h8",
    effect: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function TimelineTrack({
  turns,
  current,
  setup,
  compact = false,
}: {
  turns: TimelineTurn[];
  current: number;
  setup?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLOListElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{
    turn: number;
    kind?: TurnEvent["kind"];
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
  // Resetting the scroll position fires a scroll event a frame later; it must
  // not dismiss a tooltip opened in the meantime.
  const resetting = useRef(false);
  useEffect(() => {
    dismiss();
    if (scroller.current?.scrollLeft) {
      resetting.current = true;
      scroller.current.scrollLeft = 0;
    }
  }, [current]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        !group.current?.contains(event.target as Node) &&
        !tooltip.current?.contains(event.target as Node)
      )
        dismiss();
    };
    const scroll = (event: Event) => {
      if (
        event.target instanceof Element &&
        group.current &&
        event.target.contains(group.current)
      )
        dismiss();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      clearTimeout(leaveTimer.current);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  function show(
    turn: number,
    button: HTMLButtonElement,
    kind?: TurnEvent["kind"],
  ) {
    clearTimeout(leaveTimer.current);
    const rect = button.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 20;
    const above = rect.top - 24;
    const useBelow = below >= 120 || below >= above;
    setActive({
      turn,
      kind,
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
    // The compact track sits at the screen edge: open its details toward
    // the board so they never run off-screen.
    if (compact)
      setActive({
        turn,
        kind,
        left:
          rect.left < innerWidth / 2
            ? Math.min(rect.right + 14, innerWidth - 352)
            : Math.max(12, rect.left - 350),
        top: Math.max(12, Math.min(rect.top - 8, innerHeight - 332)),
        maxHeight: Math.min(320, innerHeight - 24),
      });
  }
  function triggers(
    turn: number,
    kind?: TurnEvent["kind"],
  ): JSX.HTMLAttributes<HTMLButtonElement> {
    return {
      "aria-describedby":
        active?.turn === turn && active.kind === kind ? id : undefined,
      onMouseEnter: (event) => {
        pinned.current = false;
        show(turn, event.currentTarget, kind);
      },
      onFocus: (event) => show(turn, event.currentTarget, kind),
      onBlur: (event) => {
        if (
          !pinned.current ||
          (event.relatedTarget &&
            !group.current?.contains(event.relatedTarget as Node))
        )
          dismiss();
      },
      onClick: (event) => {
        pinned.current = true;
        show(turn, event.currentTarget, kind);
      },
    };
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
        onScroll={() => {
          if (resetting.current) {
            resetting.current = false;
            return;
          }
          dismiss();
        }}
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
                {...triggers(turn)}
              >
                <span className="timeline-turn-label">
                  T{turn}
                  {turn === current && <small>Atual</small>}
                </span>
                <span className="timeline-dot" aria-hidden="true" />
              </button>
              <span className="timeline-markers">
                {markers.map((kind) => (
                  <button
                    key={kind}
                    className={`timeline-icon timeline-${kind}`}
                    aria-label={`${kinds[kind].label} no turno ${turn}`}
                    {...triggers(turn, kind)}
                  >
                    <EventIcon kind={kind} />
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {selected &&
        active &&
        createPortal(
          <div
            ref={tooltip}
            onMouseEnter={() => clearTimeout(leaveTimer.current)}
            onMouseLeave={() => {
              if (!pinned.current)
                leaveTimer.current = setTimeout(() => setActive(null), 160);
            }}
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
                {active.kind && `${kinds[active.kind].label} · `}Turno{" "}
                {selected.turn}
                {selected.turn === current ? " · Atual" : ""}
              </b>
              <span>{selected.mana} PE máximos</span>
            </div>
            {(["start", "end"] as const).map((timing) => {
              const events = selected.events.filter(
                (event) =>
                  event.timing === timing &&
                  (!active.kind || event.kind === active.kind),
              );
              if (!events.length && (timing === "end" || active.kind))
                return null;
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
          </div>,
          group.current?.closest("dialog") || document.body,
        )}
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
      {!game.setup && (
        <aside className="turn-track" aria-label="Linha do tempo">
          <div className="turn-track-heading">
            <span>Próximos turnos</span>
            <button onClick={onOpen} aria-label="Ampliar linha do tempo">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
              </svg>
            </button>
          </div>
          <TimelineTrack
            turns={turns.slice(0, 5)}
            current={game.turn}
            compact
          />
        </aside>
      )}
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
