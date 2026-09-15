import type { UnitStatuses } from "./model.js";

// Keep the persisted field names; all writers and readers share this lifecycle.
const expiresAt = {
  range: "rangeUntil",
  fireball: "fireballUntil",
  damageCap: "damageCapUntil",
  lifesteal: "lifestealUntil",
  intangivel: "intangivelUntil",
  stun: "stunUntil",
  softStun: "softStunUntil",
  stolenKeyword: "stolenKeywordUntil",
  borrowed: "borrowedUntil",
  temporaryAttack: "temporaryUntil",
  burn: "burnUntil",
} as const;
type EffectKey =
  | keyof typeof expiresAt
  | "healSplash"
  | "construir"
  | "ressurgir"
  | "block"
  | "burnAttack"
  | "devolver"
  | "shield"
  | "primordial"
  | "sacrificeTurn"
  | "redirect"
  | "redirectAmount";
export function setEffect<K extends EffectKey>(
  statuses: UnitStatuses,
  key: K,
  value: UnitStatuses[K],
  until?: number,
) {
  statuses[key] = value;
  if (until !== undefined && key in expiresAt)
    statuses[expiresAt[key as keyof typeof expiresAt]] = until;
}
export function effectExpiry(
  statuses: UnitStatuses,
  key: string,
): number | undefined {
  const field = expiresAt[key as keyof typeof expiresAt] || `${key}Until`;
  const value = statuses[field];
  return typeof value === "number" ? value : undefined;
}
export function expireEffects(statuses: UnitStatuses, turn: number) {
  for (const key of Object.keys(expiresAt) as (keyof typeof expiresAt)[]) {
    // These also change attributes or deal damage; their turn rules handle them.
    if (key === "temporaryAttack" || key === "burn") continue;
    if ((effectExpiry(statuses, key) ?? Infinity) >= turn) continue;
    if (key === "borrowed" && statuses.borrowed)
      delete statuses[statuses.borrowed];
    delete statuses[key];
    delete statuses[expiresAt[key]];
  }
}
