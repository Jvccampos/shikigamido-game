import { useEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import { phases } from "../shared/game.js";

export function ArenaNotices({
  game: g,
  seat,
  names,
  waiting,
}: {
  game: GameView;
  seat: number;
  names: string[];
  waiting: boolean;
}) {
  const stage = `${g.turn}:${g.phase}:${g.phaseOwner}:${!!g.setup}:${!!g.centerPending}`;
  const previous = useRef({
    stage: "",
    max: g.players[seat < 0 ? 0 : seat].maxPe,
  });
  const [notice, setNotice] = useState<{
    key: string;
    title: string;
    detail: string;
    mana: string;
  } | null>(null);
  useEffect(() => {
    const max = g.players[seat < 0 ? 0 : seat].maxPe;
    const changed = previous.current.stage !== stage;
    const gain = max > previous.current.max;
    previous.current = { stage, max };
    if (g.setup || g.winner !== null || g.draw) {
      setNotice(null);
      return;
    }
    if (!changed && !gain) return;
    const yours = g.phaseOwner === seat;
    setNotice((pending) => ({
      key: stage,
      title: g.centerPending
        ? "O centro se abriu"
        : `${yours ? "Sua vez" : names[g.phaseOwner ?? g.priority]} · ${phases[g.phase]}`,
      detail: g.centerPending
        ? "Escolha uma unidade para avançar em segredo."
        : yours
          ? [
              "Uma nova carta vem para sua mão.",
              "Invoque criaturas nos selos junto aos seus cristais.",
              "Mova suas unidades. Os dois primeiros movimentos são grátis.",
              "Conjure magias ou use as habilidades das suas unidades.",
              "Converta cartas em reserva ou mantenha sua mão.",
            ][g.phase]
          : "Acompanhe as ações no tabuleiro.",
      mana: gain ? `Mana máxima aumentou para ${max} PE!` : pending?.mana || "",
    }));
  }, [stage, g.players[0].maxPe, g.players[1].maxPe, g.winner, g.draw]);
  useEffect(() => {
    if (!notice || waiting) return;
    const timer = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(timer);
  }, [notice, waiting]);
  if (!notice || waiting || g.setup || g.winner !== null || g.draw) return null;
  return (
    <div key={notice.key} className="arena-notice" role="status">
      <small>TURNO {g.turn}</small>
      <strong>{notice.title}</strong>
      <p>{notice.detail}</p>
      {notice.mana && <b className="notice-mana">✦ {notice.mana}</b>}
    </div>
  );
}
