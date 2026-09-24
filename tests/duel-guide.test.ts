import { test } from "node:test";
import assert from "node:assert/strict";
import { duelGuide, turnSteps } from "../client/duel-guide.js";
import { freshGame, apply } from "../shared/game.js";
import { makeUnit } from "../shared/rules/core.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";

const names = ["Ana", "Guardião"];
function game() {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.first = 0;
  g.turn = 2;
  g.phase = 1;
  g.phaseOwner = g.priority = 0;
  return g;
}
const none = { playableCards: 0, readyAbilities: 0 };

test("the stepper splits every phase into the first and second player's halves", () => {
  const g = game();
  g.phase = 2;
  g.phaseOwner = g.priority = 1;
  const steps = turnSteps(publicGame(g, 0));
  assert.equal(steps.length, 8);
  assert.deepEqual(
    steps.map((s) => `${s.phase}${s.seat}:${s.state}`),
    [
      "10:done",
      "11:done",
      "20:done",
      "21:current",
      "30:next",
      "31:next",
      "40:next",
      "41:next",
    ],
  );
});

test("your phases tell you what you can do, including when nothing is possible", () => {
  const g = game();
  const summon = duelGuide(publicGame(g, 0), 0, names, {
    ...none,
    playableCards: 2,
  });
  assert.equal(summon.tone, "mine");
  assert.equal(summon.title, "Invoque seus familiares");
  assert.match(summon.detail, /2 cartas podem ser invocadas/);
  assert.match(
    duelGuide(publicGame(g, 0), 0, names, none).detail,
    /Nenhuma carta pode ser invocada agora/,
  );
  assert.match(
    duelGuide(publicGame(g, 0), 0, names, {
      ...none,
      selection: { name: "Lobo Branco", kind: "unit" },
    }).detail,
    /selo iluminado para invocar Lobo Branco/,
  );
  g.phase = 2;
  const u = makeUnit(g, 0, "lobo-branco", 2, 2);
  u.summonedTurn = 1;
  g.units.push(u);
  assert.match(
    duelGuide(publicGame(g, 0), 0, names, none).detail,
    /2 movimentos grátis restantes/,
  );
  g.moveCounts = [2, 0];
  assert.match(
    duelGuide(publicGame(g, 0), 0, names, none).detail,
    /custa 1 PE/,
  );
});

test("while the opponent plays, the guide names them and says what comes next", () => {
  const g = game();
  g.phaseOwner = g.priority = 1;
  const guide = duelGuide(publicGame(g, 0), 0, names, none);
  assert.equal(guide.tone, "theirs");
  assert.equal(guide.title, "Guardião está invocando");
  assert.equal(guide.detail, "A seguir: seu movimento.");
  g.phase = 4;
  assert.equal(
    duelGuide(publicGame(g, 0), 0, names, none).detail,
    "A seguir: novo turno, com compra e energia renovada.",
  );
});

test("response windows describe the pending combat in plain words", () => {
  const g = game();
  g.phase = 2;
  g.phaseOwner = g.priority = 1;
  const mine = makeUnit(g, 0, "serpente-de-gelo", 2, 2),
    theirs = makeUnit(g, 1, "lobo-branco", 3, 2);
  mine.summonedTurn = theirs.summonedTurn = 1;
  g.units.push(mine, theirs);
  assert.equal(
    apply(g, 1, { type: "move", unitId: theirs.id, x: 2, y: 2 }),
    undefined,
  );
  const guide = duelGuide(publicGame(g, 0), 0, names, none);
  assert.equal(guide.title, "Sua resposta");
  assert.equal(
    guide.detail,
    "Lobo Branco ataca Serpente de Gelo. Responda com uma magia rápida ou permita o combate.",
  );
  assert.equal(
    duelGuide(publicGame(g, 1), 1, names, none).title,
    "Ana pode responder",
  );
});
