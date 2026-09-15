import type { CommandDraft } from "../shared/model.js";
import type { UnitView } from "../shared/room.js";
import { abilities } from "../shared/abilities.js";
import { kw } from "../shared/rules/core.js";
export type Point = { x: number; y: number };
export type Selection =
  | {
      kind: "hand";
      cardId: string;
      index: number;
      fromDeck?: boolean;
      unitId?: never;
    }
  | {
      kind: "unit";
      unitId: string;
      cardId?: never;
      index?: never;
      fromDeck?: never;
    };

export type SelectionDraft = {
  selected: Selection | null;
  targetMode: boolean;
  targetIds: string[];
  cells: Point[];
  choice: string;
  extra: number;
};
export const emptySelection = (): SelectionDraft => ({
  selected: null,
  targetMode: false,
  targetIds: [],
  cells: [],
  choice: "",
  extra: 0,
});
export function selectionCommands(draft: SelectionDraft) {
  const { selected, targetIds, cells, choice, extra } = draft;
  const castCommand: CommandDraft = {
    type: "cast",
    cardId: selected?.cardId,
    handIndex: selected?.index,
    targetId: targetIds[0],
    targetId2: targetIds[1],
    x: cells[0]?.x,
    y: cells[0]?.y,
    x2: cells[1]?.x,
    y2: cells[1]?.y,
    extraPe: extra,
    choice,
  };
  const abilityCommand: CommandDraft = {
    type: "ability",
    unitId: selected?.unitId,
    targetId: targetIds[0],
    x: cells[0]?.x,
    y: cells[0]?.y,
    choice,
  };
  const rangedCommand: CommandDraft = {
    type: "attack",
    unitId: selected?.unitId,
    targetId: targetIds[0],
  };
  return { castCommand, abilityCommand, rangedCommand };
}
export function selectedAbility(unit?: UnitView) {
  return unit
    ? abilities[unit.cardId] ||
        (kw(unit, "Construir") ? abilities["kuma-no-tsuno"] : undefined)
    : undefined;
}
