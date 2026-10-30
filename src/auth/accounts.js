/* Google accounts of the current My PC profile.
 * Persisted per profile in My PC save data (store.js): identity + refresh token, so a profile that links
 * Drive on one device finds it linked on every device it signs in on. Access tokens stay in memory only. */

import { store } from '../store.js';
import { refreshAccessToken, revoke } from './oauth.js';
import { AppError } from '../net.js';
import { hasDriveScope, NO_DRIVE_MSG } from '../config.js';

export class Accounts {
    constructor(cfg) {
        this.cfg = cfg;
        this.tokens = new Map();      // account id -> { accessToken, expiresAt }
        this.pending = new Map();     // account id -> Promise (one refresh at a time)
        this.listeners = new Set();
    }

    configured() { return !!(this.cfg.tvClientId && this.cfg.tvClientSecret); }
    list() { return store.accounts(); }
    active() {
        const id = store.activeId();
        return (id && store.account(id)) || null;
    }
    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    _emit() { this.listeners.forEach((fn) => fn(this.active())); }

    /** A finished device flow -> saved account (merged with an existing one of the same Google id). */
    addFromGrant(grant) {
        const who = grant.identity;
        if (!who || !who.id) throw new AppError('identity', 'Google did not say which account was linked.');
        const old = store.account(who.id);
        const refreshToken = grant.refreshToken || (old && old.refreshToken) || '';
        if (!refreshToken) throw new AppError('no_refresh', 'Google did not return a refresh token.');
        if (grant.scope && !hasDriveScope(grant.scope)) {
            // only name / e-mail were allowed: useless for a Drive explorer, so give the grant back and say why
            revoke(grant.refreshToken || grant.accessToken);
            throw new AppError('scope_missing', NO_DRIVE_MSG);
        }
        store.putAccount({ ...who, refreshToken, scope: grant.scope, addedAt: Date.now(), needsReauth: false });
        this.tokens.set(who.id, { accessToken: grant.accessToken, expiresAt: grant.expiresAt });
        store.setActive(who.id);
        this._emit();
        return store.account(who.id);
    }

    switchTo(id) {
        if (!store.account(id)) return;
        store.setActive(id);
        this._emit();
    }

    /** Removes the account from this profile and revokes Google's grant (all devices of this profile lose it). */
    async disconnect(id, { revokeGrant = true } = {}) {
        const acc = store.account(id);
        if (!acc) return;
        this.tokens.delete(id);
        store.removeAccount(id);
        if (revokeGrant && acc.refreshToken) await revoke(acc.refreshToken);
        const rest = store.accounts();
        if (!store.activeId() && rest.length) store.setActive(rest[0].id);
        this._emit();
    }

    /** A valid access token of the active account, refreshed when needed. Rejects with code 'reauth' when the user must link again. */
    async token(force = false) {
        const acc = this.active();
        if (!acc) throw new AppError('signed_out', 'No Google account is linked.');
        const t = this.tokens.get(acc.id);
        if (!force && t && t.expiresAt > Date.now()) return t.accessToken;
        if (acc.needsReauth || !acc.refreshToken) throw new AppError('reauth', 'Google needs you to link this account again.');
        if (!this.pending.has(acc.id)) {
            const p = refreshAccessToken(this.cfg, acc.refreshToken)
                .then((g) => {
                    if (g.scope && !hasDriveScope(g.scope)) throw this.markNoDrive();
                    this.tokens.set(acc.id, { accessToken: g.accessToken, expiresAt: g.expiresAt });
                    // Google may rotate the refresh token: keep the newest one in the profile's save data.
                    if (g.refreshToken && g.refreshToken !== acc.refreshToken) store.patchAccount(acc.id, { refreshToken: g.refreshToken });
                    return g.accessToken;
                }, (e) => {
                    if (e.code === 'reauth') throw e;
                    if (e.code === 'invalid_grant' || e.code === 'unauthorized_client' || e.code === 'invalid_client') {
                        store.patchAccount(acc.id, { needsReauth: true });
                        this.tokens.delete(acc.id);
                        this._emit();
                        throw new AppError('reauth', e.code === 'invalid_grant'
                            ? 'Access to this Google account expired or was removed. Link it again.'
                            : 'This app\'s Google client is not set up correctly (' + e.code + ').');
                    }
                    throw e;
                })
                .finally(() => this.pending.delete(acc.id));
            this.pending.set(acc.id, p);
        }
        return this.pending.get(acc.id);
    }

    /** The token lacks the Drive permission (Google answered "insufficient authentication scopes"): the user must link
     *  again and allow Drive. Returns the error to throw. */
    markNoDrive() {
        const acc = this.active();
        if (acc) { store.patchAccount(acc.id, { needsReauth: true }); this.tokens.delete(acc.id); this._emit(); }
        return new AppError('reauth', NO_DRIVE_MSG);
    }

    /** The API said 401: forget the access token so the next call refreshes. */
    invalidate() { const acc = this.active(); if (acc) this.tokens.delete(acc.id); }

    /** Profile change / app close: drop every in-memory secret. */
    clearMemory() { this.tokens.clear(); this.pending.clear(); }
}
