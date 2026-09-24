import type { GameView, UnitView } from "../shared/room.js";
import type { Cmd } from "../shared/game.js";
import { cards } from "../shared/game.js";
import { ActionDock } from "./action-dock.js";
import { unitName } from "./card.js";

/** Turn 3 opens the center: each player secretly sends one piece toward it. */
export function CenterAdvance({
  game: g,
  seat,
  selected,
  busy,
  onAct,
  onClear,
}: {
  game: GameView;
  seat: number;
  selected?: UnitView;
  busy: boolean;
  onAct: (command: Cmd) => void;
  onClear: () => void;
}) {
  const confirmed = Object.hasOwn(g.centerChoices || {}, seat);
  const mine = selected?.owner === seat ? selected : undefined;
  const art = mine && cards.get(mine.cardId)?.asset;
  return (
    <ActionDock>
      <div className="action-dock-head">
        <div className="action-card-title">
          <small>CENTRO ABERTO</small>
          <b>Avanço secreto</b>
        </div>
      </div>
      <div className="target-controls">
        <p className="action-effect">
          A peça escolhida anda até sua velocidade em direção ao centro. Se
          encontrar um inimigo no caminho, entra em combate. As duas escolhas
          são reveladas juntas.
        </p>
        {confirmed ? (
          <p className="center-waiting" role="status">
            <span className="waiting-pulse" aria-hidden="true" />
            Escolha confirmada. Aguardando o oponente.
          </p>
        ) : (
          <>
            <ol className="spell-steps">
              <li className={`spell-step ${mine ? "done" : "current"}`}>
                <span className="step-index" aria-hidden="true">
                  {mine ? "✓" : 1}
                </span>
                <div className="step-body">
                  <small>Peça que avança (opcional)</small>
                  <b>{mine ? unitName(mine) : "Escolha no tabuleiro"}</b>
                </div>
                {art && <img className="step-art" src={art} alt="" />}
              </li>
            </ol>
            <button
              className="seal-button"
              disabled={busy || !mine}
              onClick={() => onAct({ type: "center", unitId: mine!.id })}
            >
              {mine ? `Avançar com ${unitName(mine)}` : "Selecione uma peça"}
            </button>
            <button
              className="seal-button quiet"
              disabled={busy}
              onClick={() => {
                onClear();
                onAct({ type: "center" });
              }}
            >
              Não avançar
            </button>
          </>
        )}
      </div>
    </ActionDock>
  );
}
