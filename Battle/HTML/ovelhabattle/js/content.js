// Conteúdo padrão. Os campos do game.json substituem estes valores.
// A lore pode ser editada aqui ou na ficha da fase no editor.html.
export const STORY_LORE = {
  fase_1: { speaker: "gabriel", lines: [
    "O caminho para a Distopia foi reaberto. Dentro das cavernas, os corredores parecem ter vida própria.",
    "A entrada se fechou atrás da expedição. Entre as rachaduras, Rastejantes começam a se mover.",
    "Antes de descobrir quem está reescrevendo estes caminhos, precisamos abrir passagem."
  ] },
  fase_2: { speaker: "bytela", lines: [
    "O antigo mercado está afundado nas ruínas. Foi aqui que a Bytelã perdeu parte dos arquivos da sua loja.",
    "Fragmentos de dados ainda brilham entre as pedras, mas as patrulhas também encontraram o lugar.",
    "Recupere os fragmentos. Cada arquivo pode revelar um pedaço do caminho até o centro da caverna."
  ] },
  fase_3: { speaker: "drop", lines: [
    "Mais adiante, o vapor do Repriton toma conta do lago. Tudo aqui parece se mover mais depressa.",
    "O caminho desapareceu na névoa. Os Vigias se aproximam antes que a expedição consiga atravessar.",
    "Continue em movimento e resista até a passagem reaparecer."
  ] },
  fase_4: { speaker: "gabriel_ai", lines: [
    "A mina guarda os experimentos com Cavernizo. Seus efeitos transformaram guardas em criaturas de pedra viva.",
    "A força dessas versões das cavernas já não cabe nos limites do laboratório.",
    "Derrube os elites para seguir adiante. O núcleo da Distopia está próximo."
  ] },
  fase_5: { speaker: "gabriel", lines: [
    "No centro da Distopia, até o corredor parece pensar. A expedição finalmente alcançou o núcleo.",
    "O Regente de Basalto protege a passagem. A caverna começa a fechar a própria saída.",
    "Enfrente o Regente antes que o tempo termine. Esta é a última passagem da missão."
  ] }
};

export const CONTENT_DEFAULTS = {
  meta: { title: "Ovelha Battle", subtitle: "Missão 2", chapter: "Distopia das Cavernas", version: "0.4.0", monthlyMessage: "Novas fases da história chegam todo mês.", saveVersion: 2 },
  rarities: {
    criador: { label: "Criador", color: "#ffd166" }, secreto: { label: "Secreto", color: "#ff4fd8" },
    lenda: { label: "Lenda", color: "#9b7bff" }, cidadao: { label: "Cidadão", color: "#42d7ff" },
    cabo: { label: "Cabo", color: "#78e38b" }, morador: { label: "Morador", color: "#b8c0d9" }
  },
  stats: { hp: 3500, damage: 500, speed: 200, dodge: 0.05, range: 300, cooldown: 0.6, projectileSpeed: 650 },
  npc: { kind: "melee", hp: 900, damage: 180, speed: 78, radius: 19, reward: 1, color: "#cf6cff", accent: "#7437b5", elite: false, boss: false, range: 245, cooldown: 1.65, projectileSpeed: 250 },
  palette: { ground: "#17142b", path: "#29224c", crystal: "#7d5cff", mist: "#ea4ddb" },
  economy: {
    currencies: { licano: { label: "Licanô", icon: "◈" }, upgradePoints: { label: "Pontos de upgrade", icon: "⬡" } },
    startingBalance: { licano: 320, upgradePoints: 180 },
    upgrade: { baseCost: 70, costGrowth: 45, maxLevel: 10, hpPerLevel: 0.09, damagePerLevel: 0.075 },
    summon: { title: "Conjuração do Gabriel", description: "Pague um preço fixo. O próximo personagem aparece antes da compra.", price: 250, currency: "licano", previewNext: true }
  }
};

