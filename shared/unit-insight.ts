import type { GameView, UnitView } from "./room.js";
import { keywordHelp } from "./keyword-help.js";
import { cards } from "./cards.js";
import { movementReason } from "./action-advice.js";
export type UnitInsight = {
  category: "effect" | "movement";
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
        category: "movement",
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
    category: UnitInsight["category"] = "effect",
  ) => entries.push({ label, detail, tone, category });
  const expires = (key: string) =>
    typeof st[`${key}Until`] === "number"
      ? `Até o fim do turno ${st[`${key}Until`]}.`
      : "";
  if (u.summonedTurn === g.turn && ["unit", "omionji"].includes(u.kind))
    add(
      "Invocado agora",
      "Movimento liberado no próximo turno.",
      "neutral",
      "movement",
    );
  if (g.moved.includes(u.id))
    add(
      "Movimento usado",
      "Esta unidade volta a mover no próximo turno.",
      "neutral",
      "movement",
    );
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
    add(
      "Habilidade usada",
      "Disponível novamente no próximo turno.",
      "neutral",
      "movement",
    );
  if (st.once)
    add(
      "Efeito único usado",
      "Esta habilidade não pode ser repetida nesta partida.",
      "neutral",
      "movement",
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
      ` ${keywordHelp[String(st.borrowed)] || "Keyword recebida."} ${expires("borrowed")}`.trim(),
      "good",
    );
  if (st.primordial)
    add(
      "Cristal Primordial",
      `Ataque ganho por cura: +${st.primordialBoost || 0}, até +3.`,
      "good",
    );
  if (st.block)
    add(
      `Block ${st.block}`,
      `Recebe ${st.block} a menos de dano em cada combate. ${expires("block") || "Permanece enquanto a carta estiver em campo."}`,
      "good",
    );
  if (st.devolver)
    add(
      `Devolver ${st.devolver}`,
      `Ao ser atacada, recebe +${st.devolver} de ataque para o contra-ataque. ${expires("devolver") || "Permanece enquanto a carta estiver em campo."}`,
      "good",
    );
  if (st.healSplash)
    add(
      "Cura da Água",
      "Na próxima cura recebida, cura 2 de vida dos monstros adjacentes. Consumido após ativar.",
      "good",
    );
  if (st.ressurgir)
    add(
      `Ressurgir ${st.ressurgir}`,
      `Após ser destruída, retorna em ${st.ressurgir} turnos. Se a casa estiver ocupada, retorna à mão.`,
      "good",
    );
  if (st.burnAttack)
    add(
      `Burn ${st.burnAttack}`,
      `Aplica ${st.burnAttack} de queimadura ao inimigo após combater, durante dois turnos.`,
      "good",
    );
  if (st.damageCap !== undefined)
    add(
      "Dano limitado",
      `Causa no máximo ${st.damageCap} de dano. ${expires("damageCap")}`,
      "bad",
    );
  if (st.redirect)
    add(
      "Proteção",
      `Até ${st.redirectAmount || "todo o"} dano será transferido para outra carta neste combate.`,
      "good",
    );
  for (const key of ["Quick Attack", "Alimentar", "Lifesteal", "Construir"]) {
    if (st[key] && st.borrowed !== key)
      add(
        `${key}${Number(st[key]) > 1 ? ` ${st[key]}` : ""}`,
        keywordHelp[key].replace(/\bX\b/g, String(st[key])),
        "good",
      );
  }
  if (st.construir && !st.Construir)
    add(
      "Construir",
      "Pode criar um caminho ortogonal na fase de Magia.",
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
      "movement",
    );
  return entries;
}
export function movementMarker(g: GameView, u: UnitView) {
  if (u.cardId === "hidden" || !["unit", "omionji", "curse"].includes(u.kind))
    return null;
  const reason = movementReason(g, u);
  if (u.statuses?.stun || u.statuses?.softStun || !u.speed)
    return { state: "blocked", symbol: "×", label: reason!, color: 0xf0a29a };
  if (u.kind !== "curse" && u.summonedTurn === g.turn)
    return {
      state: "waiting",
      symbol: "◷",
      label: "Invocado agora",
      color: 0xe7cf92,
    };
  if (u.kind !== "curse" && g.moved.includes(u.id))
    return {
      state: "moved",
      symbol: "✓",
      label: "Movimento usado",
      color: 0xc0d0c5,
    };
  return {
    state: "ready",
    symbol: "➟",
    label: u.kind === "curse" ? "Avanço automático" : "Movimento disponível",
    color: 0x8edfc0,
  };
}

export function unitEffects(g: Pick<GameView, "turn" | "moved">, u: UnitView) {
  return unitInsights(g, u).filter((e) => e.category === "effect");
}
