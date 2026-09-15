import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apply,
  freshGame,
  type Cmd,
  type Game,
  type Seat,
} from "../shared/game.js";
import { commandError, previewAction } from "../shared/action-advice.js";
import { forecastAction } from "../shared/rules/forecast.js";
import { makeUnit } from "../shared/rules/core.js";
import { refreshAuras } from "../shared/rules/turns.js";
import { summonEffects } from "../shared/rules/units.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";
import { unitChanges } from "../shared/unit-changes.js";

function fixture() {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("agua"), 42);
  g.setup = false;
  g.turn = 4;
  g.phase = 3;
  g.phaseOwner = g.priority = 0;
  for (const p of g.players) {
    p.hand = [];
    p.pe = 30;
  }
  const add = (id: string, seat: Seat, x: number, y: number) => {
    const unit = makeUnit(g, seat, id, x, y);
    unit.summonedTurn = 0;
    g.units.push(unit);
    return unit;
  };
  return { g, add };
}
function play(g: Game, seat: Seat, cmd: Cmd) {
  assert.equal(apply(g, seat, cmd), undefined);
}
function passResponse(g: Game) {
  play(g, g.priority, { type: "pass" });
  play(g, g.priority, { type: "pass" });
}
function affected(before: Game, after: Game) {
  return before.units
    .filter((unit) => {
      const next = after.units.find((u) => u.id === unit.id);
      return !next || unitChanges(unit, next).length > 0;
    })
    .map((u) => u.id);
}

test("a spell forecast resolves only the new response and agrees with normal passes", () => {
  const { g, add } = fixture();
  const target = add("taodu-katana", 0, 1, 1);
  const buff = "mamoru-n-18-pele-de-ourico";
  g.players[0].hand = [buff];
  play(g, 0, { type: "cast", cardId: buff, targetId: target.id });
  const shield = "mamoru-n-21-intocavel";
  g.players[1].hand = [shield];
  const command: Cmd = { type: "cast", cardId: shield, targetId: target.id };
  const before = structuredClone(g);
  const forecast = previewAction(publicGame(g, 1), 1, command);
  assert.equal(forecast.error, undefined);
  assert.equal(forecast.uncertainty, "stack");
  assert.deepEqual(g, before);
  play(g, 1, command);
  passResponse(g);
  assert.equal(
    g.stack.length,
    1,
    "the older spell still awaits its own response",
  );
  assert.equal(g.priority, 1);
  assert.equal(g.passes, 0);
  assert.deepEqual(forecast.affected, affected(before, g));
  assert(forecast.affected.includes(target.id));
});

test("negation forecasts share normal cancellation without resolving the cancelled spell", () => {
  const { g, add } = fixture();
  const target = add("taodu-katana", 0, 1, 1);
  const buff = "mamoru-n-18-pele-de-ourico";
  const cancel = "mamoru-n-12-negacao";
  g.players[0].hand = [buff];
  g.players[1].hand = [cancel];
  play(g, 0, { type: "cast", cardId: buff, targetId: target.id });
  const before = structuredClone(g);
  const command: Cmd = { type: "cast", cardId: cancel };
  const forecast = forecastAction(publicGame(g, 1), 1, command);
  assert.equal(forecast.error, undefined);
  assert.equal(forecast.uncertainty, "stack");
  play(g, 1, command);
  passResponse(g);
  assert.equal(g.stack.length, 0);
  assert.equal(g.priority, g.phaseOwner);
  assert.equal(target.statuses?.devolver, undefined);
  assert.deepEqual(forecast.affected, affected(before, g));
  assert.deepEqual(forecast.affected, []);
});

