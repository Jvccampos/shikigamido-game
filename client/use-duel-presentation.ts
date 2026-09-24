import { useEffect, useMemo, useReducer, useState } from "preact/hooks";
import type { GameView, UnitView } from "../shared/room.js";
import {
  DuelPresentation,
  type ArenaOverlays,
  type Presentation,
} from "./duel-presentation.js";

/** Adapts presentation transitions to browser timers and scene callbacks. */
export function useDuelPresentation(
  game: GameView,
  seat: number,
  names: string[],
) {
  const [model] = useState(() => new DuelPresentation());
  const [version, refresh] = useReducer((n: number) => n + 1, 0);
  model.update(game, seat, names, performance.now());
  const view = model.view;
  const handlers = useMemo(
    () => ({
      onScene: (
        presentation: Presentation | null,
        units?: UnitView[],
        revision?: number,
      ) => {
        if (model.scene(presentation, units, revision, performance.now()))
          refresh(undefined);
      },
      onReady: (ready: boolean) => {
        model.sceneReady(ready, performance.now());
        refresh(undefined);
      },
      onOverlays: (overlays: ArenaOverlays) => {
        model.showOverlays(overlays, performance.now());
        refresh(undefined);
      },
      dismiss: () => {
        model.dismiss(performance.now());
        refresh(undefined);
      },
    }),
    [model],
  );
  useEffect(() => {
    if (view.nextDeadline === null) return;
    // Timers may fire slightly before performance.now() reaches the deadline.
    // Re-arm after every refresh so an early wake-up cannot strand the state.
    const timer = setTimeout(
      () => {
        model.advance(performance.now());
        refresh(undefined);
      },
      Math.max(0, view.nextDeadline - performance.now()) + 1,
    );
    return () => clearTimeout(timer);
  }, [model, view.nextDeadline, version]);
  useEffect(() => {
    if (!view.noticeDismissible) return;
    const pointer = (event: PointerEvent) => {
      if (event.button === 0) handlers.dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") handlers.dismiss();
    };
    // Observe the gesture without swallowing card drags or button actions.
    window.addEventListener("pointerdown", pointer, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", key);
    };
  }, [view.noticeDismissible, handlers]);
  return { ...handlers, ...view };
}

export type DuelPresentationState = ReturnType<typeof useDuelPresentation>;
