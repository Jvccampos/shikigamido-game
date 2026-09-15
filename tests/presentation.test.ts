import { test } from "node:test";
import assert from "node:assert/strict";
import { DuelPresentation } from "../client/duel-presentation.js";
import { freshGame } from "../shared/game.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";

function fixture() {
  const game = freshGame(
    "a",
    "b",
    starterDeck("agua"),
    starterDeck("fogo"),
    42,
  );
  game.setup = false;
  game.phase = 1;
  game.phaseOwner = game.priority = 0;
  const g = publicGame(game, 0);
  const model = new DuelPresentation();
  const update = (now: number) =>
    model.update(g, 0, ["Jogador", "Guardião"], now);
  const settle = (now: number) => model.scene(null, g.units, g.revision, now);
  update(0);
  return { g, model, update, settle };
}

test("a notice waits for the scene, allows input while reading, and blocks automation through its fade", () => {
  const { model, update } = fixture();
  assert.equal(model.view.notice, null);
  assert.equal(model.view.inputBlocked, true);
  model.sceneReady(true, 100);
  assert.match(model.view.notice!.title, /Sua vez/);
  assert.equal(model.view.inputBlocked, false);
  assert.equal(model.view.automationBlocked, true);
  assert.equal(model.view.nextDeadline, 4100);
  update(1000); // Renders and unrelated updates must not restart the reading time.
  model.advance(4099);
  assert.equal(model.view.noticeLeaving, false);
  model.advance(4100);
  assert.equal(model.view.noticeLeaving, true);
  assert.equal(model.view.nextDeadline, 4550);
  model.advance(4549);
  assert.equal(model.view.automationBlocked, true);
  model.advance(4550);
  assert.equal(model.view.notice, null);
  assert.equal(model.view.automationBlocked, false);
  assert.equal(model.view.nextDeadline, null);
});

test("dismissal finishes one fade without extending it or replaying the same phase", () => {
  const { model, update } = fixture();
  model.sceneReady(true, 0);
  model.dismiss(20);
  model.dismiss(200);
  assert.equal(model.view.nextDeadline, 470);
  model.advance(470);
  update(600);
  assert.equal(model.view.notice, null);
  assert.equal(model.view.automationBlocked, false);
});

test("new phases wait for the latest board revision and supersede old pending notices", () => {
  const { g, model, update, settle } = fixture();
  model.sceneReady(true, 0);
  model.dismiss(10);
  model.advance(460);
  const oldRevision = g.revision;
  g.phase = 2;
  g.revision = (g.revision || 0) + 1;
  update(500);
  assert.equal(model.view.inputBlocked, true);
  assert.equal(model.view.notice, null);
  model.scene({ kind: "move", label: "Movendo" }, undefined, undefined, 510);
  g.phase = 3;
  g.revision = (g.revision || 0) + 1;
  update(600);
  model.scene(null, g.units, oldRevision, 700);
  assert.equal(model.view.notice, null);
  assert.equal(model.view.inputBlocked, true);
  settle(800);
  assert.match(model.view.notice!.title, /Magia/);
  assert.equal(model.view.nextDeadline, 4800);
  assert.equal(model.view.inputBlocked, false);
});

test("card draws survive unrelated updates and delay notices until their animation ends", () => {
  const { g, model, update, settle } = fixture();
  model.sceneReady(true, 0);
  model.dismiss(0);
  model.advance(450);
  g.turn++;
  g.players[0].hand.push(g.players[0].library.pop()!);
  g.players[0].libraryCount--;
  g.players[0].maxPe++;
  g.revision = (g.revision || 0) + 1;
  update(1000);
  settle(1010);
  assert.equal(model.view.drawing, true);
  assert.equal(model.view.notice, null);
  g.revision = (g.revision || 0) + 1;
  update(1200);
  settle(1200);
  model.advance(1949);
  assert.equal(model.view.inputBlocked, true);
  model.advance(1950);
  assert.equal(model.view.drawing, false);
  assert.equal(model.view.inputBlocked, false);
  assert.match(model.view.notice!.mana, /Mana máxima aumentou/);
  assert.equal(model.view.nextDeadline, 5950);
});

test("overlays and searches defer notices without spending their reading time", () => {
  const { g, model, update } = fixture();
  model.showOverlays({ discard: false, elements: true, menu: false }, 0);
  model.sceneReady(true, 0);
  model.advance(10000);
  assert.equal(model.view.notice, null);
  assert.equal(model.view.automationBlocked, true);
  g.searches = [
    {
      id: "search",
      seat: 1,
      options: [],
      zone: "library",
      sourceCardId: "anubis-o-gato-da-morte",
      family: "cat",
      optional: true,
    },
  ];
  update(10000);
  model.showOverlays({ discard: false, elements: false, menu: false }, 10000);
  assert.equal(model.view.notice, null);
  assert.equal(
    model.view.automationBlocked,
    false,
    "a queued notice cannot prevent the bot from answering a search",
  );
  g.searches = [];
  update(12000);
  assert.equal(model.view.nextDeadline, 16000);
  assert(model.view.notice);
  assert.equal(model.view.automationBlocked, true);
});

test("the player's discard choice never leaves a deferred banner behind the dialog", () => {
  const { g, model, update, settle } = fixture();
  g.phase = 4;
  g.phaseOwner = g.priority = 1;
  update(0);
  model.sceneReady(true, 0);
  assert.match(model.view.notice!.title, /Guardião.*Descarte/);
  model.dismiss(100);
  model.advance(550);
  g.phaseOwner = g.priority = 0;
  g.revision = (g.revision || 0) + 1;
  update(600);
  settle(600);
  model.showOverlays({ discard: true, elements: false, menu: false }, 600);
  model.advance(5000);
  model.showOverlays({ discard: false, elements: false, menu: false }, 5100);
  assert.equal(model.view.notice, null);
  assert.equal(model.view.automationBlocked, false);
});

test("result presentation waits for the final animation and its revision to settle", () => {
  const { g, model, update, settle } = fixture();
  model.sceneReady(true, 0);
  const before = g.units;
  model.scene({ kind: "combat", label: "Combate" }, undefined, undefined, 10);
  g.winner = 0;
  g.revision = (g.revision || 0) + 1;
  g.units = [];
  update(20);
  assert.equal(model.view.resultReady, false);
  assert.equal(model.view.visibleUnits, before);
  assert.equal(model.view.noticeLeaving, true);
  model.advance(460);
  assert.equal(model.view.notice, null);
  settle(1500);
  assert.equal(model.view.resultReady, true);
  assert.equal(model.view.visibleUnits, g.units);
  assert.equal(model.view.automationBlocked, false);
});
