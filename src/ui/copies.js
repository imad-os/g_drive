/* Copies between Google Drive and the TV's USB drives (My PC does them: MyPC.copy, guide section 20).
 *   copyFlow(app, file)      "Copy to USB drive" (a Drive file or folder) / "Copy to Google Drive" (a USB file or folder):
 *                            a folder picker, then "If a file is already there", then My PC starts the copy.
 *   CopiesScreen             every copy of MyDrive, live (MyPC.copy.onChange), with Pause / Resume / Cancel / Clear. */

import { h, clear, formatSize } from './dom.js';
import { Dialog, menu, confirm, toast } from './layers.js';
import { icon } from './icons.js';
import { progressBar } from './progress.js';
import { typeText } from './osk.js';
import { FOLDER } from '../drive/api.js';
import { jobErrorText } from '../drive/usb.js';

const isFolder = (f) => f && f.mimeType === FOLDER;

/** Folder picker made of menus (works with the remote alone): open a folder with OK, "Copy here", "New folder", Back = up.
 * kind 'usb': the USB drives; kind 'drive': My Drive. -> { id | path, label } or null */
async function pickFolder(app, kind, title) {
    const usb = app.usb;
    let path = [];                  // [{ id, name }] (drive) or [{ path, name }] (usb)
    if (kind === 'drive') path = [{ id: 'root', name: 'My Drive' }];
    for (;;) {
        const here = path[path.length - 1];
        let folders = [], err = null;
        try {
            if (kind === 'usb' && !here) folders = await usb.listDrives();
            else if (kind === 'usb') folders = (await usb.list({ kind: 'usb', id: here.path })).files.filter(isFolder);
            else {
                const all = [];
                let token = '';
                do { const r = await app.real.list({ kind: 'folder', id: here.id }, { sort: 'name' }, token, 200); all.push(...r.files.filter(isFolder)); token = r.next; } while (token && all.length < 600);
                folders = all;
            }
        } catch (e) { err = e; }
        if (err) { app.handleError(err); return null; }
        if (kind === 'usb' && !here && !folders.length) { toast('Plug a USB drive into the TV first.', 'error', 5000); return null; }
        const where = path.map((p) => p.name).join(' › ');
        const items = [];
        if (here) {
            items.push({ id: '=here', label: 'Copy here', icon: icon.check, hint: where });
            items.push({ id: '=new', label: 'New folder', icon: icon.newFolder });
            items.push({ sep: true });
        }
        folders.forEach((f, i) => items.push({ id: String(i), label: f.name, icon: kind === 'usb' && f.drive ? icon.usb : icon.newFolder.replace(/<path d="M12 11v5M9.5 13.5h5"\/>/, ''),
            hint: f.drive && f.total ? formatSize(f.free) + ' free' : '' }));
        if (here && !folders.length) items.push({ id: '=none', label: 'No folders inside', disabled: true });
        const id = await menu(app.stack, { title, subtitle: here ? 'In: ' + where : 'Choose a USB drive', items });
        if (id == null) {                                      // Back: one folder up, or give up at the top
            if (path.length > (kind === 'drive' ? 1 : 0)) { path.pop(); continue; }
            return null;
        }
        if (id === '=here') return kind === 'usb' ? { path: here.path, label: usb.labelOf(here.path) } : { id: here.id, label: where };
        if (id === '=new') {
            const name = await typeText(app.stack, { title: 'New folder', value: 'New folder', ok: 'Create' });
            if (name == null) continue;
            try {
                const f = kind === 'usb' ? await usb.createFolder(name, here.path) : await app.real.createFolder(name, here.id);
                path.push(kind === 'usb' ? { path: f.path, name: f.name } : { id: f.id, name: f.name });
            } catch (e) { app.handleError(e); }
            continue;
        }
        const f = folders[+id];
        if (f) path.push(kind === 'usb' ? { path: f.path, name: f.name } : { id: f.id, name: f.name });
    }
}

async function askIfExists(app, file, toUsb) {
    const sub = (isFolder(file) ? 'Folders with the same name are merged. ' : '') + 'A file already there with the same size is never copied again.'
        + (toUsb ? ' Google Docs, Sheets and Slides are saved as .docx, .xlsx and .pptx files.' : '');
    return menu(app.stack, { title: 'If a file is already there', subtitle: sub, items: [
        { id: 'skip', label: 'Skip it', icon: icon.forward, hint: 'keep the one there', focus: '1' },
        { id: 'replace', label: 'Replace it', icon: icon.refresh },
        { id: 'keep', label: 'Keep both', icon: icon.copy, hint: 'name (2)' }] });
}

/** Copy a Drive file / folder to a USB drive, or a USB file / folder to Google Drive. */
export async function copyFlow(app, file) {
    if (!file || !app.usbOk) return;
    const toUsb = !file.usb;
    if (toUsb && app.demo) { toast('Copying needs your Google Drive (leave the demo first).', 'error'); return; }
    if (!toUsb && !app.signedIn()) { toast('Sign in to Google Drive first.', 'error'); return; }
    const dest = await pickFolder(app, toUsb ? 'usb' : 'drive', toUsb ? `Copy "${file.name}" to a USB drive` : `Copy "${file.name}" to Google Drive`);
    if (!dest) return;
    const how = await askIfExists(app, file, toUsb);
    if (!how) return;
    try {
        const job = toUsb ? await app.usb.toUsb([file], dest.path, how) : await app.usb.toDrive([file], dest.id, how);
        app.onJob(job);
        toast(`Copying to ${dest.label}… It goes on even if you close MyDrive. See Copies.`, 'info', 6000);
    } catch (e) { app.handleError(e); }
}

