/* Everything persistent goes through MyPC.save / MyPC.load: per My PC profile, synced to the player's
 * account and therefore to every device that profile signs in on. Only this app's own keys are touched. */

const K_ACCOUNTS = 'accounts';   // [{ id, email, name, picture, refreshToken, scope, addedAt, needsReauth }]
const K_ACTIVE = 'active';       // id of the active Google account
const K_PREFS = 'prefs';         // { view, sort, dir, startFolder, sections... }

const DEFAULT_PREFS = { view: 'grid', sort: 'name', dir: 'asc', reduceMotion: false };

function load(key, def) {
    try { const v = MyPC.load(key, def); return v == null ? def : v; } catch (e) { return def; }
}
function save(key, value) {
    try { MyPC.save(key, value); } catch (e) { MyPC.report(e, { where: 'save', key }); }
}

function cleanAccount(a) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id) return null;
    return {
        id: a.id.slice(0, 64),
        email: String(a.email || '').slice(0, 120),
        name: String(a.name || '').slice(0, 80),
        picture: /^https:\/\//.test(a.picture || '') ? String(a.picture).slice(0, 500) : '',
        refreshToken: typeof a.refreshToken === 'string' ? a.refreshToken : '',
        scope: String(a.scope || ''),
        addedAt: +a.addedAt || 0,
        needsReauth: !!a.needsReauth
    };
}

export const store = {
    accounts() {
        const list = load(K_ACCOUNTS, []);
        return Array.isArray(list) ? list.map(cleanAccount).filter(Boolean).slice(0, 8) : [];
    },
    account(id) { return this.accounts().find((a) => a.id === id) || null; },
    putAccount(acc) {
        const list = this.accounts().filter((a) => a.id !== acc.id);
        list.push(cleanAccount(acc));
        save(K_ACCOUNTS, list);
    },
    patchAccount(id, patch) {
        const acc = this.account(id);
        if (acc) this.putAccount(Object.assign(acc, patch));
    },
    removeAccount(id) {
        save(K_ACCOUNTS, this.accounts().filter((a) => a.id !== id));
        if (this.activeId() === id) save(K_ACTIVE, '');
    },
    activeId() { const v = load(K_ACTIVE, ''); return typeof v === 'string' ? v : ''; },
    setActive(id) { save(K_ACTIVE, id || ''); },

    prefs() {
        const p = load(K_PREFS, {});
        return Object.assign({}, DEFAULT_PREFS, p && typeof p === 'object' ? p : {});
    },
    setPref(key, value) {
        const p = this.prefs();
        if (p[key] === value) return;
        p[key] = value;
        save(K_PREFS, p);
    }
};
