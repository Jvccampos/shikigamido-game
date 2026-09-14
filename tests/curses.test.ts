import { test } from "node:test";
import assert from "node:assert/strict";
import { allCards, cards } from "../shared/cards.js";
import {
  freshGame,
  validateDeck,
  fight,
  startTurn,
  kw,
} from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { spawnCurse, curseLevel } from "../shared/rules/curses.js";
import { makeUnit } from "../shared/rules/core.js";
import { destroy } from "../shared/rules/units.js";
import { endMovement } from "../shared/rules/turns.js";

function game() {
  const g = freshGame("a", "b", starterDeck("fogo"), starterDeck("agua"), 42);
  g.setup = false;
  g.turn = 4;
  return g;
}

test("all eight intrinsic cursed cards are neutral cards excluded from every starter deck", () => {
  const cursed = allCards.filter((c) => c.kind === "curse");
  assert.equal(cursed.length, 8);
  assert.deepEqual(
    cursed.filter((c) => curseLevel(c.stats.cost) === 1).map((c) => c.id),
    ["comedor-de-sonhos", "taodu-corrupto"],
  );
  assert.deepEqual(
    cursed.filter((c) => curseLevel(c.stats.cost) === 2).map((c) => c.id),
    ["broto-amaldicoado", "lamento"],
  );
  for (const element of ["agua", "fogo", "terra", "vento", "vazio"]) {
    const deck = starterDeck(element);
    assert.equal(validateDeck(deck), null);
    assert(deck.cardIds.every((id) => cards.get(id)!.kind !== "curse"));
    for (const card of cursed) {
      const invalid = { ...deck, cardIds: [card.id, ...deck.cardIds.slice(1)] };
      assert.match(validateDeck(invalid) || "", /Maldições/);
    }
  }
});

test("curse spawns use real stats and advance through cost tiers, capped at three", () => {
  for (const card of allCards.filter((c) => c.kind === "curse")) {
    const g = game();
    const u = makeUnit(g, 0, card.id, 0, 0);
    u.level = curseLevel(card.stats.cost);
    assert.equal(u.kind, "curse");
    assert.deepEqual(
      [u.attack, u.hp, u.speed],
      [card.stats.attack, card.stats.health, card.stats.speed],
    );
    assert.equal(kw(u, "Amaldiçoado"), 1);
    g.units.push(u);
    const library = [...g.players[0].library];
    const discard = [...g.players[0].discard];
    destroy(g, u);
    const next = g.units.find((x) => x.kind === "curse")!;
    assert.equal(next.level, Math.min(3, u.level + 1));
    assert.equal(curseLevel(cards.get(next.cardId)!.stats.cost), next.level);
    assert.equal(next.summonedTurn, g.turn);
    assert.deepEqual([next.x, next.y], [-1, 7]);
    assert.deepEqual(g.players[0].library, library);
    assert.deepEqual(g.players[0].discard, discard);
  }
});

test("defeating real curses awards energy, draws and keywords to the victor", () => {
  for (const id of [
    "comedor-de-sonhos",
    "taodu-corrupto",
    "a-gula",
    "assombracao-afogada",
    "broto-amaldicoado",
    "lamento",
    "o-arconte",
    "potaru",
  ]) {
    const g = game();
    const killer = makeUnit(g, 1, "lobo-branco", 2, 2);
    const curse = makeUnit(g, 0, id, 2, 3);
    curse.level = curseLevel(cards.get(id)!.stats.cost);
    g.units.push(killer, curse);
    const hand = g.players[1].hand.length,
      pe = g.players[1].pe;
    destroy(g, curse, killer);
    assert.equal(
      g.players[1].hand.length - hand,
      ["a-gula", "assombracao-afogada", "o-arconte"].includes(id)
        ? 2
        : id === "taodu-corrupto"
          ? 1
          : 0,
      id,
    );
    assert.equal(g.players[1].pe - pe, id === "comedor-de-sonhos" ? 1 : 0);
    if (id === "a-gula") {
      assert.deepEqual(killer.statuses!.extraTypes, ["fogo"]);
      assert.equal(killer.statuses!.devolver, 2);
    }
    if (id === "assombracao-afogada") assert.equal(kw(killer, "Lifesteal"), 2);
    if (id === "broto-amaldicoado")
      assert.equal(killer.statuses!.construir, true);
    if (id === "lamento") assert.equal(kw(killer, "Alimentar"), 1);
    if (["o-arconte", "potaru"].includes(id))
      assert.equal(kw(killer, "Quick Attack"), 1);
  }
});

test("Lamento feeds on defeats and Taodu Corrupto receives no friendly Ferreiro buff", () => {
  const g = game();
  const lamento = makeUnit(g, 0, "lamento", 2, 2);
  const victim = makeUnit(g, 1, "aranha-de-cristal", 2, 3);
  g.units.push(lamento, victim);
  fight(g, lamento, victim);
  assert.deepEqual([lamento.attack, lamento.maxHp, lamento.speed], [3, 7, 3]);
  const corrupto = makeUnit(g, 0, "taodu-corrupto", 1, 1);
  g.units.push(corrupto, makeUnit(g, 0, "taodu-ferreiro", 1, 2));
  endMovement(g, 0);
  assert.equal(corrupto.attack, 1);
});

test("Potaru shields on new turns and releases swallowed monsters on defeat", () => {
  const g = game();
  const potaru = makeUnit(g, 0, "potaru", 2, 2);
  const victim = makeUnit(g, 1, "lobo-branco", 2, 3);
  g.units.push(potaru, victim);
  fight(g, potaru, victim);
  assert.equal(potaru.captured![0].id, victim.id);
  assert(!g.units.includes(victim));
  startTurn(g);
  assert.equal(potaru.statuses!.shield, true);
  destroy(g, potaru);
  assert(g.units.includes(victim));
});

test("curses travel their dexterity, with separate movement cues and no movement on arrival", () => {
  const g = game();
  g.units = g.units.filter((u) => u.kind === "omionji");
  const c = spawnCurse(g, 0, 1);
  startTurn(g);
  assert.deepEqual([c.x, c.y], [-1, 7]);
  g.turn++;
  startTurn(g);
  const steps = g.events!.filter(
    (e) => e.turn === g.turn && e.type === "move" && e.unitId === c.id,
  );
  assert.equal(steps.length, 2);
  assert.notDeepEqual([c.x, c.y], [-1, 7]);
});
