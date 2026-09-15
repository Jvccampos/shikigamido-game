import { allCards } from "../cards.js";
import type { Game, Seat } from "../model.js";
import { random } from "../random.js";
import { event, makeUnit } from "./core.js";
import { spawns } from "./board.js";

export const curseLevel = (cost: number) => (cost <= 1 ? 1 : cost <= 3 ? 2 : 3);

export function spawnCurse(g: Game, owner: Seat, level: number) {
  const pool = allCards.filter(
    (c) => c.kind === "curse" && curseLevel(c.stats.cost) === level,
  );
  const card = pool[Math.floor(random(g.random) * pool.length)];
  const u = makeUnit(g, owner, card.id, ...spawns[owner]);
  u.level = level;
  g.units.push(u);
  event(g, { type: "summon", unit: u });

  return u;
}
