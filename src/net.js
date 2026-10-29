/* All web requests go through MyPC.net (guide section 14): no CORS limit on the TV, nothing of our own. */

export class AppError extends Error {
    constructor(code, message, status) { super(message); this.code = code; this.status = status || 0; }
}

export function netAvailable() {
    return !!(window.MyPC && MyPC.net && MyPC.apiLevel >= 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request. opts: MyPC.net options plus { signal } (an AbortSignal). Resolves { ok, status, headers, body }. */
export function request(url, opts = {}) {
    if (!netAvailable()) return Promise.reject(new AppError('unsupported', 'This My PC is too old for web requests.'));
    const { signal, ...rest } = opts;
    if (signal && signal.aborted) return Promise.reject(new AppError('cancelled', 'Cancelled.'));
    const req = MyPC.net.fetch(url, rest);
    let onAbort;
    if (signal) { onAbort = () => { try { req.abort(); } catch (e) { /* already done */ } }; signal.addEventListener('abort', onAbort); }
    return Promise.resolve(req).then(
        (r) => { if (signal) signal.removeEventListener('abort', onAbort); return r; },
        (e) => {
            if (signal) signal.removeEventListener('abort', onAbort);
            throw new AppError((e && e.code) || 'network', (e && e.message) || 'Network error', e && e.status);
        });
}

/** request() with retries on network errors, 429 and 5xx (exponential backoff with jitter). */
export async function requestRetry(url, opts = {}, tries = 3) {
    let wait = 600;
    for (let i = 0; ; i++) {
        try {
            const r = await request(url, opts);
            if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await sleep(wait + Math.random() * 300); wait *= 2; continue; }
            return r;
        } catch (e) {
            if (e.code === 'cancelled' || e.code === 'blocked' || e.code === 'unsupported' || i >= tries - 1) throw e;
            await sleep(wait + Math.random() * 300); wait *= 2;
        }
    }
}

/** Limits how many tasks run at once (thumbnails, ranges). */
export class Limiter {
    constructor(max) { this.max = max; this.running = 0; this.queue = []; }
    run(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this._next();
        });
    }
    clear() { const q = this.queue; this.queue = []; q.forEach((t) => t.reject(new AppError('cancelled', 'Cancelled.'))); }
    _next() {
        while (this.running < this.max && this.queue.length) {
            const t = this.queue.shift();
            this.running++;
            Promise.resolve().then(t.fn).then(t.resolve, t.reject).finally(() => { this.running--; this._next(); });
        }
    }
}

export function formBody(obj) {
    return Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== '')
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
}
