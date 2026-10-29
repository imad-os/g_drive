/* Page side of the streaming worker (public/sw.js): turns its Range questions into Drive range downloads. */

const streams = new Map();     // random token -> { file, source }
let ready = null;
let source = null;

function onMessage(e) {
    const d = e.data;
    if (!d || d.mydriveStream !== 1 || !e.ports[0]) return;
    const port = e.ports[0];
    const s = streams.get(d.token);
    if (!s) { port.postMessage({ error: 'gone', status: 404 }); return; }
    const size = +s.file.size || 0;
    const end = size ? Math.min(d.end, size - 1) : d.end;
    if (size && d.start >= size) { port.postMessage({ error: 'range', status: 416 }); return; }
    s.source.range(s.file.id, d.start, end, s.ctrl.signal).then(
        (r) => port.postMessage({ buf: r.buf, total: r.total || size, type: s.file.mimeType }, [r.buf]),
        (err) => { s.lastError = err; port.postMessage({ error: err.code || 'error', status: err.status || 502 }); });
}

/** Registers the worker once. Resolves true when streaming is possible in this browser. */
export function initStreaming() {
    if (ready) return ready;
    if (!('serviceWorker' in navigator)) return (ready = Promise.resolve(false));
    navigator.serviceWorker.addEventListener('message', onMessage);
    ready = navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            if (navigator.serviceWorker.controller) return true;
            // first visit: the worker claims the page a moment after activating
            return new Promise((res) => {
                const t = setTimeout(() => res(!!navigator.serviceWorker.controller), 3000);
                navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); res(true); }, { once: true });
            });
        })
        .catch(() => false);
    return ready;
}

export function setStreamSource(s) { source = s; }

/** A same-origin URL the <video> can play with Range requests; close() forgets it. */
export function openStream(file) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    const entry = { file, source, ctrl: new AbortController(), lastError: null };
    streams.set(token, entry);
    return {
        url: './mydrive-stream/' + token,
        lastError: () => entry.lastError,
        close() { entry.ctrl.abort(); streams.delete(token); }
    };
}

export function closeAllStreams() { streams.forEach((s) => s.ctrl.abort()); streams.clear(); }
