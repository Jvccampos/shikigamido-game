import type { Cmd, DeckInput } from "./model.js";
import type {
  Deck,
  LobbyCommand,
  MutationResponse,
  PublicRoom,
} from "./room.js";

export type Queries = {
  myDecks: () => Deck[];
  myRooms: () => Pick<PublicRoom, "code" | "status">[];
  room: (code: string) => PublicRoom | null;
};
export type Mutations = {
  saveDeck: (deck: DeckInput & { id?: string }) => MutationResponse;
  deleteDeck: (id: string) => MutationResponse;
  createRoom: (deckId: string) => MutationResponse;
  joinRoom: (
    code: string,
    deckId: string | undefined,
    spectator: boolean,
  ) => MutationResponse;
  lobbyCommand: (code: string, command: LobbyCommand) => MutationResponse;
  gameCommand: (
    code: string,
    command: Cmd,
    revision: number,
  ) => MutationResponse;
};
export type RoomMessage = { type: "room"; room: PublicRoom | null };
