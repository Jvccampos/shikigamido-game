import { useEffect, useRef, useState } from "preact/hooks";
import type { GameView } from "../shared/room.js";
import type { Cmd } from "../shared/model.js";
import type { Card } from "../shared/cards.js";
import { cards } from "../shared/cards.js";
import { ChoiceCards } from "./choices.js";

export function SearchChoice({
  search,
  busy,
  onAct,
  onFocus,
}: {
  search: NonNullable<GameView["searches"]>[number];
  busy: boolean;
  onAct: (cmd: Cmd) => void;
  onFocus: (c: Card | undefined) => void;
}) {
  const [chosen, setChosen] = useState(-1);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || document.querySelector(".modal-scrim")) return;
      const buttons = Array.from(
        box.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) || [],
      );
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      e.preventDefault();
      buttons[
        (index + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length
      ]?.focus();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, []);
  const source = cards.get(search.sourceCardId)!;
  const empty = !search.options.length;
  const submit = (skip = false) =>
    onAct({
      type: "search",
      promptId: search.id,
      cardId: skip ? undefined : search.options[chosen],
      choice: skip ? "skip" : undefined,
    });
  return (
    <div className="search-scrim">
      <section
        ref={box}
        tabIndex={-1}
        className="search-choice"
        role="dialog"
        aria-modal="true"
        aria-label={`Busca de ${source.name}`}
      >
        <div className="search-source">
          <img src={source.asset} alt="" />
          <div>
            <small>EFEITO DE {source.name}</small>
            <h2>
              {search.zone === "library"
                ? "Busque no baralho"
                : "Recupere do descarte"}
            </h2>
          </div>
        </div>
        <p>
          {empty
            ? "Não há cartas compatíveis disponíveis neste momento."
            : `Escolha um ${search.family === "taodu" ? "Taodu" : "Gato"} para adicionar à sua mão.`}
        </p>
        {!empty && (
          <ChoiceCards
            hand={search.options}
            selected={chosen < 0 ? [] : [chosen]}
            onSelect={setChosen}
            onFocus={onFocus}
            label="Escolher"
            disabled={busy}
          />
        )}
        <div className="search-actions">
          {search.optional && !empty && (
            <button
              className="seal-button quiet"
              disabled={busy}
              onClick={() => submit(true)}
            >
              Não buscar
            </button>
          )}
          <button
            className="seal-button"
            disabled={busy || (!empty && chosen < 0)}
            onClick={() => submit(empty)}
          >
            {empty
              ? "Continuar"
              : chosen < 0
                ? "Escolha uma carta"
                : `Adicionar ${cards.get(search.options[chosen])?.name} à mão`}
          </button>
        </div>
        <small className="search-privacy">
          {search.zone === "library"
            ? "Só você vê as opções. O restante do baralho será embaralhado."
            : "A carta escolhida sai do descarte e volta à sua mão."}
        </small>
      </section>
    </div>
  );
}
