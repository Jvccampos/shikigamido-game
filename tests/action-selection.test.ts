import { test } from "node:test";
import assert from "node:assert/strict";
import { freshGame, type Cmd, type Seat } from "../shared/game.js";
import { makeUnit } from "../shared/rules/core.js";
import { publicGame } from "../shared/visibility.js";
import { starterDeck } from "../shared/practice.js";
import {
  actionSelection,
  emptyActionSelection,
  type Selection,
} from "../client/action-selection.js";

function fixture(hand: string[]) {
  const game = freshGame(
    "a",
    "b",
    starterDeck("agua"),
    starterDeck("fogo"),
    42,
  );
  game.setup = false;
  game.turn = 4;
  game.phase = 3;
  game.phaseOwner = game.priority = 0;
  game.players[0].pe = 30;
  game.players[0].hand = hand;
  let state = emptyActionSelection();
  let accept: (command: Cmd) => Promise<boolean> = async () => true;
  let busy = false;
  const sent: Cmd[] = [];
  const model = () =>
    actionSelection(
      publicGame(game, 0),
      0,
      busy,
      state,
      (change) => {
        state = change(state);
      },
      async (command) => {
        sent.push(command);
        return accept(command);
      },
    );
  const add = (id: string, seat: Seat, x: number, y: number) => {
    const unit = makeUnit(game, seat, id, x, y);
    unit.summonedTurn = 0;
    game.units.push(unit);
    return unit;
  };
  return {
    game,
    model,
    add,
    sent,
    respond: (fn: typeof accept) => {
      accept = fn;
    },
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}

test("two-unit selection validates each step and submits the prepared keyword choice", async () => {
  const { model, add, sent } = fixture(["gishiki-n-9-mimetismo"]);
  const donor = add("taodu-katana", 1, 2, 2);
  const receiver = add("lobo-branco", 0, 2, 3);
  model().arena.onHand(0);
  model().arena.onCell(donor.x, donor.y, donor);
  model().controls.onChoice("Pular");
  assert.equal(model().controls.cast.disabled, true);
  assert.equal(await model().controls.cast.submit(), false);
  assert.equal(sent.length, 0, "an incomplete action never leaves the model");
  assert(model().arena.validTargets.includes(receiver.id));
  model().arena.onCell(receiver.x, receiver.y, receiver);
  assert.deepEqual(model().arena.targets, [donor.id, receiver.id]);
  assert.equal(model().controls.cast.disabled, false);
  model().arena.onCell(donor.x, donor.y, donor);
  assert.deepEqual(
    model().arena.targets,
    [],
    "removing the first target removes its dependent choice",
  );
  model().arena.onCell(donor.x, donor.y, donor);
  model().arena.onCell(receiver.x, receiver.y, receiver);
  assert.equal(await model().controls.cast.submit(), true);
  assert.equal(sent[0].type, "cast");
  assert.equal(sent[0].targetId, donor.id);
  assert.equal(sent[0].targetId2, receiver.id);
  assert.equal(sent[0].choice, "Pular");
  assert.equal(model().arena.selected, null);
});

test("cell pairs wait for a connected destination and switching cards resets all choices", async () => {
  const { model, add, sent } = fixture([
    "gishiki-n-9-mimetismo",
    "ventos-favoraveis",
  ]);
  const donor = add("taodu-katana", 1, 2, 2);
  model().arena.onHand(0);
  model().arena.onCell(donor.x, donor.y, donor);
  model().controls.onChoice("Pular");
  model().controls.onAmount(7);
  model().arena.onHand(1);
  assert.deepEqual(model().arena.targets, []);
  assert.deepEqual(model().controls.cells, []);
  assert.equal(model().controls.choice, "");
  assert.equal(model().controls.extra, 0);
  model().arena.onCell(3, 4);
  assert.equal(model().controls.cast.disabled, true);
  model().arena.onCell(6, 0);
  assert.deepEqual(model().controls.cells, [{ x: 3, y: 4 }]);
  assert(model().arena.highlights.some((p) => p.x === 4 && p.y === 4));
  model().arena.onCell(4, 4);
  assert.equal(model().controls.cast.disabled, false);
  assert.equal(await model().controls.cast.submit(), true);
  assert.deepEqual(
    [sent[0].x, sent[0].y, sent[0].x2, sent[0].y2],
    [3, 4, 4, 4],
  );
});

test("ability selection and mode changes reset dependent targets and cells", async () => {
  const { model, add, sent } = fixture(["ventos-favoraveis"]);
  const caster = add("chama-marinha", 0, 2, 2);
  model().arena.onHand(0);
  model().arena.onCell(3, 4);
  model().controls.onChoice("old");
  model().arena.onAbility(caster);
  assert.equal(model().controls.targetMode, true);
  assert.deepEqual(model().arena.targets, []);
  assert.deepEqual(model().controls.cells, []);
  assert.equal(model().controls.choice, "");
  model().arena.onCell(4, 4);
  assert.equal(model().controls.cells.length, 1);
  model().controls.onToggleTargetMode();
  assert.equal(model().controls.targetMode, false);
  assert.deepEqual(model().controls.cells, []);
  model().controls.onToggleTargetMode();
  model().controls.onChoice("agua");
  assert.equal(model().controls.ability.disabled, false);
  assert.equal(await model().controls.ability.submit(), true);
  assert.equal(sent[0].type, "ability");
  assert.equal(sent[0].unitId, caster.id);
  assert.equal(sent[0].choice, "agua");
});

test("dropping a multi-step spell starts a fresh selection and rejection preserves it for retry", async () => {
  const { model, add, sent, respond } = fixture([
    "ventos-favoraveis",
    "gishiki-n-9-mimetismo",
  ]);
  const donor = add("taodu-katana", 1, 2, 2);
  const receiver = add("lobo-branco", 0, 2, 3);
  model().arena.onHand(0);
  model().arena.onCell(3, 4);
  model().controls.onAmount(8);
  const dropped: Selection = {
    kind: "hand",
    cardId: "gishiki-n-9-mimetismo",
    index: 1,
  };
  model().arena.onDrag(dropped);
  assert.equal(
    await model().arena.onDrop(donor.x, donor.y, donor, dropped),
    false,
  );
  assert.equal(
    sent.length,
    0,
    "multi-step drops wait for the remaining choice",
  );
  assert.deepEqual(model().arena.targets, [donor.id]);
  assert.equal(model().controls.extra, 0);
  assert.equal(model().controls.choice, "");
  model().arena.onCell(receiver.x, receiver.y, receiver);
  model().controls.onChoice("Pular");
  respond(async () => false);
  assert.equal(await model().controls.cast.submit(), false);
  assert.deepEqual(model().arena.selected, dropped);
  assert.deepEqual(model().arena.targets, [donor.id, receiver.id]);
  respond(async () => true);
  assert.equal(await model().controls.cast.submit(), true);
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(model().arena.selected, null);
});

test("simple drops submit once, stay selected while pending, and clear only on acceptance", async () => {
  const { model, add, sent, respond } = fixture(["gishikido-n-3-cura-da-agua"]);
  const target = add("serpente-de-gelo", 0, 2, 2);
  target.hp = 1;
  let finish!: (accepted: boolean) => void;
  respond(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dropped: Selection = {
    kind: "hand",
    cardId: "gishikido-n-3-cura-da-agua",
    index: 0,
  };
  const pending = model().arena.onDrop(target.x, target.y, target, dropped);
  assert.equal(sent.length, 1);
  assert.deepEqual(model().arena.selected, dropped);
  assert.equal(sent[0].targetId, target.id);
  finish(true);
  assert.equal(await pending, true);
  assert.equal(model().arena.selected, null);
});

test("invalid targets and busy state cannot submit and the selection survives", async () => {
  const { game, model, add, sent, setBusy } = fixture([
    "mamoru-n-21-intocavel",
  ]);
  const target = add("serpente-de-gelo", 0, 2, 2);
  const leader = game.units.find((u) => u.kind === "omionji")!;
  model().arena.onHand(0);
  model().arena.onCell(leader.x, leader.y, leader);
  assert.deepEqual(model().arena.targets, []);
  assert(model().controls.feedback);
  assert.equal(model().controls.cast.disabled, true);
  model().arena.onCell(target.x, target.y, target);
  assert.equal(model().controls.feedback, "");
  assert.equal(model().controls.cast.disabled, false);
  setBusy(true);
  assert.equal(model().controls.cast.disabled, true);
  assert.equal(await model().controls.cast.submit(), false);
  assert.equal(sent.length, 0);
  assert(model().arena.selected);
  setBusy(false);
  assert.equal(await model().controls.cast.submit(), true);
});

test("accepting a pending action preserves a newer selection and its queued choices", async () => {
  const { model, add, respond } = fixture([
    "gishikido-n-3-cura-da-agua",
    "ventos-favoraveis",
  ]);
  const target = add("serpente-de-gelo", 0, 2, 2);
  target.hp = 1;
  let finish!: (accepted: boolean) => void;
  respond(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = model().arena.onDrop(target.x, target.y, target, {
    kind: "hand",
    cardId: "gishikido-n-3-cura-da-agua",
    index: 0,
  });
  model().arena.onHand(1);
  const controls = model().controls;
  // Preact may batch these independent changes before producing another view.
  controls.onChoice("queued choice");
  controls.onAmount(3);
  model().arena.onCell(3, 4);
  finish(true);
  assert.equal(await pending, true);
  assert.equal(model().arena.selected?.cardId, "ventos-favoraveis");
  assert.equal(model().controls.choice, "queued choice");
  assert.equal(model().controls.extra, 3);
  assert.deepEqual(model().controls.cells, [{ x: 3, y: 4 }]);
});

test("prepared actions preserve duplicate hand indices and deck summon sources", async () => {
  const spell = "mamoru-n-21-intocavel";
  const { game, model, add, sent } = fixture([spell, spell]);
  const target = add("serpente-de-gelo", 0, 2, 2);
  model().arena.onHand(1);
  model().arena.onCell(target.x, target.y, target);
  assert.equal(await model().controls.cast.submit(), true);
  assert.equal(sent[0].handIndex, 1);
  game.phase = 1;
  game.players[0].library = ["anubis-o-gato-da-morte"];
  const cat = add("neko-o-gato-eletrico", 0, 1, 2);
  assert(model().controls.summonableDeck.includes("anubis-o-gato-da-morte"));
  model().controls.onDeck("anubis-o-gato-da-morte");
  model().arena.onCell(cat.x, cat.y, cat);
  assert.equal(model().controls.sacrifice.disabled, false);
  assert.equal(await model().controls.sacrifice.submit(), true);
  assert.equal(sent[1].type, "summon");
  assert.equal(sent[1].choice, "library");
  assert.equal(sent[1].targetId, cat.id);
});
