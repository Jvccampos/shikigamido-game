import { yokaiIds, masculineIds } from "./traits.js";
import { baseKeywords } from "./keywords.js";
import { spellSpecs, transferableKeywords } from "./spells.js";
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
  ready?: boolean;
  resurrectedAnubis?: boolean;
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
  statuses?: Record<string, any>;
  captured?: Unit[];
  equipment?: Unit[];
};
type Game = {
  duel?: { seat: Seat; unitId: string; opponentId?: string };
  followup?: { seat: Seat; unitId: string; distance: number; label: string };
  flowers?: {
    id: string;
    unitId: string;
    owner: Seat;
    x: number;
    y: number;
    hp: number;
  }[];
  setup?: boolean;
  rolls?: [number, number][];
  phaseOwner?: Seat;
  centerChoices?: Record<string, string | null>;
  centerPending?: boolean;
  edges?: [number, number, number, number][];
  combat?: {
    attackerId: string;
    defenderId: string;
    x: number;
    y: number;
    ranged?: boolean;
    returnPriority: Seat;
  };
  events?: any[];
  revision?: number;
  draw?: boolean;
  turn: number;
  phase: number;
  priority: Seat;
  first: Seat;
  players: [Player, Player];
  units: Unit[];
  pending: { unit: Unit; returnTurn: number }[];
  stack: any[];
  terrain: {
    kind: "lake" | "wind" | "fire";
    x: number;
    y: number;
    owner: Seat;
    x2?: number;
    y2?: number;
    until?: number;
  }[];
  passes: number;
  moveCounts?: [number, number];
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
  handIndex?: number;
  handIndices?: number[];
  choice?: string;
  x2?: number;
  y2?: number;
};
const elements = ["agua", "fogo", "terra", "vento", "vazio"];
const phases = ["Compra", "Invocação", "Movimento", "Magia", "Descarte"];
const allCards = catalog.cards as any[];
const cards = new Map(allCards.map((c) => [c.id, c]));
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
const valid = (x: number, y: number) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x <= 6 &&
  y >= 0 &&
  y <= 6;
const spawns: [number, number][] = [
  [-1, 7],
  [7, -1],
];
const isSpawn = (x: number, y: number) =>
  spawns.some(([a, b]) => a === x && b === y);
