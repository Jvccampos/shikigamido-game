import type { Context } from "./database.js";
import {
  validateDeck,
  freshGame,
  apply,
  type Game,
  type Seat,
  type Cmd,
} from "../shared/game.js";
import { publicRoom } from "../shared/visibility.js";
const clean = (v: unknown, n = 80) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
const members = (r: any): any[] =>
  Array.isArray(r.spectators)
    ? r.spectators.filter((m: any) => m && typeof m === "object")
    : [];
const name = (ctx: any) => clean(ctx.auth.displayName) || "Jogador";
export default {
  queries: {
    myDecks: (ctx: Context) =>
      ctx.auth.userId
        ? ctx.db.transaction((tx) =>
            tx.decks
              .where("ownerId", ctx.auth.userId!)
              .orderBy("updatedAt", "desc")
              .all(),
          )
        : [],
    myRooms: (ctx: Context) =>
      ctx.auth.userId
        ? ctx.db.transaction((tx) =>
            tx.rooms
              .orderBy("updatedAt", "desc")
              .all()
              .filter(
                (r: any) =>
                  r.hostId === ctx.auth.userId ||
                  members(r).some((m) => m.id === ctx.auth.userId),
              )
              .slice(0, 12)
              .map((r: any) => ({ code: r.code, status: r.status })),
          )
        : [],
    room: (ctx: Context, c: unknown) => {
      const k = clean(c, 6).toUpperCase();
      return k.length === 6
        ? ctx.db.transaction((tx) =>
            publicRoom(tx.rooms.where("code", k).all()[0], ctx.auth.userId),
          )
        : null;
    },
  },
  mutations: {
    saveDeck: (ctx: Context, input: any) => {
      const id = ctx.auth.userId;
      if (!id)
        return { error: "Entre na sua conta para salvar seus baralhos." };
      const error = validateDeck(input);
      if (error) return { error };
      return ctx.db.transaction((tx) => {
        const values = {
          ownerId: id,
          name: clean(input.name) || "Meu baralho",
          element: input.element,
          omionji: `omionji-${input.element}`,
          cardIds: input.cardIds,
        };
        if (input.id) {
          if (!tx.decks.where("ownerId", id).get(input.id))
            return { error: "Baralho não encontrado." };
          return { deck: tx.decks.update(input.id, values) };
        }
        return { deck: tx.decks.insert(values) };
      });
    },
    deleteDeck: (ctx: Context, id: unknown) => {
      if (!ctx.auth.userId || typeof id !== "string")
        return { error: "Baralho inválido." };
      return ctx.db.transaction((tx) => ({
        deleted: tx.decks.where("ownerId", ctx.auth.userId!).delete(id),
      }));
    },
    createRoom: (ctx: Context, deckId: unknown) => {
      const id = ctx.auth.userId;
      if (!id) return { error: "Entre na sua conta para criar uma sala." };
      return ctx.db.transaction((tx) => {
        const deck =
          typeof deckId === "string"
            ? tx.decks.where("ownerId", id).get(deckId)
            : null;
        if (!deck) return { error: "Selecione um baralho." };
        const error = validateDeck(deck);
        if (error) return { error };
        let code: string;
        do {
          code = crypto
            .randomUUID()
            .replace(/-/g, "")
            .slice(0, 6)
            .toUpperCase();
        } while (tx.rooms.where("code", code).all().length);
        const room = tx.rooms.insert({
          code,
          hostId: id,
          guestId: null,
          hostDeckId: deck.id,
          guestDeckId: null,
          spectators: [
            {
              id,
              name: name(ctx),
              deckId: deck.id,
              deckName: deck.name,
              element: deck.element,
            },
          ],
          status: "waiting",
          state: { seats: [id, null] },
        });
        return { room: publicRoom(room, id) };
      });
    },
    joinRoom: (
      ctx: Context,
      c: unknown,
      deckId: unknown,
      spectator: unknown,
    ) => {
      const id = ctx.auth.userId,
        k = clean(c, 6).toUpperCase();
      if (k.length !== 6) return { error: "O código tem 6 caracteres." };
      if (!id && spectator !== true)
        return { error: "Entre na sua conta para jogar." };
      return ctx.db.transaction((tx) => {
        const r: any = tx.rooms.where("code", k).all()[0];
        if (!r) return { error: "Sala não encontrada." };
        if (!id) return { room: publicRoom(r, null) };
        const list = members(r),
          existing = list.find((m) => m.id === id);
        // Reconnection never replaces a running match.
        if (r.status !== "waiting") return { room: publicRoom(r, id) };
        const deck =
          typeof deckId === "string"
            ? tx.decks.where("ownerId", id).get(deckId)
            : null;
        if (spectator !== true && (!deck || validateDeck(deck)))
          return {
            error: deck ? validateDeck(deck) : "Selecione um baralho válido.",
          };
        const member = {
          id,
          name: name(ctx),
          deckId: deck?.id || existing?.deckId || null,
          deckName: deck?.name || existing?.deckName || null,
          element: deck?.element || existing?.element || null,
        };
        const updated = existing
          ? list.map((m) => (m.id === id ? member : m))
          : [...list, member];
        if (updated.length > 32)
          return { error: "A sala atingiu 32 participantes." };
        return {
          room: publicRoom(tx.rooms.update(r.id, { spectators: updated }), id),
        };
      });
    },
    lobbyCommand: (ctx: Context, c: unknown, raw: any) => {
      const id = ctx.auth.userId;
      if (!id) return { error: "Entre na sua conta para continuar." };
      if (!raw || typeof raw !== "object")
        return { error: "Comando inválido." };
      return ctx.db.transaction((tx) => {
        const r: any = tx.rooms
          .where("code", clean(c, 6).toUpperCase())
          .all()[0];
        if (!r) return { error: "Sala não encontrada." };
        if (r.status !== "waiting") return { error: "A batalha já começou." };
        if (r.hostId !== id)
          return { error: "Só o criador pode organizar e iniciar a batalha." };
        const list = members(r);
        const state = structuredClone(r.state);
        if (raw.type === "seat") {
          if (
            ![0, 1].includes(raw.seat) ||
            (raw.userId !== null &&
              !list.some((m) => m.id === raw.userId && m.deckId))
          )
            return { error: "Escolha alguém com um baralho." };
          const seats = state.seats || [id, null];
          if (raw.userId !== null && seats[1 - raw.seat] === raw.userId)
            seats[1 - raw.seat] = null;
          seats[raw.seat] = raw.userId;
          state.seats = seats;
          return { room: publicRoom(tx.rooms.update(r.id, { state }), id) };
        }
        if (raw.type !== "start") return { error: "Comando inválido." };
        const seats = state.seats || [id, null];
        if (!seats[0] || !seats[1] || seats[0] === seats[1])
          return { error: "Escolha dois jogadores diferentes." };
        const a = list.find((m) => m.id === seats[0]),
          b = list.find((m) => m.id === seats[1]);
        const da = a ? tx.decks.where("ownerId", a.id).get(a.deckId) : null,
          db = b ? tx.decks.where("ownerId", b.id).get(b.deckId) : null;
        if (!da || !db)
          return { error: "Os dois jogadores precisam selecionar baralhos." };
        const error = validateDeck(da) || validateDeck(db);
        if (error) return { error };
        const game = freshGame(a.id, b.id, da, db);
        return {
          room: publicRoom(
            tx.rooms.update(r.id, {
              guestId: b.id,
              guestDeckId: db.id,
              status: "playing",
              state: game,
            }),
            id,
          ),
        };
      });
    },
    gameCommand: (
      ctx: Context,
      c: unknown,
      raw: unknown,
      revision: unknown,
    ) => {
      const id = ctx.auth.userId;
      if (!id) return { error: "Entre na sua conta para jogar." };
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return { error: "Comando inválido." };
      return ctx.db.transaction((tx) => {
        const r: any = tx.rooms
          .where("code", clean(c, 6).toUpperCase())
          .all()[0];
        if (!r) return { error: "Sala não encontrada." };
        if (r.status !== "playing")
          return { error: "Essa sala não está em batalha." };
        const g = structuredClone(r.state) as Game;
        const seat = g.players.findIndex((p) => p.id === id);
        if (seat < 0) return { error: "Espectadores não enviam comandos." };
        const cmd = raw as Cmd;
        const independentSetup =
          g.setup &&
          ((cmd.type === "ready" && !g.players[seat].ready) ||
            (cmd.type === "mulligan" &&
              !g.players[seat].mulligan &&
              !g.players[seat].ready));
        const independentCenter =
          g.centerPending &&
          cmd.type === "center" &&
          !Object.hasOwn(g.centerChoices || {}, seat);
        if (
          revision !== (g.revision || 0) &&
          !independentSetup &&
          !independentCenter
        )
          return {
            error:
              "A partida foi atualizada. Confira o tabuleiro e tente novamente.",
            room: publicRoom(r, id),
          };
        const error = apply(g, seat as Seat, raw as Cmd);
        if (error) return { error };
        g.revision = (g.revision || 0) + 1;
        g.log = g.log.slice(-100);
        return {
          room: publicRoom(
            tx.rooms.update(r.id, {
              state: g,
              status: g.winner !== null || g.draw ? "finished" : "playing",
            }),
            id,
          ),
        };
      });
    },
  },
};
