import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshGame,
  apply,
  fight,
  startTurn,
  cards,
  kw,
  moveOptions,
  validateDeck,
  type Game,
  type Unit,
  type Seat,
} from "../shared/game.js";
import { publicGame } from "../shared/visibility.js";
import { starterDeck, botCommand } from "../shared/practice.js";
const game = (element = "agua") => {
  const g = freshGame("a", "b", starterDeck(element), starterDeck("fogo"));
  g.setup = false;
  g.first = 0;
  g.priority = 0;
  g.phaseOwner = 0;
  return g;
};
const unit = (id: string, owner: Seat = 0, x = 1, y = 1): Unit => {
  const c = cards.get(id)!;
  assert(c.kind !== "spell");
  return {
    id: crypto.randomUUID(),
    cardId: id,
    owner,
    x,
    y,
    hp: c.stats.health,
    maxHp: c.stats.health,
    attack: c.stats.attack,
    speed: c.stats.speed,
    summonedTurn: 0,
    kind: "unit",
    statuses: {},
  };
};
const play = (g: Game, s: Seat, c: any) =>
  assert.equal(
    apply(g, s, c),
    undefined,
    `${JSON.stringify(c)} should succeed`,
  );
for (const e of ["agua", "fogo", "terra", "vento", "vazio"])
  test(`starter ${e} obeys all deck rules`, () =>
    assert.equal(validateDeck(starterDeck(e)), null));
