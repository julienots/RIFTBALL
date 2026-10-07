type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> & { class?: string; style?: string | Record<string, string>; on?: Record<string, (e: any) => void> };

/** Tiny hyperscript helper: h('div.panel.row', {onclick}, children...) */
export function h(tag: string, props?: Props | Child, ...children: Child[]): HTMLElement {
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) { children.unshift(props as Child); props = {}; }
  const [nameId, ...classes] = tag.split('.');
  const [name, id] = nameId.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  const p = props as Props;
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
    else if (k === 'style') { if (typeof v === 'string') el.setAttribute('style', v); else Object.assign(el.style, v); }
    else if (k === 'on') for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const fmt = (n: number) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.0', '') + 'k' : n.toLocaleString('fr-FR');
