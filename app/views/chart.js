// "Graf": price against floor area for the apartments the list currently shows.
import { store } from '../store.js';
import { view, saveView, filtered, TABS, statusOf, hasTerrace, GONE } from '../byty.js';
import { num, mil } from '../format.js';
import { h, put, s } from '../ui.js';
import { filterButton } from './filters.js';

export function render(root, params, nav) {
  nav.setTitle('Cena podle plochy');
  const tools = h('div', { class: 'tools' });
  const tabs = h('div', { class: 'stabs', role: 'group', 'aria-label': 'Stav' });
  const sub = h('p', { class: 'muted small' });
  const box = h('div', { class: 'chart', role: 'img', 'aria-label': 'Bodový graf ceny a plochy bytů' });
  const legend = h('div', { class: 'legend' },
    h('span', null, h('i', { class: 'sw sw--fill' }), 's terasou'),
    h('span', null, h('i', { class: 'sw sw--ring' }), 'bez terasy'),
    h('span', null, h('i', { class: 'sw sw--pick' }), 'vybrané'),
    h('span', null, h('i', { class: 'sw sw--gone' }), 'stažené a prodané'));
  root.append(h('section', { class: 'panel' }, tools, tabs, sub, box, legend));

  function draw() {
    const n = store.nastaveni;
    put(tools, filterButton(draw));
    const items = [...store.byty.values()];
    put(tabs, TABS.map(t => h('button', { class: 'stab', type: 'button', 'aria-pressed': String(view.tab === t.id), onclick: () => { view.tab = t.id; saveView(); draw(); } },
      t.label, h('span', { class: 'stab__c', text: String(items.filter(it => t.test(statusOf(it))).length) }))));
    const pts = filtered(items).filter(it => num(it.cena) && num(it.plocha));
    sub.textContent = `${pts.length} ${pts.length === 1 ? 'byt' : pts.length >= 2 && pts.length <= 4 ? 'byty' : 'bytů'}${view.q ? ` (hledání „${view.q}“)` : ''}. Plná čára je budget, přerušovaná horní hranice. Klepnutím na bod otevřeš byt.`;
    if (!pts.length) { put(box, h('p', { class: 'empty', text: 'V aktuálním výběru nejsou byty s cenou a plochou.' })); return; }

    const W = Math.max(300, box.clientWidth || 360), H = Math.round(Math.min(520, Math.max(300, W * 0.95)));
    const m = { l: 40, r: 10, t: 24, b: 32 };
    const xs = pts.map(p => num(p.plocha)), ys = pts.map(p => num(p.cena));
    const x0 = Math.floor((Math.min(...xs, 80) - 5) / 10) * 10, x1 = Math.ceil((Math.max(...xs) + 5) / 10) * 10;
    const y0 = Math.max(0, Math.floor(Math.min(...ys, n.budget) / 1e6 - 1) * 1e6), y1 = Math.ceil(Math.max(...ys, n.strop) / 1e6 + 0.5) * 1e6;
    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart__svg' });
    const xStep = (x1 - x0) > 120 ? 40 : (x1 - x0) > 60 ? 20 : 10;
    for (let v = x0; v <= x1; v += xStep) {
      svg.append(s('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: 'grid' }), s('text', { x: X(v), y: H - m.b + 16, 'text-anchor': 'middle', class: 'axis' }, String(v)));
    }
    const ySpan = (y1 - y0) / 1e6, yStep = ySpan > 16 ? 4e6 : ySpan > 8 ? 2e6 : 1e6;
    for (let v = y0; v <= y1; v += yStep) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'grid' }), s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, String(v / 1e6)));
    }
    svg.append(s('text', { x: W - m.r, y: H - 4, 'text-anchor': 'end', class: 'axis' }, 'm²'), s('text', { x: 2, y: 11, class: 'axis' }, 'mil. Kč'));
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(n.budget), y2: Y(n.budget), class: 'ref ref--budget' }),
      s('text', { x: W - m.r - 4, y: Y(n.budget) - 5, 'text-anchor': 'end', class: 'reflabel reflabel--budget' }, `budget ${mil(n.budget, false)}`),
      s('line', { x1: m.l, x2: W - m.r, y1: Y(n.strop), y2: Y(n.strop), class: 'ref ref--cap' }),
      s('text', { x: W - m.r - 4, y: Y(n.strop) - 5, 'text-anchor': 'end', class: 'reflabel reflabel--cap' }, `hranice ${mil(n.strop, false)}`));
    // gone first, picked last, so the interesting points are on top
    const rank = it => GONE.includes(statusOf(it)) ? 0 : (statusOf(it) === 'zajimavy' || statusOf(it) === 'prohlidka') ? 2 : 1;
    pts.slice().sort((a, b) => rank(a) - rank(b)).forEach(it => {
      const st = statusOf(it), r = rank(it);
      const cls = r === 0 ? 'pt pt--gone' : r === 2 ? 'pt pt--pick' : hasTerrace(it) ? 'pt pt--fill' : 'pt pt--ring';
      const label = `${it.dispozice || ''}, ${num(it.plocha)} m², ${mil(num(it.cena))} – ${it.lokalita || ''}`;
      const a = s('a', { href: `#/byt/${it.id}`, class: cls, 'aria-label': label },
        s('title', null, label),
        s('circle', { cx: X(num(it.plocha)).toFixed(1), cy: Y(num(it.cena)).toFixed(1), r: 14, class: 'pt__hit' }),
        s('circle', { cx: X(num(it.plocha)).toFixed(1), cy: Y(num(it.cena)).toFixed(1), r: r === 2 ? 7 : 5.5, class: 'pt__dot' + (st === 'zamitnuto' ? ' pt__dot--rej' : '') }));
      svg.append(a);
    });
    put(box, svg);
  }

  let rT = null;
  const onResize = () => { clearTimeout(rT); rT = setTimeout(draw, 150); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(draw);
  return { refresh: draw, destroy: () => window.removeEventListener('resize', onResize) };
}
