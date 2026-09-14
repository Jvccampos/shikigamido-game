function hiddenUnit(u: any) {
  return {
    id: u.id,
    owner: u.owner,
    x: u.x,
    y: u.y,
    kind: "unit",
    cardId: "hidden",
    statuses: { hidden: true },
  };
}
export function publicRoom(room: any, userId: string | null) {
  if (!room) return null;
  const r = structuredClone(room),
    g = r.state;
  r.members = (Array.isArray(r.spectators) ? r.spectators : [])
    .filter((m: any) => m && typeof m === "object")
    .map((m: any) => ({
      id: m.id,
      name: m.name,
      deckName: m.deckName,
      element: m.element,
      hasDeck: !!m.deckId,
    }));
  delete r.spectators;
  delete r.hostDeckId;
  delete r.guestDeckId;
  r.seat = Array.isArray(g?.players)
    ? g.players.findIndex((p: any) => p.id === userId)
    : -1;
  if (!Array.isArray(g?.players)) return r;
  // Random state can reveal future draws; it never belongs in a player response.
  delete g.random;
  const viewer = r.seat;
  g.players = g.players.map((p: any, i: number) => {
    const value = {
      ...p,
      handCount: p.hand.length,
      libraryCount: p.library.length,
    };
    value.summonableDeck =
      i === viewer
        ? [
            ...new Set(
              p.library.filter((id: string) =>
                [
                  "kabuto-o-shikigami-besouro",
                  "anubis-o-gato-da-morte",
                ].includes(id),
              ),
            ),
          ]
        : [];
    value.library = [];
    if (i !== viewer) value.hand = [];
    return value;
  });
  const hidden = new Set(
    g.units
      .filter((u: any) => u.statuses?.hidden && u.owner !== viewer)
      .map((u: any) => u.id),
  );
  const conceal = (u: any) =>
    hidden.has(u.id)
      ? {
          ...hiddenUnit(u),
          hp: null,
          maxHp: null,
          attack: null,
          speed: null,
        }
      : u;
  g.units = g.units.map((u: any) =>
    g.setup && u.kind === "omionji" && u.owner !== viewer
      ? { ...u, y: u.owner ? 4 : 2 }
      : conceal(u),
  );
  g.pending = (g.pending || []).map((p: any) =>
    p.unit.owner === viewer
      ? p
      : {
          returnTurn: p.returnTurn,
          unit: { owner: p.unit.owner, cardId: "hidden" },
        },
  );
  const concealSnapshot = (u: any) =>
    u?.statuses?.hidden && u.owner !== viewer ? hiddenUnit(u) : u;
  g.events = (g.events || [])
    .map((e: any) => ({
      ...e,
      beforeTarget: concealSnapshot(e.beforeTarget),
      afterTarget: concealSnapshot(e.afterTarget),
    }))
    .map((e: any) =>
      e.unit?.statuses?.hidden && e.unit.owner !== viewer
        ? {
            ...e,
            unit: hiddenUnit(e.unit),
            cardId: undefined,
          }
        : e,
    );
  if (g.centerPending)
    g.centerChoices = Object.fromEntries(
      Object.entries(g.centerChoices || {}).map(([key, value]) => [
        key,
        Number(key) === viewer ? value : !!value,
      ]),
    );
  return r;
}
