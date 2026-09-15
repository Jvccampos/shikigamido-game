import { useArenaScene } from "./use-arena-scene.js";
import { ArenaHand } from "./arena-hand.js";
import type { Card } from "../shared/cards.js";
import type { GameView, UnitView } from "../shared/room.js";
import type { Selection } from "./match-interaction.js";
import { OpeningHand, DiscardChoice } from "./choices.js";
import { Journal } from "./journal.js";
import { ElementsGuide } from "./elements-guide.js";
import { DuelContext } from "./duel-context.js";
import { layout } from "../shared/arena-layout.js";
import { CombatForecast } from "./combat-preview.js";
import { SearchChoice } from "./search-choice.js";
import type {
  ActionPlan,
  ActionPreview as Preview,
} from "../shared/action-advice.js";
import { previewAction } from "../shared/action-advice.js";
import { unitEffects } from "../shared/unit-insight.js";
import { ArenaNotices } from "./arena-notices.js";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Point } from "./arena-scene.js";
import type { DuelPresentationState } from "./use-duel-presentation.js";
import { cards, type Cmd } from "../shared/game.js";
type Props = {
  game: GameView;
  seat: number;
  code: string;
  names: string[];
  highlights: Point[];
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
    setDiscardOpen(
      g.phase === 4 &&
        yourTurn &&
        !g.setup &&
        !done &&
        !g.stack.length &&
        !g.combat &&
        !g.searches?.length,
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
  ]);
  const { drawing, presenting, visibleUnits } = p.presentation;
  useEffect(() => {
    p.presentation.onOverlays({
      discard: discardOpen,
      elements: elementsOpen,
      menu,
    });
  }, [discardOpen, elementsOpen, menu, p.presentation.onOverlays]);
  const opening = !!g.setup && !!me && !me.mulligan && !me.ready;
  function state() {
    const v = latest.current;
    return {
      game: v.game,
      seat: v.seat,
      highlights: v.highlights,
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
              className="mana-total"
              title="Total para pagar custos: energia do turno + reserva."
              aria-label={`${v.pe + v.permanentPe} PE disponíveis. ${v.pe} energia e ${v.permanentPe} reserva.`}
            >
              <b key={`${v.pe}:${v.permanentPe}`}>{v.pe + v.permanentPe}</b>
              <span>PE disponíveis</span>
            </div>
            <div
              className="energy-resource"
              title="Energia elemental (PE): renova no início de cada turno."
            >
              <span>Energia</span>
              <b>
                {v.pe}
                <small> / {v.maxPe}</small>
              </b>
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
            </div>
          </div>
        </div>
      </div>
    );
  }
  const response = !!(g.combat || g.stack.length);
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
  return (
    <section
      aria-busy={p.busy || !ready}
      className={`arena-shell ${g.setup ? "preparing-position" : ""} ${opening ? "choosing-hand" : ""} ${drawing ? "drawing" : ""} ${responseContext ? "response-mode" : ""} ${presenting ? "presenting" : ""}`}
      aria-label="Partida de Shikigamido"
      style={{
        "--action-rail-left": `${railLeft}px`,
        "--action-rail-width": `${railWidth}px`,
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
          className="elements-toggle"
          aria-label="Vantagens elementais"
          title="Vantagens elementais e legenda dos atributos"
          onClick={() => setElementsOpen(true)}
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            aria-hidden="true"
          >
            <path d="m12 2 10 7-4 12H6L2 9 12 2Zm0 0 6 19L2 9h20L6 21 12 2Z" />
          </svg>
          <small>Elementos</small>
        </button>
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
        {!g.setup ? (
          <DuelContext
            game={g}
            seat={p.seat}
            names={p.names}
            presenting={
              presenting?.label ||
              (drawing ? "Compra automática · carta vindo para a mão" : null)
            }
          />
        ) : (
          <>
            <small>TURNO {String(g.turn).padStart(2, "0")} · PREPARAÇÃO</small>
            <h1>Prepare seu espírito</h1>
          </>
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
      </div>
      <button
        className="arena-deck"
        onClick={() => setLog(!log)}
        title="Baralho e descarte"
      >
        <i />
        <i />
        <span>式</span>
        <b>{me ? (me.libraryCount ?? me.library.length) : "▤"}</b>
      </button>
      {!g.setup && !g.centerPending && !done && (
        <button
          className={`arena-pass ${yourTurn ? "enabled" : ""}`}
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
        <ArenaHand
          game={g}
          seat={p.seat}
          selected={p.selected}
          handPlans={p.handPlans}
          busy={p.busy}
          viewport={viewport}
          railLeft={railLeft}
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
      {hover && !dragging && !discardOpen && (
        <div className="arena-hover">
          <b>
            {cards.get(hover.cardId)?.name ||
              (hover.kind === "crystal"
                ? "Cristal de invocação"
                : hover.kind === "curse"
                  ? `Maldição nível ${hover.level}`
                  : "Carta oculta")}
          </b>
          <div className="hover-effects">
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
              <div className="stack-heading">
                <b>
                  {g.stack.length
                    ? "✧ Magias em resposta"
                    : "⚔ Combate anunciado"}
                </b>
                <span>
                  {yourTurn
                    ? "VOCÊ TEM A PRIORIDADE"
                    : `PRIORIDADE · ${p.names[g.priority]}`}
                </span>
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
                      <img src={c.asset} alt={c.name} />
                      <div>
                        <small>
                          {i === 0
                            ? "PRÓXIMA A RESOLVER"
                            : `NA FILA · ${i + 1}`}
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
      </div>
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
      {done && p.presentation.resultReady && (
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
