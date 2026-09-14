import { useEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import { phases } from "../shared/game.js";

// Match the exit animation in duel-hud.css; keep the node alive until it ends.
const exitMs = 450;

export function ArenaNotices({
  game: g,
  seat,
  names,
  waiting,
  onReading,
}: {
  game: GameView;
  seat: number;
  names: string[];
  waiting: boolean;
  onReading: (reading: boolean) => void;
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
  const [displayed, setDisplayed] = useState<typeof notice>(null);
  const [leaving, setLeaving] = useState(false);
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
    if (!displayed) {
      if (notice && !waiting) {
        setDisplayed(notice);
        setLeaving(false);
      }
      return;
    }
    if (waiting || !notice || displayed.key !== notice.key) {
      setLeaving(true);
      return;
    }
    const timer = setTimeout(() => setLeaving(true), 2800);
    return () => clearTimeout(timer);
  }, [notice, displayed, waiting]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      setDisplayed(null);
      setLeaving(false);
      setNotice((pending) =>
        pending?.key === displayed?.key ? null : pending,
      );
    }, exitMs);
    return () => clearTimeout(timer);
  }, [leaving, displayed]);
  useEffect(
    () => onReading(!!notice || !!displayed),
    [notice, displayed, onReading],
  );
  useEffect(() => () => onReading(false), [onReading]);
  if (!displayed) return null;
  return (
    <div
      key={displayed.key}
      className={`arena-notice ${leaving ? "leaving" : ""}`}
      role="status"
    >
      <small>TURNO {displayed.key.split(":")[0]}</small>
      <strong>{displayed.title}</strong>
      <p>{displayed.detail}</p>
      {displayed.mana && <b className="notice-mana">✦ {displayed.mana}</b>}
    </div>
  );
}

export function FieldEvent({
  label,
  onVisible,
}: {
  label: string | null;
  onVisible: (visible: boolean) => void;
}) {
  const [displayed, setDisplayed] = useState(label);
  useEffect(() => onVisible(!!displayed), [displayed, onVisible]);
  useEffect(() => () => onVisible(false), [onVisible]);
  useEffect(() => {
    if (label) {
      setDisplayed(label);
      return;
    }
    const timer = setTimeout(() => setDisplayed(null), exitMs);
    return () => clearTimeout(timer);
  }, [label]);
  if (!displayed) return null;
  return (
    <div
      className={`field-event ${displayed.startsWith("Uma maldição") ? "curse-notice" : ""} ${!label ? "leaving" : ""}`}
      role="status"
    >
      <span className="event-pulse" />
      {displayed}
    </div>
  );
}
