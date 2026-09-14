import {
  type Player,
  type Game,
  type Unit,
  type EventPayload,
  type Seat,
} from "../model.js";
import { cards } from "../cards.js";
import { baseKeywords } from "../keywords.js";

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

export function keyword(text: string, name: string) {
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

export function kw(u: Pick<Unit, "cardId" | "statuses">, key: string): number {
  if (u.statuses?.stolenKeyword === key) return 0;
  return Math.max(
    baseKeywords[u.cardId]?.[key] || 0,
    Number(u.statuses?.[key] || 0),
  );
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
      shield: card.id !== "potaru" && keyword(card.effect_text, "Escudo") > 0,
      hidden: card.kind !== "curse" && g.players[seat].concealTurn === g.turn,
    },
  };
}
