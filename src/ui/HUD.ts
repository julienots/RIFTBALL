import { h } from './dom';
import type { Match } from '../game/Match';
import type { Hero, MatchEvent } from '../game/entities';
import type { WorldRenderer } from '../game/render/WorldRenderer';
import { formatClock } from '../core/Time';
import { getMutation } from '../data/mutations';
import { getCosmetic } from '../data/cosmetics';
import { BOSS_ATTACKS, KING_TARGET } from '../gamemodes/ModeRules';
import { getCharacter, isBoss } from '../data/characters';

const RIFT_STATE_FR: Record<string, string> = {
  IDLE: 'EN ATTENTE', ROAM: 'ERRANT', FLEE: 'EN FUITE', CHASE: 'CURIEUX', ATTRACTED: 'ATTIRÉ', CARRIED: 'CAPTURÉ', DROPPED: 'LIBRE',
  FRENZY: 'FRÉNÉSIE', MUTATING: 'MUTATION...', CLONING: 'DIVISION', PORTAL: 'PORTAIL',
};

export const GADGET_ICONS: Record<string, string> = { repulse: '🧲', vanish: '💨', rift_cage: '🧱', swap: '🔄', emp: '📡', transfusion: '💉', hook: '🪝', mine: '💣', team_shield: '🛡️', rift_gust: '🌪️', blaze: '🔥', flare: '🎆', ice_block: '🧊',
  smoke: '🌫️', harden: '🪵', ally_warp: '🌙', leap: '🚀', haste: '⏩', sanctuary: '✨', rift_decoy: '🎭' };
const TAG_FR: Record<string, [string, string]> = { combo: ['COMBO x3 !', '#ff9f1c'], back: ['DANS LE DOS !', '#c77dff'], momentum: ['ÉLAN !', '#4cc9f0'], execute: ['COUP DE GRÂCE !', '#ff4d6d'], duo: ['ATTAQUE EN DUO !', '#80ed99'] };

interface HpEl { root: HTMLElement; fill: HTMLElement; shield: HTMLElement; num: HTMLElement | null; carry: HTMLElement; badges: HTMLElement; lastHp: number; lastCarry: boolean; lastBadges: string }

/** In-match DOM HUD: scoreboard, timer, Rift status, health bars, damage numbers, buttons, minimap. */
export class HUD {
  readonly el: HTMLElement;
  readonly ctrl: HTMLElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;
  readonly btn: { attack: HTMLElement; ability: HTMLElement; ult: HTMLElement; gadget: HTMLElement; roll: HTMLElement };
  private gadgetN: HTMLElement; private rollCd: HTMLElement;
  private scoreB: HTMLElement; private scoreR: HTMLElement; private clock: HTMLElement; private riftPill: HTMLElement;
  private announce: HTMLElement; private mutBanner: HTMLElement | null = null; private killfeed: HTMLElement;
  private hpEls = new Map<number, HpEl>();
  private hpLayer: HTMLElement;
  private dmgPool: HTMLElement[] = [];
  private dmgActive: { el: HTMLElement; t: number; x: number; y: number; vy: number }[] = [];
  private offscreen: HTMLElement;
  private meHp: HTMLElement; private meUlt: HTMLElement; private meHpTxt: HTMLElement;
  private abCd: HTMLElement; private abCdN: HTMLElement; private ultRing: HTMLElement;
  private vignette: HTMLElement; private flash: HTMLElement;
  private respawnEl: HTMLElement;
  private minimap: HTMLCanvasElement; private mmCtx: CanvasRenderingContext2D; private mmT = 0;
  private emoteWheel: HTMLElement | null = null;
  private tmp = { x: 0, y: 0, visible: true };
  private lastScore = [0, 0];
  private hurtT = 0;
  private bossBar: HTMLElement | null = null; private bossFill: HTMLElement | null = null; private bossShield: HTMLElement | null = null; private bossPhase: HTMLElement | null = null;
  private dmgBoard: HTMLElement | null = null; private boardT = 0;
  onPause: () => void = () => {};
  onEmote: (glyph: string) => void = () => {};

