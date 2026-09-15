import { useEffect, useRef, useState } from "preact/hooks";
import { ArenaScene, type ArenaState } from "./arena-scene.js";

export function useArenaScene(
  value: ArenaState,
  onPresentationBusy: (busy: boolean) => void,
) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<ArenaScene | null>(null),
    latest = useRef(value),
    onBusy = useRef(onPresentationBusy);
  latest.current = value;
  onBusy.current = onPresentationBusy;
  const [ready, setReady] = useState(false),
    [canvasError, setCanvasError] = useState("");
  // Pixi retains handlers between redraws. Forward input to the current render,
  // including hand selections that do not change a selected board-piece ID.
  function currentState(): ArenaState {
    return {
      ...latest.current,
      onAbility: (unit) => latest.current.onAbility?.(unit),
      onAim: (point) => latest.current.onAim?.(point),
      onCell: (x, y, unit) => latest.current.onCell(x, y, unit),
      onSelect: (unit) => latest.current.onSelect(unit),
      onDrop: (x, y, unit, id) => latest.current.onDrop(x, y, unit, id),
      onInspect: (unit) => latest.current.onInspect(unit),
      onHover: (unit) => latest.current.onHover(unit),
      onPresentation: (presentation, units) =>
        latest.current.onPresentation(presentation, units),
    };
  }
  useEffect(() => {
    let closed = false;
    const engine = new ArenaScene();
    scene.current = engine;
    engine
      .init(host.current!, currentState())
      .then(() => {
        if (!closed) setReady(true);
      })
      .catch(() => {
        if (closed) return;
        setCanvasError(
          "Não foi possível iniciar a arena gráfica. Ative a aceleração de hardware do navegador e recarregue.",
        );
      });
    return () => {
      closed = true;
      engine.destroy();
      onBusy.current(false);
    };
  }, []);
  useEffect(() => {
    if (ready) scene.current?.update(currentState());
  }, [
    ready,
    value.game,
    value.seat,
    value.highlights,
    value.selectedId,
    value.targets,
    value.startY,
    value.previewPath,
    value.affected,
    value.validTargets,
    value.readyAbilities,
  ]);
  function cellAt(clientX: number, clientY: number) {
    const rect = host.current?.getBoundingClientRect();
    return rect
      ? scene.current?.cellAt(clientX - rect.left, clientY - rect.top) || null
      : null;
  }
  return { host, ready, canvasError, cellAt };
}
