import { test } from "node:test";
import assert from "node:assert/strict";
import { layout } from "../shared/arena-layout.js";
test("board is square at desktop, tablet, portrait and landscape sizes", () => {
  for (const [w, h] of [
    [1728, 1037],
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [390, 844],
    [844, 390],
  ]) {
    const l = layout(w, h),
      a = l.point(0, 0),
      b = l.point(6, 6);
    assert(Math.abs(b.x - a.x - (b.y - a.y)) < 0.001);
    for (const [x, y] of [
      [0, 0],
      [6, 6],
      [-1, 7],
      [7, -1],
    ]) {
      const p = l.point(x, y);
      assert(p.x > 0 && p.x < w && p.y > 0 && p.y < h);
    }
    const portal = l.point(-1, 7),
      corner = l.point(0, 6);
    assert(
      corner.x - portal.x > l.dx * 0.76,
      "portal piece clears the corner piece",
    );
  }
});
