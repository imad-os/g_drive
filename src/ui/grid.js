/* Virtualized file grid / compact grid / list. Only the rows on screen (plus one) exist in the DOM, so a
 * folder with thousands of files costs the same as one with thirty. The grid draws its own focus. */

import { h, formatSize, formatDate } from './dom.js';
import { fileGlyph, fileKind, icon } from './icons.js';
import { FOLDER } from '../drive/api.js';

const VIEWS = {
    //       tile w, tile h, gap (rem)
    grid:    { w: 13.4, h: 14.6, gap: 1.1 },
    compact: { w: 9.8, h: 10.6, gap: 0.8 },
    list:    { w: 0, h: 3.9, gap: 0.35 }
};

export function typeLabel(f) {
    if (f.mimeType === FOLDER) return 'Folder';
    const k = fileKind(f.mimeType);
    const ext = (f.fileExtension || '').toUpperCase();
    const names = { image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF', sheet: 'Spreadsheet', slides: 'Presentation', doc: 'Document', archive: 'Archive', text: 'Text' };
    return (ext ? ext + ' ' : '') + (names[k] || 'File');
}

export class FileGrid {
    constructor({ thumbs, onOpen, onFocus, onNeedMore, lang }) {
        this.thumbs = thumbs;
        this.onOpen = onOpen;
        this.onFocusItem = onFocus;
        this.onNeedMore = onNeedMore;
        this.lang = lang;
        this.files = [];
        this.hasMore = false;
        this.index = 0;
        this.active = false;
        this.view = 'grid';
        this.tiles = new Map();         // index -> element
        this.cols = 1; this.rowH = 1; this.tileW = 1; this.gapPx = 0; this.rem = 16;
        this.inner = h('div', { class: 'grid-inner' });
        this.head = h('div', { class: 'list-head' },
            h('span', { class: 'lh-name' }, 'Name'), h('span', null, 'Modified'), h('span', null, 'Type'), h('span', { class: 'lh-size' }, 'Size'));
        this.el = h('div', { class: 'grid-scroll', 'data-f': '', 'data-grid': '', role: 'listbox' }, this.inner);
        this.wrap = h('div', { class: 'grid-wrap' }, this.head, this.el);
        this._raf = 0;
        this._onScroll = () => { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); };
        this.el.addEventListener('scroll', this._onScroll, { passive: true });
        this.el.addEventListener('click', (e) => {
            const t = e.target.closest('.tile');
            if (!t) return;
            const i = +t.dataset.i;
            if (i === this.index && this.active) this.onOpen(this.files[i], i);
            else { this.setIndex(i); }
        });
    }

    setView(v) {
        this.view = VIEWS[v] ? v : 'grid';
        this.wrap.dataset.view = this.view;
        this.relayout();
    }

    setFiles(files, hasMore, keepIndex) {
        this.files = files;
        this.hasMore = hasMore;
        if (!keepIndex) { this.index = 0; this.el.scrollTop = 0; }
        this.index = Math.max(0, Math.min(this.index, files.length - 1));
        this.el.setAttribute('aria-disabled', files.length ? 'false' : 'true');
        this.dropTiles();
        this.relayout();
    }

    appendFiles(more, hasMore) {
        this.files = this.files.concat(more);
        this.hasMore = hasMore;
        this.relayout();
    }

    current() { return this.files[this.index] || null; }

    relayout() {
        this.rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const v = VIEWS[this.view];
        const width = this.el.clientWidth - this.rem * 0.6;
        this.gapPx = v.gap * this.rem;
        if (this.view === 'list') { this.cols = 1; this.tileW = width; }
        else {
            this.cols = Math.max(1, Math.floor((width + this.gapPx) / (v.w * this.rem + this.gapPx)));
            this.tileW = (width - this.gapPx * (this.cols - 1)) / this.cols;
        }
        this.rowH = v.h * this.rem + this.gapPx;
        const rows = Math.ceil(this.files.length / this.cols);
        this.inner.style.height = Math.max(0, rows * this.rowH - this.gapPx + this.rem * 0.6) + 'px';
        this.dropTiles();
        this.render();
    }

    dropTiles() { this.tiles.forEach((t) => t.remove()); this.tiles.clear(); }

    render() {
        const top = this.el.scrollTop, hgt = this.el.clientHeight;
        const r0 = Math.max(0, Math.floor(top / this.rowH) - 1);
        const r1 = Math.ceil((top + hgt) / this.rowH) + 1;
        const i0 = r0 * this.cols, i1 = Math.min(this.files.length, r1 * this.cols);
        this.tiles.forEach((t, i) => { if (i < i0 || i >= i1) { t.remove(); this.tiles.delete(i); } });
        for (let i = i0; i < i1; i++) if (!this.tiles.has(i)) this.inner.appendChild(this.tile(i));
        this.paintFocus();
    }

    tile(i) {
        const f = this.files[i];
        const kind = f.mimeType === FOLDER ? 'folder' : fileKind(f.mimeType);
        const row = Math.floor(i / this.cols), col = i % this.cols;
        const thumb = h('div', { class: 'thumb k-' + kind, html: fileGlyph(kind) });
        const list = this.view === 'list';
        const el = h('div', { class: 'tile', role: 'option', 'data-i': i, 'data-id': f.id, style: {
            width: this.tileW + 'px', height: (this.rowH - this.gapPx) + 'px',
            transform: `translate(${col * (this.tileW + this.gapPx) + this.rem * 0.3}px,${row * this.rowH + this.rem * 0.3}px)` } },
            thumb,
            h('div', { class: 'tile-name' }, f.name),
            list ? [h('div', { class: 'tile-col' }, formatDate(f.modifiedTime, this.lang)), h('div', { class: 'tile-col' }, typeLabel(f)),
                h('div', { class: 'tile-col size' }, f.mimeType === FOLDER ? '' : formatSize(f.size))]
                : h('div', { class: 'tile-meta' }, f.mimeType === FOLDER ? 'Folder' : [formatSize(f.size), f.modifiedTime ? ' · ' + formatDate(f.modifiedTime, this.lang) : ''].join('')),
            f.starred ? h('span', { class: 'tile-star', html: icon.starFill }) : null,
            kind === 'video' ? h('span', { class: 'tile-play', html: icon.play }) : null);
        if (f.thumbnailLink && !list) {
            this.thumbs.get(f, () => el.isConnected).then((url) => {
                if (!url || !el.isConnected || el.dataset.id !== f.id) return;
                const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
                img.onload = () => thumb.classList.add('has-img');
                img.src = url;
                thumb.appendChild(img);
            });
        }
        this.tiles.set(i, el);
        return el;
    }

    paintFocus() {
        this.inner.querySelectorAll('.tile.is-focus,.tile.is-sel').forEach((t) => t.classList.remove('is-focus', 'is-sel'));
        const t = this.tiles.get(this.index);
        if (t) t.classList.add(this.active ? 'is-focus' : 'is-sel');
    }

    setActive(on) { this.active = on; this.paintFocus(); }

    setIndex(i, accelScroll) {
        if (!this.files.length) return;
        this.index = Math.max(0, Math.min(this.files.length - 1, i));
        this.scrollToIndex();
        this.render();
        this.onFocusItem(this.files[this.index], this.index);
        if (this.hasMore && this.index >= this.files.length - this.cols * 4) this.onNeedMore();
    }

    scrollToIndex() {
        const row = Math.floor(this.index / this.cols);
        const y = row * this.rowH, hgt = this.el.clientHeight;
        if (y < this.el.scrollTop) this.el.scrollTop = Math.max(0, y - this.rem * 0.3);
        else if (y + this.rowH > this.el.scrollTop + hgt) this.el.scrollTop = y + this.rowH - hgt + this.rem * 0.6;
    }

    /** Arrow inside the grid. Returns false at an edge the explorer should leave through. */
    move(dir, accel = 1) {
        const n = this.files.length, c = this.cols, i = this.index;
        if (!n) return false;
        const col = i % c, row = Math.floor(i / c), lastRow = Math.floor((n - 1) / c);
        if (dir === 'left') { if (col === 0) return false; this.setIndex(i - 1); return true; }
        if (dir === 'right') { if (col === c - 1) return false; if (i < n - 1) this.setIndex(i + 1); return true; }
        if (dir === 'up') { if (row === 0) return false; this.setIndex(Math.max(col, i - c * accel)); return true; }
        if (dir === 'down') {
            if (row === lastRow) { if (this.hasMore) this.onNeedMore(); return true; }
            this.setIndex(Math.min(n - 1, i + c * accel)); return true;
        }
        return false;
    }

    page(delta) {
        const rows = Math.max(1, Math.floor(this.el.clientHeight / this.rowH));
        this.setIndex(this.index + delta * rows * this.cols);
    }

    /** Coming in from outside: pick the tile nearest to `from` (a DOMRect). */
    enterFrom(from) {
        if (!this.files.length) return;
        const box = this.el.getBoundingClientRect();
        const firstRow = Math.floor(this.el.scrollTop / this.rowH);
        let row, col;
        if (from && from.right <= box.left + 2) {             // from the sidebar: same height, first column
            row = firstRow + Math.max(0, Math.floor(((from.top + from.bottom) / 2 - box.top + (this.el.scrollTop % this.rowH)) / this.rowH));
            col = 0;
        } else if (from && from.bottom <= box.top + 2) {      // from above: keep the selection if visible, else first visible row
            const selRow = Math.floor(this.index / this.cols);
            if (selRow >= firstRow && selRow * this.rowH < this.el.scrollTop + this.el.clientHeight - this.rowH / 2) { this.setActive(true); this.setIndex(this.index); return; }
            row = firstRow;
            col = Math.max(0, Math.min(this.cols - 1, Math.floor(((from.left + from.right) / 2 - box.left) / (this.tileW + this.gapPx))));
        } else { this.setActive(true); this.setIndex(this.index); return; }
        this.setActive(true);
        this.setIndex(Math.min(this.files.length - 1, row * this.cols + col));
    }

    focusRect() {
        const t = this.tiles.get(this.index);
        return t ? t.getBoundingClientRect() : this.el.getBoundingClientRect();
    }

    /** Replace one file in place (after star / rename) without reloading the folder. */
    patch(file) {
        const i = this.files.findIndex((f) => f.id === file.id);
        if (i < 0) return;
        this.files[i] = file;
        const t = this.tiles.get(i);
        if (t) { t.remove(); this.tiles.delete(i); this.render(); }
    }

    destroy() {
        cancelAnimationFrame(this._raf);
        this.el.removeEventListener('scroll', this._onScroll);
        this.dropTiles();
    }
}
