import { type Game, type Unit, type Seat } from "../model.js";
import {
  draw,
  event,
  adjacent,
  uid,
  alive,
  typesOf,
  kw,
  makeUnit,
} from "./core.js";
import { spawns, at, neighbors, valid } from "./board.js";
import { shuffle } from "../random.js";

export function heal(g: Game, u: Unit, n: number) {
  if (["neko-o-gato-eletrico", "omionji-fogo"].includes(u.cardId)) return;
  const amount = Math.min(n, u.maxHp - u.hp);
  u.hp += amount;
  if (u.statuses?.primordial) {
    const boost = Math.min(amount, 3 - Number(u.statuses.primordialBoost || 0));
    u.attack += boost;
    u.statuses.primordialBoost =
      Number(u.statuses.primordialBoost || 0) + boost;
  }
  if (amount > 0) {
    const om = g.units.find(
      (o) => o.cardId === "omionji-agua" && o.owner === u.owner,
    );
    if (u.kind === "unit" && om && om.statuses?.healDrawTurn !== g.turn) {
      (om.statuses ??= {}).healDrawTurn = g.turn;
      draw(g.players[u.owner]);
    }
    event(g, { type: "heal", unitId: u.id, amount });
    if (u.statuses?.healSplash) {
      delete u.statuses.healSplash;
      for (const other of g.units.filter(
        (x) => x.kind === "unit" && adjacent(x, u),
      ))
        heal(g, other, 2);
    }
  }
}

export function summonEffects(g: Game, u: Unit, targetId?: string) {
  const p = g.players[u.owner];
  const search = (ids: string[], re: RegExp) => {
    const i = ids.findIndex((id) => re.test(id));
    if (i >= 0) p.hand.push(ids.splice(i, 1)[0]);
  };
  if (u.cardId === "taodu-curador") search(p.library, /taodu/);
  if (u.cardId === "anubis-o-gato-da-morte") search(p.discard, /gato|neko/);
  if (u.cardId === "gato-do-cristal-duplo") {
    const t = g.units.find(
      (x) => x.id === targetId && x.kind === "unit" && x.id !== u.id,
    );
    if (t) {
      (u.statuses ??= {}).bond = t.id;
      (t.statuses ??= {}).bond = u.id;
    }
  }
  if (u.cardId === "tigre-carmesim")
    (g.flowers ??= []).push({
      id: uid(g),
      unitId: u.id,
      owner: u.owner,
      x: u.x,
      y: u.y,
      hp: 1,
    });
  event(g, { type: "summon", unit: { ...u } });
}

