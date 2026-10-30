/* The main screen: address bar, command bar, sidebar, file grid and status bar (Windows 11 File Explorer
 * language, sized for a TV). Owns navigation history, the listing cache and the file operations. */

import { h, clear, formatSize, formatDate } from './dom.js';
import { Layer, onActivate, spatial } from './focus.js';
import { icon, fileKind } from './icons.js';
import { FileGrid, typeLabel } from './grid.js';
import { menu, confirm, infoBox, toast } from './layers.js';
import { typeText } from './osk.js';
import { transferCard, progressText } from './progress.js';
import { FOLDER } from '../drive/api.js';
import { store } from '../store.js';

const SECTIONS = [
    { kind: 'folder', id: 'root', label: 'My Drive', icon: icon.drive },
    { kind: 'all', label: 'All files', icon: icon.list },
    { kind: 'starred', label: 'Starred', icon: icon.star },
    { kind: 'recent', label: 'Recent', icon: icon.clock },
    { kind: 'images', label: 'Images', icon: icon.image },
    { kind: 'videos', label: 'Videos', icon: icon.video },
    { kind: 'audio', label: 'Audio', icon: icon.audio },
    { kind: 'documents', label: 'Documents', icon: icon.doc },
    { kind: 'trash', label: 'Trash', icon: icon.trash }
];
const CACHE_MS = 120000;
const sectionOf = (place) => SECTIONS.find((s) => s.kind === place.kind && (s.kind !== 'folder' || place.root)) || null;
const isPlayable = (f) => /^(video|audio)\//.test(f.mimeType);
const isImage = (f) => /^image\//.test(f.mimeType);

export class Explorer extends Layer {
    constructor(app) {
        super(h('div', { class: 'explorer' }));
        this.app = app;
        this.prefs = store.prefs();
        this.history = []; this.future = [];
        this.loc = null;                     // { place, path: [{id,name}] }
        this.cache = new Map();
        this.loadCtrl = null;
        this.loading = false;
        this.error = null;
        this.next = '';
        this.clip = null;                    // { mode: 'cut' | 'copy', file }
        this.searchTimer = 0;
        this.build();
    }

    /* ---------------- building ---------------- */

    btn(ic, label, fn, cls = '') {
        const b = h('button', { class: 'cmd ' + cls, type: 'button', 'aria-label': label }, h('span', { class: 'ico', html: ic }), label ? h('span', { class: 'cmd-label' }, label) : null);
        return onActivate(b, () => !b.disabled && fn());
    }

