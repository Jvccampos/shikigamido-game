import { type Unit, type Game, type EventPayload } from "../model.js";
import { typesOf, kw, adjacent, event, cardOf, alive } from "./core.js";
import { yokaiIds, masculineIds } from "../traits.js";
import { random } from "../random.js";
import { destroy, takeDamage, heal } from "./units.js";
import { at } from "./board.js";

export function elementalDamage(attacker: Unit, defender: Unit, g?: Game) {
  let dmg = attacker.attack;
  const ats = typesOf(attacker),
    dts = typesOf(defender);
  if (
    (defender.cardId === "oni-vermelho" && ats.includes("fogo")) ||
    (defender.cardId === "enenra-comedor-de-mentes" &&
      ats.some((t) => ["terra", "fogo"].includes(t))) ||
    (defender.cardId === "gato-pavao" && /usagi/.test(attacker.cardId))
  )
    return 0;
  if (attacker.cardId === "kappa" && dts.includes("vento")) return 0;
  if (!kw(attacker, "Amaldiçoado")) {
    const ring = ["vazio", "vento", "fogo", "agua", "terra"];
    for (const a of ats)
      for (const d of dts) {
        const ai = ring.indexOf(a),
          di = ring.indexOf(d);
        if (di === (ai + 2) % 5) dmg++;
        if (di === (ai + 1) % 5) dmg--;
      }
  }
  if (
    ["kabuto-o-shikigami-besouro", "raposa-vigia"].includes(attacker.cardId) &&
    yokaiIds.has(defender.cardId)
  )
    dmg++;
  if (attacker.cardId === "esposa-traida" && masculineIds.has(defender.cardId))
    dmg++;
  if (attacker.cardId === "lobo-branco" && defender.hp < defender.maxHp) dmg++;
  if (attacker.cardId === "serpente-opala" && dts.includes("fogo")) dmg++;
  if (attacker.cardId === "tolo-do-fogo" && dts.includes("vazio")) dmg++;
  if (defender.cardId === "espirito-da-arvore" && ats.includes("fogo")) dmg--;
  if (
    g &&
    attacker.cardId === "defensor-de-lava" &&
    g.units.some(
      (u) =>
        u.id !== attacker.id &&
        u.owner === attacker.owner &&
        typesOf(u).includes("fogo") &&
        adjacent(u, attacker),
    )
  )
    dmg++;
  return Math.max(
    0,
    Math.min(
      Number(attacker.statuses?.damageCap ?? Infinity),
      dmg - kw(defender, "Block") - Number(defender.statuses?.block || 0),
    ),
  );
}

