import { BattleGame } from "./game.js?v=0.4.0";
import { normalizeGameData, validateGameData } from "./content.js?v=0.4.0";
import { StoryScene } from "./story.js?v=0.4.0";

const STORAGE_KEY = "ovelha-battle-missao-2-progress";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let config;
let progress;
let battle;
let storyScene;
let saveWarningShown = false;
let activeScreen = "home";
let rosterFilter = "todos";
let detailCharacterId = "gabriel";
let dialogCloseAction = null;

const dom = {
  loading: $("#loading"),
  loadingStatus: $("#loading-status"),
  app: $("#app"),
  battleView: $("#battle-view"),
  dialog: $("#game-dialog"),
  dialogContent: $("#dialog-content"),
  dialogClose: $("#dialog-close"),
  toastStack: $("#toast-stack")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const rest = String(safe % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function getCharacter(id) {
  return config.characters.find((character) => character.id === id);
}

function getPhase(id) {
  return config.story.phases.find((phase) => phase.id === id);
}

function getRarity(character) {
  return config.rarities[character.rarity];
}

function characterUnlocked(id) {
  return progress.unlockedCharacters.includes(id);
}

function skinOwned(characterId, skinId) {
  return (progress.ownedSkins[characterId] || []).includes(skinId);
}

function getSelectedSkin(character) {
  const selectedId = progress.selectedSkins[character.id] || "base";
  return character.skins.find((skin) => skin.id === selectedId) || character.skins[0];
}

function getLevel(characterId) {
  return progress.levels[characterId] || 1;
}

function getUpgradeCost(characterId) {
  const level = getLevel(characterId);
  const { baseCost, costGrowth } = config.economy.upgrade;
  return baseCost + (level - 1) * costGrowth;
}

function isPhaseComplete(phaseId) {
  return progress.completedPhases.includes(phaseId);
}

function canPlayPhase(phase) {
  if (phase.number === 1) return true;
  const previous = config.story.phases.find((candidate) => candidate.number === phase.number - 1);
  return previous ? isPhaseComplete(previous.id) : false;
}

function nextStoryPhase() {
  return config.story.phases.find((phase) => !isPhaseComplete(phase.id) && canPlayPhase(phase)) || config.story.phases.at(-1);
}

function createDefaultProgress() {
  const unlockedCharacters = config.characters
    .filter((character) => character.unlockedAtStart)
    .map((character) => character.id);
  const levels = {};
  const selectedSkins = {};
  const ownedSkins = {};

  for (const character of config.characters) {
    levels[character.id] = 1;
    selectedSkins[character.id] = "base";
    ownedSkins[character.id] = character.skins
      .filter((skin) => skin.ownedAtStart)
      .map((skin) => skin.id);
  }

  return {
    saveVersion: config.meta.saveVersion,
    currencies: { ...config.economy.startingBalance },
    unlockedCharacters,
    levels,
    selectedCharacter: unlockedCharacters[0] || config.characters[0].id,
    selectedSkins,
    ownedSkins,
    completedPhases: [],
    ownedItems: [],
    ownedModifiers: [],
    equippedModifier: null,
    summonIndex: 0,
    stats: { wins: 0, defeats: 0, totalKills: 0 }
  };
}

function loadProgress() {
  const defaults = createDefaultProgress();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") return defaults;
    const merged = {
      ...defaults,
      ...stored,
      currencies: { ...defaults.currencies, ...(stored.currencies || {}) },
      levels: { ...defaults.levels, ...(stored.levels || {}) },
      selectedSkins: { ...defaults.selectedSkins, ...(stored.selectedSkins || {}) },
      ownedSkins: { ...defaults.ownedSkins, ...(stored.ownedSkins || {}) },
      stats: { ...defaults.stats, ...(stored.stats || {}) }
    };
    merged.unlockedCharacters = [...new Set([...(stored.unlockedCharacters || []), ...defaults.unlockedCharacters])]
      .filter((id) => Boolean(getCharacter(id)));
    merged.completedPhases = [...new Set(stored.completedPhases || [])]
      .filter((id) => Boolean(getPhase(id)));
    merged.ownedItems = [...new Set(stored.ownedItems || [])];
    merged.ownedModifiers = [...new Set(stored.ownedModifiers || [])];
    for (const character of config.characters) {
      merged.ownedSkins[character.id] = [...new Set([...(defaults.ownedSkins[character.id] || []), ...(merged.ownedSkins[character.id] || [])])]
        .filter(id => character.skins.some(skin => skin.id === id));
      if (!merged.ownedSkins[character.id].includes(merged.selectedSkins[character.id])) merged.selectedSkins[character.id] = "base";
      merged.levels[character.id] = Math.max(1, Math.min(config.economy.upgrade.maxLevel, Number(merged.levels[character.id]) || 1));
    }
    if (!config.lab.items.some(item => item.id === merged.equippedModifier)) merged.equippedModifier = null;
    if (!merged.unlockedCharacters.includes(merged.selectedCharacter)) merged.selectedCharacter = defaults.selectedCharacter;
    return merged;
  } catch (error) {
    console.warn("Progresso local inválido; usando um novo save.", error);
    return defaults;
  }
}

function saveProgress() {
  progress.saveVersion = config.meta.saveVersion;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch {
    if (!saveWarningShown) showToast("Salvamento indisponível", "O navegador não permitiu salvar o progresso neste dispositivo.", "!", "#ffd166");
    saveWarningShown = true;
  }
}

async function loadConfig() {
  if (window.ovelhaAPI?.loadGameData) {
    return window.ovelhaAPI.loadGameData();
  }
  const response = await fetch("data/game.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar game.json (${response.status})`);
  return response.json();
}

function artworkHtml(character, options = {}) {
  const skin = options.skin || getSelectedSkin(character);
  const sizeClass = options.sizeClass || "";
  if (skin?.portrait || character.portrait || skin?.sprite || character.sprite) {
    const source = skin?.portrait || character.portrait || skin?.sprite || character.sprite;
    return `<img class="${escapeHtml(sizeClass)}" src="${escapeHtml(source)}" alt="Retrato de ${escapeHtml(character.name)}" />`;
  }
  return `
    <div class="token-art ${escapeHtml(sizeClass)}"
      style="--token:${escapeHtml(character.token.color)};--token-accent:${escapeHtml(character.token.accent)}"
      aria-label="Ficha de ${escapeHtml(character.name)}">
      ${escapeHtml(character.token.initial)}
    </div>`;
}

function miniAvatarHtml(character, skin = getSelectedSkin(character)) {
  return `<div class="mini-avatar" style="--token:${escapeHtml(character.token.color)};--token-accent:${escapeHtml(character.token.accent)}">${artworkHtml(character, { skin })}</div>`;
}

function rarityStyle(character) {
  return `--rarity:${escapeHtml(getRarity(character).color)};--token:${escapeHtml(character.token.color)};--token-accent:${escapeHtml(character.token.accent)}`;
}

function showToast(title, message, icon = "✓", color = "#52efb4") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.style.setProperty("--toast-color", color);
  toast.innerHTML = `<span>${escapeHtml(icon)}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(message)}</small></div>`;
  dom.toastStack.append(toast);
  setTimeout(() => toast.remove(), 3800);
}

function showDialog(content, { closeable = true, onClose = null } = {}) {
  if (dom.dialog.open) dom.dialog.close();
  dom.dialogContent.innerHTML = content;
  dom.dialogClose.classList.toggle("is-hidden", !closeable);
  dialogCloseAction = onClose;
  dom.dialog.showModal();
}

function closeDialog(runAction = true) {
  if (dom.dialog.open) dom.dialog.close();
  const callback = dialogCloseAction;
  dialogCloseAction = null;
  if (runAction) callback?.();
}

function navigate(screen) {
  activeScreen = screen;
  $$(".screen").forEach((section) => section.classList.toggle("is-active", section.dataset.screen === screen));
  $$(".nav-button").forEach((button) => button.classList.toggle("is-active", button.dataset.screenTarget === screen));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (screen === "roster") renderRoster();
}

function renderCurrencies() {
  $("#currency-licano").textContent = formatNumber(progress.currencies.licano);
  $("#currency-upgrade").textContent = formatNumber(progress.currencies.upgradePoints);
}

function renderSidebar() {
  const character = getCharacter(progress.selectedCharacter);
  const skin = getSelectedSkin(character);
  $("#sidebar-avatar").innerHTML = artworkHtml(character, { skin });
  $("#sidebar-character-name").textContent = character.name;
  $("#sidebar-character-level").textContent = `Nível ${getLevel(character.id)}`;
}

function renderHome() {
  const character = getCharacter(progress.selectedCharacter);
  const skin = getSelectedSkin(character);
  const rarity = getRarity(character);
  const phase = nextStoryPhase();
  const modifier = config.lab.items.find((item) => item.id === progress.equippedModifier);

  $("#home-intro").textContent = config.story.intro;
  $("#monthly-message").textContent = config.meta.monthlyMessage;
  $("#home-hero-sprite").innerHTML = artworkHtml(character, { skin });
  $("#home-hero-rarity").textContent = rarity.label.toUpperCase();
  $("#home-hero-rarity").style.color = rarity.color;
  $("#home-hero-name").textContent = skin.name;
  $("#home-hero-role").textContent = `${character.role} • Nível ${getLevel(character.id)}`;

  const complete = isPhaseComplete(phase.id);
  $("#featured-phase").innerHTML = `
    <div class="featured-phase">
      <span class="featured-phase-index">${phase.number}</span>
      <div><strong>${escapeHtml(phase.name)}</strong><small>${escapeHtml(phase.objective.label)}</small></div>
      <button class="button button-primary" data-play-phase="${escapeHtml(phase.id)}">${complete ? "Rejogar" : "Jogar"}</button>
    </div>`;

  $("#home-modifier-status").innerHTML = modifier
    ? `<div class="home-modifier"><span class="status-orb" style="color:${modifier.color}">${escapeHtml(modifier.icon)}</span><div><strong>${escapeHtml(modifier.name)} equipado</strong><span>${escapeHtml(modifier.description)}</span></div></div>`
    : `<div class="home-modifier"><span class="status-orb">∅</span><div><strong>Sem modificador</strong><span>Entre no laboratório para equipar Cavernizo ou Repriton.</span></div></div>`;

  $("#home-character-goal").innerHTML = `
    <div class="home-goal">
      ${miniAvatarHtml(character, skin)}
      <div><strong>${escapeHtml(character.name)}</strong><span>${escapeHtml(character.storyGoal)}</span></div>
    </div>`;
}

function renderStory() {
  $("#story-progress-value").textContent = `${progress.completedPhases.length}/${config.story.phases.length}`;
  $("#story-phase-grid").innerHTML = config.story.phases.map((phase) => {
    const accessible = canPlayPhase(phase);
    const complete = isPhaseComplete(phase.id);
    const rewardSkin = phase.reward.skin
      ? getCharacter(phase.reward.skin.characterId)?.skins.find((skin) => skin.id === phase.reward.skin.skinId)
      : null;
    return `
      <article class="phase-card ${accessible ? "" : "is-locked"} ${complete ? "is-complete" : ""}" style="--phase-color:${escapeHtml(phase.palette.crystal)}">
        <div class="phase-index">${complete ? "✓" : phase.number}</div>
        <div class="phase-main">
          <span class="phase-kicker">${escapeHtml(phase.subtitle)}</span>
          <h2>${escapeHtml(phase.name)}</h2>
          <p>${escapeHtml(phase.description)}</p>
          <div class="phase-meta">
            <span class="meta-chip">◷ ${formatTime(phase.timeLimit)}</span>
            <span class="meta-chip">◎ ${escapeHtml(phase.objective.label)}</span>
            ${rewardSkin ? `<span class="meta-chip">✦ ${escapeHtml(rewardSkin.name)}</span>` : ""}
          </div>
        </div>
        <div class="phase-actions">
          <span class="phase-reward">◈ ${formatNumber(phase.reward.licano)} <b>⬡ ${formatNumber(phase.reward.upgradePoints)}</b></span>
          <button class="button ${accessible ? "button-primary" : "button-secondary"}" data-play-phase="${escapeHtml(phase.id)}" ${accessible ? "" : "disabled"}>
            ${accessible ? (complete ? "Rejogar" : "Entrar") : "Bloqueada"}
          </button>
        </div>
      </article>`;
  }).join("");

  $("#story-character-list").innerHTML = config.characters.map((character) => `
    <div class="story-character-row">
      ${miniAvatarHtml(character)}
      <div><strong>${escapeHtml(character.name)} ${characterUnlocked(character.id) ? "" : "• Bloqueado"}</strong><span>${escapeHtml(character.storyGoal)}</span></div>
    </div>`).join("");
}

function renderRarityFilters() {
  const entries = [["todos", { label: "Todos" }], ...Object.entries(config.rarities)];
  $("#rarity-filters").innerHTML = entries.map(([id, rarity]) => `
    <button class="filter-button ${rosterFilter === id ? "is-active" : ""}" data-rarity-filter="${escapeHtml(id)}">${escapeHtml(rarity.label)}</button>`).join("");
}

function renderRoster() {
  renderRarityFilters();
  const characters = config.characters.filter((character) => rosterFilter === "todos" || character.rarity === rosterFilter);
  $("#roster-grid").innerHTML = characters.map((character) => {
    const unlocked = characterUnlocked(character.id);
    const selected = progress.selectedCharacter === character.id;
    const rarity = getRarity(character);
    const skin = getSelectedSkin(character);
    return `
      <article class="character-card ${unlocked ? "" : "is-locked"} ${selected ? "is-selected" : ""}" data-character-card="${escapeHtml(character.id)}" role="button" tabindex="0" aria-label="Ver ${escapeHtml(character.name)}" style="${rarityStyle(character)}">
        <div class="character-art">
          ${artworkHtml(character, { skin })}
          ${unlocked ? "" : `<div class="locked-cover"><span>⌁</span><small>Conjure para liberar</small></div>`}
        </div>
        <div class="character-card-info">
          <div><small>${escapeHtml(rarity.label)}</small><strong>${escapeHtml(character.name)}</strong></div>
          <span>Nv. ${getLevel(character.id)}</span>
        </div>
      </article>`;
  }).join("");

  if (!characters.some((character) => character.id === detailCharacterId)) detailCharacterId = characters[0]?.id || config.characters[0].id;
  renderCharacterDetail();
}

function renderCharacterDetail() {
  const character = getCharacter(detailCharacterId);
  if (!character) return;
  const rarity = getRarity(character);
  const unlocked = characterUnlocked(character.id);
  const selected = progress.selectedCharacter === character.id;
  const level = getLevel(character.id);
  const maxLevel = config.economy.upgrade.maxLevel;
  const cost = getUpgradeCost(character.id);
  const hp = Math.round(character.stats.hp * (1 + config.economy.upgrade.hpPerLevel * (level - 1)));
  const damage = Math.round(character.stats.damage * (1 + config.economy.upgrade.damagePerLevel * (level - 1)));
  const skin = getSelectedSkin(character);

  $("#character-detail").style.setProperty("--rarity", rarity.color);
  $("#character-detail").innerHTML = `
    <div class="detail-hero" style="--rarity:${escapeHtml(rarity.color)}">${artworkHtml(character, { skin })}</div>
    <span class="detail-rarity" style="--rarity:${escapeHtml(rarity.color)}">${escapeHtml(rarity.label)}</span>
    <h2>${escapeHtml(character.name)}</h2>
    <span class="detail-role">${escapeHtml(character.role)} • Nível ${level}</span>
    <p>${escapeHtml(character.description)}</p>
    <div class="stat-grid">
      <div class="stat-box"><span>Vida</span><strong>${formatNumber(hp)}</strong></div>
      <div class="stat-box"><span>Ataque</span><strong>${formatNumber(damage)}</strong></div>
      <div class="stat-box"><span>Veloc.</span><strong>${formatNumber(character.stats.speed)}</strong></div>
      <div class="stat-box"><span>Desvio</span><strong>${Math.round(character.stats.dodge * 100)}%</strong></div>
    </div>
    ${unlocked ? `
      <div class="upgrade-row">
        <div><strong>Subir para nível ${Math.min(level + 1, maxLevel)}</strong><small>${level >= maxLevel ? "Nível máximo alcançado" : `${cost} pontos de upgrade`}</small></div>
        <button class="button button-secondary" data-upgrade-character="${escapeHtml(character.id)}" ${level >= maxLevel || progress.currencies.upgradePoints < cost ? "disabled" : ""}>⬡ Melhorar</button>
      </div>
      <button class="button ${selected ? "button-secondary" : "button-primary"} button-wide" data-select-character="${escapeHtml(character.id)}" ${selected ? "disabled" : ""}>${selected ? "Personagem selecionado" : "Selecionar personagem"}</button>
      <div class="skin-list">
        <span class="eyebrow">SKINS</span>
        ${character.skins.map((option) => {
          const owned = skinOwned(character.id, option.id);
          const active = skin.id === option.id;
          return `<button class="skin-option ${active ? "is-active" : ""}" data-equip-skin="${escapeHtml(character.id)}:${escapeHtml(option.id)}" ${owned ? "" : "disabled"}>
            ${option.portrait || option.sprite ? `<img src="${escapeHtml(option.portrait || option.sprite)}" alt="Retrato de ${escapeHtml(option.name)}" />` : `<span class="mini-avatar">${escapeHtml(character.token.initial)}</span>`}
            <strong>${escapeHtml(option.name)}</strong><span>${owned ? (active ? "Equipada" : "Usar") : `Bloqueada • ◈ ${option.price}`}</span>
          </button>`;
        }).join("")}
      </div>` : `
      <div class="upgrade-row"><div><strong>Personagem bloqueado</strong><small>Ele aparecerá na ordem pública da Conjuração.</small></div><span>⌁</span></div>
      <button class="button button-primary button-wide" data-screen-jump="summon">Ir para Conjuração</button>`}
  `;
}

function getSummonRemaining() {
  return config.economy.summon.queue.filter(id => !characterUnlocked(id)).map(getCharacter).filter(Boolean);
}

function renderSummon() {
  const summon = config.economy.summon;
  const remaining = getSummonRemaining();
  const next = remaining[0];
  $("#summon-description").textContent = summon.description;
  $("#summon-price").innerHTML = next
    ? `<strong>◈ ${formatNumber(summon.price)}</strong><span>Licanô por personagem</span>`
    : `<strong>✓ Completa</strong><span>Todos os personagens da fila foram liberados</span>`;

  const button = $("#summon-button");
  button.disabled = !next || progress.currencies.licano < summon.price;
  button.textContent = next
    ? (progress.currencies.licano >= summon.price ? `Conjurar ${next.name}` : `Faltam ${summon.price - progress.currencies.licano} Licanô`)
    : "Fila concluída";

  if (next) {
    const rarity = getRarity(next);
    $("#summon-preview").innerHTML = `
      <div class="summon-character" style="--rarity:${escapeHtml(rarity.color)}">
        ${artworkHtml(next, { skin: next.skins[0] })}
        <div class="summon-nameplate"><span>PRÓXIMO • ${escapeHtml(rarity.label.toUpperCase())}</span><strong>${escapeHtml(next.name)}</strong></div>
      </div>`;
  } else {
    $("#summon-preview").innerHTML = `<div class="summon-character"><div class="token-art" style="--token:#52efb4;--token-accent:#38c9ff">✓</div><div class="summon-nameplate"><span>FILA CONCLUÍDA</span><strong>Expedição completa</strong></div></div>`;
  }

  $("#summon-queue").innerHTML = remaining.length
    ? remaining.map((character, index) => {
      const rarity = getRarity(character);
      return `<div class="queue-card ${index === 0 ? "is-next" : ""}">${miniAvatarHtml(character, character.skins[0])}<strong>${escapeHtml(character.name)}</strong><small>${index === 0 ? "PRÓXIMO" : `POSIÇÃO ${index + 1}`} • ${escapeHtml(rarity.label)}</small></div>`;
    }).join("")
    : `<div class="queue-card is-next"><span>✓</span><strong>Ninguém aguardando</strong><small>A fila mensal foi concluída</small></div>`;
  saveProgress();
}

function itemOwned(item) {
  if (item.type === "skin") return skinOwned(item.characterId, item.skinId);
  if (item.type === "cosmetic") return progress.ownedItems.includes(item.id);
  return false;
}

function renderShop() {
  const bytela = getCharacter("bytela") || config.characters[0];
  $("#shopkeeper-visual").innerHTML = artworkHtml(bytela, { skin: getSelectedSkin(bytela) });
  $("#shop-subtitle").textContent = config.shop.subtitle;
  $("#shop-grid").innerHTML = config.shop.items.map((item) => {
    const owned = itemOwned(item);
    const characterLocked = item.type === "skin" && !characterUnlocked(item.characterId);
    const disabled = owned || characterLocked || progress.currencies.licano < item.price;
    let buttonText = `Comprar • ◈ ${formatNumber(item.price)}`;
    if (owned) buttonText = "Já adquirido";
    else if (characterLocked) buttonText = "Personagem bloqueado";
    else if (progress.currencies.licano < item.price) buttonText = "Licanô insuficiente";
    return `
      <article class="shop-item" style="--item-color:${item.type === "skin" ? "#ea4ed7" : item.type === "upgradePoints" ? "#36d9ff" : "#ffd166"}">
        <span class="item-icon">${escapeHtml(item.icon)}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="item-footer">
          <span class="${owned ? "owned-label" : "item-price"}">${owned ? "ADQUIRIDO" : `◈ ${formatNumber(item.price)}`}</span>
          <button class="button button-secondary" data-buy-shop="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>${escapeHtml(buttonText)}</button>
        </div>
      </article>`;
  }).join("");
}

function renderLab() {
  const ai = getCharacter("gabriel_ai") || config.characters[0];
  $("#lab-character-visual").innerHTML = artworkHtml(ai, { skin: getSelectedSkin(ai) });
  $("#lab-subtitle").textContent = config.lab.subtitle;
  $("#lab-grid").innerHTML = config.lab.items.map((item) => {
    const owned = progress.ownedModifiers.includes(item.id);
    const equipped = progress.equippedModifier === item.id;
    const canBuy = progress.currencies.licano >= item.price;
    const effectLabels = [];
    if (item.effects.damageMultiplier > 1) effectLabels.push(`Ataque +${Math.round((item.effects.damageMultiplier - 1) * 100)}%`);
    if (item.effects.speedMultiplier > 1) effectLabels.push(`Velocidade +${Math.round((item.effects.speedMultiplier - 1) * 100)}%`);
    if (item.effects.speedMultiplier < 1) effectLabels.push(`Velocidade ${Math.round((item.effects.speedMultiplier - 1) * 100)}%`);
    if (item.effects.dodgeBonus > 0) effectLabels.push(`Desvio +${Math.round(item.effects.dodgeBonus * 100)}%`);
    if (item.effects.caveVersion) effectLabels.push("Ativa versão das cavernas");
    const action = owned ? (equipped ? "Desequipar" : "Equipar") : `Comprar • ◈ ${item.price}`;
    return `
      <article class="lab-item ${equipped ? "is-equipped" : ""}" style="--item-color:${escapeHtml(item.color)}">
        <span class="item-icon">${escapeHtml(item.icon)}</span>
        <h3>${escapeHtml(item.name)} ${equipped ? "• EQUIPADO" : ""}</h3>
        <p>${escapeHtml(item.description)}</p>
        <ul class="effect-list">${effectLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>
        <div class="item-footer">
          <span class="${owned ? "owned-label" : "item-price"}">${owned ? "LIBERADO" : `◈ ${formatNumber(item.price)}`}</span>
          <button class="button button-secondary" data-lab-action="${escapeHtml(item.id)}" ${!owned && !canBuy ? "disabled" : ""}>${escapeHtml(action)}</button>
        </div>
      </article>`;
  }).join("");
}

function renderAll() {
  renderCurrencies();
  renderSidebar();
  renderHome();
  renderStory();
  renderRoster();
  renderSummon();
  renderShop();
  renderLab();
}

function selectCharacter(id) {
  if (!characterUnlocked(id)) return;
  progress.selectedCharacter = id;
  detailCharacterId = id;
  saveProgress();
  renderAll();
  showToast("Personagem selecionado", `${getCharacter(id).name} entrou na linha de frente.`, "♟", getRarity(getCharacter(id)).color);
}

function equipSkin(characterId, skinId) {
  if (!skinOwned(characterId, skinId)) return;
  progress.selectedSkins[characterId] = skinId;
  saveProgress();
  renderAll();
  const skin = getCharacter(characterId).skins.find((option) => option.id === skinId);
  showToast("Skin equipada", skin.name, "✦", "#ea4ed7");
}

function upgradeCharacter(id) {
  const level = getLevel(id);
  if (!characterUnlocked(id) || level >= config.economy.upgrade.maxLevel) return;
  const cost = getUpgradeCost(id);
  if (progress.currencies.upgradePoints < cost) return;
  progress.currencies.upgradePoints -= cost;
  progress.levels[id] = level + 1;
  saveProgress();
  renderAll();
  showToast("Upgrade concluído", `${getCharacter(id).name} chegou ao nível ${level + 1}.`, "⬡", "#36d9ff");
}

function summonNextCharacter() {
  const summon = config.economy.summon;
  const next = getSummonRemaining()[0];
  if (!next || progress.currencies.licano < summon.price) return;
  progress.currencies.licano -= summon.price;
  progress.unlockedCharacters.push(next.id);
  progress.summonIndex += 1;
  saveProgress();
  renderAll();
  const rarity = getRarity(next);
  showDialog(`
    <div class="dialog-body" style="--dialog-color:${escapeHtml(rarity.color)}">
      <div class="dialog-icon">✦</div>
      <span class="eyebrow">CONJURAÇÃO CONCLUÍDA • ${escapeHtml(rarity.label.toUpperCase())}</span>
      <h2>${escapeHtml(next.name)}</h2>
      <div class="detail-hero" style="--rarity:${escapeHtml(rarity.color)};width:100%;margin:10px 0">${artworkHtml(next, { skin: next.skins[0] })}</div>
      <p>${escapeHtml(next.description)}</p>
      <div class="dialog-actions"><button class="button button-primary" id="summon-select-button">Selecionar personagem</button><button class="button button-secondary" id="summon-continue-button">Continuar</button></div>
    </div>`, { closeable: false });
  $("#summon-select-button").addEventListener("click", () => { closeDialog(false); selectCharacter(next.id); navigate("roster"); });
  $("#summon-continue-button").addEventListener("click", () => closeDialog(false));
}

function buyShopItem(id) {
  const item = config.shop.items.find((entry) => entry.id === id);
  if (!item || itemOwned(item) || progress.currencies.licano < item.price) return;
  if (item.type === "skin" && !characterUnlocked(item.characterId)) return;
  progress.currencies.licano -= item.price;
  if (item.type === "upgradePoints") progress.currencies.upgradePoints += item.amount;
  if (item.type === "cosmetic") progress.ownedItems.push(item.id);
  if (item.type === "skin") {
    progress.ownedSkins[item.characterId] ||= [];
    progress.ownedSkins[item.characterId].push(item.skinId);
  }
  saveProgress();
  renderAll();
  showToast("Compra concluída", item.name, item.icon, "#ffd166");
}

function handleLabAction(id) {
  const item = config.lab.items.find((entry) => entry.id === id);
  if (!item) return;
  const owned = progress.ownedModifiers.includes(id);
  if (!owned) {
    if (progress.currencies.licano < item.price) return;
    progress.currencies.licano -= item.price;
    progress.ownedModifiers.push(id);
    progress.equippedModifier = id;
    showToast("Item banido adquirido", `${item.name} foi equipado.`, item.icon, item.color);
  } else {
    progress.equippedModifier = progress.equippedModifier === id ? null : id;
    showToast(progress.equippedModifier ? "Modificador equipado" : "Modificador removido", item.name, item.icon, item.color);
  }
  saveProgress();
  renderAll();
}

function updateBattleHud(state) {
  $("#battle-timer-value").textContent = formatTime(state.timeRemaining);
  $("#battle-objective-label").textContent = state.objectiveLabel;
  $("#battle-objective-progress").textContent = `${state.objectiveValue} / ${state.objectiveTarget}`;
  $("#battle-objective-bar").style.width = `${Math.min(100, (state.objectiveValue / state.objectiveTarget) * 100)}%`;
  $("#battle-hp-bar").style.width = `${Math.max(0, (state.hp / state.maxHp) * 100)}%`;
  $("#battle-hp-text").textContent = `${formatNumber(state.hp)} / ${formatNumber(state.maxHp)}`;
}

function addBattleFeed(message) {
  const feed = $("#battle-feed");
  const item = document.createElement("span");
  item.className = "feed-item";
  item.textContent = message;
  feed.prepend(item);
  while (feed.children.length > 4) feed.lastElementChild.remove();
  setTimeout(() => item.remove(), 3600);
}

function startBattle(phaseId, { skipStory = false } = {}) {
  const phase = getPhase(phaseId);
  if (!phase || !canPlayPhase(phase)) return;
  battle.stop();
  dom.battleView.classList.add("is-hidden");
  document.body.style.overflow = "";
  if (skipStory) { storyScene.close(); launchBattle(phaseId); }
  else storyScene.open(phase, config.characters);
}

function launchBattle(phaseId) {
  const phase = getPhase(phaseId);
  if (!phase || !canPlayPhase(phase)) return;
  const character = getCharacter(progress.selectedCharacter);
  const skin = getSelectedSkin(character);
  const modifier = config.lab.items.find((item) => item.id === progress.equippedModifier) || null;

  $("#battle-phase-kicker").textContent = `FASE ${phase.number}`;
  $("#battle-phase-name").textContent = phase.name;
  $("#battle-character-name").textContent = skin.name;
  $("#battle-modifier-name").textContent = modifier ? modifier.name : "Sem modificador";
  $("#battle-avatar").innerHTML = artworkHtml(character, { skin });
  $("#battle-feed").innerHTML = "";
  $("#pause-card").classList.add("is-hidden");
  dom.battleView.classList.remove("is-hidden");
  document.body.style.overflow = "hidden";

  battle.start({ phase, character, level: getLevel(character.id), skin, modifier });
  $("#game-canvas").focus({ preventScroll: true });
}

function exitBattle() {
  storyScene.close();
  battle.stop();
  dom.battleView.classList.add("is-hidden");
  $("#pause-card").classList.add("is-hidden");
  document.body.style.overflow = "";
  renderAll();
}

function requestBattleExit() {
  battle.togglePause(true);
  showDialog(`
    <div class="dialog-body" style="--dialog-color:#ff5e76">
      <div class="dialog-icon">←</div><span class="eyebrow">ABANDONAR EXPEDIÇÃO</span><h2>Sair desta fase?</h2>
      <p>O progresso da batalha atual será perdido. Seu personagem e seus itens continuam salvos.</p>
      <div class="dialog-actions"><button class="button button-danger" id="confirm-exit-battle">Sair da fase</button><button class="button button-secondary" id="cancel-exit-battle">Continuar jogando</button></div>
    </div>`, { onClose: () => battle.togglePause(false) });
  $("#confirm-exit-battle").addEventListener("click", () => { closeDialog(false); exitBattle(); });
  $("#cancel-exit-battle").addEventListener("click", () => { closeDialog(false); battle.togglePause(false); });
}

function grantPhaseReward(phase) {
  progress.currencies.licano += phase.reward.licano;
  progress.currencies.upgradePoints += phase.reward.upgradePoints;
  let unlockedSkin = null;
  if (phase.reward.skin) {
    const { characterId, skinId } = phase.reward.skin;
    progress.ownedSkins[characterId] ||= [];
    if (!progress.ownedSkins[characterId].includes(skinId)) {
      progress.ownedSkins[characterId].push(skinId);
      unlockedSkin = getCharacter(characterId)?.skins.find((skin) => skin.id === skinId) || null;
    }
  }
  if (!progress.completedPhases.includes(phase.id)) progress.completedPhases.push(phase.id);
  return unlockedSkin;
}

function handleBattleWin(result) {
  progress.stats.wins += 1;
  progress.stats.totalKills += result.kills;
  const unlockedSkin = grantPhaseReward(result.phase);
  const nextPhase = config.story.phases.find(phase => phase.number === result.phase.number + 1);
  saveProgress();
  showDialog(`
    <div class="dialog-body" style="--dialog-color:#52efb4">
      <div class="dialog-icon">✓</div>
      <span class="eyebrow">FASE CONCLUÍDA</span>
      <h2>${escapeHtml(result.phase.name)}</h2>
      <p>${result.kills} NPCs derrotados • ${formatTime(result.elapsed)} • ${Math.round((result.hp / result.maxHp) * 100)}% de vida restante</p>
      <div class="reward-list">
        <div class="reward-chip"><strong>◈ ${formatNumber(result.phase.reward.licano)}</strong><span>Licanô</span></div>
        <div class="reward-chip"><strong>⬡ ${formatNumber(result.phase.reward.upgradePoints)}</strong><span>Pontos de upgrade</span></div>
        ${unlockedSkin ? `<div class="reward-chip"><strong>✦ Nova skin</strong><span>${escapeHtml(unlockedSkin.name)}</span></div>` : ""}
      </div>
      <div class="dialog-actions">${nextPhase ? '<button class="button button-primary" id="next-phase-button">Próxima fase →</button>' : ""}<button class="button button-secondary" id="collect-reward-button">Voltar ao mapa</button><button class="button button-secondary" id="replay-phase-button">Jogar novamente</button></div>
    </div>`, { closeable: false });
  $("#collect-reward-button").addEventListener("click", () => { closeDialog(false); exitBattle(); navigate("story"); });
  $("#next-phase-button")?.addEventListener("click", () => { closeDialog(false); startBattle(nextPhase.id); });
  $("#replay-phase-button").addEventListener("click", () => { closeDialog(false); startBattle(result.phase.id, { skipStory: true }); });
}

function handleBattleLose(result) {
  progress.stats.defeats += 1;
  progress.stats.totalKills += result.kills;
  saveProgress();
  showDialog(`
    <div class="dialog-body" style="--dialog-color:#ff5e76">
      <div class="dialog-icon">!</div>
      <span class="eyebrow">EXPEDIÇÃO INTERROMPIDA</span>
      <h2>Tente outra rota</h2>
      <p>${escapeHtml(result.reason)} Você derrubou ${result.kills} NPCs nesta tentativa.</p>
      <div class="dialog-actions"><button class="button button-primary" id="retry-phase-button">Tentar novamente</button><button class="button button-secondary" id="leave-after-defeat">Voltar ao mapa</button></div>
    </div>`, { closeable: false });
  $("#retry-phase-button").addEventListener("click", () => { closeDialog(false); startBattle(result.phase.id, { skipStory: true }); });
  $("#leave-after-defeat").addEventListener("click", () => { closeDialog(false); exitBattle(); navigate("story"); });
}

function bindStaticEvents() {
  document.addEventListener("click", (event) => {
    const screenButton = event.target.closest("[data-screen-target], [data-screen-jump]");
    if (screenButton) {
      navigate(screenButton.dataset.screenTarget || screenButton.dataset.screenJump);
      return;
    }
    const playButton = event.target.closest("[data-play-phase]");
    if (playButton) { startBattle(playButton.dataset.playPhase); return; }
    const filterButton = event.target.closest("[data-rarity-filter]");
    if (filterButton) { rosterFilter = filterButton.dataset.rarityFilter; renderRoster(); return; }
    const characterCard = event.target.closest("[data-character-card]");
    if (characterCard) { detailCharacterId = characterCard.dataset.characterCard; renderRoster(); return; }
    const selectButton = event.target.closest("[data-select-character]");
    if (selectButton) { selectCharacter(selectButton.dataset.selectCharacter); return; }
    const upgradeButton = event.target.closest("[data-upgrade-character]");
    if (upgradeButton) { upgradeCharacter(upgradeButton.dataset.upgradeCharacter); return; }
    const skinButton = event.target.closest("[data-equip-skin]");
    if (skinButton) {
      const [characterId, skinId] = skinButton.dataset.equipSkin.split(":");
      equipSkin(characterId, skinId);
      return;
    }
    const shopButton = event.target.closest("[data-buy-shop]");
    if (shopButton) { buyShopItem(shopButton.dataset.buyShop); return; }
    const labButton = event.target.closest("[data-lab-action]");
    if (labButton) handleLabAction(labButton.dataset.labAction);
  });

  $("#continue-story-button").addEventListener("click", () => startBattle(nextStoryPhase().id));
  $("#summon-button").addEventListener("click", summonNextCharacter);
  dom.dialogClose.addEventListener("click", () => closeDialog(true));
  dom.dialog.addEventListener("click", (event) => {
    if (event.target === dom.dialog && !dom.dialogClose.classList.contains("is-hidden")) closeDialog(true);
  });
  dom.dialog.addEventListener("cancel", (event) => {
    if (dom.dialogClose.classList.contains("is-hidden")) event.preventDefault();
    else { event.preventDefault(); closeDialog(true); }
  });

  $("#battle-exit-button").addEventListener("click", requestBattleExit);
  $("#battle-pause-button").addEventListener("click", () => battle.togglePause());
  $("#resume-button").addEventListener("click", () => battle.togglePause(false));
  $("#pause-exit-button").addEventListener("click", requestBattleExit);

  const touchButtons = [...$$("[data-touch-key]"), $("#touch-attack-button")];
  touchButtons.forEach(button => {
    const code = button.dataset.touchKey || "Space";
    button.addEventListener("pointerdown", event => {
      event.preventDefault(); button.setPointerCapture?.(event.pointerId);
      battle.setKey(code, true); button.classList.add("is-pressed");
      if (code === "Space") battle.attackNearest();
    });
    const release = () => { battle.setKey(code, false); button.classList.remove("is-pressed"); };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
  });
  const suspend = () => {
    storyScene?.suspend(); battle?.togglePause(true);
    touchButtons.forEach(button => button.classList.remove("is-pressed"));
  };
  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
  window.addEventListener("blur", suspend);
  window.addEventListener("pagehide", () => { storyScene?.close(); battle?.togglePause(true); });
  document.addEventListener("keydown", event => {
    const card = event.target.closest?.("[data-character-card]");
    if (card && ["Enter", " "].includes(event.key)) { event.preventDefault(); card.click(); }
  });
  $$(".nav-button").forEach(button => {
    const label = button.lastElementChild.textContent;
    button.setAttribute("aria-label", label); button.title = label;
  });

  $("#reset-progress-button").addEventListener("click", () => {
    showDialog(`
      <div class="dialog-body" style="--dialog-color:#ff5e76">
        <div class="dialog-icon">!</div><span class="eyebrow">APAGAR SAVE LOCAL</span><h2>Reiniciar tudo?</h2>
        <p>Personagens, níveis, skins, fases, Licanô e modificadores voltarão ao estado inicial.</p>
        <div class="dialog-actions"><button class="button button-danger" id="confirm-reset">Reiniciar progresso</button><button class="button button-secondary" id="cancel-reset">Cancelar</button></div>
      </div>`);
    $("#confirm-reset").addEventListener("click", () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      progress = createDefaultProgress();
      detailCharacterId = progress.selectedCharacter;
      saveProgress();
      closeDialog(false);
      renderAll();
      navigate("home");
      showToast("Progresso reiniciado", "Um novo save foi criado.", "↻", "#ff5e76");
    });
    $("#cancel-reset").addEventListener("click", () => closeDialog(false));
  });
}

