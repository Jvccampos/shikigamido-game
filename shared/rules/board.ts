import type { UnitView } from "../room.js";
type Board = Pick<
  Game,
  "turn" | "terrain" | "edges" | "moved" | "moveCounts"
> & {
  units: UnitView[];
  players: Pick<Game["players"][number], "pe" | "permanentPe">[];
};
import { type Game, type Seat } from "../model.js";
import { kw, typesOf } from "./core.js";

export const at = <U extends UnitView>(
  g: { units: U[] },
  x: number,
  y: number,
) => g.units.find((u) => u.x === x && u.y === y);

export const valid = (x: number, y: number) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x <= 6 &&
  y >= 0 &&
  y <= 6;

export const spawns: [number, number][] = [
  [-1, 7],
  [7, -1],
];

const isSpawn = (x: number, y: number) =>
  spawns.some(([a, b]) => a === x && b === y);

export function linked(ax: number, ay: number, bx: number, by: number) {
  if (isSpawn(ax, ay))
    return ax === -1 ? bx === 0 && by === 6 : bx === 6 && by === 0;
  if (isSpawn(bx, by)) return linked(bx, by, ax, ay);
  if (!valid(ax, ay) || !valid(bx, by)) return false;
  const dx = Math.abs(ax - bx),
    dy = Math.abs(ay - by);
  if (dx === 1 && dy === 1)
    return (ax === ay && bx === by) || (ax + ay === 6 && bx + by === 6);
  if (dx + dy !== 1) return false;
  if (ay === by) {
    const inset = Math.min(ay, 6 - ay);
    return (
      ay === 3 || (Math.min(ax, bx) >= inset && Math.max(ax, bx) <= 6 - inset)
    );
  }
  const inset = Math.min(ax, 6 - ax);
  return (
    ax === 3 || (Math.min(ay, by) >= inset && Math.max(ay, by) <= 6 - inset)
  );
}

export function neighbors(x: number, y: number) {
  return [
    ...Array.from(
      { length: 49 },
      (_, i) => [i % 7, Math.floor(i / 7)] as [number, number],
    ),
    ...spawns,
  ].filter(([a, b]) => linked(x, y, a, b));
}

export function connected(
  g: Board,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  return (
    linked(ax, ay, bx, by) ||
    (g.edges || []).some(
      ([x, y, xx, yy]) =>
        (ax === x && ay === y && bx === xx && by === yy) ||
        (ax === xx && ay === yy && bx === x && by === y),
    )
  );
}

export function route(
  g: Board,
  u: UnitView,
  tx: number,
  ty: number,
): [number, number][] | null {
  if (!valid(tx, ty) || (g.turn < 3 && tx === 3 && ty === 3)) return null;
  const q: { x: number; y: number; path: [number, number][] }[] = [
      { x: u.x, y: u.y, path: [] },
    ],
    seen = new Set([`${u.x},${u.y}`]);
  const jump = kw(u, "Pular") > 0,
    ghost = !!u.statuses?.intangivel;
  while (q.length) {
    const { x, y, path } = q.shift()!;
    if (x === tx && y === ty) return path;
    const lake = g.terrain?.find(
      (t) => t.kind === "lake" && t.x === x && t.y === y,
    );
    if (path.length && lake && !typesOf(u).includes("agua")) continue;
    for (let ny = 0; ny < 7; ny++)
      for (let nx = 0; nx < 7; nx++) {
        if (seen.has(`${nx},${ny}`) || (g.turn < 3 && nx === 3 && ny === 3))
          continue;
        const target = at(g, nx, ny),
          enemy =
            target && (target.kind === "curse" || target.owner !== u.owner);
        if (
          !connected(g, x, y, nx, ny) &&
          !(jump && Math.abs(nx - x) + Math.abs(ny - y) === 1 && !enemy)
        )
          continue;
        const dest = nx === tx && ny === ty;
        if (target?.kind === "wall" && !dest) continue;
        if (enemy && !dest && !ghost) continue;
        if (
          dest &&
          target &&
          ((target.kind !== "curse" && target.owner === u.owner) || ghost)
        )
          continue;
        if (dest && enemy && path.length && at(g, x, y)) continue;
        seen.add(`${nx},${ny}`);
        q.push({ x: nx, y: ny, path: [...path, [nx, ny]] });
      }
  }
  return null;
}

export function pathLength(
  g: Board,
  from: UnitView,
  tx: number,
  ty: number,
  ignoreTarget = true,
) {
  const q: [[number, number], number][] = [[[from.x, from.y], 0]],
    seen = new Set([`${from.x},${from.y}`]);
  while (q.length) {
    const [[x, y], d] = q.shift()!;
    if (x === tx && y === ty) return d;
    for (const [nx, ny] of neighbors(x, y)) {
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      const occupied = at(g, nx, ny);
      if (
        occupied &&
        (from.kind === "curse" || occupied.owner !== from.owner) &&
        !(ignoreTarget && nx === tx && ny === ty)
      )
        continue;
      seen.add(k);
      q.push([[nx, ny], d + 1]);
    }
  }
  return Infinity;
}

export function summonCells(g: Board, seat: Seat) {
  return Array.from({ length: 49 }, (_, i) => ({
    x: i % 7,
    y: Math.floor(i / 7),
  })).filter(
    ({ x, y }) =>
      !(g.turn < 3 && x === 3 && y === 3) &&
      !at(g, x, y) &&
      g.units.some(
        (u) =>
          u.owner === seat &&
          u.kind === "crystal" &&
          connected(g, u.x, u.y, x, y),
      ),
  );
}

export function moveOptions(g: Board, u: UnitView) {
  if (
    (g.moveCounts?.[u.owner] || 0) >= 2 &&
    g.players[u.owner].pe + g.players[u.owner].permanentPe < 1
  )
    return [];
  if (
    g.moved.includes(u.id) ||
    u.summonedTurn === g.turn ||
    u.statuses?.stun ||
    u.statuses?.softStun ||
    !["unit", "omionji"].includes(u.kind)
  )
    return [];
  return Array.from({ length: 49 }, (_, i) => ({
    x: i % 7,
    y: Math.floor(i / 7),
  })).filter(({ x, y }) => {
    const path = route(g, u, x, y);
    return path && path.length > 0 && path.length <= movementBudget(g, u, path);
  });
}

export function movementBudget(
  g: Board,
  u: UnitView,
  path: [number, number][],
) {
  let n = u.speed ?? 0;
  let [x, y] = [u.x, u.y];
  for (const [nx, ny] of path) {
    for (const t of g.terrain.filter((t) => t.kind === "wind")) {
      if (t.x === x && t.y === y && t.x2 === nx && t.y2 === ny) n++;
      if (t.x2 === x && t.y2 === y && t.x === nx && t.y === ny) n--;
    }
    x = nx;
    y = ny;
  }
  return n;
}
