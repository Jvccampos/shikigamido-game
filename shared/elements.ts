export const elementRing = ["vazio", "vento", "fogo", "agua", "terra"] as const;

/** Damage modifier for one attacking type against one defending type. */
export function elementModifier(attacking: string, defending: string) {
  const a = elementRing.indexOf(attacking as (typeof elementRing)[number]);
  const d = elementRing.indexOf(defending as (typeof elementRing)[number]);
  if (a < 0 || d < 0) return 0;
  if (d === (a + 2) % 5) return 1;
  if (d === (a + 1) % 5) return -1;
  return 0;
}
