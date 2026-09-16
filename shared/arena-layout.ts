/** Orthographic board: one unit has the same pixel length on both axes. */
export function layout(w: number, h: number) {
  const compact = h < 560 && w > h,
    mobile = w < 760;
  const top = compact ? 90 : mobile ? 174 : 132,
    bottom = compact ? 105 : mobile ? 188 : 205;
  const step = Math.max(
    18,
    Math.min(
      (w - (mobile ? 46 : compact ? 300 : 430)) / (mobile ? 7.9 : 6.9),
      (h - top - bottom) / 6.9,
      130,
    ),
  );
  const cx = w / 2,
    cy = top + (h - top - bottom) / 2 + (mobile && !compact ? 20 : 0);
  return {
    dx: step,
    dy: step,
    cx,
    cy,
    point: (x: number, y: number) => ({
      x: cx + ((x < 0 ? -0.85 : x > 6 ? 6.85 : x) - 3) * step,
      y: cy + ((y < 0 ? -0.85 : y > 6 ? 6.85 : y) - 3) * step,
    }),
  };
}
