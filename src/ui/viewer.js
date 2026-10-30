/* Full-screen image viewer: previous / next, fit and zoom, pan, file info. One full image in memory at a time. */

import { h, formatSize } from './dom.js';
import { Layer, onActivate } from './focus.js';
import { icon } from './icons.js';
import { progressBar, progressText } from './progress.js';
import { drop } from '../media/thumbs.js';

const MAX_FULL = 20 * 1024 * 1024;                              // bigger originals: Google's 1920 px rendition
const NATIVE = /^image\/(jpeg|png|gif|webp|bmp|svg\+xml|avif|x-icon)$/;
const ZOOMS = [1, 1.5, 2, 3, 4];

export class Viewer extends Layer {
    constructor(app, files, index) {
        super(h('div', { class: 'viewer' }));
        this.app = app; this.files = files; this.index = Math.max(0, index);
        this.url = ''; this.ctrl = null; this.zoom = 0; this.px = 0; this.py = 0;
        this.img = h('img', { class: 'viewer-img', alt: '', draggable: 'false' });
        this.stage = h('div', { class: 'viewer-stage' }, this.img);
        this.msgText = h('div');
        this.pbar = progressBar();
        this.pinfo = h('div', { class: 'pinfo' });
        this.msg = h('div', { class: 'viewer-msg' }, this.msgText, this.pbar.el, this.pinfo);
        this.title = h('div', { class: 'viewer-title' });
        this.meta = h('div', { class: 'viewer-meta' });
        const b = (ic, label, fn) => { const x = h('button', { class: 'vbtn', type: 'button', 'aria-label': label }, h('span', { class: 'ico', html: ic }), h('span', { class: 'cmd-label' }, label)); return onActivate(x, fn); };
        this.bar = h('div', { class: 'viewer-bar' },
            b(icon.close, 'Close', () => this.close()),
            b(icon.prev, 'Previous', () => this.step(-1)),
            b(icon.zoomOut, 'Zoom out', () => this.setZoom(this.zoom - 1)),
            b(icon.fit, 'Fit', () => this.setZoom(0)),
            b(icon.zoomIn, 'Zoom in', () => this.setZoom(this.zoom + 1)),
            b(icon.next, 'Next', () => this.step(1)),
            b(icon.info, 'Info', () => this.app.explorerDetails(this.files[this.index])));
        this.bar.children[5].setAttribute('data-autofocus', '1');
        this.el.append(this.stage, this.msg, h('div', { class: 'viewer-top' }, this.title, this.meta), this.bar);
    }

    onShow() { this.focusFirst(); this.show(); }

    async show() {
        const f = this.files[this.index];
        if (!f) return;
        if (this.ctrl) this.ctrl.abort();
        const ctrl = this.ctrl = new AbortController();
        this.zoom = 0; this.px = this.py = 0; this.applyTransform();
        this.title.textContent = f.name;
        const im = f.imageMediaMetadata || {};
        this.meta.textContent = [`${this.index + 1} / ${this.files.length}`, im.width ? `${im.width} × ${im.height}` : '', formatSize(f.size)].filter(Boolean).join('   ·   ');
        this.say('Loading…', 'on', null);
        // the cached thumbnail first, so something shows at once
        const thumb = this.app.thumbs.cache.get(f.id);
        this.setSrc(thumb || '', false);
        let url = '';
        try {
            if ((+f.size || 0) > MAX_FULL || !NATIVE.test(f.mimeType)) {
                if (!f.thumbnailLink) throw Object.assign(new Error('This image format cannot be shown on this screen.'), { code: 'format' });
                url = await this.app.thumbs.url(f.thumbnailLink, 1920, ctrl.signal);     // one piece: no size known, the bar just moves
            } else {
                const size = +f.size || 0;
                const r = await this.app.source.download(f.id, ctrl.signal, (p) => {
                    if (!ctrl.signal.aborted) this.say('Loading…', 'on', p, progressText(p, size));
                });
                url = URL.createObjectURL(new Blob([r.buf], { type: f.mimeType === 'image/svg+xml' || /svg/.test(r.type) ? 'image/svg+xml' : f.mimeType }));
            }
            if (ctrl.signal.aborted) { drop(url); return; }
            this.say('Opening…', 'on', 1);
            await new Promise((res, rej) => { const t = new Image(); t.onload = res; t.onerror = () => rej(Object.assign(new Error('The image could not be decoded.'), { code: 'format' })); t.src = url; });
            if (ctrl.signal.aborted) { drop(url); return; }
            this.setSrc(url, url.startsWith('blob:'));
            this.say('', '');
            this.preloadNeighbourThumbs();
        } catch (e) {
            drop(url);
            if (ctrl.signal.aborted || e.code === 'cancelled') return;
            this.say(e.message || 'The image could not be loaded.', 'on error');
        }
    }

    /** The message in the middle; p: undefined = no bar, null = moving bar, 0..1 = progress. */
    say(text, cls, p, details) {
        this.msgText.textContent = text;
        this.msg.className = 'viewer-msg ' + cls;
        this.pbar.el.hidden = p === undefined;
        if (p !== undefined) this.pbar.set(p);
        this.pinfo.textContent = details || '';
    }

    setSrc(url, owned) {
        if (this.url && this.urlOwned) URL.revokeObjectURL(this.url);
        this.url = url; this.urlOwned = owned;
        if (url) this.img.src = url; else this.img.removeAttribute('src');
    }

    preloadNeighbourThumbs() {
        [this.index + 1, this.index - 1].forEach((i) => { const f = this.files[i]; if (f) this.app.thumbs.get(f); });
    }

    step(d) {
        const i = this.index + d;
        if (i < 0 || i >= this.files.length) return;
        this.index = i;
        this.show();
    }

    setZoom(z) {
        this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, z));
        if (!this.zoom) this.px = this.py = 0;
        this.applyTransform();
    }
    pan(dx, dy) {
        const s = ZOOMS[this.zoom];
        const lim = (n, max) => Math.max(-max, Math.min(max, n));
        this.px = lim(this.px + dx, (s - 1) * 50);
        this.py = lim(this.py + dy, (s - 1) * 50);
        this.applyTransform();
    }
    applyTransform() {
        const s = ZOOMS[this.zoom];
        this.img.style.transform = `scale(${s}) translate(${this.px / s}%, ${this.py / s}%)`;
        this.el.classList.toggle('zoomed', this.zoom > 0);
    }

    handle(cmd, info) {
        const onBar = this.current && this.bar.contains(this.current);
        if (this.zoom > 0 && /^(left|right|up|down)$/.test(cmd) && !this._barMode) {
            const d = 8 * (info.accel || 1);
            this.pan(cmd === 'left' ? d : cmd === 'right' ? -d : 0, cmd === 'up' ? d : cmd === 'down' ? -d : 0);
            return true;
        }
        switch (cmd) {
            case 'prevTab': this.step(-1); return true;
            case 'nextTab': this.step(1); return true;
            case 'trigL': this.setZoom(this.zoom - 1); return true;
            case 'trigR': this.setZoom(this.zoom + 1); return true;
            case 'search': case 'ctx': this.app.explorerDetails(this.files[this.index]); return true;
            case 'back': if (this.zoom) { this.setZoom(0); return true; } this.close(); return true;
            case 'okLong': this.setZoom(this.zoom ? 0 : 2); return true;
            default: if (onBar || !this.current) return super.handle(cmd, info); return false;
        }
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        if (this.ctrl) this.ctrl.abort();
        this.setSrc('', false);
        this.stack.remove(this);
    }
}