  constructor(private m: Match, private r: WorldRenderer, private portrait: string, private emotes: string[], private teamNames: [string, string] = ['BLUE', 'RED']) {
    this.scoreB = h('span.n', '0'); this.scoreR = h('span.n', '0');
    this.clock = h('div.clock', formatClock(m.clock));
    this.riftPill = h('div.rift-pill', h('i.ro'), h('span', 'RIFT'));
    this.announce = h('div.hud-announce');
    this.killfeed = h('div.killfeed');
    this.hpLayer = h('div', { style: 'position:absolute;inset:0;pointer-events:none' });
    this.offscreen = h('div.offscreen', { style: 'display:none' });
    this.meHp = h('i', { style: 'width:100%' }); this.meUlt = h('i', { style: 'width:0%' }); this.meHpTxt = h('span', '');
    this.abCd = h('div.cd'); this.abCdN = h('div.cdn');
    this.ultRing = h('div.ring');
    this.vignette = h('div.vignette.hurt'); this.flash = h('div.vignette.flash');
    this.respawnEl = h('div.respawn.stroke', { style: 'display:none' });
    this.minimap = h('canvas.minimap') as HTMLCanvasElement;
    const mmW = 132, mmH = Math.round((mmW * m.arena.h) / m.arena.w);
    this.minimap.width = mmW * 2; this.minimap.height = mmH * 2;
    this.minimap.style.width = mmW + 'px'; this.minimap.style.height = mmH + 'px';
    this.mmCtx = this.minimap.getContext('2d')!;
    this.joyKnob = h('div.joy-knob');
    this.joyBase = h('div.joy-base.hint', this.joyKnob);
    this.gadgetN = h('div.gcount');
    this.rollCd = h('div.cd');
    const gIcon: Record<string, string> = GADGET_ICONS;
    const g = m.human?.def.gadget;
    this.btn = {
      gadget: h('div.hud-btn.gadget', { 'data-slot': 'gadget', style: g ? '' : 'display:none' }, h('span.ic', gIcon[g?.effect ?? ''] ?? '✦'), this.gadgetN, h('span.lbl', g ? g.name.toUpperCase() : 'GADGET')),
      roll: h('div.hud-btn.roll', { 'data-slot': 'roll' }, h('span.ic', '💨'), this.rollCd, h('span.lbl', 'ROULADE')),
      attack: h('div.hud-btn.attack', { 'data-slot': 'attack' }, h('span.ic', '🎯'), h('div.aim-knob', { style: 'display:none' }), h('span.lbl', 'ATTAQUE')),
      ability: h('div.hud-btn.ability', { 'data-slot': 'ability' }, h('span.ic', '⚡'), this.abCd, this.abCdN, h('span.lbl', 'CAPACITÉ')),
      ult: h('div.hud-btn.ult', { 'data-slot': 'ult' }, this.ultRing, h('span.ic', '★'), h('span.lbl', 'ULTIME')),
    };
    const me = m.human;
    const mode = m.mode;
    this.ctrl = h('div.hud-ctrl', this.joyBase, h('div.hud-btns', this.btn.attack, this.btn.ability, this.btn.ult, this.btn.gadget, this.btn.roll));
    this.el = h('div#hud',
      this.hpLayer, this.vignette, this.flash, this.ctrl,
      h('div.hud-top',
        h('div.scoreboard',
          h('div.team.b', h('span.stroke-s', teamNames[0]), this.scoreB),
          this.clock,
          h('div.team.r', this.scoreR, h('span.stroke-s', mode.id === 'RIFT_BOSS' ? 'BOSS' : mode.id === 'SURVIVAL' ? 'VAGUES' : teamNames[1]))),
        this.riftPill,
        mode.id === 'RIFT_KING' ? h('div.king-goal.stroke-s', `👑 Premier à ${KING_TARGET} points`) : null),
      this.minimap, this.killfeed, this.announce, this.offscreen, this.respawnEl,
      h('div.hud-me', h('div.portrait', h('img', { src: portrait })),
        h('div.bars', h('div.bar.hp', this.meHp, this.meHpTxt), h('div.bar.ult', this.meUlt))),
      h('div.hud-ui',
        h('button.btn.small.dark.hud-btn-ui', { onclick: () => this.onPause() }, '⏸'),
        h('button.btn.small.dark.hud-btn-ui', { onclick: () => this.toggleEmotes() }, '😀')),
    );
    this.el.id = 'hud';
    if (mode.id === 'RIFT_BOSS') {
      this.bossFill = h('i'); this.bossShield = h('b'); this.bossPhase = h('span.ph', 'PHASE 1');
      this.bossBar = h('div.boss-bar', h('div.bn.stroke-s', '👹 RIFT COLOSSUS ', this.bossPhase), h('div.bb', this.bossFill, this.bossShield));
      this.dmgBoard = h('div.dmg-board.panel');
      this.el.append(this.bossBar, this.dmgBoard);
    }
    if (me) this.meHpTxt.textContent = String(Math.ceil(me.hp));
    for (let i = 0; i < 24; i++) { const d = h('div.dmg', { style: 'display:none' }); this.dmgPool.push(d); this.el.appendChild(d); }
    setTimeout(() => this.joyBase.classList.remove('hint'), 4000);
  }

