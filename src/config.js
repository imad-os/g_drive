/* Owner-set settings (App Store Manager > Config, defaults in mypc-app.json). Read-only, never secret.
 * The Google client is not here any more: it is My PC's (App Store Manager > Google Drive). */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** -> the raw config object and where it came from: 'mypc' | 'url' (standalone ?app_config=) | 'none' */
export function configSource(standalone) {
    const c = (window.MyPC && MyPC.app_config) || {};
    if (!standalone) return { raw: c, from: 'mypc' };
    return Object.keys(c).length ? { raw: c, from: 'url' } : { raw: {}, from: 'none' };
}

export function readConfig(standalone) {
    const { raw: c, from } = configSource(standalone);
    const num = (v, def, min, max) => { const n = +v; return n >= min && n <= max ? Math.round(n) : def; };
    return {
        from,
        pageSize: num(c.pageSize, 100, 20, 1000),
        thumbConcurrency: num(c.thumbConcurrency, 4, 1, 8)
    };
}
