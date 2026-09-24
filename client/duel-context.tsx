import { useEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import { phases } from "../shared/game.js";
import { duelGuide, type DuelGuide, type GuideInput } from "./duel-guide.js";

/** The turn bar: where the turn is, who acts, and what to do now. */
export function DuelContext({
  game: g,
  seat,
  names,
  presenting,
  input,
}: {
  game: GameView;
  seat: number;
  names: string[];
  presenting: string | null;
  input: GuideInput;
}) {
  const live = duelGuide(g, seat, names, input);
  // While the board animates the previous action, keep describing the state
  // the player is watching instead of jumping ahead to the next decision.
  const settled = useRef<DuelGuide>(live);
  if (!presenting) settled.current = live;
  const guide = presenting ? settled.current : live;
  const event = useEventCaption(presenting);
  return (
    <div className={`duel-context tone-${guide.tone} actor-${guide.actor}`}>
      <ol className="turn-steps" aria-label={`Turno ${g.turn}`}>
        <li className="turn-number">Turno {g.turn}</li>
        {[1, 2, 3, 4].map((phase) => {
          const halves = guide.steps.filter((s) => s.phase === phase),
            current = halves.some((s) => s.state === "current"),
            done = halves.every((s) => s.state === "done");
          return (
            <li
              key={phase}
              className={`turn-phase ${current ? "current" : done ? "done" : ""}`}
            >
              <span className="turn-phase-name">{phases[phase]}</span>
              <span className="turn-pips">
                {halves.map((s) => (
                  <i
                    key={s.seat}
                    className={`turn-pip ${s.state} seat-${s.seat}`}
                    aria-current={s.state === "current" ? "step" : undefined}
                    aria-label={`${phases[phase]} · ${s.seat === seat ? "Você" : names[s.seat]}`}
                    title={`${phases[phase]} · ${s.seat === seat ? "Você" : names[s.seat]}`}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <h1 key={guide.title}>
        {guide.tone === "mine" || guide.tone === "response" ? (
          <span className="context-badge">{guide.badge}</span>
        ) : null}
        {guide.title}
      </h1>
      <p className="context-detail" role="status" key={guide.detail}>
        {guide.detail}
      </p>
      <p className="context-event" aria-live="polite">
        {event && (
          <span key={event.id} className={presenting ? "active" : ""}>
            {event.text}
          </span>
        )}
      </p>
    </div>
  );
}

/** Keeps the latest board event readable for a moment after it plays. */
function useEventCaption(presenting: string | null) {
  const [event, setEvent] = useState<{ id: number; text: string } | null>(null);
  const count = useRef(0);
  useEffect(() => {
    if (presenting) {
      setEvent({ id: ++count.current, text: presenting });
      return;
    }
    const timer = setTimeout(() => setEvent(null), 4000);
    return () => clearTimeout(timer);
  }, [presenting]);
  return event;
}

/** Setup uses the same bar so the header never changes shape between modes. */
export function SetupContext({
  step,
  waiting,
  spectator,
}: {
  step: 1 | 2;
  waiting: boolean;
  spectator: boolean;
}) {
  return (
    <div className="duel-context tone-setup">
      <ol className="turn-steps" aria-label="Preparação">
        <li className="turn-number">Preparação</li>
        {["Mão inicial", "Posição"].map((name, i) => (
          <li
            key={name}
            className={`turn-phase ${i + 1 === step && !waiting ? "current" : i + 1 < step || waiting ? "done" : ""}`}
          >
            <span className="turn-phase-name">{name}</span>
            <span className="turn-pips">
              <i
                className={`turn-pip ${i + 1 === step && !waiting ? "current" : i + 1 < step || waiting ? "done" : "next"}`}
              />
            </span>
          </li>
        ))}
      </ol>
      <h1>
        {waiting && <span className="waiting-pulse" aria-hidden="true" />}
        {spectator
          ? "Os jogadores estão se preparando"
          : waiting
            ? "Aguardando o oponente"
            : step === 1
              ? "Escolha sua mão inicial"
              : "Escolha onde começar"}
      </h1>
      <p className="context-detail" role="status">
        {spectator
          ? "Cada um escolhe sua mão inicial e onde seu Omionji começa."
          : waiting
            ? "Você está pronto. O duelo começa quando o oponente escolher seu selo."
            : step === 1
              ? "Troque as cartas que não quiser. Você pode fazer isso uma vez."
              : "Seu Omionji começa em um dos dois selos iluminados."}
      </p>
    </div>
  );
}