  /** FIFIX: the player's hero changed — update the gadget button and portrait. */
  refreshHero() {
    const me = this.m.human;
    if (!me) return;
    const g = me.def.gadget;
    this.btn.gadget.style.display = g ? '' : 'none';
    (this.btn.gadget.querySelector('.ic') as HTMLElement).textContent = GADGET_ICONS[g?.effect ?? ''] ?? '✦';
    (this.btn.gadget.querySelector('.lbl') as HTMLElement).textContent = g ? g.name.toUpperCase() : 'GADGET';
    const img = this.el.querySelector('.hud-me .portrait img') as HTMLImageElement | null;
    if (img) img.src = this.portraitOf(me.def.id);
  }
  portraitOf: (heroId: string) => string = () => this.portrait;

  private toggleEmotes() {
    if (this.emoteWheel) { this.emoteWheel.remove(); this.emoteWheel = null; return; }
    this.emoteWheel = h('div.emote-wheel.panel', this.emotes.map((id) => {
      const c = getCosmetic(id);
      return h('button.hud-btn-ui', { onclick: () => { this.onEmote(c?.visual.glyph ?? '🙂'); this.toggleEmotes(); } }, c?.visual.glyph ?? '🙂');
    }));
    this.el.appendChild(this.emoteWheel);
  }

  showAnnounce(big: string, sub = '', color = '#fff', ms = 1600) {
    this.announce.innerHTML = '';
    this.announce.appendChild(h('div.big.stroke', { style: `color:${color}` }, big));
    if (sub) this.announce.appendChild(h('div.sub.stroke-s', sub));
    const el = this.announce.firstElementChild;
    clearTimeout((this as any)._annT);
    (this as any)._annT = setTimeout(() => { if (this.announce.firstElementChild === el) this.announce.innerHTML = ''; }, ms);
  }

  screenFlash(color: string) {
    this.flash.style.setProperty('--fc', color);
    this.flash.style.opacity = '1';
    setTimeout(() => (this.flash.style.opacity = '0'), 220);
  }

