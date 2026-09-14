import type { GameView, UnitView } from "./room.js";
import { cards } from "./cards.js";
import { movementReason } from "./action-advice.js";
export type UnitInsight = {
  label: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
};
export function unitInsights(
  g: Pick<GameView, "turn" | "moved">,
  u: UnitView,
): UnitInsight[] {
  if (u.cardId === "hidden")
    return [
      {
        label: "Carta oculta",
        detail: "Identidade e atributos serão revelados no combate.",
        tone: "neutral",
      },
    ];
  const st = u.statuses || {};
  const entries: UnitInsight[] = [];
  const add = (
    label: string,
    detail: string,
    tone: UnitInsight["tone"] = "neutral",
  ) => entries.push({ label, detail, tone });
  const expires = (key: string) =>
    typeof st[`${key}Until`] === "number"
      ? `Até o fim do turno ${st[`${key}Until`]}.`
      : "";
  if (u.summonedTurn === g.turn && ["unit", "omionji"].includes(u.kind))
    add("Invocado agora", "Movimento liberado no próximo turno.");
  if (g.moved.includes(u.id))
    add("Movimento usado", "Esta unidade volta a mover no próximo turno.");
  if (st.stun)
    add("Atordoado", `Não move nem contra-ataca. ${expires("stun")}`, "bad");
  if (st.softStun)
    add("Imobilizado", `Não pode mover. ${expires("softStun")}`, "bad");
  if (st.hidden)
    add(
      "Oculto",
      "O oponente não vê a identidade nem os atributos desta carta.",
      "good",
    );
  if (st.shield)
    add("Escudo", "Bloqueia o próximo dano de combate e é consumido.", "good");
  if (st.burn)
    add(
      `Queimadura ${st.burn}`,
      `${st.burn} de dano no início do turno. ${expires("burn")}`,
      "bad",
    );
  if (st.intangivel)
    add(
      "Intangível",
      `Atravessa inimigos, mas não pode atacá-los. ${expires("intangivel")}`,
      "good",
    );
  if (st.abilityTurn === g.turn)
    add("Habilidade usada", "Disponível novamente no próximo turno.");
  if (st.once)
    add(
      "Efeito único usado",
      "Esta habilidade não pode ser repetida nesta partida.",
    );
  if (st.centerBonus)
    add("Bônus do centro", "+1 de velocidade permanente.", "good");
  if (st.forged)
    add(
      "Forjado",
      "+1 ataque, vida máxima e velocidade por Taodu Ferreiro. Permanente.",
      "good",
    );
  if (st.auraSpeed || st.auraHp)
    add(
      "Aura do campo",
      `Velocidade +${st.auraSpeed || 0}; vida máxima +${st.auraHp || 0}. Recalculada conforme o campo.`,
      "good",
    );
  if (st.temporaryAttack)
    add(
      `Ataque +${st.temporaryAttack}`,
      `Bônus temporário. Até o fim do turno ${st.temporaryUntil}.`,
      "good",
    );
  if (st.speedLoss)
    add(
      `Velocidade −${st.speedLoss}`,
      `Redução permanente causada por ${[...new Set(st.speedLossSources || [])].map((id) => cards.get(id)?.name || id).join(", ")}.`,
      "bad",
    );
  if (st.dualUntil !== undefined)
    add("Dualidade", `Atributos divididos até o fim do turno ${st.dualUntil}.`);
  if (st.range)
    add(
      `Alcance ${st.range}`,
      `Ataque à distância. ${expires("range")}`,
      "good",
    );
  if (st.lifesteal)
    add(
      `Roubo de vida ${st.lifesteal}`,
      `Recupera vida ao causar dano. ${expires("lifesteal")}`,
      "good",
    );
  if (st.fireball)
    add(
      "Fireball",
      `50% de chance de acertar o ataque. ${expires("fireball")}`,
    );
  if (st.controlTurn)
    add(
      "Mudança de controle",
      `O controle muda no início do turno ${st.controlTurn}.`,
      "bad",
    );
  if (st.borrowed)
    add(
      String(st.borrowed),
      `Keyword recebida. ${expires("borrowed")}`,
      "good",
    );
  if (st.primordial)
    add(
      "Cristal Primordial",
      `Ataque ganho por cura: +${st.primordialBoost || 0}, até +3.`,
      "good",
    );
  if (st.block || st.devolver)
    add(
      "Defesa de combate",
      `Bloqueio ${st.block || 0}; dano adicional no contra-ataque ${st.devolver || 0}.`,
      "good",
    );
  for (const item of u.equipment || [])
    add("Equipamento", cards.get(item.cardId)?.name || item.cardId, "good");
  if (!u.speed && ["unit", "curse", "omionji"].includes(u.kind))
    add(
      "Sem velocidade",
      u.kind === "curse"
        ? "Esta maldição não avança enquanto a velocidade for zero."
        : "Sem alcance próprio. Correntes de vento podem alterar o alcance.",
      "bad",
    );
  return entries;
}
export function movementMarker(g: GameView, u: UnitView) {
  if (u.cardId === "hidden" || !["unit", "omionji", "curse"].includes(u.kind))
    return null;
  const reason = movementReason(g, u);
  if (u.statuses?.stun || u.statuses?.softStun || !u.speed)
    return { symbol: "×", label: reason!, color: 0xf0a29a };
  if (u.summonedTurn === g.turn)
    return { symbol: "◷", label: "Invocado agora", color: 0xc3bf9a };
  if (u.kind !== "curse" && g.moved.includes(u.id))
    return { symbol: "✓", label: "Movimento usado", color: 0x9ea99d };
  return {
    symbol: "➟",
    label: u.kind === "curse" ? "Avanço automático" : "Movimento disponível",
    color: 0x8edfc0,
  };
}
