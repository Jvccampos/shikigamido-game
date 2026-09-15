import { expireEffects } from "../shared/effects.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { kw, makeUnit } from "../shared/rules/core.js";
import { freshGame } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { resolveSpell } from "../shared/rules/spells.js";
import { startTurn } from "../shared/rules/turns.js";
import { publicGame } from "../shared/visibility.js";
import { unitEffects } from "../shared/unit-insight.js";
import type { UnitStatuses, Game } from "../shared/model.js";

const game = () =>
  freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);

test("saved keyword fields preserve additive and maximum stacking", () => {
  const statuses: UnitStatuses = JSON.parse(
    '{"block":1,"Block":2,"devolver":2,"Lifesteal":3,"lifesteal":2,"range":2,"Range":1,"construir":true}',
  );
  const unit = { cardId: "shidaro-o-samurai-do-profundo", statuses };
  assert.equal(kw(unit, "Block"), 3);
  assert.equal(kw(unit, "Devolver"), 4);
  assert.equal(kw(unit, "Lifesteal"), 3);
  assert.equal(kw(unit, "Range"), 2);
  assert.equal(kw(unit, "Construir"), 1);
});

test("spell effects survive a saved-room round trip and expire after their last turn", () => {
  const original = game();
  original.setup = false;
  const unit = makeUnit(original, 0, "lobo-branco", 0, 0);
  original.units.push(unit);
  resolveSpell(original, 0, {
    cardId: "shikigami-de-agua-vibora-bolha",
    targetId: unit.id,
  });
  resolveSpell(original, 0, {
    cardId: "mamoru-n-18-pele-de-ourico",
    targetId: unit.id,
  });
  const restored: Game = JSON.parse(JSON.stringify(original));
  const saved = restored.units.find((u) => u.id === unit.id)!;
  assert.equal(kw(saved, "Lifesteal"), 2);
  assert.equal(kw(saved, "Range"), 1);
  assert(
    unitEffects(restored, saved).some(
      (e) => e.label === "Alcance 1" && e.detail.includes("turno 1"),
    ),
  );
  startTurn(restored);
  assert.equal(kw(saved, "Range"), 1);
  restored.turn = 2;
  startTurn(restored);
  assert.equal(kw(saved, "Range"), 0);
  assert.equal(kw(saved, "Lifesteal"), 0);
  assert.equal(saved.statuses?.damageCap, undefined);
  assert.equal(kw(saved, "Devolver"), 2, "permanent effects remain");
  assert(
    !unitEffects(restored, saved).some((e) => e.label.startsWith("Alcance")),
  );
});

test("cancelled and missing-target spells produce structured outcomes without a text log", () => {
  const g = game();
  g.stack.push({
    type: "cast",
    seat: 1,
    cardId: "mamoru-n-18-pele-de-ourico",
    targetId: "gone",
  });
  resolveSpell(g, 0, { cardId: "mamoru-n-12-negacao" });
  assert.equal(g.stack.length, 0);
  assert(
    g.events?.some(
      (e) =>
        e.type === "spell-result" &&
        e.outcome === "cancelled" &&
        e.cardId === "mamoru-n-18-pele-de-ourico",
    ),
  );
  resolveSpell(g, 1, {
    cardId: "mamoru-n-18-pele-de-ourico",
    targetId: "gone",
  });
  assert(
    g.events?.some(
      (e) => e.type === "spell-result" && e.outcome === "missingTarget",
    ),
  );
  assert.equal(g.log, undefined);
  g.log = ["legacy text"];
  const view = publicGame(g, -1);
  assert.equal(view.log, undefined);
  assert.equal(view.events.filter((e) => e.type === "spell-result").length, 2);
  assert.deepEqual(
    g.log,
    ["legacy text"],
    "view projection does not mutate a saved game",
  );
});

test("Mimetismo transfers a granted keyword and restores it when the effect expires", () => {
  const g = game();
  const donor = makeUnit(g, 1, "lobo-branco", 6, 0),
    receiver = makeUnit(g, 0, "lobo-branco", 0, 0);
  donor.statuses = { range: 2 };
  g.units.push(donor, receiver);
  resolveSpell(g, 0, {
    cardId: "gishiki-n-9-mimetismo",
    targetId: donor.id,
    targetId2: receiver.id,
    choice: "Range",
  });
  assert.equal(kw(donor, "Range"), 0);
  assert.equal(kw(receiver, "Range"), 2);
  assert(!unitEffects(g, donor).some((e) => e.label === "Alcance 2"));
  assert(unitEffects(g, donor).some((e) => e.label === "Range cedido"));
  expireEffects(donor.statuses, 2);
  expireEffects(receiver.statuses!, 2);
  assert.equal(kw(receiver, "Range"), 2);
  expireEffects(donor.statuses, 3);
  expireEffects(receiver.statuses!, 3);
  assert.equal(kw(donor, "Range"), 2);
  assert.equal(kw(receiver, "Range"), 0);
});