    build() {
        const a = this.app;
        this.b = {
            back: this.btn(icon.back, '', () => this.goBack(), 'icon-only'),
            fwd: this.btn(icon.forward, '', () => this.goForward(), 'icon-only'),
            up: this.btn(icon.up, '', () => this.goUp(), 'icon-only'),
            refresh: this.btn(icon.refresh, '', () => this.refresh(), 'icon-only'),
            search: this.btn(icon.search, 'Search', () => this.search(), 'search-btn'),
            account: this.btn(icon.user, '', () => a.openAccounts(), 'account-btn'),
            newFolder: this.btn(icon.newFolder, 'New folder', () => this.newFolder()),
            upload: this.btn(icon.upload, 'Upload', () => this.upload()),
            cut: this.btn(icon.cut, 'Cut', () => this.setClip('cut')),
            copy: this.btn(icon.copy, 'Copy', () => this.setClip('copy')),
            paste: this.btn(icon.paste, 'Paste', () => this.paste()),
            rename: this.btn(icon.rename, 'Rename', () => this.rename()),
            star: this.btn(icon.star, 'Star', () => this.toggleStar()),
            del: this.btn(icon.trash, 'Delete', () => this.trashOrRestore()),
            details: this.btn(icon.info, 'Details', () => this.details()),
            sort: this.btn(icon.sort, 'Sort', () => this.chooseSort()),
            view: this.btn(icon.view, 'View', () => this.chooseView()),
            more: this.btn(icon.more, '', () => this.contextMenu(), 'icon-only')
        };
        this.b.back.setAttribute('aria-label', 'Back'); this.b.fwd.setAttribute('aria-label', 'Forward');
        this.b.up.setAttribute('aria-label', 'Up'); this.b.refresh.setAttribute('aria-label', 'Refresh'); this.b.more.setAttribute('aria-label', 'More actions');
        this.crumbs = h('div', { class: 'crumbs' });
        this.accountName = h('span', { class: 'account-name' });
        this.b.account.appendChild(this.accountName);
        const B = this.b;
        const address = h('div', { class: 'addressbar' }, B.back, B.fwd, B.up, B.refresh, h('div', { class: 'crumb-box' }, h('span', { class: 'crumb-ico', html: icon.drive }), this.crumbs), B.search, B.account);
        const sep = () => h('span', { class: 'cmd-sep' });
        const cmdbar = h('div', { class: 'cmdbar' }, B.newFolder, B.upload, sep(), B.cut, B.copy, B.paste, sep(), B.rename, B.star, B.del, B.details, sep(), B.sort, B.view, B.more);

        this.side = h('nav', { class: 'sidebar', 'data-scroll': '' });
        this.sideItems = SECTIONS.map((s) => {
            const it = h('button', { class: 'side-item', type: 'button' }, h('span', { class: 'ico', html: s.icon }), h('span', null, s.label));
            onActivate(it, () => this.navigate(s.kind === 'folder' ? { kind: 'folder', id: 'root', root: true } : { kind: s.kind }, s.kind === 'folder' ? [{ id: 'root', name: 'My Drive' }] : []));
            it._section = s;
            this.side.appendChild(it);
            return it;
        });
        this.side.appendChild(h('div', { class: 'side-sep' }));
        const addFiles = h('button', { class: 'side-item', type: 'button' }, h('span', { class: 'ico', html: icon.phone }), h('span', null, 'Add files'));
        onActivate(addFiles, () => a.openAddFiles());
        const help = h('button', { class: 'side-item', type: 'button' }, h('span', { class: 'ico', html: icon.gamepad }), h('span', null, 'Controls'));
        onActivate(help, () => a.showControls());
        this.side.append(addFiles, help);

        this.grid = new FileGrid({
            thumbs: a.thumbs, lang: a.lang,
            onOpen: (f, i) => this.open(f, i),
            onFocus: () => this.updateCommands(),
            onNeedMore: () => this.loadMore()
        });
        this.grid.setView(this.prefs.view);
        this.overlay = h('div', { class: 'content-overlay' });
        const content = h('main', { class: 'content' }, this.grid.wrap, this.overlay);
        this.statusLeft = h('span', { class: 'status-left' });
        this.statusHints = h('span', { class: 'status-hints' });
        const status = h('footer', { class: 'statusbar' }, this.statusLeft, this.statusHints);
        this.demoBadge = h('span', { class: 'demo-badge' }, 'DEMO');
        this.el.append(h('header', { class: 'top' }, address, cmdbar), h('div', { class: 'body' }, this.side, content), status);
        this._onResize = () => this.grid.relayout();
        window.addEventListener('resize', this._onResize);
    }

    onShow() {
        this.refreshAccount();
        const last = this.prefs.last;
        const acc = this.app.accountKey();
        if (last && last.acc === acc && last.place && last.place.kind !== 'search') this.navigate(last.place, last.path || [], { noHistory: true, restoreId: last.sel });
        else this.navigate({ kind: 'folder', id: 'root', root: true }, [{ id: 'root', name: 'My Drive' }], { noHistory: true });
        this.focus(this.grid.el);
    }

    refreshAccount() {
        const acc = this.app.demo ? { name: 'Demo', email: 'demo' } : this.app.accounts.active();
        this.accountName.textContent = acc ? (acc.name || acc.email) : 'Sign in';
        this.demoBadge.remove();
        if (this.app.demo) this.b.account.appendChild(this.demoBadge);
    }

    /* ---------------- focus ---------------- */

    onFocus(el) {
        const inGrid = el === this.grid.el;
        if (inGrid) { el.classList.remove('is-focus'); this.grid.enterFrom(this._fromRect); }
        else this.grid.setActive(false);
        this._fromRect = null;
        this.updateHints();
    }

    inGrid() { return this.current === this.grid.el; }