export const copyContent = value => JSON.parse(JSON.stringify(value));
export const contentId = name => String(name || "novo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "novo";
export function uniqueContentId(name, used) {
  const base = contentId(name); let id = base, index = 2;
  while (used.includes(id) || ["__proto__", "prototype", "constructor"].includes(id)) id = `${base}_${index++}`;
  return id;
}
const framesFor = item => item.battleFrames?.length ? item.battleFrames : item.sprite ? [item.sprite] : [];
const labelForObjective = (type, target) => ({ defeat: `Derrote ${target} inimigos`, collect: `Colete ${target} fragmentos`, survive: `Sobreviva por ${target} segundos`, elite: `Derrote ${target} elites`, boss: "Derrote o chefe" }[type] || "Complete a fase");

export function normalizeGameData(raw) {
  const d = copyContent(raw), D = CONTENT_DEFAULTS;
  d.meta = { ...D.meta, ...d.meta };
  d.rarities = d.rarities ? { ...d.rarities } : copyContent(D.rarities);
  d.characters = (d.characters || []).map((c, index) => {
    c.id ||= contentId(c.name); c.name ||= c.id; c.rarity ||= "morador";
    c.role ||= "Combatente"; c.description ||= ""; c.storyGoal ||= "Explorar as cavernas e concluir a expedição.";
    c.unlockedAtStart ??= index === 0;
    c.stats = { ...D.stats, ...c.stats };
    c.token = { color: "#f5ead6", accent: d.rarities[c.rarity]?.color || "#8d5cff", initial: c.name.slice(0, 2).toUpperCase(), ...c.token };
    c.battleFrames = framesFor(c); c.sprite ||= c.battleFrames[0] || ""; c.portrait ||= c.sprite;
    const base = { id: "base", name: c.name, sprite: c.sprite, portrait: c.portrait, battleFrames: c.battleFrames, ownedAtStart: true, price: 0 };
    const skins = c.skins || [];
    c.skins = [{ ...base, ...skins.find(s => s.id === "base"), ownedAtStart: true }, ...skins.filter(s => s.id !== "base")].map(s => {
      const frames = framesFor(s);
      return { price: 0, ownedAtStart: false, ...s, id: s.id || contentId(s.name), name: s.name || c.name, battleFrames: frames.length ? frames : c.battleFrames, sprite: s.sprite || frames[0] || c.sprite, portrait: s.portrait || c.portrait };
    });
    return c;
  });
  if (d.characters.length && !d.characters.some(c => c.unlockedAtStart)) d.characters[0].unlockedAtStart = true;
  const economy = d.economy || {};
  d.economy = { ...D.economy, ...economy, currencies: { ...D.economy.currencies, ...economy.currencies }, startingBalance: { ...D.economy.startingBalance, ...economy.startingBalance }, upgrade: { ...D.economy.upgrade, ...economy.upgrade }, summon: { ...D.economy.summon, ...economy.summon } };
  const locked = d.characters.filter(c => !c.unlockedAtStart).map(c => c.id);
  d.economy.summon.queue = [...new Set([...(economy.summon?.queue || []).filter(id => locked.includes(id)), ...locked])];
  d.npcs = (d.npcs || []).map(n => {
    const kind = n.kind || (n.boss ? "boss" : n.elite ? "elite" : "melee");
    const preset = kind === "boss" ? { hp: 13500, damage: 410, speed: 48, radius: 48, reward: 10 } : {};
    return { ...D.npc, ...preset, ...n, id: n.id || contentId(n.name), kind, boss: kind === "boss" || n.boss === true, elite: ["boss", "elite"].includes(kind) || n.elite === true };
  });
  d.story = { intro: "A expedição atravessa as cavernas da Distopia.", ...d.story };
  d.story.phases = (d.story.phases || []).map((p, i) => {
    const type = p.objective?.type || "defeat", target = p.objective?.target ?? (type === "boss" ? 1 : type === "survive" ? 45 : 10);
    const pool = p.enemies ?? p.npcPool ?? [];
    const phase = { subtitle: "Distopia das Cavernas", description: "", timeLimit: 90, spawnInterval: 1.2, bossSpawnAt: 8, ...p, id: p.id || contentId(p.name), number: i + 1,
      objective: { type, target, label: labelForObjective(type, target), ...p.objective },
      npcPool: pool.map(n => typeof n === "string" ? { id: n, weight: 1 } : { weight: 1, ...n }),
      reward: { licano: 80, upgradePoints: 40, ...p.reward }, palette: { ...D.palette, ...p.palette }
    };
    if (type === "boss") phase.bossId ||= d.npcs.find(n => n.boss)?.id || "";
    phase.lore = p.lore === false ? { lines: [] } : p.lore || STORY_LORE[phase.id] || { speaker: d.characters[0]?.id, lines: [p.description || p.name] };
    if (typeof phase.lore === "string") phase.lore = { lines: [phase.lore] };
    return phase;
  });
  d.shop = { title: "Loja da Bytelã", subtitle: "Skins, cosméticos e upgrades para a expedição.", items: [], ...d.shop };
  for (const c of d.characters) for (const s of c.skins) {
    if (s.id === "base" || s.ownedAtStart || s.inShop === false || d.shop.items.some(item => item.type === "skin" && item.characterId === c.id && item.skinId === s.id)) continue;
    d.shop.items.push({ id: `skin_${c.id}_${s.id}`, type: "skin", name: s.name, description: s.description || `Visual de ${c.name}.`, price: s.price, characterId: c.id, skinId: s.id, icon: "✦" });
  }
  d.lab = { title: "Laboratório do Gabriel.AI", subtitle: "Equipe um modificador por batalha.", items: [], ...d.lab };
  d.lab.items = d.lab.items.map(item => ({ color: "#9b7bff", icon: "⬢", ...item, effects: { damageMultiplier: 1, speedMultiplier: 1, dodgeBonus: 0, caveVersion: false, ...item.effects } }));
  d.controls ||= {};
  return d;
}

// Converte o formato antigo em conteúdo curto, mantendo IDs e valores personalizados.
export function editableGameData(raw) {
  const d = copyContent(raw);
  delete d._editingGuide;
  for (const c of d.characters || []) {
    c.id ||= contentId(c.name);
    const base = c.skins?.find(s => s.id === "base");
    if (base) { c.portrait = base.portrait || c.portrait; c.battleFrames = framesFor(base).length ? framesFor(base) : framesFor(c); }
    else if (c.sprite && !c.battleFrames?.length) c.battleFrames = [c.sprite];
    delete c.sprite;
    c.skins = (c.skins || []).filter(s => s.id !== "base");
    for (const s of c.skins) {
      s.id ||= contentId(s.name); if (s.sprite && !s.battleFrames?.length) s.battleFrames = [s.sprite]; delete s.sprite;
      const item = d.shop?.items?.find(it => it.type === "skin" && it.characterId === c.id && it.skinId === s.id);
      if (item) { s.price = item.price; s.description ||= item.description; }
    }
    if (!c.skins.length) delete c.skins;
    // Vida, ataque e velocidade ficam visíveis; o restante só precisa existir se diferir do padrão.
    for (const [key, value] of Object.entries(c.stats || {})) {
      if (!["hp", "damage", "speed"].includes(key) && value === CONTENT_DEFAULTS.stats[key]) delete c.stats[key];
    }
    for (const skin of c.skins || []) {
      if (skin.ownedAtStart === false) delete skin.ownedAtStart;
      if (skin.inShop === true) delete skin.inShop;
    }
  }
  if (d.shop?.items) d.shop.items = d.shop.items.filter(it => it.type !== "skin");
  for (const n of d.npcs || []) {
    n.id ||= contentId(n.name);
    const kind = n.kind || (n.boss ? "boss" : n.elite ? "elite" : "melee");
    n.kind = kind;
    const defaults = { ...CONTENT_DEFAULTS.npc, boss: kind === "boss", elite: ["boss", "elite"].includes(kind), ...(kind === "boss" ? { radius: 48 } : {}) };
    for (const [key, value] of Object.entries(n)) {
      if (!["id", "name", "kind", "hp", "damage", "speed"].includes(key) && value === defaults[key]) delete n[key];
    }
    delete n.reward; // Licanô é concedido pela vitória, na recompensa da fase.
  }
  for (const p of d.story?.phases || []) {
    p.id ||= contentId(p.name); delete p.number;
    if (!p.enemies && p.npcPool) p.enemies = p.npcPool.map(n => n.weight === 1 ? n.id : n);
    delete p.npcPool;
    if (p.objective?.type === "boss") p.bossId ||= (d.npcs || []).find(n => n.boss || n.kind === "boss")?.id;
  }
  return d;
}

export function validateGameData(raw) {
  const errors = [];
  const issue = message => errors.push(message);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["O arquivo não contém dados de jogo."];
  for (const [label, list] of [["Personagens", raw.characters], ["Inimigos", raw.npcs], ["Fases", raw.story?.phases]]) {
    if (!Array.isArray(list)) issue(`${label}: lista ausente ou inválida.`);
    else if (list.some(item => !item || typeof item !== "object" || Array.isArray(item))) issue(`${label}: há uma ficha inválida.`);
  }
  if (errors.length) return errors;
  let d; try { d = normalizeGameData(raw); } catch { return ["Há campos com formato inválido. Importe um game.json compatível."]; }
  if (!d.characters.length) issue("Mantenha pelo menos um personagem.");
  if (!d.story.phases.length) issue("Mantenha pelo menos uma fase.");
  const checkIds = (items, label) => {
    const ids = new Set(); for (const item of items) {
      if (!/^[a-z0-9_-]+$/.test(item.id || "") || ["__proto__", "prototype", "constructor"].includes(item.id)) issue(`${label}: identificação inválida em ${item.name || "ficha sem nome"}.`);
      if (ids.has(item.id)) issue(`${label}: identificação repetida (${item.id}).`); ids.add(item.id);
      if (typeof item.name !== "string" || !item.name.trim()) issue(`${label}: preencha o nome.`);
    }
  };
  const num = (v, min, max, label, integer = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) issue(`${label}: use ${integer ? "um inteiro" : "um número"} entre ${min} e ${max}.`);
  };
  const art = (v, label) => { if (v && (typeof v !== "string" || /^(?:javascript|data|file):/i.test(v) || v.includes("\\") || /^[a-z]:/i.test(v))) issue(`${label}: use um caminho relativo do jogo ou endereço https.`); };
  const colors = (values, label) => { for (const v of Object.values(values || {})) if (typeof v !== "string" || !/^#[a-f\d]{6}$/i.test(v)) issue(`${label}: use cores como #8d5cff.`); };
  for (const [id, rarity] of Object.entries(d.rarities)) {
    if (!/^[a-z0-9_-]+$/.test(id) || !rarity || typeof rarity.label !== "string" || !rarity.label.trim()) issue("Raridades: nome ou identificação inválida.");
    colors({ color: rarity?.color }, "Raridades");
  }
  checkIds(d.characters, "Personagens"); checkIds(d.npcs, "Inimigos"); checkIds(d.story.phases, "Fases");
  for (const c of d.characters) {
    if (!Object.hasOwn(d.rarities, c.rarity)) issue(`${c.name}: raridade não encontrada.`);
    for (const [k, v] of Object.entries(c.stats)) if (k in CONTENT_DEFAULTS.stats) num(v, k === "dodge" ? 0 : 0.01, k === "dodge" ? 0.75 : 1000000, `${c.name}: ${k}`);
    checkIds(c.skins, `Skins de ${c.name}`);
    for (const item of [c, ...c.skins]) { art(item.portrait, item.name); if (!Array.isArray(item.battleFrames)) issue(`${item.name}: os quadros de caminhada precisam ser uma lista.`); else for (const frame of item.battleFrames) art(frame, item.name); }
    for (const s of c.skins) num(s.price, 0, 10000000, `${s.name}: preço`, true);
    colors({ color: c.token.color, accent: c.token.accent }, c.name);
  }
  for (const n of d.npcs) {
    if (!["melee", "ranged", "tank", "dash", "elite", "boss"].includes(n.kind)) issue(`${n.name}: comportamento desconhecido.`);
    for (const k of ["hp", "damage", "speed", "radius", "cooldown", "projectileSpeed", "range"]) num(n[k], 0.01, 1000000, `${n.name}: ${k}`);
    art(n.sprite, n.name); colors({ color: n.color, accent: n.accent }, n.name);
  }
  const skinExists = reward => d.characters.some(c => c.id === reward.characterId && c.skins.some(s => s.id === reward.skinId));
  for (const p of d.story.phases) {
    const type = p.objective.type;
    if (!["defeat", "collect", "survive", "elite", "boss"].includes(type)) issue(`${p.name}: objetivo desconhecido.`);
    num(p.objective.target, 1, type === "collect" ? 100 : 10000, `${p.name}: meta`, true);
    num(p.timeLimit, 5, 3600, `${p.name}: duração`); num(p.spawnInterval, 0.2, 60, `${p.name}: intervalo`);
    if (type === "survive" && p.objective.target > p.timeLimit) issue(`${p.name}: a meta excede o tempo da fase.`);
    if (!p.npcPool.length && type !== "boss") issue(`${p.name}: escolha pelo menos um inimigo.`);
    for (const n of p.npcPool) { if (!d.npcs.some(t => t.id === n.id)) issue(`${p.name}: inimigo não encontrado (${n.id}).`); num(n.weight, 0.01, 10000, `${p.name}: frequência`); }
    if (type === "elite" && !p.npcPool.some(n => d.npcs.some(t => t.id === n.id && t.elite))) issue(`${p.name}: inclua um inimigo elite.`);
    if (type === "boss") {
      if (!d.npcs.some(n => n.id === p.bossId && n.boss)) issue(`${p.name}: escolha um chefe válido.`);
      num(p.bossSpawnAt, 0, p.timeLimit - 1, `${p.name}: surgimento do chefe`);
      if (p.objective.target !== 1) issue(`${p.name}: a meta de chefe deve ser 1.`);
      if (p.npcPool.some(n => n.id === p.bossId)) issue(`${p.name}: remova o chefe da lista de reforços; ele surge separadamente.`);
    }
    for (const k of ["licano", "upgradePoints"]) num(p.reward[k], 0, 10000000, `${p.name}: recompensa`, true);
    if (p.reward.skin && !skinExists(p.reward.skin)) issue(`${p.name}: a skin da recompensa não existe.`);
    colors(p.palette, p.name); art(p.background, p.name);
    if (!Array.isArray(p.lore.lines) || p.lore.lines.some(line => typeof line !== "string")) issue(`${p.name}: escreva a história como uma lista de falas.`);
  }
  checkIds(d.shop.items, "Loja"); checkIds(d.lab.items, "Laboratório");
  for (const item of d.shop.items) { num(item.price, 0, 10000000, `${item.name}: preço`, true); if (item.type === "skin" && !skinExists(item)) issue(`${item.name}: skin não encontrada.`); if (!["skin", "cosmetic", "upgradePoints"].includes(item.type)) issue(`${item.name}: tipo inválido.`); if (item.type === "upgradePoints") num(item.amount, 1, 10000000, `${item.name}: pontos`, true); }
  for (const item of d.lab.items) { num(item.price, 0, 10000000, `${item.name}: preço`, true); num(item.effects.damageMultiplier, 0.1, 10, `${item.name}: ataque`); num(item.effects.speedMultiplier, 0.1, 5, `${item.name}: velocidade`); num(item.effects.dodgeBonus, 0, 0.75, `${item.name}: desvio`); }
  num(d.economy.summon.price, 0, 10000000, "Conjuração: preço", true);
  for (const k of ["licano", "upgradePoints"]) num(d.economy.startingBalance[k], 0, 10000000, `Saldo: ${k}`, true);
  num(d.economy.upgrade.maxLevel, 1, 100, "Upgrade: nível máximo", true);
  for (const k of ["baseCost", "costGrowth", "hpPerLevel", "damagePerLevel"]) num(d.economy.upgrade[k], 0, 100000, `Upgrade: ${k}`);
  return [...new Set(errors)];
}
