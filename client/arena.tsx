import type { Selection } from "./match-interaction.js";
import { OpeningHand, DiscardChoice } from "./choices.js";
import { Journal } from "./journal.js";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { ArenaScene, type Point } from "./arena-scene.js";
import {
  cards,
  phases,
  type Game,
  type Unit,
  type Cmd,
} from "../shared/game.js";
type Props = {
  game: Game;
  seat: number;
  code: string;
  names: string[];
  highlights: Point[];
  selected: Selection | null;
  targets: string[];
  mulligan: number[];
  startY: number;
  busy: boolean;
  controls: ComponentChildren;
  onExit: () => void;
  onAct: (c: Cmd) => void;
  onHand: (index: number) => void;
  onCell: (x: number, y: number, u?: Unit) => void;
  onSelect: (u: Unit) => void;
  onDrag: (data: Selection | null) => void;
  onDrop: (x: number, y: number, u?: Unit, data?: Selection | null) => void;
  onFocus: (card: any, unit?: Unit) => void;
  onStartY: (y: number) => void;
  onMulligan: () => void;
  onClear: () => void;
  onConcede: () => void;
  onPresentationBusy: (busy: boolean) => void;
};
const elementGlyph: Record<string, string> = {
  agua: "水",
  fogo: "火",
  terra: "地",
  vento: "風",
  vazio: "空",
};
export function Arena(p: Props) {
  const [viewport, setViewport] = useState(() => innerWidth);
  useEffect(() => {
    const resize = () => setViewport(innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<ArenaScene | null>(null),
    latest = useRef(p);
  latest.current = p;
  const [ready, setReady] = useState(false),
    [hover, setHover] = useState<Unit | null>(null),
    [handHover, setHandHover] = useState<number | null>(null),
    [drawer, setDrawer] = useState(false),
    [menu, setMenu] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false),
    [drawing, setDrawing] = useState(false),
    [presenting, setPresenting] = useState<string | null>(null),
    [visibleUnits, setVisibleUnits] = useState<Unit[]>(p.game.units),
    [settledRevision, setSettledRevision] = useState(p.game.revision),
    [log, setLog] = useState(false),
    [sound, setSound] = useState(
      () => localStorage.getItem("shiki-sound") === "true",
    ),
    [dragging, setDragging] = useState<{
      index: number;
      x: number;
      y: number;
      moving: boolean;
    } | null>(null),
    [canvasError, setCanvasError] = useState("");
  const hoveredRef = useRef<Unit | null>(null),
    handHoverRef = useRef<number | null>(null);
  const dragRef = useRef(dragging);
  dragRef.current = dragging;
  const g = p.game,
    me = p.seat >= 0 ? g.players[p.seat] : null,
    opponent = p.seat === 0 ? 1 : 0,
    yourTurn = p.seat === g.priority,
    done = g.winner !== null || g.draw,
    card = p.selected?.kind === "hand" ? cards.get(p.selected?.cardId) : null;
  const previousHand = useRef<{
    count: number;
    library: number;
    turn: number;
  } | null>(null);
  const reserveBefore = useRef(me?.permanentPe || 0),
    [reserveGain, setReserveGain] = useState(0);
  useEffect(() => {
    if (!me) return;
    const before = previousHand.current,
      library = (me as any).libraryCount ?? me.library.length;
    previousHand.current = { count: me.hand.length, library, turn: g.turn };
    if (
      before &&
      !g.setup &&
      me.hand.length > before.count &&
      library < before.library
    ) {
      setDrawing(true);
      const timer = setTimeout(() => setDrawing(false), 950);
      return () => clearTimeout(timer);
    }
  }, [me?.hand.length, g.turn, g.setup]);
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
    setDiscardOpen(
      g.phase === 4 &&
        yourTurn &&
        !g.setup &&
        !done &&
        !g.stack.length &&
        !g.combat,
    );
  }, [g.turn, g.phase, yourTurn, g.setup, done, g.stack.length, !!g.combat]);
  useEffect(
    () => p.onPresentationBusy(!!presenting || drawing),
    [presenting, drawing],
  );
  const opening = !!g.setup && !!me && !me.mulligan && !me.ready;
  function state() {
    const v = latest.current;
    return {
      game: v.game,
      seat: v.seat,
      highlights: v.highlights,
      selectedId: v.selected?.unitId,
      targets: v.targets,
      startY: v.startY,
      onCell: (x: number, y: number, u?: Unit) => v.onCell(x, y, u),
      onSelect: (u: Unit) => v.onSelect(u),
      onDrop: (x: number, y: number, u?: Unit, id?: string) =>
        v.onDrop(x, y, u, id ? { kind: "unit", unitId: id } : undefined),
      onPresentation: (label: string | null, units?: Unit[]) => {
        setPresenting(label);
        if (units) {
          setVisibleUnits(units);
          setSettledRevision(latest.current.game.revision);
        }
      },
      onInspect: (u: Unit) => v.onFocus(cards.get(u.cardId), u),
      onHover: (u: Unit | null) => {
        hoveredRef.current = u;
        if (u) handHoverRef.current = null;
        setHover(u);
      },
    };
  }
  useEffect(() => {
    let closed = false;
    const engine = new ArenaScene();
    scene.current = engine;
    engine
      .init(host.current!, state())
      .then(() => {
        if (!closed) setReady(true);
      })
      .catch(() =>
        setCanvasError(
          "Não foi possível iniciar a arena gráfica. Ative a aceleração de hardware do navegador e recarregue.",
        ),
      );
    return () => {
      closed = true;
      engine.destroy();
      latest.current.onPresentationBusy(false);
    };
  }, []);
  useEffect(() => {
    if (ready) scene.current?.update(state());
  }, [ready, g, p.highlights, p.selected, p.targets, p.startY]);
  useEffect(() => {
    if (card?.kind === "spell" || g.duel) setDrawer(true);
    if (!p.selected && !g.duel) setDrawer(false);
  }, [card?.id, !!g.duel, !!p.selected, p.targets.join("|")]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["INPUT", "SELECT"].includes((e.target as HTMLElement)?.tagName))
        return;
      if (e.key.toLowerCase() === "f") {
        const v = latest.current,
          u = hoveredRef.current,
          i = handHoverRef.current;
        if (u) v.onFocus(cards.get(u.cardId), u);
        else if (i !== null && v.seat >= 0 && v.game.players[v.seat].hand[i])
          v.onFocus(cards.get(v.game.players[v.seat].hand[i]));
      }
      if (e.key === "Escape") {
        setDrawer(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hover, handHover, me]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = {
        ...d,
        x: e.clientX,
        y: e.clientY,
        moving: d.moving || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5,
      };
      dragRef.current = next;
      setDragging(next);
    };
    const end = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDragging(null);
      const v = latest.current;
      if (d.moving) {
        const rect = host.current!.getBoundingClientRect(),
          cell = scene.current?.cellAt(
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
        if (cell)
          v.onDrop(
            cell.x,
            cell.y,
            v.game.units.find((u) => u.x === cell.x && u.y === cell.y),
            {
              kind: "hand",
              cardId: v.game.players[v.seat].hand[d.index],
              index: d.index,
            },
          );
        else if (
          cards.get(v.game.players[v.seat].hand[d.index])?.kind === "spell"
        )
          setDrawer(true);
      } else if (v.game.phase === 4 && v.game.priority === v.seat)
        setDiscardOpen(true);
      else v.onHand(d.index);
      v.onDrag(null);
    };
    const cancel = () => {
      dragRef.current = null;
      setDragging(null);
      latest.current.onDrag(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
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
      v = g.players[s] as any;
    return (
      <div className={`duelist ${position} side-${s}`}>
        <button
          className="duelist-portrait"
          onClick={() => p.onFocus(leader, u)}
          title={leader?.name}
        >
          <img src={leader?.asset} alt={leader?.name} />
          <span
            className="duelist-life"
            title="Vida do Omionji"
            aria-label={`Vida: ${u?.hp ?? 0}`}
          >
            ♥ {u?.hp ?? 0}
          </span>
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
              className="energy-resource"
              title="Energia elemental (PE): renova no início de cada turno."
            >
              <span>Energia</span>
              <b>
                {v.pe}
                <small> / {v.maxPe}</small>
              </b>
              <em>renova por turno</em>
            </div>
            <div
              className="reserve-resource"
              title="Reserva: ganha ao descartar cartas. Permanece entre turnos e é consumida ao pagar custos."
            >
              <span>Reserva</span>
              <b>
                {v.permanentPe}
                <small> / 3</small>
              </b>
              <em>guardada entre turnos</em>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const response = !!(g.combat || g.stack.length);
  const resolvingCombat = !!presenting?.includes("resolvendo dano");
  const resolvingSpell = !!presenting?.endsWith(" resolve");
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
  const instruction = g.setup
    ? ""
    : g.centerPending
      ? "Escolha seu avanço em segredo."
      : presenting
        ? "Acompanhe a resolução no tabuleiro."
        : response
          ? yourTurn
            ? "Jogue uma magia rápida ou instantânea, ou passe sua resposta."
            : `${p.names[g.priority]} pode responder antes da resolução.`
          : yourTurn
            ? [
                "",
                "Arraste uma criatura até um selo iluminado.",
                `Arraste suas unidades. Movimentos grátis restantes: ${Math.max(0, 2 - (g.moveCounts?.[p.seat] || 0))}.`,
                "Arraste uma magia até o alvo ou ative uma habilidade.",
                "Converta cartas em Reserva ou mantenha sua mão.",
              ][g.phase]
            : `Aguarde ${p.names[g.priority]} concluir esta etapa.`;
  const turnText = resolvingCombat
    ? "Resolvendo combate"
    : resolvingSpell
      ? "Resolvendo magia"
      : g.setup
        ? "Prepare seu espírito"
        : g.centerPending
          ? "O centro se abriu"
          : g.followup
            ? "Movimento adicional"
            : g.duel
              ? "Escolha do duelo"
              : response
                ? yourTurn
                  ? "Sua resposta"
                  : "Resposta do oponente"
                : yourTurn
                  ? "Sua vez"
                  : `Vez de ${p.names[g.priority]}`;
  return (
    <section
      aria-busy={p.busy || !ready}
      className={`arena-shell ${g.setup ? "preparing-position" : ""} ${opening ? "choosing-hand" : ""} ${drawing ? "drawing" : ""} ${responseContext ? "response-mode" : ""} ${presenting ? "presenting" : ""}`}
      aria-label="Partida de Shikigamido"
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
          className="arena-menu"
          onClick={() => setMenu(!menu)}
          aria-label="Menu da partida"
        >
          ☰
        </button>
        <span className="arena-wordmark">SHIKIGAMIDO</span>
        <span className="arena-room">
          {p.code === "TREINO" ? "TREINO" : `SALA ${p.code}`}
        </span>
        <button
          className="history-toggle"
          aria-label="Abrir histórico"
          onClick={() => setLog(!log)}
        >
          ◷
        </button>
        <button
          className="arena-audio"
          aria-label={sound ? "Desativar som" : "Ativar som"}
          onClick={() => {
            setSound(!sound);
            localStorage.setItem("shiki-sound", String(!sound));
          }}
        >
          {sound ? "♪" : "♫"}
        </button>
      </div>
      {player(opponent, "duelist-opponent")}
      {p.seat >= 0 && player(p.seat, "duelist-self")}
      {p.seat < 0 && player(1, "duelist-self")}
      <div className={`arena-phase ${yourTurn ? "active" : ""}`}>
        <small>
          TURNO {String(g.turn).padStart(2, "0")} ·{" "}
          {g.setup
            ? "PREPARAÇÃO"
            : drawing
              ? "COMPRA AUTOMÁTICA"
              : phases[g.phase].toUpperCase()}
        </small>
        <h1>{drawing ? "Uma nova carta, novos caminhos" : turnText}</h1>
        <div className="phase-steps">
          {(responseContext
            ? [
                g.combat || resolvingCombat ? "Ataque" : "Conjuração",
                "Respostas",
                "Resolução",
              ]
            : phases.slice(1)
          ).map((phase, i) => (
            <span
              key={phase}
              className={
                (
                  responseContext
                    ? i === (resolvingCombat || resolvingSpell ? 2 : 1)
                    : i === g.phase - 1
                )
                  ? "current"
                  : ""
              }
            >
              {phase}
            </span>
          ))}
        </div>
        {!g.setup && (
          <p className="phase-instruction" role="status">
            {instruction}
          </p>
        )}
      </div>
      <div
        className="opponent-hand"
        aria-label={`${(g.players[opponent] as any).handCount ?? g.players[opponent].hand.length} cartas na mão do oponente`}
      >
        {Array.from(
          {
            length: Math.min(
              (g.players[opponent] as any).handCount ??
                g.players[opponent].hand.length,
              12,
            ),
          },
          (_, i) => (
            <i key={i} style={{ "--i": i }}>
              <span>式</span>
            </i>
          ),
        )}
      </div>
      <button
        className="arena-deck"
        onClick={() =>
          (me as any)?.summonableDeck?.length && g.phase === 1
            ? setDrawer(true)
            : setLog(!log)
        }
        title="Baralho e descarte"
      >
        <i />
        <i />
        <span>式</span>
        <b>{me ? ((me as any).libraryCount ?? me.library.length) : "▤"}</b>
      </button>
      {!g.setup && !g.centerPending && !done && (
        <button
          className={`arena-pass ${yourTurn ? "enabled" : ""}`}
          disabled={!yourTurn || p.busy || !!g.duel || drawing || !!presenting}
          onClick={() => p.onAct({ type: "pass" })}
        >
          <span>
            {presenting
              ? "Resolvendo…"
              : yourTurn
                ? actionText
                : "Aguardando oponente"}
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
        <section className="position-guide">
          <small>PREPARAÇÃO · 2 DE 2</small>
          <h2>Escolha onde começar</h2>
          <p>
            Toque em um dos dois selos iluminados para posicionar seu Omionji.
          </p>
          <div className="position-options">
            <button
              className={p.startY === 2 ? "active" : ""}
              onClick={() => p.onStartY(2)}
            >
              A <span>Selo superior</span>
            </button>
            <button
              className={p.startY === 4 ? "active" : ""}
              onClick={() => p.onStartY(4)}
            >
              B <span>Selo inferior</span>
            </button>
          </div>
          <button
            className="choice-confirm"
            disabled={p.busy}
            onClick={() => p.onAct({ type: "ready", y: p.startY })}
          >
            Começar neste selo →
          </button>
        </section>
      )}
      {g.setup && (!me || me.ready) && (
        <div className="preparation-wait">
          <span className="waiting-pulse" />
          <b>{me ? "Tudo pronto" : "Preparação da partida"}</b>
          <p>
            {me
              ? "Aguardando o oponente escolher seu selo…"
              : "Os jogadores estão escolhendo suas mãos e posições."}
          </p>
        </div>
      )}
      {g.centerPending && me && (
        <div className="arena-preparation">
          <p>
            Selecione uma unidade no campo. As escolhas serão reveladas juntas.
          </p>
          <button
            className="ready-button"
            disabled={p.busy || Object.hasOwn(g.centerChoices || {}, p.seat)}
            onClick={() =>
              p.onAct({ type: "center", unitId: p.selected?.unitId })
            }
          >
            {Object.hasOwn(g.centerChoices || {}, p.seat)
              ? "Escolha confirmada"
              : p.selected?.unitId
                ? "Confirmar avanço"
                : "Não avançar"}
          </button>
        </div>
      )}
      {me && !g.setup && (
        <div className={`arena-hand ${g.setup ? "choosing" : ""}`}>
          <span className="hand-caption">
            {g.setup
              ? "ESCOLHA SUA MÃO"
              : `${me.hand.length} CARTAS · ARRASTE PARA JOGAR`}
          </span>
          <div className="hand-fan">
            {me.hand.map((id, index) => {
              const c = cards.get(id)!,
                center = index - (me.hand.length - 1) / 2,
                n = Math.min(
                  80,
                  (viewport -
                    (viewport < 760 ? 115 : viewport <= 1100 ? 560 : 480)) /
                    Math.max(1, me.hand.length),
                ),
                angle = center * Math.min(4, 30 / me.hand.length),
                lift = Math.abs(center) ** 2 * 2;
              return (
                <div
                  key={`${index}-${id}`}
                  className={`fan-card ${p.selected?.index === index && p.selected?.kind === "hand" ? "selected" : ""}  ${dragging?.index === index && dragging.moving ? "dragged" : ""}`}
                  style={{
                    "--offset": `${center * n}px`,
                    "--angle": `${angle}deg`,
                    "--lift": `${lift}px`,
                    "--order": index,
                  }}
                >
                  <button
                    className="fan-art"
                    onPointerDown={(e) => {
                      if (e.button !== 0 || p.busy || done) return;
                      if (g.setup) {
                        p.onHand(index);
                        return;
                      }
                      e.preventDefault();
                      const d = {
                        index,
                        x: e.clientX,
                        y: e.clientY,
                        moving: false,
                      };
                      dragRef.current = d;
                      setDragging(d);
                      p.onDrag({ kind: "hand", cardId: id, index });
                    }}
                    onMouseEnter={() => {
                      handHoverRef.current = index;
                      hoveredRef.current = null;
                      setHandHover(index);
                    }}
                    onMouseLeave={() => {
                      handHoverRef.current = null;
                      setHandHover(null);
                    }}
                    onFocus={() => {
                      handHoverRef.current = index;
                      setHandHover(index);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        p.onHand(index);
                      }
                    }}
                    aria-label={`Selecionar ${c.name}, cópia ${index + 1}`}
                  >
                    <img src={c.asset} alt={c.name} draggable={false} />
                    <b
                      className={`fan-cost ${c.stats.cost > me.pe + me.permanentPe ? "unaffordable" : ""}`}
                    >
                      {c.stats.cost}
                    </b>
                    {g.setup && !me.mulligan && p.mulligan.includes(index) && (
                      <span className="fan-exchange">↻</span>
                    )}
                  </button>
                  <button
                    className="fan-zoom"
                    aria-label={`Ler ${c.name}`}
                    onClick={() => p.onFocus(c)}
                  >
                    <span aria-hidden="true">⤢</span> Ler
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {dragging?.moving && me && (
        <div
          className="drag-ghost"
          style={{ left: dragging.x, top: dragging.y }}
        >
          <img src={cards.get(me.hand[dragging.index])?.asset} alt="" />
        </div>
      )}
      {me && g.phase === 4 && yourTurn && !g.setup && !done && (
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
      {p.selected && !g.setup && !g.centerPending && (
        <button className="arena-context" onClick={() => setDrawer(!drawer)}>
          {card?.name ||
            cards.get(
              g.units.find((u) => u.id === p.selected?.unitId)?.cardId || "",
            )?.name ||
            "Unidade"}{" "}
          <span>{drawer ? "×" : "Efeitos ↗"}</span>
        </button>
      )}
      {drawer && !g.setup && (
        <div className="arena-drawer">
          <button
            className="drawer-close"
            onClick={() => setDrawer(false)}
            aria-label="Fechar controles"
          >
            ×
          </button>
          <button className="drawer-aim" onClick={() => setDrawer(false)}>
            Escolher alvos no tabuleiro ↗
          </button>
          {p.controls}
        </div>
      )}
      {hover && !dragging && !drawer && (
        <div className="arena-hover">
          <b>
            {cards.get(hover.cardId)?.name ||
              (hover.kind === "crystal"
                ? "Cristal de invocação"
                : hover.kind === "curse"
                  ? `Maldição nível ${hover.level}`
                  : "Carta oculta")}
          </b>
          <small>
            {hover.cardId !== "hidden" ? "F ou botão direito para ler" : ""}
          </small>
        </div>
      )}
      {response && (
        <aside className="arena-stack-panel" aria-label="Pilha de respostas">
          <div className="stack-heading">
            <b>{g.combat ? "⚔ Combate anunciado" : "✧ Magias em resposta"}</b>
            <span>
              {yourTurn
                ? "VOCÊ TEM A PRIORIDADE"
                : `PRIORIDADE · ${p.names[g.priority]}`}
            </span>
          </div>
          {g.combat && (
            <div className="pending-combat">
              <span>
                {cards.get(
                  g.units.find((u) => u.id === g.combat?.attackerId)?.cardId ||
                    "",
                )?.name || "Unidade"}
              </span>
              <b>→</b>
              <span>
                {cards.get(
                  g.units.find((u) => u.id === g.combat?.defenderId)?.cardId ||
                    "",
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
                  <img src={c.asset} alt={c.name} />
                  <div>
                    <small>
                      {i === 0 ? "PRÓXIMA A RESOLVER" : `NA FILA · ${i + 1}`}
                    </small>
                    <b>{c.name}</b>
                    <span>
                      {p.names[entry.seat]} ·{" "}
                      {c.stats.speed === "fast" ? "Rápida" : "Lenta"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p>
            {g.passes === 1
              ? "Um passe confirmado. O próximo passe resolve."
              : g.stack.length
                ? "Duas respostas passadas resolvem a última magia."
                : "Os dois jogadores podem responder antes do dano."}
          </p>
        </aside>
      )}
      {presenting && (
        <div className="field-event" role="status">
          <span className="event-pulse" />
          {presenting}
        </div>
      )}
      {menu && (
        <div className="arena-menu-panel">
          <h2>Shikigamido</h2>
          <button onClick={() => setMenu(false)}>Continuar duelo</button>
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
            <button onClick={p.onConcede}>Conceder partida</button>
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
      {done && !presenting && settledRevision === g.revision && (
        <div className="arena-victory">
          <small>O DUELO TERMINOU</small>
          <h1>
            {g.draw
              ? "Empate"
              : g.winner === p.seat
                ? "Vitória"
                : `${p.names[g.winner!]} venceu`}
          </h1>
          <p>
            {g.draw
              ? "Os dois Omionjis caíram."
              : "O santuário reconhece seu vencedor."}
          </p>
          <button onClick={p.onExit}>Retornar ao santuário →</button>
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
