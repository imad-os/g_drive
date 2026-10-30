/* Google Drive API v3 over MyPC.net. Every call carries the active account's bearer token in a header,
 * never in a URL. https://developers.google.com/drive/api/reference/rest/v3 */

import { requestRetry, AppError } from '../net.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,size,modifiedTime,createdTime,starred,trashed,parents,hasThumbnail,thumbnailLink,fileExtension,'
    + 'imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis),owners(displayName),'
    + 'capabilities(canRename,canTrash,canUntrash,canCopy,canMoveItemWithinDrive,canAddChildren,canDownload,canEdit)';

export function escapeQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/** Validates a name typed by the user before it is sent. */
export function cleanName(name) {
    const n = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!n) throw new AppError('bad_name', 'The name cannot be empty.');
    if (n.length > 255) throw new AppError('bad_name', 'The name is too long (255 characters at most).');
    return n;
}

const DOC_Q = "(mimeType contains 'application/vnd.google-apps.document' or mimeType contains 'application/vnd.google-apps.spreadsheet'"
    + " or mimeType contains 'application/vnd.google-apps.presentation' or mimeType = 'application/pdf' or mimeType contains 'text/'"
    + " or mimeType contains 'officedocument' or mimeType contains 'msword' or mimeType contains 'ms-excel' or mimeType contains 'ms-powerpoint')";

