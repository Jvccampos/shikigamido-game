import {
  allCards,
  freshGame,
  moveOptions,
  summonCells,
  type Game,
  type Cmd,
  type Seat,
} from "./game.js";
export function starterDeck(element: string) {
  const pool = allCards
    .filter(
      (c) =>
        c.kind === "unit" || (c.kind === "spell" && c.types.includes(element)),
    )
    .sort(
      (a, b) => a.stats.cost - b.stats.cost || a.name.localeCompare(b.name),
    );
  const main = pool.filter((c) => c.types.includes(element)),
    rest = pool.filter((c) => !c.types.includes(element));
  const cardIds = [
    ...main.slice(0, 10),
    ...[...main.slice(10), ...rest].slice(0, 5),
  ].flatMap((c) => [c.id, c.id]);
  return {
    name: `Caminho de ${element}`,
    element,
    omionji: `omionji-${element}`,
    cardIds,
  };
}
export function practiceGame(element = "agua") {
  return freshGame(
    "practice-player",
    "practice-bot",
    starterDeck(element),
    starterDeck("fogo"),
  );
}
export function botCommand(g: Game, seat: Seat): Cmd {
  const p = g.players[seat];
  if (g.setup) return { type: "ready", y: 4 };
  if (g.centerPending) return { type: "center" };
  if (g.followup) return { type: "pass" };
  if (g.duel?.opponentId) return { type: "duel", choice: "attacker" };
  if (g.duel)
    return {
      type: "duel",
      unitId: g.units.find((u) => u.owner === seat && u.kind === "unit")?.id,
    };
  if (g.combat || g.stack.length) return { type: "pass" };
  if (g.phase === 1) {
    const spot = summonCells(g, seat)[0];
    const i = p.hand.findIndex((id) => {
      const c = allCards.find((c) => c.id === id)!;
      return (
        c.kind === "unit" &&
        c.stats.cost <= p.pe + p.permanentPe &&
        c.id !== "anubis-o-gato-da-morte"
      );
    });
    if (spot && i >= 0)
      return { type: "summon", cardId: p.hand[i], handIndex: i, ...spot };
  }
  if (g.phase === 2) {
    const leader = g.units.find(
      (u) => u.kind === "omionji" && u.owner !== seat,
    );
    if (leader) {
      for (const u of g.units.filter(
        (u) => u.owner === seat && ["unit", "omionji"].includes(u.kind),
      )) {
        const options = moveOptions(g, u).sort(
          (a, b) =>
            Math.abs(a.x - leader.x) +
            Math.abs(a.y - leader.y) -
            Math.abs(b.x - leader.x) -
            Math.abs(b.y - leader.y),
        );
        if (
          options[0] &&
          (g.moved.filter(
            (id) => g.units.find((u) => u.id === id)?.owner === seat,
          ).length < 2 ||
            p.pe + p.permanentPe > 0)
        )
          return { type: "move", unitId: u.id, ...options[0] };
      }
    }
  }
  if (g.phase === 4 && p.permanentPe < 3 && p.hand.length > 2) {
    const handIndices = p.hand
      .map((id, i) =>
        allCards.find((c) => c.id === id)?.kind === "spell" ? i : -1,
      )
      .filter((i) => i >= 0)
      .slice(0, Math.min(3 - p.permanentPe, p.hand.length - 2));
    if (handIndices.length) return { type: "discardMany", handIndices };
  }
  return { type: "pass" };
}
