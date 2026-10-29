/* The layer stack (explorer at the bottom, then dialogs, viewer, player...) and the generic dialogs. */

import { h, clear } from './dom.js';
import { Layer, onActivate } from './focus.js';
import { icon } from './icons.js';

export class Stack {
    constructor(root) { this.root = root; this.list = []; }
    top() { return this.list[this.list.length - 1] || null; }
    push(layer) {
        const prev = this.top();
        if (prev && prev.onCover) prev.onCover();
        this.list.push(layer);
        if (!layer.el.isConnected) this.root.appendChild(layer.el);
        layer.stack = this;
        if (layer.onShow) layer.onShow(); else layer.focusFirst();
        return layer;
    }
    remove(layer) {
        const i = this.list.indexOf(layer);
        if (i < 0) return;
        this.list.splice(i, 1);
        if (layer.el.isConnected) layer.el.remove();
        layer.stack = null;
        const t = this.top();
        if (t && i === this.list.length && t.onUncover) t.onUncover();
    }
    dispatch(cmd, info) {
        const t = this.top();
        if (t) t.handle(cmd, info || {});
    }
    /** pointer / touch: focus what was touched in the top layer */
    pointerFocus(target) {
        const t = this.top();
        if (!t) return;
        const el = target.closest && target.closest('[data-f]');
        if (el && t.el.contains(el)) t.focus(el);
    }
}

/** A modal dialog resolving a Promise. */
export class Dialog extends Layer {
    constructor(cls, title) {
        const panel = h('div', { class: 'dlg-panel ' + (cls || ''), role: 'dialog', 'aria-label': title || '' });
        super(h('div', { class: 'dlg' }, panel));
        this.panel = panel;
        this.result = new Promise((r) => { this._resolve = r; });
        if (title) panel.appendChild(h('h2', { class: 'dlg-title' }, title));
    }
    close(value) {
        if (this.closed) return;
        this.closed = true;
        this.stack.remove(this);
        this._resolve(value);
    }
    button(label, ic, fn, extra = {}) {
        const b = h('button', { class: 'btn ' + (extra.cls || ''), type: 'button', 'data-autofocus': extra.autofocus || null },
            ic ? h('span', { class: 'ico', html: ic }) : null, h('span', null, label));
        if (extra.disabled) b.disabled = true;
        return onActivate(b, fn);
    }
}

export function menu(stack, { title, items, subtitle }) {
    const d = new Dialog('dlg-menu', title);
    if (subtitle) d.panel.appendChild(h('p', { class: 'dlg-sub' }, subtitle));
    const list = h('div', { class: 'menu-list', 'data-scroll': '' });
    items.forEach((it, i) => {
        if (it.sep) { list.appendChild(h('div', { class: 'menu-sep' })); return; }
        const b = h('button', { class: 'menu-item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : ''), type: 'button', 'data-autofocus': it.focus || (i === 0 ? '' : null) },
            h('span', { class: 'ico', html: it.icon || (it.checked ? icon.check : '') }),
            h('span', { class: 'menu-label' }, it.label),
            it.hint ? h('span', { class: 'menu-hint' }, it.hint) : null);
        if (it.disabled) { b.disabled = true; b.title = it.why || ''; if (it.why) b.appendChild(h('span', { class: 'menu-why' }, it.why)); }
        onActivate(b, () => !it.disabled && d.close(it.id));
        list.appendChild(b);
    });
    d.panel.appendChild(list);
    stack.push(d);
    return d.result;
}

export function confirm(stack, { title, text, ok, danger }) {
    const d = new Dialog('dlg-confirm', title);
    d.panel.appendChild(h('p', { class: 'dlg-text' }, text));
    d.panel.appendChild(h('div', { class: 'dlg-actions' },
        d.button(ok || 'OK', danger ? icon.trash : icon.check, () => d.close(true), { cls: danger ? 'danger' : 'primary' }),
        d.button('Cancel', icon.close, () => d.close(false), { autofocus: danger ? '1' : null })));
    stack.push(d);
    return d.result;
}

export function alertBox(stack, { title, text }) {
    const d = new Dialog('dlg-confirm', title);
    d.panel.appendChild(h('p', { class: 'dlg-text' }, text));
    d.panel.appendChild(h('div', { class: 'dlg-actions' }, d.button('OK', icon.check, () => d.close(true), { cls: 'primary', autofocus: '1' })));
    stack.push(d);
    return d.result;
}

/** Key/value table dialog (details). */
export function infoBox(stack, { title, rows, actions = [] }) {
    const d = new Dialog('dlg-info', title);
    const t = h('div', { class: 'info-table', 'data-scroll': '' });
    rows.filter((r) => r[1] !== '' && r[1] != null).forEach(([k, v]) => t.appendChild(h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, k), h('span', { class: 'info-v' }, String(v)))));
    d.panel.appendChild(t);
    d.panel.appendChild(h('div', { class: 'dlg-actions' },
        actions.map((a) => d.button(a.label, a.icon, () => d.close(a.id))),
        d.button('Close', icon.close, () => d.close(null), { autofocus: '1' })));
    stack.push(d);
    return d.result;
}

/* ---------- toasts ---------- */
let toastBox = null;
export function toast(text, kind = 'info', ms = 3500) {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast ' + kind }, h('span', { class: 'ico', html: kind === 'error' ? icon.info : icon.check }), h('span', null, text));
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(() => t.remove(), ms);
    if (window.MyPC && MyPC.announce && kind === 'error') MyPC.announce(text);
}
export function clearToasts() { if (toastBox) clear(toastBox); }
