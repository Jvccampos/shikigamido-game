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
  const banner = useRef<HTMLDivElement>(null);
  function startExit() {
    if (leaving) return;
    if (banner.current)
      banner.current.style.setProperty(
        "--notice-exit-opacity",
        getComputedStyle(banner.current).opacity,
      );
    setLeaving(true);
  }
  useEffect(() => {
    const max = g.players[seat < 0 ? 0 : seat].maxPe;
    const changed = previous.current.stage !== stage;
    const gain = max > previous.current.max;
    previous.current = { stage, max };
    // The discard dialog already announces this step. Queuing another banner
    // behind it would announce the phase again when returning to the board.
    const discardChoice =
      g.phase === 4 && g.phaseOwner === seat && !g.centerPending;
    if (g.setup || g.winner !== null || g.draw || discardChoice) {
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
          : g.phase === 4
            ? `${names[g.phaseOwner ?? g.priority]} está escolhendo quais cartas converter em reserva.`
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
    if (leaving) return;
    if (waiting || !notice || displayed.key !== notice.key) {
      startExit();
      return;
    }
    const timer = setTimeout(startExit, 4000);
    return () => clearTimeout(timer);
  }, [notice, displayed, waiting, leaving]);
  useEffect(() => {
    if (!displayed || leaving || waiting) return;
    const dismiss = (e: PointerEvent) => {
      if (e.button === 0) startExit();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") startExit();
    };
    // Observe the gesture without swallowing card drags or button actions.
    window.addEventListener("pointerdown", dismiss, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", key);
    };
  }, [displayed, leaving, waiting]);
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
      ref={banner}
      key={displayed.key}
      className={`arena-notice ${leaving ? "leaving" : ""}`}
      role="status"
    >
      <small>TURNO {displayed.key.split(":")[0]}</small>
      <strong>{displayed.title}</strong>
      <p>{displayed.detail}</p>
      {displayed.mana && <b className="notice-mana">✦ {displayed.mana}</b>}
      <span className="notice-dismiss-hint">
        Clique ou toque para dispensar
      </span>
    </div>
  );
}
