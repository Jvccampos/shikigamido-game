import { useEffect, useMemo, useState } from "preact/hooks";
import { abilities } from "../shared/abilities.js";
import { spellSpecs, transferableKeywords } from "../shared/spells.js";
import {
  cards as catalog,
  summonCells,
  moveOptions,
  route,
  kw,
  type Game,
  type Unit,
  type Cmd,
  type Seat,
} from "../shared/game.js";
import { E, CardFace, unitName, statusLabels } from "./card.js";

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
  g: Game | undefined,
  seat: number,
  busy: boolean,
  onAct: (command: Cmd) => Promise<boolean>,
  setFocus: (focus: any) => void,
  code: string,
) {
  const [selected, setSelected] = useState<Selection | null>(null),
    [drag, setDrag] = useState<Selection | null>(null),
    [targetIds, setTargetIds] = useState<string[]>([]),
    [cells, setCells] = useState<{ x: number; y: number }[]>([]),
    [choice, setChoice] = useState(""),
    [extra, setExtra] = useState(0),
    [mulligan, setMulligan] = useState<number[]>([]),
    [startY, setStartY] = useState(2);
  const me = seat >= 0 ? g?.players?.[seat] : null,
    myTurn = !!g && seat === g.priority && !g.setup && !g.centerPending,
    finished = !!g && ((g.winner !== null && g.winner !== undefined) || g.draw),
    selectedCard =
      selected?.kind === "hand" ? catalog.get(selected.cardId) : null,
    selectedUnit = g?.units?.find((u) => u.id === selected?.unitId);
  async function act(command: Cmd) {
    if (await onAct(command)) clear();
  }
  const clear = () => {
    setTargetMode(false);
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
    if (activeCard?.kind === "unit" && myTurn && g.phase === 1)
      return summonCells(g, seat as Seat);
    if (activeUnit && myTurn && g.phase === 2)
      return moveOptions(g, activeUnit);
    return [];
  }, [g?.revision, active?.unitId, active?.cardId, myTurn, finished]);
  function chooseTarget(u: Unit) {
    setTargetIds((prev) =>
      prev.includes(u.id)
        ? prev.filter((id) => id !== u.id)
        : [...prev.slice(-1), u.id],
    );
  }
  function dropAt(x: number, y: number, u?: Unit, data = active) {
    setDrag(null);
    if (g?.followup?.seat === seat) {
      void act({ type: "followup", x, y });
      return;
    }
    if (!data) return;
    if (data.kind === "unit") {
      if (data.unitId === u?.id) return;
      if (g?.phase === 2 && g.priority === seat)
        void act({ type: "move", unitId: data.unitId, x, y });
      return;
    }
    const card = catalog.get(data.cardId);
    if (!card) return;
    if (card.kind === "unit") {
      void act({
        type: "summon",
        cardId: card.id,
        handIndex: data.index,
        choice: data.fromDeck ? "library" : undefined,
        x,
        y,
        targetId: targetIds[0],
        targetId2: targetIds[1],
      });
      return;
    }
    const spec = spellSpecs[card.id];
    setSelected(data);
    const t = u ? [u.id] : [];
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
      void act({
        type: "cast",
        cardId: card.id,
        handIndex: data.index,
        targetId: u?.id,
        x,
        y,
      });
  }
  function cellClick(x: number, y: number, u?: Unit) {
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
      if (u) chooseTarget(u);
      setCells((prev) => [...prev.slice(-1), { x, y }]);
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
        chooseTarget(u);
        setCells([{ x, y }]);
      } else dropAt(x, y, u, selected);
      return;
    }
    if (u) {
      if (
        selectedUnit &&
        u.id !== selectedUnit.id &&
        (targetMode || g?.phase !== 2)
      ) {
        chooseTarget(u);
        setCells([{ x, y }]);
      } else {
        clear();
        setSelected({ kind: "unit", unitId: u.id });
      }
    } else setCells((prev) => [...prev.slice(-1), { x, y }]);
  }
  const abilitySpec = selectedUnit
    ? abilities[selectedUnit.cardId] ||
      (selectedUnit.statuses?.construir
        ? abilities["kuma-no-tsuno"]
        : undefined)
    : undefined;
  const canPlay = !!me && !g?.setup && !g?.centerPending && !finished && !busy;

  function reset() {
    clear();
    setMulligan([]);
    setStartY(2);
  }
  useEffect(reset, [code]);
  return {
    reset,
    arena: {
      selected,
      highlights,
      targets: targetIds,
      mulligan,
      startY,
      onAct: act,
      onHand: pickHand,
      onCell: cellClick,
      onSelect: (u: Unit) => {
        if (u.owner === seat && !targetMode && selected?.kind !== "hand") {
          clear();
          setSelected({ kind: "unit", unitId: u.id });
        }
      },
      onDrag: setDrag,
      onDrop: dropAt,
      onFocus: (card: any, unit?: Unit) => setFocus({ card, unit }),
      onStartY: setStartY,
      onMulligan: () => {
        void act({ type: "mulligan", handIndices: mulligan });
        setMulligan([]);
      },
      onClear: clear,
      controls: g ? (
        <>
          {" "}
          <div className="selection-panel">
            <p className="eyebrow">
              {selectedCard
                ? "CARTA SELECIONADA"
                : selectedUnit
                  ? "UNIDADE SELECIONADA"
                  : "SUA PRÓXIMA AÇÃO"}
            </p>
            {selectedCard || selectedUnit ? (
              <>
                <button
                  onClick={() =>
                    setFocus({
                      card: selectedCard || catalog.get(selectedUnit!.cardId),
                      unit: selectedUnit,
                    })
                  }
                >
                  <CardFace
                    card={selectedCard || catalog.get(selectedUnit!.cardId)}
                    unit={selectedUnit}
                  />
                </button>
                <h3>{selectedCard?.name || unitName(selectedUnit)}</h3>
                <p>
                  {selectedCard?.effect_text ||
                    catalog.get(selectedUnit?.cardId || "")?.effect_text}
                </p>
                {selectedUnit && (
                  <div className="status-tags">
                    {statusLabels(selectedUnit).map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="selection-seal">式</span>
                <h3>
                  {seat < 0
                    ? "Assista ao duelo"
                    : g.setup
                      ? "Sua primeira escolha"
                      : myTurn
                        ? "O caminho é seu."
                        : "Observe o campo."}
                </h3>
                <p>
                  {g.setup
                    ? "Selecione cartas da mão para trocar, ou confirme para mantê-las."
                    : "Passe o cursor em uma carta e pressione F para ler seus efeitos."}
                </p>
              </>
            )}
            {selectedCard?.kind === "spell" && (
              <div className="target-controls">
                <p>{spellSpecs[selectedCard.id]?.hint}</p>
                {targetIds.map((id, i) => (
                  <small key={id}>
                    Alvo {i + 1}: {unitName(g.units.find((u) => u.id === id))}
                  </small>
                ))}
                {cells.map((c, i) => (
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
                  disabled={!canPlay}
                  onClick={() =>
                    act({
                      type: "cast",
                      cardId: selectedCard.id,
                      handIndex: selected?.index,
                      targetId: targetIds[0],
                      targetId2: targetIds[1],
                      x: cells[0]?.x,
                      y: cells[0]?.y,
                      x2: cells[1]?.x,
                      y2: cells[1]?.y,
                      extraPe: extra,
                      choice,
                    })
                  }
                >
                  Conjurar ·{" "}
                  {selectedCard.stats.cost +
                    (selectedCard.id === "mamoru-n-9-wonder-wall"
                      ? extra
                      : 0)}{" "}
                  PE
                </button>
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
                      ? "Modo de alvos ativo · voltar a mover"
                      : "Escolher alvos para efeito ou Range"}
                  </button>
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
                      disabled={!canPlay}
                      onClick={() =>
                        act({
                          type: "ability",
                          unitId: selectedUnit.id,
                          targetId: targetIds[0],
                          x: cells[0]?.x,
                          y: cells[0]?.y,
                          choice,
                        })
                      }
                    >
                      {abilitySpec.label}
                    </button>
                  )}
                  {(kw(selectedUnit, "Range") || selectedUnit.statuses?.range) >
                    0 && (
                    <button
                      className="outline"
                      disabled={!canPlay || !targetIds[0]}
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
                onClick={() => act({ type: "duel", unitId: selectedUnit?.id })}
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
                      disabled={!targetIds[0]}
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
            {selected && (
              <button className="clear-selection" onClick={clear}>
                Limpar seleção · Esc
              </button>
            )}
          </div>
          {!!(me as any)?.summonableDeck?.length && g.phase === 1 && myTurn && (
            <div className="stack-panel">
              <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
              {(me as any).summonableDeck.map((id: string) => (
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
            </div>
          )}
          {(g.stack.length > 0 || g.combat) && (
            <div className="stack-panel">
              <p className="eyebrow">RESPOSTAS · {g.passes}/2 PASSES</p>
              {g.combat && (
                <p>
                  ⚔{" "}
                  {unitName(g.units.find((u) => u.id === g.combat?.attackerId))}{" "}
                  →{" "}
                  {unitName(g.units.find((u) => u.id === g.combat?.defenderId))}
                </p>
              )}
              {[...g.stack].reverse().map((s, i) => (
                <button
                  key={i}
                  onClick={() => setFocus({ card: catalog.get(s.cardId) })}
                >
                  {i === 0 ? "↳ " : ""}
                  {catalog.get(s.cardId)?.name}
                </button>
              ))}
              <small>A última magia resolve primeiro.</small>
            </div>
          )}
        </>
      ) : null,
    },
  };
}
