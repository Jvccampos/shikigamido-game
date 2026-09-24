import { useEffect, useState } from "preact/hooks";
import { actionSelection, emptyActionSelection } from "./action-selection.js";
import { MatchControls } from "./match-controls.js";
import type { Cmd } from "../shared/model.js";
import type { GameView, UnitView } from "../shared/room.js";
import type { Card } from "../shared/cards.js";
import type { CardFocus } from "./card.js";
export type { Selection } from "./action-selection.js";

/** Connect the selection model to Preact and the current match lifetime. */
export function useMatchInteraction(
  g: GameView,
  seat: number,
  busy: boolean,
  onAct: (command: Cmd) => Promise<boolean>,
  setFocus: (focus: CardFocus) => void,
  code: string,
) {
  const [state, update] = useState(emptyActionSelection);
  const model = actionSelection(g, seat, busy, state, update, onAct);
  const me = seat >= 0 ? g.players[seat] : null;
  useEffect(model.reset, [code]);
  useEffect(model.clear, [g.turn, g.phase, g.phaseOwner]);
  useEffect(() => {
    if (!g.setup || me?.mulligan || me?.ready) model.clearMulligan();
  }, [g.setup, me?.mulligan, me?.ready]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") model.clear();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [code]);
  return {
    arena: {
      ...model.arena,
      onFocus: (card: Card | undefined, unit?: UnitView) =>
        setFocus({ card, unit }),
      controls: (
        <MatchControls
          view={model.controls}
          onRead={(card) => setFocus({ card })}
        />
      ),
    },
  };
}
