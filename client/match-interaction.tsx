import { ActionDock } from "./action-dock.js";
import type { Card } from "../shared/cards.js";
import type { CardFocus } from "./card.js";
import type { GameView, UnitView } from "../shared/room.js";
import { useEffect, useMemo, useState } from "preact/hooks";
import { abilities } from "../shared/abilities.js";
import { spellSpecs, transferableKeywords } from "../shared/spells.js";
import {
  cards as catalog,
  moveOptions,
  route,
  kw,
  type Cmd,
} from "../shared/game.js";
import {
  hasAbility,
  cardPlan,
  abilityPlan,
  commandError,
  actionCost,
  previewAction,
} from "../shared/action-advice.js";
import { E, unitName } from "./card.js";

export type Selection =
  | {
      kind: "hand";
      cardId: string;
      index: number;
      fromDeck?: boolean;
      unitId?: never;
    }
  | {
      kind: "unit";
      unitId: string;
      cardId?: never;
      index?: never;
      fromDeck?: never;
    };

/** Owns hand selection, targeting and the command controls for one match. */
export function useMatchInteraction(
  g: GameView | undefined,
  seat: number,
  busy: boolean,
  onAct: (command: Cmd) => Promise<boolean>,
  setFocus: (focus: CardFocus) => void,
  code: string,
) {
  const [selected, setSelected] = useState<Selection | null>(null),
    [drag, setDrag] = useState<Selection | null>(null),
    [targetIds, setTargetIds] = useState<string[]>([]),
    [cells, setCells] = useState<{ x: number; y: number }[]>([]),
    [choice, setChoice] = useState(""),
    [extra, setExtra] = useState(0),
    [mulligan, setMulligan] = useState<number[]>([]),
    [startY, setStartY] = useState(2),
    [aim, setAim] = useState<{ x: number; y: number } | null>(null),
    [feedback, setFeedback] = useState("");
  const me = seat >= 0 ? g?.players?.[seat] : null,
    myTurn = !!g && seat === g.priority && !g.setup && !g.centerPending,
    finished = !!g && ((g.winner !== null && g.winner !== undefined) || g.draw),
    selectedCard =
      selected?.kind === "hand" ? catalog.get(selected.cardId) : null,
    selectedUnit = g?.units?.find((u) => u.id === selected?.unitId);
  async function act(command: Cmd) {
    if (busy || !g) return false;
    const error = commandError(g, seat, command);
    if (error) {
      setFeedback(error);
      return false;
    }
    const accepted = await onAct(command);
    if (accepted) clear();
    return accepted;
  }
  const clear = () => {
    setTargetMode(false);
    setAim(null);
    setFeedback("");
    setSelected(null);
    setTargetIds([]);
    setCells([]);
    setExtra(0);
    setChoice("");
    setDrag(null);
  };
  function pickHand(index: number) {
    if (g?.setup) {
      if (me?.mulligan || me?.ready) return;
      setMulligan(
        mulligan.includes(index)
          ? mulligan.filter((i) => i !== index)
          : [...mulligan, index],
      );
      return;
    }
    clear();
    setSelected({ kind: "hand", cardId: me!.hand[index], index });
  }
  useEffect(() => {
    if (!g?.setup || me?.mulligan || me?.ready) setMulligan([]);
  }, [g?.setup, me?.mulligan, me?.ready]);
  const [targetMode, setTargetMode] = useState(false);
  const active = drag || selected,
    activeCard = active?.kind === "hand" ? catalog.get(active.cardId) : null,
    activeUnit = g?.units?.find((u) => u.id === active?.unitId);
  const handPlans = useMemo(
    () => (g && me ? me.hand.map((id, i) => cardPlan(g, seat, id, i)) : []),
    [g?.revision, seat],
  );
  const unitPlans = useMemo(
    () =>
      new Map(
        g?.units
          .filter((u) => u.owner === seat && hasAbility(u))
          .map((u) => [u.id, abilityPlan(g, seat, u)]),
      ),
    [g?.revision, seat],
  );
  const activePlan = useMemo(
    () =>
      !g
        ? undefined
        : activeCard
          ? active?.fromDeck
            ? cardPlan(g, seat, activeCard.id, -1, true)
            : handPlans[active?.index ?? -1]
          : activeUnit
            ? unitPlans.get(activeUnit.id)
            : undefined,
    [
      g?.revision,
      seat,
      active?.cardId,
      active?.index,
      active?.unitId,
      handPlans,
      unitPlans,
    ],
  );
  const castCommand: Cmd = {
    type: "cast",
    cardId: selectedCard?.id,
    handIndex: selected?.index,
    targetId: targetIds[0],
    targetId2: targetIds[1],
    x: cells[0]?.x,
    y: cells[0]?.y,
    x2: cells[1]?.x,
    y2: cells[1]?.y,
    extraPe: extra,
    choice,
  };
  const abilityCommand: Cmd = {
    type: "ability",
    unitId: selectedUnit?.id,
    targetId: targetIds[0],
    x: cells[0]?.x,
    y: cells[0]?.y,
    choice,
  };
  const rangedCommand: Cmd = {
    type: "attack",
    unitId: selectedUnit?.id,
    targetId: targetIds[0],
  };
  const castError =
    g && selectedCard?.kind === "spell"
      ? commandError(g, seat, castCommand)
      : undefined;
  const abilityError =
    g && selectedUnit ? commandError(g, seat, abilityCommand) : undefined;
  const rangedError =
    g && selectedUnit ? commandError(g, seat, rangedCommand) : undefined;
  const draftOptions = (activePlan?.options || []).filter(
    (c) =>
      (!targetIds[0] ||
        (activeCard?.kind === "spell" &&
          !["twoAllies", "twoUnits", "redirect", "move"].includes(
            spellSpecs[activeCard.id].target,
          )) ||
        c.targetId === targetIds[0]) &&
      (!targetIds[1] || c.targetId2 === targetIds[1]) &&
      (activeCard?.id !== "ventos-favoraveis" ||
        !cells[0] ||
        (c.x === cells[0].x && c.y === cells[0].y)),
  );
  const validTargets = [
    ...new Set(
      draftOptions
        .map((c) =>
          targetIds.length &&
          activeCard?.kind === "spell" &&
          ["twoAllies", "twoUnits", "redirect"].includes(
            spellSpecs[activeCard.id].target,
          )
            ? c.targetId2
            : c.targetId,
        )
        .filter((id): id is string => !!id),
    ),
  ];
  if (
    activeUnit &&
    targetMode &&
    (kw(activeUnit, "Range") || activeUnit.statuses?.range) &&
    g
  )
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
    if (!g || seat < 0 || finished || g.setup) return [];
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
          activeCard?.id === "ventos-favoraveis" && cells.length
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
    g?.revision,
    active?.unitId,
    active?.cardId,
    active?.index,
    myTurn,
    finished,
    targetMode,
    targetIds.join(),
    cells.map((c) => `${c.x},${c.y}`).join(),
  ]);
  function chooseTarget(u: UnitView) {
    setFeedback("");
    const multiple =
      selectedCard?.kind === "spell" &&
      ["twoAllies", "twoUnits", "redirect"].includes(
        spellSpecs[selectedCard.id].target,
      );
    if (targetIds.includes(u.id)) {
      setTargetIds(multiple ? targetIds.slice(0, targetIds.indexOf(u.id)) : []);
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
        !commandError(g!, seat, {
          type: "attack",
          unitId: selectedUnit.id,
          targetId: u.id,
        }));
    if (!valid) {
      setFeedback(activePlan?.reason || "Escolha um dos alvos iluminados.");
      return false;
    }
    setTargetIds(multiple ? [...targetIds.slice(0, 1), u.id] : [u.id]);
    return true;
  }
  async function dropAt(x: number, y: number, u?: UnitView, data = active) {
    setDrag(null);
    if (g?.followup?.seat === seat) {
      return act({ type: "followup", x, y });
    }
    if (!data) return false;
    if (data.kind === "unit") {
      if (data.unitId === u?.id) return false;
      if (g?.phase === 2 && g.priority === seat)
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
    setSelected(data);
    const needsUnit = ![
      "none",
      "cell",
      "lake",
      "wind",
      "discardVoid",
      "discardCat",
    ].includes(spec.target);
    const plan = g ? cardPlan(g, seat, card.id, data.index) : undefined;
    if (needsUnit && (!u || !plan?.options.some((c) => c.targetId === u.id))) {
      setTargetIds([]);
      setCells([]);
      setFeedback(plan?.reason || "Escolha um dos alvos iluminados.");
      return false;
    }
    const t = needsUnit && u ? [u.id] : [];
    setTargetIds(t);
    setCells([{ x, y }]);
    if (
      [
        "unit",
        "ally",
        "windAlly",
        "omionjiFire",
        "combat",
        "lake",
        "none",
      ].includes(spec.target)
    )
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
    if (g?.followup?.seat === seat) {
      void act({ type: "followup", x, y });
      return;
    }
    if (g?.setup) {
      if (x === (seat ? 6 : 0) && (y === 2 || y === 4)) setStartY(y);
      return;
    }
    if (g?.centerPending) {
      if (u && u.owner === seat) setSelected({ kind: "unit", unitId: u.id });
      return;
    }
    if (selectedCard?.kind === "spell") {
      const spec = spellSpecs[selectedCard.id];
      if (["cell", "lake", "wind"].includes(spec.target) || !u) {
        if (!highlights.some((c) => c.x === x && c.y === y)) return;
        setFeedback("");
        setCells((prev) =>
          spec.target === "wind" ? [...prev.slice(-1), { x, y }] : [{ x, y }],
        );
      } else if (chooseTarget(u)) setCells([{ x, y }]);
      return;
    }
    if (
      selectedUnit &&
      !targetMode &&
      g?.phase === 2 &&
      selectedUnit.owner === seat &&
      selectedUnit.id !== u?.id &&
      (!u || u.owner !== seat || u.kind === "curse")
    ) {
      dropAt(x, y, u, selected);
      return;
    }
    if (selectedCard?.kind === "unit") {
      if (u) {
        if (chooseTarget(u)) setCells([{ x, y }]);
      } else dropAt(x, y, u, selected);
      return;
    }
    if (u) {
      if (
        selectedUnit &&
        u.id !== selectedUnit.id &&
        (targetMode || g?.phase !== 2)
      ) {
        if (chooseTarget(u)) setCells([{ x, y }]);
      } else {
        clear();
        setSelected({ kind: "unit", unitId: u.id });
      }
    } else setCells((prev) => [...prev.slice(-1), { x, y }]);
  }
  const abilitySpec = selectedUnit
    ? abilities[selectedUnit.cardId] ||
      (selectedUnit.statuses?.construir || kw(selectedUnit, "Construir")
        ? abilities["kuma-no-tsuno"]
        : undefined)
    : undefined;
  const canPlay = !!me && !g?.setup && !g?.centerPending && !finished && !busy;

  const preview = useMemo(() => {
    if (!g || !active || g.setup || finished) return null;
    if (feedback)
      return {
        title: "Ação indisponível",
        cost: 0,
        energy: 0,
        reserve: 0,
        error: feedback,
        lines: [],
        affected: [],
        path: [],
      };
    const atAim = aim && g.units.find((u) => u.x === aim.x && u.y === aim.y);
    let command: Cmd | undefined;
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
            targetIds.length &&
            ["twoAllies", "twoUnits", "redirect"].includes(
              spellSpecs[activeCard.id].target,
            )
              ? { ...command, targetId2: atAim.id }
              : { ...command, targetId: atAim.id };
        command =
          activeCard.id === "ventos-favoraveis" && cells.length
            ? { ...command, x2: aim.x, y2: aim.y }
            : { ...command, ...aim };
      }
    }
    return command ? previewAction(g, seat, command) : null;
  }, [
    g?.revision,
    active?.unitId,
    active?.cardId,
    active?.index,
    aim?.x,
    aim?.y,
    targetIds.join(),
    cells.map((c) => `${c.x},${c.y}`).join(),
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
    clear();
  }, [g?.turn, g?.phase, g?.phaseOwner]);
  return {
    reset,
    arena: {
      selected,
      handPlans,
      readyAbilities: [...unitPlans]
        .filter(([, plan]) => plan.options.length)
        .map(([id]) => id),
      onAbility: (u: UnitView) => {
        clear();
        setSelected({ kind: "unit", unitId: u.id });
        setTargetMode(true);
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
          clear();
          setSelected({ kind: "unit", unitId: u.id });
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
      controls: g ? (
        <>
          {" "}
          {(selectedCard?.kind === "spell" ||
            selectedCard?.id === "anubis-o-gato-da-morte" ||
            g.duel ||
            (selectedUnit?.owner === seat &&
              (abilitySpec ||
                kw(selectedUnit!, "Range") ||
                selectedUnit?.statuses?.range))) && (
            <ActionDock>
              <div className="action-dock-head">
                {(selectedCard || catalog.get(selectedUnit?.cardId || ""))
                  ?.asset && (
                  <img
                    className="action-card-art"
                    src={
                      (selectedCard || catalog.get(selectedUnit?.cardId || ""))!
                        .asset
                    }
                    alt=""
                  />
                )}
                <div className="action-card-title">
                  <small>
                    {selectedCard?.kind === "spell"
                      ? "CONJURAÇÃO"
                      : "HABILIDADE"}
                  </small>
                  <b>{selectedCard?.name || unitName(selectedUnit)}</b>
                </div>
                <button aria-label="Cancelar seleção" onClick={clear}>
                  ×
                </button>
              </div>
              {feedback && (
                <p className="target-feedback" role="status">
                  {feedback}
                </p>
              )}
              {selectedCard?.kind === "spell" && (
                <div className="target-controls">
                  {targetIds.map((id, i) => (
                    <div className="action-target" key={id}>
                      {catalog.get(
                        g.units.find((u) => u.id === id)?.cardId || "",
                      )?.asset && (
                        <img
                          src={
                            catalog.get(
                              g.units.find((u) => u.id === id)!.cardId,
                            )!.asset
                          }
                          alt=""
                        />
                      )}
                      <small>
                        Alvo {i + 1}:{" "}
                        {unitName(g.units.find((u) => u.id === id))}
                      </small>
                      <span aria-hidden="true">✓</span>
                    </div>
                  ))}
                  {["cell", "lake", "wind", "move"].includes(
                    spellSpecs[selectedCard.id].target,
                  ) &&
                    cells.map((c, i) => (
                      <small key={i}>
                        Casa {i + 1}: {c.x + 1}, {c.y + 1}
                      </small>
                    ))}
                  {["discardVoid", "discardCat"].includes(
                    spellSpecs[selectedCard.id].target,
                  ) && (
                    <select
                      aria-label="Carta do descarte"
                      value={choice}
                      onChange={(e) => setChoice(e.currentTarget.value)}
                    >
                      <option value="">Escolha no descarte</option>
                      {[...new Set(me?.discard || [])]
                        .filter((id) =>
                          selectedCard.id === "ritual-do-gato-sete-vidas"
                            ? /gato|neko/.test(id)
                            : catalog.get(id)?.kind === "unit" &&
                              catalog.get(id)?.types.includes("vazio"),
                        )
                        .map((id) => (
                          <option key={id} value={id}>
                            {catalog.get(id)?.name}
                          </option>
                        ))}
                    </select>
                  )}
                  {selectedCard.id === "gishiki-n-9-mimetismo" && (
                    <select
                      aria-label="Keyword"
                      value={choice}
                      onChange={(e) => setChoice(e.currentTarget.value)}
                    >
                      <option value="">Escolha a keyword</option>
                      {transferableKeywords.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  )}
                  {selectedCard.id === "mamorudo-n-17-defesa-da-fagulha" && (
                    <select
                      aria-label="Papel no combate"
                      value={choice}
                      onChange={(e) => setChoice(e.currentTarget.value)}
                    >
                      <option value="attacker">Atacante</option>
                      <option value="defender">Defensor</option>
                    </select>
                  )}
                  {[
                    "mamoru-n-9-wonder-wall",
                    "mamoru-n-5-transferencia-espiritual",
                  ].includes(selectedCard.id) && (
                    <label>
                      {selectedCard.id === "mamoru-n-9-wonder-wall"
                        ? "PE extra"
                        : "Dano transferido"}
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={extra}
                        onInput={(e) => setExtra(Number(e.currentTarget.value))}
                      />
                    </label>
                  )}
                  <button
                    className="gold"
                    disabled={!canPlay || !!castError}
                    onClick={() => act(castCommand)}
                  >
                    Conjurar · {actionCost(g, seat, castCommand)} PE
                  </button>
                  <p
                    className={`action-requirement ${castError ? "unavailable" : "available"}`}
                    role="status"
                  >
                    {activePlan?.reason ||
                      (castError ? spellSpecs[selectedCard.id].hint : "")}
                  </p>
                </div>
              )}
              {selectedUnit &&
                selectedUnit.owner === seat &&
                (abilitySpec ||
                  kw(selectedUnit, "Range") ||
                  selectedUnit.statuses?.range) && (
                  <div className="target-controls">
                    <button
                      className="outline"
                      onClick={() => setTargetMode(!targetMode)}
                    >
                      {targetMode
                        ? "← Voltar ao movimento"
                        : "Escolher alvo da habilidade / alcance"}
                    </button>
                    <p className="action-requirement" role="status">
                      {abilitySpec
                        ? abilityError || "Habilidade pronta"
                        : rangedError || "Ataque pronto"}
                    </p>
                    <small>
                      {abilitySpec?.hint ||
                        "Escolha um alvo para o ataque à distância."}
                    </small>
                    {targetIds.map((id) => (
                      <small key={id}>
                        Alvo: {unitName(g.units.find((u) => u.id === id))}
                      </small>
                    ))}
                    {cells.map((v, i) => (
                      <small key={i}>
                        Casa: {v.x + 1}, {v.y + 1}
                      </small>
                    ))}
                    {selectedUnit.cardId === "chama-marinha" && (
                      <select
                        value={choice}
                        onChange={(e) => setChoice(e.currentTarget.value)}
                      >
                        <option value="">Elemento de combate</option>
                        {catalog
                          .get(selectedUnit.cardId)
                          ?.types.map((e: string) => (
                            <option key={e} value={e}>
                              {E[e][2]}
                            </option>
                          ))}
                      </select>
                    )}
                    {abilitySpec && (
                      <button
                        className="outline"
                        disabled={!canPlay || !!abilityError}
                        onClick={() => act(abilityCommand)}
                      >
                        {abilitySpec.label}
                      </button>
                    )}
                    {(kw(selectedUnit, "Range") ||
                      selectedUnit.statuses?.range ||
                      0) > 0 && (
                      <button
                        className="outline"
                        disabled={!canPlay || !!rangedError}
                        onClick={() =>
                          act({
                            type: "attack",
                            unitId: selectedUnit.id,
                            targetId: targetIds[0],
                          })
                        }
                      >
                        Ataque à distância
                      </button>
                    )}
                  </div>
                )}
              {g.duel && !g.duel.opponentId && g.duel.seat !== seat && me && (
                <button
                  className="gold"
                  disabled={
                    !selectedUnit ||
                    selectedUnit.kind !== "unit" ||
                    selectedUnit.owner !== seat
                  }
                  onClick={() =>
                    act({ type: "duel", unitId: selectedUnit?.id })
                  }
                >
                  Escolher para o duelo
                </button>
              )}
              {g.duel?.opponentId && g.duel.seat === seat && (
                <div className="target-controls">
                  <p>Seu monstro deve atacar ou defender?</p>
                  <button
                    className="gold"
                    onClick={() => act({ type: "duel", choice: "attacker" })}
                  >
                    Meu monstro ataca
                  </button>
                  <button
                    className="outline"
                    onClick={() => act({ type: "duel", choice: "defender" })}
                  >
                    Meu monstro defende
                  </button>
                </div>
              )}
              {selectedCard?.kind === "unit" && (
                <div className="target-controls">
                  {targetIds.map((id) => (
                    <small key={id}>
                      Alvo da invocação:{" "}
                      {unitName(g.units.find((u) => u.id === id))}
                    </small>
                  ))}
                  {["anubis-o-gato-da-morte"].includes(selectedCard.id) && (
                    <>
                      <small>Selecione o gato a sacrificar no campo.</small>
                      <button
                        className="gold"
                        disabled={
                          !canPlay ||
                          !!commandError(g, seat, {
                            type: "summon",
                            cardId: selectedCard.id,
                            handIndex: selected?.index,
                            choice: selected?.fromDeck ? "library" : undefined,
                            targetId: targetIds[0],
                          })
                        }
                        onClick={() =>
                          act({
                            type: "summon",
                            cardId: selectedCard.id,
                            handIndex: selected?.index,
                            choice: selected?.fromDeck ? "library" : undefined,
                            targetId: targetIds[0],
                          })
                        }
                      >
                        Invocar por sacrifício
                      </button>
                    </>
                  )}
                </div>
              )}
            </ActionDock>
          )}
          {!!me?.summonableDeck?.length &&
            g.phase === 1 &&
            myTurn &&
            !selected && (
              <ActionDock>
                <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
                {me.summonableDeck.map((id: string) => (
                  <button
                    key={id}
                    onClick={() => {
                      clear();
                      setSelected({
                        kind: "hand",
                        cardId: id,
                        index: -1,
                        fromDeck: true,
                      });
                    }}
                  >
                    {catalog.get(id)?.name}
                  </button>
                ))}
              </ActionDock>
            )}
        </>
      ) : null,
    },
  };
}
