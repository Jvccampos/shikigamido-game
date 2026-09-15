import { cards } from "../cards.js";
import type { CardSearch, Cmd, Game, Seat } from "../model.js";
import { event, uid } from "./core.js";
import { shuffle } from "../random.js";

export function searchOptions(g: Game, search: CardSearch): string[] {
  return [
    ...new Set(
      g.players[search.seat][search.zone].filter(
        (id) =>
          cards.get(id)?.kind === "unit" &&
          (search.family === "taodu"
            ? id.startsWith("taodu-")
            : /gato|neko/.test(id)),
      ),
    ),
  ].sort();
}
export function requestSearch(g: Game, search: Omit<CardSearch, "id">) {
  (g.searches ??= []).push({ ...search, id: uid(g) });
}
export function resolveSearch(g: Game, seat: Seat, c: Cmd) {
  const search = g.searches?.[0];
  if (!search || c.promptId !== search.id)
    return "Esta busca já foi resolvida ou está desatualizada.";
  if (search.seat !== seat) return "Aguarde o outro jogador concluir a busca.";
  const options = searchOptions(g, search);
  const skip = c.choice === "skip";
  if (skip && !search.optional && options.length)
    return "Escolha uma carta para adicionar à mão.";
  if (!skip && (!c.cardId || !options.includes(c.cardId)))
    return "Escolha uma das cartas disponíveis nesta busca.";
  const p = g.players[seat];
  if (!skip) {
    const i = p[search.zone].indexOf(c.cardId!);
    p.hand.push(p[search.zone].splice(i, 1)[0]);
  }
  if (search.zone === "library") p.library = shuffle(p.library, g.random);
  g.searches!.shift();
  const outcome = !options.length ? "empty" : skip ? "skipped" : "chosen";
  event(g, {
    type: "search",
    seat,
    sourceCardId: search.sourceCardId,
    zone: search.zone,
    outcome,
    cardId: skip ? undefined : c.cardId,
  });
}
