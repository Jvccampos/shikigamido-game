import { Container, Graphics } from "pixi.js";
import { label } from "./arena-drawing.js";
import type { GameView } from "../shared/room.js";
import type { layout } from "../shared/arena-layout.js";

type Layout = ReturnType<typeof layout>;
/** A drawn field feature and how it moves each frame; `t` is in seconds. */
export type FieldItem = { view: Container; update?: (t: number) => void };

/** Draws lakes, winds, fire, flowers and rift links between the paths and
 * the pieces. Everything is vector so it scales with the board. */
export function drawField(
  layer: Container,
  game: GameView,
  l: Layout,
): FieldItem[] {
  const items: FieldItem[] = [];
  const add = (item: FieldItem) => {
    layer.addChild(item.view);
    items.push(item);
  };
  const rifts = game.units.filter((u) => u.kind === "rift");
  for (const [ax, ay, bx, by] of game.edges || []) {
    const a = l.point(ax, ay),
      b = l.point(bx, by);
    const viaRift = rifts.some(
      (r) =>
        (r.x === ax && r.y === ay) ||
        (r.x === bx && r.y === by && rifts.length > 1),
    );
    add(viaRift ? riftLink(a, b, l) : bridge(a, b, l));
  }
  for (const t of game.terrain) {
    const p = l.point(t.x, t.y);
    if (t.kind === "lake") add(lake(p, l));
    else if (t.kind === "fire") add(fire(p, l));
    else if (t.kind === "wind" && t.x2 !== undefined && t.y2 !== undefined)
      add(wind(p, l.point(t.x2, t.y2), l));
  }
  for (const f of game.flowers || []) add(flower(l.point(f.x, f.y), l));
  return items;
}

type Point = { x: number; y: number };

/* A field seal: the board node language. A translucent dark disc, a thin
 * luminous rim, a faint rune ring and an element glyph, with a soft halo. */
function seal(p: Point, l: Layout, color: number, glyph: string, fill: number) {
  const view = new Container();
  view.position.set(p.x, p.y);
  const r = Math.min(l.dx, l.dy) * 0.4;
  const halo = new Graphics()
    .circle(0, 0, r * 1.45)
    .fill({ color, alpha: 0.1 })
    .circle(0, 0, r * 1.15)
    .fill({ color, alpha: 0.08 });
  const disc = new Graphics()
    .circle(0, 0, r)
    .fill({ color: fill, alpha: 0.72 })
    .circle(0, 0, r)
    .stroke({ color, width: 1.5, alpha: 0.9 })
    .circle(0, 0, r * 0.78)
    .stroke({ color, width: 1, alpha: 0.35 });
  // Rune ticks between the two rings.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    disc
      .moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8)
      .lineTo(
        Math.cos(a) * r * (i % 3 ? 0.86 : 0.94),
        Math.sin(a) * r * (i % 3 ? 0.86 : 0.94),
      )
      .stroke({ color, width: 1, alpha: 0.55 });
  }
  const icon = label(glyph, Math.max(14, r * 0.72), color);
  icon.anchor.set(0.5);
  icon.alpha = 0.85;
  const fx = new Graphics();
  view.addChild(halo, disc, fx, icon);
  return { view, halo, fx, icon, r };
}

/* Lake: a water seal with ripples spreading out and fading. -------------- */
function lake(p: Point, l: Layout): FieldItem {
  const { view, halo, fx, icon, r } = seal(p, l, 0x7fd4f0, "水", 0x07202e);
  return {
    view,
    update: (t) => {
      halo.alpha = 0.8 + Math.sin(t * 1.1) * 0.2;
      icon.alpha = 0.7 + Math.sin(t * 1.6) * 0.15;
      fx.clear();
      for (let i = 0; i < 3; i++) {
        const q = ((t * 0.18 + i / 3) % 1) as number;
        fx.circle(0, 0, r * (0.25 + q * 0.7)).stroke({
          color: 0xbdefff,
          width: 1,
          alpha: (1 - q) * 0.45,
        });
      }
    },
  };
}

/* Fire: a flame seal with embers rising from the rim. --------------------- */
function fire(p: Point, l: Layout): FieldItem {
  const { view, halo, fx, icon, r } = seal(p, l, 0xffa060, "火", 0x2a0c06);
  const seeds = Array.from({ length: 7 }, (_, i) => ({
    a: (i / 7) * Math.PI * 2,
    o: ((i * 29) % 100) / 100,
    s: 0.7 + ((i * 17) % 60) / 100,
  }));
  return {
    view,
    update: (t) => {
      const flicker = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
      halo.alpha = flicker;
      icon.alpha = 0.6 + flicker * 0.3;
      fx.clear();
      for (const s of seeds) {
        const q = ((t * 0.45 * s.s + s.o) % 1) as number,
          x = Math.cos(s.a) * r * 0.7 + Math.sin(t * 2 + s.o * 9) * 3,
          y = Math.sin(s.a) * r * 0.5 - q * r * 1.6;
        fx.circle(x, y, 1.3 + (1 - q)).fill({
          color: 0xffd9a0,
          alpha: (1 - q) * 0.85,
        });
      }
    },
  };
}

