import { useLayoutEffect, useRef } from "preact/hooks";
import type { PhaseNotice } from "./duel-presentation.js";

/** Renders the notice and preserves its current opacity when the exit begins. */
export function ArenaNotices({
  notice: displayed,
  leaving,
}: {
  notice: PhaseNotice | null;
  leaving: boolean;
}) {
  const banner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = banner.current;
    if (!node) return;
    if (leaving)
      node.style.setProperty(
        "--notice-exit-opacity",
        getComputedStyle(node).opacity,
      );
    node.classList.toggle("leaving", leaving);
  }, [displayed?.key, leaving]);
  if (!displayed) return null;
  return (
    <div
      ref={banner}
      key={displayed.key}
      className="arena-notice"
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
