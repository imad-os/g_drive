/* Thumbnails: fetched with the user's token (Drive thumbnail links are private and short-lived), at most
 * N at once, newest requests first, kept as blob: URLs in a small LRU that revokes what it drops. */

import { Limiter } from '../net.js';

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
            const { buf, type } = await this.source.thumbnail(file.thumbnailLink, 320, signal);
            if (signal.aborted) return '';
            const url = URL.createObjectURL(new Blob([buf], { type }));
            this.cache.set(file.id, url);
            while (this.cache.size > MAX) {
                const [k, v] = this.cache.entries().next().value;
                this.cache.delete(k); URL.revokeObjectURL(v);
            }
            return url;
        }).catch(() => { this.failed.add(file.id); return ''; })
            .finally(() => this.waiting.delete(file.id));
        this.waiting.set(file.id, p);
        return p;
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
        this.cache.forEach((u) => URL.revokeObjectURL(u));
        this.cache.clear();
        this.failed.clear();
    }
}
