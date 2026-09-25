const WORLD = { width: 1280, height: 720 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const randomBetween = (min, max) => min + Math.random() * (max - min);

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return entries.at(-1)?.id;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const bigint = Number.parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class BattleGame {
  constructor({ canvas, config, onHud, onFeed, onWin, onLose, onPause }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.config = config;
    this.onHud = onHud;
    this.onFeed = onFeed;
    this.onWin = onWin;
    this.onLose = onLose;
    this.onPause = onPause;

    this.keys = new Set();
    this.pointer = { x: WORLD.width / 2, y: WORLD.height / 2, down: false };
    this.frameId = null;
    this.lastFrame = 0;
    this.lastHudAt = 0;
    this.entityId = 0;
    this.imageCache = new Map();
    this.running = false;
    this.paused = false;
    this.finished = false;

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handlePointer = this.handlePointer.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    canvas.addEventListener("pointermove", this.handlePointer);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);
  }

  start({ phase, character, level, skin, modifier }) {
    this.stop();
    this.phase = phase;
    this.character = character;
    this.level = level;
    this.skin = skin;
    this.modifier = modifier;
    this.palette = phase.palette;
    this.backgroundImage = this.loadImage(phase.background);

    const upgrade = this.config.economy.upgrade;
    const levelIndex = Math.max(0, level - 1);
    const hpMultiplier = 1 + upgrade.hpPerLevel * levelIndex;
    const damageMultiplier = 1 + upgrade.damagePerLevel * levelIndex;
    const effects = modifier?.effects ?? {
      damageMultiplier: 1,
      speedMultiplier: 1,
      dodgeBonus: 0,
      caveVersion: false
    };

    this.player = {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      radius: 27,
      hp: Math.round(character.stats.hp * hpMultiplier),
      maxHp: Math.round(character.stats.hp * hpMultiplier),
      damage: Math.round(character.stats.damage * damageMultiplier * effects.damageMultiplier),
      speed: character.stats.speed * effects.speedMultiplier,
      dodge: clamp(character.stats.dodge + effects.dodgeBonus, 0, 0.75),
      range: character.stats.range,
      cooldown: character.stats.cooldown,
      projectileSpeed: character.stats.projectileSpeed,
      attackTimer: 0,
      invulnerableTimer: 0,
      hitFlash: 0,
      caveVersion: effects.caveVersion,
      token: character.token,
      images: [],
      facingAngle: 0,
      walkTime: 0,
      moving: false
    };

    this.npcs = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.collectibles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.elapsed = 0;
    this.timeRemaining = phase.timeLimit;
    this.spawnTimer = 0.45;
    this.objectiveValue = 0;
    this.kills = 0;
    this.bossSpawned = false;
    this.shake = 0;
    this.finished = false;
    this.paused = false;
    this.running = true;

    this.createCaveDecor();
    this.createObjectiveObjects();
    const battleFrames = skin?.battleFrames?.length
      ? skin.battleFrames
      : character.battleFrames?.length
        ? character.battleFrames
        : [skin?.sprite || character.sprite].filter(Boolean);
    this.loadPlayerImages(battleFrames);
    this.resize();
    this.emitFeed("A expedição começou.");
    this.emitHud(true);

    this.lastFrame = performance.now();
    this.frameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    clearTimeout(this.finishTimer);
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.keys.clear();
    this.pointer.down = false;
  }

  destroy() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.canvas.removeEventListener("pointermove", this.handlePointer);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerUp);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setKey(code, active) {
    if (active && this.running && !this.paused && !this.finished) this.keys.add(code);
    else this.keys.delete(code);
  }

  handleKeyDown(event) {
    if (!this.running || this.finished || event.defaultPrevented || event.target?.closest?.("dialog[open], input, textarea, select")) return;
    if (event.code === "Space" && event.target?.closest?.("button")) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "Escape"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Escape" && !event.repeat) {
      this.togglePause();
      return;
    }
    if (this.paused) return;
    this.keys.add(event.code);
    if (event.code === "Space") this.attackNearest();
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  handlePointer(event) {
    if (!this.running) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * WORLD.width;
    this.pointer.y = ((event.clientY - rect.top) / rect.height) * WORLD.height;
  }

  handlePointerDown(event) {
    if (!this.running || this.paused || event.button !== 0) return;
    this.handlePointer(event);
    this.pointer.down = true;
    this.shoot(this.pointer.x, this.pointer.y);
  }

  handlePointerUp() {
    this.pointer.down = false;
  }

  togglePause(force) {
    if (!this.running || this.finished) return;
    this.paused = typeof force === "boolean" ? force : !this.paused;
    this.keys.clear();
    this.pointer.down = false;
    this.onPause?.(this.paused);
    this.lastFrame = performance.now();
  }

  attackNearest() {
    if (!this.running || this.paused || !this.player) return;
    const nearest = this.npcs
      .filter((npc) => !npc.dead)
      .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    if (nearest) this.shoot(nearest.x, nearest.y);
  }

  shoot(targetX, targetY) {
    if (this.player.attackTimer > 0 || this.paused || this.finished) return;
    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const length = Math.hypot(dx, dy) || 1;
    this.player.facingAngle = Math.atan2(dy, dx) + Math.PI / 2;
    this.player.attackTimer = this.player.cooldown;
    this.bullets.push({
      id: ++this.entityId,
      x: this.player.x + (dx / length) * 30,
      y: this.player.y + (dy / length) * 30,
      vx: (dx / length) * this.player.projectileSpeed,
      vy: (dy / length) * this.player.projectileSpeed,
      radius: 8,
      damage: this.player.damage,
      life: Math.max(0.5, this.player.range / this.player.projectileSpeed),
      color: this.player.caveVersion ? "#ff9b50" : "#a878ff"
    });
    this.createBurst(this.player.x, this.player.y, this.player.caveVersion ? "#ff9955" : "#a978ff", 5, 90);
  }

  loadImage(path) {
    if (!path) return null;
    if (!this.imageCache.has(path)) {
      const image = new Image();
      image.src = path;
      this.imageCache.set(path, image);
    }
    return this.imageCache.get(path);
  }

  loadPlayerImages(paths) {
    this.player.images = [...new Set(paths.filter(Boolean))]
      .map((path) => this.loadImage(path))
      .filter(Boolean);
  }

  createCaveDecor() {
    this.decor = [];
    const safeCenter = { x: WORLD.width / 2, y: WORLD.height / 2 };
    for (let index = 0; index < 34; index += 1) {
      let x;
      let y;
      do {
        x = randomBetween(40, WORLD.width - 40);
        y = randomBetween(40, WORLD.height - 40);
      } while (Math.hypot(x - safeCenter.x, y - safeCenter.y) < 155);

      this.decor.push({
        x,
        y,
        size: randomBetween(8, 25),
        rotation: randomBetween(0, Math.PI * 2),
        type: Math.random() > 0.42 ? "crystal" : "rock",
        alpha: randomBetween(0.24, 0.62)
      });
    }
    this.fog = Array.from({ length: 18 }, () => ({
      x: randomBetween(0, WORLD.width),
      y: randomBetween(0, WORLD.height),
      radius: randomBetween(55, 150),
      speed: randomBetween(4, 13),
      alpha: randomBetween(0.012, 0.035)
    }));
  }

  createObjectiveObjects() {
    if (this.phase.objective.type !== "collect") return;
    for (let index = 0; index < this.phase.objective.target; index += 1) {
      const angle = (index / this.phase.objective.target) * Math.PI * 2 + randomBetween(-0.28, 0.28);
      const radius = randomBetween(180, 305);
      this.collectibles.push({
        id: ++this.entityId,
        x: WORLD.width / 2 + Math.cos(angle) * radius,
        y: WORLD.height / 2 + Math.sin(angle) * radius,
        radius: 15,
        rotation: Math.random() * Math.PI,
        collected: false
      });
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.035);
    this.lastFrame = now;

    if (!this.paused && !this.finished) this.update(dt);
    this.draw();
    if (now - this.lastHudAt > 70) {
      this.emitHud();
      this.lastHudAt = now;
    }
    this.frameId = requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.elapsed += dt;
    this.timeRemaining = Math.max(0, this.phase.timeLimit - this.elapsed);
    this.spawnTimer -= dt;
    this.player.attackTimer = Math.max(0, this.player.attackTimer - dt);
    this.player.invulnerableTimer = Math.max(0, this.player.invulnerableTimer - dt);
    this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 18);

    this.updatePlayer(dt);
    this.updateSpawning();
    this.updateNpcs(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    this.updateCollectibles(dt);
    this.updateEffects(dt);
    this.updateObjective();

    if (this.pointer.down && this.player.attackTimer <= 0) this.shoot(this.pointer.x, this.pointer.y);
    if (this.keys.has("Space") && this.player.attackTimer <= 0) this.attackNearest();

    if (this.player.hp <= 0) this.finish(false, "A equipe perdeu contato com o personagem.");
    else if (this.timeRemaining <= 0 && !this.objectiveComplete()) this.finish(false, "O corredor se fechou antes do objetivo.");
    else if (this.objectiveComplete()) this.finish(true);
  }

  updatePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has("KeyW")) dy -= 1;
    if (this.keys.has("KeyS")) dy += 1;
    if (this.keys.has("KeyA")) dx -= 1;
    if (this.keys.has("KeyD")) dx += 1;
    const length = Math.hypot(dx, dy) || 1;
    this.player.moving = Boolean(dx || dy);
    if (this.player.moving) {
      this.player.facingAngle = Math.atan2(dy, dx) + Math.PI / 2;
      this.player.walkTime += dt;
      this.player.x += (dx / length) * this.player.speed * dt;
      this.player.y += (dy / length) * this.player.speed * dt;
      if (Math.random() < 0.18) {
        this.particles.push({
          x: this.player.x + randomBetween(-12, 12),
          y: this.player.y + randomBetween(-8, 8),
          vx: randomBetween(-10, 10),
          vy: randomBetween(8, 28),
          life: 0.45,
          maxLife: 0.45,
          size: randomBetween(2, 5),
          color: this.modifier?.id === "repriton" ? "#4effbd" : "#8d5cff"
        });
      }
    } else this.player.walkTime = 0;
    this.player.x = clamp(this.player.x, 38, WORLD.width - 38);
    this.player.y = clamp(this.player.y, 42, WORLD.height - 38);
  }

  updateSpawning() {
    const maxNpcs = this.phase.objective.type === "boss" ? 24 : 19;
    if (this.phase.npcPool.length && this.spawnTimer <= 0 && this.npcs.filter((npc) => !npc.dead).length < maxNpcs) {
      this.spawnTimer = this.phase.spawnInterval * randomBetween(0.78, 1.22);
      this.spawnNpc(weightedPick(this.phase.npcPool));
    }

    if (
      this.phase.objective.type === "boss" &&
      !this.bossSpawned &&
      this.elapsed >= (this.phase.bossSpawnAt ?? 8)
    ) {
      this.bossSpawned = true;
      this.spawnNpc(this.phase.bossId, true);
      const boss = this.config.npcs.find(npc => npc.id === this.phase.bossId);
      this.emitFeed(`${boss?.name || "O chefe"} chegou à arena.`);
      this.shake = 11;
    }
  }

  spawnNpc(id, forceBoss = false) {
    const template = this.config.npcs.find((npc) => npc.id === id);
    if (!template) return;
    const edge = Math.floor(Math.random() * 4);
    const padding = template.radius + 12;
    let x;
    let y;
    if (edge === 0) { x = randomBetween(40, WORLD.width - 40); y = -padding; }
    if (edge === 1) { x = WORLD.width + padding; y = randomBetween(40, WORLD.height - 40); }
    if (edge === 2) { x = randomBetween(40, WORLD.width - 40); y = WORLD.height + padding; }
    if (edge === 3) { x = -padding; y = randomBetween(40, WORLD.height - 40); }

    const phaseScale = 1 + (this.phase.number - 1) * 0.08;
    this.npcs.push({
      ...template,
      boss: forceBoss || template.boss,
      id: ++this.entityId,
      templateId: template.id,
      x,
      y,
      hp: Math.round(template.hp * phaseScale),
      maxHp: Math.round(template.hp * phaseScale),
      damage: Math.round(template.damage * (1 + (this.phase.number - 1) * 0.055)),
      attackTimer: randomBetween(0.25, 1),
      dashTimer: randomBetween(1, 2.5),
      rotation: Math.random() * Math.PI,
      facingAngle: 0,
      walkTime: randomBetween(0, 1),
      image: this.loadImage(template.sprite),
      hitFlash: 0,
      dead: false
    });
  }

  updateNpcs(dt) {
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      npc.attackTimer -= dt;
      npc.dashTimer -= dt;
      npc.hitFlash = Math.max(0, npc.hitFlash - dt);
      npc.rotation += dt * (npc.boss ? 0.45 : 0.8);

      const dx = this.player.x - npc.x;
      const dy = this.player.y - npc.y;
      const length = Math.hypot(dx, dy) || 1;
      const currentDistance = length;
      let speed = npc.speed;
      npc.facingAngle = Math.atan2(dy, dx) + Math.PI / 2;
      npc.walkTime += dt * clamp(speed / 80, 0.65, 2.2);

      if (npc.kind === "dash" && npc.dashTimer <= 0) {
        npc.dashTimer = randomBetween(1.8, 3);
        speed *= 3.2;
        this.createBurst(npc.x, npc.y, npc.color, 9, 120);
      }

      if (npc.kind === "ranged" || npc.kind === "boss") {
        const desired = npc.boss ? 240 : 205;
        if (currentDistance > desired + 22) {
          npc.x += (dx / length) * speed * dt;
          npc.y += (dy / length) * speed * dt;
        } else if (currentDistance < desired - 45) {
          npc.x -= (dx / length) * speed * 0.65 * dt;
          npc.y -= (dy / length) * speed * 0.65 * dt;
        }
        if (npc.attackTimer <= 0 && currentDistance < (npc.range || 240) + 65) {
          npc.attackTimer = npc.cooldown || 1.7;
          this.enemyBullets.push({
            id: ++this.entityId,
            x: npc.x,
            y: npc.y,
            vx: (dx / length) * (npc.projectileSpeed || 250),
            vy: (dy / length) * (npc.projectileSpeed || 250),
            radius: npc.boss ? 12 : 8,
            damage: npc.damage,
            life: 2.2,
            color: npc.color
          });
          if (npc.boss && Math.random() > 0.48) this.fireBossSpread(npc, Math.atan2(dy, dx));
        }
      } else {
        npc.x += (dx / length) * speed * dt;
        npc.y += (dy / length) * speed * dt;
      }

      if (currentDistance < this.player.radius + npc.radius && npc.attackTimer <= 0) {
        npc.attackTimer = npc.boss ? 1.05 : 0.78;
        this.damagePlayer(npc.damage);
        npc.x -= (dx / length) * 18;
        npc.y -= (dy / length) * 18;
      }
    }
  }

  fireBossSpread(npc, baseAngle) {
    for (const offset of [-0.35, 0.35]) {
      const angle = baseAngle + offset;
      this.enemyBullets.push({
        id: ++this.entityId,
        x: npc.x,
        y: npc.y,
        vx: Math.cos(angle) * npc.projectileSpeed,
        vy: Math.sin(angle) * npc.projectileSpeed,
        radius: 9,
        damage: Math.round(npc.damage * 0.7),
        life: 2.2,
        color: npc.color
      });
    }
  }

  updateBullets(dt) {
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      for (const npc of this.npcs) {
        if (npc.dead || bullet.dead) continue;
        if (Math.hypot(bullet.x - npc.x, bullet.y - npc.y) < bullet.radius + npc.radius) {
          bullet.dead = true;
          npc.hp -= bullet.damage;
          npc.hitFlash = 0.1;
          this.addFloatingText(npc.x, npc.y - npc.radius, `-${bullet.damage}`, "#ffffff");
          this.createBurst(bullet.x, bullet.y, npc.color, npc.boss ? 10 : 5, 115);
          if (npc.hp <= 0) this.defeatNpc(npc);
        }
      }
    }
    this.bullets = this.bullets.filter((bullet) => !bullet.dead && bullet.life > 0);
  }

  updateEnemyBullets(dt) {
    for (const bullet of this.enemyBullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (
        !bullet.dead &&
        Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y) < bullet.radius + this.player.radius
      ) {
        bullet.dead = true;
        this.damagePlayer(bullet.damage);
      }
    }
    this.enemyBullets = this.enemyBullets.filter((bullet) => !bullet.dead && bullet.life > 0);
  }

  updateCollectibles(dt) {
    for (const collectible of this.collectibles) {
      if (collectible.collected) continue;
      collectible.rotation += dt * 1.8;
      if (distance(this.player, collectible) < this.player.radius + collectible.radius + 4) {
        collectible.collected = true;
        this.objectiveValue += 1;
        this.emitFeed(`Fragmento recuperado: ${this.objectiveValue}/${this.phase.objective.target}`);
        this.createBurst(collectible.x, collectible.y, this.palette.crystal, 14, 165);
        this.addFloatingText(collectible.x, collectible.y - 20, "+ FRAGMENTO", this.palette.crystal);
      }
    }
  }

  updateEffects(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);

    for (const text of this.floatingTexts) {
      text.y -= 32 * dt;
      text.life -= dt;
    }
    this.floatingTexts = this.floatingTexts.filter((text) => text.life > 0);

    for (const fog of this.fog) {
      fog.x += fog.speed * dt;
      if (fog.x - fog.radius > WORLD.width) fog.x = -fog.radius;
    }
  }

  updateObjective() {
    if (this.phase.objective.type === "survive") {
      this.objectiveValue = Math.min(this.phase.objective.target, this.elapsed);
    }
  }

  damagePlayer(amount) {
    if (this.player.invulnerableTimer > 0 || this.finished) return;
    this.player.invulnerableTimer = 0.25;
    if (Math.random() < this.player.dodge) {
      this.addFloatingText(this.player.x, this.player.y - 40, "DESVIO", "#4effbd");
      this.createBurst(this.player.x, this.player.y, "#4effbd", 8, 115);
      return;
    }
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.hitFlash = 0.14;
    this.shake = Math.min(13, this.shake + 5);
    this.addFloatingText(this.player.x, this.player.y - 42, `-${amount}`, "#ff6983");
  }

  defeatNpc(npc) {
    npc.dead = true;
    this.kills += 1;
    if (this.phase.objective.type === "defeat") this.objectiveValue += 1;
    if (this.phase.objective.type === "elite" && npc.elite) this.objectiveValue += 1;
    if (this.phase.objective.type === "boss" && npc.templateId === this.phase.bossId) this.objectiveValue += 1;
    this.createBurst(npc.x, npc.y, npc.color, npc.boss ? 34 : npc.elite ? 20 : 12, npc.boss ? 260 : 170);
    this.addFloatingText(npc.x, npc.y - npc.radius, npc.boss ? "CHEFE DERROTADO" : "+1 eliminação", npc.color);
    if (npc.elite) this.emitFeed(`${npc.name} derrotado.`);
  }

  objectiveComplete() {
    return this.objectiveValue >= this.phase.objective.target;
  }

  finish(won, reason = "") {
    if (this.finished) return;
    this.finished = true;
    this.emitHud(true);
    this.finishTimer = setTimeout(() => {
      if (!this.running) return;
      if (won) this.onWin?.({
        phase: this.phase,
        character: this.character,
        elapsed: this.elapsed,
        kills: this.kills,
        hp: this.player.hp,
        maxHp: this.player.maxHp
      });
      else this.onLose?.({ phase: this.phase, reason, kills: this.kills });
    }, 480);
  }

  createBurst(x, y, color, amount = 8, force = 120) {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(force * 0.35, force);
      const life = randomBetween(0.25, 0.72);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomBetween(2, 7),
        color
      });
    }
  }

  addFloatingText(x, y, value, color) {
    this.floatingTexts.push({ x, y, value, color, life: 0.75, maxLife: 0.75 });
  }

  emitFeed(message) {
    this.onFeed?.(message);
  }

  emitHud(force = false) {
    if (!this.player || (!force && !this.running)) return;
    this.onHud?.({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      timeRemaining: this.timeRemaining,
      objectiveValue: Math.floor(this.objectiveValue),
      objectiveTarget: this.phase.objective.target,
      objectiveLabel: this.phase.objective.label,
      finished: this.finished
    });
  }

  draw() {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / WORLD.width;
    const scaleY = this.canvas.height / WORLD.height;
    ctx.save();
    ctx.scale(scaleX, scaleY);
    const shakeX = this.shake ? randomBetween(-this.shake, this.shake) : 0;
    const shakeY = this.shake ? randomBetween(-this.shake, this.shake) : 0;
    ctx.translate(shakeX, shakeY);

    this.drawBackground(ctx);
    this.drawCollectibles(ctx);
    this.drawProjectiles(ctx);
    this.drawNpcs(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  drawBackground(ctx) {
    if (this.backgroundImage?.complete && this.backgroundImage.naturalWidth) {
      ctx.drawImage(this.backgroundImage, 0, 0, WORLD.width, WORLD.height);
      return;
    }
    const gradient = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, 60, WORLD.width / 2, WORLD.height / 2, 700);
    gradient.addColorStop(0, this.palette.path);
    gradient.addColorStop(0.58, this.palette.ground);
    gradient.addColorStop(1, "#07060d");
    ctx.fillStyle = gradient;
    ctx.fillRect(-25, -25, WORLD.width + 50, WORLD.height + 50);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = this.palette.crystal;
    ctx.lineWidth = 1;
    for (let x = 80; x < WORLD.width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 70, WORLD.height);
      ctx.stroke();
    }
    ctx.restore();

    for (const item of this.decor) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      ctx.globalAlpha = item.alpha;
      if (item.type === "crystal") {
        ctx.fillStyle = this.palette.crystal;
        ctx.shadowColor = this.palette.crystal;
        ctx.shadowBlur = 13;
        ctx.beginPath();
        ctx.moveTo(0, -item.size);
        ctx.lineTo(item.size * 0.56, 0);
        ctx.lineTo(0, item.size);
        ctx.lineTo(-item.size * 0.56, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = hexToRgba(this.palette.path, 0.8);
        ctx.beginPath();
        ctx.ellipse(0, 0, item.size, item.size * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const fog of this.fog) {
      const fogGradient = ctx.createRadialGradient(fog.x, fog.y, 0, fog.x, fog.y, fog.radius);
      fogGradient.addColorStop(0, hexToRgba(this.palette.mist, fog.alpha));
      fogGradient.addColorStop(1, "transparent");
      ctx.fillStyle = fogGradient;
      ctx.beginPath();
      ctx.arc(fog.x, fog.y, fog.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = hexToRgba(this.palette.crystal, 0.24);
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, WORLD.width - 32, WORLD.height - 32);
  }

  drawCollectibles(ctx) {
    for (const item of this.collectibles) {
      if (item.collected) continue;
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      ctx.shadowColor = this.palette.crystal;
      ctx.shadowBlur = 24;
      ctx.fillStyle = this.palette.crystal;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectiles(ctx) {
    for (const bullet of [...this.bullets, ...this.enemyBullets]) {
      ctx.save();
      ctx.shadowColor = bullet.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.beginPath();
      ctx.arc(bullet.x - bullet.radius * 0.22, bullet.y - bullet.radius * 0.22, bullet.radius * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawNpcs(ctx) {
    for (const npc of this.npcs) {
      if (npc.dead) continue;
      const spriteSize = clamp(npc.radius * 3.6, 78, npc.boss ? 180 : 136);
      const imageReady = npc.image && npc.image.complete && npc.image.naturalWidth > 0;
      ctx.save();
      ctx.translate(npc.x, npc.y);
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.beginPath();
      ctx.ellipse(0, npc.radius * 0.7, spriteSize * 0.3, npc.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      if (imageReady) {
        const bob = Math.sin(npc.walkTime * 7 + npc.id) * (npc.boss ? 2 : 3);
        ctx.rotate(npc.facingAngle);
        ctx.shadowColor = npc.color;
        ctx.shadowBlur = npc.boss ? 28 : 13;
        if (npc.hitFlash > 0) ctx.filter = "brightness(1.8) saturate(.25)";
        ctx.drawImage(npc.image, -spriteSize / 2, -spriteSize / 2 + bob, spriteSize, spriteSize);
        ctx.filter = "none";
      } else {
        ctx.rotate(npc.rotation * (npc.kind === "dash" ? 2 : 0.25));
        ctx.shadowColor = npc.color;
        ctx.shadowBlur = npc.boss ? 28 : 13;
        ctx.fillStyle = npc.hitFlash > 0 ? "#ffffff" : npc.color;
        ctx.strokeStyle = npc.accent;
        ctx.lineWidth = npc.boss ? 7 : 4;

        if (npc.kind === "ranged") {
          this.drawPolygon(ctx, 6, npc.radius, Math.PI / 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = npc.accent;
          ctx.beginPath();
          ctx.arc(0, 0, npc.radius * 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else if (npc.kind === "tank") {
          ctx.beginPath();
          ctx.roundRect(-npc.radius, -npc.radius * 0.76, npc.radius * 2, npc.radius * 1.52, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = npc.accent;
          ctx.fillRect(-npc.radius * 0.6, -4, npc.radius * 1.2, 8);
        } else if (npc.kind === "dash") {
          this.drawPolygon(ctx, 4, npc.radius * 1.08, Math.PI / 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,.58)";
          ctx.fillRect(-2, -npc.radius * 0.62, 4, npc.radius * 1.24);
        } else if (npc.kind === "elite") {
          this.drawPolygon(ctx, 7, npc.radius, 0);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = npc.accent;
          this.drawPolygon(ctx, 5, npc.radius * 0.46, Math.PI / 5);
          ctx.fill();
        } else if (npc.kind === "boss") {
          this.drawPolygon(ctx, 9, npc.radius, 0);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,.45)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, npc.radius * 0.62, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = npc.accent;
          ctx.beginPath();
          ctx.arc(0, 0, npc.radius * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const spikes = 9;
          ctx.beginPath();
          for (let index = 0; index < spikes * 2; index += 1) {
            const radius = index % 2 === 0 ? npc.radius * 1.15 : npc.radius * 0.8;
            const angle = (index / (spikes * 2)) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();

      const barWidth = npc.boss ? 108 : npc.elite ? 72 : 48;
      const barY = npc.y - spriteSize / 2 - 12;
      ctx.fillStyle = "rgba(0,0,0,.48)";
      ctx.fillRect(npc.x - barWidth / 2, barY, barWidth, 5);
      ctx.fillStyle = npc.boss ? "#ff4fa9" : "#ff718a";
      ctx.fillRect(npc.x - barWidth / 2, barY, barWidth * clamp(npc.hp / npc.maxHp, 0, 1), 5);
    }
  }

  drawPolygon(ctx, sides, radius, rotation = 0) {
    ctx.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + (index / sides) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  drawPlayer(ctx) {
    const player = this.player;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "rgba(0,0,0,.34)";
    ctx.beginPath();
    ctx.ellipse(0, 25, 43, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.modifier?.id === "repriton") {
      ctx.strokeStyle = "rgba(78,255,189,.65)";
      ctx.lineWidth = 4;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -this.elapsed * 25;
      ctx.beginPath();
      ctx.arc(0, 0, 49, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (player.caveVersion) {
      ctx.strokeStyle = "rgba(255,145,74,.72)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let index = 0; index < 7; index += 1) {
        const angle = (index / 7) * Math.PI * 2 + this.elapsed * 0.3;
        const radius = index % 2 ? 45 : 50;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    const frameIndex = player.moving && player.images.length > 1
      ? Math.floor(player.walkTime / 0.14) % player.images.length
      : 0;
    const playerImage = player.images[frameIndex] || player.images[0];
    const imageReady = playerImage && playerImage.complete && playerImage.naturalWidth > 0;

    if (imageReady) {
      const spriteSize = player.caveVersion ? 134 : 126;
      ctx.globalAlpha = player.invulnerableTimer > 0 && Math.floor(this.elapsed * 20) % 2 ? 0.48 : 1;
      if (player.hitFlash > 0) ctx.filter = "brightness(1.8) saturate(.3)";
      ctx.save();
      ctx.rotate(player.facingAngle);
      ctx.drawImage(playerImage, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
      ctx.restore();
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    } else {
      const gradient = ctx.createLinearGradient(-30, -30, 30, 30);
      gradient.addColorStop(0, player.token.color);
      gradient.addColorStop(1, player.token.accent);
      ctx.fillStyle = player.hitFlash > 0 ? "white" : gradient;
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "white";
      ctx.font = "900 20px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(player.token.initial, 0, 1);
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFloatingTexts(ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 14px system-ui";
    for (const text of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.fillStyle = text.color;
      ctx.shadowColor = "rgba(0,0,0,.65)";
      ctx.shadowBlur = 5;
      ctx.fillText(text.value, text.x, text.y);
      ctx.restore();
    }
  }
}

export { WORLD };
