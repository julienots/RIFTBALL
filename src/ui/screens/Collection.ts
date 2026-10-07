import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import type { CollectionCategory } from '../../collection/CollectionService';
import { cosmeticArt } from '../icons';
import { RARITY_LABEL, getCosmetic } from '../../data/cosmetics';
import { audio } from '../../audio/AudioEngine';
import { getCharacter } from '../../data/characters';

const CAT_FR: Record<CollectionCategory, string> = { hero: 'HÉROS', skin: 'SKINS', emote: 'EMOTES', spray: 'SPRAYS', effect: 'EFFETS', banner: 'BANNIÈRES', title: 'TITRES', icon: 'ICÔNES' };

export function collectionScreen(c: Controller): Screen {
  let cat: CollectionCategory = 'skin';
  const tabs = h('div.tabs.hscroll');
  const grid = h('div.grid.scroll', { style: 'flex:1' });
  const total = h('span.pill', '');
  const body = h('div.col', { style: 'flex:1;min-height:0;gap:0' }, tabs, h('div.panel', { style: 'flex:1;min-height:0;margin:0 .9em .9em;display:flex;flex-direction:column;border-radius:0 1em 1em 1em' }, grid));
  const { el, off } = shell(c, 'COLLECTION', body, { extra: total });
  const render = () => {
    const t = c.app.collection.totals();
    total.textContent = `COLLECTÉ : ${t.owned} / ${t.total}`;
    tabs.innerHTML = '';
    for (const cc of c.app.collection.categoryCounts()) tabs.appendChild(h('button.tab' + (cc.cat === cat ? '.on' : ''), { onclick: () => { audio.play('tab'); cat = cc.cat; render(); } }, `${CAT_FR[cc.cat]} ${cc.owned}/${cc.total}`));
    grid.innerHTML = '';
    for (const it of c.app.collection.byCategory(cat)) {
      if (cat === 'hero') {
        grid.appendChild(h('div.card', { style: `background:linear-gradient(160deg,${getCharacter(it.id).palette.primary},#2a1d68)` }, h('div.art', h('img', { src: c.portrait(it.id), class: it.owned ? '' : 'locked' })), h('div.name', it.name), it.owned ? h('span.owned-tag', '✔') : null));
        continue;
      }
      const data = getCosmetic(it.id)!;
      const equippable = it.owned && ['spray', 'effect', 'icon', 'banner', 'title', 'emote'].includes(data.type);
      const equipped = data.type === 'spray' ? c.data.equipped.spray === it.id : data.type === 'effect' ? c.data.equipped.effect === it.id : data.type === 'icon' ? c.data.profile.icon === it.id : data.type === 'banner' ? c.data.profile.banner === it.id : data.type === 'title' ? c.data.profile.title === it.id : data.type === 'emote' ? c.data.equipped.emotes.includes(it.id) : false;
      grid.appendChild(h('button.card', { class: `rarity-${data.rarity} ${it.owned ? '' : 'locked'}`, onclick: () => {
        if (!equippable) return;
        audio.play('click');
        if (data.type === 'emote') { const idx = c.data.equipped.emotes.indexOf(it.id); if (idx < 0) { c.data.equipped.emotes.shift(); c.data.equipped.emotes.push(it.id); c.app.save.save(); } }
        else c.app.cosmetics.equip(data.type as any, it.id);
        render();
      } },
        h('div.art', cosmeticArt(it.id, (hh, s) => c.portrait(hh, s))), h('div.name', it.name), h('span.rlabel', RARITY_LABEL[data.rarity]),
        equipped ? h('span.owned-tag', 'ÉQUIPÉ') : it.owned ? h('span.owned-tag', { style: 'background:#2f8fff' }, '✔') : null));
    }
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