  onEvent(e: MatchEvent) {
    const m = this.m;
    switch (e.t) {
      case 'hit': case 'heal': {
        const t = m.heroById(e.target);
        if (!t || !m.isVisibleTo(t, m.human?.team ?? 0)) break;
        if (e.t === 'hit' && e.source !== m.humanId && e.target !== m.humanId && Math.random() < 0.5) break; // declutter
        this.damageNumber(t, e.amount, e.t === 'heal' ? 'heal' : e.target === m.humanId ? 'me' : e.t === 'hit' && e.tag ? e.tag : '');
        if (e.t === 'hit' && e.tag && e.source === m.humanId && TAG_FR[e.tag]) this.showAnnounce(TAG_FR[e.tag][0], '', TAG_FR[e.tag][1], 600);
        if (e.t === 'hit' && e.target === m.humanId) { this.hurtT = 0.4; }
        break;
      }
      case 'kill': {
        const k = m.heroById(e.killer), v = m.heroById(e.victim);
        if (!v || (v.pve && v.def.id === 'minion' && !(k && k.id === m.humanId))) break;
        const row = h('div.kf', k ? h('span', { class: k.team === 0 ? 'b' : 'r' }, k.name) : h('span', '☠'), h('span', '⚔'), h('span', { class: v.team === 0 ? 'b' : 'r' }, v.name));
        this.killfeed.prepend(row);
        while (this.killfeed.children.length > 4) this.killfeed.lastElementChild?.remove();
        setTimeout(() => row.remove(), 4500);
        if (e.killer === m.humanId && !v.pve) this.showAnnounce('ÉLIMINATION !', '', '#ffe14d', 900);
        break;
      }
      case 'countdown': this.showAnnounce(String(e.n), '', '#fff', 900); break;
      case 'kickoff': this.showAnnounce(m.overtime ? 'SUDDEN DEATH' : 'GO !', m.overtime ? 'Le prochain point gagne !' : '', m.overtime ? '#ff6b7a' : '#ffe14d', 1100); break;
      case 'goal': {
        if (m.mode.id === 'RIFT_BOSS') { this.showAnnounce('IMPACT !', 'Le Colosse vacille !', '#ffe14d', 1400); break; }
        if (m.mode.id === 'SURVIVAL') { this.showAnnounce('NOVA !', 'Équipe soignée, créatures repoussées', '#5cff9d', 1400); break; }
        const mine = e.team === (m.human?.team ?? 0);
        const scorer = m.heroById(e.scorer);
        this.showAnnounce(mine ? 'BUT !' : 'BUT ADVERSE', scorer ? `${scorer.name} marque !` : '', mine ? '#ffe14d' : '#ff6b7a', 2200);
        this.screenFlash(mine ? 'rgba(47,155,255,0.55)' : 'rgba(255,59,78,0.55)');
        break;
      }
      case 'sudden_death': this.showAnnounce('SUDDEN DEATH', 'Égalité ! Le prochain point gagne.', '#ff6b7a', 2500); break;
      case 'mutation_warn': {
        const mu = getMutation(e.mutation);
        this.showAnnounce('⚠ RIFT MUTATION', mu.name, mu.color, 1800);
        this.screenFlash('rgba(255,61,245,0.45)');
        break;
      }
      case 'mutation_start': {
        const mu = getMutation(e.mutation);
        this.showAnnounce(mu.name, mu.tagline, mu.color, 1800);
        this.screenFlash(mu.color + '99');
        this.mutBanner?.remove();
        this.mutBanner = h('div.mut-banner', { style: `--mc:${mu.color}` }, h('div.mb-t.stroke-s', '⚠ ' + mu.name), h('div.small-text', mu.tagline), h('div.bar', h('i', { style: 'width:100%;background:#fff' })));
        this.el.appendChild(this.mutBanner);
        break;
      }
      case 'mutation_end': this.mutBanner?.remove(); this.mutBanner = null; break;
      case 'wave': this.showAnnounce(`VAGUE ${e.n}`, 'Les créatures du Rift arrivent !', '#5cff9d', 2000); break;
      case 'rift_charged': this.showAnnounce('RIFT SURCHARGÉ !', e.team === (m.human?.team ?? 0) ? 'Le prochain but vaut 2 points !' : 'Arrêtez le porteur : son but vaudra 2 points !', '#ffd23f', 1800); break;
      case 'bounty': { const hh = m.heroById(e.hero); if (hh) this.showAnnounce('👑 PRIME !', `${hh.name} est en série de 3 éliminations`, '#ffd23f', 1500); break; }
      case 'bounty_claim': { const k = m.heroById(e.killer); if (k && e.killer === m.humanId) this.showAnnounce('PRIME ENCAISSÉE !', '+40% ultime · bouclier', '#ffd23f', 1400); break; }
      case 'pickup': if (e.hero === m.humanId) this.showAnnounce({ speed: '💨 VITESSE', shield: '🛡️ BOUCLIER', power: '⚔️ PUISSANCE', ult: '★ ULTIME +35%' }[e.kind], '', '#80ed99', 900); break;
      case 'gadget': { const hh = m.heroById(e.hero); if (hh && e.hero === m.humanId && hh.def.gadget) this.showAnnounce(hh.def.gadget.name.toUpperCase(), '', '#7cc4ff', 800); break; }
      case 'boss_attack': {
        if (e.name === 'shield_break') { this.showAnnounce('BOUCLIER BRISÉ !', 'Le Colosse est sonné : frappez fort !', '#00f5d4', 1800); this.screenFlash('rgba(0,245,212,.4)'); break; }
        if (e.name === 'shield') { this.showAnnounce('🛡️ BOUCLIER DU RIFT', 'Livrez-lui le Rift pour le briser !', '#00f5d4', 1800); break; }
        const n = BOSS_ATTACKS[e.name];
        const tip: Record<string, string> = { beam: 'Écartez-vous de la ligne rouge !', charge: 'Écartez-vous de la ligne rouge !', ring: 'Esquivez les cristaux entre les trous !', gravity: 'Résistez à l\'aspiration puis fuyez !', summon: 'Des Riftlings arrivent !', slam: 'Sortez du cercle rouge !', meteors: 'Sortez des cercles rouges !' };
        if (n) this.showAnnounce('⚠ ' + n, tip[e.name] ?? '', '#ff4d6d', 1100);
        break;
      }
      case 'boss_phase':
        this.showAnnounce(e.phase === 2 ? 'PHASE 2 : ENRAGÉ' : 'PHASE 3 : FRÉNÉSIE', e.phase === 2 ? 'Le Colosse charge et aspire !' : 'Bouclier du Rift et attaques en rafale !', '#ff00a0', 2400);
        this.screenFlash('rgba(255,0,160,.45)');
        break;
      case 'last_stand': if (e.hero === m.humanId) { this.showAnnounce('DERNIER SOUFFLE !', 'Bouclier + vitesse : fuis ou contre-attaque !', '#ffe14d', 1200); this.screenFlash('rgba(255,225,77,.35)'); } break;
      case 'fifix_warn': this.showAnnounce('🎰 ROULETTE FIFI…', 'Changement de héros dans 3 s !', '#ff4ecd', 1500); break;
      case 'hero_swap': if (e.hero === m.humanId) { const d = getCharacter(e.to); this.showAnnounce('🎰 TU DEVIENS ' + d.name + ' !', d.title, '#ff4ecd', 1800); this.refreshHero(); } break;
      case 'perfect': if (e.hero === m.humanId) { this.showAnnounce('ESQUIVE PARFAITE !', '+10% ultime · prochaine attaque +35%', '#00f5d4', 1000); this.screenFlash('rgba(0,245,212,.3)'); } break;
      case 'wall_slam': { const hh = m.heroById(e.hero); if (hh && (hh.lastHitBy === m.humanId || e.hero === m.humanId)) this.showAnnounce('💥 CONTRE LE MUR !', e.hero === m.humanId ? 'Étourdi !' : 'Ennemi étourdi', '#ff6b35', 900); break; }
      case 'revive': { const hh = m.heroById(e.hero); if (hh) this.showAnnounce('✨ RENAISSANCE', `${hh.name} revient au combat !`, '#ffe66d', 1400); break; }
      case 'time_stop': this.showAnnounce('⏳ ARRÊT DU TEMPS', '', '#4cc9f0', 1200); this.screenFlash('rgba(76,201,240,.35)'); break;
      case 'avatar': { const hh = m.heroById(e.hero); if (hh) this.showAnnounce('AVATAR DU RIFT', hh.name, '#9b5de5', 1300); break; }
      case 'king': {
        const hh = m.heroById(e.hero);
        if (!hh) break;
        const mine = hh.team === (m.human?.team ?? 0);
        this.showAnnounce(e.hero === m.humanId ? '👑 TU ES LE ROI !' : mine ? '👑 NOTRE ROI' : '👑 ROI ADVERSE', e.hero === m.humanId ? 'Survis : chaque seconde = 1 point' : mine ? `Protégez ${hh.name} !` : `Abattez ${hh.name} !`, mine ? '#ffd60a' : '#ff6b7a', 1500);
        break;
      }
      case 'capture': {
        const c = m.heroById(e.hero);
        if (m.mode.id === 'RIFT_KING') break;
        if (c && e.hero === m.humanId) this.showAnnounce('RIFT CAPTURÉ !', 'Fonce vers le portail ennemi !', '#e0aaff', 1200);
        else if (c && e.interception && c.team === m.human?.team) this.showAnnounce('INTERCEPTION !', '', '#7cc4ff', 900);
        break;
      }
      case 'emote': {
        const hero = m.heroById(e.hero);
        if (!hero) break;
        const b = h('div.emote-bubble', e.emote);
        this.el.appendChild(b);
        const t0 = performance.now();
        const follow = () => {
          if (!b.isConnected) return;
          const p = this.r.toScreen(this.r.heroRenderPos(hero).x, this.r.heroRenderPos(hero).y, this.r.heroScreenHeight(hero) + 0.6, this.tmp);
          b.style.transform = `translate(${p.x - 20}px, ${p.y - 60}px)`;
          if (performance.now() - t0 < 1800) requestAnimationFrame(follow); else b.remove();
        };
        follow();
        break;
      }
    }
  }

