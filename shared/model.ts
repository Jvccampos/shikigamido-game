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
export type StatusValue = number | boolean | string | string[] | undefined;
export type UnitStatuses = {
  [key: string]: StatusValue;
  [expiry: `${string}Until`]: number | undefined;
  abilityTurn?: number;
  speedLoss?: number;
  speedLossSources?: string[];
  auraHp?: number;
  auraSpeed?: number;
  block?: number;
  burn?: number;
  burnAttack?: number;
  combatAttack?: number;
  construir?: boolean;
  deathDrawTurn?: number;
  devolver?: number;
  dualAttack?: number;
  dualMaxHp?: number;
  dualSpeed?: number;
  dualSpeedLoss?: number;
  dualSpeedLossSources?: string[];
  fedSpeed?: boolean;
  fisherBoost?: number;
  healDrawTurn?: number;
  lifesteal?: number;
  once?: boolean;
  oniKills?: number;
  primordialBoost?: number;
  range?: number;
  redirectAmount?: number;
  ressurgir?: number;
  shidaroBoost?: number;
  temporaryAttack?: number;
  controlTurn?: number;
  sacrificeTurn?: number;
  centerBonus?: boolean;
  copy?: boolean;
  fireball?: boolean;
  forged?: boolean;
  healSplash?: boolean;
  hidden?: boolean;
  intangivel?: boolean;
  primordial?: boolean;
  resurrected?: boolean;
  shield?: boolean;
  softStun?: number;
  stun?: boolean;
  bond?: string;
  borrowed?: string;
  chosenElement?: string;
  redirect?: string;
  stolenKeyword?: string;
  extraTypes?: string[];
  controlOwner?: Seat;
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
  statuses?: UnitStatuses;
  captured?: Unit[];
  equipment?: Unit[];
};
export type CardSearch = {
  id: string;
  seat: Seat;
  sourceCardId: string;
  zone: "library" | "discard";
  family: "taodu" | "cat";
  optional: boolean;
};
export type Game = {
  searches?: CardSearch[];
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
  "search",
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
/** A UI selection may be incomplete; only Cmd can cross the command boundary. */
export type CommandDraft = {
  promptId?: string;
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

export type Cmd = CommandDraft &
  (
    | { type: "concede" | "pass" | "mulligan" | "center" | "duel" }
    | { type: "ready"; y: number }
    | { type: "search"; promptId: string }
    | { type: "followup"; x: number; y: number }
    | { type: "ability"; unitId: string }
    | { type: "move"; unitId: string; x: number; y: number }
    | { type: "attack"; unitId: string; targetId: string }
    | { type: "cast"; cardId: string }
    | ({ type: "summon"; cardId: string } & (
        { x: number; y: number } | { targetId: string }
      ))
    | ({ type: "discard" } & ({ cardId: string } | { handIndex: number }))
    | { type: "discardMany"; handIndices: number[] }
  );

/** Events describe completed commands. Unit snapshots must never share mutable state. */
export type EventPayload<U = Unit> =
  | {
      type: "search";
      seat: Seat;
      sourceCardId: string;
      zone: "library" | "discard";
      outcome: "chosen" | "skipped" | "empty";
      cardId?: string;
    }
  | { type: "turn"; phase: number }
  | { type: "summon"; unit: U }
  | { type: "ability"; unit: U }
  | { type: "destroy"; unitId: string; unit: U }
  | {
      type: "move" | "approach";
      unitId: string;
      unit: U;
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
      beforeTarget?: U;
      afterTarget?: U;
      changes?: { before?: U; after?: U }[];
    }
  | {
      type: "combat";
      attacker: U;
      defender: U;
      attackDamage: number;
      defenseDamage: number;
      keyword: string;
      element?: string;
    };
export type GameEvent<U = Unit> = EventPayload<U> & {
  id: string;
  turn: number;
  phase: number;
};

/** Validate untrusted command shape; legality and costs belong to the rules engine. */
function isCommandDraft(value: unknown): value is CommandDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (
    typeof c.type !== "string" ||
    !(commandTypes as readonly string[]).includes(c.type)
  )
    return false;
  const strings = [
    "cardId",
    "unitId",
    "targetId",
    "targetId2",
    "choice",
    "promptId",
  ];
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

/** Required fields for a submitted action, independent of game legality. */
export function isCommand(value: unknown): value is Cmd {
  if (!isCommandDraft(value)) return false;
  const c = value;
  switch (c.type) {
    case "ready":
      return c.y !== undefined;
    case "search":
      return !!c.promptId;
    case "followup":
      return c.x !== undefined && c.y !== undefined;
    case "ability":
      return !!c.unitId;
    case "move":
      return !!c.unitId && c.x !== undefined && c.y !== undefined;
    case "attack":
      return !!c.unitId && !!c.targetId;
    case "cast":
      return !!c.cardId;
    case "summon":
      return (
        !!c.cardId && (!!c.targetId || (c.x !== undefined && c.y !== undefined))
      );
    case "discard":
      return !!c.cardId || c.handIndex !== undefined;
    case "discardMany":
      return !!c.handIndices;
    default:
      return true;
  }
}