export function destroy(g: Game, u: Unit, killer?: Unit) {
  if (!alive(g, u)) return;
  g.units = g.units.filter((x) => x.id !== u.id);
  g.flowers = (g.flowers || []).filter((f) => f.unitId !== u.id);
  event(g, { type: "destroy", unitId: u.id, unit: u });
  if (u.kind === "omionji") {
    g.winner = (1 - u.owner) as Seat;
    g.log.push(`Omionji do Jogador ${u.owner + 1} derrotado.`);
    return;
  }
  if (u.kind === "crystal" || u.kind === "wall") return;
  if (u.kind === "curse") {
    const level = Math.min(3, (u.level || 1) + 1),
      [x, y] = spawns[u.owner];
    g.units.push({
      id: uid(g),
      cardId: `maldicao-${level}`,
      owner: u.owner,
      x,
      y,
      hp: 3 + level * 3,
      maxHp: 3 + level * 3,
      attack: level + 1,
      speed: 1,
      summonedTurn: g.turn,
      kind: "curse",
      level,
      statuses: {},
    });
    event(g, { type: "summon", unit: g.units.at(-1)! });
    g.log.push(`Maldição nível ${level} invocada no portal de origem.`);
    return;
  }
  const cho = g.units.find(
    (o) => o.cardId === "omionji-vazio" && o.owner === u.owner,
  );
  if (
    cho &&
    typesOf(u).includes("vazio") &&
    cho.statuses?.deathDrawTurn !== g.turn
  ) {
    (cho.statuses ??= {}).deathDrawTurn = g.turn;
    draw(g.players[u.owner]);
  }
  const p = g.players[u.owner],
    resurrect = Math.max(
      kw(u, "Ressurgir"),
      Number(u.statuses?.ressurgir || 0),
    );
  if (!u.statuses?.copy) {
    if (resurrect) {
      (g.pending ??= []).push({
        unit: { ...u, hp: u.maxHp, statuses: { resurrected: true } },
        returnTurn: g.turn + resurrect,
      });
    } else if (
      /tigre-(carmesim|roxo)/.test(u.cardId) &&
      g.units.some((x) => x.cardId === "tigre-cinza" && x.owner === u.owner)
    )
      p.hand.push(u.cardId);
    else if (u.cardId === "taodu-corrupto")
      p.library = shuffle([...p.library, u.cardId], g.random);
    else p.discard.push(u.cardId);
  }
  if (u.cardId === "tsuchi-o-gato-da-terra") {
    const i = p.library.findIndex((id) => /gato|neko/.test(id));
    if (i >= 0) p.hand.push(p.library.splice(i, 1)[0]);
  }
  if (killer && killer.kind !== "curse" && killer.kind !== "crystal") {
    const kp = g.players[killer.owner],
      st = (killer.statuses ??= {});
    if (kw(killer, "Alimentar")) {
      killer.attack++;
      killer.maxHp++;
      killer.hp++;
      if (!st.fedSpeed) {
        killer.speed++;
        st.fedSpeed = true;
      }
    }
    if (killer.cardId === "aguia-cacadora" && u.kind === "unit")
      killer.attack++;
    if (
      /oni/.test(u.cardId) &&
      ["oni-azul", "oni-verde", "ichi-o-oni-chefe-do-sul"].includes(
        killer.cardId,
      )
    ) {
      killer.attack += 2;
      st.oniKills = Number(st.oniKills || 0) + 1;
      if (killer.cardId === "oni-azul" && st.oniKills >= 2) {
        const i = kp.library.indexOf("ichi-o-oni-chefe-do-sul");
        if (i >= 0) {
          kp.library.splice(i, 1);
          const v = makeUnit(
            g,
            killer.owner,
            "ichi-o-oni-chefe-do-sul",
            killer.x,
            killer.y,
          );
          destroy(g, killer);
          g.units.push(v);
        }
      }
    }
    if (u.cardId === "alimento-de-oni" && /oni/.test(killer.cardId)) {
      killer.maxHp++;
      killer.hp = killer.maxHp;
      killer.attack++;
      killer.speed++;
    }
    if (u.cardId === "comedor-de-sonhos") kp.pe++;
    if (u.cardId === "taodu-corrupto") draw(kp);
    if (["a-gula", "assombracao-afogada", "o-arconte"].includes(u.cardId))
      draw(kp, 2);
    if (u.cardId === "a-gula") {
      st.extraTypes = [...(st.extraTypes || []), "fogo"];
      st.devolver = 2;
    }
    if (u.cardId === "assombracao-afogada") st.Lifesteal = 2;
    if (u.cardId === "broto-amaldicoado") st.construir = true;
    if (u.cardId === "lamento") st.Alimentar = 1;
    if (["o-arconte", "potaru"].includes(u.cardId)) st["Quick Attack"] = 1;
    if (killer.cardId === "kirijin-o-oni-da-fumaca") {
      const i = kp.library.indexOf("enenra-comedor-de-mentes"),
        spot = neighbors(killer.x, killer.y).find(
          ([x, y]) => valid(x, y) && !at(g, x, y),
        );
      if (i >= 0 && spot) {
        kp.library.splice(i, 1);
        g.units.push(
          makeUnit(g, killer.owner, "enenra-comedor-de-mentes", ...spot),
        );
      }
    }
  }
  const bond = g.units.find((x) => x.id === u.statuses?.bond);
  if (bond) destroy(g, bond);
  for (const e of u.equipment || []) {
    if (e.cardId === "neko-o-gato-eletrico") {
      e.hp--;
      if (e.hp > 0) {
        e.x = u.x;
        e.y = u.y;
        g.units.push(e);
      } else g.players[e.owner].discard.push(e.cardId);
    } else g.players[e.owner].discard.push(e.cardId);
  }
  for (const captured of u.captured || []) {
    const spots = Array.from(
      { length: 49 },
      (_, i) => [i % 7, Math.floor(i / 7)] as [number, number],
    ).filter(([x, y]) => !at(g, x, y));
    spots.sort(
      (a, b) =>
        Math.max(Math.abs(a[0] - u.x), Math.abs(a[1] - u.y)) -
          Math.max(Math.abs(b[0] - u.x), Math.abs(b[1] - u.y)) ||
        ((Math.atan2(a[1] - u.y, a[0] - u.x) + Math.PI * 2) % (Math.PI * 2)) -
          ((Math.atan2(b[1] - u.y, b[0] - u.x) + Math.PI * 2) % (Math.PI * 2)),
    );
    if (spots[0]) {
      [captured.x, captured.y] = spots[0];
      g.units.push(captured);
    } else g.players[captured.owner].hand.push(captured.cardId);
  }
}

export function takeDamage(
  g: Game,
  u: Unit,
  n: number,
  source?: Unit,
  combat = false,
): number {
  if (!alive(g, u) || n <= 0) return 0;
  if (combat && u.statuses?.shield) {
    u.statuses.shield = false;
    event(g, { type: "shield", unitId: u.id });
    return 0;
  }
  const redirect = g.units.find((x) => x.id === u.statuses?.redirect);
  if (combat && redirect) {
    const amount = Math.min(
      n,
      Number(u.statuses?.redirectAmount ?? n),
      redirect.hp,
    );
    delete u.statuses?.redirect;
    takeDamage(g, redirect, amount, source);
    n -= amount;
  }
  const damage = Math.min(u.hp, n);
  u.hp -= n;
  if (u.hp <= 0) destroy(g, u, source);
  return damage;
}
