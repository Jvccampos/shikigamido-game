import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, freshGame, type Cmd } from "../shared/game.js";
import { botCommand, starterDeck } from "../shared/practice.js";
import { isCommand } from "../shared/model.js";
import { publicRoom } from "../shared/visibility.js";

const game = (seed = 1729) =>
  freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), seed);

test("malformed command payloads are rejected before mutating the match", () => {
  for (const value of [
    null,
    [],
    {},
    { type: "unknown" },
    { type: "mulligan", handIndices: "0" },
    { type: "move", x: NaN },
    { type: "cast", extraPe: -Infinity },
    { type: "cast", cardId: {} },
    { type: "pass", players: [] },
    { type: "discardMany", handIndices: [null] },
  ]) {
    const g = game(),
      before = structuredClone(g);
    assert.equal(isCommand(value), false);
    assert.equal(apply(g, 0, value as Cmd), "Comando inválido.");
    assert.deepEqual(g, before);
  }
});

test("seeded matches reproduce draws, combat, curse paths and event IDs", () => {
  const a = game(),
    b = game();
  assert.deepEqual(a, b);
  for (let i = 0; i < 250 && a.winner === null && !a.draw; i++) {
    const seat = a.setup
      ? a.players[0].ready
        ? 1
        : 0
      : a.centerPending
        ? Object.hasOwn(a.centerChoices || {}, 0)
          ? 1
          : 0
        : a.priority;
    const command = botCommand(a, seat);
    const ea = apply(a, seat, structuredClone(command));
    const eb = apply(b, seat, structuredClone(command));
    assert.equal(ea, eb, `seed 1729, action ${i}`);
    assert.deepEqual(
      a,
      b,
      `seed 1729, action ${i}: ${JSON.stringify(command)}`,
    );
    if (ea) {
      apply(a, seat, { type: "pass" });
      apply(b, seat, { type: "pass" });
    }
  }
  assert(a.turn >= 3, "fixture reaches curse movement");
  assert.notDeepEqual(game(1729).players, game(1730).players);
});

test("seeded randomness is private, and live matches have no predictable test seed", () => {
  const g = game();
  for (const viewer of ["a", "b", null]) {
    const visible = publicRoom({ state: g, spectators: [] }, viewer);
    assert.equal(visible.state.random, undefined);
  }
  assert(g.random);
  assert.equal(
    freshGame("a", "b", starterDeck("agua"), starterDeck("fogo")).random,
    undefined,
  );
});

test("persisted version-one games work without newer optional fields", () => {
  const g = game();
  delete g.rulesVersion;
  delete g.random;
  delete g.sequence;
  assert.equal(apply(g, 0, { type: "ready", y: 2 }), undefined);
  assert.equal(apply(g, 1, { type: "ready", y: 4 }), undefined);
  assert.equal(g.rulesVersion, 1);
  assert.equal(g.setup, false);
  assert.equal(new Set(g.units.map((unit) => unit.id)).size, g.units.length);
});

test("a newer rules version is rejected without changing its saved state", () => {
  const g = game();
  g.rulesVersion = 2;
  const before = structuredClone(g);
  assert.match(
    apply(g, 0, { type: "ready", y: 2 }) || "",
    /versão mais recente/,
  );
  assert.deepEqual(g, before);
});
