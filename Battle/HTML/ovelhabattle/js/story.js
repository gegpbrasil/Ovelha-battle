// Cenas de história: a batalha só é criada depois de Entrar ou Pular.
export class StoryScene {
  constructor({ root, onPlay, onBack, speech = window.speechSynthesis, Utterance = window.SpeechSynthesisUtterance }) {
    this.root = root;
    this.speech = speech;
    this.Utterance = Utterance;
    this.onPlay = onPlay;
    this.onBack = onBack;
    this.token = 0;
    this.voiceEnabled = true;
    try { this.voiceEnabled = localStorage.getItem("ovelha-story-voice") !== "off"; } catch {}
    this.el = name => root.querySelector(`[data-story="${name}"]`);
    this.voices = [];
    this.refreshVoices = () => { this.voices = this.speech?.getVoices?.() || []; };
    this.refreshVoices();
    this.speech?.addEventListener?.("voiceschanged", this.refreshVoices);
    this.el("skip").addEventListener("click", () => this.play());
    this.el("next").addEventListener("click", () => this.next());
    this.el("previous").addEventListener("click", () => { if (this.index > 0) { this.index--; this.render(); } });
    this.el("listen").addEventListener("click", () => this.read());
    this.el("voice").addEventListener("click", () => {
      this.voiceEnabled = !this.voiceEnabled;
      try { localStorage.setItem("ovelha-story-voice", this.voiceEnabled ? "on" : "off"); } catch {}
      this.updateVoiceButton();
      if (this.voiceEnabled) this.read();
      else { this.stopSpeech(); this.status("Narração desligada. Avance quando quiser."); }
    });
    this.el("back").addEventListener("click", () => this.back());
    root.addEventListener("cancel", event => { event.preventDefault(); this.back(); });
  }

  open(phase, characters) {
    this.close();
    this.phase = phase;
    this.characters = characters;
    this.lines = phase.lore.lines.filter(line => line.trim());
    if (!this.lines.length) { this.play(); return; }
    this.index = 0;
    this.root.style.setProperty("--story-color", phase.palette.crystal);
    this.el("phase").textContent = `MODO HISTÓRIA • FASE ${phase.number}`;
    this.el("title").textContent = phase.name;
    this.el("objective").textContent = phase.objective.label;
    const speaker = characters.find(c => c.id === phase.lore.speaker);
    this.el("speaker").textContent = speaker?.name || "Narrador";
    const portrait = this.el("portrait");
    portrait.hidden = !speaker?.portrait;
    portrait.onerror = () => { portrait.hidden = true; };
    if (speaker?.portrait) { portrait.src = speaker.portrait; portrait.alt = speaker.name; }
    this.root.showModal();
    this.render();
  }

  status(message) { this.el("status").textContent = message; }

  updateVoiceButton() {
    const supported = Boolean(this.speech && this.Utterance);
    this.el("voice").textContent = this.voiceEnabled ? "Voz ligada" : "Voz desligada";
    this.el("voice").setAttribute("aria-pressed", String(this.voiceEnabled && supported));
    this.el("voice").disabled = !supported;
    this.el("listen").disabled = !supported;
  }

  render() {
    this.stopSpeech();
    this.el("text").textContent = this.lines[this.index];
    this.el("count").textContent = `${this.index + 1} / ${this.lines.length}`;
    this.el("progress").style.width = `${((this.index + 1) / this.lines.length) * 100}%`;
    this.el("previous").disabled = this.index === 0;
    this.el("next").textContent = this.index === this.lines.length - 1 ? "Entrar na fase →" : "Avançar →";
    this.updateVoiceButton();
    if (this.voiceEnabled) this.read();
    else this.status("Narração desligada. Avance quando quiser.");
  }

  read() {
    this.stopSpeech();
    if (!this.phase) return;
    if (!this.speech || !this.Utterance) {
      this.status("Este navegador não oferece voz. Você pode ler e continuar.");
      return;
    }
    const token = this.token;
    this.refreshVoices();
    const utterance = new this.Utterance(this.lines[this.index]);
    utterance.lang = "pt-BR";
    utterance.rate = 0.96;
    utterance.voice = this.voices.find(v => /^pt[-_]BR$/i.test(v.lang)) || this.voices.find(v => /^pt\b/i.test(v.lang)) || null;
    this.utterance = utterance;
    const current = () => this.phase && this.token === token;
    this.status("Preparando a voz…");
    utterance.onstart = () => { if (current()) { clearTimeout(this.voiceTimer); this.status("Narrando… Você pode pular a qualquer momento."); } };
    utterance.onend = () => {
      if (!current()) return;
      clearTimeout(this.voiceTimer);
      this.status("Trecho concluído. Avance para continuar.");
    };
    utterance.onerror = () => { if (current()) { clearTimeout(this.voiceTimer); this.status("A voz não iniciou. Toque em Ouvir ou continue pelo texto."); } };
    this.voiceTimer = setTimeout(() => {
      if (current()) { this.stopSpeech(); this.status("Toque em Ouvir para tentar a voz, ou continue pelo texto."); }
    }, 4500);
    try { this.speech.speak(utterance); }
    catch { this.stopSpeech(); this.status("A voz não está disponível. Continue pelo texto."); }
  }

  stopSpeech() {
    this.token++;
    clearTimeout(this.voiceTimer);
    if (this.utterance) {
      this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
      try { this.speech?.cancel(); } catch {}
      this.utterance = null;
    }
  }

  suspend() {
    this.stopSpeech();
    if (this.phase) this.status("Narração interrompida. Toque em Ouvir para retomar este trecho.");
  }

  next() {
    if (!this.phase) return;
    if (this.index === this.lines.length - 1) this.play();
    else { this.index++; this.render(); }
  }

  play() {
    const phase = this.phase;
    this.close();
    if (phase) this.onPlay(phase.id);
  }

  back() { this.close(); this.onBack?.(); }

  close() {
    this.stopSpeech();
    if (this.root.open) this.root.close();
    this.phase = null;
  }

  destroy() { this.close(); this.speech?.removeEventListener?.("voiceschanged", this.refreshVoices); }
}
