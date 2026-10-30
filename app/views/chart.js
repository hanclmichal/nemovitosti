// "Graf": two views of the apartments the list currently shows (same status tab, filters and search).
// Cena × plocha: scatter limited by the shared area and price filter, colour by status, rating or price per m²
// against the median, the median price-per-m² line, and tap-to-select that lists every flat around the spot.
// Lokality: districts compared by number of flats, how many fit the budget and median price per m².
import { store } from '../store.js';
import { view, saveView, filtered, TABS, statusOf, GONE, kcm2, median, avgRating, fmtRating, passesBase, currentTab } from '../byty.js';
import { num, mil } from '../format.js';
import { h, put, s } from '../ui.js';
import { filterButton, rangeFilters } from './filters.js';
import { card } from './list.js';

const cs = { mode: 'graf', color: 'stav', lokSort: 'budget' };
try {
  const saved = JSON.parse(localStorage.getItem('nem-chart') || 'null');
  if (saved) for (const k of Object.keys(cs)) if (k in saved) cs[k] = saved[k];
} catch (e) { /* storage blocked */ }
const saveCs = () => { try { localStorage.setItem('nem-chart', JSON.stringify(cs)); } catch (e) { /* ignore */ } };
let sel = [];   // ids picked by the last tap
let lokAll = false;  // show every district, not just the first ones
const LOK_TOP = 15, LOK_MIN = 3;

const MODES = [['graf', 'Cena × plocha'], ['lokality', 'Lokality']];
const COLORS = [['stav', 'Stav'], ['hodnoceni', 'Hodnocení'], ['kcm2', 'Cena za m²']];
const LOK_SORTS = [['budget', 'Nejvíc v budgetu'], ['kcm2', 'Nejlevnější m²'], ['pocet', 'Nejvíc bytů']];
const STATUS_DOT = { zajimavy: 'dot--fill', prohlidka: 'dot--info', rezervace: 'dot--warn', zamitnuto: 'dot--rej' };

function dotClass(it, mode, med) {
  if (mode === 'hodnoceni') {
    const a = avgRating(it);
    if (a == null) return 'dot--none';
    return a < 5 ? 'dot--r1' : a < 7 ? 'dot--r2' : a < 8.5 ? 'dot--r3' : 'dot--r4';
  }
  if (mode === 'kcm2') {
    const v = kcm2(it);
    if (!v || !med) return 'dot--mid';
    const d = v / med - 1;
    return d <= -0.1 ? 'dot--cheap' : d >= 0.1 ? 'dot--dear' : 'dot--mid';
  }
  const st = statusOf(it);
  return GONE.includes(st) ? 'dot--gone' : STATUS_DOT[st] || 'dot--ring';
}
// interesting points are drawn last, so they stay on top
function rank(it, mode) {
  if (mode === 'hodnoceni') return avgRating(it) ?? -1;
  const st = statusOf(it);
  return GONE.includes(st) || st === 'zamitnuto' ? 0 : st === 'novy' ? 1 : 2;
}

