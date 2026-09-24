import { useArenaScene } from "./use-arena-scene.js";
import { ArenaHand } from "./arena-hand.js";
import type { Card } from "../shared/cards.js";
import type { GameView, UnitView } from "../shared/room.js";
import type { Selection } from "./match-interaction.js";
import { OpeningHand, DiscardChoice } from "./choices.js";
import { Journal } from "./journal.js";
import { ElementsGuide } from "./elements-guide.js";
import { TurnTimeline } from "./turn-timeline.js";
import { DuelContext, SetupContext } from "./duel-context.js";
import type { GuideInput } from "./duel-guide.js";
import type { SpellStep } from "./spell-steps.js";
import { layout } from "../shared/arena-layout.js";
import { CombatForecast } from "./combat-preview.js";
import { SearchChoice } from "./search-choice.js";
import type {
  ActionPlan,
  ActionPreview as Preview,
} from "../shared/action-advice.js";
import { pieceName, previewAction } from "../shared/action-advice.js";
import { movementMarker, unitEffects } from "../shared/unit-insight.js";
import { ArenaNotices } from "./arena-notices.js";
import { ValueDelta } from "./value-delta.js";
import { CenterAdvance } from "./center-advance.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Point } from "./arena-scene.js";
import type { DuelPresentationState } from "./use-duel-presentation.js";
import { cards, phases, type Cmd } from "../shared/game.js";
type Props = {
  game: GameView;
  seat: number;
  code: string;
  names: string[];
  highlights: Point[];
  aim: Point | null;
  spellStep?: SpellStep;
  noTargets?: boolean;
  handPlans: ActionPlan[];
  readyAbilities: string[];
  onAbility: (unit: UnitView) => void;
  validTargets: string[];
  preview: Preview | null;
  onAim: (point: Point | null) => void;
  selected: Selection | null;
  targets: string[];
  mulligan: number[];
  startY: number;
  busy: boolean;
  controls: ComponentChildren;
  onExit: () => void;
  onAct: (c: Cmd) => void;
  onHand: (index: number) => void;
  onCell: (x: number, y: number, u?: UnitView) => void;
  onSelect: (u: UnitView) => void;
  onDrag: (data: Selection | null) => void;
  onDrop: (
    x: number,
    y: number,
    u?: UnitView,
    data?: Selection | null,
  ) => Promise<boolean>;
  onFocus: (card: Card | undefined, unit?: UnitView) => void;
  onStartY: (y: number) => void;
  onMulligan: () => void;
  onClear: () => void;
  onConcede: () => void;
  presentation: DuelPresentationState;
};
const elementGlyph: Record<string, string> = {
  agua: "水",
  fogo: "火",
  terra: "地",
  vento: "風",
  vazio: "空",
};
export function Arena(p: Props) {
  const [screen, setScreen] = useState(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const viewport = screen.width;
  const railLeft = Math.min(
    layout(screen.width, screen.height).point(6.85, 3).x + 28,
    viewport - 212,
  );
  const railWidth = Math.min(320, viewport - railLeft - 28);
  // The left column ends where the board's outer portal begins.
  const boardLeft = layout(screen.width, screen.height).point(-0.85, 3).x - 28;
  useEffect(() => {
    const resize = () => setScreen({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const latest = useRef(p);
  latest.current = p;
  const [hoverId, setHoverId] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [elementsOpen, setElementsOpen] = useState(false),
    [timelineOpen, setTimelineOpen] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false),
    [log, setLog] = useState(false),
    [sound, setSound] = useState(
      () => localStorage.getItem("shiki-sound") === "true",
    ),
    [dragging, setDragging] = useState(false);
  const hoveredRef = useRef<UnitView | null>(null);
  const g = p.game,
    me = p.seat >= 0 ? g.players[p.seat] : null,
    opponent = p.seat === 0 ? 1 : 0,
    yourTurn = p.seat === g.priority,
    done = g.winner !== null || g.draw;
  const combatPreview = useMemo(
    () => (g.combat ? previewAction(g, g.priority, { type: "pass" }) : null),
    [g.revision],
  );
  const shownCombat = combatPreview || (p.preview?.combat ? p.preview : null);
  const hover = g.units.find((u) => u.id === hoverId) || null;
  const hoverMarker = hover && !g.setup ? movementMarker(g, hover) : null;
  const reserveBefore = useRef(me?.permanentPe || 0),
    [reserveGain, setReserveGain] = useState(0);
  useEffect(() => {
    if (!me) return;
    const gain = me.permanentPe - reserveBefore.current;
    reserveBefore.current = me.permanentPe;
    if (gain > 0) {
      setReserveGain(gain);
      const timer = setTimeout(() => setReserveGain(0), 1500);
      return () => clearTimeout(timer);
    }
  }, [me?.permanentPe]);
  useEffect(() => {
    // Only open the choice when there is something to convert; otherwise
    // the phase button ends the phase from the board.
    setDiscardOpen(
      g.phase === 4 &&
        yourTurn &&
        !g.setup &&
        !done &&
        !g.stack.length &&
        !g.combat &&
        !g.searches?.length &&
        !!me &&
        me.permanentPe < 3 &&
        me.hand.length > 0,
    );
  }, [
    g.turn,
    g.phase,
    yourTurn,
    g.setup,
    done,
    g.stack.length,
    !!g.combat,
    g.searches?.length,
    me?.permanentPe,
    me?.hand.length,
  ]);
  const { drawing, presenting, visibleUnits } = p.presentation;
  useEffect(() => {
    p.presentation.onOverlays({
      discard: discardOpen,
      elements: elementsOpen || timelineOpen,
      menu,
    });
  }, [
    discardOpen,
    elementsOpen,
    timelineOpen,
    menu,
    p.presentation.onOverlays,
  ]);
  const opening = !!g.setup && !!me && !me.mulligan && !me.ready;
  // The hand is dealt only when the duel begins in this session, not when a
  // match already in progress is opened.
  const sawSetup = useRef(!!g.setup);
  if (g.setup) sawSetup.current = true;
  // Each player's curse portal sits beside one of their two starting seals.
  const portalSeal = p.seat === 1 ? 2 : 4;
  function state() {
    const v = latest.current;
    return {
      game: v.game,
      seat: v.seat,
      highlights: v.highlights,
      aim: v.aim,
      selectedId: v.selected?.unitId,
      targets: v.targets,
      validTargets: v.validTargets,
      readyAbilities: v.readyAbilities,
      onAbility: (u: UnitView) => {
        v.onAbility(u);
      },
      previewPath: v.preview?.error ? undefined : v.preview?.path,
      affected: v.preview?.affected,
      onAim: v.onAim,
      startY: v.startY,
      onCell: (x: number, y: number, u?: UnitView) => v.onCell(x, y, u),
      onSelect: (u: UnitView) => v.onSelect(u),
      onDrop: (x: number, y: number, u?: UnitView, id?: string) =>
        v.onDrop(x, y, u, id ? { kind: "unit", unitId: id } : undefined),
      onPresentation: v.presentation.onScene,
      onInspect: (u: UnitView) => v.onFocus(cards.get(u.cardId), u),
      onHover: (u: UnitView | null) => {
        hoveredRef.current = u;
        setHoverId(u?.id || null);
      },
    };
  }
  const { host, ready, canvasError, cellAt } = useArenaScene(state());
  useEffect(
    () => p.presentation.onReady(ready),
    [ready, p.presentation.onReady],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (["INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName))
        return;
      if (e.key.toLowerCase() === "f") {
        const v = latest.current,
          u = v.game.units.find((u) => u.id === hoveredRef.current?.id);
        if (u) v.onFocus(cards.get(u.cardId), u);
      }
      if (e.key === "Escape") {
        setMenu(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!sound) return;
    const last = g.events?.at(-1);
    if (!last) return;
    try {
      const ctx = new AudioContext(),
        o = ctx.createOscillator(),
        gain = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(
        last.type === "combat" ? 140 : 520,
        ctx.currentTime,
      );
      o.frequency.exponentialRampToValueAtTime(
        last.type === "combat" ? 45 : 260,
        ctx.currentTime + 0.18,
      );
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.connect(gain).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.22);
      o.onended = () => void ctx.close();
    } catch {
      // Audio may be unavailable or blocked by the browser; gameplay continues.
    }
  }, [g.events?.at(-1)?.id, sound]);
  function player(s: number, position: string) {
    const u = (presenting ? visibleUnits : g.units).find(
        (u) => u.kind === "omionji" && u.owner === s,
      ),
      leader = cards.get(`omionji-${g.players[s].element}`),
      v = g.players[s];
    return (
      <div className={`duelist ${position} side-${s}`}>
        <button
          className="duelist-portrait"
          onClick={() => p.onFocus(leader, u)}
          aria-label={`Ler ${leader?.name || "Omionji"}`}
        >
          <img src={leader?.asset} alt={leader?.name} />
          <span
            key={u?.hp ?? 0}
            className="duelist-life"
            aria-label={`Vida: ${u?.hp ?? 0}`}
          >
            <i aria-hidden="true">♥</i>
            {u?.hp ?? 0}
          </span>
          <ValueDelta value={u?.hp ?? 0} />
        </button>
        <div className="duelist-info">
          <small>
            {s === p.seat
              ? "VOCÊ"
              : p.seat < 0
                ? `JOGADOR ${s + 1}`
                : "OPONENTE"}
          </small>
          <b>{p.names[s]}</b>
          <span className="duelist-element">
            {elementGlyph[v.element]} {leader?.name}
          </span>
          <div className="player-resources">
            <div
              className="mana-total"
              aria-label={`${v.pe + v.permanentPe} PE disponíveis. ${v.pe} energia e ${v.permanentPe} reserva.`}
            >
              <b key={`${v.pe}:${v.permanentPe}`}>{v.pe + v.permanentPe}</b>
              <span className="mana-unit">PE</span>
              <ValueDelta value={v.pe + v.permanentPe} />
            </div>
            <div className="mana-pools">
              <div
                className="energy-resource"
                aria-label={`Energia ${v.pe} de ${v.maxPe}. Renova a cada turno.`}
              >
                <span>Energia</span>
                <i className="pips" aria-hidden="true">
                  {Array.from({ length: Math.min(10, v.maxPe) }, (_, i) => (
                    <em key={i} className={i < v.pe ? "lit" : ""} />
                  ))}
                </i>
                <b>
                  {v.pe}
                  <small>/{v.maxPe}</small>
                </b>
              </div>
              <div
                className="reserve-resource"
                aria-label={`Reserva ${v.permanentPe} de 3. Ganha ao descartar cartas e permanece entre turnos.`}
              >
                <span>Reserva</span>
                <i className="pips reserve" aria-hidden="true">
                  {Array.from({ length: 3 }, (_, i) => (
                    <em key={i} className={i < v.permanentPe ? "lit" : ""} />
                  ))}
                </i>
                <b>
                  {v.permanentPe}
                  <small>/3</small>
                </b>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const response = !!(g.combat || g.stack.length);
  const selectedCard =
      p.selected?.kind === "hand" ? cards.get(p.selected.cardId) : null,
    selectedUnit = g.units.find((u) => u.id === p.selected?.unitId);
  const guideInput: GuideInput = {
    selection: selectedCard
      ? {
          name: selectedCard.name,
          kind: selectedCard.kind === "unit" ? "unit" : "spell",
          step: p.spellStep,
          reason:
            p.selected?.kind === "hand" && !p.selected.fromDeck
              ? p.handPlans[p.selected.index]?.reason
              : undefined,
        }
      : selectedUnit
        ? {
            name: pieceName(selectedUnit),
            kind: "piece",
            noTargets: p.noTargets,
          }
        : undefined,
    playableCards: p.handPlans.filter((plan) => !plan?.reason).length,
    readyAbilities: p.readyAbilities.length,
  };
  // Nudge the phase forward once the hand and abilities offer nothing to do.
  const nothingToPlay =
    yourTurn &&
    !response &&
    !g.followup &&
    !presenting &&
    !p.selected &&
    (g.phase === 1 || g.phase === 3) &&
    p.handPlans.every((plan) => plan?.reason) &&
    (g.phase === 1 ? !me?.summonableDeck?.length : !p.readyAbilities.length);
  const resolvingCombat = presenting?.kind === "combat";
  const resolvingSpell = presenting?.kind === "spell";
  const responseContext = response || resolvingCombat || resolvingSpell;
  const actionText = g.followup
    ? "Pular movimento"
    : response
      ? g.stack.length
        ? "Passar resposta"
        : "Permitir combate"
      : [
          "",
          "Concluir invocações",
          "Concluir movimentos",
          "Concluir magias",
          "Concluir descarte",
        ][g.phase] || "Continuar";
  // Say what the main button hands over to, so passing never feels like a leap.
  const actionNext = (() => {
    if (!yourTurn || g.followup) return "";
    if (response)
      return g.passes === 1
        ? g.stack.length
          ? "A magia do topo resolve"
          : "O combate acontece"
        : `${p.names[opponent]} decide em seguida`;
    if (g.phaseOwner === g.first) return `Vez de ${p.names[opponent]}`;
    return g.phase < 4
      ? `Próximo: ${phases[g.phase + 1]}`
      : "Próximo: novo turno";
  })();
  return (
    <section
      aria-busy={p.busy || !ready}
      className={`arena-shell ${g.setup ? "preparing-position" : ""} ${opening ? "choosing-hand" : ""} ${drawing ? "drawing" : ""} ${responseContext ? "response-mode" : ""} ${presenting ? "presenting" : ""}`}
      aria-label="Partida de Shikigamido"
      style={{
        "--action-rail-left": `${railLeft}px`,
        "--action-rail-width": `${railWidth}px`,
        "--board-left": `${boardLeft}px`,
      }}
    >
      <div className="arena-environment" />
      <div className="arena-vignette" />
      <div className="arena-dust" />
      <div
        ref={host}
        className="arena-canvas"
        onContextMenu={(e) => e.preventDefault()}
      />
      {canvasError && <div className="arena-error">{canvasError}</div>}
      <div className="arena-top">
        <button
          className="arena-menu stud"
          onClick={() => setMenu(!menu)}
          aria-label="Menu da partida"
          aria-expanded={menu}
          data-tip="Menu"
        >
          <span className="glyph" aria-hidden="true">
            式
          </span>
        </button>
        <span className="arena-wordmark">
          Shikigamido
          <span className="arena-room">
            {p.code === "TREINO" ? "Treino" : `Sala ${p.code}`}
          </span>
        </span>
        <div className="arena-tools">
          <button
            className="arena-tool stud elements-toggle"
            aria-label="Vantagens elementais"
            data-tip="Elementos"
            onClick={() => setElementsOpen(true)}
          >
            <ToolIcon d="m12 2 10 7-4 12H6L2 9 12 2Zm0 0 6 19L2 9h20L6 21 12 2Z" />
          </button>
          <button
            className="arena-tool stud timeline-toggle"
            aria-label="Linha do tempo de turnos"
            data-tip="Turnos"
            disabled={done}
            onClick={() => setTimelineOpen(true)}
          >
            <ToolIcon d="M3 12h18M6 8v8M12 8v8M18 8v8" />
          </button>
          <button
            className={`arena-tool stud history-toggle ${log ? "on" : ""}`}
            aria-label="Abrir histórico"
            aria-pressed={log}
            data-tip="Histórico"
            onClick={() => setLog(!log)}
          >
            <ToolIcon d="M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4" />
          </button>
          <button
            className={`arena-tool stud arena-audio ${sound ? "on" : ""}`}
            aria-label={sound ? "Desativar som" : "Ativar som"}
            aria-pressed={sound}
            data-tip={sound ? "Som ligado" : "Som desligado"}
            onClick={() => {
              setSound(!sound);
              localStorage.setItem("shiki-sound", String(!sound));
            }}
          >
            <ToolIcon
              d={
                sound
                  ? "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"
                  : "M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"
              }
            />
          </button>
        </div>
      </div>
      {player(opponent, "duelist-opponent")}
      {p.seat >= 0 && player(p.seat, "duelist-self")}
      {p.seat < 0 && player(1, "duelist-self")}
      <div className={`arena-phase ${yourTurn ? "active" : ""}`}>
        {!g.setup ? (
          <DuelContext
            game={g}
            seat={p.seat}
            names={p.names}
            presenting={
              presenting?.label ||
              (drawing ? "Compra automática · uma carta vem para a mão" : null)
            }
            input={guideInput}
          />
        ) : (
          <SetupContext
            step={opening ? 1 : 2}
            waiting={!me || !!me.ready}
            spectator={!me}
          />
        )}
      </div>
      <div
        className="opponent-hand"
        aria-label={`${g.players[opponent].handCount ?? g.players[opponent].hand.length} cartas na mão do oponente`}
      >
        {Array.from(
          {
            length: Math.min(
              g.players[opponent].handCount ?? g.players[opponent].hand.length,
              12,
            ),
          },
          (_, i) => (
            <i key={i} style={{ "--i": i }}>
              <span>式</span>
            </i>
          ),
        )}
        <b
          className="opponent-hand-count"
          key={g.players[opponent].handCount ?? g.players[opponent].hand.length}
        >
          {g.players[opponent].handCount ?? g.players[opponent].hand.length}
        </b>
      </div>
      <button
        className="arena-deck"
        onClick={() => setLog(!log)}
        aria-label="Baralho e descarte"
      >
        <i />
        <i />
        <span>式</span>
        <b>{me ? (me.libraryCount ?? me.library.length) : "▤"}</b>
      </button>
      {!g.setup && !g.centerPending && !done && (
        <button
          className={`arena-pass ${yourTurn ? "enabled" : ""} ${nothingToPlay ? "suggested" : ""}`}
          disabled={
            !yourTurn ||
            p.busy ||
            !!g.duel ||
            drawing ||
            !!presenting ||
            !!g.searches?.length
          }
          onClick={() => p.onAct({ type: "pass" })}
        >
          <span>
            {presenting
              ? "Resolvendo…"
              : yourTurn
                ? actionText
                : `Vez de ${p.names[g.priority]}`}
            {yourTurn && !presenting && actionNext && (
              <small>{actionNext}</small>
            )}
          </span>
          <b>➜</b>
        </button>
      )}
      {opening && me && (
        <OpeningHand
          onExit={p.onExit}
          hand={me.hand}
          selected={p.mulligan}
          onSelect={p.onHand}
          onFocus={p.onFocus}
          disabled={p.busy}
          label="Trocar"
          first={p.names[g.first]}
          onConfirm={p.onMulligan}
        />
      )}
      {g.setup && me && !opening && !me.ready && (
        <section className="position-guide plaque" aria-label="Posição inicial">
          <small className="rune-label">Seu Omionji começa em</small>
          <div className="position-options" role="radiogroup">
            {([2, 4] as const).map((y) => (
              <button
                key={y}
                role="radio"
                aria-checked={p.startY === y}
                className={p.startY === y ? "active" : ""}
                onClick={() => p.onStartY(y)}
              >
                <b>{y === 2 ? "A" : "B"}</b>
                <span>{y === 2 ? "Selo superior" : "Selo inferior"}</span>
                {y === portalSeal && (
                  <em>
                    Perto do portal <span className="glyph">禍</span>
                  </em>
                )}
              </button>
            ))}
          </div>
          <p className="position-note">
            No turno 3 uma maldição surge no seu portal{" "}
            <span className="glyph">禍</span> e avança até o Omionji mais
            próximo. O selo {portalSeal === 2 ? "A" : "B"} fica no caminho dela.
          </p>
          <button
            className="choice-confirm"
            disabled={p.busy}
            onClick={() => p.onAct({ type: "ready", y: p.startY })}
          >
            Começar no selo {p.startY === 2 ? "A" : "B"} →
          </button>
          <small className="position-hint">
            Você também pode clicar nos selos do tabuleiro.
          </small>
        </section>
      )}
      {me && !g.setup && (
        <ArenaHand
          game={g}
          seat={p.seat}
          selected={p.selected}
          handPlans={p.handPlans}
          busy={p.busy}
          viewport={viewport}
          railLeft={railLeft}
          deal={sawSetup.current}
          obscured={discardOpen || !!presenting}
          cellAt={cellAt}
          onAim={p.onAim}
          onDrop={p.onDrop}
          onDrag={p.onDrag}
          onHand={p.onHand}
          onFocus={p.onFocus}
          onDiscard={() => setDiscardOpen(true)}
          onHover={() => {
            hoveredRef.current = null;
            setHoverId(null);
          }}
          onDragging={setDragging}
        />
      )}
      {!g.setup && !discardOpen && !presenting && shownCombat?.combat && (
        <CombatForecast preview={shownCombat} game={g} />
      )}
      {me &&
        g.phase === 4 &&
        yourTurn &&
        !g.setup &&
        !done &&
        me.permanentPe < 3 &&
        me.hand.length > 0 && (
          <button className="open-discard" onClick={() => setDiscardOpen(true)}>
            <span>✦</span>
            <b>Converter cartas</b>
            <small>Ganhe energia de reserva</small>
          </button>
        )}
      {discardOpen && me && g.phase === 4 && yourTurn && !done && !response && (
        <DiscardChoice
          game={g}
          seat={p.seat}
          busy={p.busy}
          onAct={p.onAct}
          onClose={() => setDiscardOpen(false)}
          onFocus={p.onFocus}
        />
      )}
      {drawing && me && (
        <div className="draw-flight" aria-hidden="true">
          <img src={cards.get(me.hand.at(-1)!)?.asset} alt="" />
        </div>
      )}
      {reserveGain > 0 && (
        <div className="reserve-gain" role="status">
          +{reserveGain} Reserva
        </div>
      )}
      {hover && !dragging && !discardOpen && (
        <div className="arena-hover plaque">
          <b>
            {cards.get(hover.cardId)?.name ||
              (hover.kind === "crystal"
                ? "Cristal de invocação"
                : hover.kind === "curse"
                  ? `Maldição nível ${hover.level}`
                  : "Carta oculta")}
          </b>
          <div className="hover-effects">
            {hoverMarker && (
              <span className={`hover-marker ${hoverMarker.state}`}>
                {hoverMarker.symbol} {hoverMarker.label}
              </span>
            )}
            {p.readyAbilities.includes(hover.id) && (
              <span>✦ Habilidade disponível</span>
            )}
            {unitEffects(hover)
              .slice(0, 3)
              .map((entry) => (
                <span key={entry.label} title={entry.detail}>
                  {entry.label}
                </span>
              ))}
          </div>
        </div>
      )}
      <div className="arena-action-rail">
        {g.centerPending && me && (
          <CenterAdvance
            game={g}
            seat={p.seat}
            selected={selectedUnit}
            busy={p.busy}
            onAct={p.onAct}
            onClear={p.onClear}
          />
        )}
        {!g.setup &&
          !g.centerPending &&
          !discardOpen &&
          !presenting &&
          !g.searches?.length &&
          p.controls}
        {response &&
          (!shownCombat ||
            g.stack.length > 0 ||
            (p.preview && !p.preview.combat && !p.preview.error)) && (
            <aside
              className="arena-stack-panel"
              aria-label="Pilha de respostas"
            >
              <div className="action-dock-head">
                <div className="action-card-title">
                  <small>
                    {g.stack.length ? "PILHA DE MAGIAS" : "COMBATE"}
                  </small>
                  <b>
                    {g.stack.length
                      ? g.stack.length === 1
                        ? "Uma magia aguarda"
                        : `${g.stack.length} magias aguardam`
                      : "Combate anunciado"}
                  </b>
                </div>
              </div>
              {g.combat && !shownCombat && (
                <div className="pending-combat">
                  <span>
                    {cards.get(
                      g.units.find((u) => u.id === g.combat?.attackerId)
                        ?.cardId || "",
                    )?.name || "Unidade"}
                  </span>
                  <b>→</b>
                  <span>
                    {cards.get(
                      g.units.find((u) => u.id === g.combat?.defenderId)
                        ?.cardId || "",
                    )?.name || "Unidade"}
                  </span>
                </div>
              )}
              <div className="stack-list">
                {[...g.stack].reverse().map((entry, i) => {
                  const c = cards.get(entry.cardId)!;
                  return (
                    <button
                      className="stack-card"
                      key={`${entry.cardId}-${i}`}
                      onClick={() => p.onFocus(c)}
                    >
                      <img src={c.asset} alt="" />
                      <div>
                        <small>
                          {i === 0 ? "Resolve primeiro" : `Depois · ${i + 1}ª`}
                        </small>
                        <b>{c.name}</b>
                        <span className={`stack-owner seat-${entry.seat}`}>
                          {entry.seat === p.seat ? "Sua" : p.names[entry.seat]}{" "}
                          · {c.stats.speed === "fast" ? "Rápida" : "Lenta"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="stack-rule">
                {g.passes === 1
                  ? `${1 - g.priority === p.seat ? "Você" : p.names[1 - g.priority]} passou. Se ${yourTurn ? "você também passar" : `${p.names[g.priority]} também passar`}, ${g.stack.length ? "a magia do topo resolve" : "o combate acontece"}.`
                  : g.stack.length
                    ? "Magias rápidas podem responder. Quando os dois passam seguidos, a primeira da lista resolve."
                    : "Os dois jogadores podem responder com magias rápidas antes do dano."}
              </p>
            </aside>
          )}
      </div>
      <TurnTimeline
        game={g}
        names={p.names}
        open={timelineOpen}
        onOpen={() => setTimelineOpen(true)}
        onClose={() => setTimelineOpen(false)}
      />
      {!done && !presenting && !drawing && g.searches?.[0]?.seat === p.seat && (
        <SearchChoice
          key={g.searches[0].id}
          search={g.searches[0]}
          busy={p.busy}
          onAct={p.onAct}
          onFocus={p.onFocus}
        />
      )}
      <ArenaNotices
        notice={p.presentation.notice}
        leaving={p.presentation.noticeLeaving}
      />
      {elementsOpen && <ElementsGuide onClose={() => setElementsOpen(false)} />}
      {menu && (
        <div
          className="arena-menu-backdrop"
          aria-hidden="true"
          onClick={() => setMenu(false)}
        />
      )}
      {menu && (
        <div
          className="arena-menu-panel plaque"
          role="dialog"
          aria-label="Menu da partida"
        >
          <span className="rune-label">
            {p.code === "TREINO" ? "Treino" : `Sala ${p.code}`} · Turno {g.turn}
          </span>
          <h2>Shikigamido</h2>
          <button autoFocus onClick={() => setMenu(false)}>
            Continuar duelo
          </button>
          <button
            onClick={() => {
              void host.current?.parentElement
                ?.requestFullscreen?.()
                .catch(() => {});
              setMenu(false);
            }}
          >
            Tela cheia
          </button>
          <button
            onClick={() => {
              setLog(true);
              setMenu(false);
            }}
          >
            Histórico da partida
          </button>
          <button onClick={p.onExit}>Voltar ao santuário</button>
          {me && !done && (
            <button
              className="menu-danger"
              onClick={() => {
                setMenu(false);
                p.onConcede();
              }}
            >
              Conceder partida
            </button>
          )}
        </div>
      )}
      {log && (
        <Journal
          game={g}
          names={p.names}
          seat={p.seat}
          onClose={() => setLog(false)}
          onFocus={p.onFocus}
        />
      )}
      {done && p.presentation.resultReady && (
        <div
          className={`arena-victory ${g.draw ? "draw" : g.winner === p.seat ? "won" : p.seat >= 0 ? "lost" : "watched"}`}
        >
          <small className="rune-label">
            O duelo terminou · Turno {g.turn}
          </small>
          {!g.draw && (
            <div
              className="victory-portrait"
              aria-hidden="true"
              style={{
                backgroundImage: `url(${cards.get(`omionji-${g.players[g.winner!].element}`)?.asset})`,
              }}
            />
          )}
          <h1>
            {g.draw
              ? "Empate"
              : g.winner === p.seat
                ? "Vitória"
                : p.seat >= 0
                  ? "Derrota"
                  : `${p.names[g.winner!]} venceu`}
          </h1>
          <p>
            {g.draw
              ? "Os dois Omionjis caíram."
              : p.seat >= 0 && g.winner !== p.seat
                ? `${p.names[g.winner!]} venceu. O santuário aguarda sua revanche.`
                : "O santuário reconhece seu vencedor."}
          </p>
          <button className="seal-button" onClick={p.onExit}>
            Retornar ao santuário
          </button>
        </div>
      )}
      <div className="arena-accessibility" aria-label="Casas do tabuleiro">
        {g.units.map((u) => (
          <button key={u.id} onClick={() => p.onCell(u.x, u.y, u)}>
            {cards.get(u.cardId)?.name || u.cardId}: {u.hp} vida em {u.x + 1},
            {u.y + 1}
          </button>
        ))}
      </div>
    </section>
  );
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
