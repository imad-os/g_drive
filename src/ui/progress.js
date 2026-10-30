/* Progress bars: a value 0..1, or null while the size is not known yet (a moving stripe), and the transfer card
 * shown above the status bar while files go up to Drive. */

import { h, formatSize } from './dom.js';

export function progressBar(cls) {
    const fill = h('div', { class: 'pbar-fill' });
    const el = h('div', { class: 'pbar busy' + (cls ? ' ' + cls : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill);
    return {
        el,
        set(p) {
            const known = typeof p === 'number' && isFinite(p);
            el.classList.toggle('busy', !known);
            if (!known) { el.removeAttribute('aria-valuenow'); return; }
            const v = Math.max(0, Math.min(1, p));
            fill.style.width = (v * 100).toFixed(1) + '%';
            el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
        }
    };
}

/** "45%  ·  3.2 MB of 7.0 MB" */
export function progressText(p, total) {
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    return total > 0 ? `${pct}   ·   ${formatSize(Math.round(p * total))} of ${formatSize(total)}` : pct;
}

let box = null;
export function transferCard(title) {
    if (!box) { box = h('div', { class: 'transfers', 'aria-live': 'polite' }); document.body.appendChild(box); }
    const head = h('div', { class: 'transfer-title' }, title);
    const name = h('div', { class: 'transfer-name' });
    const info = h('div', { class: 'transfer-info' });
    const bar = progressBar();
    const el = h('div', { class: 'transfer' }, head, name, bar.el, info);
    box.appendChild(el);
    return {
        /** p: 0..1 or null (not known yet) */
        set(p, fileName, details, newTitle) {
            bar.set(p);
            if (fileName != null) name.textContent = fileName;
            info.textContent = details || '';
            if (newTitle) head.textContent = newTitle;
        },
        done() { el.remove(); }
    };
}
export function clearTransfers() { if (box) box.textContent = ''; }
