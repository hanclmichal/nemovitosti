// "Byty": summary, status tabs, search, filters and the list of apartments.
import { store } from '../store.js';
import { view, saveView, filtered, TABS, SORTS, statusOf, ACTIVE, kcm2, median, tier, priceDrop, isNew, isGone, hasTerrace, STATUS_SHORT, filterCount, resetFilters, DISP_LABEL } from '../byty.js';
import { num, mil, kc, timeCz } from '../format.js';
import { h, put, icon } from '../ui.js';
import { filterButton } from './filters.js';

const PAGE = 40;

export function watchLine() {
  const m = store.meta;
  const txt = !m || !m.posledniBeh
    ? 'Hlídací pes zatím neběžel.'
    : `Hlídací pes ${timeCz(m.posledniBeh)}${m.posledniVysledek ? ' · ' + m.posledniVysledek : ''}`;
  return h('p', { class: 'watch' }, h('span', { class: 'watch__dot', 'aria-hidden': 'true' }), h('span', { text: txt }));
}

export function card(it, n) {
  const st = statusOf(it);
  const c = num(it.cena), p = num(it.plocha), pm = kcm2(it);
  const t = tier(it, n);
  const drop = priceDrop(it);
  const badges = [];
  if (st !== 'novy') badges.push(h('span', { class: `pill pill--${st}`, text: STATUS_SHORT[st] }));
  if (isNew(it)) badges.push(h('span', { class: 'badge', text: 'Nový' }));
  if (drop) badges.push(h('span', { class: 'badge badge--warn', text: `−${drop.pct.toLocaleString('cs-CZ')} %` }));
  if (hasTerrace(it)) badges.push(h('span', { class: 'badge', text: 'Terasa' }));
  if (it.odDevelopera) badges.push(h('span', { class: 'badge badge--dev', text: it.developer ? `Developer · ${it.developer}` : 'Od developera' }));
  const loc = [it.lokalita, it.ulice, it.projekt ? it.projekt + (it.oznaceni ? ' ' + it.oznaceni : '') : null].filter(Boolean).join(', ');
  return h('a', { class: 'byt' + (isGone(it) ? ' is-gone' : '') + (st === 'zamitnuto' ? ' is-rejected' : ''), href: `#/byt/${it.id}` },
    h('div', { class: 'byt__row' },
      h('span', { class: 'byt__title', text: [it.dispozice || 'Byt', p ? `${p.toLocaleString('cs-CZ')} m²` : null].filter(Boolean).join(' · ') }),
      h('span', { class: 'byt__price num', text: c ? mil(c, false) : 'bez ceny' })),
    h('div', { class: 'byt__row byt__row--sub' },
      h('span', { class: 'byt__loc', text: loc || 'lokalita neuvedena' }),
      pm ? h('span', { class: 'byt__pm num', text: `${kc(pm)}/m²` }) : null),
    h('div', { class: 'byt__row byt__row--meta' },
      h('div', { class: 'badges' }, badges),
      t ? h('span', { class: `tier tier--${t.cls}`, text: t.text }) : null),
    it.nase ? h('p', { class: 'byt__note' }, h('span', { class: 'byt__noteh', text: it.upravil && it.upravil.kdo ? `${it.upravil.kdo}: ` : 'Poznámka: ' }), it.nase) : null);
}

