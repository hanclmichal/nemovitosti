// Filter sheet shared by the list and the chart: layout, district, source, terrace.
import { store } from '../store.js';
import { view, saveView, resetFilters, filterCount, currentTab, statusOf, passesBase, dispKey, DISP, DISP_LABEL } from '../byty.js';
import { h, openSheet, closeSheet } from '../ui.js';

export function filterButton(onChange) {
  const n = filterCount();
  return h('button', { class: 'btn btn--sm filterbtn' + (n ? ' is-on' : ''), type: 'button', onclick: () => openFilters(onChange) },
    n ? `Filtry · ${n}` : 'Filtry');
}

export function openFilters(onChange) {
  const body = h('div', { class: 'filters' });
  const changed = () => { saveView(); draw(); onChange(); };

  function draw() {
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

    body.replaceChildren(
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
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: view.ter ? true : null, onchange: ev => { view.ter = ev.target.checked; changed(); } }),
        h('span', { class: 'switch__t' }, h('b', { text: 'Jen s terasou' }))),
      h('div', { class: 'row-actions' },
        filterCount() ? h('button', { class: 'btn', type: 'button', onclick: () => { resetFilters(); draw(); onChange(); } }, 'Zrušit filtry') : null,
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => closeSheet() }, 'Hotovo')));
  }
  draw();
  openSheet('Filtry', body);
}
