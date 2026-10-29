/* MyDrive streaming worker.
 * A <video> cannot send Google's Authorization header, and Drive refuses tokens in URLs. So the player points the
 * video at ./mydrive-stream/<token>, and this worker answers every Range request the media stack makes with a
 * 206 piece that the page fetched from Drive through MyPC.net (with the header). Nothing is cached or stored:
 * pieces live only in the response. Only requests under this app's own scope are touched. */

const PREFIX = 'mydrive-stream/';
const PIECE = 2 * 1024 * 1024;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const at = url.pathname.indexOf('/' + PREFIX);
    if (url.origin !== self.location.origin || at < 0) return;
    const token = url.pathname.slice(at + PREFIX.length + 1);
    event.respondWith(serve(event, token));
});

async function pickClient(event) {
    if (event.clientId) { const c = await self.clients.get(event.clientId); if (c) return c; }
    const all = await self.clients.matchAll({ type: 'window' });
    return all[0] || null;
}

async function serve(event, token) {
    const client = await pickClient(event);
    if (!client) return new Response('No page', { status: 503 });
    const m = /bytes=(\d+)-(\d*)/.exec(event.request.headers.get('range') || '');
    const start = m ? +m[1] : 0;
    const wantEnd = m && m[2] ? +m[2] : start + PIECE - 1;
    const end = Math.min(wantEnd, start + PIECE - 1);
    const answer = await new Promise((resolve) => {
        const ch = new MessageChannel();
        const timer = setTimeout(() => resolve({ error: 'timeout' }), 65000);
        ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
        client.postMessage({ mydriveStream: 1, token, start, end }, [ch.port2]);
    });
    if (answer.error) return new Response(answer.error, { status: answer.status || 502 });
    const total = answer.total;
    const last = start + answer.buf.byteLength - 1;
    return new Response(answer.buf, {
        status: 206,
        headers: {
            'Content-Type': answer.type || 'video/mp4',
            'Content-Length': String(answer.buf.byteLength),
            'Content-Range': `bytes ${start}-${last}/${total}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
        }
    });
}