    move(dir, accel) {
        if (this.inGrid()) {
            if (this.grid.move(dir, accel)) return true;
            const from = this.grid.focusRect();
            const next = spatial(from, dir, this.focusables().filter((e) => e !== this.grid.el));
            if (next) { this.grid.setActive(false); this.focus(next); }
            return true;
        }
        if (!this.current || !this.current.isConnected) { this.focus(this.grid.el); return true; }
        const next = spatial(this.current, dir, this.focusables());
        if (next) {
            if (next === this.grid.el) {
                if (!this.grid.files.length) return true;
                this._fromRect = this.current.getBoundingClientRect();
            }
            this.focus(next);
        }
        return true;
    }

    handle(cmd, info) {
        switch (cmd) {
            case 'left': case 'right': case 'up': case 'down': return this.move(cmd, info.accel || 1);
            case 'ok':
                if (this.inGrid()) { const f = this.grid.current(); if (f) this.open(f, this.grid.index); return true; }
                this.activate(); return true;
            case 'okLong': case 'ctx': if (this.inGrid() || cmd === 'ctx') this.contextMenu(); else this.activate(); return true;
            case 'back': return this.onBack();
            case 'menu': this.app.appMenu(); return true;
            case 'search': this.search(); return true;
            case 'prevTab': case 'nextTab': this.cycleSection(cmd === 'nextTab' ? 1 : -1); return true;
            case 'trigL': case 'stickUp': if (this.inGrid()) this.grid.page(-1); return true;
            case 'trigR': case 'stickDown': if (this.inGrid()) this.grid.page(1); return true;
            case 'pads': this.updateHints(); return true;
            default: return false;
        }
    }

    onBack() {
        if (this.loc && this.loc.place.kind === 'search') { this.goBack(); return true; }
        if (!this.inGrid() && this.grid.files.length) { this.focus(this.grid.el); return true; }
        if (this.history.length) { this.goBack(); return true; }
        if (this.loc && this.loc.place.kind === 'folder' && this.loc.path.length > 1) { this.goUp(); return true; }
        return true;
    }

    cycleSection(d) {
        const cur = this.sideItems.findIndex((it) => it.classList.contains('active'));
        const i = (cur < 0 ? 0 : cur + d + SECTIONS.length) % SECTIONS.length;
        this.activate(this.sideItems[i]);
    }

    /* ---------------- navigation ---------------- */

    cacheKey(place) { return this.app.accountKey() + '|' + JSON.stringify([place.kind, place.id || '', place.text || '', this.prefs.sort, this.prefs.dir]); }

    navigate(place, path, opts = {}) {
        if (this.loc && !opts.noHistory) { this.history.push(this.snapshot()); if (this.history.length > 50) this.history.shift(); this.future = []; }
        this.loc = { place, path };
        this.load(opts);
        this.renderChrome();
        store.setPref('last', { acc: this.app.accountKey(), place: { ...place }, path: path.slice(-12) });
    }

    snapshot() { return { place: this.loc.place, path: this.loc.path, sel: this.grid.current() && this.grid.current().id, scroll: this.grid.el.scrollTop }; }

    goBack() {
        const s = this.history.pop();
        if (!s) return;
        this.future.push(this.snapshot());
        this.loc = { place: s.place, path: s.path };
        this.load({ restoreId: s.sel });
        this.renderChrome();
    }
    goForward() {
        const s = this.future.pop();
        if (!s) return;
        this.history.push(this.snapshot());
        this.loc = { place: s.place, path: s.path };
        this.load({ restoreId: s.sel });
        this.renderChrome();
    }
    goUp() {
        const p = this.loc && this.loc.path;
        if (!p || p.length < 2 || this.loc.place.kind !== 'folder') return;
        const child = p[p.length - 1].id;
        const parent = p[p.length - 2];
        this.navigate({ kind: 'folder', id: parent.id, root: parent.id === 'root' }, p.slice(0, -1), { restoreId: child });
    }
    refresh() { this.cache.clear(); this.load({ restoreId: this.grid.current() && this.grid.current().id, force: true }); }

