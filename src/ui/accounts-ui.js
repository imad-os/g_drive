/* Google account management for the current My PC profile: link (device code + QR), switch, disconnect,
 * re-link after an expired / revoked grant, and the phone page that adds existing Drive files. */

import { h, clear } from './dom.js';
import { Dialog, confirm } from './layers.js';
import { onActivate } from './focus.js';
import { icon } from './icons.js';
import { startDeviceFlow, pollDeviceFlow } from '../auth/oauth.js';
import QR from '../lib/qr.js';

function qrSvg(text) {
    return QR.svg(text, { quiet: 2, dark: '#0f1115', light: '#ffffff' }) || '';
}

export class AccountsScreen extends Dialog {
    constructor(app, { welcome = false } = {}) {
        super('dlg-accounts', welcome ? 'Welcome to MyDrive' : 'Google accounts');
        this.app = app; this.welcome = welcome;
        this.body = h('div', { class: 'acc-body', 'data-scroll': '' });
        this.panel.appendChild(this.body);
        this.render();
    }

    render() {
        const a = this.app, list = a.accounts.list(), active = a.accounts.active();
        clear(this.body);
        const who = a.profileName ? `My PC profile: ${a.profileName}` : '';
        this.body.appendChild(h('p', { class: 'dlg-sub' }, [who,
            'Linked accounts follow this My PC profile to every TV, phone and computer it signs in on. Other profiles never see them.'].filter(Boolean).join('   ·   ')));
        if (a.standalone) {
            const from = { url: 'from the address (?app_config=)', test: 'your test config saved in this browser', none: 'none yet' }[a.cfg.from] || a.cfg.from;
            this.body.appendChild(h('div', { class: 'notice' }, h('span', { class: 'ico', html: icon.info }),
                h('span', null, 'Running outside My PC (testing). Config: ' + from + '. Linked accounts are kept in this browser only.')));
        }
        if (!a.accounts.configured()) {
            this.body.appendChild(h('div', { class: 'notice' }, h('span', { class: 'ico', html: icon.info }),
                h('span', null, a.standalone
                    ? 'Google sign-in is off: paste your config with "Test config" (same JSON as App Store Manager > Config), or try the demo.'
                    : 'Google sign-in is not set up for this app yet. The store owner adds the Google client in App Store Manager > Config (see the README). You can try the demo meanwhile.')));
        }
        list.forEach((acc) => {
            const isActive = active && active.id === acc.id && !a.demo;
            const row = h('div', { class: 'acc-row' + (isActive ? ' active' : '') },
                h('div', { class: 'acc-avatar' }, (acc.name || acc.email || '?').slice(0, 1).toUpperCase()),
                h('div', { class: 'acc-text' }, h('div', { class: 'acc-name' }, acc.name || acc.email), h('div', { class: 'acc-mail' }, acc.email + (acc.needsReauth ? '   ·   needs to be linked again' : isActive ? '   ·   in use' : ''))));
            const btns = h('div', { class: 'acc-btns' });
            if (acc.needsReauth) btns.appendChild(this.button('Link again', icon.link, () => this.link(), { cls: 'primary' }));
            else if (!isActive) btns.appendChild(this.button('Use', icon.check, () => { a.switchAccount(acc.id); this.close(true); }, { cls: 'primary' }));
            btns.appendChild(this.button('Disconnect', icon.unlink, () => this.disconnect(acc), { cls: 'danger' }));
            row.appendChild(btns);
            this.body.appendChild(row);
        });
        const actions = h('div', { class: 'dlg-actions wrap' });
        if (a.accounts.configured()) actions.appendChild(this.button(list.length ? 'Link another Google account' : 'Link a Google account', icon.link, () => this.link(), { cls: 'primary', autofocus: '1' }));
        if (list.length && a.cfg.pickerClientId) actions.appendChild(this.button('Add files from phone', icon.phone, () => a.openAddFiles()));
        if (a.standalone) actions.appendChild(this.button('Test config…', icon.rename, () => a.openTestConfig(), { cls: a.accounts.configured() ? '' : 'primary', autofocus: a.accounts.configured() ? null : '1' }));
        actions.appendChild(this.button(a.demo ? 'Leave the demo' : 'Try the demo', icon.view, () => { a.setDemo(!a.demo); this.close(true); }));
        if (!this.welcome || list.length) actions.appendChild(this.button('Close', icon.close, () => this.close(false)));
        this.body.appendChild(actions);
        if (this.stack) this.focusFirst();
    }

    async link() {
        const ok = await linkFlow(this.app);
        if (ok) this.close(true);
        else this.render();
    }

    async disconnect(acc) {
        const yes = await confirm(this.app.stack, {
            title: 'Disconnect ' + (acc.email || acc.name) + '?', ok: 'Disconnect', danger: true,
            text: 'MyDrive forgets this Google account on every device of this profile and asks Google to cancel its access. Your files in Google Drive are not touched, and nothing else of this profile is deleted.'
        });
        if (!yes) return;
        await this.app.disconnect(acc.id);
        this.render();
    }

    handle(cmd, info) {
        if (cmd === 'back' && this.welcome && !this.app.accounts.list().length && !this.app.demo) return true;   // nothing behind it
        return super.handle(cmd, info);
    }
}

