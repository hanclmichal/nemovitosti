// Range filter: a two-thumb slider plus "od" and "do" fields for typing an exact value, with optional presets.
// Values at the ends of the slider mean "no limit" (null), so flats outside today's range are not cut off later.
import { h } from '../ui.js';

/**
 * opts: {
 *   label, min, max, step, value: [lo|null, hi|null], unit,
 *   toField(v) → text for the input, fromField(text) → number|null,
 *   text([lo|null, hi|null]) → summary shown next to the label,
 *   presets: [[label, [lo|null, hi|null]]],
 *   onInput(range) while dragging, onChange(range) when the value is settled
 * }
 */
export function rangeFilter(opts) {
  const { min, max, step } = opts;
  const snap = v => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  let lo = opts.value[0] == null ? min : snap(opts.value[0]);
  let hi = opts.value[1] == null ? max : snap(opts.value[1]);
  if (lo > hi) [lo, hi] = [hi, lo];
  const out = () => [lo <= min ? null : lo, hi >= max ? null : hi];

  const val = h('span', { class: 'rng__val' });
  const fill = h('div', { class: 'rng__fill' });
  const thumb = which => h('div', { class: 'rng__thumb', role: 'slider', tabindex: '0', 'data-thumb': which,
    'aria-label': `${opts.label} ${which === 'lo' ? 'od' : 'do'}`, 'aria-valuemin': String(min), 'aria-valuemax': String(max) });
  const tLo = thumb('lo'), tHi = thumb('hi');
  const slider = h('div', { class: 'rng__slider' }, h('div', { class: 'rng__track' }, fill), tLo, tHi);
  const field = (which) => h('input', { class: 'rng__in', type: 'text', inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off',
    'aria-label': `${opts.label} ${which === 'lo' ? 'od' : 'do'}`, placeholder: opts.toField(which === 'lo' ? min : max) });
  const fLo = field('lo'), fHi = field('hi');

  function paint() {
    const pct = v => (max > min ? (v - min) / (max - min) * 100 : 0);
    tLo.style.left = `${pct(lo)}%`; tHi.style.left = `${pct(hi)}%`;
    fill.style.left = `${pct(lo)}%`; fill.style.width = `${pct(hi) - pct(lo)}%`;
    tLo.setAttribute('aria-valuenow', String(lo)); tHi.setAttribute('aria-valuenow', String(hi));
    tLo.setAttribute('aria-valuetext', opts.toField(lo) + ' ' + opts.unit); tHi.setAttribute('aria-valuetext', opts.toField(hi) + ' ' + opts.unit);
    // the thumb on top is the one that can still move towards the other
    tLo.style.zIndex = lo >= max - step ? '3' : '2';
    if (document.activeElement !== fLo) fLo.value = lo <= min ? '' : opts.toField(lo);
    if (document.activeElement !== fHi) fHi.value = hi >= max ? '' : opts.toField(hi);
    val.textContent = opts.text(out());
    val.classList.toggle('is-off', lo <= min && hi >= max);
  }
  const changed = () => { paint(); opts.onChange(out()); };

  // dragging: the nearer thumb follows the finger
  slider.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    const rect = slider.getBoundingClientRect();
    const at = x => snap(min + (x - rect.left) / rect.width * (max - min));
    const v = at(ev.clientX);
    const dl = Math.abs(v - lo), dh = Math.abs(v - hi);
    let which = ev.target === tLo ? 'lo' : ev.target === tHi ? 'hi' : dl < dh ? 'lo' : dh < dl ? 'hi' : (v < lo ? 'lo' : 'hi');
    const set = x => {
      if (which === 'lo') lo = Math.min(x, hi); else hi = Math.max(x, lo);
      paint();
      opts.onInput && opts.onInput(out());
    };
    if (ev.target !== tLo && ev.target !== tHi) set(v);
    (which === 'lo' ? tLo : tHi).focus({ preventScroll: true });
    slider.setPointerCapture(ev.pointerId);
    // both thumbs on the same spot: the direction of the first move decides which one goes
    let undecided = lo === hi;
    const move = e => {
      const x = at(e.clientX);
      if (undecided && x !== lo) { which = x < lo ? 'lo' : 'hi'; undecided = false; }
      set(x);
    };
    const up = () => {
      slider.removeEventListener('pointermove', move);
      slider.removeEventListener('pointerup', up);
      slider.removeEventListener('pointercancel', up);
      opts.onChange(out());
    };
    slider.addEventListener('pointermove', move);
    slider.addEventListener('pointerup', up);
    slider.addEventListener('pointercancel', up);
    ev.preventDefault();
  });

  // keyboard on the thumbs
  [tLo, tHi].forEach(t => t.addEventListener('keydown', ev => {
    const big = Math.max(step, Math.round((max - min) / 10 / step) * step);
    const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -big, PageUp: big }[ev.key];
    let target = null;
    const cur = t === tLo ? lo : hi;
    if (d != null) target = snap(cur + d);
    else if (ev.key === 'Home') target = min;
    else if (ev.key === 'End') target = max;
    if (target == null) return;
    ev.preventDefault();
    if (t === tLo) lo = Math.min(target, hi); else hi = Math.max(target, lo);
    changed();
  }));

  // typed values
  const commit = () => {
    const a = fLo.value.trim() ? opts.fromField(fLo.value) : null;
    const b = fHi.value.trim() ? opts.fromField(fHi.value) : null;
    lo = a == null || !isFinite(a) ? min : Math.min(max, Math.max(min, a));
    hi = b == null || !isFinite(b) ? max : Math.min(max, Math.max(min, b));
    if (lo > hi) [lo, hi] = [hi, lo];
    fLo.value = lo <= min ? '' : opts.toField(lo);
    fHi.value = hi >= max ? '' : opts.toField(hi);
    changed();
  };
  [fLo, fHi].forEach(f => {
    f.addEventListener('change', commit);
    f.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); f.blur(); } });
  });

  paint();
  return h('div', { class: 'rng', role: 'group', 'aria-label': opts.label },
    h('div', { class: 'rng__head' }, h('span', { class: 'form__label', text: opts.label }), val),
    slider,
    h('div', { class: 'rng__fields' },
      h('label', { class: 'rng__field' }, h('span', { text: 'od' }), fLo, h('span', { text: opts.unit })),
      h('span', { class: 'muted', text: '–' }),
      h('label', { class: 'rng__field' }, h('span', { text: 'do' }), fHi, h('span', { text: opts.unit }))),
    opts.presets && opts.presets.length ? h('div', { class: 'rng__presets' }, opts.presets.map(([label, r]) =>
      h('button', { class: 'chipbtn chipbtn--sm', type: 'button', onclick: () => {
        lo = r[0] == null ? min : snap(r[0]); hi = r[1] == null ? max : snap(r[1]);
        if (lo > hi) [lo, hi] = [hi, lo];
        changed();
      } }, label))) : null);
}

/* ready-made settings for the two filters */
const milText = v => (v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
export function plochaOpts(ext) {
  return {
    label: 'Plocha', min: ext.plocha[0], max: ext.plocha[1], step: 1, unit: 'm²',
    toField: v => String(v),
    fromField: t => { const v = Number(String(t).replace(/m²|m2/gi, '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? Math.round(v) : null; },
    presets: [['od 90 m²', [90, null]], ['od 100 m²', [100, null]], ['90–110 m²', [90, 110]], ['Všechny', [null, null]]]
  };
}
export function cenaOpts(ext, n) {
  return {
    label: 'Cena', min: ext.cena[0], max: ext.cena[1], step: 1e5, unit: 'mil. Kč',
    toField: milText,
    // "12,5" means millions, "12500000" is crowns
    fromField: t => {
      const v = Number(String(t).replace(/mil\.?|kč/gi, '').replace(/\s/g, '').replace(',', '.'));
      if (!isFinite(v)) return null;
      return v > 1000 ? Math.round(v) : Math.round(v * 1e6);
    },
    presets: [['Do budgetu', [null, n.budget]], ['Kolem budgetu', [n.budget - 15e5, n.mirneNad]], ['Všechny', [null, null]]]
  };
}
