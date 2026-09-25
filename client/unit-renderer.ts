import {
  Container,
  Graphics,
  Sprite,
  Assets,
  type Texture,
  type FederatedPointerEvent,
} from "pixi.js";
import type { UnitView } from "../shared/room.js";
import type { ArenaState } from "./arena-scene.js";
import { cards as catalog } from "../shared/cards.js";
import { movementMarker, unitEffects } from "../shared/unit-insight.js";
import { label, clear, colors } from "./arena-drawing.js";

/** Draws one piece. Position, dragging and event playback belong to ArenaScene. */
export function drawUnit(
  view: Container,
  u: UnitView,
  size: number,
  getState: () => ArenaState,
  onPointerDown: (event: FederatedPointerEvent) => void,
) {
  clear(view);
  view.eventMode = "static";
  view.cursor = u.owner === getState().seat ? "grab" : "pointer";
  view.removeAllListeners();
  const owner = colors[u.kind === "curse" ? 2 : u.owner],
    card = catalog.get(u.cardId);
  const w = size * 0.88,
    h = size * 0.93;
  const shadow = new Graphics()
    .ellipse(0, h * 0.42, w * 0.68, h * 0.27)
    .fill({ color: 0x020907, alpha: 0.7 });
  view.addChild(shadow);
  const frame = new Graphics()
    .roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 8)
    .fill({ color: 0x081510, alpha: 0.98 })
    .stroke({ color: owner, width: 2, alpha: 0.8 });
  view.addChild(frame);
  if (u.kind === "crystal") {
    frame.clear();
    const crystal = new Graphics()
      .poly([
        0,
        -h * 0.46,
        w * 0.26,
        -h * 0.04,
        0,
        h * 0.26,
        -w * 0.26,
        -h * 0.04,
      ])
      .fill({ color: owner, alpha: 0.9 })
      .stroke({ color: 0xedf8cf, width: 1, alpha: 0.7 });
    crystal
      .moveTo(0, -h * 0.46)
      .lineTo(0, h * 0.26)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.6 });
    view.addChild(crystal);
    const life = label(String(u.hp), Math.max(11, size * 0.22), 0xf0e6c8);
    life.anchor.set(0.5);
    life.y = h * 0.45;
    view.addChild(life);
    view.on("pointertap", () => getState().onCell(u.x, u.y, u));
    view.on("pointerover", () => getState().onHover(u));
    view.on("pointerout", () => getState().onHover(null));
    return;
  }
  if (u.kind === "rift") {
    // A void portal: a dark eye with two counter-rotating rune rings.
    frame.clear();
    const r = Math.min(w, h) * 0.34;
    const halo = new Graphics()
      .circle(0, 0, r * 1.5)
      .fill({ color: 0x5a2aa0, alpha: 0.18 })
      .circle(0, 0, r * 1.1)
      .fill({ color: 0x1a0836, alpha: 0.95 })
      .circle(0, 0, r * 0.55)
      .fill({ color: 0x0a0318, alpha: 1 });
    view.addChild(halo);
    const outer = new Graphics();
    outer.label = "spin";
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2,
        a1 = a0 + Math.PI / 5;
      outer
        .arc(0, 0, r * 1.05, a0, a1)
        .stroke({ color: 0xd39cff, width: 2.5, alpha: 0.9, cap: "round" });
    }
    const inner = new Graphics();
    inner.label = "spin-back";
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2,
        a1 = a0 + Math.PI / 3;
      inner
        .arc(0, 0, r * 0.75, a0, a1)
        .stroke({ color: 0x9a6ae0, width: 1.5, alpha: 0.85, cap: "round" });
    }
    view.addChild(outer, inner);
    const icon = label("空", Math.max(14, size * 0.26), 0xe6c5ff);
    icon.anchor.set(0.5);
    view.addChild(icon);
    view.on("pointertap", () => getState().onCell(u.x, u.y, u));
    view.on("pointerover", () => getState().onHover(u));
    view.on("pointerout", () => getState().onHover(null));
    return;
  }
  if (u.kind === "wall") {
    // Earth ward: a lacquer slab in the piece frame's language, the earth
    // glyph set in a rune ring, and its remaining life in a single chip.
    frame.clear();
    const ww = w * 0.9,
      wh = h * 0.7,
      earth = 0xd7ae67;
    const slab = new Graphics()
      .roundRect(-ww / 2 - 3, -wh / 2 - 3, ww + 6, wh + 6, 8)
      .fill({ color: 0x081510, alpha: 0.98 })
      .stroke({ color: owner, width: 2, alpha: 0.8 })
      .roundRect(-ww / 2, -wh / 2, ww, wh, 5)
      .fill({ color: 0x241a0c, alpha: 0.95 })
      .roundRect(-ww / 2 + 3, -wh / 2 + 3, ww - 6, wh - 6, 4)
      .stroke({ color: earth, width: 1, alpha: 0.45 });
    // Courses of stone suggested by a few hairlines.
    for (let row = 1; row < 4; row++) {
      const y = -wh / 2 + (row * wh) / 4;
      slab
        .moveTo(-ww / 2 + 6, y)
        .lineTo(ww / 2 - 6, y)
        .stroke({ color: earth, width: 1, alpha: 0.2 });
    }
    view.addChild(slab);
    const r = Math.min(ww, wh) * 0.3;
    const ring = new Graphics()
      .circle(0, -2, r)
      .stroke({ color: earth, width: 1.2, alpha: 0.8 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ring
        .moveTo(Math.cos(a) * r, -2 + Math.sin(a) * r)
        .lineTo(Math.cos(a) * r * 1.18, -2 + Math.sin(a) * r * 1.18)
        .stroke({ color: earth, width: 1, alpha: 0.5 });
    }
    view.addChild(ring);
    const glyph = label("地", Math.max(14, r * 1.2), earth);
    glyph.anchor.set(0.5);
    glyph.y = -2;
    view.addChild(glyph);
    const life = label(`♥ ${u.hp ?? 0}`, Math.max(10, size * 0.18), 0xf2e4c0);
    life.anchor.set(0.5);
    life.y = wh / 2 - Math.max(8, size * 0.13);
    view.addChild(
      new Graphics()
        .roundRect(
          -life.width / 2 - 6,
          life.y - life.height / 2 - 1,
          life.width + 12,
          life.height + 2,
          4,
        )
        .fill({ color: 0x0a1713, alpha: 0.98 })
        .stroke({ color: 0x68c5ef, width: 1, alpha: 0.6 }),
      life,
    );
    view.on("pointertap", () => getState().onCell(u.x, u.y, u));
    view.on("pointerover", () => getState().onHover(u));
    view.on("pointerout", () => getState().onHover(null));
    view.on("rightclick", (e) => {
      e.preventDefault();
      getState().onInspect(u);
    });
    return;
  }
  const art = new Container();
  view.addChild(art);
  const mask = new Graphics()
    .roundRect(-w / 2, -h / 2, w, h - 14, 5)
    .fill(0xffffff);
  view.addChild(mask);
  art.mask = mask;
  const putTexture = (texture: Texture) => {
    if (view.destroyed || art.destroyed) return;
    clear(art);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.48);
    const scale = w / texture.width;
    sprite.scale.set(scale * 1.25);
    sprite.position.set(0, -h * 0.02);
    art.addChild(sprite);
  };
  if (card?.asset && u.cardId !== "hidden") {
    const texture = Assets.cache.get<Texture>(card.asset);
    if (texture) putTexture(texture);
    else
      void Assets.load<Texture>(card.asset)
        .then((t) => {
          putTexture(t);
        })
        .catch(() => {});
  } else {
    if (u.kind === "curse") {
      const sigil = new Graphics()
        .circle(0, -4, size * 0.38)
        .fill({ color: 0x5c338c, alpha: 0.35 })
        .circle(0, -4, size * 0.32)
        .stroke({ color: 0xc29ae8, width: 1, alpha: 0.65 });
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        sigil
          .moveTo(Math.cos(a) * size * 0.34, -4 + Math.sin(a) * size * 0.34)
          .lineTo(Math.cos(a) * size * 0.45, -4 + Math.sin(a) * size * 0.45)
          .stroke({ color: 0xc29ae8, width: 1, alpha: 0.8 });
      }
      art.addChild(sigil);
    }
    const icon = label(
      u.kind === "curse" ? "禍" : "式",
      size * (u.kind === "curse" ? 0.5 : 0.65),
      owner,
    );
    icon.anchor.set(0.5);
    icon.y = -5;
    art.addChild(icon);
  }
  // Movement readiness only matters while its owner is moving pieces.
  const game = getState().game;
  const marker =
    !game.setup &&
    game.phase === 2 &&
    game.phaseOwner === u.owner &&
    movementMarker(game, u);
  if (marker && marker.state !== "ready") {
    // Soften only the illustration so the piece stays recognizable. Stats,
    // targeting, inspection and usable abilities remain bright.
    view.addChild(
      new Graphics()
        .roundRect(-w / 2, -h / 2, w, h - 21, 5)
        .fill({ color: 0x03100f, alpha: 0.42 }),
    );
    const radius = Math.max(5, Math.min(10, w * 0.14));
    const cx = -w * 0.4,
      cy = -h * 0.48;
    const emblem = new Graphics()
      .circle(cx, cy, radius)
      .fill({ color: 0x0b211b, alpha: 0.96 })
      .stroke({ color: marker.color, width: 1.5 });
    if (marker.state === "waiting") {
      emblem
        .moveTo(cx, cy - radius * 0.6)
        .lineTo(cx, cy)
        .lineTo(cx + radius * 0.45, cy + radius * 0.22)
        .stroke({ color: marker.color, width: 1.6 });
    } else if (marker.state === "moved") {
      emblem
        .moveTo(cx - radius * 0.5, cy)
        .lineTo(cx - radius * 0.1, cy + radius * 0.4)
        .lineTo(cx + radius * 0.55, cy - radius * 0.4)
        .stroke({ color: marker.color, width: 1.8 });
    } else {
      emblem
        .moveTo(cx - radius * 0.38, cy - radius * 0.38)
        .lineTo(cx + radius * 0.38, cy + radius * 0.38)
        .moveTo(cx + radius * 0.38, cy - radius * 0.38)
        .lineTo(cx - radius * 0.38, cy + radius * 0.38)
        .stroke({ color: marker.color, width: 1.8 });
    }
    view.addChild(emblem);
  }
  const strip = new Graphics()
    .roundRect(-w / 2, h / 2 - 21, w, 24, 3)
    .fill({ color: 0x0a1713, alpha: 0.98 });
  view.addChild(strip);
  const stats = [u.attack, u.hp, u.speed],
    bases = [
      card?.stats.attack ?? u.attack,
      card?.stats.health ?? u.maxHp,
      typeof card?.stats.speed === "number" ? card.stats.speed : u.speed,
    ];
  stats.forEach((value, i) => {
    const tint = [0xf57b62, 0x68c5ef, 0x8cd8b6][i];
    const x = (i - 1) * w * 0.32;
    const stacked = w < 62 || stats.some((n) => n !== null && n >= 10);
    view.addChild(
      new Graphics()
        .roundRect(x - w * 0.155, h / 2 - 20, w * 0.31, 22, 3)
        .fill({ color: tint, alpha: 0.19 }),
    );
    const icon = label(["⚔", "♥", "➟"][i], Math.max(8, size * 0.13), tint);
    icon.anchor.set(0.5);
    icon.position.set(stacked ? x : x - w * 0.09, h / 2 - (stacked ? 16 : 7));
    view.addChild(icon);
    const t = label(
      value === null ? "?" : String(value),
      Math.max(10, size * 0.21),
      value === null || bases[i] === null
        ? 0xf2e4c0
        : value < bases[i]
          ? 0xff9285
          : value > bases[i]
            ? 0x93edaf
            : 0xf2e4c0,
    );
    t.anchor.set(0.5);
    const maxWidth = w * (stacked ? 0.29 : 0.18);
    if (t.width > maxWidth) t.scale.x = maxWidth / t.width;
    t.position.set(stacked ? x : x + w * 0.035, h / 2 - (stacked ? 4 : 7));
    view.addChild(t);
    if (value !== null && bases[i] !== null && value !== bases[i]) {
      const delta = label(
        value > bases[i] ? "↑" : "↓",
        9,
        value > bases[i] ? 0x93edaf : 0xff9285,
      );
      delta.anchor.set(0.5);
      delta.position.set(x + w * 0.11, h / 2 - 17);
      view.addChild(delta);
    }
  });
  if (u.statuses?.shield) {
    const s = new Graphics()
      .ellipse(0, 0, w * 0.65, h * 0.7)
      .stroke({ color: 0x9de8ff, width: 2, alpha: 0.8 });
    view.addChild(s);
  }
  if (u.statuses?.burn) {
    const t = label("♨", 14, 0xff8c57);
    t.position.set(w * 0.3, -h * 0.5);
    view.addChild(t);
  }
  const effects = unitEffects(u);
  if (effects.length) {
    const badge = new Container();
    badge.position.set(w / 2 - 5, -h * 0.12);
    badge.scale.set(Math.min(1, size / 70));
    badge.addChild(
      new Graphics()
        .roundRect(-4, -10, 32, 20, 8)
        .fill(0x271d43)
        .stroke({ color: 0xd1b2ff, width: 1.5 }),
    );
    const text = label(`✦${effects.length}`, 11, 0xf0deff);
    text.position.set(1, -7);
    badge.addChild(text);
    badge.eventMode = "static";
    badge.cursor = "help";
    badge.on("pointerdown", (e) => e.stopPropagation());
    badge.on("pointertap", (e) => {
      e.stopPropagation();
      getState().onInspect(u);
    });
    badge.on("pointerover", () => getState().onHover(u));
    view.addChild(badge);
  }
  const targetIndex = getState().targets.indexOf(u.id);
  if (marker && marker.state === "ready") {
    const badge = label(
      marker.symbol,
      Math.max(8, Math.min(13, size * 0.19)),
      marker.color,
    );
    badge.anchor.set(0.5);
    badge.position.set(-w * 0.4, -h * 0.48);
    view.addChild(
      new Graphics()
        .circle(badge.x, badge.y, Math.max(5, Math.min(9, w * 0.13)))
        .fill({ color: 0x091e19, alpha: 0.95 })
        .stroke({ color: marker.color, width: 1.5 }),
      badge,
    );
  }
  const chosen = targetIndex >= 0,
    valid = getState().validTargets?.includes(u.id),
    affected = getState().affected?.includes(u.id);
  if (chosen || valid || affected) {
    // Chosen targets are gold; still-selectable targets glow in the seat's
    // teal; pieces a preview would change get a warm outline.
    const color = chosen ? 0xf3d27f : affected ? 0xf2c983 : 0x8ee8cc;
    view.addChildAt(
      new Graphics()
        .roundRect(-w / 2 - 7, -h / 2 - 7, w + 14, h + 14, 10)
        .fill({ color, alpha: chosen ? 0.28 : 0.16 }),
      1,
    );
    view.addChild(
      new Graphics()
        .roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 7)
        .stroke({ color, width: chosen ? 3.5 : 2.5, alpha: 0.95 }),
    );
  }
  if (chosen) {
    // Number the pick in the top-right, clear of every other badge.
    const x = w / 2 + 6,
      y = -h / 2 - 6;
    view.addChild(
      new Graphics()
        .circle(x, y, 11)
        .fill(0xf3d27f)
        .stroke({ color: 0x17261a, width: 2 }),
    );
    const number = label(String(targetIndex + 1), 13, 0x17261a);
    number.anchor.set(0.5);
    number.position.set(x, y);
    view.addChild(number);
  }
  if (getState().readyAbilities?.includes(u.id)) {
    const ability = new Container();
    ability.position.set(0, -h * 0.5);
    const star = label("✦", 16, 0xf4dfa0);
    star.anchor.set(0.5);
    ability.addChild(
      new Graphics()
        .circle(0, 0, 12)
        .fill(0x193e30)
        .stroke({ color: 0xdac680, width: 1 }),
      star,
    );
    ability.eventMode = "static";
    ability.cursor = "pointer";
    ability.on("pointerdown", (e) => e.stopPropagation());
    ability.on("pointertap", (e) => {
      e.stopPropagation();
      getState().onAbility?.(u);
    });
    view.addChild(ability);
  }
  const inspect = label("⤢", 11, 0xf1ddb2);
  inspect.position.set(w * 0.3, -h * 0.5);
  inspect.eventMode = "static";
  inspect.cursor = "zoom-in";
  inspect.on("pointerdown", (e) => e.stopPropagation());
  inspect.on("pointertap", (e) => {
    e.stopPropagation();
    getState().onInspect(u);
  });
  view.addChild(inspect);
  view.on("pointerdown", onPointerDown);
  view.on("rightclick", (e) => {
    e.preventDefault();
    getState().onInspect(u);
  });
  view.on("pointerover", () => getState().onHover(u));
  view.on("pointerout", () => getState().onHover(null));
}
