import type { Cmd } from "../shared/model.js";
import type { Card } from "../shared/cards.js";
import type { GameView } from "../shared/room.js";
import { useEffect, useRef, useState } from "preact/hooks";
import { cards } from "../shared/game.js";
type ChoiceProps = {
  hand: string[];
  selected: number[];
  onSelect: (i: number) => void;
  onFocus: (c: Card | undefined) => void;
  disabled?: boolean;
  label: string;
};
function ChoiceCard({
  cardId,
  index,
  ...p
}: ChoiceProps & { cardId: string; index: number }) {
  const c = cards.get(cardId)!;
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const cancelHold = () => clearTimeout(hold.current);
  useEffect(() => cancelHold, []);
  return (
    <div
      className={`choice-card ${p.selected.includes(index) ? "chosen" : ""}`}
    >
      <button
        className="choice-art"
        aria-label={`${p.label} ${c.name}, cópia ${index + 1}`}
        aria-description="Botão direito ou Shift+F10 para ler. No celular, toque e segure."
        aria-pressed={p.selected.includes(index)}
        disabled={p.disabled}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          p.onSelect(index);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelHold();
          p.onFocus(c);
        }}
        onKeyDown={(e) => {
          if (
            e.key.toLowerCase() === "f" ||
            e.key === "ContextMenu" ||
            (e.shiftKey && e.key === "F10")
          ) {
            e.preventDefault();
            e.stopPropagation();
            p.onFocus(c);
          }
        }}
        onPointerDown={(e) => {
          cancelHold();
          held.current = false;
          if (e.pointerType !== "touch") return;
          origin.current = { x: e.clientX, y: e.clientY };
          hold.current = setTimeout(() => {
            held.current = true;
            p.onFocus(c);
          }, 500);
        }}
        onPointerMove={(e) => {
          if (
            Math.hypot(
              e.clientX - origin.current.x,
              e.clientY - origin.current.y,
            ) > 10
          )
            cancelHold();
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
      >
        <img src={c.asset} alt={c.name} draggable={false} />
      </button>
    </div>
  );
}
export function ChoiceCards(p: ChoiceProps) {
  return (
    <div className="choice-cards">
      {p.hand.map((id, i) => (
        <ChoiceCard {...p} key={`${i}-${id}`} cardId={id} index={i} />
      ))}
    </div>
  );
}
export function OpeningHand(
  p: ChoiceProps & { first: string; onConfirm: () => void; onExit: () => void },
) {
  return (
    <div
      className="card-choice-screen opening-hand"
      role="dialog"
      aria-modal="true"
      aria-label="Escolha da mão inicial"
    >
      <button className="choice-back" onClick={p.onExit}>
        ← Voltar ao santuário
      </button>
      <div className="choice-heading">
        <span className="choice-step">PREPARAÇÃO · 1 DE 2</span>
        <h1>Sua mão inicial</h1>
        <p>
          Escolha as cartas que quer trocar. Você pode fazer isso <b>uma vez</b>
          .
        </p>
        <small>{p.first} começa o duelo.</small>
      </div>
      <ChoiceCards {...p} />
      <div className="choice-footer">
        <p>
          {p.selected.length
            ? `${p.selected.length} carta(s) voltam para o baralho e serão substituídas.`
            : "Gostou da mão? Mantenha as seis cartas."}
        </p>
        <button
          className="choice-confirm"
          disabled={p.disabled}
          onClick={p.onConfirm}
        >
          {p.selected.length
            ? `Trocar ${p.selected.length} carta(s)`
            : "Manter estas cartas"}{" "}
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
export function DiscardChoice(p: {
  game: GameView;
  seat: number;
  busy: boolean;
  onAct: (c: Cmd) => void;
  onClose: () => void;
  onFocus: (c: Card | undefined) => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]),
    me = p.game.players[p.seat],
    capacity = 3 - me.permanentPe;
  useEffect(() => setChosen([]), [me.hand.join("|"), me.permanentPe]);
  const select = (i: number) =>
    setChosen((v) =>
      v.includes(i)
        ? v.filter((x) => x !== i)
        : v.length < capacity
          ? [...v, i]
          : v,
    );
  return (
    <div
      className="card-choice-screen discard-choice"
      role="dialog"
      aria-modal="true"
      aria-label="Converter cartas em reserva"
    >
      <button className="choice-back" onClick={p.onClose}>
        ← Ver tabuleiro
      </button>
      <div className="choice-heading">
        <span className="choice-step">SUA VEZ · DESCARTE OPCIONAL</span>
        <h1>Transforme cartas em energia</h1>
        <p>
          Cada carta descartada dá <b>1 ponto de Reserva</b>, que você pode
          gastar agora ou guardar para outro turno.
        </p>
        <div className="reserve-preview">
          <span>Reserva</span>
          <b>
            {me.permanentPe}
            {chosen.length > 0 && <em> +{chosen.length}</em>} <small>/ 3</small>
          </b>
        </div>
      </div>
      {capacity > 0 && me.hand.length > 0 ? (
        <ChoiceCards
          hand={me.hand}
          selected={chosen}
          onSelect={select}
          onFocus={p.onFocus}
          disabled={p.busy}
          label="Converter"
        />
      ) : (
        <p className="choice-empty">
          {capacity === 0
            ? "Sua reserva já está cheia."
            : "Você não tem cartas para descartar."}
        </p>
      )}
      <div className="choice-footer">
        <button
          className="choice-skip"
          disabled={p.busy}
          onClick={() => p.onAct({ type: "pass" })}
        >
          {chosen.length
            ? "Cancelar seleção e encerrar fase"
            : "Encerrar fase sem descartar"}
        </button>
        {capacity > 0 && me.hand.length > 0 && (
          <button
            className="choice-confirm"
            disabled={p.busy || !chosen.length}
            onClick={() =>
              p.onAct({ type: "discardMany", handIndices: chosen })
            }
          >
            Descartar {chosen.length || ""}{" "}
            {chosen.length === 1 ? "carta" : "cartas"}{" "}
            <span>+{chosen.length || 0} Reserva</span>
          </button>
        )}
      </div>
    </div>
  );
}
