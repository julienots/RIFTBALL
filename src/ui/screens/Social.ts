import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { rewardText } from '../icons';
import { showRewards } from './Shop';
import { formatDuration, Clock } from '../../core/Time';

export function socialScreen(c: Controller): Screen {
  let tab: 'crew' | 'friends' = 'crew';
  const tabs = h('div.tabs');
  const content = h('div', { style: 'flex:1;min-height:0;display:flex;padding:.7em;gap:.7em' });
  const body = h('div.col', { style: 'flex:1;min-height:0;gap:0' }, tabs, h('div.panel', { style: 'flex:1;min-height:0;margin:0 .9em .9em;display:flex;border-radius:0 1em 1em 1em' }, content));
  const { el, off } = shell(c, 'RIFT CREWS & AMIS', body, { currencies: false });
  let chatTimer: any;

  const render = () => {
    tabs.innerHTML = '';
    tabs.append(h('button.tab' + (tab === 'crew' ? '.on' : ''), { onclick: () => { audio.play('tab'); tab = 'crew'; render(); } }, '👥 CREW'),
      h('button.tab' + (tab === 'friends' ? '.on' : ''), { onclick: () => { audio.play('tab'); tab = 'friends'; render(); } }, '🤝 AMIS'));
    content.innerHTML = '';
    clearInterval(chatTimer);
    if (tab === 'friends') return renderFriends();
    const crew = c.app.crew.current;
    if (!crew) {
      content.appendChild(h('div.scroll.col', { style: 'flex:1;gap:.4em' },
        h('div.title', 'REJOINDRE UN CREW'),
        c.app.crew.browse().map((cr) => h('div.panel.row', { style: 'padding:.45em .7em;gap:.7em' },
          h('div', { style: `width:2.4em;height:2.4em;border-radius:.6em;background:${cr.color};display:grid;place-items:center;font-size:1.4em;border:.12em solid #1a1030` }, cr.badge),
          h('div.col', { style: 'gap:0;flex:1' }, h('span.title', cr.name + ' ', h('span.small-text.muted', cr.tag)), h('span.small-text', cr.description)),
          h('span.small-text', `👤 ${cr.members}/30`), h('span.small-text', `🏆 ${fmt(cr.trophies)}`), h('span.small-text', `Min. ${cr.minTrophies}`),
          h('button.btn.tiny.green', { onclick: () => { const r = c.app.crew.join(cr.id); if (!r.ok) { audio.play('error'); c.ui.toast('⚠', r.error ?? ''); } else { audio.play('unlock'); render(); } } }, 'REJOINDRE')))));
      return;
    }
    const members = c.app.crew.members();
    const goals = c.app.crew.goals();
    const chat = h('div.chat.scroll', { style: 'flex:1;min-height:0' });
    const input = h('input.text-input', { placeholder: 'Message…', maxLength: 140, style: 'flex:1' }) as HTMLInputElement;
    const drawChat = () => { chat.innerHTML = ''; for (const m of c.app.crew.chat) chat.appendChild(h('div.msg' + (m.me ? '.me' : m.system ? '.sys' : ''), m.system ? null : h('b', m.from), m.text)); chat.scrollTop = 1e6; };
    const send = () => { c.app.crew.send(input.value); input.value = ''; drawChat(); };
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') send(); });
    content.append(
      h('div.col', { style: 'width:34%;gap:.4em;min-height:0' },
        h('div.row', h('div', { style: `width:2.6em;height:2.6em;border-radius:.6em;background:${crew.color};display:grid;place-items:center;font-size:1.5em;border:.12em solid #1a1030` }, crew.badge), h('div.col', { style: 'gap:0' }, h('span.title.stroke-s', { style: 'font-size:1.2em' }, crew.name), h('span.small-text', crew.tag))),
        h('div.title', 'OBJECTIFS DE LA SEMAINE'),
        goals.map((g) => h('div.panel', { style: 'padding:.4em .6em;background:rgba(10,5,30,.35)' }, h('div.small-text', g.text),
          h('div.bar.purple', { style: 'height:.9em;margin:.2em 0' }, h('i', { style: `width:${(g.progress / g.target) * 100}%` }), h('span', `${g.progress}/${g.target}`)),
          h('div.row', h('span.small-text.muted', g.reward.map(rewardText).join(' · ')), h('div.grow'), g.claimed ? h('span.small-text', '✔') : h('button.btn.tiny' + (g.done ? '.green' : '.gray'), { disabled: !g.done, onclick: () => { const r = c.app.crew.claim(g.id); if (r) { showRewards(c, r); render(); } } }, 'OK')))),
        h('div.small-text.muted', 'Vos points et victoires comptent pour le crew.'),
        h('button.btn.tiny.red', { onclick: async () => { if (await c.ui.confirm('Quitter le crew ?', 'Vous pourrez en rejoindre un autre.', 'QUITTER', 'red')) { c.app.crew.leave(); render(); } } }, 'QUITTER')),
      h('div.col', { style: 'flex:1;gap:.4em;min-height:0' }, h('div.title', 'DISCUSSION'), chat, h('div.row', input, h('button.btn.small.green', { onclick: send }, '➤'))),
      h('div.col.scroll', { style: 'width:24%;gap:.25em' }, h('div.title', `MEMBRES (${crew.members})`), members.map((m) => h('div.row.small-text', { style: 'gap:.4em' }, h('span', m.online ? '🟢' : '⚫'), h('span.grow', m.name), h('span.muted', m.role), h('span', '🏆' + m.trophies)))));
    drawChat();
    chatTimer = setInterval(drawChat, 1500);
  };

  const renderFriends = () => {
    const friends = c.app.friends.list();
    const stat = { online: '🟢 En ligne', in_match: '🎮 En match', offline: '⚫ Hors ligne' } as const;
    const input = h('input.text-input', { placeholder: 'Pseudo ou code ami', maxLength: 16, style: 'flex:1' }) as HTMLInputElement;
    content.append(
      h('div.col.scroll', { style: 'flex:1;gap:.35em' },
        h('div.row', h('span.title', `AMIS (${friends.length})`), h('div.grow'), c.party.length ? h('span.pill', `Groupe : ${c.party.map((p) => p.name).join(', ')}`) : null, c.party.length ? h('button.btn.tiny.red', { onclick: () => { c.party = []; render(); } }, 'Dissoudre') : null),
        friends.map((f) => h('div.panel.row', { style: 'padding:.4em .6em;gap:.6em' },
          h('div.av', { style: 'width:2.4em;height:2.4em;border-radius:.5em;overflow:hidden;border:.1em solid #1a1030' }, h('img', { src: c.portrait(f.heroId), style: 'width:130%;margin:-10% -15%' })),
          h('div.col', { style: 'gap:0;flex:1' }, h('span.title', f.name), h('span.small-text', f.status === 'offline' ? `⚫ Vu il y a ${formatDuration(Clock.now() - f.lastSeen)}` : stat[f.status])),
          h('span.small-text', '🏆 ' + fmt(f.trophies)),
          h('button.btn.tiny' + (f.status === 'online' ? '.green' : '.gray'), { disabled: f.status !== 'online' || c.party.length >= 2 || c.party.some((p) => p.name === f.name), onclick: () => {
            audio.play('click');
            c.party.push({ name: f.name, heroId: f.heroId });
            c.ui.toast('🤝', `${f.name} a rejoint votre groupe`, 'Il jouera avec vous au prochain match.');
            render();
          } }, 'INVITER EN PARTIE')))),
      h('div.col', { style: 'width:36%;gap:.4em' },
        h('div.title', 'AJOUTER UN AMI'),
        h('div.row', input, h('button.btn.small.green', { onclick: () => { const n = input.value.trim(); if (n.length < 3) return; if (c.app.friends.invite(n)) { c.ui.toast('📨', 'Invitation envoyée à ' + n); input.value = ''; } } }, '+')),
        h('div.title', 'JOUEURS RÉCENTS'),
        h('div.col.scroll', { style: 'gap:.25em;max-height:40vh' }, c.app.friends.suggestions().map((r) => h('div.row.small-text', { style: 'gap:.4em' }, h('span.grow', r.name), h('span', '🏆' + r.trophies), h('button.btn.tiny.purple', { onclick: () => { if (c.app.friends.invite(r.name)) c.ui.toast('📨', 'Invitation envoyée à ' + r.name); } }, '+')))),
        h('div.small-text.muted', c.app.net.online ? '' : 'Mode hors ligne : les amis et invitations sont simulés localement. L\'architecture est prête pour le serveur social.')));
  };

  return { el, onShow: render, refresh: render, onHide() { off(); clearInterval(chatTimer); } };
}
