import type { Card } from "../shared/cards.js";
import { cards as catalog } from "../shared/game.js";
import { E, SPEED, unitName } from "./card.js";
import { ActionDock } from "./action-dock.js";
import type { SelectionControls } from "./action-selection.js";
import type { SpellStep } from "./spell-steps.js";
import { KeywordText } from "./rule-hint.js";

/** The right-rail panel for a prepared spell, ability or special choice. */
export function MatchControls({
  view,
  onRead,
}: {
  view: SelectionControls;
  onRead: (card: Card) => void;
}) {
  const { selectedCard, selectedUnit, abilitySpec, feedback } = view;
  const card =
    selectedCard ||
    (selectedUnit ? catalog.get(selectedUnit.cardId) : undefined);
  return (
    <>
      {view.visible && (
        <ActionDock>
          <div className="action-dock-head">
            {card?.asset && (
              <button
                className="action-card-art"
                onClick={() => onRead(card)}
                aria-label={`Ler ${card.name}`}
              >
                <img src={card.asset} alt="" />
              </button>
            )}
            <div className="action-card-title">
              <small>
                {selectedCard?.kind === "spell"
                  ? `MAGIA ${SPEED[selectedCard.stats.speed]?.toUpperCase() || ""}`
                  : abilitySpec
                    ? "HABILIDADE"
                    : view.chooseDuel || view.chooseDuelRole
                      ? "DUELO"
                      : "ATAQUE À DISTÂNCIA"}
              </small>
              <b>{selectedCard?.name || unitName(selectedUnit)}</b>
            </div>
            <button
              className="action-close"
              aria-label="Cancelar seleção"
              title="Cancelar (Esc)"
              onClick={view.onClear}
            >
              ×
            </button>
          </div>
          {selectedCard?.kind === "spell" && (
            <SpellPanel view={view} card={selectedCard} onRead={onRead} />
          )}
          {selectedUnit && view.canUseUnit && <UnitPanel view={view} />}
          {view.chooseDuel && (
            <div className="target-controls">
              <p className="action-effect">
                Escolha no tabuleiro um monstro seu para o duelo.
              </p>
              <button
                className="seal-button"
                disabled={view.duelChoiceDisabled}
                onClick={view.onDuelSelection}
              >
                {view.duelChoiceDisabled
                  ? "Selecione seu monstro"
                  : `Enviar ${unitName(selectedUnit)} ao duelo`}
              </button>
            </div>
          )}
          {view.chooseDuelRole && (
            <div className="target-controls">
              <p className="action-effect">
                Seu monstro deve atacar ou defender?
              </p>
              <div className="segmented">
                <button onClick={() => view.onDuelRole("attacker")}>
                  ⚔ Atacar
                </button>
                <button onClick={() => view.onDuelRole("defender")}>
                  ⛨ Defender
                </button>
              </div>
            </div>
          )}
          {selectedCard?.kind === "unit" &&
            selectedCard.id === "anubis-o-gato-da-morte" && (
              <div className="target-controls">
                <p className="action-effect">
                  {view.targetIds[0]
                    ? `Sacrificar ${unitName(view.units.find((u) => u.id === view.targetIds[0]))}.`
                    : "Selecione no tabuleiro o gato a sacrificar."}
                </p>
                <button
                  className="seal-button"
                  disabled={view.sacrifice.disabled}
                  onClick={view.sacrifice.submit}
                >
                  Invocar por sacrifício
                </button>
              </div>
            )}
          {feedback && (
            <p className="target-feedback" role="status">
              {feedback}
            </p>
          )}
        </ActionDock>
      )}
      {!!view.summonableDeck.length && (
        <ActionDock>
          <p className="eyebrow">INVOCAÇÃO DO BARALHO</p>
          <div className="choice-chips">
            {view.summonableDeck.map((id: string) => (
              <button key={id} onClick={() => view.onDeck(id)}>
                {catalog.get(id)?.name}
              </button>
            ))}
          </div>
        </ActionDock>
      )}
    </>
  );
}

