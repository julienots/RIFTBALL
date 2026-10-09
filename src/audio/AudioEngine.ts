/**
 * Procedural audio: every sound and music track is synthesized at runtime with WebAudio
 * (100% original, zero asset licensing, tiny APK). Mobile mix: compressor on the master bus,
 * music ducked under important SFX.
 */
export type Sfx =
  | 'click' | 'tab' | 'shoot' | 'shoot_heavy' | 'hit' | 'kill' | 'death' | 'capture' | 'throw' | 'drop' | 'goal' | 'goal_enemy'
  | 'ability' | 'ult' | 'mutation_warn' | 'mutation' | 'countdown' | 'go' | 'zap' | 'explosion' | 'teleport' | 'wall' | 'heal'
  | 'reward' | 'coin' | 'chest_open' | 'chest_shake' | 'level_up' | 'victory' | 'defeat' | 'purchase' | 'error' | 'whoosh' | 'rift_purr' | 'notify' | 'unlock';

export type MusicTrack = 'menu' | 'battle' | 'battle_hot' | 'battle_cold' | 'battle_void' | 'battle_jungle' | 'shop' | 'victory' | 'defeat'
  | 'menu_s1' | 'menu_s2' | 'menu_s3' | 'menu_s4' | 'boss' | 'king' | 'fifix' | 'none';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface TrackDef {
  bpm: number; root: number; prog: number[][]; lead: number[]; bass: 'pulse' | 'walk' | 'octave'; drums: string; wave: OscillatorType; leadWave: OscillatorType; swing?: number;
  /** v1.0.7 composed tracks: 4-bar melody (A) and its answer (B), "note:len16ths" ('-' = rest) */
  melody?: string; answer?: string;
  /** instrument of the melody */
  voice?: 'lead' | 'bell' | 'pluck' | 'brass';
  /** arpeggio over the chord: rate in 16ths (1 = 16ths, 2 = 8ths) */
  arp?: { rate: number; style: 'up' | 'updown'; voice: 'pluck' | 'bell' | 'saw'; oct: number };
  /** lush detuned pad that holds each chord */
  pad?: boolean;
  reverb?: number; echo?: number;
}

/** "12:4 15:2 -:2" -> [{ step, note, len }] (note -1 = rest), 64 steps per 4-bar phrase */
function phrase(src?: string) {
  const out: { step: number; note: number; len: number }[] = [];
  if (!src) return out;
  let step = 0;
  for (const tok of src.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    const [n, l] = tok.split(':');
    const len = Number(l) || 1;
    if (n !== '-') out.push({ step, note: Number(n), len });
    step += len;
  }
  return out;
}

