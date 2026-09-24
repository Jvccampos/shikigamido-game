import type { GameView } from "../shared/room.js";
import { cards, phases } from "../shared/game.js";
import { pieceName } from "../shared/action-advice.js";
import { movementMarker } from "../shared/unit-insight.js";
import type { SpellStep } from "./spell-steps.js";

/** One half of a phase: each phase is played by the first player, then the other. */
export type TurnStep = {
  phase: number;
  seat: number;
  state: "done" | "current" | "next";
};
export type GuideTone = "mine" | "theirs" | "response" | "setup";
export type DuelGuide = {
  tone: GuideTone;
  /** The seat whose decision the game is waiting for. */
  actor: number;
  /** Short label shown before the title, e.g. "Sua vez". */
  badge: string;
  title: string;
  /** What to do now, or what happens next while waiting. */
  detail: string;
  steps: TurnStep[];
};
export type GuideInput = {
  /** Selected hand card or piece, with the reason it cannot act if any. */
  selection?: {
    name: string;
    kind: "unit" | "spell" | "piece";
    reason?: string;
    /** The spell's next missing choice, if any. */
    step?: SpellStep;
    /** A selected piece's ability has nothing to target right now. */
    noTargets?: boolean;
  };
  playableCards: number;
  readyAbilities: number;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const theirVerb = [
  "está comprando",
  "está invocando",
  "está movendo peças",
  "está conjurando magias",
  "está convertendo cartas",
];
const myTitle = [
  "Compra",
  "Invoque seus familiares",
  "Mova suas peças",
  "Conjure magias",
  "Converta cartas em reserva",
];
const myNext = [
  "",
  "sua invocação",
  "seu movimento",
  "sua fase de magia",
  "seu descarte",
];

export function turnSteps(g: GameView): TurnStep[] {
  const halves = [g.first, 1 - g.first];
  const owner = g.phaseOwner ?? g.first;
  return [1, 2, 3, 4].flatMap((phase) =>
    halves.map((seat, half) => ({
      phase,
      seat,
      state:
        phase < g.phase || (phase === g.phase && half < halves.indexOf(owner))
          ? ("done" as const)
          : phase === g.phase && seat === owner
            ? ("current" as const)
            : ("next" as const),
    })),
  );
}

/** Describes the step after the current half-phase from the player's view. */
function upcoming(g: GameView, seat: number, names: string[]) {
  const owner = g.phaseOwner ?? g.first;
  const [phase, next] =
    owner === g.first ? [g.phase, 1 - g.first] : [g.phase + 1, g.first];
  if (phase > 4) return "A seguir: novo turno, com compra e energia renovada.";
  return next === seat
    ? `A seguir: ${myNext[phase]}.`
    : `A seguir: ${names[next]} · ${phases[phase]}.`;
}

/** Turns the match state into a headline, a status line and the turn stepper. */
export function duelGuide(
  g: GameView,
  seat: number,
  names: string[],
  input: GuideInput,
): DuelGuide {
  const steps = turnSteps(g);
  const owner = g.phaseOwner ?? g.first;
  const actor =
    g.searches?.[0]?.seat ??
    g.followup?.seat ??
    (g.duel ? (g.duel.opponentId ? g.duel.seat : 1 - g.duel.seat) : g.priority);
  const mine = actor === seat;
  const guide = (
    tone: GuideTone,
    badge: string,
    title: string,
    detail: string,
  ): DuelGuide => ({ tone, actor, badge, title, detail, steps });

  if (g.searches?.length)
    return mine
      ? guide(
          "mine",
          "Efeito",
          "Escolha sua carta",
          "Conclua a busca para continuar.",
        )
      : guide(
          "theirs",
          "Efeito",
          `${names[actor]} está buscando uma carta`,
          "Só quem busca vê as opções do baralho.",
        );
  if (g.centerPending)
    return guide(
      "response",
      "Centro aberto",
      "Avanço secreto ao centro",
      "Escolha uma peça para avançar, ou não avance. As escolhas são reveladas juntas.",
    );
  if (g.duel)
    return guide(
      mine ? "mine" : "theirs",
      "Duelo",
      mine ? "Escolha do duelo" : `${names[actor]} prepara o duelo`,
      mine
        ? g.duel.opponentId
          ? "Escolha quem ataca e quem defende."
          : "Escolha um monstro para o duelo."
        : `Aguarde a escolha de ${names[actor]}.`,
    );
  if (g.followup)
    return mine
      ? guide("mine", "Sua vez", "Movimento adicional", g.followup.label)
      : guide(
          "theirs",
          "Movimento adicional",
          `${names[actor]} pode mover de novo`,
          g.followup.label,
        );
  if (g.combat || g.stack.length) {
    const top = g.stack.at(-1),
      spell = top ? cards.get(top.cardId)?.name || "Uma magia" : "",
      attacker = pieceName(g.units.find((u) => u.id === g.combat?.attackerId)),
      defender = pieceName(g.units.find((u) => u.id === g.combat?.defenderId)),
      pending = top
        ? `${spell} está na pilha`
        : `${attacker} ataca ${defender}`;
    return mine
      ? guide(
          "response",
          "Resposta",
          "Sua resposta",
          `${pending}. Responda com uma magia rápida ou ${top ? "passe" : "permita o combate"}.`,
        )
      : guide(
          "response",
          "Resposta",
          `${names[actor]} pode responder`,
          `${pending}. ${names[actor]} decide se responde.`,
        );
  }
  if (!mine)
    return guide(
      "theirs",
      phases[g.phase],
      `${names[owner]} ${theirVerb[g.phase]}`,
      upcoming(g, seat, names),
    );

  const s = input.selection,
    me = g.players[seat],
    title = myTitle[g.phase];
  if (s?.reason)
    return guide("mine", "Sua vez", title, `${s.name}: ${s.reason}`);
  if (g.phase === 1) {
    if (s?.kind === "unit")
      return guide(
        "mine",
        "Sua vez",
        title,
        `Clique em um selo iluminado para invocar ${s.name}.`,
      );
    return guide(
      "mine",
      "Sua vez",
      title,
      input.playableCards
        ? `${plural(input.playableCards, "carta pode", "cartas podem")} ser invocadas. Arraste até um selo iluminado.`
        : "Nenhuma carta pode ser invocada agora. Conclua a invocação.",
    );
  }
  if (g.phase === 2) {
    if (s?.kind === "piece")
      return guide(
        "mine",
        "Sua vez",
        title,
        `Escolha uma casa iluminada para ${s.name}. Entrar na casa de um inimigo inicia um combate.`,
      );
    const free = Math.max(0, 2 - (g.moveCounts?.[seat] || 0)),
      movable = g.units.filter(
        (u) => u.owner === seat && movementMarker(g, u)?.state === "ready",
      ).length,
      energy = me.pe + me.permanentPe;
    return guide(
      "mine",
      "Sua vez",
      title,
      !movable
        ? "Nenhuma peça pode se mover agora. Conclua os movimentos."
        : free
          ? `Selecione ou arraste uma peça · ${plural(free, "movimento grátis restante", "movimentos grátis restantes")}.`
          : energy
            ? "Movimentos grátis usados. Cada movimento extra custa 1 PE."
            : "Movimentos grátis usados e sem PE para mover. Conclua os movimentos.",
    );
  }
  if (g.phase === 3) {
    if (s)
      return guide(
        "mine",
        "Sua vez",
        title,
        s.kind !== "spell"
          ? s.noTargets
            ? `${s.name} não tem alvo agora.`
            : `Escolha no tabuleiro o alvo de ${s.name}.`
          : !s.step
            ? `${s.name} está pronta. Confirme no painel à direita.`
            : s.step.kind === "unit" || s.step.kind === "cell"
              ? `${s.name} · escolha no tabuleiro: ${s.step.label.toLowerCase()}.`
              : `${s.name} · escolha no painel: ${s.step.label.toLowerCase()}.`,
      );
    const options = [
      input.playableCards &&
        plural(input.playableCards, "magia disponível", "magias disponíveis"),
      input.readyAbilities &&
        plural(
          input.readyAbilities,
          "habilidade pronta (✦)",
          "habilidades prontas (✦)",
        ),
    ].filter(Boolean);
    return guide(
      "mine",
      "Sua vez",
      title,
      options.length
        ? `${options.join(" · ")}. Selecione para escolher o alvo.`
        : "Nenhuma magia ou habilidade disponível. Conclua a fase de magia.",
    );
  }
  if (g.phase === 4)
    return guide(
      "mine",
      "Sua vez",
      title,
      `Cada carta vale 1 de Reserva (até 3). ${upcoming(g, seat, names)}`,
    );
  return guide(
    "mine",
    "Sua vez",
    title,
    "Compra automática: a nova carta vai para sua mão.",
  );
}
