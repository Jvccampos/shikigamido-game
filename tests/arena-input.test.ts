import { test } from "node:test";
import assert from "node:assert/strict";
import { Container, Rectangle } from "pixi.js";
import { ArenaScene } from "../client/arena-scene.js";
import { layout } from "../shared/arena-layout.js";
import { freshGame, apply } from "../shared/game.js";
import type { GameView } from "../shared/room.js";
import { starterDeck } from "../shared/practice.js";
import { publicGame } from "../shared/visibility.js";

function fixture() {
  const g = freshGame("a", "b", starterDeck("agua"), starterDeck("fogo"), 42);
  g.setup = false;
  g.phase = 2;
  g.phaseOwner = g.priority = 0;
  const u = g.units.find((u) => u.owner === 0 && u.kind === "omionji")!;
  const from = layout(1440, 1000).point(u.x, u.y);
  const to = layout(1440, 1000).point(0, 4);
  const view = new Container();
  view.position.set(to.x + 3, to.y + 2);
  const scene = new ArenaScene();
  Object.defineProperty(scene.app, "screen", {
    value: new Rectangle(0, 0, 1440, 1000),
  });
  let confirm!: (accepted: boolean) => void;
  const response = new Promise<boolean>((resolve) => {
    confirm = resolve;
  });
  scene.state = {
    game: publicGame(g, 0),
    seat: 0,
    highlights: [],
    targets: [],
    startY: 2,
    onCell() {},
    onSelect() {},
    onInspect() {},
    onHover() {},
    onPresentation() {},
    onDrop: () => response,
  };
  // Exercise the actual release and frame loop without a GPU or network.
  const input = scene as unknown as {
    units: Map<
      string,
      { view: Container; x: number; y: number; hp: number; image: string }
    >;
    drag: {
      id: string;
      startX: number;
      startY: number;
      view: Container;
      moving: boolean;
    };
    release(x: number, y: number): void;
    tick(dt: number): void;
    queue: GameView["events"];
    animate(ms: number, frame: (p: number) => void): Promise<void>;
    syncUnits(): void;
    playQueue(): Promise<void>;
  };
  input.units.set(u.id, { view, ...from, hp: u.hp, image: "" });
  input.drag = { id: u.id, startX: from.x, startY: from.y, view, moving: true };
  const frames: { x: number; y: number }[] = [];
  const durations: number[] = [];
  // Replace only the animation clock and final GPU rebuild. Release, tick and
  // the movement event handler are the same code used in the browser.
  input.animate = async (ms, frame) => {
    durations.push(ms);
    for (let i = 0; i <= 10; i++) {
      frame(i / 10);
      frames.push({ x: view.x, y: view.y });
    }
  };
  input.syncUnits = () => {};
  const playMove = async () => {
    assert.equal(
      apply(g, 0, { type: "move", unitId: u.id, x: 0, y: 4 }),
      undefined,
    );
    scene.state.game = publicGame(g, 0);
    input.queue = scene.state.game.events.filter((e) => e.type === "move");
    assert.equal(input.queue.length, 1);
    await input.playQueue();
  };
  return { input, from, to, view, confirm, frames, durations, playMove };
}

test("a dropped piece stays at the destination while the command is pending", () => {
  const { input, to, view } = fixture();
  input.release(to.x + 3, to.y + 2);
  for (let frame = 0; frame < 30; frame++) {
    input.tick(1);
    assert(
      Math.hypot(view.x - to.x, view.y - to.y) < 8,
      "Dropped piece snapped back towards its origin",
    );
  }
});

test("accepted drag movement only settles at the destination instead of replaying the route", async () => {
  const { input, to, view, frames, durations, confirm, playMove } = fixture();
  input.release(to.x + 3, to.y + 2);
  await playMove();
  confirm(true);
  assert(frames.every((p) => Math.hypot(p.x - to.x, p.y - to.y) < 8));
  assert(durations.every((ms) => ms < 250));
  assert.equal(view.y, to.y);
});

test("click movement still animates the complete path", async () => {
  const { input, from, to, view, frames, durations, playMove } = fixture();
  view.position.set(from.x, from.y);
  input.drag.moving = false;
  input.release(from.x, from.y);
  await playMove();
  assert.deepEqual(frames[0], from);
  assert(frames.some((p) => p.y > from.y + 10 && p.y < to.y - 10));
  assert(durations.every((ms) => ms >= 360));
  assert.equal(view.y, to.y);
});

test("a rejected drop returns the piece to its authoritative position", async () => {
  const { input, from, to, view, confirm } = fixture();
  input.release(to.x + 3, to.y + 2);
  confirm(false);
  await new Promise(setImmediate);
  for (let frame = 0; frame < 60; frame++) input.tick(1);
  assert(Math.hypot(view.x - from.x, view.y - from.y) < 1);
});