export function render(root, params, nav) {
  nav.setTitle('Byty');
  const head = h('div', { class: 'listhead' });
  const summary = h('section', { class: 'summary', 'aria-label': 'Souhrn' });
  let qTimer = null;
  const search = h('input', { class: 'search__in', type: 'search', placeholder: 'Hledat ulici, lokalitu, projekt…', 'aria-label': 'Hledat', value: view.q, enterkeyhint: 'search', autocomplete: 'off', oninput: ev => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { view.q = ev.target.value; shown = PAGE; update(); }, 160);
  } });
  const tools = h('div', { class: 'tools' });
  const tabs = h('div', { class: 'stabs', role: 'group', 'aria-label': 'Stav' });
  const active = h('div', { class: 'activef' });
  const count = h('p', { class: 'count muted small' });
  const list = h('div', { class: 'list' });
  const more = h('div', { class: 'more' });
  root.append(head, summary, h('label', { class: 'search' }, icon('search'), search), tools, tabs, active, count, list, more);

  let shown = PAGE;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && shown < lastList.length) { shown += PAGE; drawList(); }
  }, { rootMargin: '600px 0px' }) : null;
  if (io) io.observe(more);
  let lastList = [];

  function drawSummary() {
    const n = store.nastaveni;
    const items = [...store.byty.values()];
    const act = items.filter(it => ACTIVE.includes(statusOf(it)));
    const inBudget = act.filter(it => { const c = num(it.cena); return c && c <= n.budget; }).length;
    const med = median(act.map(kcm2).filter(Boolean));
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const fresh = items.filter(it => String(it.pridano || '') >= weekAgo).length;
    const stat = (k, v, small) => h('div', { class: 'stat' }, h('span', { class: 'stat__k', text: k }), h('span', { class: 'stat__v num' }, v, small ? h('small', { text: small }) : null));
    put(summary,
      stat('Aktivní nabídky', String(act.length)),
      stat(`Do ${mil(n.budget, false)}`, String(inBudget), ` z ${act.length}`),
      stat('Medián za m²', med ? Math.round(med / 1000).toLocaleString('cs-CZ') : '–', med ? ' tis. Kč' : null),
      stat('Nové za 7 dní', String(fresh)));
  }

  function drawTools() {
    const sort = h('select', { class: 'field field--sm', 'aria-label': 'Řadit', onchange: ev => { view.sort = ev.target.value; saveView(); shown = PAGE; update(); } },
      SORTS.map(([v, l]) => h('option', { value: v, text: l, selected: v === view.sort ? true : null })));
    put(tools, filterButton(() => { shown = PAGE; update(); }), sort);
    const items = [...store.byty.values()];
    put(tabs, TABS.map(t => {
      const c = items.filter(it => t.test(statusOf(it))).length;
      return h('button', { class: 'stab', type: 'button', 'aria-pressed': String(view.tab === t.id), onclick: () => { view.tab = t.id; saveView(); shown = PAGE; update(); window.scrollTo(0, 0); } },
        t.label, h('span', { class: 'stab__c', text: String(c) }));
    }));
    const chips = [];
    const chip = (label, clear) => h('button', { class: 'fchip', type: 'button', onclick: () => { clear(); saveView(); shown = PAGE; update(); } }, label, icon('close', 'ico ico--xs'));
    if (view.lok) chips.push(chip(view.lok, () => { view.lok = ''; }));
    view.disp.forEach(k => chips.push(chip(DISP_LABEL[k] || k, () => { view.disp = view.disp.filter(x => x !== k); })));
    if (view.dev) chips.push(chip(view.dev === 'jen' ? 'Od developerů' : 'Bez developerů', () => { view.dev = ''; }));
    if (view.ter) chips.push(chip('S terasou', () => { view.ter = false; }));
    if (filterCount() > 1) chips.push(h('button', { class: 'linkish', type: 'button', onclick: () => { resetFilters(); shown = PAGE; update(); } }, 'Zrušit vše'));
    put(active, chips);
    active.hidden = !chips.length;
  }

  function drawList() {
    const n = store.nastaveni;
    if (!store.byty.size) {
      put(list, h('div', { class: 'empty' }, store.conn
        ? [h('b', { text: 'Zatím tu nic není.' }), ' Data se stahují z GitHubu, nebo je úložiště prázdné.']
        : [h('b', { text: 'Aplikace není připojená.' }), ' ', h('a', { href: '#/nastaveni', text: 'Připojit v Nastavení' })]));
      count.textContent = '';
      more.hidden = true;
      return;
    }
    if (!lastList.length) {
      put(list, h('div', { class: 'empty', text: view.tab === 'stazene'
        ? 'Zatím žádný sledovaný byt nezmizel z nabídky.'
        : 'V tomhle výběru nic není. Zkus jinou záložku, hledání nebo vypni filtry.' }));
      count.textContent = '';
      more.hidden = true;
      return;
    }
    count.textContent = `${lastList.length} ${lastList.length === 1 ? 'byt' : lastList.length <= 4 ? 'byty' : 'bytů'}`;
    put(list, lastList.slice(0, shown).map(it => card(it, n)));
    more.hidden = shown >= lastList.length;
    if (!io && shown < lastList.length) put(more, h('button', { class: 'btn', type: 'button', onclick: () => { shown += PAGE; drawList(); } }, 'Zobrazit další'));
  }

  function update() {
    put(head, watchLine());
    drawSummary();
    drawTools();
    lastList = filtered([...store.byty.values()]);
    drawList();
  }
  update();
  return { refresh: update, destroy: () => io && io.disconnect() };
}
