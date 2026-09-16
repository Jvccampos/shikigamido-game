import { cards as catalog } from "../shared/game.js";
import { transferableKeywords } from "../shared/spells.js";
import { E, unitName } from "./card.js";
import { ActionDock } from "./action-dock.js";
import type { SelectionControls } from "./action-selection.js";

export function MatchControls({ view }: { view: SelectionControls }) {
  const {
    selectedCard,
    selectedUnit,
    abilitySpec,
    spellSpec,
    targetIds,
    cells,
    choice,
    extra,
    targetMode,
    feedback,
    units,
    cast,
    ability,
    ranged,
    sacrifice,
  } = view;
  return (
    <>
      {view.visible && (
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
            <button aria-label="Cancelar seleção" onClick={view.onClear}>
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
                  {catalog.get(units.find((u) => u.id === id)?.cardId || "")
                    ?.asset && (
                    <img
                      src={
                        catalog.get(units.find((u) => u.id === id)!.cardId)!
                          .asset
                      }
                      alt=""
                    />
                  )}
                  <small>
                    Alvo {i + 1}: {unitName(units.find((u) => u.id === id))}
                  </small>
                  <span aria-hidden="true">✓</span>
                </div>
              ))}
              {["cell", "lake", "wind", "move"].includes(spellSpec!.target) &&
                cells.map((c, i) => (
                  <small key={i}>
                    Casa {i + 1}: {c.x + 1}, {c.y + 1}
                  </small>
                ))}
              {["discardVoid", "discardCat"].includes(spellSpec!.target) && (
                <select
                  aria-label="Carta do descarte"
                  value={choice}
                  onChange={(e) => view.onChoice(e.currentTarget.value)}
                >
                  <option value="">Escolha no descarte</option>
                  {view.discardOptions.map((id) => (
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
                  onChange={(e) => view.onChoice(e.currentTarget.value)}
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
                  onChange={(e) => view.onChoice(e.currentTarget.value)}
                >
                  <option value="attacker">Atacante</option>
                  <option value="defender">Defensor</option>
                </select>
              )}
              {spellSpec?.amount && (
                <label>
                  {spellSpec?.amount === "energy"
                    ? selectedCard?.stats.variable
                      ? "X (PE)"
                      : "PE extra"
                    : "Dano transferido"}
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={extra}
                    onInput={(e) =>
                      view.onAmount(Number(e.currentTarget.value))
                    }
                  />
                </label>
              )}
              <button
                className="gold"
                disabled={cast.disabled}
                onClick={cast.submit}
              >
                Conjurar · {cast.cost} PE
              </button>
              <p
                className={`action-requirement ${cast.error ? "unavailable" : "available"}`}
                role="status"
              >
                {view.castHint}
              </p>
            </div>
          )}
          {selectedUnit && view.canUseUnit && (
            <div className="target-controls">
              <button className="outline" onClick={view.onToggleTargetMode}>
                {targetMode
                  ? "← Voltar ao movimento"
                  : "Escolher alvo da habilidade / alcance"}
              </button>
              <p className="action-requirement" role="status">
                {abilitySpec
                  ? ability.error || "Habilidade pronta"
                  : ranged.error || "Ataque pronto"}
              </p>
              <small>
                {abilitySpec?.hint ||
                  "Escolha um alvo para o ataque à distância."}
              </small>
              {targetIds.map((id) => (
                <small key={id}>
                  Alvo: {unitName(units.find((u) => u.id === id))}
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
                  onChange={(e) => view.onChoice(e.currentTarget.value)}
                >
                  <option value="">Elemento de combate</option>
                  {catalog.get(selectedUnit.cardId)?.types.map((e: string) => (
                    <option key={e} value={e}>
                      {E[e][2]}
                    </option>
                  ))}
                </select>
              )}
              {abilitySpec && (
                <button
                  className="outline"
                  disabled={ability.disabled}
                  onClick={ability.submit}
                >
                  {abilitySpec.label}
                </button>
              )}
              {view.hasRange && (
                <button
                  className="outline"
                  disabled={ranged.disabled}
                  onClick={ranged.submit}
                >
                  Ataque à distância
                </button>
              )}
            </div>
          )}
          {view.chooseDuel && (
            <button
              className="gold"
              disabled={view.duelChoiceDisabled}
              onClick={view.onDuelSelection}
            >
              Escolher para o duelo
            </button>
          )}
          {view.chooseDuelRole && (
            <div className="target-controls">
              <p>Seu monstro deve atacar ou defender?</p>
              <button
                className="gold"
                onClick={() => view.onDuelRole("attacker")}
              >
                Meu monstro ataca
              </button>
              <button
                className="outline"
                onClick={() => view.onDuelRole("defender")}
              >
                Meu monstro defende
              </button>
            </div>
          )}
          {selectedCard?.kind === "unit" && (
            <div className="target-controls">
              {targetIds.map((id) => (
                <small key={id}>
                  Alvo da invocação: {unitName(units.find((u) => u.id === id))}
                </small>
              ))}
              {["anubis-o-gato-da-morte"].includes(selectedCard.id) && (
                <>
                  <small>Selecione o gato a sacrificar no campo.</small>
                  <button
                    className="gold"
                    disabled={sacrifice.disabled}
                    onClick={sacrifice.submit}
                  >
                    Invocar por sacrifício
                  </button>
                </>
              )}
            </div>
          )}
        </ActionDock>
      )}
      {!!view.summonableDeck.length && (
        <ActionDock>
          <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
          {view.summonableDeck.map((id: string) => (
            <button key={id} onClick={() => view.onDeck(id)}>
              {catalog.get(id)?.name}
            </button>
          ))}
        </ActionDock>
      )}
    </>
  );
}
