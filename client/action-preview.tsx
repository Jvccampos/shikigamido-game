import type { ActionPreview as Preview } from "../shared/action-advice.js";
export function ActionPreview({ preview }: { preview: Preview }) {
  return (
    <section
      className={`action-preview ${preview.error ? "invalid" : ""}`}
      aria-label="Prévia da ação"
    >
      <small>ANTES DE AGIR</small>
      <h3>{preview.title}</h3>
      {preview.title !== "Combate anunciado" && (
        <div className="preview-cost">
          <strong>
            {preview.cost ? `${preview.cost} PE` : "Sem custo de PE"}
          </strong>
          {preview.cost > 0 && (
            <span>
              {preview.energy} energia + {preview.reserve} reserva
            </span>
          )}
        </div>
      )}
      {preview.error ? (
        <p className="preview-error">{preview.error}</p>
      ) : (
        <>
          <ul>
            {preview.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {preview.uncertain && (
            <p className="preview-caveat">{preview.uncertain}</p>
          )}
          {preview.title !== "Combate anunciado" && (
            <small className="preview-gesture">
              Arraste e solte para jogar. Esc cancela a seleção.
            </small>
          )}
        </>
      )}
    </section>
  );
}