function SpellPanel({
  view,
  card,
  onRead,
}: {
  view: SelectionControls;
  card: Card;
  onRead: (card: Card) => void;
}) {
  const { steps, nextStep, cast, castOutcome, spellSpec } = view;
  const blocked = !!view.feedback || (!!cast.error && !nextStep);
  if (view.unavailable)
    return (
      <div className="target-controls">
        <div className="action-effect">
          <KeywordText text={card.effect_text || ""} />
          <button className="read-card" onClick={() => onRead(card)}>
            Ler carta
          </button>
        </div>
        <p className="action-blocked" role="status">
          <b>Indisponível agora</b>
          {view.unavailable}
        </p>
      </div>
    );
  return (
    <div className="target-controls">
      <div className="action-effect">
        <KeywordText text={card.effect_text || ""} />
        <button className="read-card" onClick={() => onRead(card)}>
          Ler carta
        </button>
      </div>
      {steps.length > 0 && (
        <ol className="spell-steps">
          {steps.map((step, i) => (
            <Step
              key={`${step.kind}-${i}`}
              step={step}
              index={i}
              current={step === nextStep}
              view={view}
            />
          ))}
        </ol>
      )}
      {spellSpec?.amount === "redirectDamage" && (
        <Amount
          label="Dano transferido"
          value={view.extra}
          min={0}
          max={99}
          onChange={view.onAmount}
        />
      )}
      {castOutcome && <Outcome preview={castOutcome} units={view.units} />}
      {/* The commit appears once every choice is made; until then the
          current step is the call to action. */}
      {!nextStep && (
        <button
          className="seal-button cast-button"
          aria-label={`Conjurar · ${cast.cost} PE`}
          disabled={cast.disabled}
          onClick={cast.submit}
        >
          Conjurar
          <span className="seal-cost" aria-hidden="true">
            {cast.cost}
          </span>
        </button>
      )}
      {blocked && !view.feedback && (
        <p className="action-requirement unavailable" role="status">
          {view.castHint || cast.error}
        </p>
      )}
    </div>
  );
}

function Step({
  step,
  index,
  current,
  view,
}: {
  step: SpellStep;
  index: number;
  current: boolean;
  view: SelectionControls;
}) {
  const unit = view.units.find((u) => u.id === step.unitId);
  const art = unit && catalog.get(unit.cardId)?.asset;
  return (
    <li
      className={`spell-step ${step.done ? "done" : ""} ${current ? "current" : ""}`}
      aria-current={current ? "step" : undefined}
    >
      <span className="step-index" aria-hidden="true">
        {step.done ? "✓" : index + 1}
      </span>
      <div className="step-body">
        <small>{step.label}</small>
        {step.kind === "unit" || step.kind === "cell" ? (
          <b>
            {step.value || (current ? "Escolha no tabuleiro" : "Aguardando")}
          </b>
        ) : null}
        {step.kind === "choice" && <ChoiceInput view={view} />}
        {step.kind === "amount" && (
          <Amount
            value={view.extra}
            min={1}
            max={Math.max(1, view.energy - (view.cast.cost - view.extra))}
            onChange={view.onAmount}
          />
        )}
      </div>
      {art && <img className="step-art" src={art} alt="" />}
    </li>
  );
}

