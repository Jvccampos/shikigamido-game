import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  freshGame,
  moveOptions,
  route,
  linked,
} from "../shared/game.js";
import { makeUnit } from "../shared/rules/core.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";

function fixture() {
  const g = freshGame(
    "a",
    "b",
    starterDeck("agua"),
    starterDeck("agua"),
    31415,
  );
  Object.assign(g, {
    setup: false,
    turn: 4,
    phase: 2,
    first: 0,
    priority: 0,
    phaseOwner: 0,
  });
  const u = makeUnit(g, 0, "taodu-katana", 0, 2);
  u.summonedTurn = 1;
  g.units = [u];
  return { g, u };
}

test("Pular crosses an unconnected space in one step, including the client highlights", () => {
  const { g, u } = fixture();
  u.speed = 1;
  assert.equal(linked(0, 2, 1, 2), false);
  assert.deepEqual(route(g, u, 1, 2), [[1, 2]]);
  const view = publicGame(g, 0);
  assert(moveOptions(view, view.units[0]).some((p) => p.x === 1 && p.y === 2));
  assert.equal(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 }),
    undefined,
  );
  assert.deepEqual([u.x, u.y], [1, 2]);
  assert.deepEqual(g.events?.at(-1), {
    ...g.events?.at(-1),
    type: "move",
    path: [[1, 2]],
  });
});

test("Pular can cross an ally, but cannot finish on its space", () => {
  const { g, u } = fixture();
  g.units.push(makeUnit(g, 0, "taodu-ferreiro", 1, 2));
  assert(!moveOptions(g, u).some((p) => p.x === 1 && p.y === 2));
  assert.equal(
    apply(g, 0, { type: "move", unitId: u.id, x: 2, y: 2 }),
    undefined,
  );
  assert.deepEqual([u.x, u.y], [2, 2]);
});

test("Pular cannot jump into an unconnected enemy or curse space", () => {
  for (const curse of [false, true]) {
    const { g, u } = fixture();
    u.speed = 1;
    const enemy = makeUnit(g, curse ? 0 : 1, "taodu-ferreiro", 1, 2);
    if (curse) enemy.kind = "curse";
    g.units.push(enemy);
    assert(!moveOptions(g, u).some((p) => p.x === 1 && p.y === 2));
    assert.match(
      apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 })!,
      /Destino/,
    );
    assert.equal(g.combat, undefined);
    assert.deepEqual([u.x, u.y], [0, 2]);
  }
});

test("Pular still allows ordinary combat over a connected path", () => {
  const { g, u } = fixture();
  const enemy = makeUnit(g, 1, "taodu-ferreiro", 0, 3);
  g.units.push(enemy);
  assert.equal(
    apply(g, 0, { type: "move", unitId: u.id, x: 0, y: 3 }),
    undefined,
  );
  assert.equal(g.combat?.defenderId, enemy.id);
});

test("Pular respects speed, summoning sickness, one move per turn and forbidden spaces", () => {
  const { g, u } = fixture();
  u.speed = 0;
  assert.deepEqual(moveOptions(g, u), []);
  assert.match(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 })!,
    /Destino/,
  );
  u.speed = 2;
  u.summonedTurn = g.turn;
  assert.deepEqual(moveOptions(g, u), []);
  assert.match(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 })!,
    /não pode mover/,
  );
  u.summonedTurn = 1;
  assert.equal(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 }),
    undefined,
  );
  assert.deepEqual(moveOptions(g, u), []);
  assert.match(
    apply(g, 0, { type: "move", unitId: u.id, x: 2, y: 2 })!,
    /não pode mover/,
  );
  assert.equal(route(g, u, -1, 7), null);
  g.turn = 2;
  assert.equal(route(g, u, 3, 3), null);
});

test("stealing Pular removes Katana's ability to cross missing connections", () => {
  const { g, u } = fixture();
  u.speed = 1;
  u.statuses = { stolenKeyword: "Pular" };
  assert(!moveOptions(g, u).some((p) => p.x === 1 && p.y === 2));
  assert.match(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 })!,
    /Destino/,
  );
});
