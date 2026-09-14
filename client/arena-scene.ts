import { layout } from "../shared/arena-layout.js";
export { layout } from "../shared/arena-layout.js";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Assets,
  Texture,
  Rectangle,
} from "pixi.js";
import {
  connected,
  cards as catalog,
  type Game,
  type GameEvent,
  type Unit,
} from "../shared/game.js";
export type Point = { x: number; y: number };
export type ArenaState = {
  game: Game;
  seat: number;
  highlights: Point[];
  selectedId?: string;
  targets: string[];
  startY: number;
  onCell: (x: number, y: number, u?: Unit) => void;
  onSelect: (u: Unit) => void;
  onDrop: (x: number, y: number, u?: Unit, unitId?: string) => void;
  onInspect: (u: Unit) => void;
  onHover: (u: Unit | null) => void;
  onPresentation: (label: string | null, units?: Unit[]) => void;
};
const nodes = [
  ...Array.from({ length: 49 }, (_, i) => ({ x: i % 7, y: Math.floor(i / 7) })),
  { x: -1, y: 7 },
  { x: 7, y: -1 },
];
const colors = [0x76d8ec, 0xf29a7a, 0xc7a3ee];
const label = (text: string, size: number, color = 0xf6e3b7) =>
  new Text({
    text,
    style: {
      fontFamily: "ShikigamidoJP, Arial",
      fontSize: size,
      fill: color,
      fontWeight: "600",
      dropShadow: { alpha: 0.8, blur: 3, distance: 1, color: 0x071614 },
    },
  });