test("combat forecasts stop at pending spell responses on either pass", () => {
  const { g, add } = fixture();
  g.phase = 2;
  const attacker = add("taodu-katana", 0, 1, 1);
  const defender = add("taodu-katana", 1, 2, 1);
  play(g, 0, {
    type: "move",
    unitId: attacker.id,
    x: defender.x,
    y: defender.y,
  });
  const buff = "mamoru-n-18-pele-de-ourico";
  g.players[1].hand = [buff];
  play(g, 1, { type: "cast", cardId: buff, targetId: defender.id });
  for (let pass = 0; pass < 2; pass++) {
    const before = structuredClone(g);
    const forecast = forecastAction(publicGame(g, g.priority), g.priority, {
      type: "pass",
    });
    assert.equal(forecast.error, undefined);
    assert.equal(forecast.uncertainty, "stack");
    assert.equal(forecast.combat?.resolved, false);
    assert.equal(forecast.combat?.defender.damage, undefined);
    assert.deepEqual(g, before);
    play(g, g.priority, { type: "pass" });
  }
  assert(g.combat, "resolving the spell does not resolve the pending combat");
});

test("combat forecasts include aura changes caused by the normal response settlement", () => {
  const { g, add } = fixture();
  g.phase = 2;
  const attacker = add("taodu-katana", 0, 1, 1);
  const defender = add("lobo-branco", 1, 2, 1);
  const rabbit = add("usagi-selvagem", 1, 3, 1);
  defender.statuses = { extraTypes: ["terra"] };
  defender.hp = 1;
  attacker.attack = 30;
  refreshAuras(g);
  assert.equal(rabbit.statuses?.auraHp, 1);
  const command: Cmd = {
    type: "move",
    unitId: attacker.id,
    x: defender.x,
    y: defender.y,
  };
  const before = structuredClone(g);
  const forecast = forecastAction(publicGame(g, 0), 0, command);
  play(g, 0, command);
  passResponse(g);
  assert.equal(forecast.combat?.resolved, true);
  assert.equal(rabbit.statuses?.auraHp, 0);
  assert.deepEqual(forecast.affected, affected(before, g));
  assert(forecast.affected.includes(rabbit.id));
});

test("search validation uses only visible choices and never consumes live cards or RNG", () => {
  const { g } = fixture();
  g.players[0].library = [
    "taodu-ferreiro",
    "taodu-katana",
    "taodu-katana",
    "lobo-branco",
  ];
  summonEffects(g, makeUnit(g, 0, "taodu-curador", 0, 0));
  const before = structuredClone(g);
  const view = publicGame(g, 0);
  const command: Cmd = {
    type: "search",
    promptId: g.searches![0].id,
    cardId: "taodu-ferreiro",
  };
  assert.deepEqual(view.players[0].library, []);
  assert.equal(commandError(view, 0, command), undefined);
  assert.equal(forecastAction(view, 0, command).error, undefined);
  assert.match(
    commandError(view, 0, { ...command, cardId: "lobo-branco" })!,
    /disponíveis/,
  );
  assert.match(commandError(publicGame(g, 1), 1, command)!, /outro jogador/);
  assert.match(commandError(view, 0, { type: "pass" })!, /escolha da carta/);
  assert.deepEqual(g, before);
  play(g, 0, command);
  assert.equal(g.players[0].hand.at(-1), "taodu-ferreiro");
});

test("deck-dependent combat stays uncertain and identical across private deck and RNG changes", () => {
  const { g, add } = fixture();
  g.phase = 2;
  const attacker = add("kirijin-o-oni-da-fumaca", 0, 1, 1);
  const defender = add("taodu-katana", 1, 2, 1);
  defender.hp = 1;
  attacker.attack = 30;
  g.players[0].library = ["enenra-comedor-de-mentes"];
  const alternate = structuredClone(g);
  alternate.players[0].library = ["lobo-branco"];
  alternate.random = { state: 123456 };
  const command: Cmd = {
    type: "move",
    unitId: attacker.id,
    x: defender.x,
    y: defender.y,
  };
  const before = structuredClone(g);
  const forecast = previewAction(publicGame(g, 0), 0, command);
  assert.equal(forecast.error, undefined);
  assert.equal(forecast.uncertainty, "search");
  assert.deepEqual(
    forecast,
    previewAction(publicGame(alternate, 0), 0, command),
  );
  assert(!JSON.stringify(forecast).includes("enenra-comedor-de-mentes"));
  assert.deepEqual(g, before);
});