  private damageNumber(t: Hero, amount: number, cls: string) {
    const el = this.dmgPool.pop();
    if (!el) return;
    el.className = 'dmg ' + cls;
    el.textContent = (cls === 'heal' ? '+' : '') + amount + (cls === 'combo' ? '!' : cls === 'back' ? ' ↶' : '');
    el.style.display = '';
    const p = this.r.toScreen(t.x, t.y, this.r.heroScreenHeight(t), this.tmp);
    this.dmgActive.push({ el, t: 0, x: p.x + (Math.random() - 0.5) * 40, y: p.y - 10, vy: -90 });
  }

  update(dt: number) {
    const m = this.m;
    const me = m.human;
    // score / clock / rift
    if (m.mode.id === 'RIFT_BOSS') {
      const boss = m.heroes.find((x) => isBoss(x));
      this.scoreR.textContent = boss ? Math.ceil((boss.hp / boss.maxHp) * 100) + '%' : '0%';
      this.scoreB.textContent = String(m.score[0]);
      if (boss && this.bossFill && this.bossShield && this.bossPhase) {
        const pct = Math.max(0, boss.hp / boss.maxHp);
        this.bossFill.style.width = pct * 100 + '%';
        const sh = boss.shield > 0 && boss.shieldUntil > m.time ? Math.min(1, boss.shield / 12000) : 0;
        this.bossShield.style.width = sh * 100 + '%';
        const ph = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3;
        this.bossPhase.textContent = ph === 1 ? 'PHASE 1' : ph === 2 ? 'PHASE 2 · ENRAGÉ' : 'PHASE 3 · FRÉNÉSIE';
        this.bossBar!.dataset.phase = String(ph);
      }
      this.boardT -= dt;
      if (this.dmgBoard && this.boardT <= 0) {
        this.boardT = 0.3;
        const ps = m.heroes.filter((x) => !x.pve && x.team === 0).sort((a, b) => b.stats.bossDamage - a.stats.bossDamage);
        const top = Math.max(1, ps[0]?.stats.bossDamage ?? 1);
        this.dmgBoard.innerHTML = '';
        this.dmgBoard.appendChild(h('div.db-t', '⚔️ DÉGÂTS AU BOSS'));
        ps.forEach((p, i) => this.dmgBoard!.appendChild(h('div.db-row' + (p.id === m.humanId ? '.me' : ''),
          h('span.rk', ['🥇', '🥈', '🥉'][i] ?? String(i + 1)), h('span.nm', p.name),
          h('div.db-bar', h('i', { style: `width:${(100 * p.stats.bossDamage) / top}%` })),
          h('span.v', p.stats.bossDamage >= 1000 ? (p.stats.bossDamage / 1000).toFixed(1) + 'k' : String(Math.round(p.stats.bossDamage))))));
      }
    } else if (m.mode.id === 'SURVIVAL') {
      this.scoreR.textContent = `${(m.modeRules as any).wave ?? 0}/8`;
      this.scoreB.textContent = String(m.heroes.filter((x) => x.team === 0 && x.alive).length);
    } else if (this.lastScore[0] !== m.score[0] || this.lastScore[1] !== m.score[1]) {
      this.scoreB.textContent = String(m.score[0]); this.scoreR.textContent = String(m.score[1]);
      this.lastScore = [m.score[0], m.score[1]];
    }
    this.clock.textContent = m.phase === 'countdown' && m.time < 3.1 ? formatClock(m.clock) : formatClock(m.clock);
    this.clock.classList.toggle('low', m.clock <= 15 && m.phase !== 'ended');
    const rift = m.mainRift();
    if (rift) {
      const mu = getMutation(m.mutation);
      const carrier = rift.carrier >= 0 ? m.heroById(rift.carrier) : null;
      const label = carrier ? `RIFT · ${carrier.team === (me?.team ?? 0) ? 'ALLIÉ' : 'ENNEMI'}` : `RIFT · ${RIFT_STATE_FR[rift.state] ?? rift.state}`;
      (this.riftPill.lastElementChild as HTMLElement).textContent = m.mutation !== 'NORMAL' ? `${label} · ${mu.name}` : label;
      this.riftPill.style.setProperty('--rc', m.mutation !== 'NORMAL' ? mu.color : carrier ? (carrier.team === 0 ? '#2f9bff' : '#ff3b4e') : '#b388ff');
    }
    if (this.mutBanner && m.mutation !== 'NORMAL') {
      const mu = getMutation(m.mutation);
      const i = this.mutBanner.querySelector('.bar > i') as HTMLElement;
      if (i) i.style.width = (100 * m.mutationTimeLeft) / mu.duration + '%';
    }
    // me
    if (me) {
      this.meHp.style.width = (100 * Math.max(0, me.hp)) / me.maxHp + '%';
      this.meHpTxt.textContent = String(Math.max(0, Math.ceil(me.hp)));
      this.meUlt.style.width = me.ult + '%';
      const abReady = me.abCd <= 0;
      this.btn.ability.classList.toggle('cool', !abReady);
      this.abCd.style.setProperty('--p', abReady ? '0%' : (100 * me.abCd) / me.def.ability.cooldown + '%');
      this.abCdN.textContent = abReady ? '' : String(Math.ceil(me.abCd));
      this.ultRing.style.setProperty('--p', me.ult + '%');
      this.btn.ult.classList.toggle('ready', me.ult >= 100);
      const sil = me.silenceUntil > m.time;
      for (const b of [this.btn.ability, this.btn.ult, this.btn.gadget]) b.classList.toggle('silenced', sil);
      this.gadgetN.textContent = String(me.gadgetCharges);
      this.btn.gadget.classList.toggle('cool', me.gadgetCharges <= 0 || me.gadgetCd > 0);
      this.rollCd.style.setProperty('--p', me.rollCd > 0 ? (100 * me.rollCd) / (me.carrying ? 5.5 : 4) + '%' : '0%');
      this.btn.roll.classList.toggle('cool', me.rollCd > 0);
      this.btn.attack.classList.toggle('carry', me.carrying);
      (this.btn.attack.querySelector('.ic') as HTMLElement).textContent = me.carrying ? '🔮' : '🎯';
      (this.btn.attack.querySelector('.lbl') as HTMLElement).textContent = me.carrying ? (m.mode.id === 'RIFT_KING' ? 'PASSER' : 'LANCER') : 'ATTAQUE';
      if (!me.alive) {
        this.respawnEl.style.display = '';
        this.respawnEl.textContent = me.respawnAt === Infinity ? 'K.O.' : `RÉAPPARITION DANS ${Math.max(0, Math.ceil(me.respawnAt - m.time))}`;
      } else this.respawnEl.style.display = 'none';
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.vignette.style.opacity = me && me.alive && (me.hp < me.maxHp * 0.3 || this.hurtT > 0) ? String(Math.max(this.hurtT * 2, me.hp < me.maxHp * 0.3 ? 0.6 : 0)) : '0';

    // floating hp bars
    const viewTeam = me?.team ?? 0;
    const seen = new Set<number>();
    for (const hero of m.heroes) {
      if (!hero.alive || !m.isVisibleTo(hero, viewTeam)) continue;
      seen.add(hero.id);
      let e = this.hpEls.get(hero.id);
      if (!e) {
        const isMe = hero.id === m.humanId;
        const fill = h('i'), shield = h('u');
        const num = isMe || hero.def.id === 'boss_golem' ? h('div.hpn.stroke-s') : null;
        const carry = h('div.carry', { style: 'display:none' }, '🔮 RIFT');
        const badges = h('div.badges');
        const color = isMe ? '#3ddc84' : hero.team === viewTeam ? '#2f9bff' : '#ff3b4e';
        const root = h('div.hpbar' + (isMe ? '.me' : ''), { style: `--hc:${color}` }, carry, badges, h('div.nm', { style: `color:${isMe ? '#ffe14d' : '#fff'}` }, hero.name), h('div.hb', { style: hero.def.id === 'boss_golem' ? 'width:12em;height:1em' : '' }, fill, shield), num);
        this.hpLayer.appendChild(root);
        e = { root, fill, shield, num, carry, badges, lastHp: -1, lastCarry: false, lastBadges: '' };
        this.hpEls.set(hero.id, e);
      }
      const rp = this.r.heroRenderPos(hero);
      const p = this.r.toScreen(rp.x, rp.y, this.r.heroScreenHeight(hero), this.tmp);
      e.root.style.display = p.visible ? '' : 'none';
      e.root.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      if (e.lastHp !== hero.hp) {
        e.lastHp = hero.hp;
        e.fill.style.width = (100 * Math.max(0, hero.hp)) / hero.maxHp + '%';
        if (e.num) e.num.textContent = String(Math.ceil(hero.hp));
      }
      e.shield.style.width = hero.shield > 0 && hero.shieldUntil > m.time ? Math.min(100, (100 * hero.shield) / hero.maxHp) + '%' : '0%';
      if (e.lastCarry !== hero.carrying) { e.lastCarry = hero.carrying; e.carry.style.display = hero.carrying ? '' : 'none'; }
      const charged = hero.carrying && m.rifts.some((r) => r.carrier === hero.id && r.charged);
      const b = (hero.streak >= 3 ? '💀' : '') + (hero.powerUntil > m.time ? '⚔️' : '') + (hero.speedBuffUntil > m.time ? '💨' : '') + (charged ? '⚡x2' : '')
        + (hero.lastStand && hero.shieldUntil > m.time ? '🔥' : '') + (hero.silenceUntil > m.time ? '🌑' : '') + (hero.dmgReductionUntil > m.time ? '🛡' : '') + (hero.avatarUntil > m.time ? '🔱' : '');
      if (b !== e.lastBadges || hero.king !== (e.carry.dataset.k === '1')) {
        e.lastBadges = b; e.badges.textContent = b; e.carry.dataset.k = hero.king ? '1' : '0';
        e.carry.textContent = hero.king ? '👑 ROI' : charged ? '🔮 RIFT SURCHARGÉ' : '🔮 RIFT';
      }
    }
    for (const [id, e] of this.hpEls) if (!seen.has(id)) { e.root.remove(); this.hpEls.delete(id); }

    // damage numbers
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const d = this.dmgActive[i];
      d.t += dt; d.y += d.vy * dt; d.vy += 140 * dt;
      d.el.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -50%) scale(${d.t < 0.1 ? 1 + (0.1 - d.t) * 6 : 1})`;
      d.el.style.opacity = String(Math.max(0, 1 - Math.max(0, d.t - 0.5) * 2.5));
      if (d.t > 0.9) { d.el.style.display = 'none'; this.dmgPool.push(d.el); this.dmgActive.splice(i, 1); }
    }

    // off-screen rift indicator
    if (rift && rift.alive) {
      const p = this.r.toScreen(rift.x, rift.y, 0.6, this.tmp);
      const W = window.innerWidth, H = window.innerHeight, pad = 40;
      const off = p.x < pad || p.x > W - pad || p.y < pad + 30 || p.y > H - pad;
      this.offscreen.style.display = off ? '' : 'none';
      if (off) {
        const cx = W / 2, cy = H / 2;
        const a = Math.atan2(p.y - cy, p.x - cx);
        const x = Math.max(pad, Math.min(W - pad, p.x)), y = Math.max(pad + 40, Math.min(H - pad, p.y));
        this.offscreen.style.transform = `translate(${x - 18}px, ${y - 18}px) rotate(${a}rad)`;
      }
    }

    // minimap @ 10 Hz
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.1; this.drawMinimap(); }
  }

  private drawMinimap() {
    const m = this.m, c = this.mmCtx, W = this.minimap.width, H = this.minimap.height;
    const sx = W / m.arena.w, sy = H / m.arena.h;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (const w of m.arena.walls) if (!w.border) c.fillRect(w.x * sx, w.y * sy, w.w * sx, w.h * sy);
    c.fillStyle = 'rgba(80,200,90,0.35)';
    for (const b of m.arena.bushes) c.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    for (const p of m.arena.portals) { c.fillStyle = p.team === 0 ? '#2f9bff' : '#ff3b4e'; c.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy); }
    const team = m.human?.team ?? 0;
    for (const hero of m.heroes) {
      if (!hero.alive || !m.isVisibleTo(hero, team)) continue;
      c.fillStyle = hero.id === m.humanId ? '#ffe14d' : hero.team === team ? '#7cc4ff' : '#ff6b7a';
      c.beginPath(); c.arc(hero.x * sx, hero.y * sy, hero.id === m.humanId ? 7 : hero.def.id === 'boss_golem' ? 10 : 5, 0, Math.PI * 2); c.fill();
    }
    for (const r of m.rifts) {
      if (!r.alive) continue;
      c.fillStyle = '#e0aaff'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(r.x * sx, r.y * sy, r.clone ? 4 : 7, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }

  dispose() { this.el.remove(); }
}
