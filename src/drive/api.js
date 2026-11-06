/* Google Drive through My PC (MyPC.drive, SDK API level 14, guide section 19). My PC owns the Google sign-in and sends
 * every Drive request for MyDrive: this file holds no token, client ID or Google address, it only adapts MyPC.drive to
 * the calls MyDrive's screens make (the same ones as the demo in mock.js). */

import { AppError } from '../net.js';

export const FOLDER = 'application/vnd.google-apps.folder';
const WORKER = 'sw.js';                         // public/sw.js imports My PC's drive-sw.js (Range streaming)
const BLOB_MAX = 64 * 1024 * 1024;              // without the worker: small files only, as one blob

/** Validates a name typed by the user before it is sent. */
export function cleanName(name) {
    const n = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!n) throw new AppError('bad_name', 'The name cannot be empty.');
    if (n.length > 255) throw new AppError('bad_name', 'The name is too long (255 characters at most).');
    return n;
}

/** Google's thumbnail links end in =s<px>: ask for the size we show. */
export function sizedThumb(link, size) { return String(link).replace(/=s\d+$/, '') + '=s' + size; }

/** Is My PC's Google Drive there? (API 14 and the drive bridge; standalone the SDK runs it in the page.) */
export function driveAvailable() {
    if (!(window.MyPC && MyPC.drive && MyPC.apiLevel >= 14)) return false;
    let info = null;
    try { info = MyPC.info && MyPC.info(); } catch (e) { /* standalone, before init */ }
    return !(info && info.bridges && info.bridges.drive === false);
}

const MESSAGES = {
    'signed-out': ['signed_out', 'Sign in to Google Drive first.'],
    reauth: ['reauth', 'Google needs you to sign in to Google Drive again.'],
    denied: ['denied', 'You did not allow MyDrive to use your Google Drive.'],
    noconfig: ['noconfig', 'Google Drive is not set up for My PC yet (App Store Manager > Google Drive).'],
    'not-found': ['not_found', 'This file no longer exists or MyDrive cannot see it.'],
    permission: ['permission', 'Google Drive does not allow this with this file.'],
    quota: ['quota', 'Google Drive is busy. Try again in a minute.'],
    'too-big': ['too_big', 'This file is too big to open here.'],
    'bad-request': ['bad_request', ''],
    network: ['network', 'No connection to Google Drive. Check the network and try again.'],
    timeout: ['timeout', 'Google Drive did not answer in time. Try again.'],
    cancelled: ['cancelled', 'Cancelled.'],
    busy: ['busy', 'Too many things at once. Try again.'],
    'not-running': ['cancelled', 'Cancelled.'],
    unsupported: ['unsupported', 'This My PC is too old for Google Drive. Update My PC (Control Panel > Update).']
};

/** My PC's error ({ code, message, status }) -> MyDrive's AppError with a message for people. */
export function driveError(e) {
    if (e instanceof AppError) return e;
    const code = String((e && e.code) || 'error');
    const m = MESSAGES[code];
    return new AppError(m ? m[0] : code.replace(/-/g, '_'), (m && m[1]) || (e && e.message) || 'Something went wrong.', (e && e.status) || 0);
}

/** A MyPC.drive call that an AbortSignal can stop, with MyDrive's errors. */
function run(make, signal) {
    if (signal && signal.aborted) return Promise.reject(new AppError('cancelled', 'Cancelled.'));
    let p;
    try { p = make(); } catch (e) { return Promise.reject(driveError(e)); }
    const stop = () => { try { if (p.abort) p.abort(); } catch (e) { /* already done */ } };
    if (signal) signal.addEventListener('abort', stop, { once: true });
    return Promise.resolve(p).then(
        (r) => { if (signal) signal.removeEventListener('abort', stop); return r; },
        (e) => { if (signal) signal.removeEventListener('abort', stop); throw signal && signal.aborted ? new AppError('cancelled', 'Cancelled.') : driveError(e); });
}

function sortOrder(p) {
    const desc = p.dir === 'desc' ? ' desc' : '';
    switch (p.sort) {
        case 'modified': return 'folder,modifiedTime' + desc;
        case 'size': return 'folder,quotaBytesUsed' + desc;
        case 'type': return 'folder,name_natural';            // type is sorted on the client (Drive cannot)
        default: return 'folder,name_natural' + desc;
    }
}

/** A place in MyDrive (place = { kind, id?, text? }) -> MyPC.drive.list options. */
export function listOptions(place, prefs) {
    const o = { orderBy: place.kind === 'recent' ? 'recency desc' : sortOrder(prefs || {}) };
    if (place.kind === 'folder') o.folder = place.id;
    else if (place.kind === 'search') o.search = place.text;
    else o.place = place.kind;                                // all starred recent images videos audio documents trash
    return o;
}

export class DriveApi {
    /** Thumbnail links can be loaded by an <img> as they are (no token, no CORS check). */
    get directThumbs() { return true; }

    async list(place, prefs, pageToken, pageSize, signal) {
        const o = Object.assign(listOptions(place, prefs), { pageSize: pageSize || 100 });
        if (pageToken) o.pageToken = pageToken;
        const r = await run(() => MyPC.drive.list(o), signal);
        return { files: (r && r.files) || [], next: (r && r.next) || '' };
    }

    get(id, signal) {
        if (id === 'root') return Promise.resolve({ id: 'root', name: 'My Drive', mimeType: FOLDER, capabilities: { canAddChildren: true } });
        return run(() => MyPC.drive.get(id), signal);
    }

    createFolder(name, parentId) { const n = cleanName(name); return run(() => MyPC.drive.createFolder(n, parentId || 'root')); }
    rename(id, name) { const n = cleanName(name); return run(() => MyPC.drive.rename(id, n)); }
    setStarred(id, v) { return run(() => MyPC.drive.star(id, !!v)); }
    trash(id) { return run(() => MyPC.drive.trash(id)); }
    untrash(id) { return run(() => MyPC.drive.restore(id)); }
    move(file, toId) { return run(() => MyPC.drive.move(file.id, toId)); }
    copy(file, toId) { return run(() => MyPC.drive.copy(file.id, toId, file.name)); }

    /** Bytes [start, end] of a file (end inclusive). -> { buf, total, type } */
    range(id, start, end, signal) { return run(() => MyPC.drive.read(id, start, end), signal); }

    /** A whole (small) file. -> { buf, type } */
    download(id, signal, onProgress, max) {
        return run(() => MyPC.drive.download(id, { onProgress, max }), signal);
    }

    thumbnail(link, size, signal) { return run(() => MyPC.drive.thumbnail(link, size), signal); }

    upload(file, parentId, onProgress, signal) {
        const name = cleanName(file.name);
        return run(() => MyPC.drive.upload({ name, data: file, type: file.type || 'application/octet-stream', parent: parentId || 'root' }, { onProgress }), signal);
    }

    /** An address the <video> / <audio> plays: Range pieces through sw.js (seeking works), else a blob of a small file.
     * -> { url, mode, lastError(), close() } */
    async stream(file, onProgress) {
        const s = await run(() => MyPC.drive.stream(file, { worker: WORKER, onProgress, max: BLOB_MAX }));
        return { url: s.url, mode: s.mode, close: () => s.close(), lastError: () => { const e = s.lastError && s.lastError(); return e ? driveError(e) : null; } };
    }
}
