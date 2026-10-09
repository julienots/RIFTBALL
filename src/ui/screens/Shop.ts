import { menuMusic } from '../../audio/music';
import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { coin, gem, rewardIcon, rewardText, cosmeticArt } from '../icons';
import { RARITY_COLORS, RARITY_LABEL } from '../../data/cosmetics';
import { PRODUCTS } from '../../data/products';
import { formatDuration, Clock } from '../../core/Time';
import type { GrantedItem } from '../../progression/Inventory';
import type { CrateData, ShopOfferData } from '../../data/types';
import { passScreen } from './Pass';

type Tab = 'offers' | 'skins' | 'gems' | 'pass' | 'crates';
const TABS: [Tab, string][] = [['offers', '🔥 OFFRES'], ['skins', '🎨 SKINS'], ['gems', '💎 GEMMES'], ['pass', '🎟️ PASS'], ['crates', '🎁 COFFRES']];

export function showRewards(c: Controller, items: GrantedItem[], title = 'RÉCOMPENSES') {
  if (!items.length) return;
  audio.play('reward');
  const list = h('div.row', { style: 'flex-wrap:wrap;justify-content:center;gap:.6em;max-width:36em' }, items.map((g, i) => {
    const isCos = g.item.kind === 'cosmetic' && !g.item.id.startsWith('pass_');
    return h('div.card.reveal', { style: `animation-delay:${i * 0.12}s;padding:.5em .8em;min-width:7em;display:flex;flex-direction:column;align-items:center;gap:.2em` },
      h('div', { style: 'font-size:2.2em;width:2.4em;height:2.4em;display:grid;place-items:center' }, isCos ? cosmeticArt((g.item as any).id, (hh, s) => c.portrait(hh, s)) : rewardIcon(g.item)),
      h('div.name', { style: 'font-size:.85em;text-align:center' }, rewardText(g.item)),
      g.duplicate ? h('div.small-text', { style: 'color:#ffe14d' }, `Doublon → +${g.coinsInstead} coins`) : null);
  }));
  const m = c.ui.modal(title, h('div.col', { style: 'align-items:center;gap:1em' }, list, h('button.btn.green', { onclick: () => m.close() }, 'GÉNIAL !')));
}

function priceEl(c: Controller, o: ShopOfferData) {
  if ('productId' in o.price) return h('span', c.app.iap.priceOf(o.price.productId));
  if (o.price.amount === 0) return h('span', 'GRATUIT');
  return h('span.price', fmt(o.price.amount) + ' ', o.price.currency === 'coins' ? coin() : gem());
}

export async function buyProduct(c: Controller, productId: string, after?: () => void) {
  const p = PRODUCTS.find((x) => x.id === productId)!;
  const ok = await c.ui.confirm('ACHAT', h('div.col', { style: 'align-items:center;gap:.4em' },
    h('div.title', { style: 'font-size:1.2em' }, p.title), h('div.small-text', p.description),
    h('div.title', { style: 'font-size:1.5em;color:#ffe14d' }, c.app.iap.priceOf(productId)),
    h('div.small-text.muted', 'Paiement sécurisé via Google Play. L\'achat est vérifié avant d\'être ajouté.')), 'ACHETER', 'yellow');
  if (!ok) return;
  const wait = c.ui.modal(null, h('div.col', { style: 'align-items:center;gap:.8em' }, h('div.spinner'), h('div', 'Traitement de l\'achat…')), { closable: false });
  const res = await c.app.iap.purchase(productId);
  wait.close();
  if (res.status === 'validated') {
    audio.play('purchase');
    showRewards(c, p.grants.map((item) => ({ item })), 'ACHAT CONFIRMÉ');
  } else {
    if (res.status !== 'cancelled') audio.play('error');
    c.ui.alert(res.status === 'pending' || res.status === 'validation_pending' ? 'EN ATTENTE' : res.status === 'cancelled' ? 'ANNULÉ' : 'ACHAT', res.message);
  }
  after?.();
}

