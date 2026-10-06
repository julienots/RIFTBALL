import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import type { SaveSystem } from '../save/SaveSystem';
import type { Notification } from '../save/SaveData';

/** In-app notifications: toast + persistent inbox. Ready for push notifications (FCM) later. */
export class NotificationCenter {
  private seq = 0;
  constructor(private save: SaveSystem, private bus: EventBus<AppEvents>) {}

  push(kind: Notification['kind'], title: string, body: string, opts: { silent?: boolean } = {}) {
    const n: Notification = { id: `${Date.now()}-${this.seq++}`, at: Date.now(), kind, title, body, read: false };
    this.save.data.inbox.push(n);
    if (this.save.data.inbox.length > 60) this.save.data.inbox.shift();
    this.save.save();
    if (!opts.silent) this.bus.emit('notify', n);
    return n;
  }
  get unread() { return this.save.data.inbox.filter((n) => !n.read).length; }
  markAllRead() { for (const n of this.save.data.inbox) n.read = true; this.save.save(); }
  list() { return this.save.data.inbox.slice().reverse(); }
}
