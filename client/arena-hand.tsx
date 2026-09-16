import { useEffect, useRef, useState } from "preact/hooks";
import { cards } from "../shared/cards.js";
import type { Card } from "../shared/cards.js";
import type { GameView, UnitView } from "../shared/room.js";
import type { Selection, Point } from "./action-selection.js";
import type { ActionPlan } from "../shared/action-advice.js";

type Props = {
  game: GameView;
  seat: number;
  selected: Selection | null;
  handPlans: ActionPlan[];
  busy: boolean;
  viewport: number;
  railLeft: number;
  obscured: boolean;
  cellAt: (x: number, y: number) => Point | null;
  onAim: (point: Point | null) => void;
  onDrop: (
    x: number,
    y: number,
    unit?: UnitView,
    data?: Selection | null,
  ) => Promise<boolean>;
  onDrag: (data: Selection | null) => void;
  onHand: (index: number) => void;
  onFocus: (card: Card | undefined) => void;
  onDiscard: () => void;
  onHover: () => void;
  onDragging: (dragging: boolean) => void;
};
export function ArenaHand(p: Props) {
  const g = p.game,
    me = g.players[p.seat],
    done = g.winner !== null || g.draw;
  const latest = useRef(p);
  latest.current = p;
  const [handHover, setHandHover] = useState<number | null>(null),
    [dragging, setDragging] = useState<{
      index: number;
      x: number;
      y: number;
      moving: boolean;
    } | null>(null);
  const handHoverRef = useRef<number | null>(null),
    dragRef = useRef(dragging);
  dragRef.current = dragging;
  useEffect(() => {
    p.onDragging(!!dragging);
  }, [!!dragging]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        document.querySelector("dialog[open]") ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      const v = latest.current,
        index = handHoverRef.current;
      if (e.key.toLowerCase() === "f" && index !== null)
        v.onFocus(cards.get(v.game.players[v.seat].hand[index]));
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      latest.current.onDragging(false);
    };
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = {
        ...d,
        x: e.clientX,
        y: e.clientY,
        moving: d.moving || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5,
      };
      dragRef.current = next;
      setDragging(next);
      if (next.moving) {
        latest.current.onAim(latest.current.cellAt(e.clientX, e.clientY));
      }
    };
    const end = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDragging(null);
      const v = latest.current;
      if (d.moving) {
        const cell = v.cellAt(e.clientX, e.clientY);
        if (cell)
          v.onDrop(
            cell.x,
            cell.y,
            v.game.units.find((u) => u.x === cell.x && u.y === cell.y),
            {
              kind: "hand",
              cardId: v.game.players[v.seat].hand[d.index],
              index: d.index,
            },
          );
      } else if (v.game.phase === 4 && v.game.priority === v.seat)
        v.onDiscard();
      else v.onHand(d.index);
      v.onDrag(null);
    };
    const cancel = () => {
      dragRef.current = null;
      setDragging(null);
      latest.current.onDrag(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, []);
  return (
    <>
      <div className="arena-hand">
        <span className="hand-caption">
          {`${me.hand.length} CARTAS · ARRASTE PARA JOGAR`}
        </span>
        <div className="hand-fan">
          {me.hand.map((id, index) => {
            const c = cards.get(id)!,
              plan = p.handPlans[index],
              center = index - (me.hand.length - 1) / 2,
              n = Math.min(
                80,
                (p.viewport > 1100
                  ? Math.max(160, 2 * (p.railLeft - p.viewport / 2) - 240)
                  : p.viewport - (p.viewport < 760 ? 115 : 560)) /
                  Math.max(1, me.hand.length),
              ),
              angle = center * Math.min(4, 30 / me.hand.length),
              lift = Math.abs(center) ** 2 * 2;
            return (
              <div
                key={`${index}-${id}`}
                className={`fan-card ${plan?.reason ? "not-playable" : "playable"} ${p.selected?.index === index && p.selected?.kind === "hand" ? "selected" : ""}  ${dragging?.index === index && dragging.moving ? "dragged" : ""}`}
                style={{
                  "--offset": `${center * n}px`,
                  "--angle": `${angle}deg`,
                  "--lift": `${lift}px`,
                  "--order": index,
                }}
              >
                <button
                  className="fan-art"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    p.onFocus(c);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || p.busy || done) return;
                    if (p.handPlans[index]?.reason && g.phase !== 4) {
                      p.onHand(index);
                      return;
                    }
                    e.preventDefault();
                    const d = {
                      index,
                      x: e.clientX,
                      y: e.clientY,
                      moving: false,
                    };
                    dragRef.current = d;
                    setDragging(d);
                    p.onDrag({ kind: "hand", cardId: id, index });
                  }}
                  onMouseEnter={() => {
                    handHoverRef.current = index;
                    p.onHover();
                    setHandHover(index);
                  }}
                  onMouseLeave={() => {
                    handHoverRef.current = null;
                    setHandHover(null);
                  }}
                  onFocus={() => {
                    p.onHover();
                    handHoverRef.current = index;
                    setHandHover(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      p.onHand(index);
                    }
                  }}
                  aria-label={`Selecionar ${c.name}, cópia ${index + 1}. ${plan?.reason || "Disponível"}`}
                >
                  <img src={c.asset} alt={c.name} draggable={false} />
                  <b
                    className={`fan-cost ${(plan?.cost ?? c.stats.cost) > me.pe + me.permanentPe ? "unaffordable" : ""}`}
                  >
                    {c.kind === "spell" && c.stats.variable
                      ? "X"
                      : (plan?.cost ?? c.stats.cost)}
                  </b>
                </button>
                <button
                  className="fan-zoom"
                  aria-label={`Ler ${c.name}`}
                  onClick={() => p.onFocus(c)}
                >
                  <span aria-hidden="true">⤢</span> Ler
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={`hand-action-hint ${!p.obscured && handHover !== null && p.handPlans[handHover]?.reason ? "visible" : ""}`}
        role="status"
      >
        <span className="hand-hint-icon" aria-hidden="true">
          !
        </span>
        <div>
          <small>
            {handHover !== null
              ? cards.get(me?.hand[handHover] || "")?.name
              : ""}
          </small>
          <span>
            {handHover !== null ? p.handPlans[handHover]?.reason : ""}
          </span>
        </div>
      </div>
      {dragging?.moving && me && (
        <div
          className="drag-ghost"
          style={{ left: dragging.x, top: dragging.y }}
        >
          <img src={cards.get(me.hand[dragging.index])?.asset} alt="" />
        </div>
      )}
    </>
  );
}