function linked(ax: number, ay: number, bx: number, by: number) {
  if (isSpawn(ax, ay))
    return ax === -1 ? bx === 0 && by === 6 : bx === 6 && by === 0;
  if (isSpawn(bx, by)) return linked(bx, by, ax, ay);
  if (!valid(ax, ay) || !valid(bx, by)) return false;
  const dx = Math.abs(ax - bx),
    dy = Math.abs(ay - by);
  if (dx === 1 && dy === 1)
    return (ax === ay && bx === by) || (ax + ay === 6 && bx + by === 6);
  if (dx + dy !== 1) return false;
  if (ay === by) {
    const inset = Math.min(ay, 6 - ay);
    return (
      ay === 3 || (Math.min(ax, bx) >= inset && Math.max(ax, bx) <= 6 - inset)
    );
  }
  const inset = Math.min(ax, 6 - ax);
  return (
    ax === 3 || (Math.min(ay, by) >= inset && Math.max(ay, by) <= 6 - inset)
  );
}
function neighbors(x: number, y: number) {
  return [
    ...Array.from(
      { length: 49 },
      (_, i) => [i % 7, Math.floor(i / 7)] as [number, number],
    ),
    ...spawns,
  ].filter(([a, b]) => linked(x, y, a, b));
}
function connected(g: Game, ax: number, ay: number, bx: number, by: number) {
  return (
    linked(ax, ay, bx, by) ||
    (g.edges || []).some(
      ([x, y, xx, yy]) =>
        (ax === x && ay === y && bx === xx && by === yy) ||
        (ax === xx && ay === yy && bx === x && by === y),
    )
  );
}
function route(
  g: Game,
  u: Unit,
  tx: number,
  ty: number,
): [number, number][] | null {
  if (!valid(tx, ty) || (g.turn < 3 && tx === 3 && ty === 3)) return null;
  const q: { x: number; y: number; path: [number, number][] }[] = [
      { x: u.x, y: u.y, path: [] },
    ],
    seen = new Set([`${u.x},${u.y}`]);
  const jump = kw(u, "Pular") > 0,
    ghost = !!u.statuses?.intangivel;
  while (q.length) {
    const { x, y, path } = q.shift()!;
    if (x === tx && y === ty) return path;
    const lake = g.terrain?.find(
      (t) => t.kind === "lake" && t.x === x && t.y === y,
    );
    if (path.length && lake && !typesOf(u).includes("agua")) continue;
    for (let ny = 0; ny < 7; ny++)
      for (let nx = 0; nx < 7; nx++) {
        if (seen.has(`${nx},${ny}`) || (g.turn < 3 && nx === 3 && ny === 3))
          continue;
        const target = at(g, nx, ny),
          enemy =
            target && (target.kind === "curse" || target.owner !== u.owner);
        if (
          !connected(g, x, y, nx, ny) &&
          !(jump && Math.abs(nx - x) + Math.abs(ny - y) === 1 && !enemy)
        )
          continue;
        const dest = nx === tx && ny === ty;
        if (target?.kind === "wall" && !dest) continue;
        if (enemy && !dest && !ghost) continue;
        if (
          dest &&
          target &&
          ((target.kind !== "curse" && target.owner === u.owner) || ghost)
        )
          continue;
        if (dest && enemy && path.length && at(g, x, y)) continue;
        seen.add(`${nx},${ny}`);
        q.push({ x: nx, y: ny, path: [...path, [nx, ny]] });
      }
  }
  return null;
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
  if (input.cardIds.some((id: unknown) => typeof id !== "string"))
    return "Carta inválida.";
  if (
    input.cardIds.some(
      (id: string) => input.cardIds.filter((x: string) => x === id).length > 2,
    )
  )
    return "Máximo de 2 cópias da mesma carta.";
  const set = input.cardIds
    .map((id: string) => cards.get(id))
    .filter(Boolean) as any[];
  if (set.length !== 30) return "Carta desconhecida.";
  if (set.some((c) => c.kind === "omionji"))
    return "Omionji fica fora das 30 cartas.";
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
    hp: cards.get(`omionji-${element}`)!.stats.health,
    maxHp: cards.get(`omionji-${element}`)!.stats.health,
    attack: cards.get(`omionji-${element}`)!.stats.attack,
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
  const rolls: [number, number][] = [];
  do {
    rolls.push([
      1 + Math.floor(Math.random() * 6),
      1 + Math.floor(Math.random() * 6),
    ]);
  } while (rolls.at(-1)![0] === rolls.at(-1)![1]);
  const first = (rolls.at(-1)![0] > rolls.at(-1)![1] ? 0 : 1) as Seat;
  return {
    setup: true,
    phaseOwner: first,
    rolls,
    edges: [],
    events: [],
    revision: 0,
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
    moveCounts: [0, 0],
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
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/QuickAt+ack/gi, "Quick Attack")
    .replace(/QuickAttack/gi, "Quick Attack")
    .replace(/Renascer/gi, "Ressurgir");
  const key = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = normalized.match(
    new RegExp(`(?:^|[.\\n ]+)${key}\\s*(\\d+)?`, "i"),
  );
  return m ? Number(m[1] || 1) : 0;
}
function kw(u: Unit, key: string): number {
  if (u.statuses?.stolenKeyword === key) return 0;
  return Math.max(
    baseKeywords[u.cardId]?.[key] || 0,
    Number(u.statuses?.[key] || 0),
  );
}
function typesOf(u: Unit): string[] {
  if (u.cardId === "chama-marinha" && !u.statuses?.chosenElement)
    return [cardOf(u).types[0]];
  return u.statuses?.chosenElement
    ? [u.statuses.chosenElement]
    : [
        ...(cardOf(u)?.types ||
          (u.kind === "omionji" ? [u.cardId.replace("omionji-", "")] : [])),
        ...(u.statuses?.extraTypes || []),
      ];
}
function elementalDamage(attacker: Unit, defender: Unit, g?: Game) {
  let dmg = attacker.attack;
  const ats = typesOf(attacker),
    dts = typesOf(defender);
  if (
    (defender.cardId === "oni-vermelho" && ats.includes("fogo")) ||
    (defender.cardId === "enenra-comedor-de-mentes" &&
      ats.some((t) => ["terra", "fogo"].includes(t))) ||
    (defender.cardId === "gato-pavao" && /usagi/.test(attacker.cardId))
  )
    return 0;
  if (attacker.cardId === "kappa" && dts.includes("vento")) return 0;
  if (!kw(attacker, "Amaldiçoado")) {
    const ring = ["vazio", "vento", "fogo", "agua", "terra"];
    for (const a of ats)
      for (const d of dts) {
        const ai = ring.indexOf(a),
          di = ring.indexOf(d);
        if (di === (ai + 2) % 5) dmg++;
        if (di === (ai + 1) % 5) dmg--;
      }
  }
  if (
    ["kabuto-o-shikigami-besouro", "raposa-vigia"].includes(attacker.cardId) &&
    yokaiIds.has(defender.cardId)
  )
    dmg++;
  if (attacker.cardId === "esposa-traida" && masculineIds.has(defender.cardId))
    dmg++;
  if (attacker.cardId === "lobo-branco" && defender.hp < defender.maxHp) dmg++;
  if (attacker.cardId === "serpente-opala" && dts.includes("fogo")) dmg++;
  if (attacker.cardId === "tolo-do-fogo" && dts.includes("vazio")) dmg++;
  if (defender.cardId === "espirito-da-arvore" && ats.includes("fogo")) dmg--;
  if (
    g &&
    attacker.cardId === "defensor-de-lava" &&
    g.units.some(
      (u) =>
        u.id !== attacker.id &&
        u.owner === attacker.owner &&
        typesOf(u).includes("fogo") &&
        adjacent(u, attacker),
    )
  )
    dmg++;
  return Math.max(
    0,
    Math.min(
      Number(attacker.statuses?.damageCap ?? Infinity),
      dmg - kw(defender, "Block") - Number(defender.statuses?.block || 0),
    ),
  );
}
const adjacent = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
const alive = (g: Game, u: Unit) => g.units.some((x) => x.id === u.id);
const event = (g: Game, e: any) => {
  const snapshot = structuredClone({
    id: uid(),
    turn: g.turn,
    phase: g.phase,
    ...e,
  });
  (g.events ??= []).push(snapshot);
  g.events = g.events.slice(-400);
  return snapshot;
};
function heal(g: Game, u: Unit, n: number) {
  if (["neko-o-gato-eletrico", "omionji-fogo"].includes(u.cardId)) return;
  const amount = Math.min(n, u.maxHp - u.hp);
  u.hp += amount;
  if (u.statuses?.primordial) {
    const boost = Math.min(amount, 3 - Number(u.statuses.primordialBoost || 0));
    u.attack += boost;
    u.statuses.primordialBoost =
      Number(u.statuses.primordialBoost || 0) + boost;
  }
  if (amount > 0) {
    const om = g.units.find(
      (o) => o.cardId === "omionji-agua" && o.owner === u.owner,
    );
    if (u.kind === "unit" && om && om.statuses?.healDrawTurn !== g.turn) {
      (om.statuses ??= {}).healDrawTurn = g.turn;
      draw(g.players[u.owner]);
    }
    event(g, { type: "heal", unitId: u.id, amount });
    if (u.statuses?.healSplash) {
      delete u.statuses.healSplash;
      for (const other of g.units.filter(
        (x) => x.kind === "unit" && adjacent(x, u),
      ))
        heal(g, other, 2);
    }
  }
}
function makeUnit(
  g: Game,
  seat: Seat,
  cardId: string,
  x: number,
  y: number,
): Unit {
  const card = cards.get(cardId)!;
  return {
    id: uid(),
    cardId,
    owner: seat,
    x,
    y,
    hp: card.stats.health,
    maxHp: card.stats.health,
    attack: card.stats.attack,
    speed: card.stats.speed,
    summonedTurn: g.turn,
    kind: "unit",
    statuses: {
      shield: keyword(card.effect_text, "Escudo") > 0,
      hidden: g.players[seat].concealTurn === g.turn,
    },
  };
}
function summonEffects(g: Game, u: Unit, targetId?: string) {
  const p = g.players[u.owner];
  const search = (ids: string[], re: RegExp) => {
    const i = ids.findIndex((id) => re.test(id));
    if (i >= 0) p.hand.push(ids.splice(i, 1)[0]);
  };
  if (u.cardId === "taodu-curador") search(p.library, /taodu/);
  if (u.cardId === "anubis-o-gato-da-morte") search(p.discard, /gato|neko/);
  if (u.cardId === "gato-do-cristal-duplo") {
    const t = g.units.find(
      (x) => x.id === targetId && x.kind === "unit" && x.id !== u.id,
    );
    if (t) {
      (u.statuses ??= {}).bond = t.id;
      (t.statuses ??= {}).bond = u.id;
    }
  }
  if (u.cardId === "tigre-carmesim")
    (g.flowers ??= []).push({
      id: uid(),
      unitId: u.id,
      owner: u.owner,
      x: u.x,
      y: u.y,
      hp: 1,
    });
  event(g, { type: "summon", unit: { ...u } });
}
function destroy(g: Game, u: Unit, killer?: Unit) {
  if (!alive(g, u)) return;
  g.units = g.units.filter((x) => x.id !== u.id);
  g.flowers = (g.flowers || []).filter((f) => f.unitId !== u.id);
  event(g, { type: "destroy", unitId: u.id, unit: u });
  if (u.kind === "omionji") {
    g.winner = (1 - u.owner) as Seat;
    g.log.push(`Omionji do Jogador ${u.owner + 1} derrotado.`);
    return;
  }
  if (u.kind === "crystal" || u.kind === "wall") return;
  if (u.kind === "curse") {
    const level = Math.min(3, (u.level || 1) + 1),
      [x, y] = spawns[u.owner];
    g.units.push({
      id: uid(),
      cardId: `maldicao-${level}`,
      owner: u.owner,
      x,
      y,
      hp: 3 + level * 3,
      maxHp: 3 + level * 3,
      attack: level + 1,
      speed: 1,
      summonedTurn: g.turn,
      kind: "curse",
      level,
      statuses: {},
    });
    event(g, { type: "summon", unit: g.units.at(-1) });
    g.log.push(`Maldição nível ${level} invocada no portal de origem.`);
    return;
  }
  const cho = g.units.find(
    (o) => o.cardId === "omionji-vazio" && o.owner === u.owner,
  );
  if (
    cho &&
    typesOf(u).includes("vazio") &&
    cho.statuses?.deathDrawTurn !== g.turn
  ) {
    (cho.statuses ??= {}).deathDrawTurn = g.turn;
    draw(g.players[u.owner]);
  }
  const p = g.players[u.owner],
    resurrect = Math.max(
      kw(u, "Ressurgir"),
      Number(u.statuses?.ressurgir || 0),
    );
  if (!u.statuses?.copy) {
    if (resurrect) {
      (g.pending ??= []).push({
        unit: { ...u, hp: u.maxHp, statuses: { resurrected: true } },
        returnTurn: g.turn + resurrect,
      });
    } else if (
      /tigre-(carmesim|roxo)/.test(u.cardId) &&
      g.units.some((x) => x.cardId === "tigre-cinza" && x.owner === u.owner)
    )
      p.hand.push(u.cardId);
    else if (u.cardId === "taodu-corrupto")
      p.library = shuffle([...p.library, u.cardId]);
    else p.discard.push(u.cardId);
  }
  if (u.cardId === "tsuchi-o-gato-da-terra") {
    const i = p.library.findIndex((id) => /gato|neko/.test(id));
    if (i >= 0) p.hand.push(p.library.splice(i, 1)[0]);
  }
  if (killer && killer.kind !== "curse" && killer.kind !== "crystal") {
    const kp = g.players[killer.owner],
      st = (killer.statuses ??= {});
    if (kw(killer, "Alimentar")) {
      killer.attack++;
      killer.maxHp++;
      killer.hp++;
      if (!st.fedSpeed) {
        killer.speed++;
        st.fedSpeed = true;
      }
    }
    if (killer.cardId === "aguia-cacadora" && u.kind === "unit")
      killer.attack++;
    if (
      /oni/.test(u.cardId) &&
      ["oni-azul", "oni-verde", "ichi-o-oni-chefe-do-sul"].includes(
        killer.cardId,
      )
    ) {
      killer.attack += 2;
      st.oniKills = Number(st.oniKills || 0) + 1;
      if (killer.cardId === "oni-azul" && st.oniKills >= 2) {
        const i = kp.library.indexOf("ichi-o-oni-chefe-do-sul");
        if (i >= 0) {
          kp.library.splice(i, 1);
          const v = makeUnit(
            g,
            killer.owner,
            "ichi-o-oni-chefe-do-sul",
            killer.x,
            killer.y,
          );
          destroy(g, killer);
          g.units.push(v);
        }
      }
    }
    if (u.cardId === "alimento-de-oni" && /oni/.test(killer.cardId)) {
      killer.maxHp++;
      killer.hp = killer.maxHp;
      killer.attack++;
      killer.speed++;
    }
    if (u.cardId === "comedor-de-sonhos") kp.pe++;
    if (u.cardId === "taodu-corrupto") draw(kp);
    if (["a-gula", "assombracao-afogada", "o-arconte"].includes(u.cardId))
      draw(kp, 2);
    if (u.cardId === "a-gula") {
      st.extraTypes = [...(st.extraTypes || []), "fogo"];
      st.devolver = 2;
    }
    if (u.cardId === "assombracao-afogada") st.Lifesteal = 2;
    if (u.cardId === "broto-amaldicoado") st.construir = true;
    if (u.cardId === "lamento") st.Alimentar = 1;
    if (["o-arconte", "potaru"].includes(u.cardId)) st["Quick Attack"] = 1;
    if (killer.cardId === "kirijin-o-oni-da-fumaca") {
      const i = kp.library.indexOf("enenra-comedor-de-mentes"),
        spot = neighbors(killer.x, killer.y).find(
          ([x, y]) => valid(x, y) && !at(g, x, y),
        );
      if (i >= 0 && spot) {
        kp.library.splice(i, 1);
        g.units.push(
          makeUnit(g, killer.owner, "enenra-comedor-de-mentes", ...spot),
        );
      }
    }
  }
  const bond = g.units.find((x) => x.id === u.statuses?.bond);
  if (bond) destroy(g, bond);
  for (const e of u.equipment || []) {
    if (e.cardId === "neko-o-gato-eletrico") {
      e.hp--;
      if (e.hp > 0) {
        e.x = u.x;
        e.y = u.y;
        g.units.push(e);
      } else g.players[e.owner].discard.push(e.cardId);
    } else g.players[e.owner].discard.push(e.cardId);
  }
  for (const captured of u.captured || []) {
    const spots = Array.from(
      { length: 49 },
      (_, i) => [i % 7, Math.floor(i / 7)] as [number, number],
    ).filter(([x, y]) => !at(g, x, y));
    spots.sort(
      (a, b) =>
        Math.max(Math.abs(a[0] - u.x), Math.abs(a[1] - u.y)) -
          Math.max(Math.abs(b[0] - u.x), Math.abs(b[1] - u.y)) ||
        ((Math.atan2(a[1] - u.y, a[0] - u.x) + Math.PI * 2) % (Math.PI * 2)) -
          ((Math.atan2(b[1] - u.y, b[0] - u.x) + Math.PI * 2) % (Math.PI * 2)),
    );
    if (spots[0]) {
      [captured.x, captured.y] = spots[0];
      g.units.push(captured);
    } else g.players[captured.owner].hand.push(captured.cardId);
  }
}
function takeDamage(
  g: Game,
  u: Unit,
  n: number,
  source?: Unit,
  combat = false,
): number {
  if (!alive(g, u) || n <= 0) return 0;
  if (combat && u.statuses?.shield) {
    u.statuses.shield = false;
    event(g, { type: "shield", unitId: u.id });
    return 0;
  }
  const redirect = g.units.find((x) => x.id === u.statuses?.redirect);
  if (combat && redirect) {
    const amount = Math.min(
      n,
      Number(u.statuses?.redirectAmount ?? n),
      redirect.hp,
    );
    delete u.statuses?.redirect;
    takeDamage(g, redirect, amount, source);
    n -= amount;
  }
  const damage = Math.min(u.hp, n);
  u.hp -= n;
  if (u.hp <= 0) destroy(g, u, source);
  return damage;
}
function fight(g: Game, a: Unit, d: Unit) {
  delete a.statuses?.hidden;
  delete d.statuses?.hidden;
  const beforeA = structuredClone(a),
    beforeD = structuredClone(d);
  // Reserve the cue before damage triggers; finish it within this atomic command.
  const combatCue = event(g, {
    type: "combat",
    attacker: beforeA,
    defender: beforeD,
    attackDamage: 0,
    defenseDamage: 0,
    keyword: "Engolir",
  });
  if (d.cardId === "furame-ku")
    g.players[d.owner].permanentPe = Math.min(
      3,
      g.players[d.owner].permanentPe + 1,
    );
  if (a.cardId === "furame-ku") a.speed++;
  if (a.cardId === "dragao-do-inverno") d.speed = Math.max(0, d.speed - 1);
  if (a.cardId === "serpente-de-gelo") d.speed = Math.max(0, d.speed - 1);
  if (d.cardId === "serpente-de-gelo") a.speed = Math.max(0, a.speed - 1);
  const engulf = kw(a, "Engolir") ? a : kw(d, "Engolir") ? d : null;
  if (engulf) {
    const victim = engulf === a ? d : a;
    if (victim.kind === "unit") {
      (engulf.captured ??= []).push(victim);
      g.units = g.units.filter((x) => x.id !== victim.id);

      return engulf === a;
    }
  }
  let quick =
    kw(a, "Quick Attack") > 0 ||
    kw(d, "Slow Defense") > 0 ||
    (a.kind === "unit" &&
      d.kind === "unit" &&
      a.owner === d.owner &&
      g.units.some((o) => o.cardId === "omionji-terra" && o.owner === a.owner));
  if (a.cardId === "cachorro-do-mato" && Math.random() < 0.5) quick = true;
  const ad = elementalDamage(a, d, g),
    dd =
      d.statuses?.stun || d.cardId === "bolinhas-explosivas"
        ? 0
        : elementalDamage(
            {
              ...d,
              attack:
                d.attack +
                Number(d.statuses?.combatAttack || 0) +
                kw(d, "Devolver") +
                Number(d.statuses?.devolver || 0),
            },
            a,
            g,
          );
  let da = 0,
    ddone = 0;
  if (
    a.cardId === "escorpiao-da-morte" &&
    d.kind === "unit" &&
    (cardOf(d)?.stats.cost ?? Infinity) <= 3
  ) {
    destroy(g, d, a);
    quick = true;
  } else if (a.statuses?.fireball && Math.random() < 0.5)
    g.log.push("Fireball errou no dado.");
  else da = takeDamage(g, d, ad, a, true);
  const equip =
    ["neko-o-gato-eletrico", "suineko-o-gato-aquatico"].includes(a.cardId) &&
    d.kind === "unit" &&
    alive(g, d);
  if (equip) {
    (d.equipment ??= []).push(a);
    g.units = g.units.filter((x) => x.id !== a.id);
    if (a.cardId === "neko-o-gato-eletrico") {
      d.attack++;
      d.speed++;
      (d.statuses ??= {}).burn = 1;
      d.statuses.burnUntil = g.turn + 2;
    } else d.maxHp += 2;
  } else if (!quick || alive(g, d)) ddone = takeDamage(g, a, dd, d, true);
  for (const [u, other, dealt] of [
    [a, d, da],
    [d, a, ddone],
  ] as [Unit, Unit, number][]) {
    if (alive(g, u)) {
      const life = Math.max(
        kw(u, "Lifesteal"),
        Number(u.statuses?.lifesteal || 0),
      );
      if (life) heal(g, u, Math.min(life, dealt));
      if (u.cardId === "kappa") {
        u.maxHp++;
        u.hp++;
      }
    }
    const burn = Math.max(
      kw(u, "Burn"),
      Number(u.statuses?.burnAttack || 0),
      u === a && u.cardId === "ino-ino" ? 1 : 0,
    );
    if (burn && alive(g, other)) {
      (other.statuses ??= {}).burn = burn;
      other.statuses.burnUntil = g.turn + 2;
    }
  }
  if (
    a.cardId === "aranha-de-cristal" &&
    d.kind === "unit" &&
    cardOf(d)?.stats.cost <= 6 &&
    alive(g, d)
  ) {
    (d.statuses ??= {}).controlTurn = g.turn + 2;
    d.statuses.controlOwner = a.owner;
  }
  if (
    !alive(g, a) &&
    !alive(g, d) &&
    a.kind === "omionji" &&
    d.kind === "omionji"
  ) {
    g.winner = null;
    g.draw = true;
  }
  Object.assign(combatCue, {
    attackDamage: da,
    defenseDamage: ddone,
    afterA: a.hp,
    afterD: d.hp,
    keyword: equip
      ? "Equipar"
      : quick
        ? "Quick Attack"
        : kw(d, "Devolver")
          ? "Devolver"
          : "Combate simultâneo",
    element: typesOf(a)[0] || "vazio",
  });
  g.log.push(
    `${cardOf(a)?.name || a.cardId} enfrentou ${cardOf(d)?.name || d.cardId}: ${da} / ${ddone} de dano.`,
  );
  return !alive(g, d) && alive(g, a);
}
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
    const targets = g.units.filter((u) => u.kind === "omionji");
    if (!targets.length) continue;
    const options = neighbors(c.x, c.y)
      .filter(([x, y]) => valid(x, y))
      .map(([x, y]) => ({
        x,
        y,
        d: Math.min(...targets.map((t) => distance(x, y, t.x, t.y))),
        center: Math.abs(x - 3) + Math.abs(y - 3),
        roll: Math.random(),
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
  }
}
function startTurn(g: Game) {
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
        event(g, { type: "summon", unit: u });
      }
      g.pending = g.pending.filter((x) => x !== item);
    }
  for (const u of [...g.units]) {
    if (!alive(g, u)) continue;
    const st = (u.statuses ??= {});
    if (st.ephemeralUntil < g.turn) {
      g.units = g.units.filter((x) => x.id !== u.id);
      continue;
    }
    if (st.dualUntil < g.turn) {
      u.attack = st.dualAttack;
      u.speed = st.dualSpeed;
      u.maxHp = st.dualMaxHp;
      u.hp = Math.min(u.hp, u.maxHp);
      delete st.dualUntil;
    }
    if (st.temporaryUntil < g.turn) {
      u.attack -= st.temporaryAttack || 0;
      delete st.temporaryAttack;
      delete st.temporaryUntil;
    }
    for (const key of [
      "range",
      "fireball",
      "damageCap",
      "lifesteal",
      "intangivel",
      "stun",
      "softStun",
      "stolenKeyword",
      "borrowed",
    ])
      if (st[`${key}Until`] < g.turn) {
        if (key === "borrowed") delete st[st.borrowed];
        delete st[key];
        delete st[`${key}Until`];
      }
    if (st.burn && st.burnUntil >= g.turn) takeDamage(g, u, st.burn);
    else delete st.burn;
    if (st.controlTurn === g.turn) {
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
      const [x, y] = spawns[owner];
      g.units.push({
        id: uid(),
        cardId: "maldicao-1",
        owner,
        x,
        y,
        hp: 6,
        maxHp: 6,
        attack: 2,
        speed: 1,
        summonedTurn: 3,
        kind: "curse",
        level: 1,
        statuses: {},
      });
      event(g, { type: "summon", unit: g.units.at(-1) });
    }
    g.centerPending = true;
    g.centerChoices = {};
    g.log.push(
      "Centro aberto. Escolham em segredo uma unidade para avançar em direção ao centro.",
    );
  } else if (g.turn > 3) moveCurses(g);
  g.log.push(
    `Turno ${g.turn}: PE restaurado e uma carta comprada por jogador.`,
  );
}
function spellError(g: Game, seat: Seat, c: Cmd): string | undefined {
  const id = c.cardId!,
    spec = spellSpecs[id];
  if (!spec) return "Magia sem definição.";
  const t = g.units.find((u) => u.id === c.targetId),
    t2 = g.units.find((u) => u.id === c.targetId2),
    p = g.players[seat];
  const cell =
    typeof c.x === "number" &&
    typeof c.y === "number" &&
    valid(c.x, c.y) &&
    !(g.turn < 3 && c.x === 3 && c.y === 3);
  if (
    t?.cardId === "ichi-o-oni-chefe-do-sul" ||
    t2?.cardId === "ichi-o-oni-chefe-do-sul"
  )
    return "Ichi é imune a magias.";
  if (
    [
      "unit",
      "ally",
      "windAlly",
      "twoAllies",
      "duel",
      "twoUnits",
      "move",
      "combat",
      "redirect",
    ].includes(spec.target) &&
    t?.kind !== "unit"
  )
    return "Escolha um monstro válido.";
  if (
    ["ally", "windAlly", "twoAllies", "duel", "move", "redirect"].includes(
      spec.target,
    ) &&
    t?.owner !== seat
  )
    return "Escolha um monstro seu.";
  if (spec.target === "windAlly" && t && !typesOf(t).includes("vento"))
    return "O monstro deve ser de Vento.";
  if (
    spec.target === "omionjiFire" &&
    !(t?.kind === "omionji" && t.owner === seat && typesOf(t).includes("fogo"))
  )
    return "Selecione seu Omionji de Fogo.";
  if (
    ["twoAllies", "twoUnits", "redirect"].includes(spec.target) &&
    (t2?.kind !== "unit" || t2.id === t?.id)
  )
    return "Escolha um segundo monstro diferente.";
  if (["twoAllies", "redirect"].includes(spec.target) && t2?.owner !== seat)
    return "O segundo monstro deve ser seu.";
  if (
    ["cell", "lake", "wind", "move", "discardCat"].includes(spec.target) &&
    !cell
  )
    return "Escolha uma casa válida.";
  if (["cell", "move", "discardCat"].includes(spec.target) && at(g, c.x!, c.y!))
    return "A casa deve estar vazia.";
  if (spec.target === "move" && t && !connected(g, t.x, t.y, c.x!, c.y!))
    return "Escolha uma casa conectada ao monstro.";
  if (
    spec.target === "lake" &&
    !g.units.some(
      (u) =>
        typesOf(u).includes("agua") &&
        ((u.x === c.x && u.y === c.y) || adjacent(u, { x: c.x!, y: c.y! })),
    )
  )
    return "O lago deve ficar junto de uma carta de Água.";
  if (
    spec.target === "wind" &&
    !(
      typeof c.x2 === "number" &&
      typeof c.y2 === "number" &&
      connected(g, c.x!, c.y!, c.x2, c.y2) &&
      (c.x === c.x2 || c.y === c.y2)
    )
  )
    return "Escolha uma segunda casa conectada em linha reta.";
  if (
    spec.target === "discardVoid" &&
    !p.discard.some(
      (id) =>
        id === c.choice &&
        cards.get(id)?.kind === "unit" &&
        cards.get(id)?.types.includes("vazio"),
    )
  )
    return "Escolha um monstro de Vazio no descarte.";
  if (
    spec.target === "discardCat" &&
    (!p.discard.some((id) => id === c.choice && /gato|neko/.test(id)) ||
      !summonCells(g, seat).some((v) => v.x === c.x && v.y === c.y))
  )
    return "Escolha um gato do descarte e uma casa junto de um cristal.";
  if (
    ["combat", "redirect"].includes(spec.target) &&
    (!g.combat ||
      ![g.combat.attackerId, g.combat.defenderId].includes(c.targetId!))
  )
    return "Essa magia exige um monstro no combate anunciado.";
  if (id === "mamoru-n-24-conexao" && t && t2 && !adjacent(t, t2))
    return "O aliado deve ser adjacente.";
  if (id === "mamoru-n-12-negacao" && !g.stack.length)
    return "Negação precisa responder a outra magia.";
  if (
    id === "gishiki-n-3-intangibilidade" &&
    (g.phase !== 2 || g.phaseOwner !== seat)
  )
    return "Use na sua fase de Movimento.";
  if (
    id === "gishiki-n-9-mimetismo" &&
    (!transferableKeywords.includes(c.choice || "") || !t || !kw(t, c.choice!))
  )
    return "Escolha uma keyword que o doador possui.";
  if (
    id === "duelo-de-fogo" &&
    !g.units.some((u) => u.kind === "unit" && u.owner !== seat)
  )
    return "O oponente precisa ter um monstro.";
  if (
    id === "kogeki-n-2-dualidade" &&
    t &&
    !neighbors(t.x, t.y).some(([x, y]) => valid(x, y) && !at(g, x, y))
  )
    return "Não há espaço para a cópia.";
  if (
    c.extraPe !== undefined &&
    (!Number.isInteger(c.extraPe) || c.extraPe < 0 || c.extraPe > 99)
  )
    return "Quantidade de PE ou dano inválida.";
}
function resolveSpell(
  g: Game,
  seat: Seat,
  cardId: string,
  targetId?: string,
  targetId2?: string,
  x?: number,
  y?: number,
  extraPe = 0,
  choice?: string,
  x2?: number,
  y2?: number,
) {
  const p = g.players[seat],
    card = cards.get(cardId)!;
  if (!card) return;
  const t = g.units.find((u) => u.id === targetId),
    t2 = g.units.find((u) => u.id === targetId2),
    st = t ? (t.statuses ??= {}) : {};
  const spec = spellSpecs[cardId];
  if (t?.cardId === "ichi-o-oni-chefe-do-sul") {
    g.log.push(`${card.name}: alvo imune.`);
    return;
  }
  if (
    [
      "unit",
      "ally",
      "windAlly",
      "omionjiFire",
      "twoAllies",
      "twoUnits",
      "move",
      "combat",
      "redirect",
      "duel",
    ].includes(spec.target) &&
    !t
  ) {
    g.log.push(`${card.name}: o alvo saiu de campo.`);
    return;
  }
  const spellCue = event(g, {
    type: "spell",
    seat,
    cardId,
    targetId,
    x,
    y,
    element: card.types[0],
    beforeTarget: t ? structuredClone(t) : undefined,
  });
  const status = (key: string, value: any, until?: number) => {
    st[key] = value;
    if (until !== undefined) st[`${key}Until`] = until;
  };
  switch (cardId) {
    case "mamoru-n-12-negacao": {
      const cancelled = g.stack.pop();
      if (cancelled)
        g.log.push(`${cards.get(cancelled.cardId)?.name} foi anulada.`);
      break;
    }
    case "gishiki-n-13-fardo-espiritual":
      g.players[(1 - seat) as Seat].costTaxUntil = g.turn + 1;
      break;
    case "gishiki-n-4-manto-da-escuridao":
      p.concealTurn = g.turn + 1;
      break;
    case "kogeki-n-1-golpe-do-vazio":
      draw(p, 2);
      break;
    case "gishiki-n-10-invocar-espiritos": {
      const i = p.discard.indexOf(choice!);
      if (i >= 0) p.hand.push(p.discard.splice(i, 1)[0]);
      draw(p);
      break;
    }
    case "ritual-do-gato-sete-vidas": {
      const i = p.discard.indexOf(choice!);
      if (i >= 0 && !at(g, x!, y!)) {
        p.discard.splice(i, 1);
        const u = makeUnit(g, seat, choice!, x!, y!);
        g.units.push(u);
        summonEffects(g, u);
        if (
          t?.owner === seat &&
          ["neko-o-gato-eletrico", "suineko-o-gato-aquatico"].includes(u.cardId)
        ) {
          g.units = g.units.filter((z) => z.id !== u.id);
          (t.equipment ??= []).push(u);
          if (u.cardId === "neko-o-gato-eletrico") {
            t.attack++;
            t.speed++;
          } else t.maxHp += 2;
        }
      }
      break;
    }
    case "kogekido-n-42-obliterar":
      destroy(g, t!);
      break;
    case "gishiki-n-20-tributo":
      if (t?.owner === seat) {
        destroy(g, t);
        draw(p, 2);
      }
      break;
    case "kogekido-n-40-suspiro-final":
      if (t?.owner === seat) {
        const around = g.units.filter((u) => adjacent(u, t));
        destroy(g, t);
        for (const u of around) takeDamage(g, u, 1);
      }
      break;
    case "gishikido-n-3-cura-da-agua":
      heal(g, t!, 2);
      break;
    case "gishikido-n-7-cura-da-agua":
      status("healSplash", true);
      break;
    case "gishiki-n-20-transferencia-vital": {
      const n = p.discard.filter(
        (id) =>
          cards.get(id)?.kind === "unit" &&
          cards.get(id)?.types.includes("terra"),
      ).length;
      t!.attack += n;
      status("temporaryAttack", Number(st.temporaryAttack || 0) + n);
      status("temporaryUntil", g.turn + 1);
      break;
    }
    case "mamoru-n-7-dispersar": {
      const base = cardOf(t!);
      t!.statuses = {};
      if (base) {
        t!.attack = base.stats.attack;
        t!.speed = base.stats.speed;
        t!.maxHp = base.stats.health;
        t!.hp = Math.min(t!.hp, t!.maxHp);
      }
      break;
    }
    case "kogeki-n-2-dualidade": {
      const spot = neighbors(t!.x, t!.y).find(
        ([xx, yy]) => valid(xx, yy) && !at(g, xx, yy),
      );
      if (spot) {
        st.dualAttack = t!.attack;
        st.dualMaxHp = t!.maxHp;
        st.dualUntil = g.turn + 1;
        st.dualSpeed = t!.speed;
        t!.attack = Math.ceil(t!.attack / 2);
        t!.maxHp = Math.ceil(t!.maxHp / 2);
        t!.hp = Math.min(Math.ceil(t!.hp / 2), t!.maxHp);
        t!.speed = Math.ceil(t!.speed / 2);
        g.units.push({
          ...structuredClone(t!),
          id: uid(),
          x: spot[0],
          y: spot[1],
          summonedTurn: g.turn,
          statuses: { copy: true, ephemeralUntil: g.turn + 1 },
        });
      }
      break;
    }
    case "kogeki-n-9-sacrificio":
      if (t2) fight(g, t!, t2);
      break;
    case "duelo-de-fogo":
      g.duel = { seat, unitId: t!.id };
      g.priority = (1 - seat) as Seat;
      break;
    case "mamoru-n-1-pes-ligeiros":
      if (!at(g, x!, y!) && connected(g, t!.x, t!.y, x!, y!)) {
        t!.x = x!;
        t!.y = y!;
      }
      break;
    case "mamoru-n-9-wonder-wall":
      if (!at(g, x!, y!))
        g.units.push({
          id: uid(),
          cardId: "wonder-wall",
          owner: seat,
          x: x!,
          y: y!,
          hp: 2 + extraPe,
          maxHp: 2 + extraPe,
          attack: 0,
          speed: 0,
          summonedTurn: g.turn,
          kind: "wall",
          statuses: {},
        });
      break;
    case "magia-de-sangue":
      g.terrain.push({ kind: "lake", x: x!, y: y!, owner: seat });
      break;
    case "ventos-favoraveis":
      g.terrain.push({ kind: "wind", x: x!, y: y!, x2, y2, owner: seat });
      break;
    case "gishiki-n-16-ponte-magica":
      status("construir", true);
      break;
    case "gishiki-n-17-renascer":
      status("ressurgir", 2);
      break;
    case "gishikido-n-2-bencao-do-vento":
      status("block", 1);
      break;
    case "gishikido-n-22-garras-de-fogo":
      status("burnAttack", 1);
      break;
    case "mamoru-n-18-pele-de-ourico":
      status("devolver", 2);
      break;
    case "mamoru-n-21-intocavel":
      status("shield", true);
      break;
    case "mamoru-n-5-prisao-do-inferno":
      status("softStun", 1, g.turn + 1);
      break;
    case "gishiki-n-3-intangibilidade":
      status("intangivel", true, g.turn);
      break;
    case "kogeki-n-1-fireball":
      status("range", 2, g.turn + 1);
      status("fireball", true, g.turn + 1);
      break;
    case "shikigami-de-agua-vibora-bolha":
      status("lifesteal", 2, g.turn);
      status("range", 1, g.turn);
      status("damageCap", 2, g.turn);
      break;
    case "cristal-primordial":
      status("primordial", true);
      break;
    case "gishiki-n-4-sacrificio":
      status("sacrificeTurn", g.turn + 1);
      break;
    case "gishiki-n-9-mimetismo":
      if (t2) {
        status("stolenKeyword", choice, g.turn + 1);
        const ts = (t2.statuses ??= {});
        ts[choice!] = Math.max(
          baseKeywords[t!.cardId]?.[choice!] || 0,
          Number(st[choice!] || 0),
        );
        ts.borrowed = choice;
        ts.borrowedUntil = g.turn + 1;
      }
      break;
    case "kogekido-n-2-exorcismo":
      takeDamage(g, t!, 1);
      break;
    case "mamoru-n-24-conexao":
    case "mamoru-n-5-transferencia-espiritual":
      if (t2) {
        status("redirect", t2.id);
        status(
          "redirectAmount",
          cardId === "mamoru-n-24-conexao"
            ? Infinity
            : Math.min(extraPe, t2.hp),
        );
      }
      break;
    case "mamorudo-n-17-defesa-da-fagulha":
      if (g.combat) {
        const wantAttack = choice !== "defender";
        if ((g.combat.attackerId === t!.id) !== wantAttack)
          [g.combat.attackerId, g.combat.defenderId] = [
            g.combat.defenderId,
            g.combat.attackerId,
          ];
      }
      break;
  }
  if (t) spellCue.afterTarget = structuredClone(t);
  g.log.push(`${card.name} resolveu.`);
}
function summonCells(g: Game, seat: Seat) {
  return Array.from({ length: 49 }, (_, i) => ({
    x: i % 7,
    y: Math.floor(i / 7),
  })).filter(
    ({ x, y }) =>
      !(g.turn < 3 && x === 3 && y === 3) &&
      !at(g, x, y) &&
      g.units.some(
        (u) =>
          u.owner === seat &&
          u.kind === "crystal" &&
          connected(g, u.x, u.y, x, y),
      ),
  );
}
function moveOptions(g: Game, u: Unit) {
  if (
    (g.moveCounts?.[u.owner] || 0) >= 2 &&
    g.players[u.owner].pe + g.players[u.owner].permanentPe < 1
  )
    return [];
  if (
    g.moved.includes(u.id) ||
    u.summonedTurn === g.turn ||
    u.statuses?.stun ||
    u.statuses?.softStun ||
    !["unit", "omionji"].includes(u.kind)
  )
    return [];
  return Array.from({ length: 49 }, (_, i) => ({
    x: i % 7,
    y: Math.floor(i / 7),
  })).filter(({ x, y }) => {
    const path = route(g, u, x, y);
    return path && path.length > 0 && path.length <= movementBudget(g, u, path);
  });
}
function movementBudget(g: Game, u: Unit, path: [number, number][]) {
  let n = u.speed;
  let [x, y] = [u.x, u.y];
  for (const [nx, ny] of path) {
    for (const t of g.terrain.filter((t) => t.kind === "wind")) {
      if (t.x === x && t.y === y && t.x2 === nx && t.y2 === ny) n++;
      if (t.x2 === x && t.y2 === y && t.x === nx && t.y === ny) n--;
    }
    x = nx;
    y = ny;
  }
  return n;
}
function endMovement(g: Game, seat: Seat) {
  for (const u of g.units.filter((u) => u.owner === seat)) {
    if (u.cardId === "taodu-ferreiro")
      for (const t of g.units.filter(
        (t) =>
          t.owner === seat &&
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
function endTurn(g: Game) {
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
function enterPhase(g: Game) {
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
function settleCombat(g: Game) {
  const combat = g.combat;
  if (!combat) return;
  const a = g.units.find((u) => u.id === combat.attackerId),
    d = g.units.find((u) => u.id === combat.defenderId);
  if (a && d) {
    const won = fight(g, a, d);
    if (won && !combat.ranged && !at(g, combat.x, combat.y)) {
      a.x = combat.x;
      a.y = combat.y;
    }
  }
  g.priority = combat.returnPriority;
  g.combat = undefined;
  g.passes = 0;
  for (const u of g.units) {
    delete u.statuses?.redirect;
    delete u.statuses?.redirectAmount;
    delete u.statuses?.combatAttack;
  }
  if (a && alive(g, a) && a.cardId === "chifre-de-fogo")
    g.followup = {
      seat: a.owner,
      unitId: a.id,
      distance: 1,
      label: "Chifre de Fogo pode avançar mais uma casa.",
    };
  if (a && d && alive(g, d) && a.cardId === "o-destruidor")
    g.followup = {
      seat: a.owner,
      unitId: d.id,
      distance: 2,
      label: "O Destruidor pode empurrar o defensor até duas casas.",
    };
}
function refreshAuras(g: Game) {
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
function ability(g: Game, seat: Seat, c: Cmd): string | undefined {
  const u = g.units.find((u) => u.id === c.unitId && u.owner === seat),
    t = g.units.find((t) => t.id === c.targetId);
  if (!u) return "Selecione uma unidade sua.";
  const st = (u.statuses ??= {});
  if (g.combat?.defenderId === u.id && u.cardId === "cabra-dos-alpes") {
    const path = route(g, u, c.x!, c.y!);
    if (!path || !path.length || path.length > 2 || at(g, c.x!, c.y!))
      return "Escolha uma casa vazia até dois passos de distância.";
    u.x = c.x!;
    u.y = c.y!;
    g.priority = g.combat.returnPriority;
    g.combat = undefined;
    g.passes = 0;
    g.log.push("Cabra dos Alpes escapou do combate.");
    return;
  }
  if (g.combat?.defenderId === u.id && u.cardId === "javali-espinhoso") {
    if (st.combatAttack) return "Efeito já ativado neste combate.";
    if (u.hp < 2) return "O Javali precisa sobreviver ao custo de vida.";
    u.hp--;
    st.combatAttack = 1;
    return;
  }
  if (u.cardId === "espirito-da-arvore") {
    if (
      g.phase !== 2 ||
      g.phaseOwner !== seat ||
      g.moved.includes(u.id) ||
      u.summonedTurn === g.turn ||
      st.stun ||
      st.softStun
    )
      return "Use durante seu movimento com uma unidade disponível.";
    if (t?.kind !== "unit" || !typesOf(t).includes("fogo") || t.owner === seat)
      return "Escolha um monstro inimigo de Fogo.";
    if (
      !valid(c.x!, c.y!) ||
      at(g, c.x!, c.y!) ||
      !adjacent(t, { x: c.x!, y: c.y! }) ||
      (g.turn < 3 && c.x === 3 && c.y === 3)
    )
      return "Escolha uma casa vazia adjacente ao alvo.";
    if ((g.moveCounts ??= [0, 0])[seat] >= 2 && !spend(g.players[seat], 1))
      return "PE insuficiente para mover outra unidade.";
    g.moveCounts[seat]++;
    g.moved.push(u.id);
    u.x = c.x!;
    u.y = c.y!;
    g.combat = {
      attackerId: u.id,
      defenderId: t.id,
      x: t.x,
      y: t.y,
      ranged: true,
      returnPriority: seat,
    };
    g.priority = (1 - seat) as Seat;
    g.passes = 0;
    return;
  }
  if (u.cardId === "omionji-fogo") {
    if (t?.kind !== "unit") return "Escolha um monstro.";
    if (u.hp < 2 || !spend(g.players[seat], 1))
      return "Luna precisa de 2 de vida e 1 PE disponível.";
    u.hp--;
    t.attack++;
    (t.statuses ??= {}).temporaryAttack =
      Number(t.statuses.temporaryAttack || 0) + 1;
    t.statuses.temporaryUntil = g.turn;
    return;
  }
  if (st.abilityTurn === g.turn) return "Efeito já usado neste turno.";
  if (u.cardId === "omionji-vento") {
    if (!t || t.kind === "crystal" || t.kind === "curse" || !adjacent(u, t))
      return "Selecione uma carta adjacente que possa mover.";
    if (
      !valid(c.x!, c.y!) ||
      at(g, c.x!, c.y!) ||
      (g.turn < 3 && c.x === 3 && c.y === 3) ||
      !connected(g, t.x, t.y, c.x!, c.y!)
    )
      return "Selecione uma casa conectada vazia.";
    t.x = c.x!;
    t.y = c.y!;
  } else if (u.cardId === "garca-pacificadora") {
    if (
      g.phase !== 2 ||
      g.moved.some((id) => g.units.find((t) => t.id === id)?.owner === seat) ||
      st.once
    )
      return "Use no início da fase de Movimento, uma vez por partida.";
    if (t?.kind !== "unit" || !adjacent(u, t))
      return "Escolha um monstro adjacente.";
    st.shield = true;
    (t.statuses ??= {}).shield = true;
    st.once = true;
  } else if (u.cardId === "chama-marinha") {
    if (!cardOf(u).types.includes(c.choice))
      return "Selecione um dos elementos da carta.";
    st.chosenElement = c.choice;
    return;
  } else {
    if (g.phase !== 3 || g.phaseOwner !== seat)
      return "Ative na sua fase de Magia.";
    if (kw(u, "Construir") || st.construir) {
      if (
        !valid(c.x!, c.y!) ||
        Math.abs(c.x! - u.x) + Math.abs(c.y! - u.y) !== 1 ||
        connected(g, u.x, u.y, c.x!, c.y!)
      )
        return "Escolha uma casa ortogonal adjacente ainda sem caminho.";
      (g.edges ??= []).push([u.x, u.y, c.x!, c.y!]);
    } else if (u.cardId === "hearo-megami") {
      if (!t || t.owner !== seat || !typesOf(t).includes("agua"))
        return "Escolha um aliado de Água.";
      heal(g, t, 2);
      takeDamage(g, u, 1);
    } else if (u.cardId === "india-do-norte") {
      if (t?.kind !== "unit" || t.owner !== seat || !adjacent(u, t))
        return "Escolha um monstro aliado adjacente.";
      destroy(g, u);
      heal(g, t, 2);
    } else if (u.cardId === "ichiki-o-despertar-do-elemento") {
      if (t?.kind !== "unit") return "Escolha um monstro.";
      if (!spend(g.players[seat], 1)) return "PE insuficiente.";
      takeDamage(g, t, 1, u);
    } else return "Essa carta tem efeitos automáticos.";
  }
  st.abilityTurn = g.turn;
  event(g, { type: "ability", unit: u });
  g.log.push(`${cardOf(u)?.name} ativou seu efeito.`);
}
function apply(g: Game, seat: Seat, c: Cmd): string | undefined {
  if (!c || typeof c !== "object" || typeof c.type !== "string")
    return "Comando inválido.";
  if (g.winner !== null || g.draw) return "A partida terminou.";
  const p = g.players[seat];
  if (!p) return "Jogador inválido.";
  if (c.type === "concede") {
    g.winner = (1 - seat) as Seat;
    event(g, { type: "concede", seat });
    g.log.push(`Jogador ${seat + 1} concedeu.`);
    return;
  }
  if (g.setup) {
    if (c.type === "mulligan") {
      if (p.mulligan) return "Mulligan indisponível.";
      const indices = c.handIndices || [];
      // Legacy command support still removes exactly one occurrence at a time.
      if (!c.handIndices && c.cardIds) {
        const remaining = [...p.hand];
        for (const id of c.cardIds) {
          const i = remaining.indexOf(id);
          if (i < 0) return "Carta inválida.";
          indices.push(i);
          remaining[i] = "";
        }
      }
      if (
        new Set(indices).size !== indices.length ||
        indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)
      )
        return "Seleção inválida.";
      const returned = indices
        .sort((a, b) => b - a)
        .map((i) => p.hand.splice(i, 1)[0]);
      p.library = shuffle([...p.library, ...returned]);
      draw(p, returned.length);
      p.mulligan = true;
      return;
    }
    if (c.type === "ready") {
      if (p.ready) return "Você já confirmou.";
      if (c.y !== 2 && c.y !== 4) return "Escolha uma posição inicial marcada.";
      const o = g.units.find((u) => u.kind === "omionji" && u.owner === seat)!;
      o.y = c.y;
      p.mulligan = true;
      p.ready = true;
      if (g.players.every((p) => p.ready)) {
        g.setup = false;
        g.phaseOwner = g.first;
        g.priority = g.first;
        startTurn(g);
        g.log.push("Preparação concluída. A batalha começou.");
      }
      return;
    }
    return "Escolha sua mão e posição inicial antes de começar.";
  }
  if (g.centerPending) {
    if (c.type !== "center") return "Escolha seu avanço secreto para o centro.";
    if (Object.hasOwn(g.centerChoices || {}, seat))
      return "Escolha já confirmada.";
    if (
      c.unitId &&
      !g.units.some(
        (u) =>
          u.id === c.unitId &&
          u.owner === seat &&
          ["unit", "omionji"].includes(u.kind) &&
          !u.statuses?.stun &&
          !u.statuses?.softStun &&
          u.summonedTurn < g.turn,
      )
    )
      return "Escolha uma unidade que possa mover.";
    (g.centerChoices ??= {})[seat] = c.unitId || null;
    if (Object.keys(g.centerChoices).length === 2) {
      for (const who of [g.first, (1 - g.first) as Seat]) {
        const u = g.units.find((u) => u.id === g.centerChoices![who]);
        if (!u) continue;
        const path = route(g, u, 3, 3);
        if (!path) continue;
        const steps = path.slice(0, u.speed);
        while (
          steps.length &&
          at(g, ...steps.at(-1)!) &&
          at(g, ...steps.at(-1)!)?.owner === u.owner
        )
          steps.pop();
        const dest = steps.at(-1);
        if (dest) {
          const target = at(g, ...dest);
          if (!target || fight(g, u, target)) {
            [u.x, u.y] = dest;
          }
        }
      }
      g.centerPending = false;
      g.centerChoices = {};
      g.log.push(
        "As escolhas foram reveladas e o avanço ao centro foi resolvido.",
      );
    }
    return;
  }
  if (g.duel) {
    if (c.type !== "duel") return "Conclua as escolhas do duelo.";
    if (!g.duel.opponentId) {
      if (seat === g.duel.seat)
        return "Aguarde o oponente escolher seu monstro.";
      const t = g.units.find(
        (u) => u.id === c.unitId && u.owner === seat && u.kind === "unit",
      );
      if (!t) return "Escolha seu monstro para o duelo.";
      g.duel.opponentId = t.id;
      g.priority = g.duel.seat;
      return;
    }
    if (seat !== g.duel.seat) return "O conjurador escolhe quem ataca.";
    const a = g.units.find((u) => u.id === g.duel!.unitId),
      d = g.units.find((u) => u.id === g.duel!.opponentId);
    g.duel = undefined;
    if (a && d)
      fight(
        g,
        c.choice === "defender" ? d : a,
        c.choice === "defender" ? a : d,
      );
    g.priority = seat;
    return;
  }
  if (g.followup) {
    if (seat !== g.followup.seat) return "Aguarde o movimento após combate.";
    if (c.type === "pass") {
      g.followup = undefined;
      return;
    }
    if (c.type !== "followup")
      return "Escolha uma casa para o movimento adicional ou pule.";
    const u = g.units.find((u) => u.id === g.followup!.unitId);
    if (!u) {
      g.followup = undefined;
      return;
    }
    const path = route(g, u, c.x!, c.y!);
    if (
      !path ||
      !path.length ||
      path.length > g.followup.distance ||
      at(g, c.x!, c.y!)
    )
      return "Destino inválido para o movimento adicional.";
    u.x = c.x!;
    u.y = c.y!;
    g.followup = undefined;
    return;
  }
  const card = cards.get(c.cardId || ""),
    fast =
      c.type === "cast" &&
      card?.kind === "spell" &&
      card.stats.speed !== "slow";
  if (
    seat !== g.priority &&
    !fast &&
    !(c.type === "ability" && c.unitId === `o${seat}` && p.element === "fogo")
  )
    return "Aguarde sua prioridade.";
  if (
    (g.stack.length || g.combat) &&
    !["cast", "pass", "ability"].includes(c.type)
  )
    return "Resolva as respostas antes de continuar.";
  if (c.type === "ability") {
    if (
      (g.stack.length || g.combat) &&
      !["omionji-fogo", "cabra-dos-alpes", "javali-espinhoso"].includes(
        g.units.find((u) => u.id === c.unitId)?.cardId || "",
      )
    )
      return "Apenas habilidades rápidas nesta janela.";
    return ability(g, seat, c);
  }
  if (c.type === "summon") {
    if (g.phase !== 1 || g.phaseOwner !== seat)
      return "Invoque na sua fase de Invocação.";
    const fromDeck =
      c.choice === "library" &&
      ["kabuto-o-shikigami-besouro", "anubis-o-gato-da-morte"].includes(
        c.cardId || "",
      );
    const source = fromDeck ? p.library : p.hand,
      index = fromDeck
        ? source.indexOf(c.cardId!)
        : (c.handIndex ?? source.indexOf(c.cardId!));
    if (!card || card.kind !== "unit" || source[index] !== card.id)
      return "Carta inválida ou mão desatualizada.";
    const sacrifice = g.units.find(
      (u) => u.id === c.targetId && u.owner === seat && u.kind === "unit",
    );
    if (
      card.id === "anubis-o-gato-da-morte" &&
      !(sacrifice && /gato|neko/.test(sacrifice.cardId)) &&
      !p.resurrectedAnubis
    )
      return "Anubis requer o sacrifício de um gato Shikigami anterior.";
    const ritual =
      !!sacrifice &&
      (sacrifice.statuses?.sacrificeTurn === g.turn ||
        card.id === "anubis-o-gato-da-morte");
    if (
      !ritual &&
      !summonCells(g, seat).some((v) => v.x === c.x && v.y === c.y)
    )
      return "Invoque em um espaço marcado junto de um cristal vivo.";
    const cost =
        card.stats.cost + (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0),
      refund =
        ritual && sacrifice!.statuses?.sacrificeTurn === g.turn
          ? cardOf(sacrifice!)?.stats.cost || 0
          : 0;
    if (p.pe + Math.min(3, p.permanentPe + refund) < cost)
      return "PE insuficiente.";
    let x = c.x!,
      y = c.y!;
    if (ritual) {
      x = sacrifice!.x;
      y = sacrifice!.y;
      p.permanentPe = Math.min(3, p.permanentPe + refund);
      destroy(g, sacrifice!);
    }
    spend(p, cost);
    source.splice(index, 1);
    if (card.id === "anubis-o-gato-da-morte") p.resurrectedAnubis = false;
    const u = makeUnit(g, seat, card.id, x, y);
    g.units.push(u);
    summonEffects(g, u, c.targetId2 || c.targetId);
    refreshAuras(g);
    g.log.push(
      u.statuses?.hidden
        ? "Uma carta foi invocada oculta."
        : `${card.name} invocado.`,
    );
    return;
  }
  if (c.type === "move" || c.type === "attack") {
    if (g.phase !== 2 || g.phaseOwner !== seat)
      return "Movimente na sua fase de Movimento.";
    const u = g.units.find((u) => u.id === c.unitId && u.owner === seat);
    if (!u || !["unit", "omionji"].includes(u.kind))
      return "Selecione uma unidade sua.";
    if (
      g.moved.includes(u.id) ||
      u.summonedTurn === g.turn ||
      u.statuses?.stun ||
      u.statuses?.softStun
    )
      return "Essa unidade não pode mover neste turno.";
    let path = route(g, u, c.x!, c.y!),
      target =
        c.type === "attack"
          ? g.units.find((t) => t.id === c.targetId)
          : at(g, c.x!, c.y!);
    const flower = (g.flowers || []).find(
      (f) => f.id === c.targetId && f.owner !== seat,
    );
    if (flower) {
      const distance = Math.max(
          Math.abs(u.x - flower.x),
          Math.abs(u.y - flower.y),
        ),
        range = Math.max(kw(u, "Range"), Number(u.statuses?.range || 0));
      const path = route(g, u, flower.x, flower.y);
      if (
        !(range && distance <= range) &&
        (!path || !path.length || path.length > u.speed)
      )
        return "Flor fora de alcance.";
      if ((g.moveCounts ??= [0, 0])[seat] >= 2 && !spend(p, 1))
        return "PE insuficiente para mover outra unidade.";
      const token: Unit = {
        id: flower.id,
        cardId: "flor",
        owner: flower.owner,
        x: flower.x,
        y: flower.y,
        hp: 1,
        maxHp: 1,
        attack: 0,
        speed: 0,
        summonedTurn: 0,
        kind: "wall",
      };
      if (u.attack > 0) {
        const linkedUnit = g.units.find((t) => t.id === flower.unitId);
        if (linkedUnit) destroy(g, linkedUnit, u);
        event(g, {
          type: "combat",
          attacker: structuredClone(u),
          defender: token,
          attackDamage: 1,
          defenseDamage: 0,
          keyword: "Vínculo da Flor",
          element: typesOf(u)[0],
        });
      }
      g.moved.push(u.id);
      g.moveCounts[seat]++;
      return;
    }
    const range = Math.max(kw(u, "Range"), Number(u.statuses?.range || 0)),
      ranged = c.type === "attack";
    if (ranged) {
      if (
        !target ||
        (target.owner === seat && target.kind !== "curse") ||
        !range ||
        Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y)) > range ||
        u.statuses?.intangivel
      )
        return "Alvo fora do alcance.";
    } else if (
      !path ||
      !path.length ||
      path.length > movementBudget(g, u, path)
    )
      return "Destino fora dos caminhos ou da velocidade disponível.";
    const count = (g.moveCounts ??= [0, 0])[seat];
    if (count >= 2 && !spend(p, 1)) return "Cada unidade adicional custa 1 PE.";
    g.moved.push(u.id);
    g.moveCounts![seat]++;
    g.actions++;
    if (target) {
      if (!ranged && path && path.length > 1)
        [u.x, u.y] = path[path.length - 2];
      g.combat = {
        attackerId: u.id,
        defenderId: target.id,
        x: target.x,
        y: target.y,
        ranged,
        returnPriority: seat,
      };
      g.passes = 0;
      g.priority = (1 - seat) as Seat;
      g.log.push(
        "Combate anunciado. Use magias rápidas ou passe a prioridade.",
      );
    } else {
      u.x = c.x!;
      u.y = c.y!;
      event(g, { type: "move", unitId: u.id, unit: u, path });
    }
    const terrain = g.terrain.find(
      (z) => z.x === u.x && z.y === u.y && z.kind === "lake",
    );
    if (terrain) {
      if (typesOf(u).includes("agua")) heal(g, u, 1);
      if (typesOf(u).includes("fogo")) takeDamage(g, u, 1);
    }
    refreshAuras(g);
    return;
  }
  if (c.type === "cast") {
    const index = c.handIndex ?? p.hand.indexOf(c.cardId!);
    if (!card || card.kind !== "spell" || p.hand[index] !== card.id)
      return "Magia inválida ou mão desatualizada.";
    if (card.stats.speed === "slow" && g.phase !== 3)
      return "Magia lenta apenas na fase de Magia.";
    const error = spellError(g, seat, c);
    if (error) return error;
    const extra = card.id === "mamoru-n-9-wonder-wall" ? c.extraPe || 0 : 0;
    if (
      !spend(
        p,
        card.stats.cost +
          extra +
          (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0),
      )
    )
      return "PE insuficiente.";
    p.hand.splice(index, 1);
    p.discard.push(card.id);
    event(g, {
      type: "cast",
      seat,
      cardId: card.id,
      targetId: c.targetId,
      x: c.x,
      y: c.y,
    });
    if (card.stats.speed === "instant")
      resolveSpell(
        g,
        seat,
        card.id,
        c.targetId,
        c.targetId2,
        c.x,
        c.y,
        c.extraPe,
        c.choice,
        c.x2,
        c.y2,
      );
    else {
      g.stack.push({ ...c, seat });
      g.priority = (1 - seat) as Seat;
      g.passes = 0;
      g.log.push(`${card.name} na pilha. O oponente pode responder.`);
    }
    return;
  }
  if (c.type === "discard" || c.type === "discardMany") {
    if (g.phase !== 4 || g.phaseOwner !== seat)
      return "Descarte na sua fase de Descarte.";
    const indices =
      c.type === "discardMany"
        ? c.handIndices || []
        : [c.handIndex ?? p.hand.indexOf(c.cardId!)];
    if (
      !indices.length ||
      new Set(indices).size !== indices.length ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)
    )
      return "Selecione cartas válidas da sua mão.";
    if (c.type === "discard" && c.cardId !== p.hand[indices[0]])
      return "Mão desatualizada.";
    if (p.permanentPe + indices.length > 3)
      return "Sua reserva comporta até 3 PE.";
    for (const i of [...indices].sort((a, b) => b - a)) {
      const id = p.hand.splice(i, 1)[0];
      p.discard.push(id);
      p.permanentPe++;
      event(g, { type: "discard", seat, cardId: id });
    }
    return;
  }
  if (c.type !== "pass") return "Comando inválido.";
  if (g.stack.length || g.combat) {
    g.passes++;
    if (g.passes < 2) {
      g.priority = (1 - seat) as Seat;
      return;
    }
    g.passes = 0;
    if (g.stack.length) {
      const top = g.stack.pop()!;
      resolveSpell(
        g,
        top.seat,
        top.cardId,
        top.targetId,
        top.targetId2,
        top.x,
        top.y,
        top.extraPe,
        top.choice,
        top.x2,
        top.y2,
      );
      if (!g.duel)
        g.priority = g.stack.length
          ? ((1 - g.stack.at(-1)!.seat) as Seat)
          : g.combat
            ? ((1 - g.combat.returnPriority) as Seat)
            : g.phaseOwner!;
    } else settleCombat(g);
    refreshAuras(g);
    return;
  }
  if (seat !== g.phaseOwner) {
    g.priority = g.phaseOwner!;
    return;
  }
  g.log.push(`Jogador ${seat + 1} encerrou ${phases[g.phase]}.`);
  if (g.phase === 2) endMovement(g, seat);
  if (seat === g.first) {
    g.phaseOwner = (1 - g.first) as Seat;
    g.priority = g.phaseOwner;
  } else {
    g.phase++;
    g.phaseOwner = g.first;
    g.priority = g.first;
    if (g.phase === 5) {
      endTurn(g);
      g.turn++;
      g.phase = 0;
      startTurn(g);
    } else enterPhase(g);
  }
  refreshAuras(g);
}

export {
  validateDeck,
  freshGame,
  apply,
  fight,
  startTurn,
  linked,
  connected,
  valid,
  neighbors,
  cards,
  allCards,
  phases,
  elements,
  pathLength,
  elementalDamage,
  summonCells,
  moveOptions,
  spellError,
  kw,
  route,
};
export type { Seat, DeckInput, Player, Unit, Game, Cmd };