const TRACKS: Record<Exclude<MusicTrack, 'none'>, TrackDef> = {
  menu: { bpm: 104, root: 57, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: [12, 14, 16, 19, 16, 14, 12, 11, 12, -1, 16, 14, 12, -1, 7, -1], bass: 'walk', drums: 'k..sk.s.k..sk.ss', wave: 'triangle', leadWave: 'square' },
  battle: { bpm: 132, root: 52, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], lead: [12, -1, 15, 12, 19, -1, 17, 15, 12, -1, 10, 12, 15, -1, 14, -1], bass: 'pulse', drums: 'k.hsk.hsk.hsk.ss', wave: 'sawtooth', leadWave: 'square' },
  battle_hot: { bpm: 140, root: 50, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], lead: [12, 13, 12, -1, 15, -1, 13, 12, 10, -1, 12, -1, 7, -1, 8, -1], bass: 'octave', drums: 'k.hsk.hsk.hsk.hs', wave: 'sawtooth', leadWave: 'sawtooth' },
  battle_cold: { bpm: 124, root: 54, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: [19, -1, 16, -1, 14, 16, 19, -1, 21, -1, 19, 16, 14, -1, 12, -1], bass: 'pulse', drums: 'k..hs..hk..hs.hh', wave: 'triangle', leadWave: 'sine' },
  battle_void: { bpm: 128, root: 49, prog: [[0, 3, 7], [0, 3, 8], [-2, 3, 7], [-4, 0, 5]], lead: [12, -1, -1, 15, -1, 14, -1, 10, 12, -1, -1, 19, -1, 17, 15, -1], bass: 'octave', drums: 'k.h.s.hkk.h.s.hs', wave: 'square', leadWave: 'triangle' },
  battle_jungle: { bpm: 118, root: 55, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], lead: [7, 9, 12, -1, 9, 7, 4, -1, 7, -1, 12, 14, 12, -1, 9, -1], bass: 'walk', drums: 'k.sks.k.k.sks.ss', wave: 'triangle', leadWave: 'square', swing: 0.12 },
  shop: { bpm: 96, root: 60, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]], lead: [16, -1, 19, -1, 23, -1, 21, 19, 16, -1, 14, -1, 12, -1, -1, -1], bass: 'walk', drums: 'k...s..kk...s...', wave: 'sine', leadWave: 'triangle', swing: 0.15 },
  victory: { bpm: 140, root: 60, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: [12, 16, 19, 24, -1, 19, 24, -1, 26, -1, 28, -1, 31, -1, -1, -1], bass: 'octave', drums: 'k.s.k.s.k.s.ksss', wave: 'square', leadWave: 'square' },
  // ---- v1.0.7 composed soundtrack
  menu_s1: { bpm: 108, root: 50, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], lead: [], bass: 'octave', drums: 'k...s..kk.k.s...', wave: 'sawtooth', leadWave: 'square', pad: true, reverb: 0.45, echo: 0.3, voice: 'brass',
    melody: '12:4 15:2 17:2 19:6 17:2 | 15:4 14:4 12:8 | 10:4 12:2 14:2 15:6 14:2 | 12:8 -:8', answer: '19:4 22:4 24:8 | 22:4 19:4 17:8 | 15:4 17:2 19:2 22:6 24:2 | 26:12 -:4', arp: { rate: 2, style: 'up', voice: 'pluck', oct: 12 } },
  menu_s2: { bpm: 92, root: 52, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: [], bass: 'walk', drums: 'k.......s.......', wave: 'triangle', leadWave: 'sine', pad: true, reverb: 0.6, echo: 0.35, voice: 'bell',
    melody: '16:4 19:4 21:4 19:4 | 16:8 14:4 12:4 | 11:4 12:4 14:4 16:4 | 19:12 -:4', answer: '23:4 21:4 19:4 16:4 | 21:8 19:4 16:4 | 14:4 16:4 19:4 21:4 | 24:12 -:4', arp: { rate: 2, style: 'updown', voice: 'bell', oct: 24 } },
  menu_s3: { bpm: 112, root: 55, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: [], bass: 'walk', drums: 'k.sks.k.k.sks.ss', wave: 'triangle', leadWave: 'triangle', swing: 0.12, pad: true, reverb: 0.3, echo: 0.2, voice: 'pluck',
    melody: '12:2 14:2 16:4 19:2 16:2 14:4 | 12:2 9:2 7:4 9:4 12:4 | 14:2 16:2 19:4 21:2 19:2 16:4 | 14:4 12:12', answer: '24:2 21:2 19:4 16:2 19:2 21:4 | 19:2 16:2 14:4 12:8 | 16:2 19:2 21:4 24:2 21:2 19:4 | 16:4 19:4 24:8', arp: { rate: 2, style: 'updown', voice: 'pluck', oct: 12 } },
  menu_s4: { bpm: 100, root: 45, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], lead: [], bass: 'octave', drums: 'k...s...k.k.s...', wave: 'sawtooth', leadWave: 'sawtooth', pad: true, reverb: 0.5, echo: 0.4, voice: 'lead',
    melody: '12:6 15:2 19:4 17:4 | 15:6 14:2 12:8 | 10:6 12:2 14:4 15:4 | 14:12 -:4', answer: '24:6 22:2 19:4 22:4 | 24:6 26:2 27:8 | 26:6 24:2 22:4 19:4 | 17:12 -:4', arp: { rate: 1, style: 'up', voice: 'saw', oct: 12 } },
  boss: { bpm: 150, root: 45, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]], lead: [], bass: 'octave', drums: 'k.hsk.hskkhsk.ss', wave: 'sawtooth', leadWave: 'square', pad: true, reverb: 0.35, echo: 0.15, voice: 'brass',
    melody: '12:2 13:2 12:2 15:2 13:4 12:4 | 11:2 12:2 11:2 8:2 7:8 | 12:2 13:2 15:2 17:2 18:4 17:4 | 15:2 13:2 12:12', answer: '24:4 25:4 24:4 22:4 | 20:4 19:4 17:8 | 24:2 25:2 27:2 29:2 30:4 29:4 | 27:4 25:4 24:8', arp: { rate: 1, style: 'up', voice: 'saw', oct: 0 } },
  king: { bpm: 116, root: 53, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: [], bass: 'pulse', drums: 'k.s.k.s.k.s.kkss', wave: 'square', leadWave: 'square', pad: true, reverb: 0.4, echo: 0.2, voice: 'brass',
    melody: '12:3 12:1 16:4 19:4 16:4 | 17:3 17:1 21:4 19:8 | 19:3 21:1 19:4 17:4 16:4 | 14:4 16:4 12:8', answer: '24:3 24:1 28:4 31:4 28:4 | 29:3 29:1 33:4 31:8 | 31:3 33:1 31:4 29:4 28:4 | 26:4 28:4 24:8', arp: { rate: 2, style: 'up', voice: 'bell', oct: 12 } },
  fifix: { bpm: 124, root: 60, prog: [[0, 4, 7, 10], [-3, 0, 4, 7], [5, 9, 12, 15], [7, 11, 14, 17]], lead: [], bass: 'octave', drums: 'k.hsk.hsk.hsk.hs', wave: 'square', leadWave: 'square', swing: 0.1, pad: false, reverb: 0.25, echo: 0.25, voice: 'pluck',
    melody: '12:2 -:1 12:1 15:2 16:2 19:4 16:2 15:2 | 12:2 10:2 12:4 7:4 -:4 | 12:2 -:1 12:1 15:2 16:2 19:2 21:2 19:2 16:2 | 15:2 16:2 12:12', answer: '24:2 22:2 19:2 16:2 19:4 22:4 | 24:2 -:2 24:2 26:2 28:8 | 26:2 24:2 22:2 19:2 22:4 24:4 | 19:4 16:4 12:8', arp: { rate: 1, style: 'updown', voice: 'pluck', oct: 0 } },
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
  private verb!: ConvolverNode; private verbIn!: GainNode;
  private echo!: DelayNode; private echoFb!: GainNode; private echoIn!: GainNode;
  private phrases = new Map<string, { a: ReturnType<typeof phrase>; b: ReturnType<typeof phrase> }>();

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
    // music space: generated reverb impulse + tempo echo for melodies
    this.verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.verb.buffer = ir;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0;
    this.verbIn.connect(this.verb); this.verb.connect(this.musicBus);
    this.echo = c.createDelay(1.5); this.echoFb = c.createGain(); this.echoIn = c.createGain(); this.echoIn.gain.value = 0;
    const echoTone = c.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 2600;
    this.echoIn.connect(this.echo); this.echo.connect(echoTone); echoTone.connect(this.echoFb); this.echoFb.connect(this.echo); echoTone.connect(this.musicBus); echoTone.connect(this.verbIn);
    this.echoFb.gain.value = 0.32;
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
    const def = TRACKS[t];
    const now = this.ctx.currentTime;
    this.verbIn.gain.setTargetAtTime(def.reverb ?? 0.12, now, 0.1);
    this.echoIn.gain.setTargetAtTime(def.echo ?? 0, now, 0.1);
    this.echo.delayTime.setValueAtTime((60 / def.bpm) * 0.75, now); // dotted-eighth echo
    if (def.melody && !this.phrases.has(t)) this.phrases.set(t, { a: phrase(def.melody), b: phrase(def.answer) });
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
      if (def.melody) this.composed(def, chord, sub, bar, t, stepDur, duck);
      else {
        // pads (chord stab on beat 1 and 3)
        if (sub === 0 || sub === 8) for (const iv of chord) this.tone(NOTE(def.root + iv), t, stepDur * 7, def.wave, 0.05 * duck, this.musicBus, 2200, 0.05);
        // lead (2nd half of each 4-bar loop alternates)
        const ln = def.lead[sub];
        if (ln >= 0 && (bar % 2 === 1 || this.track === 'victory' || this.track === 'defeat')) this.tone(NOTE(def.root + ln), t, stepDur * 1.8, def.leadWave, 0.09 * duck, this.musicBus, 3200, 0.01);
      }
      this.nextNoteTime += stepDur;
      this.step++;
      if ((this.track === 'victory' || this.track === 'defeat') && this.step >= 64) { this.playMusic('none'); return; }
    }
  }

  /**
   * Composed tracks: 8-bar song (phrase A then its answer B), lush pads, arpeggios and a voiced melody
   * sent to the echo + reverb. The very first 2 bars are an intro (pads + arp only).
   */
  private composed(def: TrackDef, chord: number[], sub: number, bar: number, t: number, stepDur: number, duck: number) {
    const ph = this.phrases.get(this.track)!;
    const song = this.step % 128, intro = this.step < 32;
    // pad: two detuned saws per chord tone, slow attack, whole bar
    if (def.pad && sub === 0) for (const iv of chord.slice(0, 3)) {
      for (const det of [-6, 6]) this.tone(NOTE(def.root + iv) * Math.pow(2, det / 1200), t, stepDur * 16, 'sawtooth', 0.022 * duck, this.musicBus, 1300, stepDur * 4, undefined, 0.5);
    }
    // arpeggio
    if (def.arp && sub % def.arp.rate === 0) {
      const tones = def.arp.style === 'updown' ? [...chord, ...chord.slice(1, -1).reverse()] : chord;
      const i = (sub / def.arp.rate) % tones.length;
      const n = def.root + tones[i] + def.arp.oct;
      this.voice(def.arp.voice, NOTE(n), t, stepDur * def.arp.rate * 1.6, 0.045 * duck, 0.25);
    }
    if (intro) return;
    // melody: A on the first 4 bars of the song, B (answer) on the next 4
    const list = song < 64 ? ph.a : ph.b.length ? ph.b : ph.a;
    const local = song % 64;
    for (const e of list) if (e.step === local) this.voice(def.voice ?? 'lead', NOTE(def.root + e.note), t, stepDur * e.len * 0.95, 0.085 * duck, 1, def.leadWave);
    void bar;
  }

  /** Instruments: lead (filtered osc), bell (FM-ish sines), pluck (marimba), brass (2 saws + swell), saw (arp). */
  private voice(kind: string, f: number, t: number, dur: number, vol: number, send = 1, wave: OscillatorType = 'square') {
    const echo = this.echoIn as AudioNode;
    switch (kind) {
      case 'bell':
        this.tone(f, t, Math.max(dur, 0.6), 'sine', vol * 1.1, this.musicBus, 6000, 0.003, undefined, 0.6, send ? echo : undefined);
        this.tone(f * 2.76, t, Math.max(dur, 0.6) * 0.5, 'sine', vol * 0.3, this.musicBus, 8000, 0.002, undefined, 0.6);
        this.tone(f * 2, t, Math.max(dur, 0.6) * 0.7, 'sine', vol * 0.35, this.musicBus, 8000, 0.002);
        break;
      case 'pluck':
        this.tone(f, t, Math.min(dur, 0.35), 'triangle', vol * 1.3, this.musicBus, 3500, 0.002, undefined, 0.3, send ? echo : undefined);
        this.tone(f * 4, t, 0.05, 'sine', vol * 0.25, this.musicBus, 9000, 0.001);
        break;
      case 'brass':
        for (const det of [-5, 5]) this.tone(f * Math.pow(2, det / 1200), t, dur, 'sawtooth', vol * 0.6, this.musicBus, 2400, Math.min(0.08, dur / 3), undefined, 0.5, send ? echo : undefined);
        break;
      case 'saw':
        this.tone(f, t, Math.min(dur, 0.25), 'sawtooth', vol * 0.8, this.musicBus, 1800, 0.003, undefined, 0.4);
        break;
      default:
        this.tone(f, t, dur, wave, vol, this.musicBus, 3200, 0.01, undefined, 0.5, send ? echo : undefined);
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, bus: AudioNode, cutoff = 4000, attack = 0.005, slideTo?: number, verbSend = 0, extra?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus);
    if (verbSend > 0 && this.verbIn && bus === this.musicBus) { const sg = c.createGain(); sg.gain.value = verbSend; g.connect(sg); sg.connect(this.verbIn); }
    if (extra) g.connect(extra);
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
