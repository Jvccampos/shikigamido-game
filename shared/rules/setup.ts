import { elements, cards } from "../cards.js";
import {
  type DeckInput,
  type Player,
  type Seat,
  type Unit,
  type Game,
} from "../model.js";
import { type RandomState, shuffle, randomState, random } from "../random.js";
import { draw } from "./core.js";

export function validateDeck(raw: unknown) {
  const input = raw as { element?: unknown; cardIds?: unknown } | null;
  if (!input || typeof input !== "object") return "Dados inválidos.";
  if (typeof input.element !== "string" || !elements.includes(input.element))
    return "Elemento inválido.";
  if (!Array.isArray(input.cardIds) || input.cardIds.length !== 30)
    return "O baralho deve ter 30 cartas.";
  if (input.cardIds.some((id: unknown) => typeof id !== "string"))
    return "Carta inválida.";
  if (
    input.cardIds.some(
      (id: string) =>
        (input.cardIds as string[]).filter((x: string) => x === id).length > 2,
    )
  )
    return "Máximo de 2 cópias da mesma carta.";
  const set = input.cardIds
    .map((id: string) => cards.get(id))
    .filter(Boolean) as NonNullable<ReturnType<typeof cards.get>>[];
  if (set.length !== 30) return "Carta desconhecida.";
  if (set.some((c) => c.kind === "omionji"))
    return "Omionji fica fora das 30 cartas.";
  if (set.filter((c) => c.types.includes(input.element as string)).length < 20)
    return "Ao menos 20 cartas devem conter o elemento principal.";
  if (
    set.some(
      (c) => c.kind === "spell" && !c.types.includes(input.element as string),
    )
  )
    return "Toda magia deve conter o elemento principal.";
  return null;
}

function makePlayer(
  id: string,
  d: DeckInput,
  source: RandomState | undefined,
): Player {
  const library = shuffle(d.cardIds, source);
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
  const card = cards.get(`omionji-${element}`);
  if (card?.kind !== "omionji") throw Error("Omionji inválido.");
  return {
    id: `o${owner}`,
    cardId: `omionji-${element}`,
    owner,
    x: owner ? 6 : 0,
    y: owner ? 4 : 2,
    hp: card.stats.health,
    maxHp: card.stats.health,
    attack: card.stats.attack,
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

export const RULES_VERSION = 1;

export function freshGame(
  hostId: string,
  guestId: string,
  a: DeckInput,
  b: DeckInput,
  seed?: number,
): Game {
  const source = randomState(seed);
  const rolls: [number, number][] = [];
  do {
    rolls.push([
      1 + Math.floor(random(source) * 6),
      1 + Math.floor(random(source) * 6),
    ]);
  } while (rolls.at(-1)![0] === rolls.at(-1)![1]);
  const first = (rolls.at(-1)![0] > rolls.at(-1)![1] ? 0 : 1) as Seat;
  return {
    rulesVersion: RULES_VERSION,
    random: source,
    sequence: 0,
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
    players: [makePlayer(hostId, a, source), makePlayer(guestId, b, source)],
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
