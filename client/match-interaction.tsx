import { isCommand, type Cmd, type CommandDraft } from "../shared/model.js";
import { MatchControls } from "./match-controls.js";
import {
  emptySelection,
  selectionCommands,
  selectedAbility,
  type Selection,
  type SelectionDraft,
  type Point,
} from "./action-selection.js";
export type { Selection } from "./action-selection.js";
import type { Card } from "../shared/cards.js";
import type { CardFocus } from "./card.js";
import type { GameView, UnitView } from "../shared/room.js";
import { useEffect, useMemo, useState } from "preact/hooks";
import { spellSpecs, targetFlow } from "../shared/spells.js";
import { cards as catalog, moveOptions, route, kw } from "../shared/game.js";
import {
  hasAbility,
  cardPlan,
  abilityPlan,
  commandError,
  previewAction,
} from "../shared/action-advice.js";

/** Owns hand selection, targeting and the command controls for one match. */
export function useMatchInteraction(
  g: GameView,
  seat: number,
  busy: boolean,
  onAct: (command: Cmd) => Promise<boolean>,
  setFocus: (focus: CardFocus) => void,
  code: string,
) {
  const [draft, setDraft] = useState<SelectionDraft>(emptySelection),
    [drag, setDrag] = useState<Selection | null>(null),
    [mulligan, setMulligan] = useState<number[]>([]),
    [startY, setStartY] = useState(2),
    [aim, setAim] = useState<Point | null>(null),
    [feedback, setFeedback] = useState("");
  const { selected, targetIds, cells, choice, extra, targetMode } = draft;
  const change = (patch: Partial<SelectionDraft>) =>
    setDraft((previous) => ({ ...previous, ...patch }));
  const select = (selected: Selection | null, targetMode = false) => {
    setDraft({ ...emptySelection(), selected, targetMode });
    setAim(null);
    setFeedback("");
    setDrag(null);
  };
  const me = seat >= 0 ? g.players[seat] : null,
    myTurn = seat === g.priority && !g.setup && !g.centerPending,
    finished = g.winner !== null || g.draw,
    selectedCard =
      selected?.kind === "hand" ? catalog.get(selected.cardId) : null,
    selectedUnit = g.units.find((u) => u.id === selected?.unitId);
  async function act(command: CommandDraft) {
    if (busy) return false;
    const error = commandError(g, seat, command);
    if (error) {
      setFeedback(error);
      return false;
    }
    if (!isCommand(command)) {
      setFeedback("Conclua a seleção da ação.");
      return false;
    }
    const accepted = await onAct(command);
    if (accepted) clear();
    return accepted;
  }
  const clear = () => select(null);
  function pickHand(index: number) {
    if (g.setup) {
      if (me?.mulligan || me?.ready) return;
      setMulligan(
        mulligan.includes(index)
          ? mulligan.filter((i) => i !== index)
          : [...mulligan, index],
      );
      return;
    }
    select({ kind: "hand", cardId: me!.hand[index], index });
  }
  useEffect(() => {
    if (!g.setup || me?.mulligan || me?.ready) setMulligan([]);
  }, [g.setup, me?.mulligan, me?.ready]);
  const active = drag || selected,
    activeCard = active?.kind === "hand" ? catalog.get(active.cardId) : null,
    activeUnit = g.units.find((u) => u.id === active?.unitId);
  const handPlans = useMemo(
    () => (me ? me.hand.map((id, i) => cardPlan(g, seat, id, i)) : []),
    [g, seat],
  );
  const unitPlans = useMemo(
    () =>
      new Map(
        g.units
          .filter((u) => u.owner === seat && hasAbility(u))
          .map((u) => [u.id, abilityPlan(g, seat, u)]),
      ),
    [g, seat],
  );
  const activePlan = useMemo(
    () =>
      activeCard
        ? active?.fromDeck
          ? cardPlan(g, seat, activeCard.id, -1, true)
          : handPlans[active?.index ?? -1]
        : activeUnit
          ? unitPlans.get(activeUnit.id)
          : undefined,
    [g, seat, active, handPlans, unitPlans],
  );
  const flow = targetFlow(
    activeCard ? spellSpecs[activeCard.id]?.target : undefined,
  );
  const { castCommand, abilityCommand, rangedCommand } =
    selectionCommands(draft);
  const draftOptions = (activePlan?.options || []).filter(
    (c) =>
      (!targetIds[0] ||
        (activeCard?.kind === "spell" &&
          !(flow.multipleUnits || flow.unitThenCell)) ||
        c.targetId === targetIds[0]) &&
      (!targetIds[1] || c.targetId2 === targetIds[1]) &&
      (!flow.multipleCells ||
        !cells[0] ||
        (c.x === cells[0].x && c.y === cells[0].y)),
  );
  const validTargets = [
    ...new Set(
      draftOptions
        .map((c) =>
          targetIds.length && activeCard?.kind === "spell" && flow.multipleUnits
            ? c.targetId2
            : c.targetId,
        )
        .filter((id): id is string => !!id),
    ),
  ];
  if (activeUnit && targetMode && kw(activeUnit, "Range"))
    for (const u of g.units)
      if (
        !commandError(g, seat, {
          type: "attack",
          unitId: activeUnit.id,
          targetId: u.id,
        })
      )
        validTargets.push(u.id);
  const highlights = useMemo(() => {
    if (seat < 0 || finished || g.setup) return [];
    if (g.followup?.seat === seat) {
      const u = g.units.find((u) => u.id === g.followup!.unitId);
      return u
        ? Array.from({ length: 49 }, (_, i) => ({
            x: i % 7,
            y: Math.floor(i / 7),
          })).filter((v) => {
            const p = route(g, u, v.x, v.y);
            return (
              p &&
              p.length > 0 &&
              p.length <= g.followup!.distance &&
              !g.units.some((u) => u.x === v.x && u.y === v.y)
            );
          })
        : [];
    }
    if (activeCard || (activeUnit && targetMode))
      return draftOptions
        .filter((c) => c.x !== undefined && c.y !== undefined)
        .map((c) =>
          flow.multipleCells && cells.length
            ? { x: c.x2!, y: c.y2! }
            : { x: c.x!, y: c.y! },
        );
    if (
      activeUnit &&
      myTurn &&
      g.phase === 2 &&
      g.phaseOwner === seat &&
      !g.combat &&
      !g.stack.length
    )
      return moveOptions(g, activeUnit);
    return [];
  }, [
    g,
    seat,
    active,
    activePlan,
    myTurn,
    finished,
    targetMode,
    targetIds,
    cells,
  ]);
  function chooseTarget(u: UnitView) {
    setFeedback("");
    const multiple = flow.multipleUnits;
    if (targetIds.includes(u.id)) {
      change({
        targetIds: multiple ? targetIds.slice(0, targetIds.indexOf(u.id)) : [],
      });
      return true;
    }
    const options =
      multiple && targetIds.length ? draftOptions : activePlan?.options || [];
    const valid =
      options.some(
        (c) =>
          (multiple && targetIds.length ? c.targetId2 : c.targetId) === u.id,
      ) ||
      (!!selectedUnit &&
        targetMode &&
        !commandError(g, seat, {
          type: "attack",
          unitId: selectedUnit.id,
          targetId: u.id,
        }));
    if (!valid) {
      setFeedback(activePlan?.reason || "Escolha um dos alvos iluminados.");
      return false;
    }
    change({ targetIds: multiple ? [...targetIds.slice(0, 1), u.id] : [u.id] });
    return true;
  }
  async function dropAt(x: number, y: number, u?: UnitView, data = active) {
    setDrag(null);
    if (g.followup?.seat === seat) {
      return act({ type: "followup", x, y });
    }
    if (!data) return false;
    if (data.kind === "unit") {
      if (data.unitId === u?.id) return false;
      if (g.phase === 2 && g.priority === seat)
        return act({ type: "move", unitId: data.unitId, x, y });
      return false;
    }
    const card = catalog.get(data.cardId);
    if (!card) return false;
    if (card.kind === "unit") {
      return act({
        type: "summon",
        cardId: card.id,
        handIndex: data.index,
        choice: data.fromDeck ? "library" : undefined,
        x,
        y,
        targetId: u?.id || targetIds[0],
        targetId2: targetIds[1],
      });
    }
    const spec = spellSpecs[card.id];
    select(data);
    const { needsUnit, submitOnDrop } = targetFlow(spec.target);
    const plan = cardPlan(g, seat, card.id, data.index);
    if (needsUnit && (!u || !plan?.options.some((c) => c.targetId === u.id))) {
      change({ targetIds: [], cells: [] });
      setFeedback(plan?.reason || "Escolha um dos alvos iluminados.");
      return false;
    }
    const t = needsUnit && u ? [u.id] : [];
    change({ targetIds: t, cells: [{ x, y }] });
    if (submitOnDrop)
      return act({
        type: "cast",
        cardId: card.id,
        handIndex: data.index,
        targetId: u?.id,
        x,
        y,
      });
    return false;
  }
  function cellClick(x: number, y: number, u?: UnitView) {
    if (g.followup?.seat === seat) {
      void act({ type: "followup", x, y });
      return;
    }
    if (g.setup) {
      if (x === (seat ? 6 : 0) && (y === 2 || y === 4)) setStartY(y);
      return;
    }
    if (g.centerPending) {
      if (u && u.owner === seat) select({ kind: "unit", unitId: u.id });
      return;
    }
    if (selectedCard?.kind === "spell") {
      if (flow.cellOnly || !u) {
        if (!highlights.some((c) => c.x === x && c.y === y)) return;
        setFeedback("");
        change({
          cells: flow.multipleCells
            ? [...cells.slice(-1), { x, y }]
            : [{ x, y }],
        });
      } else if (chooseTarget(u)) change({ cells: [{ x, y }] });
      return;
    }
    if (
      selectedUnit &&
      !targetMode &&
      g.phase === 2 &&
      selectedUnit.owner === seat &&
      selectedUnit.id !== u?.id &&
      (!u || u.owner !== seat || u.kind === "curse")
    ) {
      dropAt(x, y, u, selected);
      return;
    }
    if (selectedCard?.kind === "unit") {
      if (u) {
        if (chooseTarget(u)) change({ cells: [{ x, y }] });
      } else dropAt(x, y, u, selected);
      return;
    }
    if (u) {
      if (
        selectedUnit &&
        u.id !== selectedUnit.id &&
        (targetMode || g.phase !== 2)
      ) {
        if (chooseTarget(u)) change({ cells: [{ x, y }] });
      } else {
        select({ kind: "unit", unitId: u.id });
      }
    } else change({ cells: [...cells.slice(-1), { x, y }] });
  }
  const abilitySpec = selectedAbility(selectedUnit);
  const canPlay = !!me && !g.setup && !g.centerPending && !finished && !busy;

  const preview = useMemo(() => {
    if (!active || g.setup || finished) return null;
    if (feedback)
      return {
        title: "Ação indisponível",
        cost: 0,
        error: feedback,
        affected: [],
        path: [],
      };
    const atAim = aim && g.units.find((u) => u.x === aim.x && u.y === aim.y);
    let command: CommandDraft | undefined;
    if (activeUnit) {
      if (targetMode) {
        const targetId = atAim?.id || targetIds[0];
        command = abilitySpec
          ? {
              ...abilityCommand,
              ...(aim || {}),
              targetId: targetIds[0] || targetId,
            }
          : targetId
            ? { ...rangedCommand, targetId }
            : undefined;
      } else if (aim && (aim.x !== activeUnit.x || aim.y !== activeUnit.y))
        command = { type: "move", unitId: activeUnit.id, ...aim };
    } else if (activeCard?.kind === "unit" && aim)
      command = {
        type: "summon",
        cardId: activeCard.id,
        handIndex: active.index,
        choice: active.fromDeck ? "library" : undefined,
        ...aim,
        targetId: atAim?.id || targetIds[0],
      };
    else if (activeCard?.kind === "spell") {
      command = {
        ...castCommand,
        cardId: activeCard.id,
        handIndex: active.index,
      };
      if (aim) {
        if (atAim)
          command =
            targetIds.length && flow.multipleUnits
              ? { ...command, targetId2: atAim.id }
              : { ...command, targetId: atAim.id };
        command =
          flow.multipleCells && cells.length
            ? { ...command, x2: aim.x, y2: aim.y }
            : { ...command, ...aim };
      }
    }
    return command ? previewAction(g, seat, command) : null;
  }, [
    g,
    seat,
    active,
    aim,
    targetIds,
    cells,
    extra,
    choice,
    targetMode,
    feedback,
    finished,
  ]);
  function reset() {
    clear();
    setMulligan([]);
    setStartY(2);
  }
  useEffect(reset, [code]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [code]);
  useEffect(() => {
    clear();
  }, [g.turn, g.phase, g.phaseOwner]);
  return {
    arena: {
      selected,
      handPlans,
      readyAbilities: [...unitPlans]
        .filter(([, plan]) => plan.options.length)
        .map(([id]) => id),
      onAbility: (u: UnitView) => {
        select({ kind: "unit", unitId: u.id }, true);
      },
      preview,
      validTargets,
      onAim: (cell: { x: number; y: number } | null) =>
        setAim((previous) =>
          previous?.x === cell?.x && previous?.y === cell?.y ? previous : cell,
        ),
      highlights,
      targets: targetIds,
      mulligan,
      startY,
      onAct: act,
      onHand: pickHand,
      onCell: cellClick,
      onSelect: (u: UnitView) => {
        if (u.owner === seat && !targetMode && selected?.kind !== "hand") {
          select({ kind: "unit", unitId: u.id });
        }
      },
      onDrag: setDrag,
      onDrop: dropAt,
      onFocus: (card: Card | undefined, unit?: UnitView) =>
        setFocus({ card, unit }),
      onStartY: setStartY,
      onMulligan: () => {
        void act({ type: "mulligan", handIndices: mulligan });
        setMulligan([]);
      },
      onClear: clear,
      controls: (
        <MatchControls
          game={g}
          seat={seat}
          draft={draft}
          plan={activePlan}
          feedback={feedback}
          canPlay={canPlay}
          onChange={change}
          onSelect={select}
          onClear={clear}
          onAct={act}
        />
      ),
    },
  };
}