export function fight(g: Game, a: Unit, d: Unit) {
  delete a.statuses?.hidden;
  delete d.statuses?.hidden;
  const beforeA = structuredClone(a),
    beforeD = structuredClone(d);
  // Reserve the cue before damage triggers; finish it within this atomic command.
  const combatCue = event<Extract<EventPayload, { type: "combat" }>>(g, {
    type: "combat",
    attacker: beforeA,
    defender: beforeD,
    attackDamage: 0,
    defenseDamage: 0,
    keyword: "Engolir",
  });
  if (d.cardId === "furame-ku")
    g.players[d.owner].permanentPe = Math.min(
      3,
      g.players[d.owner].permanentPe + 1,
    );
  if (a.cardId === "furame-ku") a.speed++;
  if (a.cardId === "dragao-do-inverno") d.speed = Math.max(0, d.speed - 1);
  if (a.cardId === "serpente-de-gelo") d.speed = Math.max(0, d.speed - 1);
  if (d.cardId === "serpente-de-gelo") a.speed = Math.max(0, a.speed - 1);
  const engulf = kw(a, "Engolir") ? a : kw(d, "Engolir") ? d : null;
  if (engulf) {
    const victim = engulf === a ? d : a;
    if (victim.kind === "unit") {
      (engulf.captured ??= []).push(victim);
      g.units = g.units.filter((x) => x.id !== victim.id);

      return engulf === a;
    }
  }
  let quick =
    kw(a, "Quick Attack") > 0 ||
    kw(d, "Slow Defense") > 0 ||
    (a.kind === "unit" &&
      d.kind === "unit" &&
      a.owner === d.owner &&
      g.units.some((o) => o.cardId === "omionji-terra" && o.owner === a.owner));
  if (a.cardId === "cachorro-do-mato" && random(g.random) < 0.5) quick = true;
  const ad = elementalDamage(a, d, g),
    dd =
      d.statuses?.stun || d.cardId === "bolinhas-explosivas"
        ? 0
        : elementalDamage(
            {
              ...d,
              attack:
                d.attack +
                Number(d.statuses?.combatAttack || 0) +
                kw(d, "Devolver") +
                Number(d.statuses?.devolver || 0),
            },
            a,
            g,
          );
  let da = 0,
    ddone = 0;
  if (
    a.cardId === "escorpiao-da-morte" &&
    d.kind === "unit" &&
    (cardOf(d)?.stats.cost ?? Infinity) <= 3
  ) {
    destroy(g, d, a);
    quick = true;
  } else if (a.statuses?.fireball && random(g.random) < 0.5)
    g.log.push("Fireball errou no dado.");
  else da = takeDamage(g, d, ad, a, true);
  const equip =
    ["neko-o-gato-eletrico", "suineko-o-gato-aquatico"].includes(a.cardId) &&
    d.kind === "unit" &&
    alive(g, d);
  if (equip) {
    (d.equipment ??= []).push(a);
    g.units = g.units.filter((x) => x.id !== a.id);
    if (a.cardId === "neko-o-gato-eletrico") {
      d.attack++;
      d.speed++;
      (d.statuses ??= {}).burn = 1;
      d.statuses.burnUntil = g.turn + 2;
    } else d.maxHp += 2;
  } else if (!quick || alive(g, d)) ddone = takeDamage(g, a, dd, d, true);
  for (const [u, other, dealt] of [
    [a, d, da],
    [d, a, ddone],
  ] as [Unit, Unit, number][]) {
    if (alive(g, u)) {
      const life = Math.max(
        kw(u, "Lifesteal"),
        Number(u.statuses?.lifesteal || 0),
      );
      if (life) heal(g, u, Math.min(life, dealt));
      if (u.cardId === "kappa") {
        u.maxHp++;
        u.hp++;
      }
    }
    const burn = Math.max(
      kw(u, "Burn"),
      Number(u.statuses?.burnAttack || 0),
      u === a && u.cardId === "ino-ino" ? 1 : 0,
    );
    if (burn && alive(g, other)) {
      (other.statuses ??= {}).burn = burn;
      other.statuses.burnUntil = g.turn + 2;
    }
  }
  if (
    a.cardId === "aranha-de-cristal" &&
    d.kind === "unit" &&
    (cardOf(d)?.stats.cost ?? Infinity) <= 6 &&
    alive(g, d)
  ) {
    (d.statuses ??= {}).controlTurn = g.turn + 2;
    d.statuses.controlOwner = a.owner;
  }
  if (
    !alive(g, a) &&
    !alive(g, d) &&
    a.kind === "omionji" &&
    d.kind === "omionji"
  ) {
    g.winner = null;
    g.draw = true;
  }
  Object.assign(combatCue, {
    attackDamage: da,
    defenseDamage: ddone,
    afterA: a.hp,
    afterD: d.hp,
    keyword: equip
      ? "Equipar"
      : quick
        ? "Quick Attack"
        : kw(d, "Devolver")
          ? "Devolver"
          : "Combate simultâneo",
    element: typesOf(a)[0] || "vazio",
  });
  g.log.push(
    `${cardOf(a)?.name || a.cardId} enfrentou ${cardOf(d)?.name || d.cardId}: ${da} / ${ddone} de dano.`,
  );
  return !alive(g, d) && alive(g, a);
}

export function settleCombat(g: Game) {
  const combat = g.combat;
  if (!combat) return;
  const a = g.units.find((u) => u.id === combat.attackerId),
    d = g.units.find((u) => u.id === combat.defenderId);
  if (a && d) {
    const won = fight(g, a, d);
    if (won && !combat.ranged && !at(g, combat.x, combat.y)) {
      a.x = combat.x;
      a.y = combat.y;
    }
  }
  g.priority = combat.returnPriority;
  g.combat = undefined;
  g.passes = 0;
  for (const u of g.units) {
    delete u.statuses?.redirect;
    delete u.statuses?.redirectAmount;
    delete u.statuses?.combatAttack;
  }
  if (a && alive(g, a) && a.cardId === "chifre-de-fogo")
    g.followup = {
      seat: a.owner,
      unitId: a.id,
      distance: 1,
      label: "Chifre de Fogo pode avançar mais uma casa.",
    };
  if (a && d && alive(g, d) && a.cardId === "o-destruidor")
    g.followup = {
      seat: a.owner,
      unitId: d.id,
      distance: 2,
      label: "O Destruidor pode empurrar o defensor até duas casas.",
    };
}
