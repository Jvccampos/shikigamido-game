import { setEffect } from "../effects.js";
import {
  type Game,
  type Seat,
  type CommandDraft,
  type EventPayload,
} from "../model.js";
import { spellSpecs, transferableKeywords } from "../spells.js";
import {
  valid,
  at,
  connected,
  summonCells,
  neighbors,
  route,
} from "./board.js";
import {
  typesOf,
  adjacent,
  kw,
  event,
  draw,
  makeUnit,
  cardOf,
  uid,
  spend,
} from "./core.js";
import { cards } from "../cards.js";
import { summonEffects, destroy, takeDamage, heal } from "./units.js";
import { fight } from "./combat.js";

export function spellError(
  g: Game,
  seat: Seat,
  c: CommandDraft,
): string | undefined {
  const id = c.cardId!,
    spec = spellSpecs[id];
  if (!spec) return "Magia sem definição.";
  const t = g.units.find((u) => u.id === c.targetId),
    t2 = g.units.find((u) => u.id === c.targetId2),
    p = g.players[seat];
  const cell =
    typeof c.x === "number" &&
    typeof c.y === "number" &&
    valid(c.x, c.y) &&
    !(g.turn < 3 && c.x === 3 && c.y === 3);
  if (
    t?.cardId === "ichi-o-oni-chefe-do-sul" ||
    t2?.cardId === "ichi-o-oni-chefe-do-sul"
  )
    return "Ichi é imune a magias.";
  if (
    [
      "unit",
      "ally",
      "windAlly",
      "twoAllies",
      "duel",
      "twoUnits",
      "move",
      "combat",
      "redirect",
    ].includes(spec.target) &&
    t?.kind !== "unit"
  )
    return "Escolha um monstro válido.";
  if (
    ["ally", "windAlly", "twoAllies", "duel", "move", "redirect"].includes(
      spec.target,
    ) &&
    t?.owner !== seat
  )
    return "Escolha um monstro seu.";
  if (spec.target === "windAlly" && t && !typesOf(t).includes("vento"))
    return "O monstro deve ser de Vento.";
  if (
    spec.target === "omionjiFire" &&
    !(t?.kind === "omionji" && t.owner === seat && typesOf(t).includes("fogo"))
  )
    return "Selecione seu Omionji de Fogo.";
  if (
    ["twoAllies", "twoUnits", "redirect"].includes(spec.target) &&
    (t2?.kind !== "unit" || t2.id === t?.id)
  )
    return "Escolha um segundo monstro diferente.";
  if (["twoAllies", "redirect"].includes(spec.target) && t2?.owner !== seat)
    return "O segundo monstro deve ser seu.";
  if (
    ["cell", "lake", "wind", "move", "discardCat"].includes(spec.target) &&
    !cell
  )
    return "Escolha uma casa válida.";
  if (["cell", "move", "discardCat"].includes(spec.target) && at(g, c.x!, c.y!))
    return "A casa deve estar vazia.";
  if (spec.target === "move" && t && !connected(g, t.x, t.y, c.x!, c.y!))
    return "Escolha uma casa conectada ao monstro.";
  if (
    spec.target === "lake" &&
    !g.units.some(
      (u) =>
        typesOf(u).includes("agua") &&
        ((u.x === c.x && u.y === c.y) || adjacent(u, { x: c.x!, y: c.y! })),
    )
  )
    return "O lago deve ficar junto de uma carta de Água.";
  if (
    spec.target === "wind" &&
    !(
      typeof c.x2 === "number" &&
      typeof c.y2 === "number" &&
      connected(g, c.x!, c.y!, c.x2, c.y2) &&
      (c.x === c.x2 || c.y === c.y2)
    )
  )
    return "Escolha uma segunda casa conectada em linha reta.";
  if (
    spec.target === "discardVoid" &&
    !p.discard.some(
      (id) =>
        id === c.choice &&
        cards.get(id)?.kind === "unit" &&
        cards.get(id)?.types.includes("vazio"),
    )
  )
    return "Escolha um monstro de Vazio no descarte.";
  if (
    spec.target === "discardCat" &&
    (!p.discard.some((id) => id === c.choice && /gato|neko/.test(id)) ||
      !summonCells(g, seat).some((v) => v.x === c.x && v.y === c.y))
  )
    return "Escolha um gato do descarte e uma casa junto de um cristal.";
  if (
    ["combat", "redirect"].includes(spec.target) &&
    (!g.combat ||
      ![g.combat.attackerId, g.combat.defenderId].includes(c.targetId!))
  )
    return "Essa magia exige um monstro no combate anunciado.";
  if (id === "mamoru-n-24-conexao" && t && t2 && !adjacent(t, t2))
    return "O aliado deve ser adjacente.";
  if (id === "mamoru-n-12-negacao" && !g.stack.length)
    return "Negação precisa responder a outra magia.";
  if (
    id === "gishiki-n-3-intangibilidade" &&
    (g.phase !== 2 || g.phaseOwner !== seat)
  )
    return "Use na sua fase de Movimento.";
  if (
    id === "gishiki-n-9-mimetismo" &&
    (!transferableKeywords.includes(c.choice || "") || !t || !kw(t, c.choice!))
  )
    return "Escolha uma keyword que o doador possui.";
  if (
    id === "duelo-de-fogo" &&
    !g.units.some((u) => u.kind === "unit" && u.owner !== seat)
  )
    return "O oponente precisa ter um monstro.";
  if (
    id === "kogeki-n-2-dualidade" &&
    t &&
    !neighbors(t.x, t.y).some(([x, y]) => valid(x, y) && !at(g, x, y))
  )
    return "Não há espaço para a cópia.";
  if (
    c.extraPe !== undefined &&
    (!Number.isInteger(c.extraPe) || c.extraPe < 0 || c.extraPe > 99)
  )
    return "Quantidade de PE ou dano inválida.";
}

