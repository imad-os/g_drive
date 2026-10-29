/* Tiny DOM helpers. Text always goes in as text nodes (file names are user data, never HTML). */

export function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const k in attrs) {
            const v = attrs[k];
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'html') el.innerHTML = v;            // only for our own SVG icon strings
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else el.setAttribute(k, v === true ? '' : v);
        }
    }
    append(el, kids);
    return el;
}

function append(el, kids) {
    for (const k of kids) {
        if (k == null || k === false) continue;
        if (Array.isArray(k)) append(el, k);
        else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export function formatSize(bytes) {
    const n = +bytes;
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v < 10 ? v.toFixed(1) : Math.round(v)) + ' ' + u[i];
}

export function formatDate(iso, lang) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(lang || undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return iso.slice(0, 10); }
}

export function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '--:--';
    sec = Math.floor(sec);
    const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = sec % 60;
    const p = (x) => String(x).padStart(2, '0');
    return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}
