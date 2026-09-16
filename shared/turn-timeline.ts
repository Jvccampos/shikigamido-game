import { cards } from "./cards.js";
import { effectExpiry } from "./effects.js";
import type { GameView } from "./room.js";
import { CENTER_OPEN_TURN, maxManaAtTurn } from "./turn-schedule.js";

export type TurnEvent = {
  timing: "start" | "end";
  kind: "mana" | "center" | "curse" | "effect";
  label: string;
  detail: string;
};
export type TimelineTurn = {
  turn: number;
  mana: number;
  events: TurnEvent[];
};

const effectLabels: Record<string, string> = {
  range: "Alcance",
  fireball: "Fireball",
  damageCap: "Limite de dano",
  lifesteal: "Roubo de vida",
  intangivel: "Intangibilidade",
  stun: "Atordoamento",
  softStun: "Imobilização",
  stolenKeyword: "Keyword cedida",
  borrowed: "Keyword emprestada",
  temporaryAttack: "Bônus de ataque",
  burn: "Queimadura",
  dual: "Dualidade",
  ephemeral: "Cópia temporária",
};

/** Forecast only public, scheduled state. Conditional outcomes are not simulated. */
export function turnTimeline(
  g: GameView,
  names: string[],
  count = 7,
): TimelineTurn[] {
  if (g.winner !== null || g.draw) return [];
  const scheduled = new Map<number, TurnEvent[]>();
  const add = (turn: number, event: TurnEvent) => {
    if (!Number.isInteger(turn) || turn < g.turn) return;
    const events = scheduled.get(turn) || [];
    events.push(event);
    scheduled.set(turn, events);
  };
  const owner = (seat: number) => names[seat] || `Jogador ${seat + 1}`;
  const firstStart = g.setup ? g.turn : g.turn + 1;
  for (const u of g.units) {
    if (u.cardId === "hidden") continue;
    const st = u.statuses || {};
    const target = `${cards.get(u.cardId)?.name || u.cardId} · ${owner(u.owner)} · casa ${u.x + 1}, ${u.y + 1}`;
    for (const [key, label] of Object.entries(effectLabels)) {
      const until = effectExpiry(st, key);
      if (until === undefined || until < g.turn) continue;
      if (key !== "dual" && key !== "ephemeral" && st[key] === undefined)
        continue;
      add(until + 1, {
        timing: "start",
        kind: "effect",
        label: key === "ephemeral" ? "Cópia desaparece" : `${label} termina`,
        detail: `${target}. Vigora até o fim do turno ${until}.`,
      });
    }
    if (st.burn && st.burnUntil !== undefined) {
      for (let turn = firstStart; turn <= st.burnUntil; turn++)
        add(turn, {
          timing: "start",
          kind: "effect",
          label: `Queimadura · ${st.burn} de dano`,
          detail: target,
        });
    }
    if (st.controlTurn !== undefined && st.controlOwner !== undefined)
      add(st.controlTurn, {
        timing: "start",
        kind: "effect",
        label: "Mudança de controle",
        detail: `${target}. Passa para ${owner(st.controlOwner)}.`,
      });
    if (st.sacrificeTurn !== undefined && st.sacrificeTurn >= g.turn) {
      if (st.sacrificeTurn >= firstStart)
        add(st.sacrificeTurn, {
          timing: "start",
          kind: "effect",
          label: "Sacrifício disponível",
          detail: `${target}. Pode ser usado como ritual neste turno.`,
        });
      add(st.sacrificeTurn, {
        timing: "end",
        kind: "effect",
        label: "Prazo de Sacrifício termina",
        detail: target,
      });
    }
  }
  for (const [seat, player] of g.players.entries()) {
    if (player.costTaxUntil !== undefined && player.costTaxUntil >= g.turn)
      add(player.costTaxUntil + 1, {
        timing: "start",
        kind: "effect",
        label: "Fardo Espiritual termina",
        detail: `${owner(seat)} deixa de pagar +1 PE por invocações e magias.`,
      });
    if (player.concealTurn !== undefined && player.concealTurn >= g.turn) {
      if (player.concealTurn >= firstStart)
        add(player.concealTurn, {
          timing: "start",
          kind: "effect",
          label: "Manto da Escuridão começa",
          detail: `As invocações de ${owner(seat)} ficam ocultas neste turno.`,
        });
      add(player.concealTurn, {
        timing: "end",
        kind: "effect",
        label: "Manto da Escuridão termina",
        detail: `${owner(seat)} deixa de ocultar novas invocações. As unidades já ocultas continuam ocultas.`,
      });
    }
  }
  for (const pending of g.pending)
    add(pending.returnTurn, {
      timing: "start",
      kind: "effect",
      label: "Ressurgir · retorno previsto",
      detail: `${cards.get(pending.unit.cardId)?.name || "Carta oculta"} · ${owner(pending.unit.owner)}. Retorna à mão se a casa estiver ocupada.`,
    });
  for (const terrain of g.terrain) {
    if (terrain.until === undefined) continue;
    const label = { fire: "Chamas", lake: "Lago", wind: "Ventos favoráveis" }[
      terrain.kind
    ];
    add(terrain.until, {
      timing: "end",
      kind: "effect",
      label: `${label} termina`,
      detail: `${owner(terrain.owner)} · casa ${terrain.x + 1}, ${terrain.y + 1}.`,
    });
  }
  // Keep distant effect deadlines visible without filling the UI with empty turns.
  const turns = new Set([
    ...Array.from({ length: count }, (_, i) => g.turn + i),
    ...scheduled.keys(),
  ]);
  return [...turns]
    .sort((a, b) => a - b)
    .map((turn) => {
      const events: TurnEvent[] = [];
      const mana = maxManaAtTurn(turn);
      if (turn > 1 && mana > maxManaAtTurn(turn - 1))
        events.push({
          timing: "start",
          kind: "mana",
          label: `Mana máxima +1 · ${mana} PE`,
          detail: `Ambos os jogadores renovam a energia para ${mana} PE.`,
        });
      if (turn === CENTER_OPEN_TURN) {
        events.push(
          {
            timing: "start",
            kind: "curse",
            label: "Surgem 2 maldições",
            detail: "Uma maldição de nível 1 em cada lado do campo.",
          },
          {
            timing: "start",
            kind: "center",
            label: "Abertura do centro",
            detail: "Cada jogador escolhe em segredo uma unidade para avançar.",
          },
        );
      }
      events.push(...(scheduled.get(turn) || []));
      return { turn, mana, events };
    });
}