test("all Omionji use supplied card stats", () => {
  for (const e of ["agua", "fogo", "terra", "vento", "vazio"]) {
    const g = game(e),
      o = g.units[0];
    assert.equal(o.hp, e === "fogo" ? 6 : 7);
    assert.equal(o.attack, e === "fogo" ? 3 : 2);
  }
});
test("setup permits both players to prepare, keeps initial six, starts invocation with seven", () => {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("terra"));
  play(g, 1, { type: "ready", y: 2 });
  assert.equal(g.setup, true);
  play(g, 0, { type: "ready", y: 4 });
  assert.equal(g.setup, false);
  assert.equal(g.players[0].hand.length, 7);
  assert.equal(g.players[1].hand.length, 7);
  assert.equal(g.units[0].y, 4);
});
test("keyword numeric arguments and alternate spelling are parsed", () => {
  assert.equal(kw(unit("shidaro-o-samurai-do-profundo"), "Devolver"), 2);
  assert.equal(kw(unit("tsuchi-o-gato-da-terra"), "Ressurgir"), 2);
  assert.equal(kw(unit("omionji-vento"), "Quick Attack"), 1);
});
test("ordinary combat is simultaneous and can destroy both monsters", () => {
  const g = game(),
    a = unit("taodu-katana"),
    d = unit("taodu-katana", 1);
  a.hp = 1;
  d.hp = 1;
  g.units.push(a, d);
  fight(g, a, d);
  assert(!g.units.includes(a));
  assert(!g.units.includes(d));
});
test("quick attacker kills before defender can retaliate", () => {
  const g = game(),
    a = unit("aguia-cacadora"),
    d = unit("taodu-katana", 1);
  d.hp = 1;
  a.attack = 10;
  g.units.push(a, d);
  fight(g, a, d);
  assert.equal(a.hp, 1);
  assert(!g.units.includes(d));
});
test("defender with Quick Attack does not gain first strike", () => {
  const g = game(),
    a = unit("taodu-katana"),
    d = unit("aguia-cacadora", 1);
  a.hp = 1;
  d.attack = 10;
  g.units.push(a, d);
  fight(g, a, d);
  assert(!g.units.includes(a));
  assert(!g.units.includes(d));
});
test("Devolver adds its printed amount only when defending", () => {
  const g = game(),
    a = unit("taodu-katana"),
    d = unit("shidaro-o-samurai-do-profundo", 1);
  a.hp = 20;
  a.maxHp = 20;
  g.units.push(a, d);
  fight(g, a, d);
  assert.equal(
    [...(g.events || [])].reverse().find((e) => e.type === "combat")
      ?.defenseDamage,
    4,
  );
});
test("shield absorbs combat damage and is consumed", () => {
  const g = game(),
    a = unit("taodu-katana"),
    d = unit("taodu-katana", 1);
  d.statuses = { shield: true };
  g.units.push(a, d);
  fight(g, a, d);
  assert.equal(d.hp, d.maxHp);
  assert.equal(d.statuses.shield, false);
});
test("both players receive two free unit moves in the same phase", () => {
  const g = game();
  g.turn = 4;
  g.phase = 2;
  const a = unit("kuro-usagi", 0, 1, 1),
    b = unit("kuro-usagi", 0, 2, 1),
    c = unit("kuro-usagi", 1, 4, 5),
    d = unit("kuro-usagi", 1, 5, 5);
  g.units.push(a, b, c, d);
  g.players.forEach((p) => (p.pe = 0));
  play(g, 0, { type: "move", unitId: a.id, x: 1, y: 2 });
  play(g, 0, { type: "move", unitId: b.id, x: 2, y: 2 });
  play(g, 0, { type: "pass" });
  play(g, 1, { type: "move", unitId: c.id, x: 4, y: 4 });
  play(g, 1, { type: "move", unitId: d.id, x: 5, y: 4 });
});
test("center cannot be crossed before turn three", () => {
  const g = game(),
    u = unit("taodu-katana", 0, 3, 2);
  g.units.push(u);
  assert(!moveOptions(g, u).some((v) => v.x === 3 && v.y === 3));
});
test("turn three curses spawn outside the board and do not move immediately", () => {
  const g = game();
  g.turn = 3;
  startTurn(g);
  const c = g.units.filter((u) => u.kind === "curse");
  assert.deepEqual(
    c.map((u) => [u.x, u.y]),
    [
      [-1, 7],
      [7, -1],
    ],
  );
  assert.equal(g.centerPending, true);
});
test("Burn damages for exactly two subsequent turns", () => {
  const g = game(),
    u = unit("chifre-de-fogo");
  u.statuses = { burn: 1, burnUntil: 3 };
  g.units.push(u);
  for (const turn of [2, 3, 4]) {
    g.turn = turn;
    startTurn(g);
  }
  assert.equal(u.hp, 7);
});
test("PE does not stop growing at ten", () => {
  const g = game();
  g.turn = 23;
  startTurn(g);
  assert.equal(g.players[0].pe, 12);
});
test("Luna cannot be healed and pays HP + PE for fast buff", () => {
  const g = game("fogo");
  g.phase = 3;
  const t = unit("chifre-de-fogo");
  g.units.push(t);
  g.units[0].hp = 4;
  g.players[0].hand = ["gishikido-n-3-cura-da-agua"];
  g.players[0].pe = 2;
  assert.match(
    apply(g, 0, {
      type: "cast",
      cardId: g.players[0].hand[0],
      targetId: "o0",
    }) || "",
    /monstro/,
  );
  play(g, 0, { type: "ability", unitId: "o0", targetId: t.id });
  assert.equal(g.units[0].hp, 3);
  assert.equal(t.attack, 3);
  assert.equal(g.players[0].pe, 1);
});
test("Takaya draws once a turn when healing owned monster", () => {
  const g = game();
  g.phase = 3;
  const t = unit("chifre-de-fogo");
  t.hp = 3;
  g.units.push(t);
  g.players[0].hand = [
    "gishikido-n-3-cura-da-agua",
    "gishikido-n-3-cura-da-agua",
  ];
  g.players[0].pe = 4;
  const n = g.players[0].library.length;
  play(g, 0, {
    type: "cast",
    cardId: "gishikido-n-3-cura-da-agua",
    targetId: t.id,
  });
  play(g, 0, {
    type: "cast",
    cardId: "gishikido-n-3-cura-da-agua",
    targetId: t.id,
  });
  assert.equal(g.players[0].library.length, n - 1);
  assert.equal(t.hp, 7);
});
test("Cho draws once per turn on owned void monster death", () => {
  const g = game("vazio"),
    a = unit("kuro-usagi"),
    d = unit("chifre-de-fogo", 1);
  g.units.push(a, d);
  const n = g.players[0].hand.length;
  fight(g, a, d);
  assert.equal(g.players[0].hand.length, n + 1);
});
test("combat announcement opens response window and waits for two passes", () => {
  const g = game();
  g.turn = 4;
  g.phase = 2;
  const a = unit("taodu-katana", 0, 1, 1),
    d = unit("taodu-katana", 1, 1, 2);
  g.units.push(a, d);
  play(g, 0, { type: "move", unitId: a.id, x: 1, y: 2 });
  assert.equal(g.combat?.attackerId, a.id);
  assert.equal(a.hp, 4);
  play(g, 1, { type: "pass" });
  assert(g.combat);
  play(g, 0, { type: "pass" });
  assert.equal(g.combat, undefined);
  assert(a.hp < 4);
});
test("slow spell resolution does not skip either phase owner", () => {
  const g = game();
  g.phase = 3;
  g.players[0].pe = 10;
  g.players[0].hand = ["kogeki-n-1-golpe-do-vazio"];
  play(g, 0, { type: "cast", cardId: "kogeki-n-1-golpe-do-vazio" });
  play(g, 1, { type: "pass" });
  play(g, 0, { type: "pass" });
  assert.equal(g.phaseOwner, 0);
  play(g, 0, { type: "pass" });
  assert.equal(g.phase, 3);
  assert.equal(g.phaseOwner, 1);
});
test("out-of-priority instant spell is allowed without stealing phase", () => {
  const g = game();
  const t = unit("chifre-de-fogo", 1);
  t.hp = 4;
  g.units.push(t);
  g.players[1].hand = ["gishikido-n-3-cura-da-agua"];
  play(g, 1, {
    type: "cast",
    cardId: "gishikido-n-3-cura-da-agua",
    targetId: t.id,
  });
  assert.equal(t.hp, 6);
  assert.equal(g.priority, 0);
});
test("invalid spell target spends no PE and keeps card in hand", () => {
  const g = game();
  g.phase = 3;
  g.players[0].pe = 7;
  g.players[0].hand = ["kogekido-n-42-obliterar"];
  const before = structuredClone(g);
  assert(
    apply(g, 0, { type: "cast", cardId: g.players[0].hand[0], targetId: "o1" }),
  );
  assert.deepEqual(g, before);
});
test("copy index discards only chosen duplicate", () => {
  const g = game();
  g.phase = 4;
  g.players[0].hand = ["kuro-usagi", "kuro-usagi"];
  play(g, 0, { type: "discard", cardId: "kuro-usagi", handIndex: 1 });
  assert.deepEqual(g.players[0].hand, ["kuro-usagi"]);
  assert.equal(g.players[0].permanentPe, 1);
});
test("room projection hides libraries and opponents hands on every seat", () => {
  const g = game();
  for (const id of ["a", "b", null]) {
    const r = { state: publicGame(g, id === "a" ? 0 : id === "b" ? 1 : -1) };
    for (const [s, p] of r.state.players.entries()) {
      assert.deepEqual(p.library, []);
      assert.equal(p.libraryCount, 24);
      assert.equal(p.hand.length, id === g.players[s].id ? 6 : 0);
    }
  }
  assert.equal(g.players[0].library.length, 24);
});
test("spectator receives no private summon identity through event history", () => {
  const g = game(),
    u = unit("taodu-katana");
  u.statuses = { hidden: true };
  g.units.push(u);
  g.events = [
    {
      id: "e",
      turn: g.turn,
      phase: g.phase,
      type: "summon",
      unit: structuredClone(u),
    },
  ];
  const r = { state: publicGame(g, -1) };
  assert.equal(r.state.units.at(-1)!.cardId, "hidden");
  assert(r.state.events[0].type === "summon");
  assert.equal(r.state.events[0].unit.cardId, "hidden");
});
test("concession is allowed without priority", () => {
  const g = game();
  play(g, 1, { type: "concede" });
  assert.equal(g.winner, 0);
});
test("automated full match reaches a result without invalid state", () => {
  const g = game();
  for (let step = 0; step < 1500 && g.winner === null && !g.draw; step++) {
    if (g.centerPending) {
      play(g, 0, { type: "center" });
      play(g, 1, { type: "center" });
      continue;
    }
    const cmd = botCommand(g, g.priority);
    const err = apply(g, g.priority, cmd);
    if (err) throw new Error(`turn ${g.turn} ${JSON.stringify(cmd)}: ${err}`);
    const coords = g.units.map((u) => `${u.x},${u.y}`);
    assert.equal(new Set(coords).size, coords.length, "no overlapping units");
  }
  assert(g.winner !== null || g.draw, "match finishes");
});
test("reward keywords are not intrinsic keywords of the defeated monster", () => {
  assert.equal(kw(unit("o-arconte"), "Quick Attack"), 0);
  assert.equal(kw(unit("potaru"), "Quick Attack"), 0);
  assert.equal(kw(unit("broto-amaldicoado"), "Construir"), 0);
  assert.equal(kw(unit("assombracao-afogada"), "Lifesteal"), 3);
});
test("destroyed moved units still count against the two free moves", () => {
  const g = game();
  g.phase = 2;
  g.turn = 4;
  g.players[0].pe = 0;
  g.moveCounts = [2, 0];
  const u = unit("taodu-katana", 0, 1, 1);
  g.units.push(u);
  assert.equal(moveOptions(g, u).length, 0);
  assert.match(
    apply(g, 0, { type: "move", unitId: u.id, x: 1, y: 2 }) || "",
    /PE/,
  );
});
test("a hidden summon stays hidden in history even after removal", () => {
  const g = game(),
    u = unit("taodu-katana");
  u.statuses = { hidden: true };
  g.events = [
    { id: "e", turn: g.turn, phase: g.phase, type: "summon", unit: u },
  ];
  const r = { state: publicGame(g, -1) };
  assert(r.state.events[0].type === "summon");
  assert.equal(r.state.events[0].unit.cardId, "hidden");
});
test("Chifre de Fogo offers an optional post-combat step", () => {
  const g = game();
  g.phase = 2;
  g.turn = 4;
  const a = unit("chifre-de-fogo", 0, 1, 1),
    d = unit("taodu-katana", 1, 1, 2);
  g.units.push(a, d);
  play(g, 0, { type: "move", unitId: a.id, x: 1, y: 2 });
  play(g, 1, { type: "pass" });
  play(g, 0, { type: "pass" });
  assert.equal(g.followup?.unitId, a.id);
  play(g, 0, { type: "pass" });
  assert.equal(g.followup, undefined);
  assert.equal(g.phase, 2);
});
test("Duelo lets each owner choose its monster and caster choose attack order", () => {
  const g = game();
  g.phase = 3;
  g.players[0].hand = ["duelo-de-fogo"];
  g.players[0].pe = 5;
  const a = unit("chifre-de-fogo"),
    d = unit("chifre-de-fogo", 1, 4, 4);
  g.units.push(a, d);
  play(g, 0, { type: "cast", cardId: "duelo-de-fogo", targetId: a.id });
  play(g, 1, { type: "pass" });
  play(g, 0, { type: "pass" });
  assert.equal(g.priority, 1);
  play(g, 1, { type: "duel", unitId: d.id });
  assert.equal(g.priority, 0);
  play(g, 0, { type: "duel", choice: "defender" });
  assert.equal(
    [...(g.events || [])].reverse().find((e) => e.type === "combat")?.attacker
      .id,
    d.id,
  );
});

