import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateDeck,
  freshGame,
  apply,
  linked,
  elementalDamage,
} from "../shared/game.js";
const deck = {
  name: "Fixture",
  omionji: "omionji-agua",
  element: "agua",
  cardIds: Array(30).fill("taodu-corrupto"),
};
const game = () => freshGame("a", "b", deck, deck);
test("decks reject more than two copies", () =>
  assert.match(validateDeck(deck) || "", /cópias/));
test("mulligan replaces one physical copy without losing the other", () => {
  const g = game();
  const p = g.players[0];
  const before = p.hand.length + p.library.length;
  apply(g, 0, { type: "mulligan", cardIds: ["taodu-corrupto"] });
  assert.equal(p.hand.length, 6);
  assert.equal(p.hand.length + p.library.length, before);
});
test("board has the inner horizontal paths from the printed manual", () =>
  assert.equal(linked(1, 1, 2, 1), true));
test("board does not invent a path between the outer and middle rings", () =>
  assert.equal(linked(0, 2, 1, 2), false));
test("earth attacks wind with elemental advantage", () => {
  const g = game();
  const a = { ...g.units[0], cardId: "cachorro-do-mato", attack: 2 };
  const d = { ...g.units[1], cardId: "kuro-usagi" };
  // A wind target without combat keywords.
  d.cardId = "gaviao-analista";
  assert.equal(elementalDamage(a, d), 3);
});
