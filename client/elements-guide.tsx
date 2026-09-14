import { useEffect, useRef, useState } from "preact/hooks";
import { elementModifier, elementRing } from "../shared/elements.js";
import { E } from "./card.js";
import { ElementIcon } from "./element-icon.js";

export function ElementsGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [attacker, setAttacker] = useState<string>("agua");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const points = elementRing.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: 50 + 35 * Math.cos(angle), y: 50 + 35 * Math.sin(angle) };
  });
  const from = points[elementRing.findIndex((e) => e === attacker)];
  return (
    <dialog
      ref={dialog}
      className="elements-guide"
      aria-labelledby="elements-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <section>
        <button
          className="elements-close"
          aria-label="Fechar vantagens elementais"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        <small>CONSULTA DO DUELO</small>
        <h2 id="elements-title">Vantagens elementais</h2>
        <p>Escolha o elemento de quem causa o dano.</p>
        <div className="element-diagram">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              {["bonus", "penalty"].map((id) => (
                <marker
                  key={id}
                  id={`arrow-${id}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={id === "bonus" ? "#9ee6b5" : "#ffab91"}
                  />
                </marker>
              ))}
            </defs>
            <circle
              cx="50"
              cy="50"
              r="35"
              fill="none"
              stroke="#b7c1a32b"
              stroke-width="0.5"
            />
            {elementRing.map((element, i) => {
              const modifier = elementModifier(attacker, element);
              if (!modifier) return null;
              const to = points[i],
                dx = to.x - from.x,
                dy = to.y - from.y,
                length = Math.hypot(dx, dy);
              return (
                <line
                  key={element}
                  x1={from.x + (dx / length) * 12}
                  y1={from.y + (dy / length) * 12}
                  x2={to.x - (dx / length) * 13}
                  y2={to.y - (dy / length) * 13}
                  stroke={modifier > 0 ? "#9ee6b5" : "#ffab91"}
                  stroke-width="1"
                  stroke-dasharray={modifier < 0 ? "2 2" : undefined}
                  marker-end={`url(#arrow-${modifier > 0 ? "bonus" : "penalty"})`}
                />
              );
            })}
          </svg>
          {elementRing.map((e, i) => (
            <button
              key={e}
              style={{
                left: `${points[i].x}%`,
                top: `${points[i].y}%`,
                "--element": E[e][0],
              }}
              aria-pressed={attacker === e}
              aria-label={`Atacar com ${E[e][2]}`}
              onClick={() => setAttacker(e)}
            >
              <ElementIcon element={e} />
              <span>{E[e][2]}</span>
            </button>
          ))}
        </div>
        <div className="element-outcomes" aria-live="polite">
          {[1, -1].map((modifier) => {
            const target = elementRing.find(
              (e) => elementModifier(attacker, e) === modifier,
            )!;
            return (
              <div
                key={modifier}
                className={modifier > 0 ? "bonus" : "penalty"}
              >
                <strong>{modifier > 0 ? "+1" : "−1"} dano</strong>
                <span>
                  {E[attacker][2]} → {E[target][2]}
                </span>
              </div>
            );
          })}
        </div>
        <p className="element-note">
          Outros confrontos: sem alteração. Com mais de um tipo, os
          modificadores se somam. Amaldiçoado ignora esses modificadores;
          efeitos específicos das cartas ainda se aplicam.
        </p>
        <div className="attribute-key">
          <span className="attack">⚔ Ataque</span>
          <span className="health">♥ Vida</span>
          <span className="speed">➟ Velocidade</span>
        </div>
        <p className="element-note">
          Nas peças, ↑ indica aumento e ↓ indica redução em relação à carta
          original.
        </p>
        <details className="piece-state-key">
          <summary>Estados das peças</summary>
          <p>
            ➟ Movimento disponível · ◷ Invocado neste turno · ✓ Movimento usado
            · × Movimento impedido.
          </p>
          <p>
            ✦ Habilidade disponível. Toque no selo para escolher os alvos.
            Contorno verde marca alvos válidos; dourado marca as peças afetadas
            pela prévia.
          </p>
          <p>
            Abra os detalhes de uma peça para consultar efeitos, origem dos
            bônus e quando terminam.
          </p>
        </details>
      </section>
    </dialog>
  );
}