/** A place in Drive -> files.list parameters. place = { kind, id?, text? } */
export function placeQuery(place, prefs) {
    const alive = 'trashed = false';
    let q, orderBy = sortOrder(prefs);
    switch (place.kind) {
        case 'folder': q = `'${escapeQ(place.id)}' in parents and ${alive}`; break;
        case 'all': q = alive; break;                                  // everything MyDrive may see, wherever it lives
        case 'starred': q = `starred = true and ${alive}`; break;
        case 'recent': q = `mimeType != '${FOLDER}' and ${alive}`; orderBy = 'recency desc'; break;
        case 'images': q = `mimeType contains 'image/' and ${alive}`; break;
        case 'videos': q = `mimeType contains 'video/' and ${alive}`; break;
        case 'audio': q = `mimeType contains 'audio/' and ${alive}`; break;
        case 'documents': q = `${DOC_Q} and ${alive}`; break;
        case 'trash': q = 'trashed = true'; break;
        case 'search': q = `name contains '${escapeQ(place.text)}' and ${alive}`; break;
        default: throw new AppError('bad_place', 'Unknown place ' + place.kind);
    }
    return { q, orderBy };
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

/** Google's thumbnail links end in =s<px>: ask for the size we show. */
export function sizedThumb(link, size) { return String(link).replace(/=s\d+$/, '') + '=s' + size; }

export class DriveApi {
    constructor(accounts) { this.accounts = accounts; }
    /** Thumbnail links can be loaded by an <img> as they are (no token, no CORS check). */
    get directThumbs() { return true; }

    async call(url, opts = {}, retried = false) {
        const token = await this.accounts.token();
        const { tries, ...o } = opts;
        const headers = Object.assign({ Authorization: 'Bearer ' + token }, o.headers || {});
        const r = await requestRetry(url, Object.assign({ responseType: 'json', timeout: 30000 }, o, { headers }), tries);
        if (r.status === 401 && !retried) { this.accounts.invalidate(); return this.call(url, opts, true); }
        if (r.status === 403 && /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(JSON.stringify(r.body || ''))) throw this.accounts.markNoDrive();
        if (r.status === 403 && !retried && /rateLimit/i.test(JSON.stringify(r.body || ''))) {
            await new Promise((res) => setTimeout(res, 1500));
            return this.call(url, opts, true);
        }
        if (r.status >= 200 && r.status < 300) return r;
        throw apiError(r);
    }

    async list(place, prefs, pageToken, pageSize, signal) {
        const { q, orderBy } = placeQuery(place, prefs);
        const p = new URLSearchParams({ q, orderBy, pageSize: String(pageSize), fields: `nextPageToken,files(${FIELDS})`, spaces: 'drive' });
        if (pageToken) p.set('pageToken', pageToken);
        const r = await this.call(`${API}/files?${p}`, { signal });
        return { files: r.body.files || [], next: r.body.nextPageToken || '' };
    }

    async get(id, signal) {
        if (id === 'root') return { id: 'root', name: 'My Drive', mimeType: FOLDER, capabilities: { canAddChildren: true } };
        return (await this.call(`${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}`, { signal })).body;
    }

    async createFolder(name, parentId) {
        return (await this.call(`${API}/files?fields=${encodeURIComponent(FIELDS)}`, {
            method: 'POST', json: { name: cleanName(name), mimeType: FOLDER, parents: [parentId || 'root'] }
        })).body;
    }

    update(id, meta, extra = '') {
        return this.call(`${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}${extra}`, { method: 'PATCH', json: meta })
            .then((r) => r.body);
    }
    rename(id, name) { return this.update(id, { name: cleanName(name) }); }
    setStarred(id, v) { return this.update(id, { starred: !!v }); }
    trash(id) { return this.update(id, { trashed: true }); }
    untrash(id) { return this.update(id, { trashed: false }); }
    move(file, toId) {
        const from = (file.parents || []).map(encodeURIComponent).join(',');
        return this.update(file.id, {}, `&addParents=${encodeURIComponent(toId)}${from ? '&removeParents=' + from : ''}`);
    }
    async copy(file, toId) {
        return (await this.call(`${API}/files/${encodeURIComponent(file.id)}/copy?fields=${encodeURIComponent(FIELDS)}`, {
            method: 'POST', json: { name: file.name, parents: [toId] }
        })).body;
    }

    /** Bytes [start, end] of a file (end inclusive). -> { buf, total, type } */
    async range(id, start, end, signal) {
        const r = await this.call(`${API}/files/${encodeURIComponent(id)}?alt=media&acknowledgeAbuse=false`, {
            headers: { Range: `bytes=${start}-${end}` }, responseType: 'arraybuffer', timeout: 60000, signal
        });
        const cr = /\/(\d+)\s*$/.exec(r.headers['content-range'] || '');
        return { buf: r.body, total: cr ? +cr[1] : 0, type: r.headers['content-type'] || '' };
    }

    /** A whole (small) file, in 1 MB ranges so onProgress(0..1) can follow it. */
    async download(id, signal, onProgress) {
        const PIECE = 1024 * 1024;
        let out = null, got = 0, type = '';
        for (;;) {
            let r;
            try { r = await this.range(id, got, got + PIECE - 1, signal); }
            catch (e) { if (e.code === 'range' && !got) return { buf: new ArrayBuffer(0), type }; throw e; }   // an empty file
            type = type || r.type;
            const piece = new Uint8Array(r.buf);
            if (!r.total) { onProgress && onProgress(1); return { buf: r.buf, type }; }                      // the whole file came at once
            if (!out) out = new Uint8Array(r.total);
            out.set(piece.subarray(0, Math.max(0, Math.min(piece.length, r.total - got))), got);
            got += piece.length;
            onProgress && onProgress(Math.min(1, got / r.total));
            if (got >= r.total || !piece.length) return { buf: out.buffer, type };
        }
    }

    /** A Drive thumbnail fetched with the token (used when the screen cannot load Google's link itself). One try:
     * in a browser this fails on CORS every time, so retrying only repeats the error. */
    async thumbnail(link, size, signal) {
        const r = await this.call(sizedThumb(link, size), { responseType: 'arraybuffer', timeout: 20000, signal, tries: 1 });
        return { buf: r.body, type: r.headers['content-type'] || 'image/jpeg' };
    }

    /** Resumable upload in 2 MB pieces (a multiple of 256 KB, as Google asks), so onProgress(0..1) moves often. */
    async upload(file, parentId, onProgress, signal) {
        const init = await this.call(`${UPLOAD}?uploadType=resumable&fields=${encodeURIComponent(FIELDS)}`, {
            method: 'POST', signal,
            headers: { 'X-Upload-Content-Type': file.type || 'application/octet-stream', 'X-Upload-Content-Length': String(file.size) },
            json: { name: cleanName(file.name), parents: [parentId || 'root'] }
        });
        const session = init.headers.location;
        if (!session) throw new AppError('upload', 'Google did not open an upload session.');
        const CHUNK = 2 * 1024 * 1024;
        let at = 0;
        for (;;) {
            const end = Math.min(file.size, at + CHUNK);
            const token = await this.accounts.token();
            const r = await requestRetry(session, {
                method: 'PUT', signal, responseType: 'json', timeout: 120000,
                headers: { Authorization: 'Bearer ' + token, 'Content-Range': `bytes ${at}-${end - 1}/${file.size || '*'}` },
                body: file.slice(at, end)
            });
            if (r.status === 200 || r.status === 201) { onProgress && onProgress(1); return r.body; }
            if (r.status !== 308) throw apiError(r);
            const m = /bytes=0-(\d+)/.exec(r.headers.range || '');
            at = m ? +m[1] + 1 : end;
            onProgress && onProgress(at / file.size);
        }
    }
}

function apiError(r) {
    const e = r.body && r.body.error ? r.body.error : {};
    const reason = (e.errors && e.errors[0] && e.errors[0].reason) || '';
    const msg = e.message || ('HTTP ' + r.status);
    if (r.status === 401) return new AppError('reauth', 'Google refused the sign-in. Link the account again.', 401);
    if (r.status === 403 && /insufficient|appNotAuthorized|forbidden/i.test(reason + msg)) return new AppError('permission', 'MyDrive is not allowed to do this with this file.', 403);
    if (r.status === 403 && /quota|limit/i.test(reason)) return new AppError('quota', 'Google Drive is busy (quota). Try again in a minute.', 403);
    if (r.status === 404) return new AppError('not_found', 'This file no longer exists or MyDrive cannot see it.', 404);
    if (r.status === 416) return new AppError('range', 'This file cannot be streamed.', 416);
    return new AppError('http', msg, r.status);
}
