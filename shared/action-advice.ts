export { unitChanges } from "./unit-changes.js";
import { cards } from "./cards.js";
import { spellSpecs, transferableKeywords } from "./spells.js";
import { abilities } from "./abilities.js";
import type { GameView, UnitView } from "./room.js";
import type { CommandDraft, Seat } from "./model.js";
import { connected, summonCells } from "./rules/board.js";
import { kw } from "./rules/core.js";
import {
  commandError,
  forecastAction,
  type ActionForecast,
} from "./rules/forecast.js";
export { commandError } from "./rules/forecast.js";

export const boardCells = Array.from({ length: 49 }, (_, i) => ({
  x: i % 7,
  y: Math.floor(i / 7),
}));
export const pieceName = (u?: UnitView) =>
  cards.get(u?.cardId || "")?.name ||
  (u?.kind === "curse"
    ? "Maldição"
    : u?.kind === "crystal"
      ? "Cristal"
      : u?.kind === "wall"
        ? "Parede"
        : u?.kind === "rift"
          ? "Fenda do Vazio"
          : "Carta oculta");

export function actionCost(g: GameView, seat: number, c: CommandDraft) {
  const p = g.players[seat];
  if (!p) return 0;
  if (c.type === "cast" || c.type === "summon")
    return (
      (cards.get(c.cardId || "")?.stats.cost || 0) +
      (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0) +
      (spellSpecs[c.cardId || ""]?.amount === "energy" ? c.extraPe || 0 : 0)
    );
  if (c.type === "move" || c.type === "attack")
    return (g.moveCounts?.[seat] || 0) >= 2 ? 1 : 0;
  const u = g.units.find((u) => u.id === c.unitId);
  if (c.type === "ability") {
    if (
      ["omionji-fogo", "ichiki-o-despertar-do-elemento"].includes(
        u?.cardId || "",
      )
    )
      return 1;
    if (u?.cardId === "espirito-da-arvore")
      return (g.moveCounts?.[seat] || 0) >= 2 ? 1 : 0;
  }
  return 0;
}
export function movementReason(g: GameView, u: UnitView) {
  if (u.cardId === "hidden") return "Informações ocultas";
  if (!["unit", "omionji", "curse"].includes(u.kind)) return "Peça fixa";
  if (u.statuses?.stun) return "Atordoado";
  if (u.statuses?.softStun) return "Imobilizado";
  if (u.summonedTurn === g.turn) return "Invocado neste turno";
  if (u.kind !== "curse" && g.moved.includes(u.id)) return "Movimento usado";
  if (!u.speed) return "Sem velocidade";
  return undefined;
}