export class ArenaScene {
  app = new Application();
  state!: ArenaState;
  private background = new Container();
  private board = new Container();
  private pieces = new Container();
  private fx = new Container();
  private units = new Map<
    string,
    { view: Container; x: number; y: number; hp: number; image: string }
  >();
  private sparks: { view: Graphics; vx: number; vy: number; life: number }[] =
    [];
  private selectedPulse = new Graphics();
  private drag: {
    id: string;
    startX: number;
    startY: number;
    view: Container;
    moving: boolean;
  } | null = null;
  private textures = new Map<string, Texture>();
  private destroyed = false;
  private observer?: ResizeObserver;
  private buildKey = "";
  private unitLayout = "";
  private eventIds = new Set<string>();
  private eventBaseline = false;
  private queue: GameEvent[] = [];
  private presenting = false;
  private activeViews = new Set<string>();
  private cancels = new Set<() => void>();
  async init(host: HTMLElement, state: ArenaState) {
    this.state = state;
    await document.fonts.load("16px ShikigamidoJP");
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
      preference: "webgl",
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      "Arena interativa de Shikigamido",
    );
    this.app.canvas.setAttribute("role", "img");
    this.app.stage.addChild(
      this.background,
      this.board,
      this.pieces,
      this.fx,
      this.selectedPulse,
    );
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(
      0,
      0,
      this.app.screen.width,
      this.app.screen.height,
    );
    this.app.stage.on("globalpointermove", (e) => {
      if (!this.drag) return;
      const d = this.drag;
      if (
        this.state.game.units.find((u) => u.id === d.id)?.owner !==
        this.state.seat
      )
        return;
      if (Math.hypot(e.global.x - d.startX, e.global.y - d.startY) > 8)
        d.moving = true;
      if (d.moving) {
        d.view.position.set(e.global.x, e.global.y);
        d.view.scale.set(1.13);
        d.view.alpha = 0.9;
      }
    });
    this.app.stage.on("pointercancel", () => {
      if (this.drag) {
        this.drag.view.scale.set(1);
        this.drag.view.alpha = 1;
        this.drag = null;
      }
    });
    this.app.stage.on("pointerup", (e) => this.release(e.global.x, e.global.y));
    this.app.stage.on("pointerupoutside", (e) =>
      this.release(e.global.x, e.global.y),
    );
    this.app.ticker.add((t) => this.tick(t.deltaTime));
    this.observer = new ResizeObserver(() => {
      this.buildKey = "";
      requestAnimationFrame(() => {
        if (!this.destroyed) {
          this.app.resize();
          this.update(this.state);
        }
      });
    });
    this.observer.observe(host);
    this.update(state);
  }
  private release(x: number, y: number) {
    if (!this.drag || this.presenting) return;
    const d = this.drag;
    this.drag = null;
    d.view.scale.set(1);
    d.view.alpha = 1;
    if (d.moving) {
      const cell = this.cellAt(x, y);
      if (cell)
        this.state.onDrop(
          cell.x,
          cell.y,
          this.state.game.units.find((u) => u.x === cell.x && u.y === cell.y),
          d.id,
        );
    } else {
      const u = this.state.game.units.find((u) => u.id === d.id);
      if (u) this.state.onCell(u.x, u.y, u);
    }
  }
  cellAt(x: number, y: number) {
    const l = layout(this.app.screen.width, this.app.screen.height);
    return nodes.find((p) => {
      const q = l.point(p.x, p.y);
      return Math.abs(x - q.x) < l.dx * 0.48 && Math.abs(y - q.y) < l.dy * 0.48;
    });
  }
  private clear(container: Container) {
    for (const child of container.removeChildren())
      child.destroy({ children: true });
  }
  update(state: ArenaState) {
    this.state = state;
    if (!this.app.renderer) return;
    const { width: w, height: h } = this.app.screen,
      l = layout(w, h);
    this.app.stage.hitArea = new Rectangle(0, 0, w, h);
    const key = [
      w,
      h,
      state.game.turn < 3,
      JSON.stringify(state.game.edges),
      JSON.stringify(state.game.terrain),
      JSON.stringify(state.game.flowers),
      JSON.stringify(state.highlights),
      state.selectedId,
      state.targets.join(),
      state.game.setup,
      state.startY,
    ].join("|");
    if (key !== this.buildKey) {
      this.buildKey = key;
      this.clear(this.board);
      this.drawBoard(l);
    }
    const incoming = (state.game.events || []).filter(
      (e) => !this.eventIds.has(e.id),
    );
    for (const e of state.game.events || []) this.eventIds.add(e.id);
    if (this.eventBaseline)
      this.queue.push(
        ...incoming.filter((e) =>
          ["summon", "move", "approach", "combat", "cast", "spell"].includes(
            e.type,
          ),
        ),
      );
    this.eventBaseline = true;
    if (this.presenting) return;
    if (this.queue.length) {
      void this.playQueue();
      return;
    }
    this.syncUnits(state);
    this.state.onPresentation(null, state.game.units);
  }
  private syncUnits(state: ArenaState) {
    const l = layout(this.app.screen.width, this.app.screen.height);
    const key = `${this.app.screen.width}x${this.app.screen.height}`,
      resized = key !== this.unitLayout;
    this.unitLayout = key;
    const alive = new Set(state.game.units.map((u) => u.id));
    for (const [id, item] of this.units)
      if (!alive.has(id)) {
        this.burst(item.view.x, item.view.y, 0xf8a978, 20);
        item.view.destroy({ children: true });
        this.units.delete(id);
      }
    for (const u of state.game.units) {
      const p = l.point(
        u.x,
        state.game.setup &&
          u.kind === "omionji" &&
          u.owner === state.seat &&
          !state.game.players[u.owner].ready
          ? state.startY
          : u.y,
      );
      let item = this.units.get(u.id);
      const stamp = [
        state.targets.indexOf(u.id),
        l.dx,
        l.dy,
        u.cardId,
        u.attack,
        u.hp,
        u.speed,
        u.statuses?.shield,
        u.statuses?.burn,
        u.statuses?.hidden,
      ].join("|");
      if (!item) {
        const view = new Container();
        view.position.set(p.x, p.y - 14);
        this.pieces.addChild(view);
        item = { view, x: p.x, y: p.y, hp: u.hp, image: "" };
        this.units.set(u.id, item);
        this.burst(p.x, p.y, colors[u.kind === "curse" ? 2 : u.owner], 12);
      }
      item.x = p.x;
      item.y = p.y;
      if (resized) item.view.position.set(p.x, p.y);
      if (item.image !== stamp) {
        if (item.hp > u.hp)
          this.damage(item.view.x, item.view.y, item.hp - u.hp);
        item.hp = u.hp;
        item.image = stamp;
        this.drawUnit(item.view, u, Math.min(l.dx * 0.76, l.dy * 0.9));
      }
      item.view.zIndex = u.id === state.selectedId ? 100 : u.y;
      this.pieces.sortableChildren = true;
    }
  }
  private drawBoard(l: ReturnType<typeof layout>) {
    const game = this.state.game;
    const paths = new Graphics();
    for (let i = 0; i < nodes.length; i++)
      for (const b of nodes.slice(i + 1)) {
        const a = nodes[i];
        if (!connected(game, a.x, a.y, b.x, b.y)) continue;
        const p = l.point(a.x, a.y),
          q = l.point(b.x, b.y);
        const locked =
          game.turn < 3 &&
          ((a.x === 3 && a.y === 3) || (b.x === 3 && b.y === 3));
        paths
          .moveTo(p.x, p.y + 3)
          .lineTo(q.x, q.y + 3)
          .stroke({ width: 12, color: 0x03100f, alpha: 0.9 });
        paths
          .moveTo(p.x, p.y)
          .lineTo(q.x, q.y)
          .stroke({
            width: 5,
            color: locked ? 0x65716b : 0xbfc89a,
            alpha: locked ? 0.14 : 0.25,
          });
        paths
          .moveTo(p.x, p.y)
          .lineTo(q.x, q.y)
          .stroke({ width: 1, color: 0xefdda5, alpha: locked ? 0.08 : 0.48 });
      }
    this.board.addChild(paths);
    for (const t of game.terrain) {
      const q = l.point(t.x, t.y);
      const glow = new Graphics()
        .ellipse(q.x, q.y, l.dx * 0.42, l.dy * 0.38)
        .fill({
          color:
            t.kind === "lake"
              ? 0x49afd5
              : t.kind === "wind"
                ? 0x91dbae
                : 0xe9a166,
          alpha: 0.22,
        });
      this.board.addChild(glow);
    }
    for (const f of game.flowers || []) {
      const q = l.point(f.x, f.y),
        flower = label("✿", 20, 0xefb8d3);
      flower.anchor.set(0.5);
      flower.position.set(q.x, q.y - 12);
      this.board.addChild(flower);
    }

    const center = l.point(3, 3),
      seal = new Graphics();
    for (const r of [36, 45, 61])
      seal.ellipse(center.x, center.y, r, r).stroke({
        width: 1,
        color: game.turn < 3 ? 0x698782 : 0xd4c582,
        alpha: 0.35,
      });
    this.board.addChild(seal);
    for (const p of nodes) {
      const q = l.point(p.x, p.y),
        lit = this.state.highlights.some((v) => v.x === p.x && v.y === p.y),
        spawn = p.x < 0 || p.x > 6,
        center = p.x === 3 && p.y === 3,
        setup =
          this.state.game.setup &&
          this.state.seat >= 0 &&
          p.x === (this.state.seat ? 6 : 0) &&
          [2, 4].includes(p.y);
      const r = Math.max(9, Math.min(l.dy * 0.18, 17));
      const node = new Container();
      node.position.set(q.x, q.y);
      const g = new Graphics();
      if (lit || setup) {
        g.ellipse(0, 0, r * 2.05, r * 2.05).fill({
          color: 0xd7e39b,
          alpha: 0.08,
        });
        g.ellipse(0, 0, r * 1.5, r * 1.5).stroke({
          width: 2,
          color: 0xf9e6a9,
          alpha: 0.85,
        });
      }
      g.ellipse(0, 4, r + 3, r + 3).fill({
        color: 0x061713,
        alpha: 0.85,
      });
      g.ellipse(0, 0, r, r)
        .fill({
          color: spawn ? 0x392b48 : center ? 0x4b5940 : 0x273a30,
          alpha: 0.95,
        })
        .stroke({
          color: spawn ? 0xc9a4ec : lit ? 0xf9e3a0 : 0xa6b694,
          width: lit ? 2 : 1,
          alpha: lit ? 0.95 : 0.52,
        });
      g.ellipse(0, -2, r * 0.68, r * 0.68).stroke({
        color: 0xc6d4b2,
        alpha: 0.2,
        width: 1,
      });
      node.addChild(g);
      if (setup) {
        const t = label(p.y === 2 ? "A" : "B", 15, 0xffe7a3);
        t.anchor.set(0.5);
        t.position.set(-r * 2.4, 0);
        node.addChild(t);
        if (p.y === this.state.startY)
          g.circle(0, 0, r * 1.8).stroke({ width: 2, color: 0xffdd91 });
      }
      if (center || spawn) {
        const t = label(
          spawn ? "禍" : game.turn < 3 ? "陰" : "✦",
          center ? 24 : 17,
          spawn ? 0xc8a4ef : 0xd4cea2,
        );
        t.anchor.set(0.5);
        node.addChild(t);
      }
      node.eventMode = "static";
      node.cursor = "pointer";
      node.hitArea = new Rectangle(
        -l.dx * 0.45,
        -l.dy * 0.43,
        l.dx * 0.9,
        l.dy * 0.86,
      );
      node.on("pointertap", () =>
        this.state.onCell(
          p.x,
          p.y,
          this.state.game.units.find((u) => u.x === p.x && u.y === p.y),
        ),
      );
      node.on("pointerover", () => {
        g.tint = 0xffe4a1;
      });
      node.on("pointerout", () => (g.tint = 0xffffff));
      this.board.addChild(node);
    }
  }
  private drawUnit(view: Container, u: Unit, size: number) {
    this.clear(view);
    view.eventMode = "static";
    view.cursor = u.owner === this.state.seat ? "grab" : "pointer";
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
      view.on("pointertap", () => this.state.onCell(u.x, u.y, u));
      view.on("pointerover", () => this.state.onHover(u));
      view.on("pointerout", () => this.state.onHover(null));
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
      this.clear(art);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.38);
      const scale = w / texture.width;
      sprite.scale.set(scale * 1.8);
      sprite.position.set(0, -h * 0.02);
      art.addChild(sprite);
    };
    if (card?.asset && u.cardId !== "hidden") {
      const texture = this.textures.get(card.asset);
      if (texture) putTexture(texture);
      else
        void Assets.load<Texture>(card.asset)
          .then((t) => {
            this.textures.set(card.asset, t);
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
    const strip = new Graphics()
      .roundRect(-w / 2, h / 2 - 17, w, 20, 3)
      .fill({ color: 0x0a1713, alpha: 0.98 });
    view.addChild(strip);
    const stats = [u.attack, u.hp, u.speed],
      bases = [
        card?.stats.attack ?? u.attack,
        card?.stats.health ?? u.maxHp,
        typeof card?.stats.speed === "number" ? card.stats.speed : u.speed,
      ];
    stats.forEach((value, i) => {
      const t = label(
        value === null ? "?" : String(value),
        Math.max(10, size * 0.23),
        value < bases[i] ? 0xff9285 : value > bases[i] ? 0x93edaf : 0xf2e4c0,
      );
      t.anchor.set(0.5);
      t.position.set((i - 1) * w * 0.31, h / 2 - 7);
      view.addChild(t);
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
    const targetIndex = this.state.targets.indexOf(u.id);
    if (targetIndex >= 0) {
      const badge = new Graphics()
        .circle(-w * 0.5, -h * 0.5, 10)
        .fill(0xe6ce83);
      view.addChild(badge);
      const number = label(String(targetIndex + 1), 12, 0x17261a);
      number.anchor.set(0.5);
      number.position.set(-w * 0.5, -h * 0.5);
      view.addChild(number);
    }
    const inspect = label("⤢", 11, 0xf1ddb2);
    inspect.position.set(w * 0.3, -h * 0.5);
    inspect.eventMode = "static";
    inspect.cursor = "zoom-in";
    inspect.on("pointerdown", (e) => e.stopPropagation());
    inspect.on("pointertap", (e) => {
      e.stopPropagation();
      this.state.onInspect(u);
    });
    view.addChild(inspect);
    view.on("pointerdown", (e) => {
      if (this.presenting) return;
      e.stopPropagation();
      if (e.button === 2) {
        this.state.onInspect(u);
        return;
      }
      this.state.onSelect(u);
      this.drag = {
        id: u.id,
        startX: e.global.x,
        startY: e.global.y,
        view,
        moving: false,
      };
    });
    view.on("rightclick", (e) => {
      e.preventDefault();
      this.state.onInspect(u);
    });
    view.on("pointerover", () => this.state.onHover(u));
    view.on("pointerout", () => this.state.onHover(null));
  }
  private animate(ms: number, frame: (progress: number) => void) {
    return new Promise<void>((resolve) => {
      if (this.destroyed) {
        resolve();
        return;
      }
      let elapsed = 0;
      const finish = () => {
        this.app.ticker.remove(step);
        this.cancels.delete(finish);
        resolve();
      };
      const step = (t: any) => {
        elapsed += t.deltaMS;
        frame(Math.min(1, elapsed / ms));
        if (elapsed >= ms) finish();
      };
      this.cancels.add(finish);
      this.app.ticker.add(step);
    });
  }
  private ensureUnit(u: Unit) {
    let item = this.units.get(u.id);
    const l = layout(this.app.screen.width, this.app.screen.height),
      p = l.point(u.x, u.y);
    if (!item) {
      const view = new Container();
      view.position.set(p.x, p.y);
      this.pieces.addChild(view);
      item = { view, x: p.x, y: p.y, hp: u.hp, image: "" };
      this.units.set(u.id, item);
    }
    this.drawUnit(item.view, u, Math.min(l.dx * 0.76, l.dy * 0.9));
    item.image = "";
    return item;
  }
  private async showCard(id: string, from: Point, to: Point, ms: number) {
    const card = catalog.get(id);
    if (!card?.asset) return;
    let texture: Texture;
    try {
      texture = await Assets.load<Texture>(card.asset);
    } catch {
      return;
    }
    if (this.destroyed) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const width = Math.min(100, this.app.screen.width * 0.17),
      scale = width / texture.width;
    sprite.scale.set(scale);
    sprite.position.set(from.x, from.y);
    this.fx.addChild(sprite);
    await this.animate(ms, (p) => {
      const ease = 1 - (1 - p) ** 3;
      sprite.position.set(
        from.x + (to.x - from.x) * ease,
        from.y + (to.y - from.y) * ease - Math.sin(p * Math.PI) * 65,
      );
      sprite.rotation = Math.sin(p * Math.PI) * 0.12;
      sprite.alpha = p > 0.8 ? (1 - p) * 5 : Math.min(1, p * 7);
      sprite.scale.set(scale * (0.8 + 0.3 * Math.sin(p * Math.PI)));
    });
    if (this.destroyed) return;
    sprite.destroy();
  }
  private async playQueue() {
    this.presenting = true;
    while (this.queue.length && !this.destroyed) {
      const e = this.queue.shift()!,
        l = layout(this.app.screen.width, this.app.screen.height);
      const unit = "unit" in e ? e.unit : undefined;
      const cardId = "cardId" in e ? e.cardId : unit?.cardId;
      const palette: Record<string, number> = {
        agua: 0x83d6ff,
        fogo: 0xff945f,
        vento: 0xa8f1c2,
        terra: 0xebc981,
        vazio: 0xcba2ff,
      };
      const element = "element" in e ? e.element : undefined;
      const color =
        palette[element || catalog.get(cardId || "")?.types[0] || ""] ||
        0xe3d7a3;
      const name =
        catalog.get(cardId || "")?.name ||
        (unit?.kind === "curse" ? "Maldição" : "Carta oculta");
      if (e.type === "summon") {
        this.state.onPresentation(
          e.unit.kind === "curse"
            ? `Uma maldição surgiu no portal`
            : `${name} entrou no campo`,
        );
        const u = e.unit,
          item = this.ensureUnit(u),
          point = l.point(u.x, u.y),
          ring = new Graphics();
        this.fx.addChild(ring);
        this.activeViews.add(u.id);
        item.view.scale.set(0.1);
        item.view.alpha = 0;
        await this.animate(e.unit.kind === "curse" ? 1050 : 600, (p) => {
          const eased = 1 - (1 - p) ** 3;
          item.view.scale.set(eased);
          item.view.alpha = eased;
          ring
            .clear()
            .circle(point.x, point.y, 8 + p * l.dx * 0.7)
            .stroke({
              color: e.unit.kind === "curse" ? 0xc19afa : color,
              width: 3,
              alpha: 1 - p,
            });
          if (p > 0.5 && p < 0.56) this.burst(point.x, point.y, color, 3);
        });
        if (this.destroyed) return;
        ring.destroy();
        item.view.scale.set(1);
        item.view.alpha = 1;
        this.activeViews.delete(u.id);
      } else if (e.type === "move" || e.type === "approach") {
        const item = this.units.get(e.unitId);
        if (!item) continue;
        this.state.onPresentation(
          e.unit?.kind === "curse" ? "A maldição avança" : `${name} se move`,
        );
        this.activeViews.add(e.unitId);
        const path = [
          { x: item.view.x, y: item.view.y },
          ...(e.path || []).map(([x, y]: number[]) => l.point(x, y)),
        ];
        if (path.length < 2) {
          this.activeViews.delete(e.unitId);
          continue;
        }
        if (e.type === "approach") {
          const last = path.at(-1)!,
            first = path[0];
          path[path.length - 1] = {
            x: first.x + (last.x - first.x) * 0.3,
            y: first.y + (last.y - first.y) * 0.3,
          };
        }
        await this.animate(Math.min(1100, 360 * (path.length - 1)), (p) => {
          const f = p * (path.length - 1),
            i = Math.min(path.length - 2, Math.floor(f)),
            t = f - i,
            a = path[i],
            b = path[i + 1];
          item.view.position.set(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 7,
          );
        });
        if (this.destroyed) return;
        item.x = item.view.x;
        item.y = item.view.y;
        this.activeViews.delete(e.unitId);
      } else if (e.type === "combat") {
        this.state.onPresentation(`${e.keyword} · resolvendo dano`);
        const a = e.attacker,
          d = e.defender,
          ai = this.ensureUnit(a),
          di = this.ensureUnit(d),
          ap = { x: ai.view.x, y: ai.view.y },
          dp = { x: di.view.x, y: di.view.y };
        this.activeViews.add(a.id);
        this.activeViews.add(d.id);
        for (const [id, item] of this.units)
          item.view.alpha = id === a.id || id === d.id ? 1 : 0.38;
        const flash = new Graphics(),
          text = label(e.keyword, Math.min(23, l.dx * 0.29), color);
        text.anchor.set(0.5);
        text.position.set((ap.x + dp.x) / 2, (ap.y + dp.y) / 2 - l.dy * 0.75);
        this.fx.addChild(flash, text);
        let hitA = false,
          hitD = false;
        const quick = e.keyword === "Quick Attack";
        await this.animate(1450, (p) => {
          const strike = Math.sin(
              Math.min(1, p / (quick ? 0.35 : 0.48)) * Math.PI,
            ),
            counter =
              quick && p > 0.45
                ? Math.sin(Math.min(1, (p - 0.45) / 0.4) * Math.PI)
                : strike;
          ai.view.position.set(
            ap.x + (dp.x - ap.x) * strike * 0.3,
            ap.y + (dp.y - ap.y) * strike * 0.3,
          );
          di.view.position.set(
            dp.x + (ap.x - dp.x) * counter * 0.22,
            dp.y + (ap.y - dp.y) * counter * 0.22,
          );
          ai.view.scale.set(1 + strike * 0.15);
          di.view.scale.set(1 + counter * 0.12);
          const impact =
            p > 0.24 && p < 0.55 ? Math.sin(((p - 0.24) / 0.31) * Math.PI) : 0;
          flash
            .clear()
            .circle(
              (ap.x + dp.x) / 2,
              (ap.y + dp.y) / 2,
              l.dx * (0.2 + impact * 0.7),
            )
            .stroke({ color, width: 4, alpha: impact * 0.85 });
          if (p > 0.27 && !hitA) {
            hitA = true;
            di.hp = Math.max(0, d.hp - e.attackDamage);
            if (e.attackDamage > 0) this.damage(dp.x, dp.y, e.attackDamage);
            this.burst(dp.x, dp.y, color, 22);
            this.drawUnit(
              di.view,
              { ...d, hp: Math.max(0, d.hp - e.attackDamage) },
              Math.min(l.dx * 0.76, l.dy * 0.9),
            );
          }
          if (p > (quick ? 0.65 : 0.27) && !hitD) {
            hitD = true;
            ai.hp = Math.max(0, a.hp - e.defenseDamage);
            if (e.defenseDamage > 0) {
              this.damage(ap.x, ap.y, e.defenseDamage);
              this.burst(ap.x, ap.y, color, 15);
            }
            this.drawUnit(
              ai.view,
              { ...a, hp: Math.max(0, a.hp - e.defenseDamage) },
              Math.min(l.dx * 0.76, l.dy * 0.9),
            );
          }
          text.alpha = p > 0.78 ? (1 - p) / 0.22 : 1;
        });
        if (this.destroyed) return;
        flash.destroy();
        text.destroy();
        ai.view.scale.set(1);
        di.view.scale.set(1);
        ai.view.position.set(ap.x, ap.y);
        di.view.position.set(dp.x, dp.y);
        for (const [, item] of this.units) item.view.alpha = 1;
        this.activeViews.delete(a.id);
        this.activeViews.delete(d.id);
      } else if (e.type === "cast") {
        this.state.onPresentation(`${name} foi conjurada`);
        await this.showCard(
          e.cardId,
          {
            x: this.app.screen.width * 0.5,
            y: e.seat === this.state.seat ? this.app.screen.height - 65 : 30,
          },
          { x: this.app.screen.width - 135, y: 230 },
          650,
        );
      } else if (e.type === "spell") {
        this.state.onPresentation(`${name} resolve`);
        const target = this.units.get(e.targetId || ""),
          point = target
            ? { x: target.view.x, y: target.view.y }
            : typeof e.x === "number"
              ? l.point(e.x, e.y ?? 3)
              : { x: l.cx, y: l.cy };
        const ring = new Graphics();
        this.fx.addChild(ring);
        this.burst(point.x, point.y, color, 30);
        await this.animate(850, (p) => {
          ring
            .clear()
            .circle(point.x, point.y, 8 + p * l.dx)
            .stroke({ color, width: 4 * (1 - p) + 1, alpha: 1 - p });
          if (target) {
            target.view.scale.set(1 + Math.sin(p * Math.PI) * 0.1);
            target.view.tint = p < 0.45 ? color : 0xffffff;
          }
        });
        if (this.destroyed) return;
        ring.destroy();
        if (target && e.afterTarget && e.beforeTarget) {
          const diff = e.afterTarget.hp - e.beforeTarget.hp;
          if (diff !== 0) this.damage(point.x, point.y, -diff);
          target.hp = e.afterTarget.hp;
          this.drawUnit(
            target.view,
            e.afterTarget,
            Math.min(l.dx * 0.76, l.dy * 0.9),
          );
        }
        if (target) {
          target.view.scale.set(1);
          target.view.tint = 0xffffff;
        }
      }
    }
    if (this.destroyed) return;
    this.presenting = false;
    this.activeViews.clear();
    this.syncUnits(this.state);
    this.state.onPresentation(null, this.state.game.units);
  }
  private burst(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics()
        .circle(0, 0, 1 + Math.random() * 2)
        .fill({ color, alpha: 0.8 });
      g.position.set(x, y);
      this.fx.addChild(g);
      const a = Math.random() * Math.PI * 2,
        v = 1 + Math.random() * 2;
      this.sparks.push({
        view: g,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 35 + Math.random() * 20,
      });
    }
  }
  private damage(x: number, y: number, n: number) {
    const t = label(
      n < 0 ? `+${-n}` : `−${n}`,
      28,
      n < 0 ? 0x98ecc1 : 0xffb0a0,
    );
    t.anchor.set(0.5);
    t.position.set(x, y - 20);
    this.fx.addChild(t);
    let life = 70;
    const update = (dt: any) => {
      life -= dt.deltaTime;
      t.y -= dt.deltaTime * 0.5;
      t.alpha = Math.min(1, life / 25);
      if (life <= 0) {
        this.app.ticker.remove(update);
        t.destroy();
      }
    };
    this.app.ticker.add(update);
  }
  private tick(dt: number) {
    for (const [id, item] of this.units)
      if (this.drag?.id !== id && !this.activeViews.has(id)) {
        item.view.x += (item.x - item.view.x) * Math.min(1, dt * 0.18);
        item.view.y += (item.y - item.view.y) * Math.min(1, dt * 0.18);
      }
    for (const p of [...this.sparks]) {
      p.life -= dt;
      p.view.x += p.vx * dt;
      p.view.y += p.vy * dt;
      p.view.alpha = Math.min(1, p.life / 25);
      if (p.life <= 0) {
        p.view.destroy();
        this.sparks.splice(this.sparks.indexOf(p), 1);
      }
    }
    this.selectedPulse.clear();
    const selected = this.units.get(this.state.selectedId || "");
    if (selected) {
      const pulse = 0.6 + Math.sin(performance.now() / 280) * 0.15;
      const l = layout(this.app.screen.width, this.app.screen.height),
        r = Math.min(l.dx * 0.5, l.dy * 0.5);
      this.selectedPulse
        .ellipse(selected.view.x, selected.view.y, r, r * 0.85)
        .stroke({ color: 0xffdd91, alpha: pulse, width: 2 });
    }
  }
  destroy() {
    this.destroyed = true;
    for (const cancel of this.cancels) cancel();
    this.observer?.disconnect();
    if (this.app.renderer)
      this.app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      );
  }
}
