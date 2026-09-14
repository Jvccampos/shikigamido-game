/** Explicit seeds reproduce tests. Live games use the platform cryptographic RNG. */
export type RandomState = { state: number };
export function randomState(seed?: number): RandomState | undefined {
  return seed === undefined ? undefined : { state: seed >>> 0 || 0x6d2b79f5 };
}
export function random(source?: RandomState) {
  if (!source)
    return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  let x = source.state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  source.state = x >>> 0;
  return source.state / 0x100000000;
}
export function shuffle<T>(items: readonly T[], source?: RandomState): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(source) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
