/* Google OAuth 2.0 for TVs and limited-input devices (the "device authorization grant").
 * https://developers.google.com/identity/protocols/oauth2/limited-input-device
 * The TV shows a code; the user approves on a phone or computer; the TV receives an access token
 * (1 h) and a refresh token. Only the refresh token is persisted (by accounts.js, in My PC save data). */

import { request, formBody, AppError } from '../net.js';
import { SCOPES } from '../config.js';

const DEVICE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

function oauthError(r) {
    const b = r.body && typeof r.body === 'object' ? r.body : {};
    const code = b.error || ('http_' + r.status);
    return new AppError(code, b.error_description || code, r.status);
}

/** Step 1: ask Google for a user code. -> { deviceCode, userCode, url, expiresAt, interval } */
export async function startDeviceFlow(cfg, signal) {
    const r = await request(DEVICE_URL, {
        method: 'POST', headers: FORM, responseType: 'json', signal,
        body: formBody({ client_id: cfg.tvClientId, scope: SCOPES })
    });
    if (!r.ok) throw oauthError(r);
    const b = r.body;
    return {
        deviceCode: b.device_code,
        userCode: b.user_code,
        url: b.verification_url || b.verification_uri || 'https://www.google.com/device',
        expiresAt: Date.now() + (b.expires_in || 1800) * 1000,
        interval: Math.max(5, b.interval || 5)
    };
}

/** Step 2: poll until the user approves. Resolves the token response; rejects with access_denied / expired_token / cancelled. */
export async function pollDeviceFlow(cfg, flow, signal) {
    let interval = flow.interval;
    for (;;) {
        await new Promise((res, rej) => {
            const t = setTimeout(res, interval * 1000);
            if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new AppError('cancelled', 'Cancelled.')); }, { once: true });
        });
        if (Date.now() > flow.expiresAt) throw new AppError('expired_token', 'The code expired.');
        const r = await request(TOKEN_URL, {
            method: 'POST', headers: FORM, responseType: 'json', signal,
            body: formBody({
                client_id: cfg.tvClientId, client_secret: cfg.tvClientSecret,
                device_code: flow.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
        });
        if (r.ok) return tokenResult(r.body);
        const e = oauthError(r);
        if (e.code === 'authorization_pending') continue;
        if (e.code === 'slow_down') { interval += 5; continue; }
        throw e;
    }
}

/** Refresh an access token. Rejects with code 'invalid_grant' when the refresh token is expired or revoked. */
export async function refreshAccessToken(cfg, refreshToken, signal) {
    const r = await request(TOKEN_URL, {
        method: 'POST', headers: FORM, responseType: 'json', signal,
        body: formBody({ client_id: cfg.tvClientId, client_secret: cfg.tvClientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
    });
    if (!r.ok) throw oauthError(r);
    return tokenResult(r.body);
}

/** Revoke the grant (a refresh token revokes the whole grant). Best effort: a token Google no longer knows is fine. */
export async function revoke(token) {
    try { await request(REVOKE_URL, { method: 'POST', headers: FORM, body: formBody({ token }) }); } catch (e) { /* offline: the save is still removed */ }
}

function tokenResult(b) {
    return {
        accessToken: b.access_token,
        refreshToken: b.refresh_token || '',          // only on the first grant
        expiresAt: Date.now() + ((b.expires_in || 3600) - 60) * 1000,
        scope: b.scope || '',
        identity: b.id_token ? decodeIdToken(b.id_token) : null
    };
}

/** The id_token comes straight from Google's token endpoint over TLS, so reading its claims without verifying the signature is fine. */
function decodeIdToken(jwt) {
    try {
        const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(atob(p).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const c = JSON.parse(json);
        return { id: String(c.sub || ''), email: c.email || '', name: c.name || c.email || '', picture: c.picture || '' };
    } catch (e) { return null; }
}
