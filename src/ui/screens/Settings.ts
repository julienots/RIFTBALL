import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import type { Quality } from '../../core/Settings';
import { BuildConfig } from '../../core/config';

export function settingsScreen(c: Controller): Screen {
  const body = h('div.scroll', { style: 'flex:1;min-height:0;padding:0 .9em .9em' });
  const { el, off } = shell(c, 'OPTIONS', body, { currencies: false });
  const serverField = () => {
    const input = h('input.text-input', { value: c.data.settings.serverUrl || BuildConfig.serverUrl, placeholder: 'https://…', style: 'width:16em', inputMode: 'url' }) as HTMLInputElement;
    const test = h('button.btn.tiny.green', { onclick: async () => {
      const v = input.value.trim().replace(/\/$/, '');
      if (v && !/^https?:\/\//.test(v)) { c.ui.toast('⚠', 'Adresse invalide', 'Elle doit commencer par http:// ou https://'); return; }
      c.data.settings.serverUrl = v; BuildConfig.serverUrl = v || BuildConfig.defaultServerUrl; c.app.save.save();
      c.app.online.close();
      await c.app.net.ping();
      c.ui.toast(c.app.net.online ? '🟢' : '🔴', c.app.net.online ? 'Serveur connecté !' : 'Serveur injoignable', c.app.net.online ? 'Le matchmaking en ligne est actif.' : 'Les matchs se joueront contre des bots.');
      render();
    } }, 'OK');
    return h('div.row', { style: 'gap:.4em' }, input, test);
  };
  const render = () => {
    body.innerHTML = '';
    const s = c.data.settings;
    const save = () => { c.app.save.save(); audio.setVolumes(s.musicVolume, s.sfxVolume); };
    const seg = <T extends string>(vals: [T, string][], cur: T, set: (v: T) => void) => h('div.seg', vals.map(([v, l]) => h('button' + (v === cur ? '.on' : ''), { onclick: () => { audio.play('tab'); set(v); save(); render(); } }, l)));
    const slider = (v: number, set: (x: number) => void) => { const i = h('input.slider', { type: 'range', min: '0', max: '100', value: String(Math.round(v * 100)) }) as HTMLInputElement; i.addEventListener('input', () => { set(+i.value / 100); save(); }); return i; };
    const toggle = (v: boolean, set: (x: boolean) => void) => h('button.btn.tiny' + (v ? '.green' : '.gray'), { onclick: () => { audio.play('tab'); set(!v); save(); render(); } }, v ? 'OUI' : 'NON');
    const row = (label: string, ctl: HTMLElement, hint = '') => h('div.settings-row', h('div.col', { style: 'gap:0' }, h('span.title', label), hint ? h('span.small-text.muted', hint) : null), ctl);
    body.append(
      h('div.title', { style: 'margin:.3em 0' }, '🎨 GRAPHISMES'),
      row('Qualité', seg<Quality>([['LOW', 'BASSE'], ['MEDIUM', 'MOYENNE'], ['HIGH', 'HAUTE']], s.quality, (v) => { s.quality = v; c.renderer.applyQuality(v); }), 'Effets, particules, ombres, résolution et post-traitement'),
      row('Afficher les FPS', toggle(s.showFps, (v) => (s.showFps = v))),
      h('div.title', { style: 'margin:.5em 0 .3em' }, '🔊 AUDIO'),
      row('Musique', slider(s.musicVolume, (v) => (s.musicVolume = v))),
      row('Effets sonores', slider(s.sfxVolume, (v) => (s.sfxVolume = v))),
      row('Vibrations', toggle(s.haptics, (v) => (s.haptics = v))),
      h('div.title', { style: 'margin:.5em 0 .3em' }, '🛒 ACHATS & COMPTE'),
      row('Restaurer les achats', h('button.btn.tiny.purple', { onclick: async () => { const r = await c.app.iap.restore(); c.ui.alert('RESTAURATION', r.message); } }, 'RESTAURER'), 'Récupère les achats Google Play liés à ce compte'),
      h('div.title', { style: 'margin:.5em 0 .3em' }, '🌐 JEU EN LIGNE'),
      row('Serveur', serverField(), 'Adresse du serveur RIFTBALL (ex : https://riftball.onrender.com). Vide = matchs contre bots uniquement.'),
      row('Connexion', h('span.small-text', c.app.net.online ? `🟢 En ligne${c.app.net.lastPingMs >= 0 ? ` · ${c.app.net.lastPingMs} ms` : ''}` : BuildConfig.serverUrl ? '🔴 Serveur injoignable — matchs contre bots' : '🟡 Aucun serveur — matchs contre bots')),
      row('Sauvegarde', h('span.small-text', `v${c.data.version} · ${new Date(c.data.updatedAt).toLocaleString('fr-FR')}`), 'Synchronisation cloud : disponible avec un compte (bientôt)'),
      row('Rejouer le tutoriel', h('button.btn.tiny.green', { onclick: () => c.screens.tutorial() }, 'TUTORIEL')),
      row('Réinitialiser la progression', h('button.btn.tiny.red', { onclick: async () => {
        if (await c.ui.confirm('Tout effacer ?', 'Toute la progression locale sera supprimée. Les achats Google Play pourront être restaurés.', 'EFFACER', 'red')) { c.app.save.reset(); location.reload(); }
      } }, 'EFFACER')),
      h('div.small-text.muted', { style: 'margin-top:.8em;text-align:center' }, `RIFTBALL v${BuildConfig.version} · © ${new Date().getFullYear()} ${BuildConfig.studio} · Aucune donnée personnelle collectée · Musiques et sons générés procéduralement.`));
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
