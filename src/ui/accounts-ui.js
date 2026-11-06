/* The "Google Drive" screen. My PC owns the Google sign-in (one account per My PC profile, Control Panel > Google
 * Drive): this screen only shows My PC's answer (MyPC.drive.status()) and opens My PC's own sign-in screen. */

import { h, clear } from './dom.js';
import { Dialog } from './layers.js';
import { icon } from './icons.js';

function notice(text) {
    return h('div', { class: 'notice' }, h('span', { class: 'ico', html: icon.info }), h('span', null, text));
}

export class AccountsScreen extends Dialog {
    constructor(app, { welcome = false } = {}) {
        super('dlg-accounts', welcome ? 'Welcome to MyDrive' : 'Google Drive');
        this.app = app; this.welcome = welcome;
        this.body = h('div', { class: 'acc-body', 'data-scroll': '' });
        this.panel.appendChild(this.body);
        this.render();
    }

    render() {
        const a = this.app, st = a.status, actions = h('div', { class: 'dlg-actions wrap' });
        clear(this.body);
        let main = null;
        if (!a.driveOk) {
            this.body.appendChild(notice('This My PC is too old for MyDrive. Update My PC (Control Panel > Update), then open MyDrive again.'));
        } else if (!st) {
            this.body.appendChild(notice((a.statusError && a.statusError.message) || 'My PC did not answer. Try again.'));
            main = this.button('Try again', icon.refresh, () => this.recheck(), { cls: 'primary', autofocus: '1' });
        } else if (!st.configured) {
            this.body.appendChild(notice('Google Drive is not set up for My PC yet. An App Store manager adds it in App Store Manager > Google Drive. You can try the demo meanwhile.'));
        } else if (!st.signedIn || a.denied) {
            this.body.appendChild(h('p', { class: 'dlg-text' }, a.denied
                ? 'You did not allow MyDrive to use your Google Drive.'
                : 'Sign in once in My PC and MyDrive shows your Google Drive. My PC keeps the sign-in for this profile, on every TV and phone it uses.'));
            main = this.button(a.denied ? 'Try again' : 'Sign in to Google Drive', icon.link, () => this.signIn(), { cls: 'primary', autofocus: '1' });
        } else {
            const acc = st.account || {};
            const pic = /^https:\/\//.test(acc.picture || '') ? h('img', { src: acc.picture, alt: '', referrerpolicy: 'no-referrer' }) : (acc.name || acc.email || 'G').slice(0, 1).toUpperCase();
            this.body.appendChild(h('div', { class: 'acc-row active' },
                h('div', { class: 'acc-avatar' }, pic),
                h('div', { class: 'acc-text' }, h('div', { class: 'acc-name' }, acc.name || acc.email || 'Google Drive'),
                    h('div', { class: 'acc-mail' }, [acc.email, st.full ? 'whole Drive' : 'files made by My PC and the ones you add'].filter(Boolean).join('   ·   ')))));
            main = this.button(a.demo ? 'Use my Google Drive' : 'Open my Drive', icon.drive, () => { if (a.demo) a.setDemo(false); this.close(true); }, { cls: 'primary', autofocus: '1' });
            if (st.picker) actions.appendChild(this.button('Add files from phone', icon.phone, () => a.openAddFiles()));
        }
        if (main) actions.prepend(main);
        if (a.driveOk && st && st.configured) {
            this.body.appendChild(h('p', { class: 'dlg-sub' }, 'To switch the Google account or sign out, use My PC: Control Panel > Google Drive. MyDrive keeps no Google sign-in of its own.'));
        }
        if (a.standalone) this.body.appendChild(notice('Running outside My PC (testing): the Google account is kept in this browser only. Use a test account.'));
        actions.appendChild(this.button(a.demo ? 'Leave the demo' : 'Try the demo', icon.view, () => { a.setDemo(!a.demo); this.close(true); }, { autofocus: main ? null : '1' }));
        if (!this.welcome || a.signedIn()) actions.appendChild(this.button('Close', icon.close, () => this.close(false)));
        this.body.appendChild(actions);
        if (this.stack) this.focusFirst();
    }

    async signIn() {
        if (await this.app.signIn()) this.close(true);
        else this.render();
    }

    async recheck() { await this.app.checkDrive(); this.render(); }

    handle(cmd, info) {
        if (cmd === 'back' && this.welcome && !this.app.signedIn() && !this.app.demo) return true;   // nothing behind it
        return super.handle(cmd, info);
    }
}

/** Controller and remote help. Buttons as on a Nintendo-style pad: B bottom, A right, X top, Y left, + menu. */
export function controlsDialog(app) {
    const d = new Dialog('dlg-info', 'Controls');
    const rows = [
        ['Arrows / stick / D-pad', 'Move (hold to go faster)'],
        ['OK / B', 'Open, choose'],
        ['Hold OK / Y', 'Actions for the selected file'],
        ['X', 'Search by name'],
        ['L / R', 'Previous / next section (viewer, player: previous / next file)'],
        ['ZL / ZR', 'Page up / down (player: −60 s / +60 s, viewer: zoom)'],
        ['Right stick', 'Scroll a page'],
        ['A / Esc / Backspace', 'Back, close'],
        ['+', 'MyDrive menu'],
        ['TV remote Back', 'My PC menu (Resume / Quit)'],
        ['Player, controls hidden', '◀ ▶ seek 10 s, ▲ ▼ volume, OK shows controls']
    ];
    const t = h('div', { class: 'info-table', 'data-scroll': '' });
    rows.forEach(([k, v]) => t.appendChild(h('div', { class: 'info-row' }, h('span', { class: 'info-k key-name' }, k), h('span', { class: 'info-v' }, v))));
    d.panel.appendChild(t);
    d.panel.appendChild(h('div', { class: 'dlg-actions' }, d.button('Close', icon.close, () => d.close(), { autofocus: '1' })));
    app.stack.push(d);
    return d.result;
}
