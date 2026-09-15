import { resolveSpell } from "../shared/rules/spells.js";
import { makeUnit } from "../shared/rules/core.js";
import { summonEffects, destroy } from "../shared/rules/units.js";
import { commandError } from "../shared/action-advice.js";
import type { Seat, Cmd } from "../shared/model.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, freshGame, validateDeck, startTurn } from "../shared/game.js";
import { cards } from "../shared/cards.js";
import { starterDeck, botCommand } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";

function game() {
  const g = freshGame("a", "b", starterDeck("fogo"), starterDeck("agua"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 1;
  g.phaseOwner = g.priority = 0;
  g.players[0].pe = 10;
  g.players[0].hand = ["taodu-curador"];
  g.players[0].library = [
    "taodu-katana",
    "taodu-ferreiro",
    "taodu-katana",
    "taodu-corrupto",
    "lobo-branco",
  ];
  return g;
}
test("cursed cards cannot enter a player deck", () => {
  const deck = starterDeck("fogo");
  deck.cardIds[0] = "taodu-corrupto";
  assert.match(validateDeck(deck) || "", /maldi/i);
  assert.equal(cards.get("taodu-corrupto")!.kind, "curse");
});
test("summoning Curador asks instead of silently taking the first Taodu", () => {
  const g = game();
  assert.equal(
    apply(g, 0, {
      type: "summon",
      cardId: "taodu-curador",
      handIndex: 0,
      x: 0,
      y: 0,
    }),
    undefined,
  );
  assert.deepEqual(
    g.players[0].hand,
    [],
    "search must wait for the player's choice",
  );
  assert.equal(g.players[0].library.length, 5);
  assert.equal(g.searches?.[0].sourceCardId, "taodu-curador");
  assert.deepEqual(publicGame(g, 0).searches?.[0].options, [
    "taodu-ferreiro",
    "taodu-katana",
  ]);
});

test("search selects one chosen copy, survives reconnect, and keeps choices private", () => {
  const g = game();
  summonEffects(g, makeUnit(g, 0, "taodu-curador", 0, 0));
  const restored = JSON.parse(JSON.stringify(g)) as typeof g;
  const promptId = restored.searches![0].id;
  const cmd = { type: "search", promptId, cardId: "taodu-ferreiro" } as const;
  assert.equal(commandError(publicGame(restored, 0), 0, cmd), undefined);
  for (const viewer of [1, -1] as const)
    assert.deepEqual(publicGame(restored, viewer).searches![0].options, []);
  assert.equal(apply(restored, 0, cmd), undefined);
  assert.equal(restored.players[0].hand.at(-1), "taodu-ferreiro");
  assert.equal(
    restored.players[0].library.filter((id) => id === "taodu-katana").length,
    2,
  );
  assert.equal(restored.players[0].library.includes("taodu-ferreiro"), false);
  assert.equal(restored.searches!.length, 0);
  assert.equal(restored.priority, g.priority);
  for (const viewer of [1, -1] as const) {
    const event = publicGame(restored, viewer).events.at(-1)!;
    assert(event.type === "search");
    assert.equal(event.cardId, undefined);
    assert.equal(publicGame(restored, viewer).log, undefined);
  }
  const ownEvent = publicGame(restored, 0).events.at(-1)!;
  assert(ownEvent.type === "search");
  assert.equal(ownEvent.cardId, "taodu-ferreiro");
});

test("search rejects other players, stale prompts, curses and unrelated actions without mutation", () => {
  const g = game();
  summonEffects(g, makeUnit(g, 0, "taodu-curador", 0, 0));
  const promptId = g.searches![0].id;
  for (const [seat, cmd] of [
    [1, { type: "search", promptId, cardId: "taodu-katana" }],
    [0, { type: "search", promptId: "stale", cardId: "taodu-katana" }],
    [0, { type: "search", promptId, cardId: "taodu-corrupto" }],
    [0, { type: "pass" }],
    [0, { type: "summon", cardId: "taodu-curador", handIndex: 0, x: 0, y: 0 }],
  ] as [Seat, Cmd][]) {
    const before = structuredClone(g);
    assert(apply(g, seat, cmd));
    assert.deepEqual(g, before);
  }
  assert.equal(
    apply(g, 0, { type: "search", promptId, cardId: "taodu-katana" }),
    undefined,
  );
  assert.equal(
    g.players[0].library.filter((id) => id === "taodu-katana").length,
    1,
  );
  assert(apply(g, 0, { type: "search", promptId, cardId: "taodu-katana" }));
});

test("optional searches can be declined and empty searches can always continue", () => {
  for (const empty of [false, true]) {
    const g = game();
    if (empty) g.players[0].library = ["taodu-corrupto", "lobo-branco"];
    summonEffects(g, makeUnit(g, 0, "taodu-curador", 0, 0));
    const hand = [...g.players[0].hand];
    const library = [...g.players[0].library].sort();
    assert.equal(
      apply(g, 0, {
        type: "search",
        promptId: g.searches![0].id,
        choice: "skip",
      }),
      undefined,
    );
    assert.deepEqual(g.players[0].hand, hand);
    assert.deepEqual([...g.players[0].library].sort(), library);
    const event = g.events!.at(-1)!;
    assert(event.type === "search");
    assert.equal(event.outcome, empty ? "empty" : "skipped");
  }
});

test("Anubis recovery and Tsuchi death queue choices for their owner without changing turn priority", () => {
  const g = game();
  g.players[1].discard = [
    "neko-o-gato-eletrico",
    "neko-o-gato-eletrico",
    "lobo-branco",
  ];
  g.players[1].library = ["suineko-o-gato-aquatico", "lobo-branco"];
  summonEffects(g, makeUnit(g, 1, "anubis-o-gato-da-morte", 2, 2));
  const tsuchi = makeUnit(g, 1, "tsuchi-o-gato-da-terra", 3, 2);
  g.units.push(tsuchi);
  destroy(g, tsuchi);
  assert.equal(g.searches!.length, 2);
  const promptId = g.searches![0].id;
  assert(apply(g, 1, { type: "search", promptId, choice: "skip" }));
  assert.equal(
    commandError(publicGame(g, 1), 1, {
      type: "search",
      promptId,
      cardId: "neko-o-gato-eletrico",
    }),
    undefined,
  );
  assert.equal(
    apply(g, 1, { type: "search", promptId, cardId: "neko-o-gato-eletrico" }),
    undefined,
  );
  assert.equal(
    g.players[1].discard.filter((id) => id === "neko-o-gato-eletrico").length,
    1,
  );
  assert.equal(g.searches![0].sourceCardId, "tsuchi-o-gato-da-terra");
  assert.equal(apply(g, 1, botCommand(g, 1)), undefined);
  assert.equal(g.players[1].hand.at(-1), "suineko-o-gato-aquatico");
  assert.equal(g.searches!.length, 0);
  assert.equal(g.priority, 0);
  g.players[1].discard = [];
  summonEffects(g, makeUnit(g, 1, "anubis-o-gato-da-morte", 2, 2));
  assert.equal(apply(g, 1, botCommand(g, 1)), undefined);
});

test("revival and a summoned copy also request their entry searches", () => {
  const g = game();
  const anubis = makeUnit(g, 1, "anubis-o-gato-da-morte", 3, 2);
  g.units.push(anubis);
  g.players[1].discard = ["neko-o-gato-eletrico"];
  destroy(g, anubis);
  g.turn++;
  startTurn(g);
  assert.equal(g.searches?.[0].sourceCardId, "anubis-o-gato-da-morte");
  assert.equal(apply(g, 1, botCommand(g, 1)), undefined);
  const curador = makeUnit(g, 0, "taodu-curador", 2, 2);
  g.units.push(curador);
  resolveSpell(g, 0, { cardId: "kogeki-n-2-dualidade", targetId: curador.id });
  assert.equal(g.searches?.[0].sourceCardId, "taodu-curador");
});