export type SpellResolution = Pick<
  CommandDraft,
  "targetId" | "targetId2" | "x" | "y" | "extraPe" | "choice" | "x2" | "y2"
> & { cardId: string };

export function resolveSpell(g: Game, seat: Seat, command: SpellResolution) {
  const {
    cardId,
    targetId,
    targetId2,
    x,
    y,
    extraPe = 0,
    choice,
    x2,
    y2,
  } = command;
  const p = g.players[seat],
    card = cards.get(cardId)!;
  if (!card) return;
  const t = g.units.find((u) => u.id === targetId),
    t2 = g.units.find((u) => u.id === targetId2),
    st = t ? (t.statuses ??= {}) : {};
  const spec = spellSpecs[cardId];
  if (t?.cardId === "ichi-o-oni-chefe-do-sul") {
    event(g, { type: "spell-result", seat, cardId, outcome: "immune" });
    return;
  }
  if (
    [
      "unit",
      "ally",
      "windAlly",
      "omionjiFire",
      "twoAllies",
      "twoUnits",
      "move",
      "combat",
      "redirect",
      "duel",
    ].includes(spec.target) &&
    !t
  ) {
    event(g, { type: "spell-result", seat, cardId, outcome: "missingTarget" });
    return;
  }
  const beforeUnits = structuredClone(g.units);
  const spellCue = event<Extract<EventPayload, { type: "spell" }>>(g, {
    type: "spell",
    seat,
    cardId,
    targetId,
    x,
    y,
    element: card.types[0],
    beforeTarget: t ? structuredClone(t) : undefined,
  });
  switch (cardId) {
    case "mamoru-n-12-negacao": {
      const cancelled = g.stack.pop();
      if (cancelled)
        event(g, {
          type: "spell-result",
          seat: cancelled.seat,
          cardId: cancelled.cardId,
          outcome: "cancelled",
        });
      break;
    }
    case "gishiki-n-13-fardo-espiritual":
      g.players[(1 - seat) as Seat].costTaxUntil = g.turn + 1;
      break;
    case "gishiki-n-4-manto-da-escuridao":
      p.concealTurn = g.turn + 1;
      break;
    case "kogeki-n-1-golpe-do-vazio":
      draw(p, 2);
      break;
    case "gishiki-n-10-invocar-espiritos": {
      const i = p.discard.indexOf(choice!);
      if (i >= 0) p.hand.push(p.discard.splice(i, 1)[0]);
      draw(p);
      break;
    }
    case "ritual-do-gato-sete-vidas": {
      const i = p.discard.indexOf(choice!);
      if (i >= 0 && !at(g, x!, y!)) {
        p.discard.splice(i, 1);
        const u = makeUnit(g, seat, choice!, x!, y!);
        g.units.push(u);
        summonEffects(g, u);
        if (
          t?.owner === seat &&
          ["neko-o-gato-eletrico", "suineko-o-gato-aquatico"].includes(u.cardId)
        ) {
          g.units = g.units.filter((z) => z.id !== u.id);
          (t.equipment ??= []).push(u);
          if (u.cardId === "neko-o-gato-eletrico") {
            t.attack++;
            t.speed++;
          } else t.maxHp += 2;
        }
      }
      break;
    }
    case "kogekido-n-42-obliterar":
      destroy(g, t!);
      break;
    case "gishiki-n-20-tributo":
      if (t?.owner === seat) {
        destroy(g, t);
        draw(p, 2);
      }
      break;
    case "kogekido-n-40-suspiro-final":
      if (t?.owner === seat) {
        const around = g.units.filter((u) => adjacent(u, t));
        destroy(g, t);
        for (const u of around) takeDamage(g, u, 1);
      }
      break;
    case "gishikido-n-3-cura-da-agua":
      heal(g, t!, 2);
      break;
    case "gishikido-n-7-cura-da-agua":
      setEffect(st, "healSplash", true);
      break;
    case "gishiki-n-20-transferencia-vital": {
      const n = p.discard.filter(
        (id) =>
          cards.get(id)?.kind === "unit" &&
          cards.get(id)?.types.includes("terra"),
      ).length;
      t!.attack += n;
      setEffect(
        st,
        "temporaryAttack",
        Number(st.temporaryAttack || 0) + n,
        g.turn + 1,
      );
      break;
    }
    case "mamoru-n-7-dispersar": {
      const base = cardOf(t!);
      t!.statuses = {};
      if (base && base.kind !== "spell") {
        t!.attack = base.stats.attack;
        t!.speed = base.stats.speed;
        t!.maxHp = base.stats.health;
        t!.hp = Math.min(t!.hp, t!.maxHp);
      }
      break;
    }
    case "kogeki-n-2-dualidade": {
      const spot = neighbors(t!.x, t!.y).find(
        ([xx, yy]) => valid(xx, yy) && !at(g, xx, yy),
      );
      if (spot) {
        st.dualAttack = t!.attack;
        st.dualMaxHp = t!.maxHp;
        st.dualUntil = g.turn + 1;
        st.dualSpeed = t!.speed;
        st.dualSpeedLoss = st.speedLoss || 0;
        st.dualSpeedLossSources = [...(st.speedLossSources || [])];
        t!.attack = Math.ceil(t!.attack / 2);
        t!.maxHp = Math.ceil(t!.maxHp / 2);
        t!.hp = Math.min(Math.ceil(t!.hp / 2), t!.maxHp);
        t!.speed = Math.ceil(t!.speed / 2);
        const copy = {
          ...structuredClone(t!),
          id: uid(g),
          x: spot[0],
          y: spot[1],
          summonedTurn: g.turn,
          statuses: { copy: true, ephemeralUntil: g.turn + 1 },
        };
        g.units.push(copy);
        summonEffects(g, copy);
      }
      break;
    }
    case "kogeki-n-9-sacrificio":
      if (t2) fight(g, t!, t2);
      break;
    case "duelo-de-fogo":
      g.duel = { seat, unitId: t!.id };
      g.priority = (1 - seat) as Seat;
      break;
    case "mamoru-n-1-pes-ligeiros":
      if (!at(g, x!, y!) && connected(g, t!.x, t!.y, x!, y!)) {
        t!.x = x!;
        t!.y = y!;
      }
      break;
    case "mamoru-n-9-wonder-wall":
      if (!at(g, x!, y!))
        g.units.push({
          id: uid(g),
          cardId: "wonder-wall",
          owner: seat,
          x: x!,
          y: y!,
          hp: 2 + extraPe,
          maxHp: 2 + extraPe,
          attack: 0,
          speed: 0,
          summonedTurn: g.turn,
          kind: "wall",
          statuses: {},
        });
      break;
    case "magia-de-sangue":
      g.terrain.push({ kind: "lake", x: x!, y: y!, owner: seat });
      break;
    case "ventos-favoraveis":
      g.terrain.push({ kind: "wind", x: x!, y: y!, x2, y2, owner: seat });
      break;
    case "gishiki-n-16-ponte-magica":
      setEffect(st, "construir", true);
      break;
    case "gishiki-n-17-renascer":
      setEffect(st, "ressurgir", 2);
      break;
    case "gishikido-n-2-bencao-do-vento":
      setEffect(st, "block", 1);
      break;
    case "gishikido-n-22-garras-de-fogo":
      setEffect(st, "burnAttack", 1);
      break;
    case "mamoru-n-18-pele-de-ourico":
      setEffect(st, "devolver", 2);
      break;
    case "mamoru-n-21-intocavel":
      setEffect(st, "shield", true);
      break;
    case "mamoru-n-5-prisao-do-inferno":
      setEffect(st, "softStun", 1, g.turn + 1);
      break;
    case "gishiki-n-3-intangibilidade":
      setEffect(st, "intangivel", true, g.turn);
      break;
    case "kogeki-n-1-fireball":
      setEffect(st, "range", 2, g.turn + 1);
      setEffect(st, "fireball", true, g.turn + 1);
      break;
    case "shikigami-de-agua-vibora-bolha":
      setEffect(st, "lifesteal", 2, g.turn);
      setEffect(st, "range", 1, g.turn);
      setEffect(st, "damageCap", 2, g.turn);
      break;
    case "cristal-primordial":
      setEffect(st, "primordial", true);
      break;
    case "gishiki-n-4-sacrificio":
      setEffect(st, "sacrificeTurn", g.turn + 1);
      break;
    case "gishiki-n-9-mimetismo":
      if (t2) {
        const value = kw(t!, choice!);
        setEffect(st, "stolenKeyword", choice, g.turn + 1);
        const ts = (t2.statuses ??= {});
        ts[choice!] = value;
        setEffect(ts, "borrowed", choice, g.turn + 1);
      }
      break;
    case "kogekido-n-2-exorcismo":
      takeDamage(g, t!, 1);
      break;
    case "mamoru-n-24-conexao":
    case "mamoru-n-5-transferencia-espiritual":
      if (t2) {
        setEffect(st, "redirect", t2.id);
        setEffect(
          st,
          "redirectAmount",
          cardId === "mamoru-n-24-conexao"
            ? Infinity
            : Math.min(extraPe, t2.hp),
        );
      }
      break;
    case "mamorudo-n-17-defesa-da-fagulha":
      if (g.combat) {
        const wantAttack = choice !== "defender";
        if ((g.combat.attackerId === t!.id) !== wantAttack)
          [g.combat.attackerId, g.combat.defenderId] = [
            g.combat.defenderId,
            g.combat.attackerId,
          ];
      }
      break;
  }
  if (t) spellCue.afterTarget = structuredClone(t);
  spellCue.changes = [
    ...new Set([...beforeUnits.map((u) => u.id), ...g.units.map((u) => u.id)]),
  ].flatMap((id) => {
    const before = beforeUnits.find((u) => u.id === id);
    const after = g.units.find((u) => u.id === id);
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [{ before, after: after && structuredClone(after) }];
  });
}

