import type { RewardItem } from '../data/types';
import { getCosmetic } from '../data/cosmetics';
import { getCharacter } from '../data/characters';
import { CRATES } from '../data/shop';
import { h, fmt } from './dom';

export const coin = () => h('i.ccoin');
export const gem = () => h('i.cgem');

const TYPE_ICON: Record<string, string> = { skin: '🎨', emote: '😀', spray: '🖌️', effect: '✨', banner: '🚩', title: '🏷️', icon: '🖼️', companion: '🐾' };
export const PET_GLYPH: Record<string, string> = { orb: '🔮', drone: '🛸', cat: '🐱', crystal: '💎', ghost: '👻', bat: '🦇', penguin: '🐧', parrot: '🦜', robot: '🤖', dragon: '🐉', phoenix: '🔥', fifi: '✨' };

export function rewardText(r: RewardItem): string {
  switch (r.kind) {
    case 'coins': return `${fmt(r.amount)} Coins`;
    case 'gems': return `${fmt(r.amount)} Gems`;
    case 'xp': return `${fmt(r.amount)} XP`;
    case 'passXp': return `${fmt(r.amount)} Pass XP`;
    case 'hero': return `Héros ${getCharacter(r.id).name}`;
    case 'crate': return `${r.count}× ${CRATES.find((c) => c.id === r.id)?.name ?? r.id}`;
    case 'cosmetic': {
      if (r.id.startsWith('pass_plus')) return 'RIFT PASS+';
      if (r.id.startsWith('pass_premium')) return 'RIFT PASS Premium';
      const c = getCosmetic(r.id);
      return c ? c.name : r.id;
    }
  }
}

export function rewardIcon(r: RewardItem): string {
  switch (r.kind) {
    case 'coins': return '🪙';
    case 'gems': return '💎';
    case 'xp': return '⭐';
    case 'passXp': return '🎟️';
    case 'hero': return '⚡';
    case 'crate': return '🎁';
    case 'cosmetic': {
      if (r.id.startsWith('pass_')) return '🎟️';
      const c = getCosmetic(r.id);
      if (!c) return '❔';
      if (c.type === 'emote' || c.type === 'spray') return c.visual.glyph ?? TYPE_ICON[c.type];
      return TYPE_ICON[c.type] ?? '🎁';
    }
  }
}

export function cosmeticArt(id: string, portrait?: (hero: string, skin: string) => string) {
  const c = getCosmetic(id);
  if (!c) return h('span', '❔');
  if (c.type === 'skin' && c.heroId && portrait) return h('img', { src: portrait(c.heroId, c.id), alt: c.name });
  if (c.type === 'emote' || c.type === 'spray') return h('span', c.visual.glyph);
  if (c.type === 'banner') return h('div', { style: `width:80%;height:60%;border-radius:.3em;border:.1em solid #1a1030;background:linear-gradient(135deg,${c.visual.a},${c.visual.b})` });
  if (c.type === 'companion') return h('div', { style: `width:70%;height:70%;border-radius:50%;display:grid;place-items:center;font-size:2.2em;background:radial-gradient(circle, ${c.visual.accent}, ${c.visual.color});box-shadow:0 0 1em ${c.visual.color}` }, PET_GLYPH[c.visual.model] ?? '🐾');
  if (c.type === 'effect') { const special = c.visual.color === 'rainbow' || c.visual.color === 'galaxy' || c.visual.color === 'fifi'; const bg = c.visual.color === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : c.visual.color === 'galaxy' ? 'radial-gradient(circle,#fff,#7209b7 40%,#10002b)' : c.visual.color === 'fifi' ? 'conic-gradient(#ff4ecd,#ffd60a,#00f5d4,#ff4ecd)' : `radial-gradient(circle, #fff, ${c.visual.color})`; return h('div', { style: `width:60%;height:60%;border-radius:50%;background:${bg};box-shadow:0 0 1em ${special ? '#fff' : c.visual.color}` }); }
  if (c.type === 'icon') return h('div', { style: `width:62%;height:62%;border-radius:.5em;border:.1em solid #1a1030;background:${c.visual.color};display:grid;place-items:center;font-size:.6em` }, c.name.slice(0, 2));
  if (c.type === 'title') return h('span', { style: 'font-size:.42em;font-family:Lilita One;text-align:center' }, '« ' + c.name + ' »');
  return h('span', TYPE_ICON[c.type]);
}
