import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { PLAYABLE, getCharacter } from '../../data/characters';
import { HERO_COIN_PRICE, MASTERY, TROPHY_ROAD } from '../../data/progression';
import { audio } from '../../audio/AudioEngine';
import { RARITY_LABEL } from '../../data/cosmetics';
import { coin, gem } from '../icons';
import { shopScreen } from './Shop';

const ROLE_FR: Record<string, string> = { CONTROL: 'CONTRÔLE', ASSASSIN: 'ASSASSIN', BUILDER: 'BÂTISSEUR', STEALTH: 'FURTIF', DAMAGE: 'DÉGÂTS', SUPPORT: 'SOUTIEN', TANK: 'TANK', ARTILLERY: 'ARTILLERIE' };

function unlockText(c: Controller, id: string) {
  const d = getCharacter(id);
  if (d.unlock.type === 'trophies') return `🏆 ${d.unlock.trophies} trophées`;
  if (d.unlock.type === 'season') return `RIFT PASS Saison 1 — palier ${d.unlock.passTier} (gratuit)`;
  if (d.unlock.type === 'coins') return `${d.unlock.price} coins`;
  void c;
  return '';
}

export function heroesScreen(c: Controller): Screen {
  const grid = h('div.grid.scroll', { style: 'flex:1' });
  const { el, off } = shell(c, 'PERSONNAGES', grid);
  const render = () => {
    grid.innerHTML = '';
    for (const hero of PLAYABLE) {
      const hp = c.data.heroes[hero.id];
      const owned = hp?.unlocked;
      const skin = owned ? hp.skin : `${hero.id}_default`;
      grid.appendChild(h('button.card.hero-card', { style: `background:linear-gradient(160deg,${hero.palette.primary},#2a1d68);${c.heroId === hero.id ? 'outline:.22em solid #ffe14d' : ''}`, onclick: () => { audio.play('click'); c.ui.push(heroDetail(c, hero.id)); } },
        h('div.art', h('img', { src: c.portrait(hero.id, skin), class: owned ? '' : 'locked' })),
        h('div.name', hero.name),
        h('div.small-text', { style: 'font-size:.62em;opacity:.9' }, ROLE_FR[hero.role]),
        owned ? h('div.tro', '🏆', String(hp.trophies)) : null,
        owned ? h('div.mast', '⭐' + hp.masteryLevel) : null,
        owned ? null : h('div.lock.stroke-s', '🔒', h('br'), unlockText(c, hero.id))));
    }
  };
  return { el, onShow: render, refresh: render, onHide: off };
}

function stat(label: string, v: number, max: number, txt: string) {
  return h('div.row', { style: 'gap:.5em' }, h('span', { style: 'width:6.5em;font-size:.8em' }, label), h('div.bar.purple.grow', { style: 'height:.8em' }, h('i', { style: `width:${Math.min(100, (v / max) * 100)}%` })), h('span.title', { style: 'width:3.6em;text-align:right;font-size:.85em' }, txt));
}