    async load(opts = {}) {
        const place = this.loc.place;
        if (this.loadCtrl) this.loadCtrl.abort();
        this.app.thumbs.cancelPending();
        const ctrl = this.loadCtrl = new AbortController();
        const key = this.cacheKey(place);
        const hit = !opts.force && this.cache.get(key);
        this.error = null;
        if (hit && Date.now() - hit.at < CACHE_MS) {
            this.next = hit.next;
            this.show(hit.files, opts.restoreId);
            return;
        }
        this.loading = true; this.next = '';
        this.grid.setFiles([], false);
        this.renderOverlay();
        this.renderStatus();
        try {
            const r = await this.app.source.list(place, this.prefs, '', this.app.cfg.pageSize, ctrl.signal);
            if (ctrl.signal.aborted) return;
            const files = this.sortLocal(r.files);
            this.cache.set(key, { files, next: r.next, at: Date.now() });
            this.next = r.next;
            this.loading = false;
            this.show(files, opts.restoreId);
        } catch (e) {
            if (ctrl.signal.aborted || e.code === 'cancelled') return;
            this.loading = false;
            this.error = e;
            this.app.handleError(e, true);
            this.renderOverlay();
            this.renderStatus();
        }
    }

    async loadMore() {
        if (!this.next || this.loading || this.error) return;
        const place = this.loc.place, token = this.next, ctrl = this.loadCtrl;
        this.loading = true; this.renderStatus();
        try {
            const r = await this.app.source.list(place, this.prefs, token, this.app.cfg.pageSize, ctrl && ctrl.signal);
            if (ctrl && ctrl.signal.aborted) return;
            this.next = r.next;
            const more = this.sortLocal(r.files);
            this.grid.appendFiles(more, !!r.next);
            const c = this.cache.get(this.cacheKey(place));
            if (c) { c.files = this.grid.files; c.next = r.next; }
        } catch (e) {
            if (e.code !== 'cancelled') this.app.handleError(e);
        } finally {
            this.loading = false; this.renderStatus();
        }
    }

    sortLocal(files) {
        if (this.prefs.sort !== 'type') return files;
        const dir = this.prefs.dir === 'desc' ? -1 : 1;
        return files.slice().sort((a, b) => ((b.mimeType === FOLDER) - (a.mimeType === FOLDER))
            || dir * typeLabel(a).localeCompare(typeLabel(b)) || a.name.localeCompare(b.name));
    }

    show(files, restoreId) {
        const i = restoreId ? files.findIndex((f) => f.id === restoreId) : -1;
        this.grid.setFiles(files, !!this.next);
        if (i > 0) { this.grid.index = i; this.grid.scrollToIndex(); this.grid.render(); }
        if (this.inGrid()) this.grid.setActive(true);
        this.renderOverlay();
        this.renderStatus();
        this.updateCommands();
        if (!files.length && this.inGrid()) this.focus(this.sideItems.find((it) => it.classList.contains('active')) || this.b.search);
    }

    /* ---------------- chrome ---------------- */

    renderChrome() {
        const { place, path } = this.loc;
        clear(this.crumbs);
        const sec = sectionOf(place);
        const parts = place.kind === 'folder' ? path
            : place.kind === 'search' ? [{ label: 'Search: "' + place.text + '"' }]
            : [{ label: sec ? sec.label : place.kind }];
        // long paths: the first crumb, an ellipsis, and the last three
        const shown = parts.length > 4 ? [parts[0], { ellipsis: true }].concat(parts.slice(-3)) : parts;
        shown.forEach((p, i) => {
            if (i) this.crumbs.appendChild(h('span', { class: 'crumb-sep' }, '›'));
            if (p.ellipsis) { this.crumbs.appendChild(h('span', { class: 'crumb dim' }, '…')); return; }
            const last = i === shown.length - 1;
            const c = h('button', { class: 'crumb' + (last ? ' last' : ''), type: 'button' }, p.name || p.label);
            if (p.id && !last) {
                const k = path.findIndex((x) => x.id === p.id);
                onActivate(c, () => this.navigate({ kind: 'folder', id: p.id, root: p.id === 'root' }, path.slice(0, k + 1)));
            } else c.tabIndex = -1;
            this.crumbs.appendChild(c);
        });
        this.sideItems.forEach((it) => it.classList.toggle('active', !!sec && it._section === sec));
        this.b.back.disabled = !this.history.length;
        this.b.fwd.disabled = !this.future.length;
        this.b.up.disabled = !(place.kind === 'folder' && path.length > 1);
        this.b.search.lastChild.textContent = place.kind === 'search' ? place.text : 'Search';
        this.updateCommands();
    }

