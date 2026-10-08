import type { App } from '../core/App';
import type { WorldRenderer } from '../game/render/WorldRenderer';
import { UIManager } from './UIManager';
import { GameSession, type SessionConfig, type SessionEnd } from '../game/GameView';
import { audio } from '../audio/AudioEngine';
import type { BotProfile, ModeId } from '../data/types';
import { getMode } from '../data/modes';
import { botProfileForTrophies } from '../data/bots';
import { PLAYABLE } from '../data/characters';
import { createMatch } from '../gamemodes/MatchFactory';

/**
 * Glue between the meta-game (App), the UI screens and match sessions.
 * Screens receive this controller and never talk to each other directly.
 */
export class Controller {
  readonly ui: UIManager;
  session: GameSession | null = null;
  selectedMode: ModeId = 'RIFTBALL';
  trainingLevel: BotProfile['id'] | null = null;
  party: { heroId: string; name: string }[] = [];
  private portraits = new Map<string, string>();
  screens!: {
    home: () => void;
    results: (e: SessionEnd) => void;
    matchmaking: () => void;
    tutorial: () => void;
  };

  constructor(readonly app: App, readonly renderer: WorldRenderer, root: HTMLElement) {
    this.ui = new UIManager(root);
    app.bus.on('notify', (n) => {
      if (this.session && !this.session.match.result) return; // no popups during a match
      const icons: Record<string, string> = { skin: '🎨', mission: '✅', pass: '🎟️', event: '🎉', reward: '🎁', shop: '🛒', level: '⭐', crew: '👥', friend: '🤝' };
      this.ui.toast(icons[n.kind] ?? '🔔', n.title, n.body);
      audio.play('notify');
    });
  }

  get data() { return this.app.data; }
  /** A hero can be played when owned, or during the ESSAI MYTHIQUE event (free trial of every hero). */
  canPlay(id: string) { return this.app.inventory.hasHero(id) || !!this.app.events.modifiers().allHeroes; }
  get heroId() { const f = this.data.profile.favoriteHero; return this.canPlay(f) ? f : 'magnet'; }
  set heroId(id: string) { this.app.profile.setFavorite(id); }
  get skinId() { return this.app.cosmetics.skinOf(this.heroId); }

  portrait(heroId: string, skinId?: string): string {
    const key = heroId + '|' + (skinId ?? heroId + '_default');
    let p = this.portraits.get(key);
    if (!p) { p = this.renderer.portrait(heroId, skinId ?? heroId + '_default', 192); this.portraits.set(key, p); }
    return p;
  }

  /** Pre-render all hero portraits during loading (no hitch later). */
  warmPortraits(onProgress: (k: number) => void) {
    const list = PLAYABLE;
    list.forEach((c, i) => { this.portrait(c.id); onProgress((i + 1) / list.length); });
  }

  modeLocked(id: ModeId) { return this.data.level < getMode(id).unlockLevel; }

  /** Bot difficulty used by matchmaking: training choice, else adapted to trophies. */
  get botLevel(): BotProfile['id'] { return this.trainingLevel ?? botProfileForTrophies(this.data.trophies); }

  /** Builds the exact match (roster included) that matchmaking will show in the lobby, then play. */
  prepareMatch(p: { mode: ModeId; seed: number; arenaId: string }) {
    return createMatch({
      mode: p.mode, arenaId: p.arenaId, seed: p.seed,
      player: { heroId: this.heroId, name: this.data.profile.name, skinId: this.skinId },
      botLevel: this.botLevel, modifiers: this.app.events.modifiers(), friends: this.party.length ? [...this.party] : undefined,
    });
  }

  startMatch(partial: Partial<SessionConfig> & { mode: ModeId; matchId: string; seed: number; arenaId: string }) {
    const cfg: SessionConfig = {
      heroId: this.heroId, skinId: this.skinId,
      botLevel: this.botLevel,
      vsBots: true, training: !!this.trainingLevel, friends: this.party.length ? this.party : undefined, ...partial,
    };
    this.ui.closeModals();
    for (const el of Array.from(this.ui.root.querySelectorAll('.screen'))) (el as HTMLElement).style.display = 'none';
    this.renderer.showcaseActive = false;
    const s = new GameSession(this.app, this.renderer, this.ui, cfg, this.portrait(cfg.heroId, cfg.skinId));
    s.onEnd = (e) => {
      this.session = null;
      s.dispose();
      this.screens.results(e);
    };
    this.session = s;
    return s;
  }

  frame(dt: number) {
    if (this.session) this.session.update(dt);
    else {
      this.ui.update(dt);
      if (this.renderer.showcaseActive) this.renderer.renderShowcase(dt);
    }
  }
}
