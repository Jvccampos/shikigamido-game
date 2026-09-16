import { test } from "node:test";
import assert from "node:assert/strict";
import { freshGame } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { makeUnit } from "../shared/rules/core.js";
import { resolveSpell } from "../shared/rules/spells.js";
import { startTurn, endTurn } from "../shared/rules/turns.js";
import { publicGame } from "../shared/visibility.js";
import { turnTimeline } from "../shared/turn-timeline.js";
import type { Game } from "../shared/model.js";

function game() {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  return g;
}
const timeline = (g: Game) => turnTimeline(publicGame(g, 0), ["Ana", "Bia"]);

test("milestones match the turn engine, including turns without mana growth", () => {
  const g = game();
  const forecast = timeline(g);
  assert.deepEqual(
    forecast.map((t) => t.mana),
    [1, 1, 2, 2, 3, 3, 4],
  );
  assert.deepEqual(
    forecast[2].events.map((e) => e.kind),
    ["mana", "curse", "center"],
  );
  assert.equal(forecast[1].events.length, 0);
  assert.equal(forecast[4].events.length, 1);
  g.turn = 3;
  startTurn(g);
  assert.equal(g.players[0].maxPe, forecast[2].mana);
  assert.equal(g.centerPending, true);
  assert.equal(g.units.filter((u) => u.kind === "curse").length, 2);
  g.turn = 4;
  assert(
    !timeline(g)
      .flatMap((t) => t.events)
      .some((e) => e.kind === "center" || e.kind === "curse"),
  );
});

test("resolved spells forecast their real expiry, disappear on dispel, and survive reload", () => {
  const g = game();
  const u = makeUnit(g, 0, "lobo-branco", 2, 2);
  g.units.push(u);
  resolveSpell(g, 0, { cardId: "kogeki-n-1-fireball", targetId: u.id });
  resolveSpell(g, 0, { cardId: "gishiki-n-3-intangibilidade", targetId: u.id });
  let forecast = timeline(g);
  assert(forecast[1].events.some((e) => e.label === "Intangibilidade termina"));
  assert(forecast[2].events.some((e) => e.label === "Fireball termina"));
  assert.deepEqual(timeline(JSON.parse(JSON.stringify(g))), forecast);
  g.turn = 2;
  startTurn(g);
  assert.equal(u.statuses?.intangivel, undefined);
  assert.equal(u.statuses?.fireball, true);
  assert(
    !timeline(g)
      .flatMap((t) => t.events)
      .some((e) => e.label === "Intangibilidade termina"),
  );
  resolveSpell(g, 0, { cardId: "mamoru-n-7-dispersar", targetId: u.id });
  forecast = timeline(g);
  assert(
    !forecast
      .flatMap((t) => t.events)
      .some((e) => e.label === "Fireball termina"),
  );
});

test("player spells show activation and inclusive end dates", () => {
  const g = game();
  resolveSpell(g, 0, { cardId: "gishiki-n-13-fardo-espiritual" });
  resolveSpell(g, 0, { cardId: "gishiki-n-4-manto-da-escuridao" });
  const forecast = timeline(g);
  assert(
    forecast[1].events.some(
      (e) => e.label === "Manto da Escuridão começa" && e.timing === "start",
    ),
  );
  assert(
    forecast[1].events.some(
      (e) => e.label === "Manto da Escuridão termina" && e.timing === "end",
    ),
  );
  assert(
    forecast[2].events.some(
      (e) => e.label === "Fardo Espiritual termina" && e.detail.includes("Bia"),
    ),
  );
});

test("burn ticks, duality, sacrifice, control and terrain use the correct turn boundaries", () => {
  const g = game();
  const u = makeUnit(g, 0, "lobo-branco", 2, 2);
  g.units.push(u);
  resolveSpell(g, 0, { cardId: "kogeki-n-2-dualidade", targetId: u.id });
  resolveSpell(g, 0, { cardId: "gishiki-n-4-sacrificio", targetId: u.id });
  Object.assign(u.statuses!, {
    burn: 1,
    burnUntil: 3,
    controlTurn: 4,
    controlOwner: 1,
  });
  g.terrain.push({ kind: "fire", owner: 0, x: 1, y: 1, until: 2 });
  const forecast = timeline(g);
  assert(!forecast[0].events.some((e) => e.label.includes("de dano")));
  for (const i of [1, 2])
    assert(
      forecast[i].events.some((e) => e.label === "Queimadura · 1 de dano"),
    );
  for (const label of ["Dualidade termina", "Cópia desaparece"])
    assert(forecast[2].events.some((e) => e.label === label));
  assert(forecast[3].events.some((e) => e.label === "Queimadura termina"));
  assert(forecast[3].events.some((e) => e.label === "Mudança de controle"));
  assert(
    forecast[1].events.some(
      (e) => e.label === "Sacrifício disponível" && e.timing === "start",
    ),
  );
  assert(
    forecast[1].events.some(
      (e) => e.label === "Prazo de Sacrifício termina" && e.timing === "end",
    ),
  );
  assert(
    forecast[1].events.some(
      (e) => e.label === "Chamas termina" && e.timing === "end",
    ),
  );
  g.turn = 2;
  endTurn(g);
  assert.equal(g.terrain.length, 0);
});

test("hidden identities stay private and distant returns are included", () => {
  const g = game();
  const u = makeUnit(g, 1, "lobo-branco", 2, 2);
  u.statuses = { hidden: true, fireball: true, fireballUntil: 2 };
  g.units.push(u);
  g.pending.push({ unit: structuredClone(u), returnTurn: 12 });
  const forecast = timeline(g);
  assert.equal(forecast.at(-1)?.turn, 12);
  assert(
    forecast.at(-1)?.events.some((e) => e.detail.includes("Carta oculta")),
  );
  assert(!JSON.stringify(forecast).includes("Lobo Branco"));
  assert(
    !forecast
      .flatMap((t) => t.events)
      .some((e) => e.label === "Fireball termina"),
  );
  assert(
    turnTimeline(publicGame(g, 1), ["Ana", "Bia"])
      .flatMap((t) => t.events)
      .some((e) => e.label === "Fireball termina"),
  );
  g.winner = 0;
  assert.deepEqual(timeline(g), []);
});
