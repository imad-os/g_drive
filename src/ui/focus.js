/* Focus without DOM focus (on the TV the page never has it): one `.is-focus` element per layer, moved with
 * spatial navigation (nearest focusable in the pressed direction). Rects are read only on a key press. */

export function rectOf(el) { return el.getBoundingClientRect(); }

function visible(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

/** Best candidate from `from` (an element or a DOMRect) in direction dir. */
export function spatial(from, dir, candidates) {
    const a = from instanceof Element ? from.getBoundingClientRect() : from;
    const ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    let best = null, bestScore = Infinity;
    for (const el of candidates) {
        if (el === from) continue;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        const bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2;
        let main, orth, overlap;
        if (dir === 'left' || dir === 'right') {
            main = dir === 'right' ? b.left - a.right : a.left - b.right;
            if ((dir === 'right' ? bx - ax : ax - bx) <= 1) continue;
            overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
            orth = Math.abs(by - ay);
        } else {
            main = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
            if ((dir === 'down' ? by - ay : ay - by) <= 1) continue;
            overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
            orth = Math.abs(bx - ax);
        }
        const score = Math.max(0, main) + (overlap ? orth * 0.2 : orth * 2 + 400);
        if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
}

/** A screen or dialog that owns the input while it is on top. */
export class Layer {
    constructor(el) {
        this.el = el;
        this.current = null;
        this.closed = false;
    }
    focusables() { return Array.from(this.el.querySelectorAll('[data-f]')).filter(visible); }
    focus(el) {
        if (!el || el === this.current) { if (el) this.ensureVisible(el); return; }
        if (this.current) this.current.classList.remove('is-focus');
        this.current = el;
        el.classList.add('is-focus');
        this.ensureVisible(el);
        this.onFocus(el);
    }
    onFocus() {}
    ensureVisible(el) {
        // scrolls the nearest scrollable box only (no smooth scrolling: cheaper on TVs)
        const box = el.closest('[data-scroll]');
        if (!box) return;
        const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (r.top < br.top + 8) box.scrollTop -= br.top - r.top + 8;
        else if (r.bottom > br.bottom - 8) box.scrollTop += r.bottom - br.bottom + 8;
    }
    focusFirst() {
        const pref = this.el.querySelector('[data-autofocus]');
        const list = this.focusables();
        this.focus(pref && list.includes(pref) ? pref : list[0]);
    }
    move(dir) {
        if (!this.current || !this.current.isConnected) { this.focusFirst(); return true; }
        const next = spatial(this.current, dir, this.focusables());
        if (next) { this.focus(next); return true; }
        return false;
    }
    activate(el = this.current) {
        if (el && !el.disabled) el.dispatchEvent(new CustomEvent('activate', { bubbles: true }));
    }
    /** Default handling; layers override and call super. Returns true when handled. */
    handle(cmd, info) {
        if (cmd === 'left' || cmd === 'right' || cmd === 'up' || cmd === 'down') return this.move(cmd);
        if (cmd === 'ok') { this.activate(); return true; }
        if (cmd === 'back') { this.close(null); return true; }
        return false;
    }
    close() {}
}

/** Makes an element activatable by OK and by mouse / touch. */
export function onActivate(el, fn) {
    el.setAttribute('data-f', '');
    el.addEventListener('activate', fn);
    el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
    return el;
}
