import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordParts } from "../shared/keyword-help.js";
import { unitEffects } from "../shared/unit-insight.js";
import { freshGame } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { makeUnit } from "../shared/rules/core.js";

test("keyword explanations preserve card wording and recognize spelling variants and values", () => {
  const text = "QuickAtack. Devolver 2 e Burn 1. Pode Pular; LifeSteal 3.";
  const parts = keywordParts(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts.filter((p) => p.detail).length, 5);
  assert.match(parts.find((p) => p.text === "Devolver 2")!.detail!, /\+2/);
  assert.match(
    parts.find((p) => p.text === "Pular")!.detail!,
    /horizontal ou vertical/,
  );
  assert.equal(
    keywordParts("Construiremos um caminho.").some((p) => p.detail),
    false,
  );
});

test("received effects remain discoverable without duplicating movement markers or leaking hidden cards", () => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  const unit = makeUnit(g, 0, "serpente-de-gelo", 2, 2);
  unit.statuses = { devolver: 2, healSplash: true, block: 1 };
  g.moved.push(unit.id);
  const entries = unitEffects(unit);
  assert.deepEqual(
    entries.map((e) => e.label),
    ["Block 1", "Devolver 2", "Cura da Água"],
  );
  assert.match(entries[1].detail, /contra-ataque/);
  assert.match(entries[2].detail, /Consumido/);
  assert.deepEqual(
    unitEffects({
      id: unit.id,
      cardId: "hidden",
      hp: null,
      maxHp: null,
      attack: null,
      speed: null,
      statuses: { hidden: true },
      owner: 0,
      kind: "unit",
      x: 2,
      y: 2,
    }),
    [],
  );
});