/** Device-code flow on screen. Resolves true once an account is linked and saved. */
export function linkFlow(app) {
    const d = new Dialog('dlg-link', 'Link a Google account');
    const ctrl = new AbortController();
    const body = h('div', { class: 'link-body' }, h('p', { class: 'dlg-text' }, 'Asking Google for a code…'));
    d.panel.appendChild(body);
    const cancel = d.button('Cancel', icon.close, () => d.close(false), { autofocus: '1' });
    d.panel.appendChild(h('div', { class: 'dlg-actions' }, cancel));
    const origClose = d.close.bind(d);
    let countdown = 0;
    d.close = (v) => { ctrl.abort(); clearInterval(countdown); origClose(v); };
    app.stack.push(d);

    (async () => {
        try {
            const flow = await startDeviceFlow(app.cfg, ctrl.signal);
            const left = h('span', { class: 'link-left' });
            clear(body);
            body.append(
                h('div', { class: 'link-grid' },
                    h('div', { class: 'link-qr', html: qrSvg(flow.url) }),
                    h('ol', { class: 'link-steps' },
                        h('li', null, 'On your phone or computer, scan the code or open ', h('b', null, flow.url.replace(/^https:\/\//, ''))),
                        h('li', null, 'Enter this code:', h('div', { class: 'user-code' }, flow.userCode)),
                        h('li', null, 'Choose your Google account and allow MyDrive. If Google shows checkboxes, tick the Google Drive one.'))),
                h('p', { class: 'dlg-sub' }, 'MyDrive asks only for its own files and the files you choose (Google "drive.file" access), plus your name and e-mail. ', left));
            const tick = () => { const s = Math.max(0, Math.round((flow.expiresAt - Date.now()) / 1000)); left.textContent = `The code works for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} more.`; };
            tick(); countdown = setInterval(tick, 1000);
            if (window.MyPC && MyPC.announce) MyPC.announce('Your code is ' + flow.userCode.split('').join(' '));
            const grant = await pollDeviceFlow(app.cfg, flow, ctrl.signal);
            const acc = app.accounts.addFromGrant(grant);
            app.onLinked(acc);
            d.close(true);
        } catch (e) {
            if (e.code === 'cancelled' || d.closed) return;
            clearInterval(countdown);
            const msg = {
                access_denied: 'You chose not to allow MyDrive. Nothing was linked.',
                expired_token: 'The code expired before it was used. Try again.',
                invalid_client: 'Google does not accept this client: check google.tvClientId and google.tvClientSecret in the config' + (app.standalone ? ' (Test config).' : ' (App Store Manager > MyDrive > Config).'),
                unauthorized_client: 'google.tvClientId is not a "TVs and Limited Input devices" client. Create one of that type and use its ID and secret.',
                invalid_scope: 'Google refused the requested access (scope).',
                scope_missing: e.message,
                network: 'No connection to Google. Check the network and try again.'
            }[e.code] || e.message;
            clear(body);
            body.appendChild(h('p', { class: 'dlg-text error' }, msg));
            cancel.lastChild.textContent = 'Close';
            if (window.MyPC && MyPC.report && !/access_denied|expired_token|network|timeout|scope_missing/.test(e.code)) MyPC.report(new Error('link: ' + e.code), { code: e.code });
        }
    })();
    return d.result;
}

/** The phone page (picker.html) where the user picks existing Drive files to give MyDrive access to them. */
export function addFilesDialog(app) {
    const d = new Dialog('dlg-link', 'Add files from your phone');
    // public identifiers only (no secret, no personal data), in the #fragment so they never reach a server log
    const c = app.cfg;
    const url = new URL('picker.html', location.href.split(/[?#]/)[0]).href
        + '#c=' + encodeURIComponent(c.pickerClientId) + '&k=' + encodeURIComponent(c.pickerApiKey) + '&p=' + encodeURIComponent(c.projectNumber);
    const configured = !!app.cfg.pickerClientId;
    d.panel.appendChild(configured
        ? h('div', { class: 'link-grid' },
            h('div', { class: 'link-qr', html: qrSvg(url) }),
            h('ol', { class: 'link-steps' },
                h('li', null, 'Scan this code with your phone (or open ', h('b', null, url.split('#')[0].replace(/^https:\/\//, '')), ').'),
                h('li', null, 'Sign in with the same Google account and pick the files or folders MyDrive may open.'),
                h('li', null, 'Come back here: they are in "All files" (and in their folder when you picked the folder too).')))
        : h('p', { class: 'dlg-text' }, 'The store owner has not set up the Google Picker for this app yet (pickerClientId and pickerApiKey in App Store Manager > Config).'));
    d.panel.appendChild(h('p', { class: 'dlg-sub' }, 'Why: MyDrive uses Google\'s privacy-friendly access, so it sees only the files it created and the ones you pick.'));
    d.panel.appendChild(h('div', { class: 'dlg-actions' }, d.button('Done', icon.check, () => d.close(true), { cls: 'primary', autofocus: '1' })));
    app.stack.push(d);
    return d.result;
}

/** Controller and remote help (the on-screen control guide). */
export function controlsDialog(app) {
    const d = new Dialog('dlg-info', 'Controls');
    const rows = [
        ['Arrows / stick / D-pad', 'Move (hold to go faster)'],
        ['OK / A', 'Open, choose'],
        ['Hold OK / X', 'Actions for the selected file'],
        ['Y', 'Search by name'],
        ['LB / RB', 'Previous / next section (viewer, player: previous / next file)'],
        ['LT / RT', 'Page up / down (player: −60 s / +60 s, viewer: zoom)'],
        ['Right stick', 'Scroll a page'],
        ['B / Esc / Backspace', 'Back, close'],
        ['Start or Select', 'MyDrive menu'],
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
