/* Owner-set settings (App Store Manager > Config, defaults in mypc-app.json). Read-only, never secret. */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function str(v) { return typeof v === 'string' ? v.trim() : ''; }
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/* Standalone testing (the page opened in a browser, outside My PC): a config pasted in "Test config" is kept in
 * this browser's localStorage and used when the address has no ?app_config=. Inside My PC it is never read. */
const TEST_KEY = 'mydrive_test_config';
export function testConfig() {
    try { const o = JSON.parse(localStorage.getItem(TEST_KEY) || 'null'); return isObj(o) ? o : null; } catch (e) { return null; }
}
export function setTestConfig(o) {
    try { if (o) localStorage.setItem(TEST_KEY, JSON.stringify(o)); else localStorage.removeItem(TEST_KEY); return true; } catch (e) { return false; }
}
/** Parses what the user pasted; throws an Error with a readable message. Same rules as the App Store Manager. */
export function parseConfigText(text) {
    const t = String(text || '').trim();
    if (!t) return {};
    let o;
    try { o = JSON.parse(t); } catch (e) { throw new Error('Not valid JSON: ' + e.message); }
    if (!isObj(o)) throw new Error('The config must be a JSON object: { ... }');
    if (JSON.stringify(o).length > 8000) throw new Error('Too long: 8000 characters at most.');
    return o;
}

/** -> the raw config object and where it came from: 'mypc' | 'url' | 'test' | 'none' */
export function configSource(standalone) {
    const c = (window.MyPC && MyPC.app_config) || {};
    if (!standalone) return { raw: c, from: 'mypc' };
    if (Object.keys(c).length) return { raw: c, from: 'url' };
    const t = testConfig();
    return t ? { raw: t, from: 'test' } : { raw: {}, from: 'none' };
}

export function readConfig(standalone) {
    const { raw: c, from } = configSource(standalone);
    const g = isObj(c.google) ? c.google : {};
    const num = (v, def, min, max) => { const n = +v; return n >= min && n <= max ? Math.round(n) : def; };
    return {
        from,
        tvClientId: str(g.tvClientId),
        // A "TVs and Limited Input devices" client: Google treats its secret as non-confidential (installed app).
        tvClientSecret: str(g.tvClientSecret),
        pickerClientId: str(g.pickerClientId),
        pickerApiKey: str(g.pickerApiKey),
        projectNumber: str(g.projectNumber),
        pageSize: num(c.pageSize, 100, 20, 1000),
        thumbConcurrency: num(c.thumbConcurrency, 4, 1, 8)
    };
}

// Least privilege that works with Google's device flow (it refuses the broad `drive` scope).
export const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
