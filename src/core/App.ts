import { EventBus } from './EventBus';
import type { AppEvents } from './AppEvents';
import { BuildConfig } from './config';
import { SaveSystem } from '../save/SaveSystem';
import type { KVBackend } from '../save/Storage';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { Inventory } from '../progression/Inventory';
import { EventService } from '../events/EventService';
import { BattlePassService } from '../battlepass/BattlePassService';
import { MissionService } from '../missions/MissionService';
import { ProgressionService } from '../progression/ProgressionService';
import { ShopService } from '../shop/ShopService';
import { IapService } from '../iap/IapService';
import { MockBillingProvider, NativeBillingProvider, type BillingProvider } from '../iap/BillingProvider';
import { DevReceiptValidator, RemoteReceiptValidator, type ReceiptValidator } from '../iap/ReceiptValidator';
import { Analytics } from '../analytics/Analytics';
import { Connectivity } from '../networking/Connectivity';
import { AutoAuthority, type Authority } from '../networking/Authority';
import { OnlineClient } from '../networking/OnlineClient';
import { CollectionService } from '../collection/CollectionService';
import { CosmeticsService } from '../cosmetics/CosmeticsService';
import { ProfileService } from '../profile/ProfileService';
import { FriendsService } from '../friends/FriendsService';
import { LeaderboardService } from '../leaderboard/LeaderboardService';
import { CrewService } from '../clans/CrewService';
import { LocalMatchmaker, type Matchmaker } from '../networking/Matchmaking';
import { PRODUCTS } from '../data/products';
import { ARENAS } from '../data/arenas';
import type { ModeId } from '../data/types';

export interface AppOptions {
  kv: KVBackend;
  billing?: BillingProvider;
  validator?: ReceiptValidator;
  authority?: Authority;
  requireNetworkForIap?: boolean;
}

/** Composition root: wires every meta-game service. UI and tests both build the game through this. */
export class App {
  readonly bus = new EventBus<AppEvents>();
  readonly save: SaveSystem;
  readonly notes: NotificationCenter;
  readonly inventory: Inventory;
  readonly events: EventService;
  readonly pass: BattlePassService;
  readonly missions: MissionService;
  readonly progression: ProgressionService;
  readonly shop: ShopService;
  readonly iap: IapService;
  readonly analytics: Analytics;
  readonly net: Connectivity;
  readonly authority: Authority;
  readonly collection: CollectionService;
  readonly cosmetics: CosmeticsService;
  readonly profile: ProfileService;
  readonly friends: FriendsService;
  readonly leaderboard: LeaderboardService;
  readonly crew: CrewService;
  readonly matchmaker: Matchmaker;
  readonly billing: BillingProvider;
  readonly online = new OnlineClient();

  constructor(o: AppOptions) {
    this.save = new SaveSystem(o.kv, BuildConfig.saveKey);
    if (this.save.data.settings.serverUrl) BuildConfig.serverUrl = this.save.data.settings.serverUrl;
    this.notes = new NotificationCenter(this.save, this.bus);
    this.inventory = new Inventory(this.save, this.bus, this.notes);
    this.events = new EventService();
    this.net = new Connectivity(this.bus);
    this.authority = o.authority ?? new AutoAuthority(() => this.save.data.playerId);
    this.analytics = new Analytics(o.kv, () => this.save.data.playerId);
    this.pass = new BattlePassService(this.save, this.inventory, this.bus, this.notes);
    this.missions = new MissionService(this.save, this.inventory, this.bus, this.notes, this.events);
    this.progression = new ProgressionService(this.save, this.inventory, this.pass, this.missions, this.events, this.bus, this.notes, this.authority);
    this.shop = new ShopService(this.save, this.inventory, this.events, this.notes, this.bus, () => this.save.data.level);
    const prices = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.fallbackPrice]));
    this.billing = o.billing ?? (NativeBillingProvider.isAvailable() ? new NativeBillingProvider() : new MockBillingProvider(prices));
    const validator = o.validator ?? (this.billing.name === 'mock' ? new DevReceiptValidator() : new RemoteReceiptValidator(undefined, () => this.save.data.playerId));
    this.iap = new IapService(this.billing, validator, this.inventory, this.save, this.shop, this.notes, this.analytics, this.net, this.authority, o.requireNetworkForIap ?? true);
    this.collection = new CollectionService(this.save);
    this.cosmetics = new CosmeticsService(this.save);
    this.profile = new ProfileService(this.save);
    this.friends = new FriendsService(this.save, this.notes);
    this.leaderboard = new LeaderboardService(this.save, this.friends, () => this.net.online);
    this.crew = new CrewService(this.save, this.inventory, this.notes);
    this.matchmaker = new LocalMatchmaker((mode) => this.pickArena(mode));
    this.bus.on('passTier', ({ tier }) => this.analytics.track('battlepass_level', { tier }));
    this.bus.on('missionComplete', ({ id }) => this.analytics.track('mission_completed', { id }));
    this.bus.on('unlocked', ({ kind, id }) => { if (kind === 'cosmetic') this.analytics.track('skin_unlocked', { id }); });
  }

  /** Arena rotation, biased by live events (e.g. VOLCANIC WEEK). */
  pickArena(_mode: ModeId): string {
    const bias = this.events.modifiers().arenaBias;
    if (bias && Math.random() < 0.5) return bias;
    return ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
  }

  get data() { return this.save.data; }
}