const STATE = { queued: 'Waiting', scanning: 'Listing the files…', copying: 'Copying', waiting: 'Waiting for the internet…', paused: 'Paused',
                done: 'Done', failed: 'Stopped', cancelled: 'Cancelled' };
export const jobRunning = (j) => /^(queued|scanning|copying|waiting)$/.test(j.state);

/** Every copy of MyDrive, live. */
export class CopiesScreen extends Dialog {
    constructor(app) {
        super('dlg-info dlg-copies', 'Copies');
        this.app = app;
        this.rows = new Map();          // job id -> { el, bar, info, btns }
        this.list = h('div', { class: 'copies-list', 'data-scroll': '' });
        this.panel.append(h('p', { class: 'dlg-sub' }, 'My PC does the copying. It goes on when MyDrive is closed, after a restart of the TV, and after a network cut. My PC shows its progress on the desktop.'), this.list,
            h('div', { class: 'dlg-actions' }, this.button('Close', icon.close, () => this.close(), { autofocus: '1' })));
        this.render();
        this.off = app.watchJobs((j) => this.update(j));
    }
    close(v) { if (this.off) this.off(); super.close(v); }

    render() {
        clear(this.list); this.rows.clear();
        const jobs = this.app.jobList();
        if (!jobs.length) { this.list.appendChild(h('p', { class: 'dlg-text' }, 'No copies yet. Hold OK (or Y) on a file or folder and choose "Copy to USB drive" or "Copy to Google Drive".')); return; }
        jobs.forEach((j) => this.list.appendChild(this.row(j)));
    }

    row(j) {
        const bar = progressBar();
        const head = h('div', { class: 'copy-head' }), info = h('div', { class: 'copy-info' }), btns = h('div', { class: 'copy-btns' });
        const el = h('div', { class: 'copy-row' }, h('span', { class: 'ico copy-dir', html: j.dir === 'toUsb' ? icon.usb : icon.drive }), h('div', { class: 'copy-body' }, head, bar.el, info, btns));
        const r = { el, bar, head, info, btns, state: '' };
        this.rows.set(j.id, r);
        this.fill(r, j);
        return el;
    }

    fill(r, j) {
        r.head.textContent = (j.dir === 'toUsb' ? 'To USB: ' : 'To Google Drive: ') + (j.dest && j.dest.name || '') + '   ·   ' + (STATE[j.state] || j.state);
        r.bar.set(j.state === 'scanning' || j.state === 'queued' ? null : j.progress || 0);
        const parts = [];
        if (j.files) parts.push(j.state === 'copying' && j.current ? `File ${Math.min(j.files, j.doneFiles + 1)} of ${j.files}` : `${j.doneFiles} of ${j.files} file${j.files === 1 ? '' : 's'}`);
        if (j.bytes) parts.push(`${formatSize(j.doneBytes)} of ${formatSize(j.bytes)}`);
        if (j.current && j.state === 'copying') parts.push(j.current.name);
        if (j.skipped) parts.push(`${j.skipped} skipped (already there)`);
        if (j.failed && j.failed.length) parts.push(`${j.failed.length} could not be copied: ` + j.failed.slice(0, 3).map((f) => f.name + ' (' + f.message + ')').join(', ') + (j.failed.length > 3 ? '…' : ''));
        if (j.state === 'failed') parts.unshift(jobErrorText(j));
        r.info.textContent = parts.join('   ·   ');
        if (r.state === j.state) return;                // the buttons change only with the state (keeps the focus)
        r.state = j.state;
        const hadFocus = this.current && r.btns.contains(this.current);
        clear(r.btns);
        const b = (label, ic, fn, cls) => r.btns.appendChild(this.button(label, ic, fn, { cls }));
        if (jobRunning(j)) b('Pause', icon.pause, () => this.act('pause', j));
        if (j.state === 'paused' || j.state === 'failed') b('Resume', icon.play, () => this.act('resume', j), 'primary');
        if (jobRunning(j) || j.state === 'paused') b('Cancel', icon.close, () => this.act('cancel', j), 'danger');
        if (j.state === 'done' || j.state === 'failed' || j.state === 'cancelled') b('Clear', icon.trash, () => this.act('clear', j));
        if (hadFocus || (this.current && !this.current.isConnected)) this.focus(r.btns.firstChild || this.focusables()[0]);
    }

    update(j) {
        if (!j) { this.render(); if (!this.current || !this.current.isConnected) this.focusFirst(); return; }
        const r = this.rows.get(j.id);
        if (r) this.fill(r, j); else this.render();
    }

    async act(what, j) {
        if (what === 'cancel' && !(await confirm(this.app.stack, { title: 'Cancel this copy?', text: 'What was already copied stays. A file copied halfway to the USB drive is removed.', ok: 'Cancel the copy', danger: true }))) return;
        try {
            const r = await this.app.usb[what](j.id);
            if (what === 'clear') this.app.forgetJob(j.id);
            else if (r) this.app.onJob(r);
        } catch (e) { this.app.handleError(e); }
    }
}