export function ability(
  g: Game,
  seat: Seat,
  c: CommandDraft,
): string | undefined {
  const u = g.units.find((u) => u.id === c.unitId && u.owner === seat),
    t = g.units.find((t) => t.id === c.targetId);
  if (!u) return "Selecione uma unidade sua.";
  const st = (u.statuses ??= {});
  if (g.combat?.defenderId === u.id && u.cardId === "cabra-dos-alpes") {
    const path = route(g, u, c.x!, c.y!);
    if (!path || !path.length || path.length > 2 || at(g, c.x!, c.y!))
      return "Escolha uma casa vazia até dois passos de distância.";
    u.x = c.x!;
    u.y = c.y!;
    g.priority = g.combat.returnPriority;
    g.combat = undefined;
    g.passes = 0;

    return;
  }
  if (g.combat?.defenderId === u.id && u.cardId === "javali-espinhoso") {
    if (st.combatAttack) return "Efeito já ativado neste combate.";
    if (u.hp < 2) return "O Javali precisa sobreviver ao custo de vida.";
    u.hp--;
    st.combatAttack = 1;
    return;
  }
  if (u.cardId === "espirito-da-arvore") {
    if (
      g.phase !== 2 ||
      g.phaseOwner !== seat ||
      g.moved.includes(u.id) ||
      u.summonedTurn === g.turn ||
      st.stun ||
      st.softStun
    )
      return "Use durante seu movimento com uma unidade disponível.";
    if (t?.kind !== "unit" || !typesOf(t).includes("fogo") || t.owner === seat)
      return "Escolha um monstro inimigo de Fogo.";
    if (
      !valid(c.x!, c.y!) ||
      at(g, c.x!, c.y!) ||
      !adjacent(t, { x: c.x!, y: c.y! }) ||
      (g.turn < 3 && c.x === 3 && c.y === 3)
    )
      return "Escolha uma casa vazia adjacente ao alvo.";
    if ((g.moveCounts ??= [0, 0])[seat] >= 2 && !spend(g.players[seat], 1))
      return "PE insuficiente para mover outra unidade.";
    g.moveCounts[seat]++;
    g.moved.push(u.id);
    u.x = c.x!;
    u.y = c.y!;
    g.combat = {
      attackerId: u.id,
      defenderId: t.id,
      x: t.x,
      y: t.y,
      ranged: true,
      returnPriority: seat,
    };
    g.priority = (1 - seat) as Seat;
    g.passes = 0;
    return;
  }
  if (u.cardId === "omionji-fogo") {
    if (t?.kind !== "unit") return "Escolha um monstro.";
    if (u.hp < 2 || !spend(g.players[seat], 1))
      return "Luna precisa de 2 de vida e 1 PE disponível.";
    u.hp--;
    t.attack++;
    setEffect(
      (t.statuses ??= {}),
      "temporaryAttack",
      Number(t.statuses.temporaryAttack || 0) + 1,
      g.turn,
    );
    return;
  }
  if (st.abilityTurn === g.turn) return "Efeito já usado neste turno.";
  if (u.cardId === "omionji-vento") {
    if (!t || t.kind === "crystal" || t.kind === "curse" || !adjacent(u, t))
      return "Selecione uma carta adjacente que possa mover.";
    if (
      !valid(c.x!, c.y!) ||
      at(g, c.x!, c.y!) ||
      (g.turn < 3 && c.x === 3 && c.y === 3) ||
      !connected(g, t.x, t.y, c.x!, c.y!)
    )
      return "Selecione uma casa conectada vazia.";
    t.x = c.x!;
    t.y = c.y!;
  } else if (u.cardId === "garca-pacificadora") {
    if (
      g.phase !== 2 ||
      g.moved.some((id) => g.units.find((t) => t.id === id)?.owner === seat) ||
      st.once
    )
      return "Use no início da fase de Movimento, uma vez por partida.";
    if (t?.kind !== "unit" || !adjacent(u, t))
      return "Escolha um monstro adjacente.";
    st.shield = true;
    (t.statuses ??= {}).shield = true;
    st.once = true;
  } else if (u.cardId === "chama-marinha") {
    if (!cardOf(u)?.types.includes(c.choice || ""))
      return "Selecione um dos elementos da carta.";
    st.chosenElement = c.choice;
    return;
  } else {
    if (g.phase !== 3 || g.phaseOwner !== seat)
      return "Ative na sua fase de Magia.";
    if (kw(u, "Construir")) {
      if (
        !valid(c.x!, c.y!) ||
        Math.abs(c.x! - u.x) + Math.abs(c.y! - u.y) !== 1 ||
        connected(g, u.x, u.y, c.x!, c.y!)
      )
        return "Escolha uma casa ortogonal adjacente ainda sem caminho.";
      (g.edges ??= []).push([u.x, u.y, c.x!, c.y!]);
    } else if (u.cardId === "hearo-megami") {
      if (!t || t.owner !== seat || !typesOf(t).includes("agua"))
        return "Escolha um aliado de Água.";
      heal(g, t, 2);
      takeDamage(g, u, 1);
    } else if (u.cardId === "india-do-norte") {
      if (t?.kind !== "unit" || t.owner !== seat || !adjacent(u, t))
        return "Escolha um monstro aliado adjacente.";
      destroy(g, u);
      heal(g, t, 2);
    } else if (u.cardId === "ichiki-o-despertar-do-elemento") {
      if (t?.kind !== "unit") return "Escolha um monstro.";
      if (!spend(g.players[seat], 1)) return "PE insuficiente.";
      takeDamage(g, t, 1, u);
    } else return "Essa carta tem efeitos automáticos.";
  }
  st.abilityTurn = g.turn;
  event(g, { type: "ability", unit: u });
}
