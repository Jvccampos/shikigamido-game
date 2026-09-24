import type { SpellSpec } from "../shared/spells.js";
import type { UnitView } from "../shared/room.js";
import type { Point } from "./action-selection.js";

/** One decision a spell needs before it can be cast, in the order players make them. */
export type SpellStep = {
  kind: "unit" | "cell" | "choice" | "amount";
  label: string;
  done: boolean;
  /** The chosen piece, when this step picks one. */
  unitId?: string;
  /** Short description of the chosen value. */
  value?: string;
};

const unitLabels: Partial<Record<SpellSpec["target"], string[]>> = {
  unit: ["Monstro alvo"],
  enemyUnit: ["Monstro inimigo"],
  ally: ["Seu monstro"],
  windAlly: ["Seu monstro de Vento"],
  omionjiFire: ["Seu Omionji de Fogo"],
  twoAllies: ["Primeiro aliado", "Segundo aliado"],
  duel: ["Seu monstro no duelo"],
  twoUnits: ["Monstro com a keyword", "Monstro que a recebe"],
  move: ["Seu monstro"],
  combat: ["Monstro no combate"],
  redirect: ["Seu monstro em combate", "Aliado que recebe o dano"],
};
const cellLabels: Partial<Record<SpellSpec["target"], string[]>> = {
  cell: ["Casa vazia"],
  rift: ["Casa vazia junto a uma carta sua"],
  lake: ["Casa com Água ou ao lado dela"],
  wind: ["Início da corrente", "Fim da corrente, em linha reta"],
  move: ["Casa conectada vazia"],
  discardCat: ["Casa de invocação"],
};

export const cellName = (p: Point) =>
  `${String.fromCharCode(65 + p.x)}${p.y + 1}`;

export function spellSteps(
  spec: SpellSpec | undefined,
  draft: {
    targetIds: string[];
    cells: Point[];
    choice: string;
  },
  units: UnitView[],
  names: { unit: (u?: UnitView) => string; card: (id: string) => string },
): SpellStep[] {
  if (!spec) return [];
  const steps: SpellStep[] = [];
  const { targetIds, choice } = draft;
  (unitLabels[spec.target] || []).forEach((label, i) => {
    const unit = units.find((u) => u.id === targetIds[i]);
    steps.push({
      kind: "unit",
      label,
      done: !!unit,
      unitId: unit?.id,
      value: unit ? names.unit(unit) : undefined,
    });
  });
  // A piece's own cell is recorded when it is picked; only other cells count.
  const picked = units.filter((u) => targetIds.includes(u.id));
  const cells = draft.cells.filter(
    (c) => !picked.some((u) => u.x === c.x && u.y === c.y),
  );
  (cellLabels[spec.target] || []).forEach((label, i) =>
    steps.push({
      kind: "cell",
      label,
      done: !!cells[i],
      value: cells[i] ? cellName(cells[i]) : undefined,
    }),
  );
  const choiceLabel =
    spec.target === "discardVoid" || spec.target === "discardCat"
      ? "Carta do descarte"
      : spec.choice === "keyword"
        ? "Keyword copiada"
        : spec.choice === "combatRole"
          ? "Seu monstro está"
          : "";
  if (choiceLabel)
    steps.push({
      kind: "choice",
      label: choiceLabel,
      // The rules treat an unset role as attacking, so that step starts done.
      done: !!choice || spec.choice === "combatRole",
      value:
        spec.choice === "combatRole"
          ? choice === "defender"
            ? "Defendendo"
            : "Atacando"
          : spec.choice === "keyword"
            ? choice || undefined
            : choice
              ? names.card(choice)
              : undefined,
    });
  // The discard choice comes first for rituals: the card decides the cell.
  if (spec.target === "discardCat") steps.unshift(steps.pop()!);
  return steps;
}

/** Labels for the numeric amount some spells ask for. */
export function amountLabel(cardId: string, spec?: SpellSpec) {
  if (spec?.amount === "redirectDamage") return "Dano transferido";
  if (cardId === "mamoru-n-9-wonder-wall") return "Vida do muro (X)";
  if (cardId === "kogekido-n-42-obliterar") return "Dano (X)";
  return "PE extra";
}