/* Wind: a luminous current along the path, flowing toward the target. ---- */
function wind(a: Point, b: Point, l: Layout): FieldItem {
  const view = new Container();
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy);
  view.position.set(a.x, a.y);
  view.rotation = Math.atan2(dy, dx);
  const glow = new Graphics()
    .moveTo(len * 0.1, 0)
    .lineTo(len * 0.9, 0)
    .stroke({
      color: 0xa8f1c2,
      width: Math.min(14, l.dx * 0.12),
      alpha: 0.1,
      cap: "round",
    })
    .moveTo(len * 0.1, 0)
    .lineTo(len * 0.9, 0)
    .stroke({ color: 0xd9ffe9, width: 2, alpha: 0.28, cap: "round" });
  const stream = new Graphics();
  view.addChild(glow, stream);
  const count = 4,
    size = Math.min(7, l.dx * 0.07);
  return {
    view,
    update: (t) => {
      stream.clear();
      for (let i = 0; i < count; i++) {
        const q = ((t * 0.5 + i / count) % 1) as number,
          x = len * (0.12 + q * 0.76),
          fade = Math.sin(q * Math.PI);
        stream
          .moveTo(x - size, -size)
          .lineTo(x, 0)
          .lineTo(x - size, size)
          .stroke({
            color: 0xe6fff1,
            width: 1.6,
            alpha: 0.2 + fade * 0.7,
            cap: "round",
            join: "round",
          });
      }
      for (let i = 0; i < 5; i++) {
        const q = ((t * 0.35 + ((i * 0.37) % 1)) % 1) as number,
          x = len * (0.1 + q * 0.8),
          y = Math.sin(t * 2.6 + i * 1.7) * size * 1.4,
          fade = Math.sin(q * Math.PI);
        stream.circle(x, y, 1.2).fill({ color: 0xeafff3, alpha: fade * 0.6 });
      }
    },
  };
}

/* Flower: a small blossom seal drawn in thin luminous strokes. ----------- */
function flower(p: Point, l: Layout): FieldItem {
  const view = new Container();
  view.position.set(p.x, p.y - l.dy * 0.3);
  const r = Math.max(6, l.dx * 0.085),
    color = 0xf3b9d4;
  const halo = new Graphics().circle(0, 0, r * 2.2).fill({ color, alpha: 0.1 });
  const g = new Graphics();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.ellipse(Math.cos(a) * r, Math.sin(a) * r, r * 0.7, r * 0.42);
    g.fill({ color, alpha: 0.22 });
    g.ellipse(Math.cos(a) * r, Math.sin(a) * r, r * 0.7, r * 0.42);
    g.stroke({ color, width: 1, alpha: 0.9 });
  }
  g.circle(0, 0, r * 0.4).fill({ color: 0xfff1a8, alpha: 0.9 });
  view.addChild(halo, g);
  const phase = (p.x * 7 + p.y * 13) % 6;
  return {
    view,
    update: (t) => {
      g.rotation = Math.sin(t * 1.3 + phase) * 0.18;
      halo.alpha = 0.8 + Math.sin(t * 1.7 + phase) * 0.2;
    },
  };
}

/* Bridge (Construir): a conjured path, gold like the summoning glow, with
   rune rungs instead of planks. --------------------------------------------- */
function bridge(a: Point, b: Point, l: Layout): FieldItem {
  const view = new Container();
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy);
  view.position.set(a.x, a.y);
  view.rotation = Math.atan2(dy, dx);
  const w = Math.min(9, l.dx * 0.08);
  const g = new Graphics()
    .moveTo(0, 0)
    .lineTo(len, 0)
    .stroke({ color: 0x03100f, width: 12, alpha: 0.9 })
    .moveTo(0, 0)
    .lineTo(len, 0)
    .stroke({ color: 0xf1d68f, width: w * 2.2, alpha: 0.08 })
    .moveTo(0, -w)
    .lineTo(len, -w)
    .moveTo(0, w)
    .lineTo(len, w)
    .stroke({ color: 0xf1d68f, width: 1.2, alpha: 0.85 });
  const rungs = Math.max(3, Math.round(len / 16));
  for (let i = 1; i < rungs; i++) {
    const x = (i / rungs) * len;
    g.moveTo(x, -w * 0.7)
      .lineTo(x, w * 0.7)
      .stroke({ color: 0xf1d68f, width: 1, alpha: 0.5 });
  }
  const shimmer = new Graphics();
  view.addChild(g, shimmer);
  return {
    view,
    update: (t) => {
      shimmer.clear();
      const q = ((t * 0.25) % 1) as number,
        x = q * len;
      shimmer
        .moveTo(Math.max(0, x - 18), 0)
        .lineTo(Math.min(len, x + 18), 0)
        .stroke({ color: 0xfff3c8, width: 2, alpha: 0.55, cap: "round" });
    },
  };
}

/* Rift link: a void tether between the two rifts, drifting like a current. */
function riftLink(a: Point, b: Point, l: Layout): FieldItem {
  const view = new Container();
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy);
  view.position.set(a.x, a.y);
  view.rotation = Math.atan2(dy, dx);
  const haze = new Graphics()
    .roundRect(0, -6, len, 12, 6)
    .fill({ color: 0x6f3bc1, alpha: 0.14 });
  const dashes = new Graphics();
  view.addChild(haze, dashes);
  const gap = Math.max(14, l.dx * 0.18);
  return {
    view,
    update: (t) => {
      dashes.clear();
      const offset = (t * 40) % gap;
      for (let x = -gap + offset; x < len; x += gap) {
        const x0 = Math.max(0, x),
          x1 = Math.min(len, x + gap * 0.45);
        if (x1 <= x0) continue;
        dashes
          .moveTo(x0, Math.sin(x / 30 + t * 2) * 2)
          .lineTo(x1, Math.sin(x1 / 30 + t * 2) * 2)
          .stroke({ color: 0xd3a6ff, width: 2, alpha: 0.75, cap: "round" });
      }
    },
  };
}
