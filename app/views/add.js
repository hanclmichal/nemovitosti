// "Přidat": add a listing by hand. The watchdog fills in details later when it finds them.
import { store, addByt, bytPath } from '../store.js';
import { parseNum, slug, today, nowIso } from '../format.js';
import { h, put, toast } from '../ui.js';

export function render(root, params, nav) {
  nav.setTitle('Přidat inzerát');
  const field = (label, attrs, hint) => {
    const input = h('input', { class: 'field', autocomplete: 'off', ...attrs });
    return { input, row: h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: label }), input, hint ? h('span', { class: 'muted small', text: hint }) : null) };
  };
  const url = field('Odkaz na inzerát', { type: 'url', placeholder: 'https://…', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false' });
  const disp = field('Dispozice', { placeholder: '4+kk', autocapitalize: 'off' });
  const plocha = field('Plocha (m²)', { inputmode: 'decimal', placeholder: '98' });
  const cena = field('Cena (Kč)', { inputmode: 'numeric', placeholder: '12 500 000' }, 'Jde napsat i „12,5 mil“.');
  const lok = field('Městská část', { placeholder: 'Chodov' });
  const ulice = field('Ulice', { placeholder: 'Hrabákova' });
  const venku = field('Terasa / balkon', { placeholder: 'terasa 15 m²' });
  const msg = h('p', { class: 'muted', role: 'status' });

  async function submit(ev) {
    ev.preventDefault();
    const u = url.input.value.trim();
    if (!/^https?:\/\//i.test(u)) { msg.textContent = 'Vlož celý odkaz začínající https://'; url.input.focus(); return; }
    const p = parseNum(plocha.input.value), c = parseNum(cena.input.value);
    if (plocha.input.value.trim() && !(p > 0)) { msg.textContent = 'Plocha musí být číslo v m².'; return; }
    if (cena.input.value.trim() && !(c > 0)) { msg.textContent = 'Cena musí být číslo v korunách.'; return; }
    const exists = [...store.byty.values()].find(it => (it.zdroje || []).some(z => z && z.url === u));
    if (exists) { msg.textContent = ''; toast('Tenhle inzerát už v seznamu je.'); nav.go(`#/byt/${exists.id}`); return; }
    const v = venku.input.value.trim();
    let host = '';
    try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* invalid URL */ }
    const d = disp.input.value.trim() || null;
    let id = slug([ulice.input.value.trim() || lok.input.value.trim() || host || 'byt', d, p ? Math.round(p) : null].filter(Boolean).join(' '));
    while (store.files.has(bytPath(id))) id = `${id.replace(/-r\d+$/, '')}-r${Math.floor(Math.random() * 1e6)}`;
    const data = {
      dispozice: d,
      plocha: p, cena: c,
      lokalita: lok.input.value.trim() || null,
      ulice: ulice.input.value.trim() || null,
      venku: v || null, terasa: v ? /teras/i.test(v) : null,
      status: 'novy', pridano: today(), pridal: store.kdo ? `ručně (${store.kdo})` : 'ručně', upraveno: nowIso(),
      zdroje: [{ portal: host || 'Inzerát', url: u }],
      historie: c ? [{ dne: today(), cena: c }] : [],
      nase: null
    };
    await addByt(id, data);
    toast('Přidáno. Hlídací pes doplní detaily, pokud k nim najde cestu.');
    nav.go(`#/byt/${id}`);
  }

  put(root, h('form', { class: 'panel form', novalidate: true, onsubmit: submit },
    h('p', { class: 'muted small', text: 'Inzerát z jakéhokoli portálu. Vyplň, co víš, zbytek může zůstat prázdný.' }),
    url.row, h('div', { class: 'form__grid' }, disp.row, plocha.row), cena.row, h('div', { class: 'form__grid' }, lok.row, ulice.row), venku.row,
    msg,
    h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Přidat do seznamu'))));
  return { keepScroll: false };
}
