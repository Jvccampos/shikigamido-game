import { KeywordText, RuleHint } from "./rule-hint.js";
import type { Card } from "../shared/cards.js";
import { unitEffects } from "../shared/unit-insight.js";
import type { UnitView } from "../shared/room.js";
export type CardFocus = { card: Card | undefined; unit?: UnitView };
import { useEffect, useRef } from "preact/hooks";
import { yokaiIds, masculineIds } from "../shared/traits.js";
import { cards as catalog } from "../shared/game.js";
export const E: Record<string, [string, string, string]> = {
  agua: ["#68c5ef", "水", "Água"],
  fogo: ["#f57b62", "火", "Fogo"],
  terra: ["#d7ae67", "地", "Terra"],
  vento: ["#8cd8b6", "風", "Vento"],
  vazio: ["#be9aee", "空", "Vazio"],
};
export const SPEED: Record<string, string> = {
  slow: "Lenta",
  fast: "Rápida",
  instant: "Instantânea",
};
export function unitName(u: UnitView | null | undefined) {
  return (
    catalog.get(u?.cardId || "")?.name ||
    (u?.kind === "crystal"
      ? "Cristal de invocação"
      : u?.kind === "curse"
        ? `Maldição · nível ${u.level}`
        : u?.kind === "omionji"
          ? "Omionji"
          : u?.kind === "wall"
            ? "Parede de terra"
            : u?.kind === "rift"
              ? "Fenda do Vazio"
              : "Carta oculta")
  );
}
function Stat({
  value,
  base,
  label,
  icon,
  kind,
}: {
  value: number;
  base: number;
  label: string;
  icon: string;
  kind: string;
}) {
  return (
    <span
      className={`stat stat-${kind} ${value < base ? "down" : value > base ? "up" : "equal"}`}
      title={`${label}: ${value}. Original: ${base}.`}
      aria-label={`${label}: ${value}. Original: ${base}.`}
    >
      <small>{icon}</small>
      {value}
      {value !== base && <sup>{value > base ? "↑" : "↓"}</sup>}
    </span>
  );
}
function Stats({ unit, card }: { unit?: UnitView; card: Card | undefined }) {
  return card?.kind === "spell" ? (
    <span className="spell-speed">
      {SPEED[card.stats.speed]} · {card.stats.variable ? "X" : card.stats.cost}{" "}
      PE
    </span>
  ) : (
    <div className="stats">
      <Stat
        value={unit?.attack ?? card?.stats.attack ?? 0}
        base={card?.stats.attack ?? unit?.attack ?? 0}
        label="Ataque"
        icon="⚔"
        kind="attack"
      />
      <Stat
        value={unit?.hp ?? card?.stats.health ?? 0}
        base={card?.stats.health ?? unit?.maxHp ?? 0}
        label="Vida"
        icon="♥"
        kind="health"
      />
      <Stat
        value={unit?.speed ?? card?.stats.speed ?? 0}
        base={card?.stats.speed ?? unit?.speed ?? 0}
        label="Velocidade"
        icon="➟"
        kind="speed"
      />
    </div>
  );
}
export function CardFace({
  card,
  unit,
  compact = false,
}: {
  card: Card | undefined;
  unit?: UnitView;
  compact?: boolean;
}) {
  return (
    <div
      className={`card-face ${compact ? "compact" : ""}`}
      style={{ "--element": E[card?.types?.[0] || "vazio"][0] }}
    >
      {card?.asset ? (
        <img
          src={card.asset}
          alt={card.name}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="card-placeholder">
          <span>
            {unit?.kind === "crystal"
              ? "◆"
              : unit?.kind === "curse"
                ? "禍"
                : "式"}
          </span>
          <b>{unitName(unit)}</b>
        </div>
      )}
      {unit && unit.cardId !== "hidden" && <Stats unit={unit} card={card} />}
    </div>
  );
}
export function Focus({
  card,
  unit,
  onClose,
}: {
  card: Card | undefined;
  unit?: UnitView;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const effects = unit ? unitEffects(unit) : [];
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal-scrim card-dialog"
      aria-label={card?.name || unitName(unit)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <section className="card-focus" onClick={(e) => e.stopPropagation()}>
        <button
          autoFocus
          className="close"
          onClick={() => dialog.current?.close()}
          aria-label="Fechar carta"
        >
          ×
        </button>
        <CardFace card={card} unit={unit} />
        <div className="focus-text">
          <p className="eyebrow">
            {card?.types?.map((e: string) => E[e][2]).join(" · ") ||
              "Peça do tabuleiro"}
          </p>
          <h2>{card?.name || unitName(unit)}</h2>
          {card?.kind === "curse" && (
            <p className="eyebrow">
              Maldição · Nível{" "}
              {card.stats.cost <= 1 ? 1 : card.stats.cost <= 3 ? 2 : 3}
            </p>
          )}
          <Stats unit={unit} card={card} />
          <p>
            <KeywordText
              text={
                card?.effect_text ||
                (unit?.kind === "crystal"
                  ? "Tem 3 de vida. Invoque monstros nos espaços conectados a este cristal."
                  : unit?.kind === "curse"
                    ? "Avança automaticamente até o Omionji mais próximo. Ao ser destruída, retorna ao portal com um nível a mais, até nível 3."
                    : "")
              }
            />
          </p>
          {(yokaiIds.has(card?.id || "") ||
            masculineIds.has(card?.id || "")) && (
            <p className="muted">
              Para efeitos de combate:{" "}
              {[
                yokaiIds.has(card?.id || "") && "Yokai",
                masculineIds.has(card?.id || "") && "masculino",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {effects.length > 0 && (
            <div className="active-effects" aria-label="Efeitos ativos">
              {effects.map((entry) => (
                <RuleHint
                  key={entry.label}
                  label={entry.label}
                  detail={entry.detail}
                  tone={entry.tone}
                />
              ))}
            </div>
          )}
          <small>Esc para fechar</small>
        </div>
      </section>
    </dialog>
  );
}
