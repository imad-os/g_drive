/* On-screen keyboard: names and searches are typed with arrows + OK (no physical keyboard needed). */

import { h } from './dom.js';
import { Dialog } from './layers.js';
import { onActivate } from './focus.js';
import { icon } from './icons.js';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm_.,', "()&'!@#+=~"];

/** -> Promise<string|null>. opts: { title, value, placeholder, ok, onChange(value) (live search), max } */
export function typeText(stack, { title, value = '', placeholder = '', ok = 'Done', onChange, max = 255 }) {
    const d = new Dialog('dlg-osk', title);
    let text = String(value), upper = false;
    const shown = h('div', { class: 'osk-text' });
    const render = () => {
        shown.textContent = text || placeholder;
        shown.classList.toggle('empty', !text);
        shown.appendChild(h('span', { class: 'osk-caret' }));
        keys.forEach((k) => { if (k.dataset.ch) k.firstChild.textContent = upper ? k.dataset.ch.toUpperCase() : k.dataset.ch; });
        shiftKey.classList.toggle('on', upper);
        if (onChange) onChange(text);
    };
    const keys = [];
    const grid = h('div', { class: 'osk-grid' });
    ROWS.forEach((row) => row.split('').forEach((ch) => {
        const k = h('button', { class: 'osk-key', type: 'button', 'data-ch': ch, 'data-autofocus': ch === 'q' ? '1' : null }, h('span', null, ch));
        onActivate(k, () => { if (text.length < max) { text += upper ? ch.toUpperCase() : ch; if (upper) upper = false; render(); } });
        keys.push(k); grid.appendChild(k);
    }));
    const wide = (cls, ic, label, fn) => onActivate(h('button', { class: 'osk-key ' + cls, type: 'button' }, h('span', { class: 'ico', html: ic }), h('span', { class: 'lbl' }, label)), fn);
    const shiftKey = wide('w2', icon.shift, 'Shift', () => { upper = !upper; render(); });
    grid.append(
        shiftKey,
        wide('w4', icon.space, 'Space', () => { if (text.length < max) { text += ' '; render(); } }),
        wide('w2', icon.backspace, 'Delete', () => { text = text.slice(0, -1); render(); }),
        wide('w2', icon.close, 'Clear', () => { text = ''; render(); }));
    const done = wide('w10 primary', icon.check, ok, () => d.close(text));
    grid.appendChild(done);
    d.panel.append(shown, grid);
    const base = d.handle.bind(d);
    d.handle = (cmd, info) => {
        if (cmd === 'search' || cmd === 'menu') { d.close(text); return true; }       // Y / Start = done
        if (cmd === 'ctx') { text = text.slice(0, -1); render(); return true; }       // X = delete
        return base(cmd, info);
    };
    stack.push(d);
    render();
    return d.result;
}
