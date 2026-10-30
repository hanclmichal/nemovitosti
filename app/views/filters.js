// Filter sheet shared by the list and the chart: area and price (slider + exact values), layout,
// district, source, rating, terrace. The main button shows how many flats match right now.
import { store } from '../store.js';
import { view, saveView, resetFilters, filterCount, currentTab, statusOf, passesBase, dispKey, DISP, DISP_LABEL, HOD, extents, rangeText } from '../byty.js';
import { h, openSheet, closeSheet } from '../ui.js';
import { plural } from '../format.js';
import { rangeFilter, plochaOpts, cenaOpts } from './range.js';

export function filterButton(onChange) {
  const n = filterCount();
  return h('button', { class: 'btn btn--sm filterbtn' + (n ? ' is-on' : ''), type: 'button', onclick: () => openFilters(onChange) },
    n ? `Filtry · ${n}` : 'Filtry');
}

/** Area and price filters bound to the shared view; used in the sheet and above the chart. */
export function rangeFilters(onSettled, onLive) {
  const ext = extents([...store.byty.values()]);
  return [
    rangeFilter({ ...plochaOpts(ext), value: view.plocha, text: r => rangeText(r, 'plocha'),
      onInput: r => { view.plocha = r; onLive && onLive(); },
      onChange: r => { view.plocha = r; saveView(); onSettled(); } }),
    rangeFilter({ ...cenaOpts(ext, store.nastaveni), value: view.cena, text: r => rangeText(r, 'cena'),
      onInput: r => { view.cena = r; onLive && onLive(); },
      onChange: r => { view.cena = r; saveView(); onSettled(); } })
  ];
}

export function openFilters(onChange) {
  const ranges = h('div', { class: 'filters' });
  const rest = h('div', { class: 'filters' });
  const body = h('div', { class: 'filters' }, ranges, h('hr', { class: 'sep' }), rest);
  let showBtn = null;
  const matching = () => {
    const tab = currentTab();
    return [...store.byty.values()].filter(it => tab.test(statusOf(it)) && passesBase(it)).length;
  };
  const liveCount = () => {
    if (!showBtn) return;
    const n = matching();
    showBtn.textContent = n ? `Zobrazit ${n} ${plural(n, 'byt', 'byty', 'bytů')}` : 'Nic neodpovídá';
  };
  const changed = () => { saveView(); drawRest(); onChange(); };

  function drawRanges() {
    ranges.replaceChildren(...rangeFilters(() => { drawRest(); onChange(); }, liveCount));
  }

  function drawRest() {
    const items = [...store.byty.values()];
    const tab = currentTab();
    const pool = items.filter(it => tab.test(statusOf(it)) && passesBase(it, true));
    const keys = DISP.concat(['jiné']).filter(k => view.disp.includes(k) || pool.some(it => dispKey(it) === k));
    const names = [...new Set(items.map(it => it.lokalita).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));

    const lok = h('select', { class: 'field', id: 'f-lok', onchange: ev => { view.lok = ev.target.value; changed(); } },
      h('option', { value: '', text: 'Všechny' }),
      names.map(n => h('option', { value: n, text: n, selected: n === view.lok ? true : null })));
    const dev = h('select', { class: 'field', id: 'f-dev', onchange: ev => { view.dev = ev.target.value; changed(); } },
      [['', 'Všechny nabídky'], ['jen', 'Jen od developerů'], ['bez', 'Bez developerů']].map(([v, l]) => h('option', { value: v, text: l, selected: v === view.dev ? true : null })));
    showBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => closeSheet() }, 'Hotovo');

    rest.replaceChildren(
      h('div', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Dispozice' }),
        h('div', { class: 'chips' },
          h('button', { class: 'chipbtn', type: 'button', 'aria-pressed': String(!view.disp.length), onclick: () => { view.disp = []; changed(); } }, 'Všechny'),
          keys.map(k => {
            const c = pool.filter(it => dispKey(it) === k).length;
            return h('button', { class: 'chipbtn', type: 'button', 'aria-pressed': String(view.disp.includes(k)), onclick: () => {
              const i = view.disp.indexOf(k);
              if (i >= 0) view.disp.splice(i, 1); else view.disp.push(k);
              changed();
            } }, DISP_LABEL[k] || k, h('span', { class: 'chipbtn__c', text: String(c) }));
          }))),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Lokalita' }), lok),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Zdroj' }), dev),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Hodnocení' }),
        h('select', { class: 'field', id: 'f-hod', onchange: ev => { view.hod = ev.target.value; changed(); } },
          HOD.map(([v, l]) => h('option', { value: v, text: v === 'cekam' && store.kdo ? `Čeká na hodnocení: ${store.kdo}` : l, selected: v === view.hod ? true : null })))),
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: view.ter ? true : null, onchange: ev => { view.ter = ev.target.checked; changed(); } }),
        h('span', { class: 'switch__t' }, h('b', { text: 'Jen s terasou' }))),
      h('div', { class: 'row-actions row-actions--sticky' },
        filterCount() ? h('button', { class: 'btn', type: 'button', onclick: () => { resetFilters(); drawRanges(); drawRest(); onChange(); } }, 'Zrušit filtry') : null,
        showBtn));
    liveCount();
  }
  drawRanges();
  drawRest();
  openSheet('Filtry', body);
}
