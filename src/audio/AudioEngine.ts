/**
 * Procedural audio: every sound and music track is synthesized at runtime with WebAudio
 * (100% original, zero asset licensing, tiny APK). Mobile mix: compressor on the master bus,
 * music ducked under important SFX.
 */
export type Sfx =
  | 'click' | 'tab' | 'shoot' | 'shoot_heavy' | 'hit' | 'kill' | 'death' | 'capture' | 'throw' | 'drop' | 'goal' | 'goal_enemy'
  | 'ability' | 'ult' | 'mutation_warn' | 'mutation' | 'countdown' | 'go' | 'zap' | 'explosion' | 'teleport' | 'wall' | 'heal'
  | 'reward' | 'coin' | 'chest_open' | 'chest_shake' | 'level_up' | 'victory' | 'defeat' | 'purchase' | 'error' | 'whoosh' | 'rift_purr' | 'notify' | 'unlock';

export type MusicTrack = 'menu' | 'battle' | 'battle_hot' | 'battle_cold' | 'battle_void' | 'battle_jungle' | 'shop' | 'victory' | 'defeat' | 'none';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface TrackDef { bpm: number; root: number; prog: number[][]; lead: number[]; bass: 'pulse' | 'walk' | 'octave'; drums: string; wave: OscillatorType; leadWave: OscillatorType; swing?: number }