function* spellCandidates(
  g: GameView,
  seat: Seat,
  base: CommandDraft,
): Generator<CommandDraft> {
  const spec = spellSpecs[base.cardId!];
  if (!spec) return;
  const units = g.units;
  const target = spec.target;
  const candidateBase =
    spec.amount === "energy" ? { ...base, extraPe: 1 } : base;
  if (target === "none") {
    yield candidateBase;
    return;
  }
  if (target === "discardVoid" || target === "discardCat") {
    for (const choice of new Set(g.players[seat].discard)) {
      if (target === "discardVoid") yield { ...candidateBase, choice };
      else
        for (const cell of summonCells(g, seat))
          yield { ...candidateBase, choice, ...cell };
    }
    return;
  }
  if (["cell", "lake", "wind", "rift"].includes(target)) {
    for (const cell of boardCells) {
      if (target !== "wind") yield { ...candidateBase, ...cell };
      else
        for (const end of boardCells.filter(
          (v) =>
            (v.x === cell.x || v.y === cell.y) &&
            connected(g, cell.x, cell.y, v.x, v.y),
        ))
          yield { ...candidateBase, ...cell, x2: end.x, y2: end.y };
    }
    return;
  }
  for (const u of units) {
    if (target === "move") {
      if (u.owner !== seat || u.kind !== "unit") continue;
      for (const cell of boardCells.filter((v) =>
        connected(g, u.x, u.y, v.x, v.y),
      ))
        yield { ...candidateBase, targetId: u.id, ...cell };
    } else if (["twoAllies", "twoUnits", "redirect"].includes(target)) {
      if (u.kind !== "unit") continue;
      for (const other of units.filter(
        (v) => v.id !== u.id && v.kind === "unit",
      )) {
        if (spec.choice === "keyword") {
          for (const choice of transferableKeywords.filter((k) => kw(u, k)))
            yield {
              ...candidateBase,
              targetId: u.id,
              targetId2: other.id,
              choice,
            };
        } else yield { ...candidateBase, targetId: u.id, targetId2: other.id };
      }
    } else yield { ...candidateBase, targetId: u.id };
  }
}
export function* abilityCandidates(
  g: GameView,
  u: UnitView,
): Generator<CommandDraft> {
  const base: CommandDraft = { type: "ability", unitId: u.id };
  if (u.cardId === "chama-marinha") {
    for (const choice of cards.get(u.cardId)!.types) yield { ...base, choice };
  } else if (u.cardId === "javali-espinhoso") yield base;
  else if (u.cardId === "cabra-dos-alpes" || kw(u, "Construir")) {
    for (const cell of boardCells) yield { ...base, ...cell };
  } else
    for (const target of g.units) {
      if (u.cardId === "omionji-vento" || u.cardId === "espirito-da-arvore") {
        if (
          Math.max(Math.abs(target.x - u.x), Math.abs(target.y - u.y)) > 1 &&
          u.cardId === "omionji-vento"
        )
          continue;
        for (const cell of boardCells.filter(
          (v) =>
            Math.max(Math.abs(v.x - target.x), Math.abs(v.y - target.y)) === 1,
        ))
          yield { ...base, targetId: target.id, ...cell };
      } else yield { ...base, targetId: target.id };
    }
}
export type ActionPlan = {
  cost: number;
  reason?: string;
  options: CommandDraft[];
};
export function cardPlan(
  g: GameView,
  seat: number,
  cardId: string,
  handIndex: number,
  fromDeck = false,
): ActionPlan {
  const card = cards.get(cardId);
  const base: CommandDraft = {
    type: card?.kind === "unit" ? "summon" : "cast",
    cardId,
    handIndex,
    choice: fromDeck ? "library" : undefined,
  };
  const cost = actionCost(g, seat, base);
  const unavailable = (reason: string): ActionPlan => ({
    cost,
    reason,
    options: [],
  });
  if (seat !== 0 && seat !== 1) return unavailable("Modo espectador");
  if (g.setup) return unavailable("Preparação da mão inicial");
  if (g.searches?.length) return unavailable("Conclua a busca de carta");
  if (g.winner !== null || g.draw) return unavailable("Partida encerrada");
  if (g.centerPending) return unavailable("Escolha seu avanço ao centro");
  if (g.followup || g.duel)
    return unavailable("Conclua a escolha no tabuleiro");
  if (card?.kind === "unit" && (g.phase !== 1 || g.phaseOwner !== seat))
    return unavailable("Na sua fase de Invocação");
  if (card?.kind === "spell" && card.stats.speed === "slow" && g.phase !== 3)
    return unavailable("Magia lenta · fase de Magia");
  if (
    g.priority !== seat &&
    (card?.kind !== "spell" || card.stats.speed === "slow")
  )
    return unavailable("Aguarde sua prioridade");
  const ritual =
    card?.kind === "unit" &&
    g.units.some(
      (u) => u.owner === seat && u.statuses?.sacrificeTurn === g.turn,
    );
  if (!ritual && cost > g.players[seat].pe + g.players[seat].permanentPe)
    return unavailable(
      `Faltam ${cost - g.players[seat].pe - g.players[seat].permanentPe} PE`,
    );
  const candidates: CommandDraft[] =
    card?.kind === "unit"
      ? [
          ...summonCells(g, seat).map((cell) => ({ ...base, ...cell })),
          ...g.units
            .filter(
              (u) =>
                u.owner === seat &&
                u.kind === "unit" &&
                (u.statuses?.sacrificeTurn === g.turn ||
                  cardId === "anubis-o-gato-da-morte"),
            )
            .map((u) => ({ ...base, targetId: u.id, x: u.x, y: u.y })),
        ]
      : [...spellCandidates(g, seat, base)];
  const options = candidates.filter((c) => !commandError(g, seat, c));
  return {
    cost,
    options,
    reason: options.length
      ? undefined
      : g.combat || g.stack.length
        ? commandError(g, seat, base) || "Nenhum alvo válido nesta resposta"
        : card?.kind === "unit"
          ? "Sem local ou sacrifício válido para invocar"
          : "Nenhum alvo ou escolha válida agora",
  };
}
export function abilityPlan(
  g: GameView,
  seat: number,
  u: UnitView,
): ActionPlan {
  const options = [...abilityCandidates(g, u)].filter(
    (c) => !commandError(g, seat, c),
  );
  return {
    cost: actionCost(g, seat, { type: "ability", unitId: u.id }),
    options,
    reason: options.length
      ? undefined
      : commandError(g, seat, { type: "ability", unitId: u.id }) ||
        "Nenhum alvo válido",
  };
}
export function hasAbility(u: UnitView) {
  return !!abilities[u.cardId] || !!kw(u, "Construir");
}

export type { CombatantPreview, CombatPreview } from "./rules/forecast.js";
export type ActionPreview = Omit<ActionForecast, "combatKind"> & {
  title: string;
  cost: number;
};
export function previewAction(
  g: GameView,
  seat: number,
  c: CommandDraft,
): ActionPreview {
  const { combatKind, ...forecast } = forecastAction(g, seat, c);
  return {
    ...forecast,
    title:
      combatKind === "announced"
        ? "Combate anunciado"
        : combatKind === "ranged"
          ? "Ataque à distância"
          : combatKind === "melee"
            ? "Iniciar combate"
            : c.type === "move"
              ? "Mover"
              : c.type === "attack"
                ? "Atacar à distância"
                : c.type === "summon"
                  ? "Invocar"
                  : c.type === "ability"
                    ? "Usar habilidade"
                    : "Conjurar",
    cost: actionCost(g, seat, c),
  };
}
