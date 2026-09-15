/** Player-facing explanations from the manual, including the agreed orthogonal jump rule. */
export const keywordHelp: Record<string, string> = {
  "Quick Attack":
    "Ao atacar, causa dano antes do contra-ataque. Se derrotar o defensor, não recebe o contra-ataque.",
  "Slow Defense":
    "Ao defender, causa seu dano depois do atacante. Se for derrotado primeiro, não contra-ataca.",
  Amaldiçoado:
    "Não recebe modificadores de dano por vantagem ou desvantagem elemental ao atacar.",
  Pular:
    "Pode mover para uma casa horizontal ou vertical adjacente sem conexão, desde que ela não esteja ocupada por um inimigo. Não permite diagonais.",
  Burn: "Aplica X de dano no início de cada um dos próximos dois turnos após o combate.",
  Lifesteal:
    "Depois de causar dano, recupera a mesma quantidade de vida, até o máximo de X.",
  Devolver: "Ao ser atacada, recebe +X de ataque para aquele contra-ataque.",
  Block: "Recebe X a menos de dano em cada combate.",
  Range:
    "Pode atacar a até X casas de distância, mesmo sem conexão entre elas.",
  Construir:
    "Na fase de Magia, cria um caminho para uma casa horizontal ou vertical adjacente. Efeito lento.",
  Alimentar:
    "Ao destruir uma carta, ganha +1 de ataque, +1 de vida e +1 de velocidade. O aumento total de velocidade por este efeito é limitado a +1.",
  Engolir:
    "Ao entrar em combate com um monstro, captura-o. Os monstros capturados retornam ao tabuleiro quando esta carta é derrotada.",
  Escudo: "Bloqueia dano de combate. É consumido quando bloqueia um dano.",
  "Soft Stun": "Não pode se mover por X turnos.",
  Stun: "Não pode se mover nem contra-atacar por X turnos.",
  Ressurgir:
    "Retorna após X turnos à casa onde foi destruída, como uma nova invocação. Se a casa estiver ocupada, retorna à mão.",
  Shikigami:
    "Pode ser invocada do baralho ao cumprir sua condição, sacrificando a carta anterior da mesma linhagem. Ocupa a casa da carta sacrificada.",
  "Ritual das Almas":
    "Sacrifique uma ou mais cartas para invocar. Recebe um token de alma por carta sacrificada e por monstro que destruir.",
  "Terreno de Fogo":
    "No fim do turno, cura 1 de vida de um monstro de Fogo nessa casa. Outros monstros recebem 1 de dano.",
  Incendiar:
    "Ao mover, pode criar um terreno de fogo em uma casa do trajeto. O terreno permanece por X turnos.",
};
const aliases: Record<string, string> = {
  quickatack: "Quick Attack",
  quickattack: "Quick Attack",
  "quick attack": "Quick Attack",
  renascer: "Ressurgir",
  almaldiçoado: "Amaldiçoado",
};
const names = [...Object.keys(keywordHelp), ...Object.keys(aliases)].sort(
  (a, b) => b.length - a.length,
);
export function keywordParts(
  text: string,
): { text: string; detail?: string }[] {
  const pattern = new RegExp(`\\b(${names.join("|")})(?:\\s+(\\d+))?\\b`, "gi");
  const parts: { text: string; detail?: string }[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > start)
      parts.push({ text: text.slice(start, match.index) });
    const name =
      aliases[match[1].toLowerCase()] ||
      Object.keys(keywordHelp).find(
        (k) => k.toLowerCase() === match[1].toLowerCase(),
      )!;
    parts.push({
      text: match[0],
      detail: keywordHelp[name].replace(/\bX\b/g, match[2] || "X"),
    });
    start = match.index! + match[0].length;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}
