import type { GameView } from "../shared/room.js";
import { phases } from "../shared/game.js";
export function DuelContext({
  game: g,
  seat,
  names,
  presenting,
}: {
  game: GameView;
  seat: number;
  names: string[];
  presenting: string | null;
}) {
  const who = (s: number) => (s === seat ? "Você" : names[s]);
  const phaseOwner = g.phaseOwner ?? g.first;
  const responding = !!(g.stack.length || g.combat);
  const actor =
    g.searches?.[0]?.seat ??
    g.followup?.seat ??
    (g.duel ? (g.duel.opponentId ? g.duel.seat : 1 - g.duel.seat) : g.priority);
  const mine = actor === seat;
  const title = presenting
    ? "Resolvendo no tabuleiro"
    : g.searches?.length
      ? mine
        ? "Escolha sua carta"
        : `${who(actor)} está buscando uma carta`
      : g.centerPending
        ? "Avanço secreto ao centro"
        : g.duel
          ? "Escolha do duelo"
          : g.followup
            ? "Movimento adicional"
            : responding
              ? mine
                ? "Sua resposta"
                : `Resposta de ${who(actor)}`
              : mine
                ? "Sua vez"
                : `${who(actor)} está jogando`;
  const detail = presenting
    ? presenting
    : g.searches?.length
      ? mine
        ? "Conclua o efeito de busca para continuar."
        : "As opções do baralho são visíveis apenas para quem está buscando."
      : g.centerPending
        ? "Escolha uma unidade ou decida não avançar."
        : g.followup
          ? g.followup.label
          : g.duel
            ? g.duel.opponentId
              ? "Escolha quem ataca e quem defende."
              : "Escolha um monstro para o duelo."
            : responding
              ? `${g.stack.length ? "Magia" : "Combate"} aguardando resposta · ${g.passes}/2 passes consecutivos`
              : mine
                ? [
                    "Compra automática",
                    "Invoque uma carta disponível nos selos iluminados.",
                    `Selecione uma peça. ${Math.max(0, 2 - (g.moveCounts?.[seat] || 0))} movimentos grátis restantes.`,
                    "As cartas disponíveis e os alvos válidos ficam destacados.",
                    "Converta cartas em reserva ou mantenha sua mão.",
                  ][g.phase]
                : `${who(actor)} ${["está comprando cartas", "está escolhendo suas invocações", "está movendo suas peças", "pode conjurar magias e usar habilidades", "está escolhendo cartas para converter em reserva"][g.phase]}.`;
  const next = responding
    ? `Após as respostas: ${g.stack.length ? "resolve a magia no topo da pilha" : "resolve o combate"}.`
    : actor === g.first
      ? `Depois: ${who(1 - actor)} · ${phases[g.phase]}`
      : g.phase < 4
        ? `Depois: ${phases[g.phase + 1]} · ${who(g.first)}`
        : "Depois: novo turno · compra e renovação de energia";
  return (
    <div className={`duel-context ${responding ? "is-response" : ""}`}>
      <div className="context-origin">
        Turno {g.turn} · {phases[g.phase]} · {who(phaseOwner)}
      </div>
      <h1>{title}</h1>
      <div className="context-phases" aria-label="Fases do turno">
        {phases.slice(1).map((phase, i) => (
          <span
            key={phase}
            className={g.phase === i + 1 ? "current" : ""}
            aria-current={g.phase === i + 1 ? "step" : undefined}
          >
            {phase}
          </span>
        ))}
      </div>
      <p className="context-detail" role="status">
        {detail}
      </p>
      {!g.centerPending && !g.duel && !g.followup && !g.searches?.length && (
        <small className="context-next">{next}</small>
      )}
    </div>
  );
}