    updateCommands() {
        if (!this.loc) return;
        const f = this.grid.current();
        const kind = this.loc.place.kind;
        const inFolder = kind === 'folder';
        const trash = kind === 'trash';
        const cap = (f && f.capabilities) || {};
        const B = this.b;
        B.newFolder.disabled = !inFolder;
        B.upload.disabled = !inFolder;
        B.cut.disabled = !f || trash || cap.canMoveItemWithinDrive === false;
        B.copy.disabled = !f || trash || f.mimeType === FOLDER || cap.canCopy === false;
        B.paste.disabled = !this.clip || !inFolder;
        B.rename.disabled = !f || trash || cap.canRename === false;
        B.star.disabled = !f || trash;
        B.star.querySelector('.ico').innerHTML = f && f.starred ? icon.starFill : icon.star;
        B.star.lastChild.textContent = f && f.starred ? 'Unstar' : 'Star';
        B.del.disabled = !f || (trash ? cap.canUntrash === false : cap.canTrash === false);
        B.del.querySelector('.ico').innerHTML = trash ? icon.restore : icon.trash;
        B.del.lastChild.textContent = trash ? 'Restore' : 'Delete';
        B.details.disabled = !f;
        B.paste.lastChild.textContent = this.clip ? (this.clip.mode === 'cut' ? 'Move here' : 'Paste') : 'Paste';
        // never leave the focus on a control that just became disabled
        if (this.current && this.current.disabled) this.focus(this.grid.files.length ? this.grid.el : this.b.search);
    }

    renderOverlay() {
        clear(this.overlay);
        this.overlay.className = 'content-overlay';
        if (this.loading && !this.grid.files.length) {
            this.overlay.classList.add('on');
            const sk = h('div', { class: 'skeleton' });
            for (let i = 0; i < 10; i++) sk.appendChild(h('div', { class: 'sk-tile' }));
            this.overlay.appendChild(sk);
            return;
        }
        if (this.error) {
            this.overlay.classList.add('on');
            const e = this.error;
            const reauth = e.code === 'reauth' || e.code === 'signed_out';
            const btn = h('button', { class: 'btn primary', type: 'button' }, h('span', { class: 'ico', html: reauth ? icon.link : icon.refresh }), h('span', null, reauth ? 'Link the account again' : 'Try again'));
            onActivate(btn, () => reauth ? this.app.openAccounts() : this.refresh());
            this.overlay.appendChild(h('div', { class: 'empty' }, h('div', { class: 'empty-ico', html: icon.info }),
                h('h3', null, reauth ? 'Google needs you to link this account again' : e.code === 'network' || e.code === 'timeout' ? 'No connection' : 'Something went wrong'),
                h('p', null, e.message || String(e)), btn));
            this.focus(btn);
            return;
        }
        if (!this.grid.files.length) {
            this.overlay.classList.add('on');
            const k = this.loc.place.kind;
            const text = {
                trash: ['Trash is empty', 'Deleted files stay here until Google removes them after 30 days.'],
                search: ['No results', 'Nothing MyDrive can see has this name.'],
                starred: ['No starred files', 'Press X (or hold OK) on a file and choose Star.']
            }[k] || (k === 'folder' && this.loc.path.length === 1 && !this.app.demo
                ? ['Nothing here yet', 'For your privacy MyDrive only sees files it created and files you add from your phone with "Add files". Create a folder or add files to start.']
                : ['This folder is empty', 'Use New folder or Upload to add something.']);
            const kids = [h('div', { class: 'empty-ico', html: icon.drive }), h('h3', null, text[0]), h('p', null, text[1])];
            if (k === 'folder' && !this.app.demo) {
                const add = h('button', { class: 'btn primary', type: 'button' }, h('span', { class: 'ico', html: icon.phone }), h('span', null, 'Add files from phone'));
                onActivate(add, () => this.app.openAddFiles());
                kids.push(add);
            }
            this.overlay.appendChild(h('div', { class: 'empty' }, kids));
        }
    }

    renderStatus() {
        if (!this.loc) return;
        const n = this.grid.files.length;
        const where = this.loc.place.kind === 'folder' ? this.loc.path.map((p) => p.name).join(' › ') : (sectionOf(this.loc.place) || { label: 'Search' }).label;
        this.statusLeft.textContent = `${where}   ·   ${n}${this.next ? '+' : ''} item${n === 1 ? '' : 's'}${this.loading ? '   ·   Loading…' : ''}${this.clip ? `   ·   ${this.clip.mode === 'cut' ? 'Moving' : 'Copying'} "${this.clip.file.name}"` : ''}`;
        this.updateHints();
    }

