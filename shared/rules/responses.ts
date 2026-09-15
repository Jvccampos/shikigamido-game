import type { Game, Seat } from "../model.js";
import { settleCombat } from "./combat.js";
import { resolveSpell } from "./spells.js";
import { refreshAuras } from "./turns.js";

// Resolve one response after both players pass, or under the same assumption
// in a forecast. Remaining spells, combat and searches keep their normal order.
export function resolveResponse(g: Game) {
  g.passes = 0;
  if (g.stack.length) {
    const top = g.stack.pop()!;
    resolveSpell(g, top.seat, top);
    if (!g.duel)
      g.priority = g.stack.length
        ? ((1 - g.stack.at(-1)!.seat) as Seat)
        : g.combat
          ? ((1 - g.combat.returnPriority) as Seat)
          : g.phaseOwner!;
  } else settleCombat(g);
  refreshAuras(g);
}
