import type { Game, GameEvent, Player, Seat, Unit } from "./model.js";
import type {
  GameView,
  HiddenUnit,
  PublicRoom,
  Room,
  UnitView,
} from "./room.js";

function hiddenUnit(u: Unit): HiddenUnit {
  return {
    id: u.id,
    owner: u.owner,
    x: u.x,
    y: u.y,
    kind: "unit",
    cardId: "hidden",
    hp: null,
    maxHp: null,
    attack: null,
    speed: null,
    statuses: { hidden: true },
  };
}
export function publicGame(game: Game, viewer: Seat | -1): GameView {
  // Clone before redaction so no public view can mutate authoritative state.
  const g = structuredClone(game);
  delete g.random;
  const conceal = (u: Unit): UnitView =>
    u.statuses?.hidden && u.owner !== viewer ? hiddenUnit(u) : u;
  const event = (e: GameEvent): GameEvent<UnitView> => {
    if (e.type === "combat")
      return {
        ...e,
        attacker: conceal(e.attacker),
        defender: conceal(e.defender),
      };
    if (e.type === "spell")
      return {
        ...e,
        beforeTarget: e.beforeTarget && conceal(e.beforeTarget),
        afterTarget: e.afterTarget && conceal(e.afterTarget),
      };
    if ("unit" in e) return { ...e, unit: conceal(e.unit) };
    return e;
  };
  const player = (p: Player, i: number) => ({
    ...p,
    handCount: p.hand.length,
    libraryCount: p.library.length,
    summonableDeck:
      i === viewer
        ? [
            ...new Set(
              p.library.filter((id) =>
                [
                  "kabuto-o-shikigami-besouro",
                  "anubis-o-gato-da-morte",
                ].includes(id),
              ),
            ),
          ]
        : [],
    library: [],
    hand: i === viewer ? p.hand : [],
  });
  const players: GameView["players"] = [
    player(g.players[0], 0),
    player(g.players[1], 1),
  ];
  return {
    ...g,
    players,
    units: g.units.map((u) =>
      g.setup && u.kind === "omionji" && u.owner !== viewer
        ? { ...u, y: u.owner ? 4 : 2 }
        : conceal(u),
    ),
    pending: g.pending.map((p) =>
      p.unit.owner === viewer
        ? p
        : {
            returnTurn: p.returnTurn,
            unit: { owner: p.unit.owner, cardId: "hidden" },
          },
    ),
    events: (g.events || []).map(event),
    centerChoices: g.centerPending
      ? Object.fromEntries(
          Object.entries(g.centerChoices || {}).map(([key, value]) => [
            key,
            Number(key) === viewer ? value : !!value,
          ]),
        )
      : g.centerChoices,
  };
}
export function publicRoom(
  room: Room | null | undefined,
  userId: string | null,
): PublicRoom | null {
  if (!room) return null;
  const info = {
    code: room.code,
    hostId: room.hostId,
    guestId: room.guestId,
    members: room.spectators
      .filter((m) => m && typeof m === "object")
      .map((m) => ({
        id: m.id,
        name: m.name,
        deckName: m.deckName,
        element: m.element,
        hasDeck: !!m.deckId,
      })),
  };
  if (room.status === "waiting")
    return {
      ...info,
      status: "waiting",
      state: structuredClone(room.state),
      seat: -1,
    };
  const seat = room.state.players.findIndex((p) => p.id === userId) as
    Seat | -1;
  return {
    ...info,
    status: room.status,
    state: publicGame(room.state, seat),
    seat,
  };
}