    updateHints() {
        const pad = this.app.input.hasPad();
        const hints = pad
            ? [['A', 'Open'], ['X', 'Actions'], ['Y', 'Search'], ['LB/RB', 'Sections'], ['B', 'Back']]
            : [['OK', 'Open'], ['Hold OK', 'Actions'], ['◀ ▶ ▲ ▼', 'Move']];
        clear(this.statusHints);
        hints.forEach(([k, v]) => this.statusHints.append(h('span', { class: 'key' }, k), h('span', { class: 'hint' }, v)));
    }

    /* ---------------- opening ---------------- */

    open(f, i) {
        if (!f) return;
        if (f.mimeType === FOLDER) {
            const path = this.loc.place.kind === 'folder' ? this.loc.path.concat({ id: f.id, name: f.name }) : [{ id: 'root', name: 'My Drive' }, { id: f.id, name: f.name }];
            this.navigate({ kind: 'folder', id: f.id }, path);
            return;
        }
        if (this.loc.place.kind === 'trash') { this.details(); return; }
        if (isImage(f)) { const list = this.grid.files.filter(isImage); this.app.openViewer(list, list.indexOf(f)); return; }
        if (isPlayable(f)) { const list = this.grid.files.filter(isPlayable); this.app.openPlayer(list, list.indexOf(f), this.grid.files); return; }
        this.details('This kind of file cannot be shown on a TV. Open it on a computer or phone.');
    }

    /* ---------------- file operations ---------------- */

    async run(label, fn) {
        toast(label + '…', 'info', 1500);
        try { const r = await fn(); return r; } catch (e) { this.app.handleError(e); return null; }
    }

    afterChange(focusId) {
        this.cache.clear();
        this.load({ restoreId: focusId || (this.grid.current() && this.grid.current().id), force: true });
    }

    contextMenu() {
        const f = this.grid.current();
        const B = this.b;
        const items = [];
        const add = (b, id, ic, extra = {}) => items.push(Object.assign({ id, label: b.lastChild.textContent, icon: ic, disabled: b.disabled }, extra));
        if (f && this.inGrid()) items.push({ id: 'open', label: f.mimeType === FOLDER ? 'Open' : 'Open / preview', icon: icon.forward });
        add(B.cut, 'cut', icon.cut); add(B.copy, 'copy', icon.copy, { why: f && f.mimeType === FOLDER ? 'Google Drive cannot copy folders' : '' });
        add(B.paste, 'paste', icon.paste);
        add(B.rename, 'rename', icon.rename); add(B.star, 'star', f && f.starred ? icon.starFill : icon.star);
        add(B.del, 'del', this.loc.place.kind === 'trash' ? icon.restore : icon.trash, { danger: this.loc.place.kind !== 'trash' });
        add(B.details, 'details', icon.info);
        items.push({ sep: true });
        add(B.newFolder, 'newFolder', icon.newFolder); add(B.upload, 'upload', icon.upload);
        items.push({ id: 'refresh', label: 'Refresh', icon: icon.refresh }, { id: 'sort', label: 'Sort by…', icon: icon.sort }, { id: 'view', label: 'View…', icon: icon.view });
        menu(this.app.stack, { title: f && this.inGrid() ? f.name : 'Actions', items }).then((id) => {
            if (!id) return;
            const map = { open: () => this.open(f, this.grid.index), cut: () => this.setClip('cut'), copy: () => this.setClip('copy'), paste: () => this.paste(),
                rename: () => this.rename(), star: () => this.toggleStar(), del: () => this.trashOrRestore(), details: () => this.details(),
                newFolder: () => this.newFolder(), upload: () => this.upload(), refresh: () => this.refresh(), sort: () => this.chooseSort(), view: () => this.chooseView() };
            if (map[id]) map[id]();
        });
    }

    async newFolder() {
        if (this.b.newFolder.disabled) return;
        const name = await typeText(this.app.stack, { title: 'New folder', value: 'New folder', ok: 'Create' });
        if (name == null) return;
        const parent = this.loc.place.id;
        const f = await this.run('Creating folder', () => this.app.source.createFolder(name, parent));
        if (f) { toast('Folder "' + f.name + '" created'); this.afterChange(f.id); }
    }