test("draw is automatic before each invocation round, once per player", () => {
  const g = game();
  const sizes = g.players.map((p) => p.hand.length);
  startTurn(g);
  assert.equal(g.phase, 1);
  assert.equal(g.priority, g.first);
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    sizes.map((n) => n + 1),
  );
  const after = g.players.map((p) => p.hand.length);
  play(g, 0, { type: "pass" });
  play(g, 1, { type: "pass" });
  assert.equal(g.phase, 2);
  assert.deepEqual(
    g.players.map((p) => p.hand.length),
    after,
  );
});
test("batch discard converts selected physical copies including spells atomically", () => {
  const g = game();
  g.phase = 4;
  const p = g.players[0];
  p.hand = [
    "kuro-usagi",
    "gishikido-n-3-cura-da-agua",
    "kuro-usagi",
    "taodu-corrupto",
  ];
  play(g, 0, { type: "discardMany", handIndices: [2, 1] });
  assert.deepEqual(p.hand, ["kuro-usagi", "taodu-corrupto"]);
  assert.equal(p.permanentPe, 2);
  assert.equal(p.discard.length, 2);
  for (const handIndices of [[0, 0], [0, 1], [9], []]) {
    const before = structuredClone(g);
    assert(apply(g, 0, { type: "discardMany", handIndices }));
    assert.deepEqual(g, before);
  }
});
test("curse presentation announces arrival and approach before damage or respawn", () => {
  const g = game();
  g.turn = 3;
  startTurn(g);
  const curse = g.units.find((u) => u.kind === "curse")!;
  const arrival = g.events!.find(
    (e) => e.type === "summon" && e.unit.id === curse.id,
  );
  assert(arrival?.type === "summon");
  const target = unit("chifre-de-fogo", 0, 0, 6);
  target.attack = 50;
  g.units.push(target);
  g.turn = 4;
  g.centerPending = false;
  startTurn(g);
  const events = g.events!;
  const approach = events.findIndex(
    (e) => e.type === "approach" && e.unitId === curse.id,
  );
  const combat = events.findIndex(
    (e) => e.type === "combat" && e.attacker.id === curse.id,
  );
  const respawn = events.findIndex(
    (e) => e.type === "summon" && e.unit.level === 2,
  );
  assert(approach >= 0 && combat > approach && respawn > combat);
  assert.equal(
    arrival.unit.hp,
    6,
    "arrival snapshot must not change after damage",
  );
  assert.deepEqual([arrival.unit.x, arrival.unit.y], [-1, 7]);
});
test("hidden cards stay private in movement, destruction and spell snapshots", () => {
  const g = game();
  const u = unit("taodu-katana");
  u.statuses = { hidden: true };
  g.events = [
    {
      id: "move",
      type: "move",
      turn: g.turn,
      phase: g.phase,
      unitId: u.id,
      unit: structuredClone(u),
      path: [[u.x, u.y]],
    },
    {
      id: "destroy",
      type: "destroy",
      turn: g.turn,
      phase: g.phase,
      unitId: u.id,
      unit: structuredClone(u),
    },
  ];
  g.events.push({
    id: "spell",
    type: "spell",
    turn: g.turn,
    phase: g.phase,
    seat: 0,
    cardId: "mamoru-n-18-pele-de-ourico",
    element: "agua",
    beforeTarget: structuredClone(u),
    afterTarget: structuredClone(u),
  });
  const visible = publicGame(g, -1).events;
  assert(
    "unit" in visible[0] && "unit" in visible[1] && visible[2].type === "spell",
  );
  assert.equal(visible[0].unit.cardId, "hidden");
  assert.equal(visible[1].unit.cardId, "hidden");
  assert.equal(visible[2].beforeTarget?.cardId, "hidden");
  assert.equal(visible[2].afterTarget?.cardId, "hidden");
});

