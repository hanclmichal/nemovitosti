// "Nastavení": repository connection, profile, watchdog, appearance, local data.
import { store, setConn, resetLocal, pendingFiles } from '../store.js';
import { profilePicker } from './profile.js';
import { sync, testConnection, status } from '../sync.js';
import { h, put, toast, openSheet, closeSheet, confirmSheet } from '../ui.js';
import { plural, timeCz, mil } from '../format.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

function connectForm(onDone) {
  const c = store.conn || {};
  const owner = h('input', { class: 'field', type: 'text', value: c.owner || 'hanclmichal', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const repo = h('input', { class: 'field', type: 'text', value: c.repo || 'nemovitosti-data', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const token = h('input', { class: 'field', type: 'password', placeholder: c.token ? 'Uložený klíč zůstane, když pole necháš prázdné' : 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const branch = h('input', { class: 'field', type: 'text', value: c.branch || 'main', autocapitalize: 'off' });
  const msg = h('p', { class: 'muted', role: 'status' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, store.conn ? 'Uložit a synchronizovat' : 'Připojit a stáhnout');
  return h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    const conn = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() || c.token || '' };
    if (c.api) conn.api = c.api;
    if (!conn.owner || !conn.repo || !conn.token) { msg.textContent = 'Vyplň vlastníka, úložiště a přístupový klíč.'; return; }
    btn.disabled = true;
    msg.textContent = 'Ověřuji přístup…';
    try {
      await testConnection(conn);
      const changedRepo = c.owner && (c.owner !== conn.owner || c.repo !== conn.repo);
      if (changedRepo) await resetLocal();
      await setConn(conn);
      msg.textContent = 'Stahuji byty, poprvé to chvíli trvá…';
      const r = await sync();
      msg.textContent = '';
      toast(`Připojeno. Staženo ${r.pulled} ${plural(r.pulled, 'soubor', 'soubory', 'souborů')}.`);
      onDone();
    } catch (e) {
      msg.textContent = e.message || String(e);
    } finally { btn.disabled = false; }
  } },
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Vlastník' }), owner),
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Úložiště' }), repo),
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Přístupový klíč' }), token,
      h('span', { class: 'muted small' }, 'Fine-grained token s přístupem k úložišti nemovitosti-data a oprávněním Contents: Read and write. ', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer', text: 'Tokeny na GitHubu' }))),
    h('details', { class: 'adv' }, h('summary', { text: 'Pokročilé' }),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Větev' }), branch)),
    msg,
    h('div', { class: 'row-actions' }, btn));
}

export function render(root, params, nav) {
  nav.setTitle('Nastavení');
  async function draw() {
    const pend = pendingFiles();
    const c = store.conn;
    const box = h('div', { class: 'settings' });
    const standalone = (window.navigator.standalone === true) || matchMedia('(display-mode: standalone)').matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!standalone) {
      box.append(h('div', { class: 'note note--soft' },
        h('strong', { text: 'Nejdřív si aplikaci přidej na plochu' }),
        h('p', { text: ios
          ? 'V Safari klepni na Sdílet a zvol Přidat na plochu. Aplikace na ploše má vlastní úložiště, takže připojení nastav až v ní.'
          : 'V Chromu otevři menu a zvol Přidat na plochu (nebo Nainstalovat aplikaci). Připojení pak nastav v aplikaci na ploše.' })));
    }
    if (!c) {
      box.append(h('section', { class: 'panel' },
        h('h2', { text: 'Připojení k úložišti' }),
        h('p', { text: 'Aplikace si stáhne byty ze soukromého úložiště na GitHubu a uloží je do telefonu. Funguje pak i bez internetu a změny stavu a poznámek odešle, jakmile bude signál.' }),
        connectForm(() => nav.go('#/byty'))),
        h('section', { class: 'panel' }, h('h2', { text: 'Kdo jsi' }),
          h('p', { class: 'muted small', text: 'Profil určuje barvu aplikace, čí hodnocení je tvoje a podpis u poznámek. Přepnout jde kdykoli tlačítkem s písmenem v horní liště.' }),
          profilePicker(() => draw())));
      put(root, box);
      return;
    }
    const err = status.error;
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Úložiště' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Připojeno' }), h('dd', null, h('a', { href: `https://github.com/${c.owner}/${c.repo}`, target: '_blank', rel: 'noopener noreferrer', text: `${c.owner}/${c.repo}` })),
        h('dt', { text: 'Synchronizace' }), h('dd', { text: store.lastSync ? timeCz(store.lastSync) : 'zatím neproběhla' }),
        h('dt', { text: 'Čeká na odeslání' }), h('dd', { text: pend.length ? pend.map(f => f.path.replace(/^byty\//, '').replace(/\.json$/, '')).join(', ') : 'nic' }),
        err ? h('dt', { text: 'Poslední chyba' }) : null, err ? h('dd', { class: 'warn', text: err.message }) : null),
      h('div', { class: 'row-actions row-actions--wrap' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => nav.runSync(true) }, 'Synchronizovat teď'),
        h('button', { class: 'btn', type: 'button', onclick: () => openSheet('Připojení', connectForm(() => { closeSheet(); draw(); })) }, 'Změnit připojení'))));

    box.append(h('section', { class: 'panel' }, h('h2', { text: 'Kdo jsi' }),
      h('p', { class: 'muted small', text: 'Profil určuje barvu aplikace, čí hodnocení je tvoje a podpis u poznámek a v historii změn na GitHubu. Přepnout jde kdykoli tlačítkem s písmenem v horní liště.' }),
      profilePicker(() => draw())));

    const m = store.meta, n = store.nastaveni;
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Hlídací pes' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Poslední běh' }), h('dd', { text: m && m.posledniBeh ? timeCz(m.posledniBeh) : 'zatím neběžel' }),
        m && m.posledniVysledek ? h('dt', { text: 'Výsledek' }) : null, m && m.posledniVysledek ? h('dd', { text: m.posledniVysledek }) : null,
        h('dt', { text: 'Budget' }), h('dd', { text: `${mil(n.budget)}, hlídáme do ${mil(n.strop)}` })),
      n.kriteria && n.kriteria.length ? h('ul', { class: 'crit' }, n.kriteria.map(k => h('li', { text: k }))) : null,
      h('p', { class: 'muted small', text: 'Běží každé ráno, projde upozornění z e-mailu, agregátory a weby developerů a nové byty zapíše sem.' })));

    let theme = 'system';
    try { theme = localStorage.getItem('theme') || 'system'; } catch (e) { /* storage blocked */ }
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Vzhled' }),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Vzhled' }, [['system', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý']].map(([k, l]) =>
        h('button', { type: 'button', 'aria-pressed': String(theme === k), onclick: () => { try { localStorage.setItem('theme', k); } catch (e) { /* ignore */ } nav.applyTheme(k); draw(); } }, l)))));

    const offline = h('dl', { class: 'kv' });
    box.append(h('section', { class: 'panel' }, h('h2', { text: 'Data v telefonu' }), offline,
      h('div', { class: 'row-actions row-actions--wrap' },
        h('button', { class: 'btn btn--danger-quiet', type: 'button', onclick: () => confirmSheet('Načíst vše znovu?', pend.length ? `Smaže kopii v telefonu i ${pend.length} neodeslaných změn a stáhne vše znovu z GitHubu.` : 'Smaže kopii v telefonu a stáhne vše znovu z GitHubu.', 'Načíst znovu', async () => {
          await resetLocal();
          try { await sync(); toast('Staženo znovu.'); } catch (e) { toast(e.message); }
        }, true) }, 'Načíst vše znovu z GitHubu'))));

    box.append(h('p', { class: 'muted small center', text: `Nemovitosti ${nav.version} · data zůstávají v telefonu a v soukromém úložišti na GitHubu.` }));
    put(root, box);

    let persisted = false, est = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { /* ignore */ }
    try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { /* ignore */ }
    put(offline,
      h('dt', { text: 'Bytů' }), h('dd', { text: String(store.byty.size) }),
      h('dt', { text: 'Trvalé úložiště' }), h('dd', { text: persisted ? 'ano' : 'nepotvrzeno' }),
      est ? h('dt', { text: 'Obsazeno' }) : null, est ? h('dd', { text: `${(est.usage / 1048576).toFixed(1)} MB` }) : null);
  }
  draw();
  return { refresh: () => { if (document.activeElement && document.activeElement.matches('input')) return; draw(); } };
}