    async rename() {
        const f = this.grid.current();
        if (!f || this.b.rename.disabled) return;
        const name = await typeText(this.app.stack, { title: 'Rename', value: f.name, ok: 'Rename' });
        if (name == null || name === f.name) return;
        const r = await this.run('Renaming', () => this.app.source.rename(f.id, name));
        if (r) { toast('Renamed to "' + r.name + '"'); this.afterChange(r.id); }
    }

    async toggleStar() {
        const f = this.grid.current();
        if (!f || this.b.star.disabled) return;
        const r = await this.run(f.starred ? 'Removing star' : 'Starring', () => this.app.source.setStarred(f.id, !f.starred));
        if (r) {
            toast(r.starred ? 'Starred' : 'Star removed');
            this.cache.clear();
            if (this.loc.place.kind === 'starred' && !r.starred) this.afterChange(); else { this.grid.patch(r); this.updateCommands(); }
        }
    }

    async trashOrRestore() {
        const f = this.grid.current();
        if (!f || this.b.del.disabled) return;
        if (this.loc.place.kind === 'trash') {
            const r = await this.run('Restoring', () => this.app.source.untrash(f.id));
            if (r) { toast('"' + f.name + '" restored'); this.afterChange(); }
            return;
        }
        const ok = await confirm(this.app.stack, {
            title: 'Move to Trash?', ok: 'Move to Trash', danger: true,
            text: `"${f.name}"${f.mimeType === FOLDER ? ' and everything in it' : ''} will go to the Google Drive Trash. You can restore it from Trash for 30 days.`
        });
        if (!ok) return;
        const r = await this.run('Moving to Trash', () => this.app.source.trash(f.id));
        if (r) { toast('"' + f.name + '" moved to Trash'); this.afterChange(); }
    }

    setClip(mode) {
        const f = this.grid.current();
        if (!f || this.b[mode].disabled) return;
        this.clip = { mode, file: f };
        toast(mode === 'cut' ? `Go to a folder and choose "Move here"` : `Go to a folder and choose "Paste"`);
        this.updateCommands(); this.renderStatus();
    }

    async paste() {
        if (!this.clip || this.b.paste.disabled) return;
        const { mode, file } = this.clip;
        const to = this.loc.place.id;
        if (mode === 'cut' && (file.parents || []).includes(to)) { toast('It is already in this folder'); return; }
        if (mode === 'cut' && this.loc.path.some((p) => p.id === file.id)) { toast('A folder cannot be moved into itself', 'error'); return; }
        const r = await this.run(mode === 'cut' ? 'Moving' : 'Copying', () => mode === 'cut' ? this.app.source.move(file, to) : this.app.source.copy(file, to));
        if (r) {
            toast(`"${file.name}" ${mode === 'cut' ? 'moved' : 'copied'} here`);
            this.clip = null;
            this.afterChange(r.id);
        }
    }

