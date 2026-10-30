// Apartment detail: price and its history, status, shared note, facts and links.
import { store, updateByt } from '../store.js';
import { STATUS, STATUS_LABEL, GONE, statusOf, kcm2, tier, priceDrop, hasTerrace, isGone } from '../byty.js';
import { num, mil, kc, dateCz, timeCz, daysBetween, today } from '../format.js';
import { h, put, toast, extLink } from '../ui.js';

const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : null;

export function render(root, params, nav) {
  const id = params[0];
  let noteBox = null, noteSaved = null, noteTimer = null, pendingRedraw = false;

  async function saveNote(value) {
    clearTimeout(noteTimer); noteTimer = null;
    const it = store.byty.get(id);
    if (!it || (it.nase || '') === value) return;
    noteSaved.textContent = 'Ukládám…';
    try {
      await updateByt(id, d => { d.nase = value || null; });
      noteSaved.textContent = 'Uloženo v telefonu, odešle se při synchronizaci.';
    } catch (e) { noteSaved.textContent = e.message; }
  }

  async function setStatus(v) {
    try {
      await updateByt(id, d => {
        d.status = v;
        if (GONE.includes(v) && !d.stazenoDne) d.stazenoDne = today();
        if (!GONE.includes(v) && d.stazenoDne) d.stazenoDne = null;
      });
      toast(`Stav: ${STATUS_LABEL[v]}`);
    } catch (e) { toast(e.message); }
  }

  function draw() {
    const it = store.byty.get(id);
    if (!it) {
      nav.setTitle('Byt');
      put(root, h('div', { class: 'empty' }, h('b', { text: 'Tenhle byt v telefonu není.' }), ' ', h('a', { href: '#/byty', text: 'Zpět na seznam' })));
      return;
    }
    const n = store.nastaveni;
    const st = statusOf(it), gone = isGone(it);
    const c = num(it.cena), p = num(it.plocha), pm = kcm2(it);
    const t = tier(it, n), drop = priceDrop(it);
    nav.setTitle([it.dispozice || 'Byt', p ? `${p.toLocaleString('cs-CZ')} m²` : null].filter(Boolean).join(' · '));

    const loc = [it.ulice, it.lokalita].filter(Boolean).join(', ');
    const hist = (Array.isArray(it.historie) ? it.historie : []).filter(x => x && num(x.cena));

    // price
    const price = h('section', { class: 'panel dprice' + (gone ? ' is-gone' : '') },
      h('p', { class: 'dprice__loc', text: [loc || 'lokalita neuvedena', it.projekt ? `${it.projekt}${it.oznaceni ? ' ' + it.oznaceni : ''}` : null].filter(Boolean).join(' · ') }),
      h('p', { class: 'dprice__p num', text: c ? mil(c) : 'cena neuvedena' }),
      h('p', { class: 'dprice__sub' },
        pm ? h('span', { class: 'num', text: `${kc(pm)}/m²` }) : null,
        t ? h('span', { class: `tier tier--${t.cls}`, text: t.text }) : null,
        drop ? h('span', { class: 'badge badge--warn', text: `zlevněno o ${drop.pct.toLocaleString('cs-CZ')} % z ${mil(drop.from, false)}` }) : null),
      hist.length > 1 ? h('ol', { class: 'hist' }, hist.map(x => h('li', null, h('span', { text: dateCz(x.dne) }), h('span', { class: 'num', text: mil(num(x.cena)) })))) : null,
      it.cenaPozn ? h('p', { class: 'note', text: `Cena: ${it.cenaPozn}` }) : null);

    // status
    const status = h('section', { class: 'panel' },
      h('h2', { text: 'Stav' }),
      h('div', { class: 'statusgrid', role: 'group', 'aria-label': 'Stav bytu' }, STATUS.map(([v, l]) =>
        h('button', { class: `sbtn sbtn--${v}`, type: 'button', 'aria-pressed': String(st === v), onclick: () => { if (st !== v) setStatus(v); } }, l))),
      gone && it.stazenoDne ? h('p', { class: 'muted small', text: `${STATUS_LABEL[st]} ${dateCz(it.stazenoDne)}` }) : null);

    // note
    noteBox = h('textarea', { class: 'field note__in', rows: '4', placeholder: 'Dojmy, otázky na makléře…', 'aria-label': 'Naše poznámka', oninput: ev => {
      clearTimeout(noteTimer);
      noteSaved.textContent = '';
      noteTimer = setTimeout(() => saveNote(ev.target.value), 1200);
    }, onblur: ev => { saveNote(ev.target.value); if (pendingRedraw) setTimeout(draw, 0); } });
    noteBox.value = it.nase || '';
    noteSaved = h('p', { class: 'muted small', role: 'status', text: it.upravil && it.upravil.kdo ? `Naposledy upravil(a) ${it.upravil.kdo}, ${timeCz(it.upravil.kdy)}` : '' });
    const note = h('section', { class: 'panel' }, h('h2', { text: 'Naše poznámka' }), noteBox, noteSaved);

    // facts
    const facts = [];
    const fact = (k, v) => { if (v != null && v !== '') facts.push(h('dt', { text: k }), h('dd', null, v)); };
    fact('Venku', it.venku ? h('span', { class: hasTerrace(it) ? 'accent' : '', text: it.venku }) : null);
    fact('Plocha', p ? `${p.toLocaleString('cs-CZ')} m²${it.plochaPozn ? ` (${it.plochaPozn})` : ''}` : null);
    fact('Patro', it.patro);
    fact('Dům', it.dum);
    fact('Stav bytu', it.stav);
    fact('Metro', it.metro);
    fact('Náklady', it.naklady);
    fact('PENB', it.energie && /^[A-G]$/.test(it.energie) ? h('span', null, h('span', { class: `penb penb--${it.energie}`, text: it.energie }), ' energetická třída') : null);
    fact('Novostavba', it.novostavba === true ? 'ano' : it.novostavba === false ? 'ne' : null);
    if (it.odDevelopera) fact('Developer', [it.developer, it.projekt, it.oznaceni ? `byt ${it.oznaceni}` : null].filter(Boolean).join(', '));
    const since = it.naTrhuOd || it.pridano;
    const days = since ? daysBetween(since, gone ? it.stazenoDne : null) : null;
    fact('Na trhu', days != null ? `${gone ? 'byl ' : ''}${days} dní${it.naTrhuOd ? '' : '+'}${it.naTrhuOd ? ` (od ${dateCz(it.naTrhuOd)})` : ''}` : null);
    fact('V seznamu od', it.pridano ? dateCz(it.pridano) + (it.pridal ? ` · ${it.pridal}` : '') : null);
    fact('Upozornění', it.zdrojUpozorneni);
    const info = h('section', { class: 'panel' }, h('h2', { text: 'Údaje' }), h('dl', { class: 'kv' }, facts),
      it.pozn ? h('p', { class: 'note', text: it.pozn }) : null);

    // links
    const links = [];
    (Array.isArray(it.zdroje) ? it.zdroje : []).forEach(z => { const u = safeUrl(z && z.url); if (u) links.push(extLink(u, z.portal || 'Inzerát')); });
    if (it.ulice || it.lokalita) {
      const q = [it.ulice, it.lokalita, 'Praha'].filter(Boolean).join(', ');
      links.push(extLink('https://mapy.cz/zakladni?q=' + encodeURIComponent(q), 'Mapy.cz'));
    }
    const linkBox = links.length ? h('section', { class: 'panel' }, h('h2', { text: 'Odkazy' }), h('div', { class: 'links' }, links),
      h('p', { class: 'muted small', text: 'Údaje jsou z upozornění portálů a agregátorů. Před prohlídkou je ověř v původním inzerátu.' })) : null;

    put(root, h('div', { class: 'detail' }, price, status, note, info, linkBox));
  }

  draw();
  return {
    refresh: () => {
      if (noteBox && document.activeElement === noteBox) { pendingRedraw = true; return; }
      pendingRedraw = false;
      draw();
    },
    destroy: () => { if (noteTimer && noteBox) saveNote(noteBox.value); },
    keepScroll: false
  };
}
