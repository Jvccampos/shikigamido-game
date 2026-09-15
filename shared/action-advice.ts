import { unitChanges } from "./unit-changes.js";
export { unitChanges } from "./unit-changes.js";
import { apply } from "./game.js";
import { cards } from "./cards.js";
import { spellSpecs, transferableKeywords } from "./spells.js";
import { abilities } from "./abilities.js";
import type { GameView, UnitView } from "./room.js";
import type { CommandDraft, Game, Seat, Unit } from "./model.js";
import { connected, route, summonCells } from "./rules/board.js";
import { elementModifier } from "./elements.js";
import { kw, typesOf } from "./rules/core.js";
import { settleCombat } from "./rules/combat.js";
import { resolveSpell } from "./rules/spells.js";

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
        : "Carta oculta");

// Advice has only the same redacted information as its viewer. Never consult
// private decks or live RNG, and never execute a preview against the live game.
export function adviceState(view: GameView): Game {
  const library = (seat: number) => [
    ...new Set([
      ...view.players[seat].summonableDeck,
      ...(view.searches || [])
        .filter((s) => s.seat === seat && s.zone === "library")
        .flatMap((s) => s.options),
    ]),
  ];
  const visible = {
    ...view,
    events: [],
    pending: [],
    centerChoices: {},
  };
  return structuredClone({
    ...visible,
    units: view.units.map((u): Unit =>
      u.cardId === "hidden"
        ? {
            ...u,
            hp: 0,
            maxHp: 0,
            attack: 0,
            speed: 0,
            summonedTurn: 0,
          }
        : (u as Unit),
    ),
    players: [
      { ...view.players[0], library: library(0) },
      { ...view.players[1], library: library(1) },
    ],
    pending: [],
    centerChoices: {},
    events: [],
    random: { state: 1729 },
  });
}
export function commandError(g: GameView, seat: number, cmd: CommandDraft) {
  if (seat !== 0 && seat !== 1) return "Você está assistindo ao duelo.";
  return apply(adviceState(g), seat, cmd);
}
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
  if (target === "none") {
    yield base;
    return;
  }
  if (target === "discardVoid" || target === "discardCat") {
    for (const choice of new Set(g.players[seat].discard)) {
      if (target === "discardVoid") yield { ...base, choice };
      else
        for (const cell of summonCells(g, seat))
          yield { ...base, choice, ...cell };
    }
    return;
  }
  if (["cell", "lake", "wind"].includes(target)) {
    for (const cell of boardCells) {
      if (target !== "wind") yield { ...base, ...cell };
      else
        for (const end of boardCells.filter(
          (v) =>
            (v.x === cell.x || v.y === cell.y) &&
            connected(g, cell.x, cell.y, v.x, v.y),
        ))
          yield { ...base, ...cell, x2: end.x, y2: end.y };
    }
    return;
  }
  for (const u of units) {
    if (target === "move") {
      if (u.owner !== seat || u.kind !== "unit") continue;
      for (const cell of boardCells.filter((v) =>
        connected(g, u.x, u.y, v.x, v.y),
      ))
        yield { ...base, targetId: u.id, ...cell };
    } else if (["twoAllies", "twoUnits", "redirect"].includes(target)) {
      if (u.kind !== "unit") continue;
      for (const other of units.filter(
        (v) => v.id !== u.id && v.kind === "unit",
      )) {
        if (spec.choice === "keyword") {
          for (const choice of transferableKeywords.filter((k) => kw(u, k)))
            yield { ...base, targetId: u.id, targetId2: other.id, choice };
        } else yield { ...base, targetId: u.id, targetId2: other.id };
      }
    } else yield { ...base, targetId: u.id };
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

export type CombatantPreview = {
  before: UnitView;
  after?: UnitView;
  damage?: number;
  defeated?: boolean;
};
export type CombatPreview = {
  attacker: CombatantPreview;
  defender: CombatantPreview;
  resolved: boolean;
  announced: boolean;
  keyword?: string;
  modifier?: number;
};
export type ActionPreview = {
  title: string;
  cost: number;
  error?: string;
  affected: string[];
  path: [number, number][];
  uncertainty?: "stack" | "hidden" | "random" | "search";
  combat?: CombatPreview;
};
export function previewAction(
  g: GameView,
  seat: number,
  c: CommandDraft,
): ActionPreview {
  const cost = actionCost(g, seat, c);
  const result: ActionPreview = {
    title:
      c.type === "move"
        ? "Mover"
        : c.type === "attack"
          ? "Atacar à distância"
          : c.type === "summon"
            ? "Invocar"
            : c.type === "ability"
              ? "Usar habilidade"
              : "Conjurar",
    cost,
    affected: [],
    path: [],
  };
  if (seat !== 0 && seat !== 1) return { ...result, error: "Modo espectador" };
  const state = adviceState(g);
  result.error = apply(state, seat, c);
  if (result.error) return result;
  const mover = g.units.find((u) => u.id === c.unitId);
  if (c.type === "move" && mover)
    result.path = [[mover.x, mover.y], ...(route(g, mover, c.x!, c.y!) || [])];
  const combat = state.combat || g.combat;
  const forecastsCombat =
    combat &&
    (c.type === "pass" ||
      ((c.type === "move" || c.type === "attack" || c.type === "ability") &&
        !g.combat));
  const unknown = g.units.some((u) => u.cardId === "hidden");
  const randomCombat = g.units.some(
    (u) =>
      (u.id === combat?.attackerId || u.id === c.targetId) &&
      (u.cardId === "cachorro-do-mato" || u.statuses?.fireball),
  );
  if (forecastsCombat) {
    result.title =
      c.type === "pass"
        ? "Combate anunciado"
        : c.type === "attack"
          ? "Ataque à distância"
          : "Iniciar combate";
    const attacker = g.units.find((u) => u.id === combat.attackerId);
    const defender = g.units.find((u) => u.id === combat.defenderId);
    if (attacker && defender)
      result.combat = {
        attacker: { before: attacker },
        defender: { before: defender },
        resolved: false,
        announced: c.type === "pass",
      };
  }
  if (result.combat && g.stack.length) {
    result.uncertainty = "stack";
    return result;
  }
  if (unknown || randomCombat) {
    result.uncertainty = unknown ? "hidden" : "random";
    return result;
  }
  if (forecastsCombat && state.combat) settleCombat(state);
  if (forecastsCombat && combat) {
    const a = g.units.find((u) => u.id === combat.attackerId),
      d = g.units.find((u) => u.id === combat.defenderId);
    if (a && d) {
      const modifier = kw(a, "Amaldiçoado")
        ? 0
        : typesOf(a).reduce(
            (total, type) =>
              total +
              typesOf(d).reduce(
                (sum, other) => sum + elementModifier(type, other),
                0,
              ),
            0,
          );
      if (result.combat) result.combat.modifier = modifier;
    }
  }
  if (c.type === "cast" && cards.get(c.cardId!)?.stats.speed !== "instant") {
    state.stack.pop();
    resolveSpell(state, seat, { ...c, cardId: c.cardId! });
  }
  const fight = state.events?.find((e) => e.type === "combat");
  if (result.combat && fight?.type === "combat") {
    result.combat.resolved = true;
    result.combat.keyword = fight.keyword;
    for (const [side, damage] of [
      [result.combat.attacker, fight.defenseDamage],
      [result.combat.defender, fight.attackDamage],
    ] as const) {
      side.after = state.units.find((u) => u.id === side.before.id);
      side.damage = damage;
      side.defeated = state.events?.some(
        (e) => e.type === "destroy" && e.unitId === side.before.id,
      );
    }
  }
  result.affected = g.units
    .filter((before) => {
      const after = state.units.find((u) => u.id === before.id);
      return !after || unitChanges(before, after).length > 0;
    })
    .map((u) => u.id);
  if (g.stack.length) result.uncertainty = "stack";
  if (
    forecastsCombat &&
    g.units.some((u) =>
      ["oni-azul", "kirijin-o-oni-da-fumaca"].includes(u.cardId),
    )
  )
    result.uncertainty = "search";
  return result;
}
