import type { UnitView } from "./room.js";
export function unitChanges(before: UnitView, after: UnitView) {
  if (before.cardId === "hidden" || after.cardId === "hidden") return [];
  const changes: string[] = [];
  for (const [key, label] of [
    ["hp", "Vida"],
    ["maxHp", "Vida máxima"],
    ["attack", "Ataque"],
    ["speed", "Velocidade"],
  ] as const)
    if (before[key] !== after[key])
      changes.push(`${label} ${before[key]} → ${after[key]}`);
  for (const [key, label] of [
    ["shield", "Escudo"],
    ["stun", "Atordoamento"],
    ["softStun", "Imobilização"],
    ["burn", "Queimadura"],
    ["intangivel", "Intangibilidade"],
  ] as const)
    if (before.statuses?.[key] !== after.statuses?.[key])
      changes.push(`${after.statuses?.[key] ? "+" : "−"}${label}`);
  if (before.x !== after.x || before.y !== after.y)
    changes.push(
      `Move para ${String.fromCharCode(65 + after.x)}${after.y + 1}`,
    );
  return changes;
}