function setupBattle() {
  battle = new BattleGame({
    canvas: $("#game-canvas"),
    config,
    onHud: updateBattleHud,
    onFeed: addBattleFeed,
    onWin: handleBattleWin,
    onLose: handleBattleLose,
    onPause: (paused) => {
      $("#pause-card").classList.toggle("is-hidden", !paused);
      if (!paused) $("#game-canvas").focus({ preventScroll: true });
    }
  });
}

async function initialize() {
  try {
    dom.loadingStatus.textContent = "Abrindo a Distopia das Cavernas";
    const rawConfig = await loadConfig();
    const errors = validateGameData(rawConfig);
    if (errors.length) throw new Error(errors.slice(0, 3).join(" • "));
    config = normalizeGameData(rawConfig);
    progress = loadProgress();
    detailCharacterId = progress.selectedCharacter;
    document.title = `${config.meta.title}: ${config.meta.subtitle}`;
    $("#home-title").innerHTML = `${escapeHtml(config.meta.subtitle)}:<br><em>${escapeHtml(config.meta.chapter)}</em>`;
    $(".brand strong").textContent = config.meta.title.toUpperCase();
    $(".brand small").textContent = config.meta.subtitle.toUpperCase();
    $(".season-pill span:last-child").textContent = config.meta.chapter;
    bindStaticEvents();
    setupBattle();
    storyScene = new StoryScene({ root: $("#story-dialog"), onPlay: launchBattle, onBack: () => navigate("story") });
    $("#story-summary").textContent = `${config.story.phases.length} fases, ${config.characters.length} personagens e recompensas para sua expedição.`;
    renderAll();
    navigate(activeScreen);
    dom.loading.classList.add("is-hidden");
    dom.app.classList.remove("is-hidden");

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  } catch (error) {
    console.error(error);
    dom.loadingStatus.innerHTML = `Não foi possível abrir o jogo.<br><small>${escapeHtml(error.message)} — use o servidor incluído no projeto.</small>`;
  }
}

initialize();
