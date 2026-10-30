/* MyDrive entry: My PC lifecycle, app state and the glue between screens. */

import './styles/base.css';
import './styles/explorer.css';
import './styles/dialogs.css';
import './styles/media.css';

import { readConfig } from './config.js';
import { store } from './store.js';
import { Accounts } from './auth/accounts.js';
import { DriveApi } from './drive/api.js';
import { MockDrive } from './drive/mock.js';
import { Thumbs } from './media/thumbs.js';
import { initStreaming, setStreamSource, closeAllStreams } from './media/stream.js';
import { Input } from './ui/input.js';
import { Stack, menu, toast, clearToasts } from './ui/layers.js';
import { Explorer } from './ui/explorer.js';
import { Viewer } from './ui/viewer.js';
import { Player } from './ui/player.js';
import { AccountsScreen, addFilesDialog, controlsDialog } from './ui/accounts-ui.js';
import { testConfigDialog } from './ui/test-config.js';
import { icon } from './ui/icons.js';
import { netAvailable } from './net.js';

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
        this.accounts = new Accounts(this.cfg);
        this.demo = !!store.prefs().demo || /[?&]demo=1/.test(location.search);
        this.real = new DriveApi(this.accounts);
        this.mock = null;
        this.source = this.demo ? this.mockSource() : this.real;
        this.thumbs = new Thumbs(this.source, this.cfg.thumbConcurrency);
        setStreamSource(this.source);
        this.streaming = initStreaming();
        this._onPointer = (e) => this.stack.pointerFocus(e.target);
        document.addEventListener('pointerdown', this._onPointer, true);
        if (!netAvailable()) MyPC.fail('This My PC is too old for MyDrive (web requests need API level 10). Update My PC.');
        else MyPC.ready();
    }

    mockSource() { return this.mock || (this.mock = new MockDrive()); }

    start() {
        this.explorer = new Explorer(this);
        const hasAccount = !!this.accounts.active();
        if (this.demo || hasAccount) this.stack.push(this.explorer);
        else this.openAccounts(true);
        if (hasAccount && !this.demo) {
            const acc = this.accounts.active();
            if (acc.needsReauth) toast('Google needs you to link ' + (acc.email || 'this account') + ' again.', 'error', 6000);
        }
    }

    accountKey() { return this.demo ? 'demo' : (this.accounts.active() || {}).id || ''; }

    /* ---------- screens ---------- */

    async openAccounts(welcome) {
        const scr = new AccountsScreen(this, { welcome: !!welcome });
        this.stack.push(scr);
        await scr.result;
        if (!this.explorer.stack && (this.demo || this.accounts.active())) this.stack.push(this.explorer);
        else if (this.explorer.stack) this.explorer.refreshAccount();
        if (!this.explorer.stack) this.openAccounts(true);
    }
    openAddFiles() { if (this.demo) { toast('Adding files needs a linked Google account.'); return; } addFilesDialog(this); }
    showControls() { controlsDialog(this); }
    openTestConfig() { if (this.standalone) testConfigDialog(this); }
    openViewer(files, i) { if (i >= 0) this.stack.push(new Viewer(this, files, i)); }
    openPlayer(files, i, siblings) { if (i >= 0) this.stack.push(this.player = new Player(this, files, i, siblings)); }
    explorerDetails(f) { this.explorer.details('', f); }

    async appMenu() {
        const id = await menu(this.stack, { title: 'MyDrive', items: [
            { id: 'accounts', label: 'Google accounts…', icon: icon.user },
            { id: 'add', label: 'Add files from phone', icon: icon.phone },
            { id: 'controls', label: 'Controls', icon: icon.gamepad },
            this.standalone ? { id: 'testcfg', label: 'Test config…', icon: icon.rename } : null,
            { id: 'motion', label: 'Reduce animations', icon: icon.check, checked: document.documentElement.classList.contains('low') },
            { sep: true },
            { id: 'exit', label: 'Exit MyDrive', icon: icon.exit }].filter(Boolean) });
        if (id === 'accounts') this.openAccounts();
        else if (id === 'add') this.openAddFiles();
        else if (id === 'controls') this.showControls();
        else if (id === 'testcfg') this.openTestConfig();
        else if (id === 'motion') { const on = !document.documentElement.classList.contains('low'); document.documentElement.classList.toggle('low', on); store.setPref('reduceMotion', on); }
        else if (id === 'exit') MyPC.exit();
    }

    /* ---------- accounts ---------- */

    useSource(src) {
        this.source = src;
        this.thumbs.setSource(src);
        setStreamSource(src);
        closeAllStreams();
    }
    setDemo(on) {
        this.demo = on;
        store.setPref('demo', on);
        this.useSource(on ? this.mockSource() : this.real);
        if (this.explorer.stack) this.explorer.resetForAccount();
    }
    switchAccount(id) {
        this.accounts.switchTo(id);
        if (this.demo) { this.setDemo(false); return; }
        this.useSource(this.real);
        if (this.explorer.stack) this.explorer.resetForAccount();
        toast('Using ' + ((this.accounts.active() || {}).email || 'account'));
    }
    onLinked(acc) {
        toast('Linked ' + (acc.email || acc.name));
        if (this.demo) { this.demo = false; store.setPref('demo', false); }
        this.useSource(this.real);
        if (this.explorer.stack) this.explorer.resetForAccount();
    }
    async disconnect(id) {
        await this.accounts.disconnect(id);
        this.useSource(this.demo ? this.mockSource() : this.real);
        toast('Disconnected');
        if (this.explorer.stack) {
            if (this.accounts.active() || this.demo) this.explorer.resetForAccount();
            else { this.stack.remove(this.explorer); this.explorer.destroy(); this.explorer = new Explorer(this); }
        }
    }

    /** One place for error feedback. quiet: the caller shows it on screen itself. */
    handleError(e, quiet) {
        const code = e && e.code;
        if (code === 'reauth' && this.explorer && this.explorer.stack) this.explorer.refreshAccount();
        if (!quiet) toast((e && e.message) || 'Something went wrong', 'error', 5000);
        // unexpected failures go to the store owner's error page (no names, ids or tokens in the report)
        if (!/^(cancelled|network|timeout|reauth|signed_out|permission|not_found|quota|demo|bad_name|offline)$/.test(code || '')) {
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
        this.input.destroy();
        document.removeEventListener('pointerdown', this._onPointer, true);
        if (this.player && !this.player.closed) this.player.close();
        if (this.explorer) this.explorer.destroy();
        closeAllStreams();
        this.thumbs.reset();
        this.accounts.clearMemory();
        clearToasts();
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
