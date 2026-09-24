import type { GameView, UnitView } from "../shared/room.js";
import { phases } from "../shared/game.js";

export type Presentation = {
  kind: "summon" | "move" | "combat" | "cast" | "spell";
  label: string;
};
export type PhaseNotice = {
  key: string;
  title: string;
  detail: string;
  mana: string;
};
export type ArenaOverlays = {
  discard: boolean;
  elements: boolean;
  menu: boolean;
};

// Keep the exit duration in sync with duel-hud.css.
const readingMs = 2800,
  exitMs = 450,
  drawMs = 950;

/** Sequences board settlement, card draws and phase notices for one match.
 * The caller supplies time; neither the DOM nor the animation clock lives here.
 */
export class DuelPresentation {
  private game!: GameView;
  private previous?: {
    stage: string;
    max: number;
    hand: number;
    library: number;
  };
  private ready = false;
  private overlays: ArenaOverlays = {
    discard: false,
    elements: false,
    menu: false,
  };
  private settledRevision?: number;
  private units: UnitView[] = [];
  private presenting: Presentation | null = null;
  private drawUntil: number | null = null;
  private pending: PhaseNotice | null = null;
  private displayed: {
    notice: PhaseNotice;
    leaving: boolean;
    until: number;
  } | null = null;

  update(game: GameView, seat: number, names: string[], now: number) {
    this.game = game;
    const player = game.players[seat < 0 ? 0 : seat];
    const stage = `${game.turn}:${game.phase}:${game.phaseOwner}:${!!game.setup}:${!!game.centerPending}`;
    const before = this.previous;
    const library = player.libraryCount ?? player.library.length;
    const gain = !!before && player.maxPe > before.max;
    if (!before) {
      this.units = game.units;
      this.settledRevision = game.revision;
    }
    if (
      seat >= 0 &&
      before &&
      !game.setup &&
      player.hand.length > before.hand &&
      library < before.library
    )
      this.drawUntil = now + drawMs;
    this.previous = {
      stage,
      max: player.maxPe,
      hand: player.hand.length,
      library,
    };

    // The discard dialog already announces the player's choice. Never defer a
    // duplicate banner until they return to the board.
    if (
      game.setup ||
      game.winner !== null ||
      game.draw ||
      (game.phase === 4 && game.phaseOwner === seat && !game.centerPending)
    ) {
      this.pending = null;
    } else if (before?.stage !== stage || gain) {
      const yours = game.phaseOwner === seat,
        newTurn = game.phase === 1 && game.phaseOwner === game.first;
      // The turn bar already tracks the opponent's half-phases. Interrupt the
      // board only when control reaches you, a turn begins or something changes.
      this.pending =
        yours || newTurn || gain || game.centerPending
          ? {
              key: stage,
              title: game.centerPending
                ? "O centro se abriu"
                : `${yours ? "Sua vez" : names[game.phaseOwner ?? game.priority]} · ${phases[game.phase]}`,
              detail: game.centerPending
                ? "Escolha uma unidade para avançar em segredo."
                : yours
                  ? [
                      "Uma nova carta vem para sua mão.",
                      "Invoque criaturas nos selos junto aos seus cristais.",
                      "Mova suas unidades. Os dois primeiros movimentos são grátis.",
                      "Conjure magias ou use as habilidades das suas unidades.",
                      "Converta cartas em reserva ou mantenha sua mão.",
                    ][game.phase]
                  : `Novo turno. ${names[game.phaseOwner ?? game.priority]} começa.`,
              mana: gain
                ? `Mana máxima aumentou para ${player.maxPe} PE!`
                : this.pending?.mana || "",
            }
          : null;
    }
    this.advance(now);
  }

  scene(
    presentation: Presentation | null,
    units: UnitView[] | undefined,
    revision: number | undefined,
    now: number,
  ) {
    const changed =
      this.presenting !== presentation ||
      (units !== undefined &&
        (this.units !== units || this.settledRevision !== revision));
    this.presenting = presentation;
    if (units) {
      this.units = units;
      this.settledRevision = revision;
    }
    this.advance(now);
    return changed;
  }

  sceneReady(ready: boolean, now: number) {
    this.ready = ready;
    this.advance(now);
  }

  showOverlays(overlays: ArenaOverlays, now: number) {
    this.overlays = overlays;
    this.advance(now);
  }

  dismiss(now: number) {
    if (this.displayed && !this.displayed.leaving && !this.waiting)
      this.exit(now);
  }

  advance(now: number) {
    if (this.drawUntil !== null && now >= this.drawUntil) this.drawUntil = null;
    if (this.displayed?.leaving && now >= this.displayed.until) {
      if (this.pending?.key === this.displayed.notice.key) this.pending = null;
      this.displayed = null;
    }
    if (
      this.displayed &&
      !this.displayed.leaving &&
      (this.waiting ||
        !this.pending ||
        this.displayed.notice.key !== this.pending.key ||
        now >= this.displayed.until)
    )
      this.exit(now);
    if (!this.displayed && this.pending && !this.waiting)
      this.displayed = {
        notice: this.pending,
        leaving: false,
        until: now + readingMs,
      };
  }

  private exit(now: number) {
    if (this.displayed)
      this.displayed = {
        ...this.displayed,
        leaving: true,
        until: now + exitMs,
      };
  }

  private get inputBlocked() {
    return (
      !this.ready ||
      !!this.presenting ||
      this.drawUntil !== null ||
      this.settledRevision !== this.game.revision
    );
  }

  private get waiting() {
    return (
      this.inputBlocked ||
      Object.values(this.overlays).some(Boolean) ||
      !!this.game.searches?.length
    );
  }

  get view() {
    const deadlines = [this.drawUntil, this.displayed?.until].filter(
      (n): n is number => n != null,
    );
    return {
      presenting: this.presenting,
      drawing: this.drawUntil !== null,
      visibleUnits: this.units,
      inputBlocked: this.inputBlocked,
      // Searches must finish before a queued notice can appear. Let the bot
      // answer its search instead of waiting for that notice indefinitely.
      automationBlocked:
        this.inputBlocked ||
        !!this.displayed ||
        (!!this.pending && !this.game.searches?.length),
      resultReady: !this.inputBlocked,
      notice: this.displayed?.notice ?? null,
      noticeLeaving: this.displayed?.leaving ?? false,
      noticeDismissible:
        !!this.displayed && !this.displayed.leaving && !this.waiting,
      nextDeadline: deadlines.length ? Math.min(...deadlines) : null,
    };
  }
}
