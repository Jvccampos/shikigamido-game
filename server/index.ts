import { app, mutation, query, string, table, json } from "sited/server";
import catalog from "../data/cards.json" with { type: "json" };

type Seat = 0 | 1;
type DeckInput = {
  name: string;
  element: string;
  cardIds: string[];
  omionji: string;
};
type Player = {
  id: string;
  element: string;
  library: string[];
  hand: string[];
  discard: string[];
  pe: number;
  maxPe: number;
  permanentPe: number;
  mulligan: boolean;
  costTaxUntil?: number;
  concealTurn?: number;
};
type Unit = {
  id: string;
  cardId: string;
  owner: Seat;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  summonedTurn: number;
  kind: "unit" | "omionji" | "curse" | "crystal" | "wall";
  level?: number;
  statuses?: Record<string, number | boolean>;
};
type Game = {
  turn: number;
  phase: number;
  priority: Seat;
  first: Seat;
  players: [Player, Player];
  units: Unit[];
  pending: { unit: Unit; returnTurn: number }[];
  stack: { seat: Seat; cardId: string; targetId?: string; targetId2?: string; x?: number; y?: number; extraPe?: number }[];
  terrain: { kind: "lake" | "wind"; x: number; y: number; owner: Seat }[];
  passes: number;
  moved: string[];
  actions: number;
  winner: Seat | null;
  log: string[];
};
type Cmd = {
  type: string;
  cardId?: string;
  unitId?: string;
  targetId?: string;
  targetId2?: string;
  x?: number;
  y?: number;
  extraPe?: number;
  cardIds?: string[];
};
const elements = ["agua", "fogo", "terra", "vento", "vazio"];
const phases = ["Compra", "Invocação", "Movimento", "Magia", "Descarte"];
const allCards = catalog.cards as any[];
const cards = new Map(allCards.map((c) => [c.id, c]));
const clean = (v: unknown, n = 80) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
const requireUser = (ctx: any) => {
  if (!ctx.auth.userId) throw new Error("Entre com Google para continuar.");
  return ctx.auth.userId as string;
};
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const shuffle = (a: string[]) => {
  const b = [...a];
  for (let i = b.length - 1; i; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const draw = (p: Player, n = 1) => {
  while (n-- && p.library.length) p.hand.push(p.library.shift()!);
};
const spend = (p: Player, cost: number) => {
  if (p.pe + p.permanentPe < cost) return false;
  const normal = Math.min(p.pe, cost);
  p.pe -= normal;
  p.permanentPe -= cost - normal;
  return true;
};
const at = (g: Game, x: number, y: number) =>
  g.units.find((u) => u.x === x && u.y === y);
const uid = () => Math.random().toString(36).slice(2, 10);
const rows: Record<number, number[]> = {
  0: [0, 1, 2, 3, 4, 5, 6],
  1: [0, 1, 3, 5, 6],
  2: [0, 1, 2, 3, 4, 5, 6],
  3: [0, 1, 2, 3, 4, 5, 6],
  4: [0, 1, 2, 3, 4, 5, 6],
  5: [0, 1, 3, 5, 6],
  6: [0, 1, 2, 3, 4, 5, 6],
};
const valid = (x: number, y: number) => rows[y]?.includes(x) ?? false;
const diag = new Set([
  "0,0:1,1",
  "6,0:5,1",
  "1,1:2,2",
  "5,1:4,2",
  "2,2:3,3",
  "4,2:3,3",
  "3,3:2,4",
  "3,3:4,4",
  "2,4:1,5",
  "4,4:5,5",
  "1,5:0,6",
  "5,5:6,6",
]);
function linked(ax: number, ay: number, bx: number, by: number) {
  if (!valid(ax, ay) || !valid(bx, by)) return false;
  const key = `${ax},${ay}:${bx},${by}`,
    rev = `${bx},${by}:${ax},${ay}`;
  if (diag.has(key) || diag.has(rev)) return true;
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
  return rows[ay].includes(bx) && rows[by].includes(ax);
}
function neighbors(x: number, y: number) {
  const out: [number, number][] = [];
  for (let yy = 0; yy < 7; yy++)
    for (const xx of rows[yy]) if (linked(x, y, xx, yy)) out.push([xx, yy]);
  return out;
}
function pathLength(
  g: Game,
  from: Unit,
  tx: number,
  ty: number,
  ignoreTarget = true,
) {
  const q: [[number, number], number][] = [[[from.x, from.y], 0]],
    seen = new Set([`${from.x},${from.y}`]);
  while (q.length) {
    const [[x, y], d] = q.shift()!;
    if (x === tx && y === ty) return d;
    for (const [nx, ny] of neighbors(x, y)) {
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      const occupied = at(g, nx, ny);
      if (
        occupied &&
        (from.kind === "curse" || occupied.owner !== from.owner) &&
        !(ignoreTarget && nx === tx && ny === ty)
      )
        continue;
      seen.add(k);
      q.push([[nx, ny], d + 1]);
    }
  }
  return Infinity;
}

function validateDeck(input: any) {
  if (!input || typeof input !== "object") return "Dados inválidos.";
  if (!elements.includes(input.element)) return "Elemento inválido.";
  if (!Array.isArray(input.cardIds) || input.cardIds.length !== 30)
    return "O baralho deve ter 30 cartas.";
  const set = input.cardIds
    .map((id: string) => cards.get(id))
    .filter(Boolean) as any[];
  if (set.length !== 30) return "Carta desconhecida.";
  if (set.filter((c) => c.types.includes(input.element)).length < 20)
    return "Ao menos 20 cartas devem conter o elemento principal.";
  if (set.some((c) => c.kind === "spell" && !c.types.includes(input.element)))
    return "Toda magia deve conter o elemento principal.";
  return null;
}
function makePlayer(id: string, d: any): Player {
  const library = shuffle(d.cardIds as string[]);
  const p = {
    id,
    element: d.element,
    library,
    hand: [],
    discard: [],
    pe: 1,
    maxPe: 1,
    permanentPe: 0,
    mulligan: false,
  };
  draw(p, 6);
  return p;
}
function omionji(owner: Seat, element: string): Unit {
  return {
    id: `o${owner}`,
    cardId: `omionji-${element}`,
    owner,
    x: owner ? 6 : 0,
    y: owner ? 4 : 2,
    hp: 12,
    maxHp: 12,
    attack: 2,
    speed: 2,
    summonedTurn: 0,
    kind: "omionji",
    statuses: {},
  };
}
function crystal(owner: Seat, n: number): Unit {
  return {
    id: `c${owner}${n}`,
    cardId: "cristal-invocacao",
    owner,
    x: owner ? 6 : 0,
    y: n ? 5 : 1,
    hp: 3,
    maxHp: 3,
    attack: 0,
    speed: 0,
    summonedTurn: 0,
    kind: "crystal",
    statuses: {},
  };
}
function freshGame(hostId: string, guestId: string, a: any, b: any): Game {
  const first = (Math.random() < 0.5 ? 0 : 1) as Seat;
  return {
    turn: 1,
    phase: 0,
    priority: first,
    first,
    players: [makePlayer(hostId, a), makePlayer(guestId, b)],
    units: [
      omionji(0, a.element),
      omionji(1, b.element),
      crystal(0, 0),
      crystal(0, 1),
      crystal(1, 0),
      crystal(1, 1),
    ],
    pending: [],
    stack: [],
    terrain: [],
    passes: 0,
    moved: [],
    actions: 0,
    winner: null,
    log: [
      `Jogador ${first + 1} inicia. Ambos compraram 6 cartas; mulligan único disponível.`,
    ],
  };
}
function cardOf(u: Unit) {
  return cards.get(u.cardId) as any;
}
function keyword(text: string, name: string) {
  const m = text.match(new RegExp(`${name}\\s*(\\d+)?`, "i"));
  return m ? Number(m[1] || 1) : 0;
}
function elementalDamage(attacker: Unit, defender: Unit) {
  const ac = cardOf(attacker),
    dc = cardOf(defender);
  let dmg = attacker.attack;
  if (!ac || !dc || keyword(dc.effect_text || "", "Amaldiçoado"))
    return Math.max(0, Math.min(Number(attacker.statuses?.damageCap || Infinity), dmg - keyword(dc?.effect_text || "", "Block") - Number(defender.statuses?.block || 0)));
  const ring = ["vazio", "vento", "agua", "terra", "fogo"];
  for (const a of ac.types || []) {
    for (const d of dc.types || []) {
      const ai = ring.indexOf(a),
        di = ring.indexOf(d);
      if (di === (ai + 2) % 5) dmg++;
      if (di === (ai + 1) % 5) dmg--;
    }
  }
  return Math.max(0, Math.min(Number(attacker.statuses?.damageCap || Infinity), dmg - keyword(dc.effect_text || "", "Block") - Number(defender.statuses?.block || 0)));
}
function destroy(g: Game, u: Unit, killer?: Unit) {
  g.units = g.units.filter((x) => x.id !== u.id);
  if (u.kind === "omionji") {
    g.winner = (1 - u.owner) as Seat;
    g.log.push(`O Omionji do Jogador ${u.owner + 1} foi derrotado.`);
    return;
  }
  if (u.kind === "crystal") {
    g.log.push(
      `Um Cristal de Invocação do Jogador ${u.owner + 1} foi destruído.`,
    );
    return;
  }
  if (u.kind === "curse") {
    const next = Math.min(3, (u.level || 1) + 1);
    g.units.push({
      id: uid(),
      cardId: `maldicao-${next}`,
      owner: u.owner,
      x: u.owner ? 6 : 0,
      y: 3,
      hp: 3 + next * 3,
      maxHp: 3 + next * 3,
      attack: next + 1,
      speed: 1,
      summonedTurn: g.turn,
      kind: "curse",
      level: next,
      statuses: {},
    });
    g.log.push(`Maldição derrotada: nível ${next} invocado.`);
    return;
  }
  const p = g.players[u.owner];
  p.discard.push(u.cardId);
  const resurrect = Math.max(keyword(cardOf(u)?.effect_text || "", "Ressurgir"), Number(u.statuses?.ressurgir || 0));
  if (resurrect) {
    p.discard.splice(p.discard.lastIndexOf(u.cardId), 1);
    (g.pending ??= []).push({ unit: { ...u, hp: u.maxHp, statuses: {} }, returnTurn: g.turn + resurrect });
    g.log.push(`${cardOf(u)?.name || "Uma unidade"} ressurgirá em ${resurrect} turno(s).`);
  }
  if (killer && keyword(cardOf(killer)?.effect_text || "", "Alimentar")) {
    killer.attack++;
    killer.maxHp++;
    killer.hp++;
    killer.speed = Math.min(killer.speed + 1, 4);
  }
}
function fight(g: Game, a: Unit, d: Unit) {
  if (a.statuses?.hidden || d.statuses?.hidden) {
    delete a.statuses?.hidden;
    delete d.statuses?.hidden;
    g.log.push("Uma carta oculta foi revelada ao entrar em combate.");
  }
  const atxt = cardOf(a)?.effect_text || "",
    dtxt = cardOf(d)?.effect_text || "";
  const ad = elementalDamage(a, d),
    dd = elementalDamage(d, a) + Number(d.statuses?.devolver || 0);
  const quick = keyword(atxt, "Quick Attack") > 0,
    slow = keyword(dtxt, "Slow Defense") > 0;
  g.log.push(
    `${cardOf(a)?.name || "Omionji"} enfrenta ${cardOf(d)?.name || "Omionji"}: ${ad} / ${dd} de dano.`,
  );
  if (d.statuses?.shield) {
    d.statuses.shield = false;
    g.log.push("O Escudo do defensor absorveu o combate.");
  } else d.hp -= ad;
  if (d.hp <= 0) destroy(g, d, a);
  if ((!quick && !slow) || d.hp > 0) {
    if (a.statuses?.shield) {
      a.statuses.shield = false;
      g.log.push("O Escudo do atacante foi consumido.");
    } else a.hp -= dd;
    if (a.hp <= 0) destroy(g, a, d);
  }
  const life = Math.max(keyword(atxt, "Lifesteal"), Number(a.statuses?.lifesteal || 0));
  if (life && a.hp > 0) a.hp = Math.min(a.maxHp, a.hp + Math.min(life, ad));
  const burn = Math.max(keyword(atxt, "Burn"), Number(a.statuses?.burnAttack || 0));
  if (burn && d.hp > 0) (d.statuses ??= {}).burn = burn;
  return d.hp <= 0 && a.hp > 0;
}
function moveCurses(g: Game) {
  for (const c of g.units.filter(
    (u) => u.kind === "curse" && u.summonedTurn < g.turn,
  )) {
    const targets = g.units.filter((u) => u.kind === "omionji");
    targets.sort(
      (a, b) => pathLength(g, c, a.x, a.y) - pathLength(g, c, b.x, b.y),
    );
    const t = targets[0];
    if (!t) continue;
    const options = neighbors(c.x, c.y).sort(
      (a, b) =>
        pathLength(g, { ...c, x: a[0], y: a[1] }, t.x, t.y) +
        Math.abs(a[0] - 3) -
        pathLength(g, { ...c, x: b[0], y: b[1] }, t.x, t.y) -
        Math.abs(b[0] - 3),
    );
    const [x, y] = options[0];
    const enemy = at(g, x, y);
    if (enemy) fight(g, c, enemy);
    else {
      c.x = x;
      c.y = y;
    }
    g.log.push(
      `Maldição Nv ${c.level} moveu automaticamente para ${x + 1},${y + 1}.`,
    );
  }
}
function startTurn(g: Game) {
  g.moved = [];
  g.actions = 0;
  for (const p of g.players) {
    p.maxPe = Math.min(10, 1 + Math.floor((g.turn - 1) / 2));
    p.pe = p.maxPe;
    draw(p);
  }
  for (const pending of [...(g.pending || [])]) {
    if (pending.returnTurn > g.turn) continue;
    const u = pending.unit;
    if (at(g, u.x, u.y)) g.players[u.owner].hand.push(u.cardId);
    else {
      u.summonedTurn = g.turn;
      g.units.push(u);
    }
    g.pending = g.pending.filter((x) => x !== pending);
    g.log.push(`${cardOf(u)?.name || "Uma unidade"} retornou por Ressurgir.`);
  }
  for (const u of [...g.units]) {
    if (Number(u.statuses?.ephemeralUntil || Infinity) < g.turn) {
      destroy(g, u);
      continue;
    }
    if (u.statuses?.dualAttack) {
      u.attack = Number(u.statuses.dualAttack);
      u.maxHp = Number(u.statuses.dualMaxHp || u.maxHp);
      u.hp = Math.min(u.hp, u.maxHp);
      delete u.statuses.dualAttack;
      delete u.statuses.dualMaxHp;
    }
    if (u.statuses?.temporaryAttack) {
      u.attack -= Number(u.statuses.temporaryAttack);
      delete u.statuses.temporaryAttack;
    }
    delete u.statuses?.damageCap;
    delete u.statuses?.lifesteal;
    delete u.statuses?.range;
    delete u.statuses?.intangivel;
    const burn = Number(u.statuses?.burn || 0);
    if (burn) {
      u.hp -= burn;
      if (u.hp <= 0) destroy(g, u);
    }
    if (u.statuses?.stun)
      u.statuses.stun = Math.max(0, Number(u.statuses.stun) - 1);
  }
  if (g.turn === 3) {
    for (const owner of [0, 1] as Seat[])
      g.units.push({
        id: uid(),
        cardId: "maldicao-1",
        owner,
        x: owner ? 4 : 0,
        y: 3,
        hp: 6,
        maxHp: 6,
        attack: 2,
        speed: 1,
        summonedTurn: 3,
        kind: "curse",
        level: 1,
        statuses: {},
      });
    g.log.push("O centro abriu e duas Maldições Nv 1 foram invocadas.");
  } else if (g.turn > 3) moveCurses(g);
  g.log.push(`Turno ${g.turn}: PE restaurado; ambos compram 1 carta.`);
}
function resolveSpell(g: Game, seat: Seat, cardId: string, targetId?: string, targetId2?: string, x?: number, y?: number, extraPe = 0) {
  const p = g.players[seat], card = cards.get(cardId) as any;
  if (!card) return;
  const t = g.units.find((x) => x.id === targetId), t2 = g.units.find((x) => x.id === targetId2), text = card.effect_text as string;
  let handled = false;
  if (card.id === "mamoru-n-12-negacao") {
    const cancelled = (g.stack ??= []).pop();
    if (cancelled) g.log.push(`${(cards.get(cancelled.cardId) as any)?.name || "A magia"} foi anulada.`);
    handled = true;
  } else if (card.id === "gishiki-n-13-fardo-espiritual") {
    g.players[(1 - seat) as Seat].costTaxUntil = g.turn + 1; handled = true;
  } else if (card.id === "gishiki-n-4-manto-da-escuridao") {
    p.concealTurn = g.turn + 1; handled = true;
  } else if (card.id === "kogeki-n-1-golpe-do-vazio") { draw(p, 2); handled = true; }
  else if (card.id === "gishiki-n-10-invocar-espiritos") {
    const pick = p.discard.find((id) => { const found = cards.get(id) as any; return found?.kind === "unit" && found.types.includes("vazio"); });
    if (pick) { p.discard.splice(p.discard.indexOf(pick), 1); p.hand.push(pick); }
    draw(p); handled = true;
  } else if (card.id === "ritual-do-gato-sete-vidas") {
    const pick = p.discard.find((id) => /gato/i.test((cards.get(id) as any)?.name || ""));
    if (pick) { p.discard.splice(p.discard.indexOf(pick), 1); p.hand.push(pick); }
    handled = true;
  } else if (card.id === "kogekido-n-42-obliterar" && t?.kind === "unit") { destroy(g, t); handled = true; }
  else if (card.id === "gishiki-n-20-tributo" && t?.kind === "unit" && t.owner === seat) { destroy(g, t); draw(p, 2); handled = true; }
  else if (card.id === "kogekido-n-40-suspiro-final" && t?.kind === "unit" && t.owner === seat) {
    const around = g.units.filter((u) => u.id !== t.id && linked(t.x, t.y, u.x, u.y)); destroy(g, t);
    for (const u of around) { u.hp--; if (u.hp <= 0) destroy(g, u); } handled = true;
  } else if (card.id === "gishikido-n-7-cura-da-agua" && t) {
    for (const u of g.units.filter((u) => linked(t.x, t.y, u.x, u.y))) u.hp = Math.min(u.maxHp, u.hp + 2); handled = true;
  } else if (card.id === "gishiki-n-20-transferencia-vital" && t) {
    const count = p.discard.filter((id) => (cards.get(id) as any)?.types?.includes("terra")).length;
    t.attack += count; (t.statuses ??= {}).temporaryAttack = count; handled = true;
  } else if (card.id === "mamoru-n-7-dispersar" && t) {
    t.statuses = {}; const base = cardOf(t);
    if (base?.kind === "unit") { t.attack = base.stats.attack; t.speed = base.stats.speed; t.maxHp = base.stats.health; t.hp = Math.min(t.hp, t.maxHp); } handled = true;
  } else if (card.id === "kogeki-n-2-dualidade" && t?.kind === "unit") {
    const spot = neighbors(t.x, t.y).find(([nx, ny]) => !at(g, nx, ny));
    if (spot) {
      (t.statuses ??= {}).dualAttack = t.attack; t.statuses.dualMaxHp = t.maxHp;
      t.attack = Math.ceil(t.attack / 2); t.maxHp = Math.ceil(t.maxHp / 2); t.hp = Math.min(t.hp, t.maxHp);
      g.units.push({ ...t, id: uid(), x: spot[0], y: spot[1], hp: t.hp, statuses: { ...(t.statuses || {}), ephemeralUntil: g.turn + 1 } });
    }
    handled = true;
  } else if ((card.id === "kogeki-n-9-sacrificio" || card.id === "duelo-de-fogo") && t && t2) {
    fight(g, t, t2); handled = true;
  } else if (card.id === "mamoru-n-1-pes-ligeiros" && t?.owner === seat && typeof x === "number" && typeof y === "number") {
    if (valid(x, y) && !at(g, x, y) && linked(t.x, t.y, x, y)) { t.x = x; t.y = y; }
    handled = true;
  } else if (card.id === "mamoru-n-9-wonder-wall" && typeof x === "number" && typeof y === "number") {
    if (valid(x, y) && !at(g, x, y)) g.units.push({ id: uid(), cardId: "wonder-wall", owner: seat, x, y, hp: 1 + extraPe, maxHp: 1 + extraPe, attack: 0, speed: 0, summonedTurn: g.turn, kind: "wall", statuses: {} });
    handled = true;
  } else if ((card.id === "magia-de-sangue" || card.id === "ventos-favoraveis") && typeof x === "number" && typeof y === "number" && valid(x, y)) {
    (g.terrain ??= []).push({ kind: card.id === "magia-de-sangue" ? "lake" : "wind", x, y, owner: seat }); handled = true;
  } else if (t) {
    const statuses: Record<string, [string, number | boolean]> = {
      "gishiki-n-16-ponte-magica":["construir",true],"gishiki-n-17-renascer":["ressurgir",2],"gishikido-n-2-bencao-do-vento":["block",1],"gishikido-n-22-garras-de-fogo":["burnAttack",1],"mamoru-n-18-pele-de-ourico":["devolver",2],"mamoru-n-21-intocavel":["shield",true],"mamoru-n-5-prisao-do-inferno":["stun",1],"gishiki-n-3-intangibilidade":["intangivel",true],"kogeki-n-1-fireball":["range",2],"shikigami-de-agua-vibora-bolha":["lifesteal",2],
    };
    const status = statuses[card.id];
    if (status) { (t.statuses ??= {})[status[0]] = status[1]; if (card.id === "shikigami-de-agua-vibora-bolha") { t.statuses.range = 1; t.statuses.damageCap = 2; } handled = true; }
  }
  if (t && !handled) {
    const heal = text.match(/(?:Cure|Recupere).*?(\d+)/i), damage = text.match(/(?:d[eê]|dano).*?(\d+)/i);
    if (heal) t.hp = Math.min(t.maxHp, t.hp + Number(heal[1]));
    else if (damage) { t.hp -= Number(damage[1]); if (t.hp <= 0) destroy(g, t); }
  }
  g.log.push(`${card.name} resolveu.`);
}
function apply(g: Game, seat: Seat, c: Cmd) {
  const p = g.players[seat];
  if (c.type === "mulligan") {
    if (g.turn !== 1 || p.mulligan) return "Mulligan indisponível.";
    const ids = Array.isArray(c.cardIds)
      ? c.cardIds.filter((id) => p.hand.includes(id)).slice(0, 6)
      : [];
    p.hand = p.hand.filter((id) => !ids.includes(id));
    p.library = shuffle([...p.library, ...ids]);
    draw(p, ids.length);
    p.mulligan = true;
    g.log.push(`Jogador ${seat + 1} refez ${ids.length} carta(s).`);
    return;
  }
  if (c.type === "summon") {
    if (g.phase !== 1) return "Invoque apenas na fase de Invocação.";
    const card = cards.get(c.cardId || "") as any;
    if (!card || card.kind !== "unit" || !p.hand.includes(card.id))
      return "Unidade inválida.";
    if (
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      !valid(c.x, c.y) ||
      at(g, c.x, c.y)
    )
      return "Casa ocupada ou inválida.";
    const living = g.units.filter(
      (u) => u.kind === "crystal" && u.owner === seat,
    );
    if (!living.some((cr) => linked(cr.x, cr.y, c.x!, c.y!)))
      return "Invoque em uma casa ligada a um cristal vivo.";
    const tax = p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0;
    if (!spend(p, card.stats.cost + tax)) return `PE insuficiente${tax ? " (Fardo Espiritual: +1)" : ""}.`;
    p.hand.splice(p.hand.indexOf(card.id), 1);
    g.units.push({
      id: uid(),
      cardId: card.id,
      owner: seat,
      x: c.x,
      y: c.y,
      hp: card.stats.health,
      maxHp: card.stats.health,
      attack: card.stats.attack,
      speed: card.stats.speed,
      summonedTurn: g.turn,
      kind: "unit",
      statuses: { shield: keyword(card.effect_text, "Escudo") > 0, hidden: p.concealTurn === g.turn },
    });
    g.log.push(`Jogador ${seat + 1} invocou ${card.name}.`);
    return;
  }
  if (c.type === "move") {
    if (g.phase !== 2) return "Movimente apenas na fase de Movimento.";
    const u = g.units.find((x) => x.id === c.unitId && x.owner === seat);
    if (!u || u.kind === "curse" || u.kind === "crystal")
      return "Unidade inválida.";
    if (u.summonedTurn === g.turn)
      return "Unidades não movem no turno em que foram invocadas.";
    if (g.moved.includes(u.id)) return "Essa unidade já se moveu.";
    if (u.statuses?.stun) return "Essa unidade está atordoada.";
    if (typeof c.x !== "number" || typeof c.y !== "number" || !valid(c.x, c.y))
      return "Destino inválido.";
    if (pathLength(g, u, c.x, c.y) > u.speed)
      return "Não existe caminho dentro da Velocidade da unidade.";
    if (g.actions >= 2 && !spend(p, 1))
      return "Mover uma terceira carta custa 1 PE.";
    const target = at(g, c.x, c.y);
    const ox = u.x,
      oy = u.y;
    if (target && target.owner === seat) return "Casa ocupada por aliado.";
    if (target) {
      const won = fight(g, u, target);
      if (won) {
        u.x = c.x;
        u.y = c.y;
      } else {
        u.x = ox;
        u.y = oy;
      }
    } else {
      u.x = c.x;
      u.y = c.y;
    }
    const terrain = (g.terrain || []).find((z) => z.x === u.x && z.y === u.y);
    if (terrain?.kind === "lake") {
      const uc = cardOf(u);
      if (uc?.types?.includes("agua")) u.hp = Math.min(u.maxHp, u.hp + 1);
      if (uc?.types?.includes("fogo")) { u.hp--; if (u.hp <= 0) destroy(g, u); }
    }
    g.moved.push(u.id);
    g.actions++;
    return;
  }
  if (c.type === "cast") {
    const card = cards.get(c.cardId || "") as any;
    if (!card || card.kind !== "spell" || !p.hand.includes(card.id))
      return "Magia inválida.";
    if (card.stats.speed === "slow" && g.phase !== 3)
      return "Magia lenta apenas na fase de Magia.";
    const extraPe = card.id === "mamoru-n-9-wonder-wall" ? Math.max(0, Math.min(9, Number(c.extraPe || 0))) : 0;
    const tax = p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0;
    if (!spend(p, card.stats.cost + tax + extraPe)) return `PE insuficiente${tax ? " (Fardo Espiritual: +1)" : ""}.`;
    p.hand.splice(p.hand.indexOf(card.id), 1);
    p.discard.push(card.id);
    if (card.stats.speed !== "instant") {
      (g.stack ??= []).push({ seat, cardId: card.id, targetId: c.targetId, targetId2: c.targetId2, x: c.x, y: c.y, extraPe });
      g.passes = 0;
      g.priority = (1 - seat) as Seat;
      g.log.push(`${card.name} foi ativada; Jogador ${g.priority + 1} pode responder.`);
      return;
    }
    resolveSpell(g, seat, card.id, c.targetId, c.targetId2, c.x, c.y, extraPe);
    g.log.push(`${card.name} foi instantânea e não abriu resposta.`);
    return;
  }
  if (c.type === "discard") {
    if (g.phase !== 4) return "Descarte apenas na fase de Descarte.";
    if (!c.cardId || !p.hand.includes(c.cardId)) return "Carta inválida.";
    if (p.permanentPe >= 3) return "Máximo de 3 PE permanentes.";
    p.hand.splice(p.hand.indexOf(c.cardId), 1);
    p.discard.push(c.cardId);
    p.permanentPe++;
    return;
  }
  if (c.type === "concede") {
    g.winner = (1 - seat) as Seat;
    g.log.push(`Jogador ${seat + 1} concedeu.`);
    return;
  }
  if (c.type !== "pass") return "Comando inválido.";
  if ((g.stack ??= []).length) {
    g.passes = (g.passes || 0) + 1;
    g.log.push(`Jogador ${seat + 1} passou a prioridade (${g.passes}/2).`);
    if (g.passes < 2) {
      g.priority = (1 - seat) as Seat;
      return;
    }
    const top = g.stack.pop()!;
    g.passes = 0;
    resolveSpell(g, top.seat, top.cardId, top.targetId, top.targetId2, top.x, top.y, top.extraPe);
    g.priority = g.stack.length ? ((1 - g.stack[g.stack.length - 1].seat) as Seat) : top.seat;
    if (g.stack.length) g.log.push(`A pilha ainda tem ${g.stack.length} ativação(ões); uma nova janela de resposta foi aberta.`);
    else g.log.push(`A pilha foi resolvida; a prioridade voltou ao Jogador ${g.priority + 1}.`);
    return;
  }
  g.log.push(`Jogador ${seat + 1} encerrou ${phases[g.phase]}.`);
  if (seat === g.first) g.priority = (1 - g.first) as Seat;
  else {
    if (g.phase === 2)
      for (const u of g.units.filter(
        (x) => x.x === 3 && x.y === 3 && !x.statuses?.centerBonus,
      )) {
        u.speed++;
        (u.statuses ??= {}).centerBonus = true;
        g.log.push(
          `${cardOf(u)?.name || "Uma unidade"} ganhou +1 de Velocidade no centro.`,
        );
      }
    g.phase++;
    g.priority = g.first;
    if (g.phase === 5) {
      g.turn++;
      g.phase = 0;
      startTurn(g);
    }
  }
}

export default app({
  name: "Shikigamido",
  access: "public",
  schema: {
    decks: table({
      ownerId: string().index(),
      name: string(),
      element: string(),
      omionji: string(),
      cardIds: json(),
    }),
    rooms: table({
      code: string().index(),
      hostId: string().index(),
      guestId: string().index().nullable(),
      hostDeckId: string(),
      guestDeckId: string().nullable(),
      spectators: json(),
      status: string(),
      state: json(),
    }),
  },
  queries: {
    myDecks: query((ctx) => {
      const id = ctx.auth.userId;
      if (!id) return [];
      return ctx.db.transaction((tx) =>
        tx.decks.where("ownerId", id).orderBy("updatedAt", "desc").all(),
      );
    }),
    room: query((ctx, c: unknown) => {
      const k = clean(c, 6).toUpperCase();
      return k.length === 6
        ? ctx.db.transaction((tx) => tx.rooms.where("code", k).all()[0] ?? null)
        : null;
    }),
  },
  mutations: {
    saveDeck: mutation((ctx, input: DeckInput) => {
      const ownerId = requireUser(ctx),
        error = validateDeck(input);
      if (error) return { error };
      return {
        deck: ctx.db.transaction((tx) =>
          tx.decks.insert({
            ownerId,
            name: clean(input.name) || "Meu baralho",
            element: input.element,
            omionji: clean(input.omionji) || `Omionji de ${input.element}`,
            cardIds: input.cardIds,
          }),
        ),
      };
    }),
    createRoom: mutation((ctx, deckId: unknown) => {
      const hostId = requireUser(ctx);
      if (typeof deckId !== "string") return { error: "Selecione um baralho." };
      const deck = ctx.db.transaction((tx) =>
        tx.decks.where("ownerId", hostId).get(deckId),
      );
      if (!deck) return { error: "Baralho não encontrado." };
      const c = code();
      return {
        room: ctx.db.transaction((tx) =>
          tx.rooms.insert({
            code: c,
            hostId,
            guestId: null,
            hostDeckId: deckId,
            guestDeckId: null,
            spectators: [],
            status: "waiting",
            state: {},
          }),
        ),
      };
    }),
    joinRoom: mutation(
      (ctx, c: unknown, deckId: unknown, spectator: unknown) => {
        const userId = ctx.auth.userId,
          k = clean(c, 6).toUpperCase();
        if (k.length !== 6) return { error: "ID inválido." };
        return ctx.db.transaction((tx) => {
          const r: any = tx.rooms.where("code", k).all()[0];
          if (!r) return { error: "Sala não encontrada." };
          if (spectator === true) {
            const who = userId ?? `guest:${uid()}`,
              list = Array.isArray(r.spectators) ? r.spectators : [];
            if (!list.includes(who)) list.push(who);
            return { room: tx.rooms.update(r.id, { spectators: list }) };
          }
          if (!userId) return { error: "Entre com Google para jogar." };
          if (typeof deckId !== "string")
            return { error: "Selecione um baralho." };
          const guest = tx.decks.where("ownerId", userId).get(deckId),
            host = tx.decks.get(r.hostDeckId);
          if (!guest || !host) return { error: "Baralho não encontrado." };
          if (r.guestId && r.guestId !== userId)
            return { error: "Sala cheia." };
          return {
            room: tx.rooms.update(r.id, {
              guestId: userId,
              guestDeckId: deckId,
              status: "playing",
              state: freshGame(r.hostId, userId, host, guest),
            }),
          };
        });
      },
    ),
    gameCommand: mutation((ctx, c: unknown, raw: unknown) => {
      const userId = requireUser(ctx),
        k = clean(c, 6).toUpperCase();
      return ctx.db.transaction((tx) => {
        const r: any = tx.rooms.where("code", k).all()[0];
        if (!r) return { error: "Sala não encontrada." };
        const seat = (
          r.hostId === userId ? 0 : r.guestId === userId ? 1 : -1
        ) as Seat;
        if (seat < 0) return { error: "Espectadores não enviam comandos." };
        const g = r.state as Game;
        if (g.winner !== null) return { error: "A partida terminou." };
        if (seat !== g.priority)
          return { error: "Aguarde a prioridade do oponente." };
        const cmd = (
          raw && typeof raw === "object"
            ? raw
            : { type: raw === "advance" ? "pass" : raw }
        ) as Cmd;
        const error = apply(g, seat, cmd);
        if (error) return { error };
        g.log = g.log.slice(-80);
        return { room: tx.rooms.update(r.id, { state: g }) };
      });
    }),
  },
});