function ChoiceInput({ view }: { view: SelectionControls }) {
  const { spellSpec, choice } = view;
  if (spellSpec?.choice === "combatRole")
    return (
      <div className="segmented" role="radiogroup">
        {(
          [
            ["attacker", "⚔ Atacando"],
            ["defender", "⛨ Defendendo"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            role="radio"
            aria-checked={(choice || "attacker") === value}
            onClick={() => view.onChoice(value)}
          >
            {text}
          </button>
        ))}
      </div>
    );
  if (spellSpec?.choice === "keyword") {
    if (!view.targetIds[0])
      return <b className="muted-value">Escolha primeiro o monstro</b>;
    if (!view.keywordOptions.length)
      return <b className="muted-value">Este monstro não tem keywords</b>;
    return (
      <div className="choice-chips" role="radiogroup">
        {view.keywordOptions.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={choice === k}
            onClick={() => view.onChoice(k)}
          >
            {k}
          </button>
        ))}
      </div>
    );
  }
  if (!view.discardOptions.length)
    return <b className="muted-value">Nenhuma carta compatível no descarte</b>;
  return (
    <div className="discard-options" role="radiogroup">
      {view.discardOptions.map((id) => {
        const c = catalog.get(id);
        return (
          <button
            key={id}
            role="radio"
            aria-checked={choice === id}
            onClick={() => view.onChoice(id)}
            title={c?.name}
          >
            {c?.asset && <img src={c.asset} alt="" />}
            <span>{c?.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Amount({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const shown = Math.max(value, 0);
  return (
    <div className="amount">
      {label && <small>{label}</small>}
      <div className="amount-stepper">
        <button
          aria-label="Diminuir"
          disabled={shown <= min}
          onClick={() => onChange(Math.max(min, shown - 1))}
        >
          −
        </button>
        <output aria-live="polite">{shown}</output>
        <button
          aria-label="Aumentar"
          disabled={shown >= max}
          onClick={() => onChange(Math.min(max, shown + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Outcome({
  preview,
  units,
}: {
  preview: NonNullable<SelectionControls["castOutcome"]>;
  units: SelectionControls["units"];
}) {
  const rows = preview.outcomes.slice(0, 4);
  const uncertain =
    preview.uncertainty === "stack"
      ? "Depende das magias na pilha."
      : preview.uncertainty === "hidden"
        ? "Envolve cartas ocultas."
        : preview.uncertainty === "random"
          ? "Envolve sorte."
          : preview.uncertainty === "search"
            ? "Você escolherá a carta buscada."
            : "";
  if (!rows.length && !uncertain) return null;
  return (
    <div className="action-outcome" aria-label="Resultado previsto">
      <small>Resultado previsto</small>
      {rows.map((row) => {
        const u = units.find((unit) => unit.id === row.unitId);
        return (
          <div
            key={row.unitId}
            className={`outcome-row ${row.removed ? "removed" : ""}`}
            style={{
              "--owner": u
                ? E[catalog.get(u.cardId)?.types[0] || "vazio"]?.[0]
                : undefined,
            }}
          >
            <b>{unitName(u)}</b>
            <span>
              {row.removed ? "Sai do campo" : row.changes.join(" · ")}
            </span>
          </div>
        );
      })}
      {uncertain && <p>{uncertain}</p>}
    </div>
  );
}

function UnitPanel({ view }: { view: SelectionControls }) {
  const { abilitySpec, targetMode, ability, ranged, selectedUnit } = view;
  const target = view.units.find((u) => u.id === view.targetIds[0]);
  const error = abilitySpec ? ability.error : ranged.error;
  return (
    <div className="target-controls">
      {abilitySpec && (
        <div className="action-effect">
          <b>{abilitySpec.label}</b>
          <span>{abilitySpec.hint}</span>
        </div>
      )}
      {view.inMovement && (
        <button className="seal-button quiet" onClick={view.onToggleTargetMode}>
          {targetMode
            ? "← Voltar a mover esta peça"
            : abilitySpec
              ? "Usar a habilidade em vez de mover"
              : "Atacar à distância em vez de mover"}
        </button>
      )}
      {targetMode && view.noTargets && (
        <p className="action-blocked" role="status">
          <b>Sem alvo agora</b>
          Nenhuma peça no tabuleiro atende a essa condição no momento.
        </p>
      )}
      {targetMode && !view.noTargets && (
        <ol className="spell-steps">
          <li className={`spell-step ${target ? "done" : "current"}`}>
            <span className="step-index" aria-hidden="true">
              {target ? "✓" : 1}
            </span>
            <div className="step-body">
              <small>Alvo</small>
              <b>{target ? unitName(target) : "Escolha no tabuleiro"}</b>
            </div>
            {target && catalog.get(target.cardId)?.asset && (
              <img
                className="step-art"
                src={catalog.get(target.cardId)!.asset}
                alt=""
              />
            )}
          </li>
        </ol>
      )}
      {view.abilityOutcome && (
        <Outcome preview={view.abilityOutcome} units={view.units} />
      )}
      {selectedUnit?.cardId === "chama-marinha" && (
        <div className="segmented" role="radiogroup">
          {catalog.get(selectedUnit.cardId)?.types.map((e: string) => (
            <button
              key={e}
              role="radio"
              aria-checked={view.choice === e}
              onClick={() => view.onChoice(e)}
            >
              {E[e][2]}
            </button>
          ))}
        </div>
      )}
      {/* Each commit appears once it can actually be used. */}
      {abilitySpec && !ability.disabled && (
        <button className="seal-button" onClick={ability.submit}>
          {abilitySpec.label}
        </button>
      )}
      {view.hasRange && !ranged.disabled && (
        <button className="seal-button" onClick={ranged.submit}>
          Atacar {unitName(target)} à distância
        </button>
      )}
      {targetMode && error && target && (
        <p className="action-requirement unavailable" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
