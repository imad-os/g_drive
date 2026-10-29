/* Owner-set settings (App Store Manager > Config, defaults in mypc-app.json). Read-only, never secret. */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

export function readConfig() {
    const c = (window.MyPC && MyPC.app_config) || {};
    const g = c.google && typeof c.google === 'object' ? c.google : {};
    const num = (v, def, min, max) => { const n = +v; return n >= min && n <= max ? Math.round(n) : def; };
    return {
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
