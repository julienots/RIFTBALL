import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { rewardIcon, rewardText, gem } from '../icons';
import { formatDuration } from '../../core/Time';
import type { PassTrack } from '../../battlepass/BattlePassService';
import { showRewards, buyProduct } from './Shop';
import type { RewardItem } from '../../data/types';

export function passScreen(c: Controller): Screen {
  const head = h('div.row', { style: 'padding:0 .9em;gap:.8em;flex-wrap:wrap' });
  const track = h('div.hscroll', { style: 'flex:1;min-height:0' });
  const body = h('div.col', { style: 'flex:1;min-height:0;gap:.4em' }, head, h('div.panel', { style: 'flex:1;min-height:0;margin:0 .9em .9em;display:flex' }, track));
  const { el, off } = shell(c, 'RIFT PASS', body);
  let firstScroll = true;

  const render = () => {
    const p = c.app.pass, s = p.season;
    head.innerHTML = '';
    head.append(
      h('div.col', { style: 'gap:.2em' }, h('span.title.stroke-s', { style: 'font-size:1.2em' }, `SAISON ${s.number} · ${s.name}`), h('span.small-text', `⏳ Fin dans ${formatDuration(p.timeLeftMs)} · Palier ${p.tier}/${s.passTiers}`)),
      h('div.bar.pass', { style: 'width:14em;height:1.3em' }, h('i', { style: `width:${p.tierProgress * 100}%` }), h('span', p.tier >= s.passTiers ? 'MAX' : `${Math.round(p.tierProgress * s.passXpPerTier)}/${s.passXpPerTier} XP`)),
      h('div.grow'),
      p.claimableCount > 0 ? h('button.btn.small.green.pulse', { onclick: () => { const g = p.claimAll(); showRewards(c, g); render(); } }, `TOUT RÉCUPÉRER (${p.claimableCount})`) : h('span'),
      !p.hasPremium ? h('button.btn.small.yellow.shine', { onclick: () => buyPassModal(c, render) }, '🎟️ PREMIUM') : !p.hasPlus ? h('button.btn.small.purple', { onclick: () => buyPassModal(c, render) }, '✨ PASS+') : h('span.pill', '✔ PASS+ ACTIF'));
    track.innerHTML = '';
    const row = h('div.pass-track');
    row.appendChild(h('div.pass-col', { style: 'flex:0 0 5em;justify-content:flex-end' }, h('div.tier', ' '),
      h('div.pass-cell', { style: 'background:transparent;border:0' }, h('b', 'GRATUIT')),
      h('div.pass-cell', { style: 'background:transparent;border:0' }, h('b', 'PREMIUM')),
      h('div.pass-cell', { style: 'background:transparent;border:0' }, h('b', 'PASS+'))));
    for (let t = 1; t <= s.passTiers; t++) {
      const col = h('div.pass-col', h('div.tier' + (t <= p.tier ? '.reached' : ''), String(t)));
      for (const tr of ['free', 'premium', 'plus'] as PassTrack[]) col.appendChild(cell(c, t, tr, render));
      row.appendChild(col);
    }
    track.appendChild(row);
    if (firstScroll) { firstScroll = false; requestAnimationFrame(() => { track.scrollLeft = Math.max(0, (p.tier - 3) * 90); }); }
  };
  return { el, onShow: render, refresh: render, onHide: off };
}

function cell(c: Controller, tier: number, tr: PassTrack, render: () => void) {
  const p = c.app.pass;
  const r = p.reward(tier, tr);
  if (!r) return h('div.pass-cell.empty.' + tr);
  const claimed = p.isClaimed(tier, tr), can = p.canClaim(tier, tr);
  const locked = (tr === 'premium' && !p.hasPremium) || (tr === 'plus' && !p.hasPlus);
  return h('button.pass-cell.' + tr + (claimed ? '.claimed' : '') + (can ? '.claimable' : '') + (locked ? '.lockedp' : ''), {
    onclick: () => {
      if (can) { audio.play('reward'); const g = p.claim(tier, tr); if (g) showRewards(c, g); render(); }
      else { audio.play('tab'); c.ui.toast(rewardIcon(r), rewardText(r), locked ? 'Nécessite le pass ' + (tr === 'plus' ? 'PASS+' : 'Premium') : tier > p.tier ? `Palier ${tier} requis` : ''); }
    },
  }, h('span.ri', rewardIcon(r)), h('span.stroke-s', { style: 'font-size:.85em;line-height:1' }, short(r)));
}

function short(r: RewardItem) {
  const t = rewardText(r);
  return t.length > 16 ? t.slice(0, 15) + '…' : t;
}

export function buyPassModal(c: Controller, after: () => void) {
  const p = c.app.pass, s = p.season;
  const opt = (name: string, plus: boolean, gemsPrice: number, productId: string, perks: string[], color: string) =>
    h('div.card', { style: `width:15em;padding:.7em;display:flex;flex-direction:column;gap:.3em;background:linear-gradient(160deg,${color},#2a1d68)` },
      h('div.name', { style: 'font-size:1.3em;text-align:center' }, name), perks.map((x) => h('div.small-text', '✔ ' + x)),
      (plus ? p.hasPlus : p.hasPremium) ? h('span.owned-tag', { style: 'position:static;text-align:center' }, 'ACTIF') : h('div.col', { style: 'gap:.3em' },
        h('button.btn.small.purple', { onclick: () => { if (p.buyPremiumWithGems(plus)) { audio.play('unlock'); m.close(); c.ui.toast('🎟️', name + ' activé !'); after(); } else { audio.play('error'); c.ui.toast('💎', 'Pas assez de gemmes'); } } }, h('span.price', gemsPrice + ' ', gem())),
        h('button.btn.small.green', { onclick: () => { m.close(); buyProduct(c, productId, after); } }, c.app.iap.priceOf(productId))));
  const m = c.ui.modal('RIFT PASS', h('div.col', { style: 'align-items:center;gap:.6em' },
    h('div.row', { style: 'gap:.8em' },
      opt('PREMIUM', false, s.passPriceGems, 'battle_pass', ['30 récompenses premium', 'Skin légendaire exclusif', 'Gemmes, coins, caisses'], '#ffb703'),
      opt('PASS+', true, s.passPlusPriceGems, 'battle_pass_plus', ['Inclut Premium', 'Piste PASS+ (skin MYTHIQUE)', '+20% Pass XP'], '#f72585')),
    h('div.small-text.muted', 'Uniquement cosmétique : aucun avantage en combat.')));
}
