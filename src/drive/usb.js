/* The TV's USB drives and the copies between Google Drive and them, both done by My PC (SDK API level 16, guide
 * section 20: MyPC.usb, MyPC.copy). MyDrive never reads the TV's files or moves bytes for a copy itself: it browses
 * with MyPC.usb and asks My PC to copy with MyPC.copy (which goes on after MyDrive is closed).
 * USB entries are shown in the same grid as Drive files, so they get Drive-like fields: { id: path, name, mimeType,
 * size, usb: true, path }. */

import { AppError } from '../net.js';
import { FOLDER } from './api.js';

const TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic',
    mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime', ts: 'video/mp2t', wmv: 'video/x-ms-wmv',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus',
    pdf: 'application/pdf', txt: 'text/plain', srt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', rar: 'application/x-rar',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
export function typeOfName(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return (m && TYPES[m[1].toLowerCase()]) || 'application/octet-stream';
}

const MESSAGES = {
    denied: 'You did not allow MyDrive to use the USB drives.',
    unsupported: 'USB drives need My PC on a TV.',
    gone: 'The USB drive was removed. Plug it in and press Resume.',
    full: 'The drive is full.',
    'drive-full': 'Your Google Drive is full.',
    perm: 'This TV needs a newer My PC package to use USB drives.',
    'too-big': 'FAT32 USB drives cannot hold files over 4 GB.',
    'too-many': 'Too many files in one copy (20,000 at most).',
    busy: 'Too many copies are waiting. Wait for some to finish.',
    'signed-out': 'Sign in to Google Drive first.',
    reauth: 'Google needs you to sign in to Google Drive again.',
    noconfig: 'Google Drive is not set up for My PC yet (App Store Manager > Google Drive).',
    'not-found': 'Not found. It may have been moved or deleted.',
    'bad-request': 'This place cannot be used.',
    network: 'No connection. Check the network and try again.'
};
/** My PC's error -> AppError with words for people. */
export function usbError(e) {
    if (e instanceof AppError) return e;
    const code = String((e && e.code) || 'error');
    return new AppError(code.replace(/-/g, '_'), MESSAGES[code] || (e && e.message) || 'Something went wrong.', (e && e.status) || 0);
}
/** A job's error in plain words (job.error = { code, message }). */
export function jobErrorText(job) {
    const e = job && job.error;
    if (!e) return '';
    if (e.code === 'full') return job.dir === 'toUsb' ? 'The USB drive is full.' : 'Your Google Drive is full.';
    return MESSAGES[e.code] || e.message || 'Something went wrong.';
}

/** Is it there? (a TV with My PC API 16 or newer) */
export function usbAvailable() {
    if (!(window.MyPC && MyPC.usb && MyPC.copy && MyPC.apiLevel >= 16)) return false;
    let info = null;
    try { info = MyPC.info && MyPC.info(); } catch (e) { /* before init */ }
    return !!(info && info.bridges && info.bridges.usb === 1);
}
/** On a TV whose My PC is older than API 16 (its bridges say nothing about USB): to say "Update My PC". */
export function usbNeedsUpdate() {
    if (usbAvailable()) return false;
    let info = null;
    try { info = MyPC.info && MyPC.info(); } catch (e) { /* before init */ }
    return !!(info && !info.standalone && info.bridges && info.bridges.usb === undefined && /tizen/i.test(navigator.userAgent));
}

async function call(fn) {
    try { return await fn(); } catch (e) { throw usbError(e); }
}

function entry(f) {
    return { id: f.path, path: f.path, name: f.name, usb: true, mimeType: f.dir ? FOLDER : typeOfName(f.name), size: f.dir ? undefined : String(f.size || 0),
             capabilities: { canAddChildren: !!f.dir } };
}

export class UsbSource {
    constructor() { this.drives = []; }

    /** The plugged drives, as folders. */
    async listDrives() {
        const l = await call(() => MyPC.usb.drives());
        this.drives = l || [];
        return this.drives.map((d) => ({ id: d.path, path: d.path, name: d.name, usb: true, drive: true, mimeType: FOLDER, free: d.free, total: d.total, capabilities: { canAddChildren: true } }));
    }

    /** place = { kind: 'usbroot' } | { kind: 'usb', id: path } -> { files, next } */
    async list(place) {
        if (place.kind === 'usbroot') return { files: await this.listDrives(), next: '' };
        const l = await call(() => MyPC.usb.list(place.id));
        return { files: (l || []).map(entry), next: '' };
    }

    async createFolder(name, parentPath) {
        const r = await call(() => MyPC.usb.createFolder(parentPath, name));
        return { id: r.path, path: r.path, name: r.name, usb: true, mimeType: FOLDER, capabilities: { canAddChildren: true } };
    }

    /** A drive's name for a path ("USB A1 › Photos"). */
    labelOf(path) {
        const d = this.drives.find((x) => path === x.path || path.indexOf(x.path + '/') === 0);
        return d ? d.name + path.slice(d.path.length).split('/').join(' › ') : path;
    }

    /* ---- copies (My PC does them) ---- */
    toUsb(files, folderPath, ifExists) { return call(() => MyPC.copy.toUsb(files.map((f) => f.id), folderPath, { ifExists })); }
    toDrive(entries, folderId, ifExists) { return call(() => MyPC.copy.toDrive(entries.map((f) => f.path), folderId || 'root', { ifExists })); }
    jobs() { return call(() => MyPC.copy.jobs()); }
    pause(id) { return call(() => MyPC.copy.pause(id)); }
    resume(id) { return call(() => MyPC.copy.resume(id)); }
    cancel(id) { return call(() => MyPC.copy.cancel(id)); }
    clear(id) { return call(() => MyPC.copy.clear(id)); }
    onChange(fn) { return MyPC.copy.onChange(fn); }
}
