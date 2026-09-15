import {
  type Player,
  type Game,
  type Unit,
  type EventPayload,
  type Seat,
} from "../model.js";
import { cards } from "../cards.js";
import { baseKeywords, keywordStatuses } from "../keywords.js";

export const phases = ["Compra", "Invocação", "Movimento", "Magia", "Descarte"];

export const draw = (p: Player, n = 1) => {
  while (n-- && p.library.length) p.hand.push(p.library.shift()!);
};

export const spend = (p: Player, cost: number) => {
  if (p.pe + p.permanentPe < cost) return false;
  const normal = Math.min(p.pe, cost);
  p.pe -= normal;
  p.permanentPe -= cost - normal;
  return true;
};

export const uid = (g: Game) => `id-${(g.sequence = (g.sequence || 0) + 1)}`;

export function cardOf(u: Pick<Unit, "cardId">) {
  return cards.get(u.cardId);
}

export function kw(u: Pick<Unit, "cardId" | "statuses">, key: string): number {
  if (u.statuses?.stolenKeyword === key) return 0;
  const printed = Math.max(
    baseKeywords[u.cardId]?.[key] || 0,
    Number(u.statuses?.[key] || 0),
  );
  const granted = keywordStatuses[key];
  const value = Number(u.statuses?.[granted?.field] || 0);
  return granted?.stacks ? printed + value : Math.max(printed, value);
}

export function typesOf(
  u: Pick<Unit, "cardId" | "statuses" | "kind">,
): string[] {
  if (u.cardId === "chama-marinha" && !u.statuses?.chosenElement)
    return [cardOf(u)!.types[0]];
  return u.statuses?.chosenElement
    ? [u.statuses.chosenElement]
    : [
        ...(cardOf(u)?.types ||
          (u.kind === "omionji" ? [u.cardId.replace("omionji-", "")] : [])),
        ...(u.statuses?.extraTypes || []),
      ];
}

export const adjacent = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;

export const alive = (g: Game, u: Unit) => g.units.some((x) => x.id === u.id);

export const event = <T extends EventPayload>(
  g: Game,
  e: T,
): T & { id: string; turn: number; phase: number } => {
  const snapshot = structuredClone({
    id: uid(g),
    turn: g.turn,
    phase: g.phase,
    ...e,
  });
  (g.events ??= []).push(snapshot);
  g.events = g.events.slice(-400);
  return snapshot;
};

export function makeUnit(
  g: Game,
  seat: Seat,
  cardId: string,
  x: number,
  y: number,
): Unit {
  const card = cards.get(cardId);
  if (!card || card.kind === "spell")
    throw Error("Apenas criaturas podem ser invocadas.");
  return {
    id: uid(g),
    cardId,
    owner: seat,
    x,
    y,
    hp: card.stats.health,
    maxHp: card.stats.health,
    attack: card.stats.attack,
    speed: card.stats.speed,
    summonedTurn: g.turn,
    kind: card.kind === "curse" ? "curse" : "unit",
    statuses: {
      shield: card.id === "garca-pacificadora",
      hidden: card.kind !== "curse" && g.players[seat].concealTurn === g.turn,
    },
  };
}
