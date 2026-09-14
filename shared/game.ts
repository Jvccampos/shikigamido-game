import {
  type Game,
  type Seat,
  type Cmd,
  isCommand,
  type Unit,
} from "./model.js";
import { RULES_VERSION } from "./rules/setup.js";
import {
  draw,
  event,
  cardOf,
  spend,
  makeUnit,
  kw,
  typesOf,
  phases,
} from "./rules/core.js";
import { shuffle } from "./random.js";
import {
  startTurn,
  refreshAuras,
  endMovement,
  endTurn,
  enterPhase,
} from "./rules/turns.js";
import { route, at, summonCells, movementBudget } from "./rules/board.js";
import { fight, settleCombat } from "./rules/combat.js";
import { cards } from "./cards.js";
import { ability, spellError, resolveSpell } from "./rules/spells.js";
import { destroy, summonEffects, heal, takeDamage } from "./rules/units.js";

export function apply(g: Game, seat: Seat, c: Cmd): string | undefined {
  if (!isCommand(c)) return "Comando inválido.";
  if ((g.rulesVersion ?? 1) > RULES_VERSION)
    return "Esta partida usa uma versão mais recente das regras.";
  g.rulesVersion ??= RULES_VERSION;
  if (g.winner !== null || g.draw) return "A partida terminou.";
  const p = g.players[seat];
  if (!p) return "Jogador inválido.";
  if (c.type === "concede") {
    g.winner = (1 - seat) as Seat;
    event(g, { type: "concede", seat });
    g.log.push(`Jogador ${seat + 1} concedeu.`);
    return;
  }
  if (g.setup) {
    if (c.type === "mulligan") {
      if (p.mulligan) return "Mulligan indisponível.";
      const indices = c.handIndices || [];
      // Legacy command support still removes exactly one occurrence at a time.
      if (!c.handIndices && c.cardIds) {
        const remaining = [...p.hand];
        for (const id of c.cardIds) {
          const i = remaining.indexOf(id);
          if (i < 0) return "Carta inválida.";
          indices.push(i);
          remaining[i] = "";
        }
      }
      if (
        new Set(indices).size !== indices.length ||
        indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)
      )
        return "Seleção inválida.";
      const returned = indices
        .sort((a, b) => b - a)
        .map((i) => p.hand.splice(i, 1)[0]);
      p.library = shuffle([...p.library, ...returned], g.random);
      draw(p, returned.length);
      p.mulligan = true;
      return;
    }
    if (c.type === "ready") {
      if (p.ready) return "Você já confirmou.";
      if (c.y !== 2 && c.y !== 4) return "Escolha uma posição inicial marcada.";
      const o = g.units.find((u) => u.kind === "omionji" && u.owner === seat)!;
      o.y = c.y;
      p.mulligan = true;
      p.ready = true;
      if (g.players.every((p) => p.ready)) {
        g.setup = false;
        g.phaseOwner = g.first;
        g.priority = g.first;
        startTurn(g);
        g.log.push("Preparação concluída. A batalha começou.");
      }
      return;
    }
    return "Escolha sua mão e posição inicial antes de começar.";
  }
  if (g.centerPending) {
    if (c.type !== "center") return "Escolha seu avanço secreto para o centro.";
    if (Object.hasOwn(g.centerChoices || {}, seat))
      return "Escolha já confirmada.";
    if (
      c.unitId &&
      !g.units.some(
        (u) =>
          u.id === c.unitId &&
          u.owner === seat &&
          ["unit", "omionji"].includes(u.kind) &&
          !u.statuses?.stun &&
          !u.statuses?.softStun &&
          u.summonedTurn < g.turn,
      )
    )
      return "Escolha uma unidade que possa mover.";
    (g.centerChoices ??= {})[seat] = c.unitId || null;
    if (Object.keys(g.centerChoices).length === 2) {
      for (const who of [g.first, (1 - g.first) as Seat]) {
        const u = g.units.find((u) => u.id === g.centerChoices![who]);
        if (!u) continue;
        const path = route(g, u, 3, 3);
        if (!path) continue;
        const steps = path.slice(0, u.speed);
        while (
          steps.length &&
          at(g, ...steps.at(-1)!) &&
          at(g, ...steps.at(-1)!)?.owner === u.owner
        )
          steps.pop();
        const dest = steps.at(-1);
        if (dest) {
          const target = at(g, ...dest);
          if (!target || fight(g, u, target)) {
            [u.x, u.y] = dest;
          }
        }
      }
      g.centerPending = false;
      g.centerChoices = {};
      g.log.push(
        "As escolhas foram reveladas e o avanço ao centro foi resolvido.",
      );
    }
    return;
  }
  if (g.duel) {
    if (c.type !== "duel") return "Conclua as escolhas do duelo.";
    if (!g.duel.opponentId) {
      if (seat === g.duel.seat)
        return "Aguarde o oponente escolher seu monstro.";
      const t = g.units.find(
        (u) => u.id === c.unitId && u.owner === seat && u.kind === "unit",
      );
      if (!t) return "Escolha seu monstro para o duelo.";
      g.duel.opponentId = t.id;
      g.priority = g.duel.seat;
      return;
    }
    if (seat !== g.duel.seat) return "O conjurador escolhe quem ataca.";
    const a = g.units.find((u) => u.id === g.duel!.unitId),
      d = g.units.find((u) => u.id === g.duel!.opponentId);
    g.duel = undefined;
    if (a && d)
      fight(
        g,
        c.choice === "defender" ? d : a,
        c.choice === "defender" ? a : d,
      );
    g.priority = seat;
    return;
  }
  if (g.followup) {
    if (seat !== g.followup.seat) return "Aguarde o movimento após combate.";
    if (c.type === "pass") {
      g.followup = undefined;
      return;
    }
    if (c.type !== "followup")
      return "Escolha uma casa para o movimento adicional ou pule.";
    const u = g.units.find((u) => u.id === g.followup!.unitId);
    if (!u) {
      g.followup = undefined;
      return;
    }
    const path = route(g, u, c.x!, c.y!);
    if (
      !path ||
      !path.length ||
      path.length > g.followup.distance ||
      at(g, c.x!, c.y!)
    )
      return "Destino inválido para o movimento adicional.";
    u.x = c.x!;
    u.y = c.y!;
    g.followup = undefined;
    return;
  }
  const card = cards.get(c.cardId || ""),
    fast =
      c.type === "cast" &&
      card?.kind === "spell" &&
      card.stats.speed !== "slow";
  if (
    seat !== g.priority &&
    !fast &&
    !(c.type === "ability" && c.unitId === `o${seat}` && p.element === "fogo")
  )
    return "Aguarde sua prioridade.";
  if (
    (g.stack.length || g.combat) &&
    !["cast", "pass", "ability"].includes(c.type)
  )
    return "Resolva as respostas antes de continuar.";
  if (c.type === "ability") {
    if (
      (g.stack.length || g.combat) &&
      !["omionji-fogo", "cabra-dos-alpes", "javali-espinhoso"].includes(
        g.units.find((u) => u.id === c.unitId)?.cardId || "",
      )
    )
      return "Apenas habilidades rápidas nesta janela.";
    return ability(g, seat, c);
  }
  if (c.type === "summon") {
    if (g.phase !== 1 || g.phaseOwner !== seat)
      return "Invoque na sua fase de Invocação.";
    const fromDeck =
      c.choice === "library" &&
      ["kabuto-o-shikigami-besouro", "anubis-o-gato-da-morte"].includes(
        c.cardId || "",
      );
    const source = fromDeck ? p.library : p.hand,
      index = fromDeck
        ? source.indexOf(c.cardId!)
        : (c.handIndex ?? source.indexOf(c.cardId!));
    if (!card || card.kind !== "unit" || source[index] !== card.id)
      return "Carta inválida ou mão desatualizada.";
    const sacrifice = g.units.find(
      (u) => u.id === c.targetId && u.owner === seat && u.kind === "unit",
    );
    if (
      card.id === "anubis-o-gato-da-morte" &&
      !(sacrifice && /gato|neko/.test(sacrifice.cardId)) &&
      !p.resurrectedAnubis
    )
      return "Anubis requer o sacrifício de um gato Shikigami anterior.";
    const ritual =
      !!sacrifice &&
      (sacrifice.statuses?.sacrificeTurn === g.turn ||
        card.id === "anubis-o-gato-da-morte");
    if (
      !ritual &&
      !summonCells(g, seat).some((v) => v.x === c.x && v.y === c.y)
    )
      return "Invoque em um espaço marcado junto de um cristal vivo.";
    const cost =
        card.stats.cost + (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0),
      refund =
        ritual && sacrifice!.statuses?.sacrificeTurn === g.turn
          ? cardOf(sacrifice!)?.stats.cost || 0
          : 0;
    if (p.pe + Math.min(3, p.permanentPe + refund) < cost)
      return "PE insuficiente.";
    let x = c.x!,
      y = c.y!;
    if (ritual) {
      x = sacrifice!.x;
      y = sacrifice!.y;
      p.permanentPe = Math.min(3, p.permanentPe + refund);
      destroy(g, sacrifice!);
    }
    spend(p, cost);
    source.splice(index, 1);
    if (card.id === "anubis-o-gato-da-morte") p.resurrectedAnubis = false;
    const u = makeUnit(g, seat, card.id, x, y);
    g.units.push(u);
    summonEffects(g, u, c.targetId2 || c.targetId);
    refreshAuras(g);
    g.log.push(
      u.statuses?.hidden
        ? "Uma carta foi invocada oculta."
        : `${card.name} invocado.`,
    );
    return;
  }
  if (c.type === "move" || c.type === "attack") {
    if (g.phase !== 2 || g.phaseOwner !== seat)
      return "Movimente na sua fase de Movimento.";
    const u = g.units.find((u) => u.id === c.unitId && u.owner === seat);
    if (!u || !["unit", "omionji"].includes(u.kind))
      return "Selecione uma unidade sua.";
    if (
      g.moved.includes(u.id) ||
      u.summonedTurn === g.turn ||
      u.statuses?.stun ||
      u.statuses?.softStun
    )
      return "Essa unidade não pode mover neste turno.";
    const path = route(g, u, c.x!, c.y!),
      target =
        c.type === "attack"
          ? g.units.find((t) => t.id === c.targetId)
          : at(g, c.x!, c.y!);
    const flower = (g.flowers || []).find(
      (f) => f.id === c.targetId && f.owner !== seat,
    );
    if (flower) {
      const distance = Math.max(
          Math.abs(u.x - flower.x),
          Math.abs(u.y - flower.y),
        ),
        range = Math.max(kw(u, "Range"), Number(u.statuses?.range || 0));
      const path = route(g, u, flower.x, flower.y);
      if (
        !(range && distance <= range) &&
        (!path || !path.length || path.length > u.speed)
      )
        return "Flor fora de alcance.";
      if ((g.moveCounts ??= [0, 0])[seat] >= 2 && !spend(p, 1))
        return "PE insuficiente para mover outra unidade.";
      const token: Unit = {
        id: flower.id,
        cardId: "flor",
        owner: flower.owner,
        x: flower.x,
        y: flower.y,
        hp: 1,
        maxHp: 1,
        attack: 0,
        speed: 0,
        summonedTurn: 0,
        kind: "wall",
      };
      if (u.attack > 0) {
        const linkedUnit = g.units.find((t) => t.id === flower.unitId);
        if (linkedUnit) destroy(g, linkedUnit, u);
        event(g, {
          type: "combat",
          attacker: structuredClone(u),
          defender: token,
          attackDamage: 1,
          defenseDamage: 0,
          keyword: "Vínculo da Flor",
          element: typesOf(u)[0],
        });
      }
      g.moved.push(u.id);
      g.moveCounts[seat]++;
      return;
    }
    const range = Math.max(kw(u, "Range"), Number(u.statuses?.range || 0)),
      ranged = c.type === "attack";
    if (ranged) {
      if (
        !target ||
        (target.owner === seat && target.kind !== "curse") ||
        !range ||
        Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y)) > range ||
        u.statuses?.intangivel
      )
        return "Alvo fora do alcance.";
    } else if (
      !path ||
      !path.length ||
      path.length > movementBudget(g, u, path)
    )
      return "Destino fora dos caminhos ou da velocidade disponível.";
    const count = (g.moveCounts ??= [0, 0])[seat];
    if (count >= 2 && !spend(p, 1)) return "Cada unidade adicional custa 1 PE.";
    g.moved.push(u.id);
    g.moveCounts![seat]++;
    g.actions++;
    if (target) {
      if (!ranged && path && path.length > 1)
        [u.x, u.y] = path[path.length - 2];
      g.combat = {
        attackerId: u.id,
        defenderId: target.id,
        x: target.x,
        y: target.y,
        ranged,
        returnPriority: seat,
      };
      g.passes = 0;
      g.priority = (1 - seat) as Seat;
      g.log.push(
        "Combate anunciado. Use magias rápidas ou passe a prioridade.",
      );
    } else {
      u.x = c.x!;
      u.y = c.y!;
      event(g, { type: "move", unitId: u.id, unit: u, path: path! });
    }
    const terrain = g.terrain.find(
      (z) => z.x === u.x && z.y === u.y && z.kind === "lake",
    );
    if (terrain) {
      if (typesOf(u).includes("agua")) heal(g, u, 1);
      if (typesOf(u).includes("fogo")) takeDamage(g, u, 1);
    }
    refreshAuras(g);
    return;
  }
  if (c.type === "cast") {
    const index = c.handIndex ?? p.hand.indexOf(c.cardId!);
    if (!card || card.kind !== "spell" || p.hand[index] !== card.id)
      return "Magia inválida ou mão desatualizada.";
    if (card.stats.speed === "slow" && g.phase !== 3)
      return "Magia lenta apenas na fase de Magia.";
    const error = spellError(g, seat, c);
    if (error) return error;
    const extra = card.id === "mamoru-n-9-wonder-wall" ? c.extraPe || 0 : 0;
    if (
      !spend(
        p,
        card.stats.cost +
          extra +
          (p.costTaxUntil && p.costTaxUntil >= g.turn ? 1 : 0),
      )
    )
      return "PE insuficiente.";
    p.hand.splice(index, 1);
    p.discard.push(card.id);
    event(g, {
      type: "cast",
      seat,
      cardId: card.id,
      targetId: c.targetId,
      x: c.x,
      y: c.y,
    });
    if (card.stats.speed === "instant")
      resolveSpell(
        g,
        seat,
        card.id,
        c.targetId,
        c.targetId2,
        c.x,
        c.y,
        c.extraPe,
        c.choice,
        c.x2,
        c.y2,
      );
    else {
      g.stack.push({ ...c, cardId: card.id, seat });
      g.priority = (1 - seat) as Seat;
      g.passes = 0;
      g.log.push(`${card.name} na pilha. O oponente pode responder.`);
    }
    return;
  }
  if (c.type === "discard" || c.type === "discardMany") {
    if (g.phase !== 4 || g.phaseOwner !== seat)
      return "Descarte na sua fase de Descarte.";
    const indices =
      c.type === "discardMany"
        ? c.handIndices || []
        : [c.handIndex ?? p.hand.indexOf(c.cardId!)];
    if (
      !indices.length ||
      new Set(indices).size !== indices.length ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)
    )
      return "Selecione cartas válidas da sua mão.";
    if (c.type === "discard" && c.cardId !== p.hand[indices[0]])
      return "Mão desatualizada.";
    if (p.permanentPe + indices.length > 3)
      return "Sua reserva comporta até 3 PE.";
    for (const i of [...indices].sort((a, b) => b - a)) {
      const id = p.hand.splice(i, 1)[0];
      p.discard.push(id);
      p.permanentPe++;
      event(g, { type: "discard", seat, cardId: id });
    }
    return;
  }
  if (c.type !== "pass") return "Comando inválido.";
  if (g.stack.length || g.combat) {
    g.passes++;
    if (g.passes < 2) {
      g.priority = (1 - seat) as Seat;
      return;
    }
    g.passes = 0;
    if (g.stack.length) {
      const top = g.stack.pop()!;
      resolveSpell(
        g,
        top.seat,
        top.cardId,
        top.targetId,
        top.targetId2,
        top.x,
        top.y,
        top.extraPe,
        top.choice,
        top.x2,
        top.y2,
      );
      if (!g.duel)
        g.priority = g.stack.length
          ? ((1 - g.stack.at(-1)!.seat) as Seat)
          : g.combat
            ? ((1 - g.combat.returnPriority) as Seat)
            : g.phaseOwner!;
    } else settleCombat(g);
    refreshAuras(g);
    return;
  }
  if (seat !== g.phaseOwner) {
    g.priority = g.phaseOwner!;
    return;
  }
  g.log.push(`Jogador ${seat + 1} encerrou ${phases[g.phase]}.`);
  if (g.phase === 2) endMovement(g, seat);
  if (seat === g.first) {
    g.phaseOwner = (1 - g.first) as Seat;
    g.priority = g.phaseOwner;
  } else {
    g.phase++;
    g.phaseOwner = g.first;
    g.priority = g.first;
    if (g.phase === 5) {
      endTurn(g);
      g.turn++;
      g.phase = 0;
      startTurn(g);
    } else enterPhase(g);
  }
  refreshAuras(g);
}

export { cards, allCards, elements } from "./cards.js";
export { phases, kw } from "./rules/core.js";
export { freshGame, validateDeck, RULES_VERSION } from "./rules/setup.js";
export {
  linked,
  connected,
  neighbors,
  valid,
  summonCells,
  moveOptions,
  route,
  pathLength,
} from "./rules/board.js";
export { elementalDamage, fight } from "./rules/combat.js";
export type {
  Seat,
  DeckInput,
  Player,
  Unit,
  Game,
  Cmd,
  GameEvent,
} from "./model.js";

export { startTurn } from "./rules/turns.js";
export { spellError } from "./rules/spells.js";
