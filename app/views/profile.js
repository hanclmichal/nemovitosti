// Profiles: who uses the app right now (Míša green, Zuzka pink). The colour of the whole app follows the profile.
import { store, lide, profil, setKdo } from '../store.js';
import { h, openSheet, closeSheet, toast } from '../ui.js';

/** Put the profile colour on <html> and refresh the status bar colour. */
export function applyProfile() {
  const p = profil();
  document.documentElement.dataset.profile = p ? p.barva : 'zelena';
  const btn = document.getElementById('profBtn');
  if (btn) {
    btn.textContent = p ? p.jmeno.slice(0, 1).toUpperCase() : '?';
    btn.dataset.barva = p ? p.barva : '';
    btn.setAttribute('aria-label', p ? `Profil: ${p.jmeno}. Přepnout` : 'Vybrat profil');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#eef2ee');
}

/** Buttons to pick a profile; onPick runs after it is saved. */
export function profilePicker(onPick) {
  return h('div', { class: 'profiles', role: 'group', 'aria-label': 'Profil' }, lide().map(p =>
    h('button', { class: `profile profile--${p.barva}`, type: 'button', 'aria-pressed': String(store.kdo === p.jmeno), onclick: async () => {
      await setKdo(p.jmeno);
      applyProfile();
      onPick && onPick(p);
    } },
      h('span', { class: 'profile__dot', text: p.jmeno.slice(0, 1).toUpperCase() }),
      h('span', { class: 'profile__name', text: p.jmeno }))));
}

export function openProfiles() {
  openSheet('Kdo jsi', [
    h('p', { class: 'muted small', text: 'Profil určuje barvu aplikace, čí hodnocení je „tvoje“ a podpis u poznámek. Na každém telefonu si ho vyber jednou, přepnout jde kdykoli.' }),
    profilePicker(p => { closeSheet(); toast(`Profil: ${p.jmeno}`); })
  ]);
}
