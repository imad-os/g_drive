/* MyDrive entry: My PC lifecycle, app state and the glue between screens. */

import './styles/base.css';
import './styles/explorer.css';
import './styles/dialogs.css';
import './styles/media.css';

import { readConfig } from './config.js';
import { store } from './store.js';
import { DriveApi, driveAvailable, driveError } from './drive/api.js';
import { MockDrive } from './drive/mock.js';
import { Thumbs } from './media/thumbs.js';
import { Input } from './ui/input.js';
import { Stack, menu, toast, clearToasts } from './ui/layers.js';
import { Explorer } from './ui/explorer.js';
import { Viewer } from './ui/viewer.js';
import { Player } from './ui/player.js';
import { AccountsScreen, controlsDialog } from './ui/accounts-ui.js';
import { icon } from './ui/icons.js';
import { clearTransfers } from './ui/progress.js';

class App {
    init(info) {
        this.info = info || {};
        this.lang = this.info.lang || 'en';
        this.profileName = (this.info.profile && this.info.profile.name) || '';
        this.standalone = !!this.info.standalone;
        this.cfg = readConfig(this.standalone);
        document.documentElement.dir = 'ltr';           // texts are English for now: keep the layout left-to-right
        const low = (this.info.quality && this.info.quality.tier === 'low') || store.prefs().reduceMotion
            || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.classList.toggle('low', !!low);

        this.root = document.getElementById('app');
        this.stack = new Stack(this.root);
        this.input = new Input((cmd, i) => this.stack.dispatch(cmd, i));
        this.input.attachGamepad();
        // Google Drive is My PC's (MyPC.drive, API 14): one sign-in per My PC profile, no Google code in MyDrive
        this.driveOk = driveAvailable();
        this.status = null;           // MyPC.drive.status(): { configured, signedIn, account, full, picker, ... }
        this.statusError = null;
        this.denied = false;          // the user said no to "MyDrive wants to use your Google Drive" (this run)
        this.demo = !!store.prefs().demo || /[?&]demo=1/.test(location.search);
        this.real = new DriveApi();
        this.mock = null;
        this.source = this.demo || !this.driveOk ? this.mockSource() : this.real;
        this.thumbs = new Thumbs(this.source, this.cfg.thumbConcurrency);
        this._onPointer = (e) => this.stack.pointerFocus(e.target);
        document.addEventListener('pointerdown', this._onPointer, true);
        MyPC.ready();
    }

    mockSource() { return this.mock || (this.mock = new MockDrive()); }

    async start() {
        this.explorer = new Explorer(this);
        if (this.demo) { this.stack.push(this.explorer); this.checkDrive(); return; }
        await this.checkDrive();
        if (this.closed) return;
        if (this.signedIn()) this.stack.push(this.explorer);
        else this.openAccounts(true);
    }

    /** Asks My PC how its Google Drive is (never asks the user anything). */
    async checkDrive() {
        if (!this.driveOk) { this.status = null; return null; }
        try {
            this.status = await MyPC.drive.status();
            this.statusError = null;
        } catch (e) {
            this.status = null;
            this.statusError = driveError(e);
            if (this.statusError.code === 'unsupported') this.driveOk = false;
        }
        // My PC has taken over the accounts MyDrive linked before 1.1.0 by now: forget MyDrive's own copy (tokens)
        if (this.status && this.status.configured) store.forgetOldAccounts();
        if (this.explorer && this.explorer.stack) this.explorer.refreshAccount();
        return this.status;
    }

    signedIn() { return !!(this.driveOk && this.status && this.status.configured && this.status.signedIn); }
    canAddFiles() { return !this.demo && !!(this.status && this.status.picker); }
    account() {
        if (this.demo) return { name: 'Demo', email: 'demo' };
        if (!this.signedIn()) return null;
        return this.status.account || { name: 'Google Drive', email: '' };
    }
    accountKey() { return this.demo ? 'demo' : ((this.status && this.status.account && this.status.account.email) || 'drive'); }

    /** My PC's sign-in screen over MyDrive (QR code + Google's page on the phone). -> true when signed in. */
    async signIn() {
        if (!this.driveOk) return false;
        try {
            await MyPC.drive.signIn();
            this.denied = false;
        } catch (e) {
            const err = driveError(e);
            if (err.code === 'denied') this.denied = true;
            else if (err.code !== 'cancelled') this.handleError(err);
            await this.checkDrive();
            return false;
        }
        await this.checkDrive();
        if (!this.signedIn()) return false;
        if (this.demo) { this.demo = false; store.setPref('demo', false); }
        this.useSource(this.real);
        if (this.explorer.stack) this.explorer.resetForAccount();
        return true;
    }

    /* ---------- screens ---------- */

