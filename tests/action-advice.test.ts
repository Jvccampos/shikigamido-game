import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, freshGame, type Unit } from "../shared/game.js";
import { makeUnit } from "../shared/rules/core.js";
import { settleCombat, fight } from "../shared/rules/combat.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";
import {
  cardPlan,
  commandError,
  previewAction,
  abilityPlan,
  movementReason,
} from "../shared/action-advice.js";
import { unitInsights } from "../shared/unit-insight.js";
const game = () => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.turn = 2;
  g.phase = 3;
  g.phaseOwner = 0;
  g.priority = 0;
  g.players[0].pe = 5;
  g.players[0].permanentPe = 2;
  return g;
};
const add = (
  g: ReturnType<typeof game>,
  id: string,
  owner: 0 | 1,
  x: number,
  y: number,
) => {
  const u = makeUnit(g, owner, id, x, y);
  u.summonedTurn = 1;
  g.units.push(u);
  return u;
};
test("card availability checks phase, actual taxed cost, targets and duplicate instances", () => {
  const g = game();
  g.players[0].hand = ["cristal-primordial", "cristal-primordial"];
  add(g, "serpente-de-gelo", 0, 1, 1);
  g.players[0].pe = 1;
  g.players[0].permanentPe = 0;
  assert.match(
    cardPlan(publicGame(g, 0), 0, g.players[0].hand[0], 0).reason!,
    /Faltam 2/,
  );
  g.players[0].pe = 3;
  g.players[0].costTaxUntil = 2;
  assert.match(
    cardPlan(publicGame(g, 0), 0, g.players[0].hand[0], 0).reason!,
    /Faltam 1/,
  );
  g.players[0].pe = 4;
  const plan = cardPlan(publicGame(g, 0), 0, g.players[0].hand[1], 1);
  assert.equal(plan.reason, undefined);
  assert.equal(plan.cost, 4);
  assert(plan.options.every((c) => c.handIndex === 1));
  for (const c of plan.options)
    assert.equal(apply(structuredClone(g), 0, c), undefined);
  assert.equal(g.players[0].hand.length, 2);
  g.units = g.units.filter((u) => u.kind !== "unit");
  assert.equal(
    cardPlan(publicGame(g, 0), 0, g.players[0].hand[0], 0).options.length,
    0,
  );
});
test("movement forecasts agree with the resolved rules including Quick Attack, shields and elemental damage", () => {
  for (const [attacker, defender, shield] of [
    ["aguia-cacadora", "serpente-opala", false],
    ["taodu-katana", "lobo-branco", true],
    ["lobo-branco", "serpente-de-gelo", false],
  ] as const) {
    const g = game();
    g.phase = 2;
    const a = add(g, attacker, 0, 2, 2),
      d = add(g, defender, 1, 3, 2);
    if (shield) (d.statuses ??= {}).shield = true;
    const cmd = { type: "move" as const, unitId: a.id, x: d.x, y: d.y };
    const original = structuredClone(g);
    const preview = previewAction(publicGame(g, 0), 0, cmd);
    assert.equal(preview.error, undefined);
    assert.equal(preview.path.length, 2);
    const resolved = structuredClone(g);
    assert.equal(apply(resolved, 0, cmd), undefined);
    settleCombat(resolved);
    const event = [...resolved.events!]
      .reverse()
      .find((e) => e.type === "combat")!;
    assert(event.type === "combat");
    assert.equal(preview.combat?.attacker.damage, event.defenseDamage);
    assert.equal(preview.combat?.defender.damage, event.attackDamage);
    assert.equal(
      preview.combat?.attacker.after?.hp,
      resolved.units.find((u) => u.id === a.id)?.hp,
    );
    assert.equal(
      preview.combat?.defender.after?.hp,
      resolved.units.find((u) => u.id === d.id)?.hp,
    );
    assert.deepEqual(
      g,
      original,
      "preview leaves live state and RNG untouched",
    );
  }
});
test("movement costs and immobilization are explained before committing", () => {
  const g = game();
  g.phase = 2;
  g.moveCounts = [2, 0];
  const a = add(g, "taodu-katana", 0, 2, 2);
  const c = { type: "move" as const, unitId: a.id, x: 3, y: 2 };
  const preview = previewAction(publicGame(g, 0), 0, c);
  assert.equal(preview.cost, 1);
  g.players[0].pe = 0;
  g.players[0].permanentPe = 0;
  assert.match(commandError(publicGame(g, 0), 0, c)!, /1 PE/);
  (a.statuses ??= {}).softStun = 1;
  a.statuses.softStunUntil = 3;
  assert.equal(movementReason(publicGame(g, 0), a), "Imobilizado");
  assert(
    unitInsights(publicGame(g, 0), a).some((e) => e.detail.includes("turno 3")),
  );
});
test("hidden cards and random combat never produce a falsely exact forecast", () => {
  const g = game();
  g.phase = 2;
  const a = add(g, "cachorro-do-mato", 0, 2, 2),
    d = add(g, "lobo-branco", 1, 3, 2);
  const c = { type: "move" as const, unitId: a.id, x: d.x, y: d.y };
  assert.equal(previewAction(publicGame(g, 0), 0, c).uncertainty, "random");
  (d.statuses ??= {}).hidden = true;
  const preview = previewAction(publicGame(g, 0), 0, c);
  assert.equal(preview.uncertainty, "hidden");
  assert.equal(preview.combat?.resolved, false);
  assert.equal(preview.combat?.defender.before.cardId, "hidden");
  assert.equal(preview.combat?.defender.damage, undefined);
  assert(!JSON.stringify(preview).includes("Lobo Branco"));
});
test("spell area forecasts identify affected pieces and journal snapshots stay private", () => {
  const g = game();
  g.players[0].hand = ["gishikido-n-3-cura-da-agua"];
  const a = add(g, "serpente-de-gelo", 0, 1, 1);
  a.hp = 1;
  const c = {
    type: "cast" as const,
    cardId: g.players[0].hand[0],
    handIndex: 0,
    targetId: a.id,
  };
  const preview = previewAction(publicGame(g, 0), 0, c);
  assert(preview.affected.includes(a.id));
  assert.equal(apply(g, 0, c), undefined);
  const spell = [...g.events!].reverse().find((e) => e.type === "spell")!;
  assert(spell.type === "spell" && spell.changes?.length);
  const secret: Unit = {
    ...a,
    id: "secret",
    cardId: "lobo-branco",
    statuses: { hidden: true },
  };
  spell.changes.push({ before: structuredClone(secret), after: secret });
  const visible = [...publicGame(g, 1).events]
    .reverse()
    .find((e) => e.type === "spell")!;
  assert(visible.type === "spell");
  assert.equal(visible.changes!.at(-1)!.after!.cardId, "hidden");
});
test("used abilities cannot offer valid targets and ice speed loss keeps its source", () => {
  const g = game();
  const a = add(g, "india-do-norte", 0, 1, 1);
  add(g, "lobo-branco", 0, 2, 1);
  assert(abilityPlan(publicGame(g, 0), 0, a).options.length);
  (a.statuses ??= {}).abilityTurn = g.turn;
  assert.equal(abilityPlan(publicGame(g, 0), 0, a).options.length, 0);
  const ice = add(g, "serpente-de-gelo", 0, 2, 2),
    curse = add(g, "lobo-branco", 1, 3, 2);
  curse.hp = 9;
  curse.speed = 1;
  fight(g, curse, ice);
  assert.equal(curse.speed, 0);
  const effect = unitInsights(publicGame(g, 0), curse).find(
    (e) => e.label === "Velocidade −1",
  );
  assert(effect?.detail.includes("Serpente de Gelo"));
});
