/* Demo data (no Google account): same interface as DriveApi, kept apart from the real integration.
 * Used for "Try the demo" and for testing the controller UI without credentials. Nothing leaves the page. */

import { AppError } from '../net.js';
import { FOLDER, cleanName } from './api.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20);
const CAPS = { canRename: true, canTrash: true, canUntrash: true, canCopy: true, canMoveItemWithinDrive: true, canAddChildren: true, canDownload: true, canEdit: true };

function mk(id, name, mimeType, parent, extra = {}) {
    return Object.assign({
        id, name, mimeType, parents: [parent], starred: false, trashed: false,
        modifiedTime: new Date(NOW - (id.length * 7919 % 90) * DAY).toISOString(),
        createdTime: new Date(NOW - 200 * DAY).toISOString(),
        owners: [{ displayName: 'Demo user' }], capabilities: CAPS
    }, mimeType === FOLDER ? {} : { size: String((id.length * 104729 % 9000 + 20) * 1024) }, extra);
}

function seed() {
    const f = [];
    const folders = ['Holidays 2025', 'Family photos', 'Movies', 'Music', 'Work', 'School', 'Recipes', 'Scans'];
    folders.forEach((n, i) => f.push(mk('d' + i, n, FOLDER, 'root', { starred: i === 1 })));
    for (let i = 0; i < 160; i++) {
        const w = 1600 + (i % 5) * 320, h = 900 + (i % 3) * 300;
        f.push(mk('img' + i, `IMG_${String(2040 + i)}.jpg`, 'image/jpeg', i < 120 ? 'd0' : 'd1',
            { hasThumbnail: true, thumbnailLink: 'mock:' + i, imageMediaMetadata: { width: w, height: h }, starred: i % 37 === 0 }));
    }
    ['Big Trip.mp4', 'Birthday.mp4', 'Concert.mkv', 'Short clip.webm'].forEach((n, i) => f.push(mk('vid' + i, n,
        n.endsWith('mkv') ? 'video/x-matroska' : n.endsWith('webm') ? 'video/webm' : 'video/mp4', 'd2',
        { size: String((i + 1) * 734003200), hasThumbnail: true, thumbnailLink: 'mock:v' + i, videoMediaMetadata: { width: 1920, height: 1080, durationMillis: (i + 1) * 1530000 } })));
    f.push(mk('sub0', 'Big Trip.srt', 'application/x-subrip', 'd2'));
    ['Morning.mp3', 'Rain sounds.ogg', 'Podcast 12.m4a'].forEach((n, i) => f.push(mk('aud' + i, n, 'audio/mpeg', 'd3')));
    ['Budget 2026', 'Notes'].forEach((n, i) => f.push(mk('doc' + i, n, i ? 'application/vnd.google-apps.document' : 'application/vnd.google-apps.spreadsheet', 'd4')));
    f.push(mk('pdf0', 'Contract.pdf', 'application/pdf', 'd4'), mk('pdf1', 'Report Q3.pdf', 'application/pdf', 'd4'));
    f.push(mk('txt0', 'readme.txt', 'text/plain', 'root'), mk('zip0', 'backup.zip', 'application/zip', 'root'));
    f.push(mk('old0', 'Old draft.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'root', { trashed: true }));
    return f;
}

const svgImage = (i, w, h) => {
    const hue = (i * 47) % 360;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 160 90"><defs><linearGradient id="g" x2="1" y2="1">`
        + `<stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},60%,22%)"/></linearGradient></defs>`
        + `<rect width="160" height="90" fill="url(#g)"/><circle cx="${30 + i % 100}" cy="30" r="12" fill="hsl(${hue},80%,80%)" opacity=".8"/>`
        + `<path d="M0 90 L50 45 L80 70 L115 35 L160 90Z" fill="rgba(0,0,0,.35)"/></svg>`;
};
const enc = (s) => new TextEncoder().encode(s).buffer;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export class MockDrive {
    constructor() { this.files = seed(); this.n = 0; }

    _match(f, place) {
        const alive = !f.trashed;
        switch (place.kind) {
            case 'folder': return alive && f.parents.includes(place.id);
            case 'all': return alive;
            case 'starred': return alive && f.starred;
            case 'recent': return alive && f.mimeType !== FOLDER;
            case 'images': return alive && f.mimeType.startsWith('image/');
            case 'videos': return alive && f.mimeType.startsWith('video/');
            case 'audio': return alive && f.mimeType.startsWith('audio/');
            case 'documents': return alive && /document|spreadsheet|presentation|pdf|text\/|officedocument/.test(f.mimeType);
            case 'trash': return f.trashed;
            case 'search': return alive && f.name.toLowerCase().includes(String(place.text).toLowerCase());
            default: return false;
        }
    }

    async list(place, prefs, pageToken, pageSize) {
        await delay(250);
        const dir = prefs.dir === 'desc' ? -1 : 1;
        const key = { modified: (f) => f.modifiedTime, size: (f) => +f.size || 0 }[prefs.sort] || ((f) => f.name.toLowerCase());
        const all = this.files.filter((f) => this._match(f, place)).sort((a, b) =>
            ((b.mimeType === FOLDER) - (a.mimeType === FOLDER)) || (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0));
        const start = +pageToken || 0;
        return { files: all.slice(start, start + pageSize).map((f) => ({ ...f })), next: start + pageSize < all.length ? String(start + pageSize) : '' };
    }
    async get(id) {
        if (id === 'root') return { id: 'root', name: 'My Drive', mimeType: FOLDER, capabilities: CAPS };
        const f = this.files.find((x) => x.id === id);
        if (!f) throw new AppError('not_found', 'Not found');
        return { ...f };
    }
    _f(id) { const f = this.files.find((x) => x.id === id); if (!f) throw new AppError('not_found', 'Not found'); return f; }
    async createFolder(name, parentId) { await delay(200); const f = mk('new' + (++this.n), cleanName(name), FOLDER, parentId || 'root'); this.files.push(f); return { ...f }; }
    async rename(id, name) { await delay(200); const f = this._f(id); f.name = cleanName(name); return { ...f }; }
    async setStarred(id, v) { await delay(150); const f = this._f(id); f.starred = !!v; return { ...f }; }
    async trash(id) { await delay(200); const f = this._f(id); f.trashed = true; return { ...f }; }
    async untrash(id) { await delay(200); const f = this._f(id); f.trashed = false; return { ...f }; }
    async move(file, toId) { await delay(200); const f = this._f(file.id); f.parents = [toId]; return { ...f }; }
    async copy(file, toId) { await delay(300); const src = this._f(file.id); const f = { ...src, id: 'cp' + (++this.n), parents: [toId], name: 'Copy of ' + src.name }; this.files.push(f); return { ...f }; }
    async thumbnail(link) {
        await delay(60);
        const i = parseInt(String(link).replace(/\D/g, ''), 10) || 0;
        return { buf: enc(svgImage(i + (String(link).includes('v') ? 50 : 0), 320, 180)), type: 'image/svg+xml' };
    }
    async download(id, signal, onProgress) {
        for (let i = 1; i <= 5; i++) { await delay(120); onProgress && onProgress(i / 5); }      // so the demo shows the bar
        const f = this._f(id);
        if (f.mimeType.startsWith('image/')) {
            const i = parseInt(id.replace(/\D/g, ''), 10) || 0;
            return { buf: enc(svgImage(i, f.imageMediaMetadata.width, f.imageMediaMetadata.height)), type: 'image/svg+xml' };
        }
        if (id === 'sub0') return { buf: enc('1\n00:00:01,000 --> 00:00:04,000\nDemo subtitle\n'), type: 'text/plain' };
        throw new AppError('demo', 'The demo has no real file data.');
    }
    async range() { throw new AppError('demo', 'The demo has no real video data. Link a Google account to play your videos.'); }
    async upload() { throw new AppError('demo', 'Uploading needs a linked Google account.'); }
}