    async openAccounts(welcome) {
        const scr = new AccountsScreen(this, { welcome: !!welcome });
        this.stack.push(scr);
        await scr.result;
        if (this.closed) return;
        if (!this.explorer.stack && (this.demo || this.signedIn())) this.stack.push(this.explorer);
        else if (this.explorer.stack) this.explorer.refreshAccount();
        if (!this.explorer.stack) this.openAccounts(true);
    }
    /** My PC's "Add files from your phone" (Google Picker on the phone), then "All files" shows them. */
    async openAddFiles() {
        if (this.demo) { toast('Adding files needs your Google Drive (sign in first).'); return; }
        if (!this.canAddFiles()) { toast(this.signedIn() ? 'Not needed: My PC already sees your whole Google Drive.' : 'Sign in to Google Drive first.'); return; }
        try { await MyPC.drive.addFiles(); } catch (e) { const err = driveError(e); if (err.code !== 'cancelled') this.handleError(err); return; }
        if (this.closed) return;
        while (this.stack.top() && this.stack.top() !== this.explorer && this.stack.top().close) this.stack.top().close(false);
        if (this.explorer.stack) this.explorer.navigate({ kind: 'all' }, []);
    }
    showControls() { controlsDialog(this); }
    openViewer(files, i) { if (i >= 0) this.stack.push(new Viewer(this, files, i)); }
    openPlayer(files, i, siblings) { if (i >= 0) this.stack.push(this.player = new Player(this, files, i, siblings)); }
    explorerDetails(f) { this.explorer.details('', f); }

    async appMenu() {
        const id = await menu(this.stack, { title: 'MyDrive', items: [
            { id: 'accounts', label: 'Google Drive…', icon: icon.user },
            this.canAddFiles() ? { id: 'add', label: 'Add files from phone', icon: icon.phone } : null,
            { id: 'controls', label: 'Controls', icon: icon.gamepad },
            { id: 'motion', label: 'Reduce animations', icon: icon.check, checked: document.documentElement.classList.contains('low') },
            { sep: true },
            { id: 'exit', label: 'Exit MyDrive', icon: icon.exit }].filter(Boolean) });
        if (id === 'accounts') this.openAccounts();
        else if (id === 'add') this.openAddFiles();
        else if (id === 'controls') this.showControls();
        else if (id === 'motion') { const on = !document.documentElement.classList.contains('low'); document.documentElement.classList.toggle('low', on); store.setPref('reduceMotion', on); }
        else if (id === 'exit') MyPC.exit();
    }

    /* ---------- accounts ---------- */

    useSource(src) {
        this.source = src;
        this.thumbs.setSource(src);
        if (this.player && !this.player.closed) this.player.close();
    }
    setDemo(on) {
        this.demo = on;
        store.setPref('demo', on);
        this.useSource(on || !this.driveOk ? this.mockSource() : this.real);
        if (this.explorer.stack) this.explorer.resetForAccount();
    }

    /** One place for error feedback. quiet: the caller shows it on screen itself. */
    handleError(e, quiet) {
        const code = e && e.code;
        if ((code === 'reauth' || code === 'signed_out') && this.status) { this.status.signedIn = false; if (this.explorer && this.explorer.stack) this.explorer.refreshAccount(); }
        if (code === 'denied') this.denied = true;
        if (!quiet) toast((e && e.message) || 'Something went wrong', 'error', 5000);
        // unexpected failures go to the store owner's error page (no names, ids or tokens in the report)
        if (!/^(cancelled|network|timeout|reauth|signed_out|denied|noconfig|unsupported|busy|too_big|permission|not_found|quota|demo|bad_name|offline)$/.test(code || '')) {
            MyPC.report(new Error('drive: ' + (code || 'error') + (e && e.status ? ' ' + e.status : '')), { status: (e && e.status) || 0 });
        }
    }

    /* ---------- lifecycle ---------- */

    pause() {
        this.input.enabled = false;
        if (this.player && !this.player.closed) this.player.suspend();
    }
    resume() {
        this.input.enabled = true;
        if (this.player && !this.player.closed) this.player.resume();
    }
    destroy() {
        this.closed = true;
        this.input.destroy();
        document.removeEventListener('pointerdown', this._onPointer, true);
        if (this.player && !this.player.closed) this.player.close();
        if (this.explorer) this.explorer.destroy();
        this.thumbs.reset();
        clearToasts();
        clearTransfers();
    }
}

const app = new App();

MyPC.init({
    onInit: (info) => app.init(info),
    onStart: () => app.start(),
    onPause: () => app.pause(),
    onResume: () => app.resume(),
    onDestroy: () => app.destroy(),
    onInput: (action, pressed, repeat, dev) => app.input && app.input.onInput(action, pressed, repeat, dev),
    ownMenu: true
});
