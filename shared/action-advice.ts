import { unitChanges } from "./unit-changes.js";
export { unitChanges } from "./unit-changes.js";
import { apply } from "./game.js";
import { cards } from "./cards.js";
import { spellSpecs, transferableKeywords } from "./spells.js";
import { abilities } from "./abilities.js";
import type { GameView, UnitView } from "./room.js";
import type { Cmd, Game, Seat, Unit } from "./model.js";
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
  const visible = {
    ...view,
    events: [],
    log: [],
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
      { ...view.players[0], library: view.players[0].summonableDeck },
      { ...view.players[1], library: view.players[1].summonableDeck },
    ],
    pending: [],
    centerChoices: {},
    events: [],
    log: [],
    random: { state: 1729 },
  });
}
export function commandError(g: GameView, seat: number, cmd: Cmd) {
  if (seat !== 0 && seat !== 1) return "Você está assistindo ao duelo.";
  return apply(adviceState(g), seat, cmd);
}
export function actionCost(g: GameView, seat: number, c: Cmd) {
  const p = g.players[seat];
  if (!p) return 0;
  if (c.type === "cast" || c.type === "summon")
    return (
      (cards.get(c.cardId || "")?.stats.cost || 0) +
      (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0) +
      (c.cardId === "mamoru-n-9-wonder-wall" ? c.extraPe || 0 : 0)
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

function* spellCandidates(g: GameView, seat: Seat, base: Cmd): Generator<Cmd> {
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
        if (base.cardId === "gishiki-n-9-mimetismo") {
          for (const choice of transferableKeywords.filter((k) => kw(u, k)))
            yield { ...base, targetId: u.id, targetId2: other.id, choice };
        } else yield { ...base, targetId: u.id, targetId2: other.id };
      }
    } else yield { ...base, targetId: u.id };
  }
}
export function* abilityCandidates(g: GameView, u: UnitView): Generator<Cmd> {
  const base: Cmd = { type: "ability", unitId: u.id };
  if (u.cardId === "chama-marinha") {
    for (const choice of cards.get(u.cardId)!.types) yield { ...base, choice };
  } else if (u.cardId === "javali-espinhoso") yield base;
  else if (
    u.cardId === "cabra-dos-alpes" ||
    kw(u, "Construir") ||
    u.statuses?.construir
  ) {
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
export type ActionPlan = { cost: number; reason?: string; options: Cmd[] };
export function cardPlan(
  g: GameView,
  seat: number,
  cardId: string,
  handIndex: number,
  fromDeck = false,
): ActionPlan {
  const card = cards.get(cardId);
  const base: Cmd = {
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
  const candidates: Cmd[] =
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
  return (
    !!abilities[u.cardId] || !!kw(u, "Construir") || !!u.statuses?.construir
  );
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
  energy: number;
  reserve: number;
  error?: string;
  lines: string[];
  affected: string[];
  path: [number, number][];
  uncertain?: string;
  combat?: CombatPreview;
};
export function previewAction(
  g: GameView,
  seat: number,
  c: Cmd,
): ActionPreview {
  const cost = actionCost(g, seat, c),
    pe = g.players[seat]?.pe || 0;
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
    energy: Math.min(cost, pe),
    reserve: Math.max(0, cost - pe),
    lines: [],
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
  const target = g.units.find((u) => u.id === c.targetId);
  if (target) result.lines.push(`Alvo: ${pieceName(target)}`);
  if (c.targetId2)
    result.lines.push(
      `Segundo alvo: ${pieceName(g.units.find((u) => u.id === c.targetId2))}`,
    );
  if (c.x !== undefined && c.y !== undefined)
    result.lines.push(`Destino ${String.fromCharCode(65 + c.x)}${c.y + 1}`);
  const combat = state.combat || g.combat;
  const forecastsCombat =
    combat &&
    ((c.type === "pass" && !g.stack.length) ||
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
  if (unknown || randomCombat) {
    result.uncertain = unknown
      ? "Há cartas ocultas: o resultado completo não pode ser previsto."
      : "Este combate depende de um sorteio. O resultado pode variar.";
    return result;
  }
  if (forecastsCombat && state.combat) settleCombat(state);
  if (forecastsCombat && combat) {
    const a = g.units.find((u) => u.id === combat.attackerId),
      d = g.units.find((u) => u.id === combat.defenderId);
    if (a && d) {
      result.lines.push(`${pieceName(a)} → ${pieceName(d)}`);
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
      result.lines.push(
        `Relação elemental: ${modifier > 0 ? "+" : ""}${modifier} no ataque`,
      );
      if (result.combat) result.combat.modifier = modifier;
    }
  }
  if (c.type === "cast" && cards.get(c.cardId!)?.stats.speed !== "instant") {
    state.stack.pop();
    resolveSpell(
      state,
      seat,
      c.cardId!,
      c.targetId,
      c.targetId2,
      c.x,
      c.y,
      c.extraPe,
      c.choice,
      c.x2,
      c.y2,
    );
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
  if (fight?.type === "combat")
    result.lines.push(
      `${fight.keyword}: ${fight.attackDamage} de dano · ${fight.defenseDamage} de contra-ataque`,
    );
  for (const before of g.units) {
    const after = state.units.find((u) => u.id === before.id);
    if (!after) {
      result.affected.push(before.id);
      const dead = state.events?.some(
        (e) => e.type === "destroy" && e.unitId === before.id,
      );
      result.lines.push(
        `${pieceName(before)}: ${dead ? "será derrotado" : "sairá do campo"}`,
      );
      continue;
    }
    const changes = unitChanges(before, after);
    if (changes.length) {
      result.affected.push(before.id);
      result.lines.push(`${pieceName(before)}: ${changes.join(" · ")}`);
    }
  }
  for (const created of state.units.filter(
    (u) => !g.units.some((before) => before.id === u.id),
  ))
    result.lines.push(
      `${pieceName(created)} entra em campo: ${created.attack} ataque · ${created.hp} vida · ${created.speed} velocidade`,
    );
  if (c.type === "cast" && !result.affected.length && !forecastsCombat)
    result.lines.push(cards.get(c.cardId!)?.effect_text || "");
  if (
    forecastsCombat ||
    (c.type === "cast" && cards.get(c.cardId!)?.stats.speed !== "instant")
  )
    result.uncertain =
      "Previsão sem novas respostas. Magias e habilidades podem alterar o resultado.";
  if (g.stack.length)
    result.uncertain =
      "Há magias pendentes. Prévia deste efeito isolado; a pilha pode alterar o resultado.";
  if (
    forecastsCombat &&
    g.units.some((u) =>
      ["oni-azul", "kirijin-o-oni-da-fumaca"].includes(u.cardId),
    )
  )
    result.uncertain =
      "Efeitos de busca no baralho podem alterar as peças que ficam em campo.";
  return result;
}
