import { expireEffects } from "../effects.js";
import { type Game, type Seat } from "../model.js";
import { neighbors, valid, at } from "./board.js";
import { random } from "../random.js";
import { event, draw, alive, typesOf, adjacent } from "./core.js";
import { fight } from "./combat.js";
import { takeDamage, heal, summonEffects } from "./units.js";
import { spawnCurse } from "./curses.js";

function moveCurses(g: Game) {
  const distance = (sx: number, sy: number, tx: number, ty: number) => {
    const q = [[sx, sy, 0]],
      seen = new Set<string>();
    while (q.length) {
      const [x, y, d] = q.shift()!;
      if (x === tx && y === ty) return d;
      for (const [nx, ny] of neighbors(x, y)) {
        const k = `${nx},${ny}`;
        if (!seen.has(k)) {
          seen.add(k);
          q.push([nx, ny, d + 1]);
        }
      }
    }
    return Infinity;
  };
  for (const c of g.units.filter(
    (u) => u.kind === "curse" && u.summonedTurn < g.turn && u.speed > 0,
  )) {
    const steps = c.speed;
    for (let step = 0; step < steps && alive(g, c); step++) {
      const targets = g.units.filter((u) => u.kind === "omionji");
      if (!targets.length) continue;
      const options = neighbors(c.x, c.y)
        .filter(([x, y]) => valid(x, y))
        .map(([x, y]) => ({
          x,
          y,
          d: Math.min(...targets.map((t) => distance(x, y, t.x, t.y))),
          center: Math.abs(x - 3) + Math.abs(y - 3),
          roll: random(g.random),
        }))
        .sort((a, b) => a.d - b.d || a.center - b.center || a.roll - b.roll);
      const target = options[0];
      if (!target) continue;
      const enemy = at(g, target.x, target.y);
      event(g, {
        type: enemy ? "approach" : "move",
        unit: { ...c, x: enemy ? c.x : target.x, y: enemy ? c.y : target.y },
        unitId: c.id,
        path: [[target.x, target.y]],
      });
      if (!enemy || fight(g, c, enemy)) {
        c.x = target.x;
        c.y = target.y;
      }
      if (g.winner !== null || g.draw) break;
      if (enemy) break;
    }
    if (g.winner !== null || g.draw) break;
  }
}

export function startTurn(g: Game) {
  g.phase = 1;
  g.phaseOwner = g.first;
  g.priority = g.first;
  g.passes = 0;
  event(g, { type: "turn", phase: 0 });
  g.moved = [];
  g.moveCounts = [0, 0];
  g.actions = 0;
  for (const p of g.players) {
    p.maxPe = 1 + Math.floor((g.turn - 1) / 2);
    p.pe = p.maxPe;
    draw(p);
  }
  for (const item of [...g.pending])
    if (item.returnTurn <= g.turn) {
      const u = item.unit;
      if (at(g, u.x, u.y)) {
        g.players[u.owner].hand.push(u.cardId);
        if (u.cardId === "anubis-o-gato-da-morte")
          g.players[u.owner].resurrectedAnubis = true;
      } else {
        u.summonedTurn = g.turn;
        g.units.push(u);
        summonEffects(g, u);
      }
      g.pending = g.pending.filter((x) => x !== item);
    }
  for (const u of [...g.units]) {
    if (!alive(g, u)) continue;
    const st = (u.statuses ??= {});
    if ((st.ephemeralUntil ?? Infinity) < g.turn) {
      g.units = g.units.filter((x) => x.id !== u.id);
      continue;
    }
    if ((st.dualUntil ?? Infinity) < g.turn) {
      u.attack = st.dualAttack ?? u.attack;
      u.speed = st.dualSpeed ?? u.speed;
      st.speedLoss = st.dualSpeedLoss || 0;
      st.speedLossSources = st.dualSpeedLossSources || [];
      delete st.dualSpeedLoss;
      delete st.dualSpeedLossSources;
      u.maxHp = st.dualMaxHp ?? u.maxHp;
      u.hp = Math.min(u.hp, u.maxHp);
      delete st.dualUntil;
    }
    if ((st.temporaryUntil ?? Infinity) < g.turn) {
      u.attack -= st.temporaryAttack || 0;
      delete st.temporaryAttack;
      delete st.temporaryUntil;
    }
    expireEffects(st, g.turn);
    if (st.burn && (st.burnUntil ?? -Infinity) >= g.turn)
      takeDamage(g, u, st.burn);
    else delete st.burn;
    // Death triggers can remove this unit before its remaining turn effects.
    if (!alive(g, u)) continue;
    if (st.controlTurn === g.turn && st.controlOwner !== undefined) {
      u.owner = st.controlOwner;
      delete st.controlTurn;
    }
    if (u.cardId === "potaru") st.shield = true;
    if (
      u.cardId === "shidaro-o-samurai-do-profundo" &&
      Number(st.shidaroBoost || 0) < 2 &&
      g.units.some(
        (x) =>
          x.id !== u.id &&
          x.owner === u.owner &&
          typesOf(x).includes("agua") &&
          adjacent(u, x),
      )
    ) {
      u.speed++;
      st.shidaroBoost = Number(st.shidaroBoost || 0) + 1;
    }
    if (u.equipment?.some((e) => e.cardId === "suineko-o-gato-aquatico"))
      heal(g, u, 1);
    if (u.cardId === "ichiki-o-despertar-do-elemento")
      for (const other of [...g.units].filter((x) => adjacent(u, x)))
        takeDamage(g, other, 2, u);
  }
  if (g.turn === 3) {
    for (const owner of [0, 1] as Seat[]) {
      spawnCurse(g, owner, 1);
    }
    g.centerPending = true;
    g.centerChoices = {};
  } else if (g.turn > 3) moveCurses(g);
}