function legend(mode, med) {
  const item = (cls, text) => h('span', { class: 'lg' }, s('svg', { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': 'true' }, s('circle', { cx: 7, cy: 7, r: 5, class: 'dot ' + cls })), text);
  if (mode === 'hodnoceni') return [item('dot--none', 'nehodnoceno'), item('dot--r1', 'průměr pod 5'), item('dot--r2', '5–6,9'), item('dot--r3', '7–8,4'), item('dot--r4', '8,5 a víc')];
  if (mode === 'kcm2') return [item('dot--cheap', 'o 10 % a víc levnější za m² než medián'), item('dot--mid', 'kolem mediánu'), item('dot--dear', 'o 10 % a víc dražší'),
    med ? h('span', { class: 'lg muted', text: `medián ${Math.round(med / 1000).toLocaleString('cs-CZ')} tis. Kč/m²` }) : null];
  return [item('dot--ring', 'nový'), item('dot--fill', 'zajímavý'), item('dot--info', 'prohlídka'), item('dot--warn', 'rezervace'), item('dot--rej', 'zamítnutý'), item('dot--gone', 'stažený, prodaný')];
}

function niceStep(span, steps) {
  for (const st of steps) if (span / st <= 6) return st;
  return steps[steps.length - 1];
}
const fmtNum = v => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

export function render(root, params, nav) {
  nav.setTitle('Graf');
  const modes = h('div', { class: 'modeseg', role: 'group', 'aria-label': 'Pohled' });
  const tools = h('div', { class: 'tools' });
  const tabs = h('div', { class: 'stabs', role: 'group', 'aria-label': 'Stav' });
  const body = h('div', { class: 'detail' });
  root.append(modes, tools, tabs, body);

  function drawHead() {
    put(modes, MODES.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(cs.mode === k), onclick: () => { cs.mode = k; saveCs(); draw(); } }, l)));
    put(tools, filterButton(draw), view.q ? h('span', { class: 'muted small', text: `hledání „${view.q}“` }) : null);
    const items = [...store.byty.values()];
    put(tabs, TABS.map(t => h('button', { class: 'stab', type: 'button', 'aria-pressed': String(view.tab === t.id), onclick: () => { view.tab = t.id; saveView(); sel = []; draw(); } },
      t.label, h('span', { class: 'stab__c', text: String(items.filter(it => t.test(statusOf(it))).length) }))));
  }

  /* ---------- Cena × plocha ---------- */
  function drawGraf() {
    const n = store.nastaveni;
    const pts = filtered([...store.byty.values()]).filter(it => num(it.cena) && num(it.plocha));
    if (!pts.length) { put(body, h('div', { class: 'empty', text: 'V aktuálním výběru nejsou byty s cenou a plochou. Zkus jinou záložku nebo vypni filtry.' })); return; }
    const med = median(pts.map(kcm2).filter(Boolean));

    // the chart shows exactly the area and price range of the filter (or the extent of the points without one)
    const xs = pts.map(it => num(it.plocha)), ys = pts.map(it => num(it.cena));
    const x0 = view.plocha[0] ?? Math.floor(Math.min(...xs) / 5) * 5, x1 = view.plocha[1] ?? Math.ceil(Math.max(...xs) / 5) * 5;
    const y0 = view.cena[0] ?? Math.floor(Math.min(...ys) / 5e5) * 5e5, y1 = view.cena[1] ?? Math.ceil(Math.max(...ys) / 5e5) * 5e5;
    const win = h('section', { class: 'panel win' },
      rangeFilters(() => { sel = []; draw(); }),
      h('p', { class: 'muted small', text: 'Plocha a cena platí i pro seznam bytů.' }));
    const inWin = pts;
    sel = sel.filter(id => inWin.some(it => it.id === id));

    const colorSeg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': 'Barva bodů' },
      h('span', { class: 'win__lbl', text: 'Barva' }),
      COLORS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(cs.color === k), onclick: () => { cs.color = k; saveCs(); draw(); } }, l)));
    const count = h('p', { class: 'muted small', text: `${pts.length} ${pts.length === 1 ? 'byt' : pts.length <= 4 ? 'byty' : 'bytů'} v grafu. Tečkovaná čára je medián ceny za m², pod ní jsou byty levnější na metr.` });
    const box = h('div', { class: 'chart', role: 'img', 'aria-label': 'Bodový graf ceny a plochy bytů' });
    const selBox = h('section', { class: 'sel' });
    const chartPanel = h('section', { class: 'panel' }, h('div', { class: 'chartbar' }, colorSeg), count, box, h('div', { class: 'legend' }, legend(cs.color, med)));
    put(body, win, chartPanel, selBox);

    // plot
    const W = Math.max(300, box.clientWidth || 360), H = Math.round(Math.min(560, Math.max(320, W * 1.05)));
    const m = { l: 44, r: 12, t: 22, b: 34 };
    const padX = Math.max(1, (x1 - x0) * 0.04), padY = Math.max(1e5, (y1 - y0) * 0.05);
    const dx0 = x0 - padX, dx1 = x1 + padX, dy0 = Math.max(0, y0 - padY), dy1 = y1 + padY;
    const X = v => m.l + (v - dx0) / (dx1 - dx0) * (W - m.l - m.r);
    const Y = v => H - m.b - (v - dy0) / (dy1 - dy0) * (H - m.t - m.b);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'chart__svg' });
    svg.append(s('defs', null, s('clipPath', { id: 'plot' }, s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }))));
    const xStep = niceStep(dx1 - dx0, [5, 10, 20, 40, 50]);
    for (let v = Math.ceil(dx0 / xStep) * xStep; v <= dx1; v += xStep) {
      svg.append(s('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: 'grid' }), s('text', { x: X(v), y: H - m.b + 16, 'text-anchor': 'middle', class: 'axis' }, String(v)));
    }
    const yStep = niceStep(dy1 - dy0, [2.5e5, 5e5, 1e6, 2e6, 4e6]);
    for (let v = Math.ceil(dy0 / yStep) * yStep; v <= dy1; v += yStep) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'grid' }), s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, fmtNum(v / 1e6)));
    }
    svg.append(s('text', { x: W - m.r, y: H - 4, 'text-anchor': 'end', class: 'axis' }, 'm²'), s('text', { x: 2, y: 12, class: 'axis' }, 'mil. Kč'));
    const ref = (v, cls, label) => {
      if (v < dy0 || v > dy1) return;
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: `ref ref--${cls}` }),
        s('text', { x: W - m.r - 4, y: Y(v) - 5, 'text-anchor': 'end', class: `reflabel reflabel--${cls}` }, label));
    };
    ref(n.budget, 'budget', `budget ${mil(n.budget, false)}`);
    ref(n.strop, 'cap', `hranice ${mil(n.strop, false)}`);
    if (med) {
      svg.append(s('line', { x1: X(dx0), y1: Y(med * dx0), x2: X(dx1), y2: Y(med * dx1), class: 'med', 'clip-path': 'url(#plot)' }));
    }
    const pos = [];
    const g = s('g', { 'clip-path': 'url(#plot)' });
    inWin.slice().sort((a, b) => rank(a, cs.color) - rank(b, cs.color)).forEach(it => {
      const cx = X(num(it.plocha)), cy = Y(num(it.cena));
      const c = s('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 6, class: 'dot ' + dotClass(it, cs.color, med) + (sel.includes(it.id) ? ' is-sel' : '') });
      c.append(s('title', null, `${it.dispozice || ''}, ${num(it.plocha)} m², ${mil(num(it.cena))} – ${it.lokalita || ''}`));
      g.append(c);
      pos.push({ it, cx, cy, c });
    });
    svg.append(g);
    svg.addEventListener('click', ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width), py = (ev.clientY - r.top) * (H / r.height);
      const R = 24;
      const near = pos.map(p => ({ p, d: Math.hypot(p.cx - px, p.cy - py) })).filter(x => x.d <= R).sort((a, b) => a.d - b.d);
      sel = near.slice(0, 12).map(x => x.p.it.id);
      pos.forEach(p => p.c.classList.toggle('is-sel', sel.includes(p.it.id)));
      drawSel();
      if (sel.length) selBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    });
    put(box, svg);

    function drawSel() {
      if (!sel.length) { put(selBox, h('p', { class: 'hint', text: 'Klepni do grafu na bod nebo do shluku. Byty z toho místa se ukážou tady pod grafem.' })); return; }
      const items = sel.map(id => store.byty.get(id)).filter(Boolean);
      put(selBox,
        h('div', { class: 'sel__head' },
          h('b', { text: items.length === 1 ? '1 byt v tomhle místě' : `${items.length} ${items.length <= 4 ? 'byty' : 'bytů'} v tomhle místě` }),
          h('button', { class: 'linkish', type: 'button', onclick: () => { sel = []; pos.forEach(p => p.c.classList.remove('is-sel')); drawSel(); } }, 'Zrušit výběr')),
        h('div', { class: 'list' }, items.map(it => card(it, n))));
    }
    drawSel();
  }

  /* ---------- Lokality ---------- */
  function drawLokality() {
    const n = store.nastaveni;
    const tab = currentTab();
    const pool = [...store.byty.values()].filter(it => tab.test(statusOf(it)) && passesBase(it, 'lok'));
    if (!pool.length) { put(body, h('div', { class: 'empty', text: 'V aktuálním výběru nejsou žádné byty.' })); return; }
    const groups = new Map();
    pool.forEach(it => { const k = it.lokalita || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
    const rows = [...groups].map(([name, arr]) => {
      const prices = arr.map(it => num(it.cena)).filter(Boolean);
      const ratings = arr.map(avgRating).filter(v => v != null);
      return {
        name, n: arr.length,
        inB: prices.filter(c => c <= n.budget).length,
        med: median(arr.map(kcm2).filter(Boolean)),
        min: prices.length ? Math.min(...prices) : null,
        rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
        rated: ratings.length
      };
    });
    const by = {
      kcm2: (a, b) => (a.med ?? 9e15) - (b.med ?? 9e15),
      budget: (a, b) => b.inB - a.inB || (a.med ?? 9e15) - (b.med ?? 9e15),
      pocet: (a, b) => b.n - a.n || (a.med ?? 9e15) - (b.med ?? 9e15)
    }[cs.lokSort] || ((a, b) => 0);
    // districts with too few flats say little about prices: they go after the others when sorting by price
    const thin = r => cs.lokSort === 'kcm2' && r.n < LOK_MIN ? 1 : 0;
    rows.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || thin(a) - thin(b) || by(a, b));
    const shown = lokAll ? rows : rows.slice(0, LOK_TOP);
    const meds = rows.map(r => r.med).filter(Boolean);
    const lo = Math.min(...meds), hi = Math.max(...meds);
    const sortSeg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': 'Řadit lokality' },
      h('span', { class: 'win__lbl', text: 'Řadit' }),
      LOK_SORTS.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(cs.lokSort === k), onclick: () => { cs.lokSort = k; saveCs(); draw(); } }, l)));
    put(body,
      h('section', { class: 'panel' }, sortSeg,
        h('p', { class: 'muted small', text: `${rows.length} ${rows.length <= 4 ? 'lokality' : 'lokalit'} z aktuálního výběru. Pruh ukazuje medián ceny za m²${cs.lokSort === 'kcm2' ? `, lokality s méně než ${LOK_MIN} byty jsou až na konci` : ''}. Klepnutím na lokalitu se seznam bytů vyfiltruje jen na ni.` }),
        h('div', { class: 'loks' }, shown.map(r => h(r.name ? 'button' : 'div', {
          class: 'lok' + (r.name && view.lok === r.name ? ' is-on' : ''), type: r.name ? 'button' : null,
          onclick: r.name ? () => { view.lok = r.name; saveView(); nav.go('#/byty'); } : null
        },
          h('div', { class: 'lok__top' }, h('span', { class: 'lok__name', text: r.name || 'Lokalita neuvedena' }), h('span', { class: 'lok__n', text: `${r.n} ${r.n === 1 ? 'byt' : r.n <= 4 ? 'byty' : 'bytů'}` })),
          r.med ? h('div', { class: 'lok__bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${hi > lo ? 25 + 75 * (r.med - lo) / (hi - lo) : 100}%` } })) : null,
          h('div', { class: 'lok__meta' },
            r.med ? h('span', { text: `medián ${Math.round(r.med / 1000).toLocaleString('cs-CZ')} tis. Kč/m²` }) : null,
            h('span', { class: r.inB ? 'good' : '', text: `${r.inB} v budgetu` }),
            r.min ? h('span', { text: `od ${mil(r.min, false)}` }) : null,
            r.rating != null ? h('span', { text: `hodnocení ${fmtRating(r.rating)} (${r.rated}×)` }) : null)))),
        rows.length > LOK_TOP ? h('button', { class: 'btn', type: 'button', onclick: () => { lokAll = !lokAll; draw(); } },
          lokAll ? `Zobrazit jen prvních ${LOK_TOP}` : `Zobrazit všech ${rows.length} lokalit`) : null));
  }

  function draw() {
    drawHead();
    if (cs.mode === 'lokality') drawLokality(); else drawGraf();
  }

  let rT = null;
  const onResize = () => { clearTimeout(rT); rT = setTimeout(draw, 150); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(draw);
  return { refresh: draw, destroy: () => window.removeEventListener('resize', onResize) };
}
