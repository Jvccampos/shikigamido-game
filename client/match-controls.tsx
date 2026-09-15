import type { GameView } from "../shared/room.js";
import type { CommandDraft } from "../shared/model.js";
import type { ActionPlan } from "../shared/action-advice.js";
import { commandError, actionCost } from "../shared/action-advice.js";
import { cards as catalog, kw } from "../shared/game.js";
import { spellSpecs, transferableKeywords } from "../shared/spells.js";
import { E, unitName } from "./card.js";
import { ActionDock } from "./action-dock.js";
import {
  selectionCommands,
  selectedAbility,
  type SelectionDraft,
  type Selection,
} from "./action-selection.js";
export function MatchControls({
  game: g,
  seat,
  draft,
  plan: activePlan,
  feedback,
  canPlay,
  onChange,
  onSelect,
  onClear: clear,
  onAct: act,
}: {
  game: GameView;
  seat: number;
  draft: SelectionDraft;
  plan?: ActionPlan;
  feedback: string;
  canPlay: boolean;
  onChange: (patch: Partial<SelectionDraft>) => void;
  onSelect: (selection: Selection) => void;
  onClear: () => void;
  onAct: (command: CommandDraft) => Promise<boolean>;
}) {
  const { selected, targetIds, cells, choice, extra, targetMode } = draft;
  const me = seat >= 0 ? g.players[seat] : null;
  const myTurn = seat === g.priority && !g.setup && !g.centerPending;
  const selectedCard =
    selected?.kind === "hand" ? catalog.get(selected.cardId) : undefined;
  const selectedUnit = g.units.find((u) => u.id === selected?.unitId);
  const abilitySpec = selectedAbility(selectedUnit);
  const spellSpec =
    selectedCard?.kind === "spell" ? spellSpecs[selectedCard.id] : undefined;
  const { castCommand, abilityCommand, rangedCommand } =
    selectionCommands(draft);
  const castError =
    selectedCard?.kind === "spell"
      ? commandError(g, seat, castCommand)
      : undefined;
  const abilityError = selectedUnit
    ? commandError(g, seat, abilityCommand)
    : undefined;
  const rangedError = selectedUnit
    ? commandError(g, seat, rangedCommand)
    : undefined;
  return (
    <>
      {(selectedCard?.kind === "spell" ||
        selectedCard?.id === "anubis-o-gato-da-morte" ||
        g.duel ||
        (selectedUnit?.owner === seat &&
          (abilitySpec || kw(selectedUnit!, "Range")))) && (
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
                {selectedCard?.kind === "spell" ? "CONJURAÇÃO" : "HABILIDADE"}
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
                  {catalog.get(g.units.find((u) => u.id === id)?.cardId || "")
                    ?.asset && (
                    <img
                      src={
                        catalog.get(g.units.find((u) => u.id === id)!.cardId)!
                          .asset
                      }
                      alt=""
                    />
                  )}
                  <small>
                    Alvo {i + 1}: {unitName(g.units.find((u) => u.id === id))}
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
                  onChange={(e) => onChange({ choice: e.currentTarget.value })}
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
              {spellSpec?.choice === "keyword" && (
                <select
                  aria-label="Keyword"
                  value={choice}
                  onChange={(e) => onChange({ choice: e.currentTarget.value })}
                >
                  <option value="">Escolha a keyword</option>
                  {transferableKeywords.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              )}
              {spellSpec?.choice === "combatRole" && (
                <select
                  aria-label="Papel no combate"
                  value={choice}
                  onChange={(e) => onChange({ choice: e.currentTarget.value })}
                >
                  <option value="attacker">Atacante</option>
                  <option value="defender">Defensor</option>
                </select>
              )}
              {spellSpec?.amount && (
                <label>
                  {spellSpec?.amount === "energy"
                    ? "PE extra"
                    : "Dano transferido"}
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={extra}
                    onInput={(e) =>
                      onChange({ extra: Number(e.currentTarget.value) })
                    }
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
            (abilitySpec || kw(selectedUnit, "Range")) && (
              <div className="target-controls">
                <button
                  className="outline"
                  onClick={() =>
                    onChange({
                      targetMode: !targetMode,
                      targetIds: [],
                      cells: [],
                    })
                  }
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
                    onChange={(e) =>
                      onChange({ choice: e.currentTarget.value })
                    }
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
                {(kw(selectedUnit, "Range") || 0) > 0 && (
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
      {!!me?.summonableDeck?.length && g.phase === 1 && myTurn && !selected && (
        <ActionDock>
          <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
          {me.summonableDeck.map((id: string) => (
            <button
              key={id}
              onClick={() => {
                clear();
                onSelect({
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
  );
}
