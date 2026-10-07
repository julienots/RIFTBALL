import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './ui/styles.css';
import { App } from './core/App';
import { NativeMirroredBackend } from './save/Storage';
import { WorldRenderer } from './game/render/WorldRenderer';
import { Controller } from './ui/Controller';
import { playStudioIntro, showLoading } from './ui/screens/Boot';
import { homeScreen } from './ui/screens/Home';
import { resultsScreen } from './ui/screens/Results';
import { runMatchmaking } from './ui/screens/Matchmaking';
import { startTutorial } from './tutorial/Tutorial';
import { DebugOverlay } from './debug/DebugOverlay';
import { audio } from './audio/AudioEngine';
import { BuildConfig } from './core/config';
import { heroGeometry } from './game/render/Models';
import { PLAYABLE } from './data/characters';

async function boot() {
  const uiRoot = document.getElementById('ui')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;

  // 1) Studio intro (also unlocks audio on first touch)
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  const params = new URLSearchParams(location.search);
  if (!params.has('skipintro')) await playStudioIntro(uiRoot);

  // 2) Loading screen while we prepare everything
  const loading = showLoading(uiRoot);
  const kv = new NativeMirroredBackend();
  await kv.init([BuildConfig.saveKey, BuildConfig.saveKey + '.bak', 'riftball.analytics']);
  loading.progress(0.1);
  await document.fonts?.ready;
  const app = new App({ kv });
  if (app.save.loadReport.corrupted) console.warn('Save was corrupted, recovered from', app.save.loadReport.source);
  const s = app.data.settings;
  audio.setVolumes(s.musicVolume, s.sfxVolume);
  loading.progress(0.2);
  const renderer = new WorldRenderer(canvas, s.quality);
  const c = new Controller(app, renderer, uiRoot);
  // build all hero geometries + portraits up-front (no hitches in menus or matches)
  let k = 0;
  for (const h of PLAYABLE) { heroGeometry(h.id, `${h.id}_default`); loading.progress(0.2 + (++k / PLAYABLE.length) * 0.3); await frame(); }
  c.warmPortraits((p) => loading.progress(0.5 + p * 0.35));
  app.net.start();
  app.missions.refresh();
  app.iap.init().catch((e) => console.warn('IAP init failed', e));
  app.analytics.track('app_open', { version: BuildConfig.version });
  loading.progress(1);
  await new Promise((r) => setTimeout(r, 250));

  const debug = new DebugOverlay(c);
  c.screens = {
    home: () => c.ui.set(homeScreen(c)),
    results: async (e) => { c.ui.set(await resultsScreen(c, e)); },
    matchmaking: () => { if (!app.data.tutorialDone && c.selectedMode === 'RIFTBALL' && !c.trainingLevel) { startTutorial(c); return; } c.ui.set(runMatchmaking(c)); },
    tutorial: () => { c.ui.closeModals(); startTutorial(c); },
  };
  c.screens.home();
  await loading.done();

  // main loop
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    c.frame(dt);
    debug.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { audio.suspend(); app.save.flush(); if (c.session && !c.session.paused) c.session.paused = true; }
    else { audio.resume(); if (c.session) c.session.paused = c.ui.hasModal; }
  });
  window.addEventListener('pagehide', () => app.save.flush());
  // Android back button
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', () => {
        if (c.ui.hasModal) { c.ui.closeModals(); if (c.session) c.session.paused = false; return; }
        if (c.session) { (c.session.hud as any).onPause(); return; }
        if ((c.ui as any).stack.length > 1) c.ui.pop(); else CapApp.minimizeApp();
      });
      CapApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) app.save.flush(); else app.iap.processOutstanding().catch(() => {}); });
    }
  } catch { /* web */ }
  (window as any).__rift = { app, c };
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="color:#fff;font:16px sans-serif;padding:2em">Erreur au démarrage : ${String(e?.message ?? e)}</div>`;
});
