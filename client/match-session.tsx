import { useEffect, useRef, useState } from "preact/hooks";
import { Arena } from "./arena.js";
import { useDuelPresentation } from "./use-duel-presentation.js";
import { useMatchInteraction } from "./match-interaction.js";
import { mutate } from "./network.js";
import { apply, type Game, type Cmd } from "../shared/game.js";
import { botCommand } from "../shared/practice.js";
import type { GameView, MutationResponse } from "../shared/room.js";
import type { CardFocus } from "./card.js";

/** Mounted only while playing. Bot timers and input stop when leaving the arena. */
export function MatchSession({
  game: g,
  seat,
  code,
  names,
  practice,
  onPractice: setPractice,
  busy,
  request,
  onFocus: setFocus,
  flash,
  onExit,
}: {
  game: GameView;
  seat: number;
  code: string;
  names: string[];
  practice: Game | null;
  onPractice: (game: Game) => void;
  busy: boolean;
  request: (
    fn: () => Promise<MutationResponse>,
  ) => Promise<MutationResponse | undefined>;
  onFocus: (focus: CardFocus) => void;
  flash: (message: string) => void;
  onExit: () => void;
}) {
  const [concede, setConcede] = useState(false);
  const presentation = useDuelPresentation(g, seat, names);
  const localRef = useRef(practice);
  localRef.current = practice;
  // Both the player and the bot write the practice game. Keep the ref current
  // between renders so neither overwrites a command the other just applied.
  const commit = (next: Game) => {
    localRef.current = next;
    setPractice(next);
  };
  const myTurn = seat === g.priority && !g.setup && !g.centerPending;
  // Setup has no board events to present. Letting the bot's setup update
  // block input would briefly disable the choice the player is clicking.
  const inputBlocked = presentation.inputBlocked && !g.setup;
  const interaction = useMatchInteraction(
    g,
    seat,
    busy || inputBlocked,
    act,
    setFocus,
    code,
  );
  useEffect(() => {
    if (
      !practice ||
      practice.winner !== null ||
      practice.draw ||
      presentation.automationBlocked
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
          commit(clean);
        }
        return;
      }
      // Conversion is a single choice. Hand over the phase without another
      // thinking pause after every discarded card and the final pass.
      if (cmd.type === "discardMany") apply(next, 1, { type: "pass" });
      next.revision = (next.revision || 0) + 1;
      commit(next);
    }, 750);
    return () => clearTimeout(timer);
  }, [practice, presentation.automationBlocked]);
  async function act(cmd: Cmd) {
    if (busy || inputBlocked) return false;
    if (localRef.current) {
      const next = structuredClone(localRef.current),
        error = apply(next, 0, cmd);
      if (error) {
        flash(error);
        return false;
      }
      next.revision = (next.revision || 0) + 1;
      commit(next);

      return true;
    }
    const r = await request(() =>
      mutate("gameCommand", code, cmd, g.revision || 0),
    );
    return !!r && !r.error;
  }
  useEffect(() => {
    if (
      !g.setup &&
      g.phase === 0 &&
      myTurn &&
      !g.stack.length &&
      !g.combat &&
      !g.searches?.length &&
      !busy &&
      !inputBlocked
    ) {
      const timer = setTimeout(() => void act({ type: "pass" }), 500);
      return () => clearTimeout(timer);
    }
  }, [g, seat, busy, inputBlocked]);
  return (
    <>
      <Arena
        game={g}
        seat={seat}
        code={code}
        names={names}
        {...interaction.arena}
        busy={busy || inputBlocked}
        presentation={presentation}
        onExit={onExit}
        onConcede={() => setConcede(true)}
      />
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
    </>
  );
}
