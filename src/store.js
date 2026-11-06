/* Everything persistent goes through MyPC.save / MyPC.load: per My PC profile, synced to the player's
 * account and therefore to every device that profile signs in on. Only this app's own keys are touched. */

// Before version 1.1.0 MyDrive kept its own Google accounts here ('accounts', 'active'). My PC takes them over
// (same Google client), then MyDrive empties them: store.forgetOldAccounts().
const K_OLD_ACCOUNTS = 'accounts';
const K_OLD_ACTIVE = 'active';
const K_PREFS = 'prefs';         // { view, sort, dir, startFolder, sections... }

const DEFAULT_PREFS = { view: 'grid', sort: 'name', dir: 'asc', reduceMotion: false };

function load(key, def) {
    try { const v = MyPC.load(key, def); return v == null ? def : v; } catch (e) { return def; }
}
function save(key, value) {
    try { MyPC.save(key, value); } catch (e) { MyPC.report(e, { where: 'save', key }); }
}

export const store = {
    /** Old MyDrive sign-ins (refresh tokens) still saved? */
    hasOldAccounts() {
        const l = load(K_OLD_ACCOUNTS, []);
        return (Array.isArray(l) && l.length > 0) || !!load(K_OLD_ACTIVE, '');
    },
    /** Deletes them: only once My PC's Google Drive answered (it has taken them over by then). Prefs stay. */
    forgetOldAccounts() {
        if (!this.hasOldAccounts()) return false;
        save(K_OLD_ACCOUNTS, []);
        save(K_OLD_ACTIVE, '');
        return true;
    },

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
