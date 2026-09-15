import { apply } from "../game.js";
import { cards } from "../cards.js";
import type { CommandDraft, Game, Unit } from "../model.js";
import type { GameView, UnitView } from "../room.js";
import { unitChanges } from "../unit-changes.js";
import { elementModifier } from "../elements.js";
import { route } from "./board.js";
import { kw, typesOf } from "./core.js";
import { resolveResponse } from "./responses.js";

// Advice has only the same redacted information as its viewer. Never consult
// private decks or live RNG, and never execute a preview against the live game.
function adviceState(view: GameView): Game {
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
export type ActionForecast = {
  combatKind?: "announced" | "ranged" | "melee";
  error?: string;
  affected: string[];
  path: [number, number][];
  uncertainty?: "stack" | "hidden" | "random" | "search";
  combat?: CombatPreview;
};
export function forecastAction(
  g: GameView,
  seat: number,
  c: CommandDraft,
): ActionForecast {
  const result: ActionForecast = { affected: [], path: [] };
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
    result.combatKind =
      c.type === "pass"
        ? "announced"
        : c.type === "attack"
          ? "ranged"
          : "melee";
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
  if (forecastsCombat && state.combat) resolveResponse(state);
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
    resolveResponse(state);
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
