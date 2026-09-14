import source from "../data/cards.json" with { type: "json" };

export const elements = ["agua", "fogo", "terra", "vento", "vazio"];
export type Card = {
  id: string;
  name: string;
  types: string[];
  effect_text: string;
  asset: string;
  artwork?: { url?: string };
} & (
  | {
      kind: "unit" | "omionji";
      stats: { cost: number; attack: number; health: number; speed: number };
    }
  | {
      kind: "spell";
      stats: {
        cost: number;
        speed: "slow" | "fast" | "instant";
        attack?: never;
        health?: never;
      };
    }
);

const ids = new Set<string>();
for (const card of source.cards) {
  if (!card.id || ids.has(card.id))
    throw Error(`ID de carta inválido ou repetido: ${card.id}`);
  ids.add(card.id);
  if (
    !card.name ||
    !card.effect_text ||
    !card.asset.startsWith("/assets/cards/") ||
    !["unit", "omionji", "spell"].includes(card.kind) ||
    !card.types.length ||
    card.types.some((type) => !elements.includes(type)) ||
    !Number.isInteger(card.stats.cost) ||
    card.stats.cost < 0
  )
    throw Error(`Carta inválida: ${card.id}`);
  if (card.kind === "spell") {
    if (!["slow", "fast", "instant"].includes(String(card.stats.speed)))
      throw Error(`Velocidade de magia inválida: ${card.id}`);
  } else if (
    [card.stats.attack, card.stats.health, card.stats.speed].some(
      (value) =>
        typeof value !== "number" || !Number.isInteger(value) || value < 0,
    )
  ) {
    throw Error(`Atributos inválidos: ${card.id}`);
  }
}
export const allCards = source.cards as Card[];
export const cards = new Map(allCards.map((card) => [card.id, card]));
