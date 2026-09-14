import type { RandomState } from "./random.js";
export type Seat = 0 | 1;
export type DeckInput = {
  name: string;
  element: string;
  cardIds: string[];
  omionji: string;
};
export type Player = {
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
export type Unit = {
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
export type Game = {
  rulesVersion?: number;
  random?: RandomState;
  sequence?: number;
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
  events?: GameEvent[];
  revision?: number;
  draw?: boolean;
  turn: number;
  phase: number;
  priority: Seat;
  first: Seat;
  players: [Player, Player];
  units: Unit[];
  pending: { unit: Unit; returnTurn: number }[];
  stack: (Cmd & { seat: Seat; cardId: string })[];
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
export const commandTypes = [
  "concede",
  "mulligan",
  "ready",
  "center",
  "duel",
  "followup",
  "pass",
  "ability",
  "summon",
  "move",
  "attack",
  "cast",
  "discard",
  "discardMany",
] as const;
export type Cmd = {
  type: (typeof commandTypes)[number];
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

/** Events describe completed commands. Unit snapshots must never share mutable state. */
export type EventPayload =
  | { type: "turn"; phase: number }
  | { type: "summon"; unit: Unit }
  | { type: "ability"; unit: Unit }
  | { type: "destroy"; unitId: string; unit: Unit }
  | {
      type: "move" | "approach";
      unitId: string;
      unit: Unit;
      path: [number, number][];
    }
  | { type: "heal"; unitId: string; amount: number }
  | { type: "shield"; unitId: string }
  | { type: "concede"; seat: Seat }
  | { type: "discard"; seat: Seat; cardId: string }
  | {
      type: "cast";
      seat: Seat;
      cardId: string;
      targetId?: string;
      x?: number;
      y?: number;
    }
  | {
      type: "spell";
      seat: Seat;
      cardId: string;
      targetId?: string;
      x?: number;
      y?: number;
      element: string;
      beforeTarget?: Unit;
      afterTarget?: Unit;
    }
  | {
      type: "combat";
      attacker: Unit;
      defender: Unit;
      attackDamage: number;
      defenseDamage: number;
      keyword: string;
      element?: string;
    };
export type GameEvent = EventPayload & {
  id: string;
  turn: number;
  phase: number;
};

/** Validate untrusted command shape; legality and costs belong to the rules engine. */
export function isCommand(value: unknown): value is Cmd {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (
    typeof c.type !== "string" ||
    !(commandTypes as readonly string[]).includes(c.type)
  )
    return false;
  const strings = ["cardId", "unitId", "targetId", "targetId2", "choice"];
  const numbers = ["x", "y", "x2", "y2", "extraPe", "handIndex"];
  const allowed = new Set([
    "type",
    ...strings,
    ...numbers,
    "cardIds",
    "handIndices",
  ]);
  if (Object.keys(c).some((k) => !allowed.has(k))) return false;
  const text = (v: unknown) => typeof v === "string" && v.length <= 120;
  const integer = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v);
  return (
    strings.every((k) => c[k] === undefined || text(c[k])) &&
    numbers.every((k) => c[k] === undefined || integer(c[k])) &&
    (c.cardIds === undefined ||
      (Array.isArray(c.cardIds) &&
        c.cardIds.length <= 30 &&
        c.cardIds.every(text))) &&
    (c.handIndices === undefined ||
      (Array.isArray(c.handIndices) &&
        c.handIndices.length <= 30 &&
        c.handIndices.every(integer)))
  );
}
