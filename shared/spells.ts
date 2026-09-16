export type SpellSpec = {
  target:
    | "none"
    | "unit"
    | "enemyUnit"
    | "ally"
    | "windAlly"
    | "omionjiFire"
    | "twoAllies"
    | "duel"
    | "twoUnits"
    | "cell"
    | "lake"
    | "wind"
    | "move"
    | "discardCat"
    | "discardVoid"
    | "combat"
    | "redirect"
    | "rift";
  hint: string;
  choice?: "keyword" | "combatRole";
  amount?: "energy" | "redirectDamage";
};
const entries: Record<string, SpellSpec> = {};
const add = (ids: string[], target: SpellSpec["target"], hint: string) =>
  ids.forEach((id) => (entries[id] = { target, hint }));
add(
  [
    "kogeki-n-1-golpe-do-vazio",
    "gishiki-n-13-fardo-espiritual",
    "gishiki-n-4-manto-da-escuridao",
    "mamoru-n-12-negacao",
  ],
  "none",
  "Solte na área de conjuração.",
);
add(
  ["gishiki-n-10-invocar-espiritos"],
  "discardVoid",
  "Escolha um monstro de Vazio no seu descarte.",
);
add(
  ["ritual-do-gato-sete-vidas"],
  "discardCat",
  "Escolha um gato no seu descarte e um espaço de invocação.",
);
add(
  [
    "gishiki-n-16-ponte-magica",
    "gishiki-n-17-renascer",
    "gishiki-n-20-transferencia-vital",
    "gishikido-n-22-garras-de-fogo",
    "gishikido-n-3-cura-da-agua",
    "gishikido-n-7-cura-da-agua",
    "cristal-primordial",
    "mamoru-n-18-pele-de-ourico",
    "mamoru-n-21-intocavel",
    "mamoru-n-5-prisao-do-inferno",
    "mamoru-n-7-dispersar",
    "shikigami-de-agua-vibora-bolha",
    "kogeki-n-2-dualidade",
  ],
  "unit",
  "Solte sobre um monstro. Omionjis e maldições não são monstros.",
);
add(
  ["kogekido-n-42-obliterar"],
  "enemyUnit",
  "Cause X de dano a um monstro inimigo.",
);
add(
  [
    "gishiki-n-20-tributo",
    "gishiki-n-4-sacrificio",
    "kogekido-n-40-suspiro-final",
    "gishiki-n-3-intangibilidade",
  ],
  "ally",
  "Solte sobre um monstro seu.",
);
add(
  ["gishikido-n-2-bencao-do-vento"],
  "windAlly",
  "Escolha um monstro aliado de Vento.",
);
add(["kogeki-n-1-fireball"], "omionjiFire", "Escolha seu Omionji de Fogo.");
add(
  ["kogeki-n-9-sacrificio"],
  "twoAllies",
  "Escolha dois monstros seus. O primeiro ataca.",
);
add(
  ["duelo-de-fogo"],
  "duel",
  "Escolha seu monstro. O oponente escolherá o dele.",
);
add(
  ["gishiki-n-9-mimetismo"],
  "twoUnits",
  "Escolha o doador, o receptor e a keyword.",
);
add(
  ["mamoru-n-9-wonder-wall"],
  "cell",
  "Escolha um espaço vazio e quanto PE extra investir.",
);
add(
  ["fenda-do-vazio"],
  "rift",
  "Escolha um espaço vazio adjacente a uma carta sua.",
);
add(
  ["magia-de-sangue"],
  "lake",
  "Escolha uma casa com uma carta de Água ou adjacente a ela.",
);
add(
  ["ventos-favoraveis"],
  "wind",
  "Escolha duas casas conectadas em linha reta. A corrente segue da primeira para a segunda.",
);
add(
  ["mamoru-n-1-pes-ligeiros"],
  "move",
  "Escolha um monstro seu e depois uma casa conectada vazia.",
);
add(
  ["kogekido-n-2-exorcismo", "mamorudo-n-17-defesa-da-fagulha"],
  "combat",
  "Escolha um monstro no combate anunciado.",
);
add(
  ["mamoru-n-24-conexao", "mamoru-n-5-transferencia-espiritual"],
  "redirect",
  "Escolha seu monstro em combate e o aliado que receberá o dano.",
);
entries["gishiki-n-9-mimetismo"].choice = "keyword";
entries["mamorudo-n-17-defesa-da-fagulha"].choice = "combatRole";
entries["mamoru-n-9-wonder-wall"].amount = "energy";
entries["kogekido-n-42-obliterar"].amount = "energy";
entries["mamoru-n-5-transferencia-espiritual"].amount = "redirectDamage";
export const spellSpecs = entries;
export const transferableKeywords = [
  "Pular",
  "Quick Attack",
  "Slow Defense",
  "Block",
  "Burn",
  "Lifesteal",
  "Devolver",
  "Construir",
  "Alimentar",
  "Engolir",
  "Ressurgir",
  "Range",
  "Escudo",
];

// Selection steps are UI metadata. The engine still decides which targets are legal.
export function targetFlow(target?: SpellSpec["target"]) {
  return {
    multipleUnits:
      target === "twoAllies" || target === "twoUnits" || target === "redirect",
    multipleCells: target === "wind",
    unitThenCell: target === "move",
    needsUnit:
      !!target &&
      ![
        "none",
        "cell",
        "lake",
        "wind",
        "rift",
        "discardVoid",
        "discardCat",
      ].includes(target),
    cellOnly:
      target === "cell" ||
      target === "lake" ||
      target === "wind" ||
      target === "rift",
    submitOnDrop:
      !!target &&
      [
        "unit",
        "ally",
        "windAlly",
        "omionjiFire",
        "combat",
        "enemyUnit",
        "lake",
        "none",
      ].includes(target),
  };
}
