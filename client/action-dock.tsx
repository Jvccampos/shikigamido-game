import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import { layout } from "../shared/arena-layout.js";

/** Keep the current action near the field without covering selectable pieces. */
export function ActionDock({
  game,
  targets,
  children,
}: {
  game: GameView;
  targets: { x: number; y: number }[];
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const w = innerWidth,
        h = innerHeight,
        box = el.getBoundingClientRect(),
        board = layout(w, h);
      const compact = h < 560 && w > h,
        mobile = w < 760;
      const preferred = compact
        ? { x: w - box.width - 12, y: 90 }
        : mobile
          ? { x: w - box.width - 12, y: 174 }
          : { x: (w - box.width) / 2, y: h - 300 - box.height };
      const blocks = [...game.units, ...targets].map((u) => {
        const p = board.point(u.x, u.y),
          r = board.dx * 0.4;
        return { x: p.x - r, y: p.y - r, width: r * 2, height: r * 2 };
      });
      for (const node of Array.from(
        document.querySelectorAll(
          ".duelist,.arena-pass,.duel-context,.fan-art",
        ),
      )) {
        const r = node.getBoundingClientRect();
        blocks.push({ x: r.x, y: r.y, width: r.width, height: r.height });
      }
      const score = (x: number, y: number) => {
        let cost = Math.hypot(x - preferred.x, y - preferred.y);
        for (const r of blocks) {
          const overlapX =
            Math.min(x + box.width, r.x + r.width) - Math.max(x, r.x);
          const overlapY =
            Math.min(y + box.height, r.y + r.height) - Math.max(y, r.y);
          if (overlapX > 0 && overlapY > 0) cost += 10000 + overlapX * overlapY;
        }
        return cost;
      };
      let best = {
          left: Math.max(8, preferred.x),
          top: Math.max(8, preferred.y),
        },
        bestScore = score(best.left, best.top);
      for (let y = 60; y <= h - box.height - 8; y += 16)
        for (let x = 8; x <= w - box.width - 8; x += 16) {
          const s = score(x, y);
          if (s < bestScore) {
            best = { left: x, top: y };
            bestScore = s;
          }
        }
      setPosition((old) =>
        old.left === best.left && old.top === best.top ? old : best,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(ref.current!);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [game.revision, targets.map((p) => `${p.x},${p.y}`).join(";")]);
  return (
    <section
      ref={ref}
      className="action-dock"
      aria-label="Ação da carta"
      style={position}
    >
      {children}
    </section>
  );
}