export function shopScreen(c: Controller, initial: Tab = 'offers'): Screen {
  let tab: Tab = initial;
  const tabs = h('div.tabs');
  const content = h('div.scroll', { style: 'flex:1;min-height:0;padding:.8em' });
  const refreshLabel = h('span.small-text', '');
  const body = h('div.col', { style: 'flex:1;min-height:0;gap:0' }, tabs, h('div.panel', { style: 'flex:1;min-height:0;margin:0 .9em .9em;display:flex;flex-direction:column;border-radius:0 1em 1em 1em' }, content));
  const { el, off } = shell(c, 'BOUTIQUE', body, { extra: refreshLabel });

  const render = () => {
    tabs.innerHTML = '';
    for (const [t, lbl] of TABS) tabs.appendChild(h('button.tab' + (t === tab ? '.on' : ''), { onclick: () => { audio.play('tab'); tab = t; render(); } }, lbl));
    content.innerHTML = '';
    refreshLabel.textContent = `Boutique renouvelée dans ${formatDuration(c.app.shop.nextRefresh() - Clock.now())}`;
    if (tab === 'offers') renderOffers(); else if (tab === 'skins') renderDaily(); else if (tab === 'gems') renderGems(); else if (tab === 'pass') renderPass(); else renderCrates();
  };

  const renderOffers = () => {
    const offers = c.app.shop.offers();
    const row = h('div.row', { style: 'flex-wrap:wrap;gap:.9em;align-items:stretch' });
    for (const v of offers) {
      const o = v.offer;
      c.app.analytics.track('offer_view', { offer: o.id });
      const isReal = 'productId' in o.price;
      const priceGems = !isReal && (o.price as any).currency === 'gems' ? (o.price as any).amount : 0;
      row.appendChild(h('div.offer', { style: `--oc:${o.color}` },
        h('div.ribbon', o.tag),
        h('div.ot.stroke-s', { style: 'margin-top:.3em' }, o.name),
        h('div.items', o.items.map((i) => h('span.item', rewardIcon(i) + ' ' + rewardText(i)))),
        h('div.meta', h('span', `Valeur de référence : ${v.value} 💎`), v.endsAt ? h('span', '⏳ ' + formatDuration(v.endsAt - Clock.now())) : h('span', o.window === 'once' ? 'Offre unique' : '')),
        priceGems > 0 && v.value > priceGems ? h('div.small-text', { style: 'color:#ffe14d' }, `Contenu : ${v.value} 💎 de valeur pour ${priceGems} 💎`) : null,
        h('div.meta', h('span', `Limite : ${v.left}/${o.limit}`)),
        h('button.btn' + (v.available ? '.yellow' : '.gray'), { disabled: !v.available, onclick: () => buyOffer(o) }, v.available ? priceEl(c, o) : 'ACHETÉ')));
    }
    content.appendChild(row);
    content.appendChild(h('div.small-text.muted', { style: 'margin-top:.8em' }, 'Les valeurs affichées correspondent à la somme des prix à l\'unité. Aucun achat ne donne d\'avantage en combat.'));
  };

  const buyOffer = async (o: ShopOfferData) => {
    audio.play('click');
    if ('productId' in o.price) { await buyProduct(c, o.price.productId, render); return; }
    const p = o.price;
    if (p.amount > 0) {
      const ok = await c.ui.confirm(o.name, h('div.col', { style: 'align-items:center' }, h('div', o.items.map(rewardText).join(' · ')), h('div.title', { style: 'font-size:1.4em' }, 'Prix : ', priceEl(c, o))), 'ACHETER', 'yellow');
      if (!ok) return;
    }
    const g = c.app.shop.buyOffer(o.id);
    if (!g) { audio.play('error'); c.ui.toast('⚠', p.currency === 'gems' ? 'Pas assez de gemmes' : 'Pas assez de coins'); if (p.currency === 'gems') { tab = 'gems'; render(); } return; }
    audio.play('purchase');
    showRewards(c, g);
    render();
  };

  const renderDaily = () => {
    const items = c.app.shop.daily();
    content.appendChild(h('div.row', h('span.title', 'BOUTIQUE DU JOUR'), h('span.small-text.muted', `· même sélection pour tous les joueurs · renouvellement dans ${formatDuration(c.app.shop.nextRefresh() - Clock.now())}`)));
    const grid = h('div.grid', { style: 'padding:.6em 0' });
    for (const it of items) {
      const cos = it.cosmetic;
      grid.appendChild(h('div.card', { class: 'rarity-' + cos.rarity, style: 'aspect-ratio:.72' },
        h('div.art', cosmeticArt(cos.id, (hh, s) => c.portrait(hh, s))),
        h('div.name', cos.name), h('span.rlabel', RARITY_LABEL[cos.rarity] + ' · ' + cos.type.toUpperCase()),
        it.owned ? h('span.owned-tag', 'POSSÉDÉ') : h('button.btn.tiny.yellow', { onclick: async () => {
          const ok = await c.ui.confirm(cos.name, h('div.title', { style: 'font-size:1.3em' }, h('span.price', fmt(it.price.amount) + ' ', it.price.currency === 'coins' ? coin() : gem())), 'ACHETER', 'yellow');
          if (!ok) return;
          const g = c.app.shop.buyDaily(cos.id);
          if (!g) { audio.play('error'); c.ui.toast('⚠', 'Fonds insuffisants'); return; }
          audio.play('purchase'); showRewards(c, g, 'NOUVEL OBJET !'); render();
        } }, h('span.price', fmt(it.price.amount) + ' ', it.price.currency === 'coins' ? coin() : gem()))));
    }
    content.appendChild(grid);
  };

  const renderGems = () => {
    const row = h('div.row', { style: 'flex-wrap:wrap;gap:.8em;justify-content:center' });
    const art = ['💎', '💎💎', '💰💎', '👑💎'];
    PRODUCTS.filter((p) => p.id.startsWith('gems_')).forEach((p, i) => {
      const amount = (p.grants[0] as any).amount;
      row.appendChild(h('div.card', { style: 'width:11em;padding:.7em;display:flex;flex-direction:column;align-items:center;gap:.3em;background:linear-gradient(160deg,#3ec7ff,#1a3d8a)' },
        h('div', { style: 'font-size:2.6em' }, art[i]), h('div.name', { style: 'font-size:1.4em' }, fmt(amount)), h('div.small-text', p.title),
        h('button.btn.green', { onclick: () => buyProduct(c, p.id, render) }, c.app.iap.priceOf(p.id))));
    });
    content.append(row,
      h('div.row', { style: 'justify-content:center;margin-top:1em;gap:.8em' },
        h('button.btn.small.dark', { onclick: async () => { audio.play('click'); const r = await c.app.iap.restore(); c.ui.alert('RESTAURATION', r.message); render(); } }, '↺ Restaurer les achats')),
      h('div.small-text.muted', { style: 'text-align:center;margin-top:.6em' }, `Boutique : ${c.app.iap.providerName === 'mock' ? 'Mode test (aucun paiement réel)' : 'Google Play'} · Tous les achats sont vérifiés avant attribution. Les gemmes servent uniquement aux cosmétiques et au RIFT PASS.`));
  };

  const renderPass = () => {
    const p = c.app.pass, s = p.season;
    content.appendChild(h('div.col', { style: 'align-items:center;gap:.8em;text-align:center' },
      h('div.title.stroke', { style: 'font-size:1.6em' }, `RIFT PASS — SAISON ${s.number} : ${s.name}`),
      h('div.small-text', s.theme),
      h('div.row', { style: 'gap:1em;flex-wrap:wrap;justify-content:center' },
        passCard(c, 'PREMIUM', '#ffb703', ['Piste Premium (30 paliers)', 'Skin exclusif Reine des Aimants', 'Emotes, sprays, effets', 'Gemmes et coins'], p.hasPremium, s.passPriceGems, 'battle_pass', false, render),
        passCard(c, 'PASS+', '#f72585', ['Tout le Premium', 'Piste PASS+ exclusive (Ember Phénix)', '+20% Pass XP (cosmétique)', 'Effets visuels exclusifs'], p.hasPlus, s.passPlusPriceGems, 'battle_pass_plus', true, render)),
      h('button.btn.purple', { onclick: () => c.ui.push(passScreen(c)) }, 'VOIR LES RÉCOMPENSES'),
      h('div.small-text.muted', 'Le pass ne donne aucun avantage en combat : uniquement des cosmétiques et des ressources.')));
  };

  const renderCrates = () => {
    const row = h('div.row', { style: 'flex-wrap:wrap;gap:1em;justify-content:center' });
    for (const cr of c.app.shop.crates()) {
      const owned = c.data.crates[cr.id] ?? 0;
      row.appendChild(h('div.card', { style: `width:15em;padding:.8em;display:flex;flex-direction:column;align-items:center;gap:.4em;background:linear-gradient(160deg,${cr.color},#2a1d68)` },
        h('div', { style: 'font-size:3.2em' }, '🎁'), h('div.name', { style: 'font-size:1.3em' }, cr.name), h('div.small-text', `${cr.items} objet(s) cosmétique(s)`),
        h('div.col', { style: 'gap:.1em;width:100%' }, cr.table.map((t) => h('div.row.small-text', { style: 'justify-content:space-between' }, h('span', { style: `color:${RARITY_COLORS[t.rarity]}` }, RARITY_LABEL[t.rarity]), h('span', t.chance + ' %')))),
        h('div.small-text.muted', 'Doublon = coins garantis'),
        h('div.row', { style: 'gap:.4em' },
          h('button.btn.small.yellow', { onclick: async () => {
            const ok = await c.ui.confirm(cr.name, h('div.col', { style: 'align-items:center' }, h('div', 'Acheter pour ', h('b', fmt(cr.priceCoins) + ' '), coin(), ' ?'), h('div.small-text.muted', 'Contenu 100% cosmétique. Probabilités affichées.')), 'ACHETER', 'yellow');
            if (!ok) return;
            if (!c.app.shop.buyCrate(cr.id)) { audio.play('error'); c.ui.toast('🪙', 'Pas assez de coins'); return; }
            audio.play('coin'); openCrate(c, cr, render);
          } }, h('span.price', fmt(cr.priceCoins) + ' ', coin())),
          owned > 0 ? h('button.btn.small.green', { onclick: () => openCrate(c, cr, render) }, `OUVRIR (${owned})`) : null)));
    }
    content.append(row, h('div.small-text.muted', { style: 'text-align:center;margin-top:.8em' }, 'Les caisses s\'achètent uniquement avec des Rift Coins (monnaie gratuite). Elles ne contiennent que des cosmétiques.'));
  };

  return { el, onShow() { render(); audio.playMusic('shop'); c.app.analytics.track('shop_open', { tab }); }, onHide() { off(); audio.playMusic(menuMusic()); }, refresh: render };
}

