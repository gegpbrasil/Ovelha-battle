// Lore padrão para o modo história (com base nas fases atuais)
export const STORY_LORE = {
  fase_1: {
    speaker: "gabriel",
    lines: [
      "O caminho para a Distopia foi reaberto. Dentro das cavernas, os corredores parecem ter vida própria.",
      "A entrada se fechou atrás da expedição. Entre as rachaduras, Rastejantes começam a se mover.",
      "Antes de descobrir quem está reescrevendo estes caminhos, precisamos abrir passagem."
    ]
  },
  fase_2: {
    speaker: "bytela",
    lines: [
      "O antigo mercado está afundado nas ruínas. Foi aqui que a Bytelã perdeu parte dos arquivos da sua loja.",
      "Fragmentos de dados ainda brilhantes atraíram as patrulhas das cavernas.",
      "Recupere os fragmentos para revelar o caminho até o centro."
    ]
  },
  fase_3: {
    speaker: "drop",
    lines: [
      "O vapor do Repriton toma conta do lago. Os Vigias se aproximam na névoa.",
      "Continue em movimento e resista até a passagem reaparecer."
    ]
  },
  fase_4: {
    speaker: "gabriel_ai",
    lines: [
      "A mina guarda os experimentos com Cavernizo.",
      "Derrube os elites para seguir adiante. O núcleo da Distopia está próximo."
    ]
  },
  fase_5: {
    speaker: "gabriel",
    lines: [
      "O Regente de Basalto protege a passagem final.",
      "Enfrente o Regente antes que o tempo termine."
    ]
  }
};

export const CONTENT_DEFAULTS = {
  meta: {
    title: "Ovelha Battle",
    subtitle: "Missão 2",
    chapter: "Distopia das Cavernas",
    version: "1.0.0",
    monthlyMessage: "Novas fases da história chegam todo mês.",
    saveVersion: 2
  },
  rarities: {
    criador: { label: "Criador", color: "#ffd166" },
    secreto: { label: "Secreto", color: "#ff4fd8" },
    lenda: { label: "Lenda", color: "#9b7bff" },
    cidadao: { label: "Cidadão", color: "#42d7ff" },
    cabo: { label: "Cabo", color: "#78e38b" },
    morador: { label: "Morador", color: "#b8c0d9" }
  },
  stats: { hp: 3500, damage: 500, speed: 200, dodge: 0.05, range: 300, cooldown: 0.6, projectileSpeed: 650 },
  npc: { kind: "melee", hp: 900, damage: 180, speed: 78, radius: 19, reward: 1, color: "#cf6cff", accent: "#7437b5", elite: false, boss: false, range: 245, cooldown: 1.65, projectileSpeed: 250 },
  palette: { ground: "#17142b", path: "#29224c", crystal: "#7d5cff", mist: "#ea4ddb" },
  economy: {
    currencies: { licano: { label: "Licanô", icon: "◈" }, upgradePoints: { label: "Pontos de upgrade", icon: "⬡" } },
    startingBalance: { licano: 320, upgradePoints: 180 },
    upgrade: { baseCost: 70, costGrowth: 45, maxLevel: 10, hpPerLevel: 0.09, damagePerLevel: 0.075 },
    summon: { title: "Conjuração do Gabriel", description: "Pague um preço fixo.", price: 250, currency: "licano", previewNext: true }
  }
};

export const copyContent = (val) => JSON.parse(JSON.stringify(val));

export const contentId = (name) =>
  String(name || "novo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "novo";

export function uniqueContentId(name, used) {
  const base = contentId(name);
  let id = base, i = 2;
  while (used.includes(id) || ["__proto__", "prototype", "constructor"].includes(id)) id = `${base}_${i++}`;
  return id;
}

const labelForObj = (type, target) =>
  ({ defeat: `Derrote ${target} inimigos`, collect: `Colete ${target} fragmentos`, survive: `Sobreviva por ${target}s`, elite: `Derrote ${target} elites`, boss: "Derrote o chefe" }[type] || "Complete a fase");

export function normalizeGameData(raw) {
  const d = copyContent(raw), D = CONTENT_DEFAULTS;
  d.meta = { ...D.meta, ...d.meta };
  d.rarities = d.rarities ? { ...d.rarities } : copyContent(D.rarities);

  d.characters = (d.characters || []).map((c, i) => {
    c.id ||= uniqueContentId(c.name || `Heroi ${i + 1}`, []);
    c.name ||= `Personagem ${i + 1}`;
    c.rarity ||= "morador";
    c.role ||= "Combatente";
    c.description ||= "";
    c.token = { color: "#ffffff", accent: "#8d4cff", initial: c.name[0] || "P", ...c.token };
    c.stats = { ...D.stats, ...c.stats };
    return c;
  });

  d.story = d.story || { phases: [] };
  d.story.phases = (d.story.phases || []).map((p, i) => {
    p.id ||= `fase_${i + 1}`;
    p.name ||= `Fase ${i + 1}`;
    p.subtitle ||= "";
    p.objective ||= { type: "defeat", target: 10 };
    p.objective.label ||= labelForObj(p.objective.type, p.objective.target);
    p.timeLimit ||= 60;
    p.spawnInterval ||= 1.2;
    p.reward = { licano: 100, upgradePoints: 50, ...p.reward };
    p.palette = { ...D.palette, ...p.palette };
    p.enemies = p.enemies || [{ id: "rastejante", weight: 1 }];
    return p;
  });

  d.npcs = (d.npcs || []).map((n, i) => {
    n.id ||= uniqueContentId(n.name || `Inimigo ${i + 1}`, []);
    n.name ||= `Inimigo ${i + 1}`;
    return { ...D.npc, ...n };
  });

  d.shop = d.shop || { items: [] };
  d.shop.items = (d.shop.items || []).map((item, i) => {
    item.id ||= `item_${i + 1}`;
    item.type ||= "upgradePoints";
    item.name ||= "Item sem nome";
    item.price ||= 100;
    item.icon ||= "📦";
    return item;
  });

  d.lab = d.lab || { items: [] };
  d.lab.items = (d.lab.items || []).map((item, i) => {
    item.id ||= `mod_${i + 1}`;
    item.name ||= "Mod sem nome";
    item.price ||= 150;
    item.icon ||= "🧪";
    return item;
  });

  return d;
}

export function editableGameData(raw) {
  const data = normalizeGameData(raw);

  data.characters = data.characters.map((c) => ({
    id: c.id,
    name: c.name,
    rarity: c.rarity,
    role: c.role,
    description: c.description,
    unlockedAtStart: !!c.unlockedAtStart,
    token: { ...c.token },
    stats: { ...c.stats },
    storyGoal: c.storyGoal || ""
  }));

  return data;
}

export function validateGameData(raw) {
  const data = normalizeGameData(raw);
  const errors = [];
  const charIds = data.characters.map((c) => c.id);

  if (!charIds.length) errors.push("Adicione ao menos um personagem.");

  const npcIds = data.npcs.map((n) => n.id);
  data.story.phases.forEach((p, idx) => {
    p.enemies.forEach((e) => {
      if (!npcIds.includes(e.id)) {
        errors.push(`A fase "${p.name}" (índice ${idx}) possui o inimigo inválido "${e.id}".`);
      }
    });
  });

  return { valid: errors.length === 0, errors, data };
}