test("curse that defeats Ice Serpent at zero dexterity stays still next turn", () => {
  const g = game();
  g.units = g.units.filter((u) => u.kind === "omionji");
  g.turn = 3;
  startTurn(g);
  const curse = g.units.find((u) => u.kind === "curse" && u.owner === 0)!;
  const serpent = unit("serpente-de-gelo", 0, 0, 6);
  g.units.push(serpent);
  g.turn = 4;
  startTurn(g);
  assert(
    !g.units.some((u) => u.id === serpent.id),
    "curse defeated the serpent",
  );
  assert.equal(curse.speed, 0, "serpent reduced the curse's dexterity");
  const position = [curse.x, curse.y];
  g.turn = 5;
  startTurn(g);
  assert.equal(curse.speed, 0, "dexterity reduction persists");
  assert.deepEqual(
    [curse.x, curse.y],
    position,
    "zero-dexterity curse must not advance",
  );
  assert(
    !g.events!.some(
      (e) =>
        e.turn === 5 &&
        (e.type === "move" || e.type === "approach") &&
        e.unitId === curse.id,
    ),
  );
  curse.speed = 1;
  g.turn = 6;
  startTurn(g);
  assert.notDeepEqual(
    [curse.x, curse.y],
    position,
    "curse can move if it regains dexterity",
  );
});