export function endMovement(g: Game, seat: Seat) {
  for (const u of g.units.filter((u) => u.owner === seat)) {
    if (u.cardId === "taodu-ferreiro")
      for (const t of g.units.filter(
        (t) =>
          t.owner === seat &&
          t.kind === "unit" &&
          /taodu/.test(t.cardId) &&
          t.id !== u.id &&
          adjacent(t, u) &&
          !t.statuses?.forged,
      )) {
        t.attack++;
        t.maxHp++;
        t.hp++;
        t.speed++;
        (t.statuses ??= {}).forged = true;
      }
  }
}

export function endTurn(g: Game) {
  for (const u of [...g.units]) {
    if (u.x === 3 && u.y === 3 && !u.statuses?.centerBonus) {
      u.speed++;
      (u.statuses ??= {}).centerBonus = true;
    }
    if (
      u.cardId === "gaviao-analista" &&
      !g.moved.includes(u.id) &&
      u.summonedTurn < g.turn
    )
      g.players[u.owner].permanentPe = Math.min(
        3,
        g.players[u.owner].permanentPe + 1,
      );
    if (
      u.cardId === "dai-tengu" &&
      g.units.some(
        (t) =>
          t.owner === u.owner && typesOf(t).includes("agua") && adjacent(u, t),
      )
    )
      heal(g, u, 1);
    if (u.cardId === "taodu-curador")
      for (const t of g.units.filter(
        (t) =>
          t.kind === "unit" &&
          t.owner === u.owner &&
          typesOf(t).some((e) => ["vento", "fogo"].includes(e)) &&
          adjacent(t, u),
      ))
        heal(g, t, 1);
    const fire = g.terrain.find(
      (t) => t.kind === "fire" && t.x === u.x && t.y === u.y,
    );
    if (fire) {
      if (typesOf(u).includes("fogo")) heal(g, u, 1);
      else takeDamage(g, u, 1);
    }
  }
  g.terrain = g.terrain.filter(
    (t) => t.until === undefined || t.until > g.turn,
  );
}

export function enterPhase(g: Game) {
  if (g.phase === 2)
    for (const u of g.units) {
      if (
        u.cardId === "besouro-pescador" &&
        g.units.some(
          (t) =>
            t.kind === "unit" && typesOf(t).includes("terra") && adjacent(u, t),
        )
      ) {
        u.speed++;
        (u.statuses ??= {}).fisherBoost =
          Number(u.statuses?.fisherBoost || 0) + 1;
      }
    }
  if (g.phase === 3)
    for (const u of g.units.filter((u) => u.cardId === "samurai-afogado"))
      for (const t of g.units.filter(
        (t) =>
          t.owner === u.owner && typesOf(t).includes("agua") && adjacent(t, u),
      ))
        heal(g, t, 1);
}

export function refreshAuras(g: Game) {
  for (const u of g.units) {
    const st = (u.statuses ??= {});
    if (u.cardId === "usagi-selvagem") {
      const n = g.units.some(
          (t) =>
            t.id !== u.id &&
            t.owner === u.owner &&
            typesOf(t).includes("terra") &&
            adjacent(t, u),
        )
          ? 1
          : 0,
        diff = n - Number(st.auraHp || 0);
      u.maxHp += diff;
      u.hp = Math.min(u.maxHp, u.hp + Math.max(0, diff));
      st.auraHp = n;
    }
    if (u.cardId === "tigre-roxo") {
      const n = g.units.some(
        (t) => t.id !== u.id && /tigre-(carmesim|cinza)/.test(t.cardId),
      )
        ? 1
        : 0;
      u.speed += n - Number(st.auraSpeed || 0);
      st.auraSpeed = n;
    }
  }
}
