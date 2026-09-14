import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  freshGame,
  startTurn,
  type Cmd,
  type Game,
  type Seat,
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
  g.setup = false;
  g.turn = 4;
  g.first = 0;
  g.phase = 2;
  g.priority = 0;
  g.phaseOwner = 0;
  g.players.forEach((p) => {
    p.hand = [];
    p.pe = 30;
  });
  const add = (id: string, seat: Seat, x: number, y: number) => {
    const u = makeUnit(g, seat, id, x, y);
    u.summonedTurn = 0;
    g.units.push(u);
    return u;
  };
  return { g, add };
}
function play(g: Game, seat: Seat, c: Cmd) {
  assert.equal(apply(g, seat, c), undefined, JSON.stringify(c));
}
function resolve(g: Game) {
  play(g, g.priority, { type: "pass" });
  play(g, g.priority, { type: "pass" });
}

test("simultaneous Omionji deaths draw the match and preserve the combat snapshots", () => {
  const { g } = fixture();
  const [a, b] = g.units.filter((u) => u.kind === "omionji");
  Object.assign(a, { x: 1, y: 1, hp: 1, attack: 20 });
  Object.assign(b, { x: 2, y: 1, hp: 1, attack: 20 });
  play(g, 0, { type: "move", unitId: a.id, x: b.x, y: b.y });
  resolve(g);
  assert.equal(g.draw, true);
  assert.equal(g.winner, null);
  const combat = g.events?.find((e) => e.type === "combat");
  assert(combat?.type === "combat");
  assert.equal(combat.attacker.hp, 1);
  assert.equal(combat.defender.hp, 1);
  assert.equal(g.events?.filter((e) => e.type === "destroy").length, 2);
});

test("two resurrecting creatures killed simultaneously each return once", () => {
  const { g, add } = fixture();
  const a = add("yaksha-o-guardiao", 0, 1, 1),
    b = add("yaksha-o-guardiao", 1, 2, 1);
  a.hp = b.hp = 1;
  a.attack = b.attack = 20;
  play(g, 0, { type: "move", unitId: a.id, x: b.x, y: b.y });
  resolve(g);
  assert.equal(g.pending.length, 2);
  assert(g.pending.every((p) => p.returnTurn === 6));
  g.turn = 6;
  startTurn(g);
  assert.equal(g.pending.length, 0);
  for (const u of [a, b])
    assert.equal(g.units.filter((x) => x.id === u.id).length, 1);
});

test("negation cancels the next spell without refunding costs or duplicating discards", () => {
  const { g, add } = fixture();
  g.phase = 3;
  const target = add("taodu-katana", 0, 1, 1),
    buff = "mamoru-n-18-pele-de-ourico",
    cancel = "mamoru-n-12-negacao";
  g.players[0].hand = [buff];
  g.players[1].hand = [cancel];
  play(g, 0, { type: "cast", cardId: buff, targetId: target.id });
  play(g, 1, { type: "cast", cardId: cancel });
  assert.equal(g.stack.length, 2);
  resolve(g);
  assert.equal(g.stack.length, 0);
  assert.equal(target.statuses?.devolver, undefined);
  assert.deepEqual(
    g.players.map((p) => p.pe),
    [28, 26],
  );
  assert.deepEqual(
    g.players.map((p) => p.discard),
    [[buff], [cancel]],
  );
  assert.deepEqual(
    g.events?.filter((e) => e.type === "spell").map((e) => e.cardId),
    [cancel],
  );
});

test("a response that removes the combat target makes its queued buff fizzle", () => {
  const { g, add } = fixture();
  const a = add("taodu-katana", 0, 1, 1),
    b = add("taodu-katana", 1, 2, 1);
  b.hp = 1;
  const buff = "mamoru-n-18-pele-de-ourico",
    damage = "kogekido-n-2-exorcismo";
  g.players[1].hand = [buff];
  g.players[0].hand = [damage];
  play(g, 0, { type: "move", unitId: a.id, x: b.x, y: b.y });
  play(g, 1, { type: "cast", cardId: buff, targetId: b.id });
  play(g, 0, { type: "cast", cardId: damage, targetId: b.id });
  resolve(g);
  assert(!g.units.some((u) => u.id === b.id));
  resolve(g);
  assert.equal(b.statuses?.devolver, undefined);
  assert(g.log.some((l) => l.includes("alvo saiu")));
  const hp = a.hp;
  resolve(g);
  assert.equal(g.combat, undefined);
  assert.equal(a.hp, hp);
});

test("a creature killed by turn-start Burn does not heal from its equipment or draw", () => {
  const { g, add } = fixture();
  const u = add("taodu-katana", 0, 1, 1);
  u.hp = 1;
  u.statuses = { burn: 1, burnUntil: 5 };
  u.equipment = [makeUnit(g, 0, "suineko-o-gato-aquatico", 1, 1)];
  const hand = g.players[0].hand.length;
  g.turn = 5;
  startTurn(g);
  assert(!g.units.some((x) => x.id === u.id));
  assert.equal(g.players[0].hand.length, hand + 1, "only the normal turn draw");
  assert(!g.events?.some((e) => e.type === "heal" && e.unitId === u.id));
});

test("temporary buffs expire independently and never remove a permanent keyword", () => {
  const { g, add } = fixture();
  const u = add("taodu-katana", 0, 1, 1),
    base = u.attack;
  u.attack += 2;
  u.statuses = {
    temporaryAttack: 2,
    temporaryUntil: 4,
    range: 2,
    rangeUntil: 5,
    block: 1,
    "Quick Attack": 1,
  };
  g.turn = 5;
  startTurn(g);
  assert.equal(u.attack, base);
  assert.equal(u.statuses.range, 2);
  assert.equal(u.statuses.block, 1);
  g.turn = 6;
  startTurn(g);
  assert.equal(u.attack, base);
  assert.equal(u.statuses.range, undefined);
  assert.equal(u.statuses["Quick Attack"], 1);
});

test("hidden historical combat and spell snapshots stay private after a later reveal", () => {
  const { g, add } = fixture();
  const u = add("taodu-katana", 0, 1, 1),
    other = add("kuro-usagi", 1, 2, 1);
  u.statuses = { hidden: true };
  g.events = [
    {
      id: "hidden-combat",
      turn: 4,
      phase: 2,
      type: "combat",
      attacker: structuredClone(u),
      defender: other,
      attackDamage: 0,
      defenseDamage: 0,
      keyword: "fixture",
    },
    {
      id: "hidden-spell",
      turn: 4,
      phase: 3,
      type: "spell",
      seat: 0,
      cardId: "mamoru-n-18-pele-de-ourico",
      element: "agua",
      beforeTarget: structuredClone(u),
      afterTarget: structuredClone(u),
    },
  ];
  delete u.statuses.hidden;
  for (const seat of [1, -1] as const) {
    const view = publicGame(g, seat),
      combat = view.events[0],
      spell = view.events[1];
    assert(combat.type === "combat" && spell.type === "spell");
    assert.equal(combat.attacker.cardId, "hidden");
    assert.equal(combat.attacker.hp, null);
    assert.equal(spell.beforeTarget?.cardId, "hidden");
    assert.equal(spell.afterTarget?.attack, null);
    assert.equal(view.units.find((x) => x.id === u.id)?.cardId, u.cardId);
  }
  assert(g.events[0].type === "combat");
  assert.equal(g.events[0].attacker.cardId, u.cardId);
});