const TRACKS: Record<Exclude<MusicTrack, 'none'>, TrackDef> = {
  menu: { bpm: 104, root: 57, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: [12, 14, 16, 19, 16, 14, 12, 11, 12, -1, 16, 14, 12, -1, 7, -1], bass: 'walk', drums: 'k..sk.s.k..sk.ss', wave: 'triangle', leadWave: 'square' },
  battle: { bpm: 132, root: 52, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], lead: [12, -1, 15, 12, 19, -1, 17, 15, 12, -1, 10, 12, 15, -1, 14, -1], bass: 'pulse', drums: 'k.hsk.hsk.hsk.ss', wave: 'sawtooth', leadWave: 'square' },
  battle_hot: { bpm: 140, root: 50, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], lead: [12, 13, 12, -1, 15, -1, 13, 12, 10, -1, 12, -1, 7, -1, 8, -1], bass: 'octave', drums: 'k.hsk.hsk.hsk.hs', wave: 'sawtooth', leadWave: 'sawtooth' },
  battle_cold: { bpm: 124, root: 54, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: [19, -1, 16, -1, 14, 16, 19, -1, 21, -1, 19, 16, 14, -1, 12, -1], bass: 'pulse', drums: 'k..hs..hk..hs.hh', wave: 'triangle', leadWave: 'sine' },
  battle_void: { bpm: 128, root: 49, prog: [[0, 3, 7], [0, 3, 8], [-2, 3, 7], [-4, 0, 5]], lead: [12, -1, -1, 15, -1, 14, -1, 10, 12, -1, -1, 19, -1, 17, 15, -1], bass: 'octave', drums: 'k.h.s.hkk.h.s.hs', wave: 'square', leadWave: 'triangle' },
  battle_jungle: { bpm: 118, root: 55, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], lead: [7, 9, 12, -1, 9, 7, 4, -1, 7, -1, 12, 14, 12, -1, 9, -1], bass: 'walk', drums: 'k.sks.k.k.sks.ss', wave: 'triangle', leadWave: 'square', swing: 0.12 },
  shop: { bpm: 96, root: 60, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]], lead: [16, -1, 19, -1, 23, -1, 21, 19, 16, -1, 14, -1, 12, -1, -1, -1], bass: 'walk', drums: 'k...s..kk...s...', wave: 'sine', leadWave: 'triangle', swing: 0.15 },
  victory: { bpm: 140, root: 60, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: [12, 16, 19, 24, -1, 19, 24, -1, 26, -1, 28, -1, 31, -1, -1, -1], bass: 'octave', drums: 'k.s.k.s.k.s.ksss', wave: 'square', leadWave: 'square' },
  defeat: { bpm: 80, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], lead: [12, -1, 10, -1, 8, -1, 7, -1, 5, -1, 3, -1, 2, -1, -1, -1], bass: 'pulse', drums: 'k.......s.......', wave: 'triangle', leadWave: 'sine' },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  musicVolume = 0.6;
  sfxVolume = 0.8;
  private track: MusicTrack = 'none';
  private nextNoteTime = 0;
  private step = 0;
  private timer: any = null;
  private lastPlay = new Map<string, number>();
  private duckUntil = 0;

  /** Must be called from a user gesture on mobile. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx!;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.musicBus = c.createGain(); this.sfxBus = c.createGain();
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    this.master.connect(comp); comp.connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.musicVolume, this.sfxVolume);
    if (this.track !== 'none') { const t = this.track; this.track = 'none'; this.playMusic(t); }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music; this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.32, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx * 0.9, this.ctx.currentTime, 0.05);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  // ------------------------------------------------------------------ music sequencer

  playMusic(t: MusicTrack) {
    if (t === this.track) return;
    this.track = t;
    if (!this.ctx) return;
    clearInterval(this.timer);
    if (t === 'none') return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  get currentTrack() { return this.track; }

  private schedule() {
    const c = this.ctx;
    if (!c || this.track === 'none') return;
    const def = TRACKS[this.track];
    const stepDur = 60 / def.bpm / 4;
    while (this.nextNoteTime < c.currentTime + 0.15) {
      const s = this.step % 64;
      const bar = Math.floor(s / 16), sub = s % 16;
      const chord = def.prog[bar % def.prog.length];
      const t = this.nextNoteTime + (sub % 2 === 1 ? (def.swing ?? 0) * stepDur : 0);
      const duck = c.currentTime < this.duckUntil ? 0.45 : 1;
      // drums
      const dch = def.drums[sub];
      if (dch === 'k') this.kick(t, 0.9 * duck);
      if (dch === 's') this.snare(t, 0.45 * duck);
      if (dch === 'h' || sub % 2 === 0) this.hat(t, (dch === 'h' ? 0.18 : 0.08) * duck);
      // bass
      if (def.bass === 'pulse' ? sub % 2 === 0 : def.bass === 'octave' ? sub % 2 === 0 : sub % 4 === 0) {
        const n = def.root - 12 + chord[def.bass === 'walk' ? (sub / 4) % chord.length : 0] + (def.bass === 'octave' && sub % 4 === 2 ? 12 : 0);
        this.tone(NOTE(n), t, stepDur * (def.bass === 'walk' ? 3.5 : 1.6), def.wave === 'sine' ? 'triangle' : 'square', 0.22 * duck, this.musicBus, 900);
      }
      // pads (chord stab on beat 1 and 3)
      if (sub === 0 || sub === 8) for (const iv of chord) this.tone(NOTE(def.root + iv), t, stepDur * 7, def.wave, 0.05 * duck, this.musicBus, 2200, 0.05);
      // lead (2nd half of each 4-bar loop alternates)
      const ln = def.lead[sub];
      if (ln >= 0 && (bar % 2 === 1 || this.track === 'victory' || this.track === 'defeat')) this.tone(NOTE(def.root + ln), t, stepDur * 1.8, def.leadWave, 0.09 * duck, this.musicBus, 3200, 0.01);
      this.nextNoteTime += stepDur;
      this.step++;
      if ((this.track === 'victory' || this.track === 'defeat') && this.step >= 64) { this.playMusic('none'); return; }
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, bus: AudioNode, cutoff = 4000, attack = 0.005, slideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, bus: AudioNode, q = 1) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  private kick(t: number, v: number) { this.tone(150, t, 0.22, 'sine', v, this.musicBus, 800, 0.002, 40); }
  private snare(t: number, v: number) { this.noiseHit(t, 0.16, v, 'bandpass', 1800, this.musicBus, 0.8); this.tone(220, t, 0.08, 'triangle', v * 0.4, this.musicBus); }
  private hat(t: number, v: number) { this.noiseHit(t, 0.04, v, 'highpass', 7000, this.musicBus); }

  // ------------------------------------------------------------------ sfx

  play(name: Sfx, opts: { vol?: number; pitch?: number } = {}) {
    const c = this.ctx;
    if (!c || this.sfxVolume <= 0) return;
    const now = c.currentTime;
    // anti-spam: same sound at most every 35ms
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < 0.035) return;
    this.lastPlay.set(name, now);
    const v = opts.vol ?? 1, p = opts.pitch ?? 1, b = this.sfxBus;
    const r = () => 0.95 + Math.random() * 0.1;
    switch (name) {
      case 'click': this.tone(880 * p, now, 0.06, 'square', 0.12 * v, b, 3000, 0.002, 1200 * p); break;
      case 'tab': this.tone(660, now, 0.05, 'triangle', 0.15 * v, b, 3000, 0.002, 990); break;
      case 'shoot': this.tone(620 * p * r(), now, 0.09, 'square', 0.07 * v, b, 2600, 0.002, 220); this.noiseHit(now, 0.05, 0.05 * v, 'highpass', 3000, b); break;
      case 'shoot_heavy': this.tone(200 * r(), now, 0.2, 'sawtooth', 0.12 * v, b, 1200, 0.002, 60); this.noiseHit(now, 0.15, 0.12 * v, 'lowpass', 1200, b); break;
      case 'hit': this.noiseHit(now, 0.07, 0.16 * v, 'bandpass', 2400 * p, b, 2); this.tone(300 * r(), now, 0.06, 'square', 0.05 * v, b, 2000); break;
      case 'kill': this.tone(880, now, 0.12, 'square', 0.12 * v, b, 4000); this.tone(1320, now + 0.08, 0.2, 'square', 0.12 * v, b, 4000); break;
      case 'death': this.tone(400, now, 0.4, 'sawtooth', 0.12 * v, b, 1500, 0.005, 80); this.noiseHit(now, 0.3, 0.1 * v, 'lowpass', 900, b); break;
      case 'capture': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), now + i * 0.045, 0.15, 'triangle', 0.16 * v, b, 5000)); break;
      case 'throw': this.noiseHit(now, 0.25, 0.14 * v, 'bandpass', 900, b, 0.6); this.tone(300, now, 0.25, 'sine', 0.1 * v, b, 2000, 0.01, 900); break;
      case 'drop': this.tone(500, now, 0.25, 'triangle', 0.14 * v, b, 2000, 0.005, 150); break;
      case 'goal': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(NOTE(67 + n), now + i * 0.06, 0.35, 'square', 0.1 * v, b, 5000)); this.noiseHit(now, 0.8, 0.18 * v, 'highpass', 4000, b); this.duck(1.5); break;
      case 'goal_enemy': [12, 7, 3, 0].forEach((n, i) => this.tone(NOTE(60 + n), now + i * 0.09, 0.3, 'sawtooth', 0.08 * v, b, 2000)); this.duck(1.2); break;
      case 'ability': this.tone(300 * p, now, 0.25, 'sawtooth', 0.1 * v, b, 2500, 0.01, 900 * p); this.noiseHit(now, 0.2, 0.08 * v, 'bandpass', 2000, b); break;
      case 'ult': this.tone(120, now, 0.7, 'sawtooth', 0.16 * v, b, 1500, 0.02, 600); [0, 7, 12, 19].forEach((n, i) => this.tone(NOTE(60 + n), now + 0.05 + i * 0.05, 0.4, 'square', 0.07 * v, b, 4000)); this.noiseHit(now, 0.6, 0.12 * v, 'lowpass', 2500, b); this.duck(0.8); break;
      case 'mutation_warn': for (let i = 0; i < 4; i++) this.tone(i % 2 ? 660 : 880, now + i * 0.22, 0.18, 'square', 0.1 * v, b, 3000); break;
      case 'mutation': this.tone(80, now, 1.2, 'sawtooth', 0.2 * v, b, 900, 0.05, 400); this.tone(160, now, 1.2, 'square', 0.08 * v, b, 1200, 0.05, 1600); this.noiseHit(now, 1.0, 0.15 * v, 'bandpass', 600, b, 0.5); this.duck(1.5); break;
      case 'countdown': this.tone(660, now, 0.15, 'square', 0.14 * v, b, 3000); break;
      case 'go': this.tone(990, now, 0.35, 'square', 0.16 * v, b, 4000); this.tone(1320, now, 0.35, 'square', 0.08 * v, b, 4000); break;
      case 'zap': this.noiseHit(now, 0.12, 0.12 * v, 'highpass', 5000, b); this.tone(1800 * r(), now, 0.08, 'sawtooth', 0.06 * v, b, 6000, 0.001, 400); break;
      case 'explosion': this.noiseHit(now, 0.5, 0.25 * v, 'lowpass', 700, b); this.tone(110, now, 0.4, 'sine', 0.2 * v, b, 500, 0.002, 35); break;
      case 'teleport': this.tone(400, now, 0.2, 'sine', 0.14 * v, b, 6000, 0.005, 1800); this.tone(1800, now + 0.1, 0.15, 'sine', 0.08 * v, b, 6000, 0.005, 600); break;
      case 'wall': this.noiseHit(now, 0.2, 0.18 * v, 'lowpass', 500, b); this.tone(140, now, 0.18, 'square', 0.1 * v, b, 600, 0.002, 70); break;
      case 'heal': [0, 4, 7].forEach((n, i) => this.tone(NOTE(76 + n), now + i * 0.05, 0.25, 'sine', 0.08 * v, b, 6000)); break;
      case 'reward': case 'coin': this.tone(1320 * p, now, 0.08, 'square', 0.1 * v, b, 6000); this.tone(1760 * p, now + 0.06, 0.15, 'square', 0.1 * v, b, 6000); break;
      case 'chest_shake': this.noiseHit(now, 0.12, 0.15 * v, 'bandpass', 600, b, 2); this.tone(180, now, 0.1, 'square', 0.08 * v, b, 800); break;
      case 'chest_open': this.noiseHit(now, 0.6, 0.2 * v, 'highpass', 2500, b); [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => this.tone(NOTE(72 + n), now + i * 0.04, 0.4, 'triangle', 0.09 * v, b, 6000)); this.duck(1.2); break;
      case 'level_up': [0, 4, 7, 12, 7, 12, 16, 24].forEach((n, i) => this.tone(NOTE(67 + n), now + i * 0.07, 0.25, 'square', 0.09 * v, b, 5000)); this.duck(1.2); break;
      case 'unlock': [0, 7, 12, 19, 24].forEach((n, i) => this.tone(NOTE(70 + n), now + i * 0.08, 0.5, 'triangle', 0.12 * v, b, 6000)); this.noiseHit(now, 0.8, 0.1 * v, 'highpass', 6000, b); this.duck(1.5); break;
      case 'victory': this.playMusic('victory'); break;
      case 'defeat': this.playMusic('defeat'); break;
      case 'purchase': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), now + i * 0.06, 0.3, 'square', 0.1 * v, b, 6000)); this.noiseHit(now + 0.1, 0.4, 0.08 * v, 'highpass', 6000, b); break;
      case 'error': this.tone(220, now, 0.15, 'square', 0.12 * v, b, 1500); this.tone(160, now + 0.12, 0.2, 'square', 0.12 * v, b, 1500); break;
      case 'whoosh': this.noiseHit(now, 0.25, 0.1 * v, 'bandpass', 1200, b, 0.7); break;
      case 'rift_purr': this.tone(90, now, 0.4, 'sine', 0.05 * v, b, 400, 0.05, 70); break;
      case 'notify': this.tone(988, now, 0.09, 'sine', 0.12 * v, b, 6000); this.tone(1319, now + 0.09, 0.14, 'sine', 0.12 * v, b, 6000); break;
    }
  }

  private duck(seconds: number) { if (this.ctx) this.duckUntil = this.ctx.currentTime + seconds; }
}

export const audio = new AudioEngine();
