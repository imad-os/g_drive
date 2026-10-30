/* "Test config" (standalone only): paste the same JSON as App Store Manager > Config to try the real Google
 * integration in a browser before going live. Kept in this browser's localStorage; inside My PC it never shows. */

import { h } from './dom.js';
import { Dialog } from './layers.js';
import { icon } from './icons.js';
import { testConfig, setTestConfig, parseConfigText } from '../config.js';

const TEMPLATE = {
    google: { tvClientId: '', tvClientSecret: '', pickerClientId: '', pickerApiKey: '', projectNumber: '' },
    pageSize: 100,
    thumbConcurrency: 4
};

export function testConfigDialog(app) {
    const d = new Dialog('dlg-testcfg', 'Test config (this browser only)');
    const saved = testConfig();
    const area = h('textarea', { class: 'cfg-text', spellcheck: 'false', autocomplete: 'off', 'data-autofocus': '1',
        placeholder: 'Paste the JSON from App Store Manager > MyDrive > Config' });
    area.value = JSON.stringify(saved || TEMPLATE, null, 2);
    // The SDK reads the keyboard in standalone mode (Backspace = back, P = pause…): keep typing inside the box.
    const keep = (e) => { e.stopPropagation(); if (e.key === 'Escape') area.blur(); };
    area.addEventListener('keydown', keep);
    area.addEventListener('keyup', keep);
    area.setAttribute('data-f', '');            // reachable with arrows; OK on it starts typing
    area.addEventListener('activate', () => area.focus());
    const msg = h('p', { class: 'cfg-msg' });
    const say = (t, kind) => { msg.textContent = t; msg.className = 'cfg-msg ' + (kind || ''); };
    const check = () => {
        try {
            const o = parseConfigText(area.value);
            const g = o.google || {};
            const missing = ['tvClientId', 'tvClientSecret'].filter((k) => !String(g[k] || '').trim());
            if (missing.length) say('Valid JSON, but google.' + missing.join(' and google.') + ' is empty: Google sign-in stays off.', 'warn');
            else if (!/\.apps\.googleusercontent\.com$/.test(String(g.tvClientId).trim())) say('Valid JSON, but google.tvClientId does not look like a Google client ID.', 'warn');
            else say('Valid JSON.', 'ok');
            return o;
        } catch (e) { say(e.message, 'err'); return null; }
    };

    d.panel.append(
        h('p', { class: 'dlg-sub' }, 'Same JSON as App Store Manager > MyDrive > Config. Used only when MyDrive runs outside My PC '
            + '(opened directly in a browser), saved in this browser, never uploaded. Accounts you link here are saved in this '
            + 'browser too (not in a My PC profile): use a test Google account.'),
        area, msg,
        h('div', { class: 'dlg-actions wrap' },
            d.button('Save and reload', icon.check, () => {
                const o = check();
                if (!o) return;
                if (!setTestConfig(o)) { say('This browser does not allow saving (private window?).', 'err'); return; }
                location.reload();
            }, { cls: 'primary' }),
            d.button('Check', icon.info, () => check()),
            saved ? d.button('Remove test config', icon.trash, () => { setTestConfig(null); location.reload(); }, { cls: 'danger' }) : null,
            d.button('Cancel', icon.close, () => d.close(false))));
    app.stack.push(d);
    setTimeout(() => area.focus(), 0);
    check();
    return d.result;
}
