import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cards, allCards, elements } from "../shared/cards.js";
import { spellSpecs } from "../shared/spells.js";
import { abilities } from "../shared/abilities.js";
import { baseKeywords } from "../shared/keywords.js";
import { yokaiIds, masculineIds } from "../shared/traits.js";
import { starterDeck } from "../shared/practice.js";
import { validateDeck } from "../shared/game.js";

test("every card has an asset and every spell has a targeting definition", () => {
  for (const card of allCards) {
    assert(existsSync(`.${card.asset}`), `Missing asset for ${card.id}`);
    if (card.kind === "spell")
      assert(spellSpecs[card.id], `Missing spell definition for ${card.id}`);
  }
  for (const id of Object.keys(spellSpecs))
    assert.equal(cards.get(id)?.kind, "spell", id);
});

test("ability, keyword and trait definitions reference real cards", () => {
  for (const id of [
    ...Object.keys(abilities),
    ...Object.keys(baseKeywords),
    ...yokaiIds,
    ...masculineIds,
  ]) {
    assert(cards.has(id), `Unknown card in rules metadata: ${id}`);
  }
  for (const element of elements) {
    assert.equal(cards.get(`omionji-${element}`)?.kind, "omionji");
    assert.equal(validateDeck(starterDeck(element)), null);
  }
});
