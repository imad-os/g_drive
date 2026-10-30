/* Thumbnails, at most N at once, kept in a small LRU. Drive's thumbnail links (lh3.googleusercontent.com) are
 * short-lived links that an <img> loads as they are; that server sends no CORS header, so in a browser they can
 * only be shown that way, never fetched. Links an <img> cannot load (some Google Docs previews) are fetched with
 * the user's token instead (works on the TV, where MyPC.net has no CORS limit) and kept as blob: URLs. */

import { Limiter, AppError } from '../net.js';
import { sizedThumb } from '../drive/api.js';

/** Resolves true once the image loaded (it is then in the browser's cache), false if it cannot be shown. */
function probe(url, signal) {
    return new Promise((res) => {
        const im = new Image();
        im.referrerPolicy = 'no-referrer';
        let timer;
        const end = (ok) => {
            clearTimeout(timer); im.onload = im.onerror = null;
            if (signal) signal.removeEventListener('abort', onAbort);
            if (!ok) im.removeAttribute('src');
            res(ok);
        };
        const onAbort = () => end(false);
        if (signal) signal.addEventListener('abort', onAbort);
        timer = setTimeout(() => end(false), 20000);
        im.onload = () => end(true);
        im.onerror = () => end(false);
        im.src = url;
    });
}

const MAX = 160;

export class Thumbs {
    constructor(source, concurrency) {
        this.source = source;
        this.limiter = new Limiter(concurrency);
        this.cache = new Map();       // file id -> blob URL (insertion order = LRU)
        this.waiting = new Map();     // file id -> Promise
        this.failed = new Set();
        this.ctrl = new AbortController();
        this.paused = false;
        this.noFetch = false;         // fetching with the token failed on the network (CORS in a browser): stop trying
    }
    setSource(s) { this.reset(); this.source = s; }

    /** wanted(): still on screen? (checked right before the download starts, so fast scrolling skips old tiles) */
    get(file, wanted) {
        if (!file.thumbnailLink || this.failed.has(file.id)) return Promise.resolve('');
        const hit = this.cache.get(file.id);
        if (hit) { this.cache.delete(file.id); this.cache.set(file.id, hit); return Promise.resolve(hit); }
        if (this.waiting.has(file.id)) return this.waiting.get(file.id);
        const signal = this.ctrl.signal;
        const p = this.limiter.run(async () => {
            if (signal.aborted || (wanted && !wanted())) return '';
            const url = await this.url(file.thumbnailLink, 320, signal);
            if (signal.aborted) { drop(url); return ''; }
            this.cache.set(file.id, url);
            while (this.cache.size > MAX) {
                const [k, v] = this.cache.entries().next().value;
                this.cache.delete(k); drop(v);
            }
            return url;
        }).catch(() => { this.failed.add(file.id); return ''; })
            .finally(() => this.waiting.delete(file.id));
        this.waiting.set(file.id, p);
        return p;
    }

    /** A thumbnail link at `size` px -> a URL an <img> can show: Google's link itself when it loads, else a blob: URL
     * (the caller revokes those, see drop()). */
    async url(link, size, signal) {
        if (this.source.directThumbs) {
            const direct = sizedThumb(link, size);
            if (await probe(direct, signal)) return direct;
            if (signal && signal.aborted) throw new AppError('cancelled', 'Cancelled.');
        }
        if (this.noFetch) throw new AppError('thumb', 'This preview cannot be shown here.');
        try {
            const { buf, type } = await this.source.thumbnail(link, size, signal);
            return URL.createObjectURL(new Blob([buf], { type }));
        } catch (e) {
            if (e.code === 'network') this.noFetch = true;
            throw e;
        }
    }

    /** Drop queued work (folder changed); finished thumbnails stay cached. */
    cancelPending() {
        this.ctrl.abort();
        this.ctrl = new AbortController();
        this.limiter.clear();
        this.waiting.clear();
    }

    /** Account switch / exit: nothing of the old account stays in memory. */
    reset() {
        this.cancelPending();
        this.cache.forEach(drop);
        this.cache.clear();
        this.failed.clear();
        this.noFetch = false;
    }
}

/** Frees a thumbnail URL (only blob: URLs hold memory). */
export function drop(url) { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); }
