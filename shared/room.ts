import type {
  DeckInput,
  Game,
  GameEvent,
  Player,
  Seat,
  Unit,
} from "./model.js";

export type StoredRow = { id: string; createdAt: string; updatedAt: string };
export type Deck = DeckInput & StoredRow & { ownerId: string };
export type Member = {
  id: string;
  name: string;
  deckId?: string | null;
  deckName?: string | null;
  element?: string | null;
};
export type LobbyState = { seats: [string | null, string | null] };
type RoomInfo = {
  code: string;
  hostId: string;
  guestId?: string | null;
  hostDeckId?: string;
  guestDeckId?: string | null;
  spectators: Member[];
};
export type Room = RoomInfo &
  (
    | { status: "waiting"; state: LobbyState }
    | { status: "playing" | "finished"; state: Game }
  );
export type SavedRoom = Room & StoredRow;
export type HiddenUnit = Pick<Unit, "id" | "owner" | "x" | "y"> & {
  kind: "unit";
  cardId: "hidden";
  hp: null;
  maxHp: null;
  attack: null;
  speed: null;
  statuses: NonNullable<Unit["statuses"]> & { hidden: true };
  summonedTurn?: never;
  level?: never;
  equipment?: never;
  captured?: never;
};
export type UnitView = Unit | HiddenUnit;
export type PlayerView = Player & {
  handCount: number;
  libraryCount: number;
  summonableDeck: string[];
};
export type GameView = Omit<
  Game,
  "random" | "players" | "units" | "events" | "pending" | "centerChoices"
> & {
  players: [PlayerView, PlayerView];
  units: UnitView[];
  events: GameEvent<UnitView>[];
  pending: {
    returnTurn: number;
    unit: Unit | { owner: Seat; cardId: "hidden" };
  }[];
  centerChoices?: Record<string, string | boolean | null>;
};
type PublicInfo = Pick<RoomInfo, "code" | "hostId" | "guestId"> & {
  members: (Omit<Member, "deckId"> & { hasDeck: boolean })[];
  seat: Seat | -1;
};
export type PublicRoom = PublicInfo &
  (
    | { status: "waiting"; state: LobbyState }
    | { status: "playing" | "finished"; state: GameView }
  );
export type LobbyCommand =
  { type: "start" } | { type: "seat"; seat: Seat; userId: string | null };
export type MutationResponse = {
  error?: string;
  room?: PublicRoom | null;
  deck?: Deck;
  deleted?: boolean;
};
