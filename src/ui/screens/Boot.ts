import { h } from '../dom';

/**
 * Studio intro ("SuperEssence") then the RIFTBALL loading screen.
 * Original typography/animation: letters pop in one by one with a bounce, a golden dot lands,
 * a light glint sweeps across, then the screen zooms out to the game loading screen.
 */
export function playStudioIntro(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const word = 'SuperEssence';
    const letters = word.split('').map((ch, i) => h('span.l' + (i >= 5 ? '.e' : ''), { style: `animation-delay:${0.08 + i * 0.065}s` }, ch));
    const el = h('div#splash', h('div.studio', letters, h('i.dot')), h('div.glint'), h('div.tagline', 'PRÉSENTE'));
    root.appendChild(el);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, 430);
    };
    el.addEventListener('pointerdown', () => setTimeout(finish, 150));
    setTimeout(finish, 2700);
  });
}

const TIPS = [
  'Astuce : touchez ATTAQUE pour viser automatiquement, glissez pour viser manuellement.',
  'Astuce : en portant le Rift, le bouton ATTAQUE devient LANCER — faites des passes !',
  'Astuce : le Rift fuit les joueurs proches… mais il est parfois curieux.',
  'Astuce : une MUTATION change les règles pendant quelques secondes. Adaptez-vous !',
  'Astuce : les buissons cachent les joueurs. Même le porteur du Rift.',
  'Astuce : tous les héros se débloquent gratuitement via la Route des Trophées.',
  'Astuce : les skins sont 100% cosmétiques. Le talent fait la différence.',
  'Astuce : MAGNET peut arracher le Rift des mains d\'un ennemi proche.',
];

export function showLoading(root: HTMLElement) {
  const fill = h('i', { style: 'width:0%' });
  const label = h('span', '0%');
  const tip = h('div.tip.stroke-s', TIPS[Math.floor(Math.random() * TIPS.length)]);
  const el = h('div#loading',
    h('div.orb'),
    h('div.logo', h('span.rift', 'RIFT'), 'BALL'),
    h('div.bottom', tip, h('div.bar.pass', fill, label)),
    h('div.studio-mini', 'SuperEssence'));
  root.appendChild(el);
  const tipTimer = setInterval(() => { tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }, 2600);
  return {
    progress(k: number) { const p = Math.round(Math.min(1, k) * 100); fill.style.width = p + '%'; label.textContent = p + '%'; },
    done(): Promise<void> {
      clearInterval(tipTimer);
      return new Promise((res) => { el.style.transition = 'opacity .35s'; el.style.opacity = '0'; setTimeout(() => { el.remove(); res(); }, 360); });
    },
  };
}
