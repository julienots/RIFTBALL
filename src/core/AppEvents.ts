import type { RewardItem } from '../data/types';
import type { Notification } from '../save/SaveData';

/** Global app events (meta-game). */
export type AppEvents = {
  wallet: { coins: number; gems: number };
  notify: Notification;
  levelUp: { level: number; rewards: RewardItem[] };
  passTier: { tier: number };
  missionComplete: { id: string; text: string };
  unlocked: { kind: 'hero' | 'cosmetic'; id: string };
  connectivity: { online: boolean };
  purchase: { productId: string; status: string; message?: string };
  shopRefresh: { day: string };
  saveChanged: {};
};