function passCard(c: Controller, name: string, color: string, perks: string[], owned: boolean, gemsPrice: number, productId: string, plus: boolean, after: () => void) {
  return h('div.card', { style: `width:16em;padding:.8em;display:flex;flex-direction:column;gap:.35em;background:linear-gradient(160deg,${color},#2a1d68)` },
    h('div.name', { style: 'font-size:1.4em;text-align:center' }, name),
    perks.map((p) => h('div.small-text', '✔ ' + p)),
    owned ? h('span.owned-tag', { style: 'position:static;text-align:center' }, 'ACTIF') : h('div.col', { style: 'gap:.3em' },
      h('button.btn.small.purple', { onclick: async () => {
        const ok = await c.ui.confirm(name, h('div', 'Débloquer avec ', h('b', gemsPrice + ' '), gem(), ' ?'), 'DÉBLOQUER', 'yellow');
        if (!ok) return;
        if (c.app.pass.buyPremiumWithGems(plus)) { audio.play('unlock'); c.ui.toast('🎟️', name + ' activé !'); after(); } else { audio.play('error'); c.ui.toast('💎', 'Pas assez de gemmes'); }
      } }, h('span.price', gemsPrice + ' ', gem())),
      h('button.btn.small.green', { onclick: () => buyProduct(c, productId, after) }, c.app.iap.priceOf(productId))));
}

export function openCrate(c: Controller, cr: CrateData, after: () => void) {
  const box = h('div.crate-anim', '🎁');
  const stage = h('div.col', { style: 'align-items:center;gap:1em;min-width:20em;min-height:14em;justify-content:center;position:relative' }, h('div.burst'), box, h('div.title.stroke-s', 'Touchez pour ouvrir !'));
  let opened = false;
  const m = c.ui.modal(cr.name, stage, { closable: false });
  let shakes = 0;
  const shakeT = setInterval(() => { audio.play('chest_shake'); if (++shakes > 30) clearInterval(shakeT); }, 300);
  stage.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    clearInterval(shakeT);
    const res = c.app.shop.openCrate(cr.id);
    audio.play('chest_open');
    m.close();
    if (res) showRewards(c, res, 'CAISSE OUVERTE !');
    after();
  });
}