    upload() {
        if (this.b.upload.disabled) return;
        // Needs the browser's file chooser: works on computers and phones (a click or a tap), not on TVs.
        const input = h('input', { type: 'file', multiple: true, style: { display: 'none' } });
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            input.remove();
            if (!files.length) return;
            const parent = this.loc.place.id;
            let done = 0, failed = 0;
            const card = transferCard('Uploading');
            for (const [n, file] of files.entries()) {
                const title = files.length > 1 ? `Uploading ${n + 1} of ${files.length}` : 'Uploading';
                card.set(null, file.name, formatSize(file.size), title);
                try {
                    await this.app.source.upload(file, parent, (p) => card.set(p, null, progressText(p, file.size)));
                    done++;
                } catch (e) { failed++; this.app.handleError(e); }
            }
            card.done();
            toast(failed ? `${done} uploaded, ${failed} failed` : `${done} file${done === 1 ? '' : 's'} uploaded`, failed ? 'error' : 'info');
            this.afterChange();
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => { if (!input.files || !input.files.length) toast('Uploading needs a file chooser: use MyDrive on a computer or a phone (click or tap Upload).', 'info', 5000); }, 1500);
    }

    async details(note, file) {
        const f = file || this.grid.current();
        if (!f) return;
        const lang = this.app.lang;
        const im = f.imageMediaMetadata, vm = f.videoMediaMetadata;
        const rows = [
            ['Name', f.name], ['Type', typeLabel(f) + (f.mimeType === FOLDER ? '' : '  (' + f.mimeType + ')')],
            ['Size', f.mimeType === FOLDER ? '' : formatSize(f.size)],
            ['Dimensions', im && im.width ? `${im.width} × ${im.height}` : vm && vm.width ? `${vm.width} × ${vm.height}` : ''],
            ['Duration', vm && vm.durationMillis ? Math.round(vm.durationMillis / 60000) + ' min' : ''],
            ['Modified', f.modifiedTime ? formatDate(f.modifiedTime, lang) + ' ' + new Date(f.modifiedTime).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : ''],
            ['Created', formatDate(f.createdTime, lang)],
            ['Owner', f.owners && f.owners[0] ? f.owners[0].displayName : ''],
            ['Starred', f.starred ? 'Yes' : ''],
            ['In Trash', f.trashed ? 'Yes' : ''],
            ['Location', this.loc.place.kind === 'folder' && !file ? this.loc.path.map((p) => p.name).join(' › ') : '']
        ];
        if (note) rows.unshift(['', note]);
        const actions = [];
        if (!file && !this.b.rename.disabled) actions.push({ id: 'rename', label: 'Rename', icon: icon.rename });
        const id = await infoBox(this.app.stack, { title: f.name, rows, actions });
        if (id === 'rename') this.rename();
    }

    /* ---------------- search / sort / view ---------------- */

    async search() {
        const prev = this.loc.place.kind === 'search' ? this.loc.place.text : '';
        let live = null;
        const run = (text) => {
            const t = text.trim();
            if (t.length < 2) return;
            const place = { kind: 'search', text: t.slice(0, 100) };
            if (this.loc.place.kind === 'search') { this.loc.place = place; this.load(); this.renderChrome(); }
            else this.navigate(place, []);
            live = t;
        };
        const text = await typeText(this.app.stack, {
            title: 'Search by name', value: prev, placeholder: 'Type a name…', ok: 'Search',
            onChange: (t) => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { if (t.trim() !== live) run(t); }, 600); }
        });
        clearTimeout(this.searchTimer);
        if (text == null) return;
        if (text.trim().length < 1) { if (this.loc.place.kind === 'search') this.goBack(); return; }
        if (text.trim() !== live) run(text);
        this.focus(this.grid.el);
    }

    async chooseSort() {
        const p = this.prefs;
        const opts = [['name', 'Name'], ['modified', 'Date modified'], ['type', 'Type'], ['size', 'Size']];
        const items = opts.map(([id, label]) => ({ id, label, checked: p.sort === id, focus: p.sort === id ? '1' : null }));
        items.push({ sep: true }, { id: 'asc', label: 'Ascending', checked: p.dir !== 'desc' }, { id: 'desc', label: 'Descending', checked: p.dir === 'desc' });
        const id = await menu(this.app.stack, { title: 'Sort by', items });
        if (!id) return;
        if (id === 'asc' || id === 'desc') store.setPref('dir', id); else store.setPref('sort', id);
        this.prefs = store.prefs();
        this.load({ restoreId: this.grid.current() && this.grid.current().id });
    }

    async chooseView() {
        const v = this.prefs.view;
        const id = await menu(this.app.stack, { title: 'View', items: [
            { id: 'grid', label: 'Large tiles', icon: icon.view, checked: v === 'grid' },
            { id: 'compact', label: 'Small tiles', icon: icon.view, checked: v === 'compact' },
            { id: 'list', label: 'Details list', icon: icon.list, checked: v === 'list' }] });
        if (!id) return;
        store.setPref('view', id);
        this.prefs = store.prefs();
        this.grid.setView(id);
        this.grid.scrollToIndex(); this.grid.render();
    }

    /** Account switched / profile data cleared: forget every listing. */
    resetForAccount() {
        if (this.loadCtrl) this.loadCtrl.abort();
        this.cache.clear(); this.history = []; this.future = []; this.clip = null;
        this.grid.setFiles([], false);
        this.prefs = store.prefs();
        this.onShow();
    }

    destroy() {
        if (this.loadCtrl) this.loadCtrl.abort();
        clearTimeout(this.searchTimer);
        window.removeEventListener('resize', this._onResize);
        this.grid.destroy();
    }
}
