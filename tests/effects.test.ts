import { expireEffects } from "../shared/effects.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { kw, makeUnit } from "../shared/rules/core.js";
import { freshGame } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { resolveSpell, spellError } from "../shared/rules/spells.js";
import { connected } from "../shared/rules/board.js";
import { startTurn } from "../shared/rules/turns.js";
import { publicGame } from "../shared/visibility.js";
import { unitEffects } from "../shared/unit-insight.js";
import type { UnitStatuses, Game } from "../shared/model.js";

const game = (element = "agua") =>
  freshGame("a", "b", starterDeck(element), starterDeck("fogo"), 42);

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
    unitEffects(saved).some(
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
  assert(!unitEffects(saved).some((e) => e.label.startsWith("Alcance")));
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
  assert(!unitEffects(donor).some((e) => e.label === "Alcance 2"));
  assert(unitEffects(donor).some((e) => e.label === "Range cedido"));
  expireEffects(donor.statuses, 2);
  expireEffects(receiver.statuses!, 2);
  assert.equal(kw(receiver, "Range"), 2);
  expireEffects(donor.statuses, 3);
  expireEffects(receiver.statuses!, 3);
  assert.equal(kw(donor, "Range"), 2);
  assert.equal(kw(receiver, "Range"), 0);
});

test("variable damage and wall spells use the chosen X", () => {
  const g = game();
  const enemy = makeUnit(g, 1, "lobo-branco", 2, 2);
  enemy.hp = 7;
  g.units.push(enemy);
  resolveSpell(g, 0, {
    cardId: "kogekido-n-42-obliterar",
    targetId: enemy.id,
    extraPe: 3,
  });
  assert.equal(enemy.hp, 4);

  resolveSpell(g, 0, {
    cardId: "mamoru-n-9-wonder-wall",
    x: 4,
    y: 4,
    extraPe: 5,
  });
  const wall = g.units.find((u) => u.kind === "wall");
  assert.equal(wall?.hp, 5);
  assert.equal(wall?.maxHp, 5);
});

test("Void Rift returns another copy and connects distant spaces", () => {
  const g = game("vazio");
  const anchorA = makeUnit(g, 0, "lobo-branco", 1, 1);
  const anchorB = makeUnit(g, 0, "lobo-branco", 4, 4);
  g.units.push(anchorA, anchorB);
  g.players[0].library = ["fenda-do-vazio", "taodu-katana"];

  assert.equal(
    spellError(g, 0, {
      type: "cast",
      cardId: "fenda-do-vazio",
      x: 2,
      y: 2,
      extraPe: 0,
    }),
    undefined,
  );
  resolveSpell(g, 0, { cardId: "fenda-do-vazio", x: 2, y: 2 });
  const first = g.units.find((u) => u.kind === "rift");
  assert(first);
  assert(g.players[0].hand.includes("fenda-do-vazio"));

  resolveSpell(g, 0, { cardId: "fenda-do-vazio", x: 5, y: 5 });
  const rifts = g.units.filter((u) => u.kind === "rift");
  assert.equal(rifts.length, 2);
  assert(connected(g, rifts[0].x, rifts[0].y, rifts[1].x, rifts[1].y));
});

test("Transferência Espiritual can redirect to any allied monster", () => {
  const g = game();
  const inCombat = makeUnit(g, 0, "lobo-branco", 1, 1);
  const distantAlly = makeUnit(g, 0, "lobo-branco", 6, 6);
  g.units.push(inCombat, distantAlly);
  g.combat = {
    attackerId: inCombat.id,
    defenderId: "defender",
    x: 2,
    y: 2,
    returnPriority: 0,
  };
  assert.equal(
    spellError(g, 0, {
      type: "cast",
      cardId: "mamoru-n-5-transferencia-espiritual",
      targetId: inCombat.id,
      targetId2: distantAlly.id,
      extraPe: 1,
    }),
    undefined,
  );
  resolveSpell(g, 0, {
    cardId: "mamoru-n-5-transferencia-espiritual",
    targetId: inCombat.id,
    targetId2: distantAlly.id,
    extraPe: 1,
  });
  assert.equal(inCombat.statuses?.redirect, distantAlly.id);
});
