/* Small shared helpers: MyDrive's error type and a concurrency limiter. MyDrive sends no web requests of its own:
 * every Google Drive request goes through My PC (MyPC.drive, guide section 19). */

export class AppError extends Error {
    constructor(code, message, status) { super(message); this.code = code; this.status = status || 0; }
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
