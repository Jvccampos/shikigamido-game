import { useEffect, useRef, useState } from "preact/hooks";
import type {
  ActionPreview,
  CombatantPreview,
} from "../shared/action-advice.js";
import { pieceName } from "../shared/action-advice.js";
import { cards } from "../shared/cards.js";
import { layout } from "../shared/arena-layout.js";
import type { GameView } from "../shared/room.js";

function Fighter({
  side,
  resolved,
  role,
}: {
  side: CombatantPreview;
  resolved: boolean;
  role: string;
}) {
  const u = side.before,
    card = cards.get(u.cardId);
  const hp = resolved ? Math.max(0, side.after?.hp || 0) : null;
  const gone = resolved && !side.after;
  const shield = u.statuses?.shield && !side.after?.statuses?.shield;
  return (
    <div
      className={`forecast-fighter ${gone ? "fallen" : ""}`}
      aria-label={`${role}: ${pieceName(u)}`}
    >
      <div className="forecast-art">
        {card?.asset ? (
          <img src={card.asset} alt="" />
        ) : (
          <span>{u.kind === "curse" ? "禍" : "?"}</span>
        )}
        <b className="forecast-damage" aria-label="Dano recebido">
          {resolved ? (side.damage ? `−${side.damage}` : "0") : "?"}
        </b>
      </div>
      <b className="forecast-name">{pieceName(u)}</b>
      <div
        className="forecast-life"
        aria-label={`Vida ${u.hp ?? "?"} para ${hp ?? "incerta"}`}
      >
        <span>♥ {u.hp ?? "?"}</span>
        <span aria-hidden="true">→</span>
        <strong>{hp ?? "?"}</strong>
      </div>
      <div className="forecast-healthbar" aria-hidden="true">
        <i
          style={{
            width: `${u.maxHp ? Math.min(100, ((u.hp || 0) / u.maxHp) * 100) : 0}%`,
          }}
        />
        {hp !== null && (
          <i
            style={{
              width: `${u.maxHp ? Math.min(100, (hp / u.maxHp) * 100) : 0}%`,
            }}
          />
        )}
      </div>
      <small className="forecast-outcome">
        {gone
          ? side.defeated
            ? "Derrotado"
            : "Sai do campo"
          : !resolved
            ? "Resultado incerto"
            : shield
              ? "Escudo consumido"
              : side.after?.speed !== u.speed
                ? `➟ ${u.speed} → ${side.after?.speed}`
                : "Sobrevive"}
      </small>
    </div>
  );
}

export function CombatForecast({
  preview,
  game,
}: {
  preview: ActionPreview;
  game: GameView;
}) {
  const combat = preview.combat!;
  const ref = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState({ w: innerWidth, h: innerHeight });
  const [height, setHeight] = useState(210);
  useEffect(() => {
    const resize = () => setScreen({ w: innerWidth, h: innerHeight });
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(() => {
      if (ref.current) setHeight(ref.current.offsetHeight);
    });
    if (ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);
  const { w, h } = screen,
    compact = h < 560 && w > h;
  const width = compact ? 180 : Math.min(310, w - 24);
  const l = layout(w, h),
    a = l.point(combat.attacker.before.x, combat.attacker.before.y),
    d = l.point(combat.defender.before.x, combat.defender.before.y);
  const mx = (a.x + d.x) / 2,
    my = (a.y + d.y) / 2;
  const gap = l.dx * 0.55 + 12;
  const top = w < 760 ? 292 : 174,
    bottom = h - (w < 760 ? 266 : 195);
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  // Prefer the space just above/below the encounter. Penalize covering either
  // combatant strongly; the transient preview never captures board input.
  const candidates = [
    { x: mx - width / 2, y: Math.max(a.y, d.y) + gap },
    { x: mx - width / 2, y: Math.min(a.y, d.y) - gap - height },
    { x: Math.min(a.x, d.x) - gap - width, y: my - height / 2 },
    { x: Math.max(a.x, d.x) + gap, y: my - height / 2 },
  ].map((p) => ({
    x: clamp(p.x, w < 760 ? 12 : 210, w - width - (w < 760 ? 12 : 210)),
    y: clamp(p.y, top, bottom - height),
  }));
  const score = (p: { x: number; y: number }) => {
    let penalty = Math.hypot(p.x + width / 2 - mx, p.y + height / 2 - my);
    for (const u of game.units) {
      const point = l.point(u.x, u.y),
        radius = l.dx * 0.45;
      if (
        point.x + radius > p.x &&
        point.x - radius < p.x + width &&
        point.y + radius > p.y &&
        point.y - radius < p.y + height
      )
        penalty +=
          u.id === combat.attacker.before.id ||
          u.id === combat.defender.before.id
            ? 10000
            : 100;
    }
    return penalty;
  };
  const position = compact
    ? { x: w - width - 10, y: Math.max(48, Math.min(90, h - 186 - height)) }
    : candidates.sort((a, b) => score(a) - score(b))[0];
  const lineEnd = {
    x: clamp(mx, position.x + 12, position.x + width - 12),
    y: clamp(my, position.y, position.y + height),
  };
  const quick = combat.keyword === "Quick Attack";
  return (
    <>
      <svg className="forecast-links" width={w} height={h} aria-hidden="true">
        <path d={`M ${a.x} ${a.y} L ${d.x} ${d.y}`} />
        <path
          className="forecast-tether"
          d={`M ${mx} ${my} L ${lineEnd.x} ${lineEnd.y}`}
        />
        <circle cx={a.x} cy={a.y} r={l.dx * 0.48} />
        <circle cx={d.x} cy={d.y} r={l.dx * 0.48} />
      </svg>
      <section
        ref={ref}
        className={`combat-forecast ${compact ? "compact" : ""}`}
        style={{ left: position.x, top: position.y, width }}
        aria-label="Prévia do combate"
      >
        <div className="forecast-heading">
          <b>{preview.title}</b>
          <span>
            {combat.announced
              ? "Aguardando respostas"
              : preview.cost
                ? `${preview.cost} PE`
                : "Sem custo"}
          </span>
        </div>
        <div className="forecast-versus">
          <Fighter
            side={combat.attacker}
            resolved={combat.resolved}
            role="Atacante"
          />
          <div className="forecast-exchange">
            <b>{!combat.resolved ? "?" : quick ? "ϟ" : "⚔"}</b>
            <span>
              {!combat.resolved
                ? "Incerto"
                : quick
                  ? "Ataca primeiro →"
                  : combat.keyword === "Equipar"
                    ? "Equipar →"
                    : combat.keyword === "Engolir"
                      ? "Engolir"
                      : "Simultâneo"}
            </span>
            {!!combat.modifier && (
              <small>
                {combat.modifier > 0 ? "+" : ""}
                {combat.modifier} elemental
              </small>
            )}
          </div>
          <Fighter
            side={combat.defender}
            resolved={combat.resolved}
            role="Defensor"
          />
        </div>
        <div className="forecast-note">
          {!combat.resolved
            ? preview.uncertain?.includes("pilha")
              ? "Magias pendentes · resultado incerto"
              : preview.uncertain?.includes("ocultas")
                ? "Carta oculta · resultado incerto"
                : "Resultado depende de sorteio ou efeito"
            : "Previsão · respostas podem mudar o resultado"}
        </div>
      </section>
    </>
  );
}