export function heroDetail(c: Controller, heroId: string): Screen {
  const body = h('div.row', { style: 'flex:1;align-items:stretch;padding:0 .9em .9em;gap:.8em;min-height:0' });
  let viewSkin = c.app.cosmetics.skinOf(heroId);
  const { el, off } = shell(c, getCharacter(heroId).name, body, { transparent: true });
  const render = () => {
    body.innerHTML = '';
    const hero = getCharacter(heroId);
    const hp = c.data.heroes[heroId];
    const owned = hp.unlocked;
    const m = c.app.progression.masteryOf(heroId);
    c.renderer.setShowcase(heroId, viewSkin, -1.2);
    const a = hero.attack;
    const left = h('div.panel.col.scroll', { style: 'width:38%;padding:.8em;gap:.45em' },
      h('div.title.stroke-s', { style: 'font-size:1.2em' }, hero.title),
      h('div.small-text.muted', hero.lore),
      stat('PV', hero.hp, 8200, fmt(hero.hp)),
      stat('Vitesse', hero.speed, 340, String(hero.speed)),
      stat('Attaque', a.damage * (a.projectiles ?? 1), 1100, fmt(a.damage) + (a.projectiles ? `×${a.projectiles}` : '')),
      stat('Portée', a.range, 760, String(a.range)),
      stat('Cadence', 1 / a.cooldown, 2.3, a.cooldown + 's'),
      h('div.panel', { style: 'padding:.45em .6em;background:rgba(10,5,30,.35)' }, h('div.title', '⚡ ' + hero.ability.name, h('span.small-text.muted', `  ${hero.ability.cooldown}s`)), h('div.small-text', hero.ability.description)),
      h('div.panel', { style: 'padding:.45em .6em;background:rgba(10,5,30,.35)' }, h('div.title', { style: 'color:#ffe14d' }, '★ ULTIME : ' + hero.ultimate.name), h('div.small-text', hero.ultimate.description)),
      h('div.panel', { style: 'padding:.45em .6em;background:rgba(10,5,30,.35)' }, h('div.title', { style: 'color:#7cc4ff' }, '◆ PASSIF : ' + hero.passive.name), h('div.small-text', hero.passive.description)));
    const skins = c.app.cosmetics.skins(heroId);
    const right = h('div.col', { style: 'width:30%;margin-left:auto;gap:.5em;min-height:0' },
      h('div.panel', { style: 'padding:.5em .7em' },
        h('div.row', h('span.title', `MAÎTRISE ${m.level}`), m.badge ? h('span.pill', { style: `height:1.6em;font-size:.75em;background:${m.badge.color}` }, m.badge.name) : null, h('div.grow'), h('span.small-text', `🏆 ${hp.trophies}`)),
        h('div.bar.xp', { style: 'margin-top:.3em' }, h('i', { style: `width:${m.progress * 100}%` }), h('span', m.level >= MASTERY.maxLevel ? 'MAX' : `${m.xp}/${m.need}`)),
        h('div.small-text.muted', { style: 'margin-top:.2em' }, `${hp.matches} matchs · ${hp.wins} victoires · ${hp.goals} points · ${hp.kills} élim.`)),
      h('div.title', 'SKINS'),
      h('div.scroll.col', { style: 'gap:.4em;flex:1;min-height:0' }, skins.map((s) => h('button.card.row', { class: 'rarity-' + s.data.rarity, style: `padding:.3em .5em;gap:.5em;${viewSkin === s.data.id ? 'outline:.2em solid #fff' : ''}`, onclick: () => { audio.play('tab'); viewSkin = s.data.id; render(); } },
        h('img', { src: c.portrait(heroId, s.data.id), style: 'width:2.6em;height:2.6em;object-fit:cover;object-position:50% 20%' }),
        h('div.col', { style: 'gap:0;align-items:flex-start' }, h('span.name', { style: 'font-size:.85em' }, s.data.name), h('span.rlabel', RARITY_LABEL[s.data.rarity])),
        h('div.grow'),
        s.equipped ? h('span.owned-tag', { style: 'position:static' }, 'ÉQUIPÉ') : s.owned ? h('span.small-text', '✔') : h('span.small-text', '🔒')))),
      (() => {
        const sel = skins.find((s) => s.data.id === viewSkin)!;
        if (!owned) {
          const hd = getCharacter(heroId);
          const canCoins = hd.unlock.type === 'trophies';
          return h('div.col', { style: 'gap:.4em' }, h('div.small-text', { style: 'text-align:center' }, '🔒 ' + unlockText(c, heroId)),
            canCoins ? h('button.btn.yellow', { onclick: async () => {
              if (await c.ui.confirm('Débloquer ' + hd.name, h('div', 'Débloquer maintenant pour ', h('b', `${HERO_COIN_PRICE} `), coin(), ' (monnaie gratuite) ?'), 'DÉBLOQUER')) {
                if (c.app.progression.buyHeroWithCoins(heroId, HERO_COIN_PRICE)) { audio.play('unlock'); render(); } else { audio.play('error'); c.ui.toast('🪙', 'Pas assez de coins'); }
              }
            } }, 'DÉBLOQUER ', h('span.price', HERO_COIN_PRICE + ' ', coin())) : null);
        }
        if (sel.owned) return h('div.row', { style: 'gap:.4em' },
          h('button.btn.green.grow', { disabled: sel.equipped && c.heroId === heroId, onclick: () => { audio.play('click'); c.app.cosmetics.equipSkin(heroId, sel.data.id); c.heroId = heroId; c.ui.toast('⚡', `${hero.name} sélectionné`); render(); } }, sel.equipped && c.heroId === heroId ? 'SÉLECTIONNÉ' : 'CHOISIR'));
        const price = sel.data.priceGems ? h('span.price', sel.data.priceGems + ' ', gem()) : sel.data.priceCoins ? h('span.price', sel.data.priceCoins + ' ', coin()) : null;
        return h('div.col', { style: 'gap:.3em' }, h('div.small-text', { style: 'text-align:center' }, sel.data.source === 'shop' ? 'Disponible en boutique quand il est en rotation' : sel.data.source.startsWith('pass') ? 'Récompense RIFT PASS' : sel.data.source === 'mastery' ? 'Récompense de maîtrise (niv. 20)' : sel.data.source === 'event' ? 'Récompense d\'événement' : 'Caisse Rift'),
          sel.data.source === 'shop' ? h('button.btn.yellow', { onclick: () => c.ui.push(shopScreen(c, 'skins')) }, 'BOUTIQUE ', price) : null);
      })());
    body.append(left, h('div.grow'), right);
  };
  return { el, showcase: true, onShow() { c.renderer.showcaseActive = true; render(); c.app.analytics.track('character_selected', { hero: heroId }); }, onHide: off, refresh: render };
}
