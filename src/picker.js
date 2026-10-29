/* Phone companion page: Google Picker grants MyDrive (drive.file) access to existing files and folders.
 * Grants belong to the Google Cloud project (setAppId = project number), so the TV's client sees them too.
 * Runs in a normal phone browser (not inside My PC): Google's own scripts, popup sign-in, nothing stored. */

import './styles/base.css';
import './styles/picker.css';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const params = new URLSearchParams(location.hash.slice(1));
const cfg = { clientId: params.get('c') || '', apiKey: params.get('k') || '', appId: params.get('p') || '' };
history.replaceState(null, '', location.pathname);       // keep the address bar clean

const go = document.getElementById('go');
const msg = document.getElementById('msg');
const say = (t, err) => { msg.textContent = t; msg.classList.toggle('error', !!err); };

function script(src) {
    return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
        document.head.appendChild(s);
    });
}

async function boot() {
    if (!cfg.clientId || !cfg.apiKey || !cfg.appId) { say('This link is incomplete. Open it again from MyDrive on the TV (Add files).', true); go.textContent = 'Not available'; return; }
    try {
        await Promise.all([script('https://apis.google.com/js/api.js'), script('https://accounts.google.com/gsi/client')]);
        await new Promise((res) => window.gapi.load('picker', res));
    } catch (e) { say(e.message, true); return; }
    let token = '';
    const client = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: SCOPE,
        callback: (r) => {
            if (r.error) { say('Google sign-in did not finish (' + r.error + ').', true); return; }
            token = r.access_token;
            openPicker(token);
        }
    });
    go.disabled = false;
    go.textContent = 'Choose files';
    go.addEventListener('click', () => { if (token) openPicker(token); else client.requestAccessToken({ prompt: '' }); });
}

function openPicker(token) {
    const gp = window.google.picker;
    const files = new gp.DocsView(gp.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(true);
    const shared = new gp.DocsView(gp.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(false);
    const picker = new gp.PickerBuilder()
        .addView(files).addView(shared)
        .enableFeature(gp.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token)
        .setDeveloperKey(cfg.apiKey)
        .setAppId(cfg.appId)
        .setTitle('Choose files for MyDrive')
        .setCallback((data) => {
            if (data.action === gp.Action.PICKED) {
                const n = (data.docs || []).length;
                say(`${n} item${n === 1 ? '' : 's'} added. On the TV, open "All files" in MyDrive. You can add more or close this page.`);
                go.textContent = 'Choose more files';
            } else if (data.action === gp.Action.CANCEL) say('Nothing was added.');
        })
        .build();
    picker.setVisible(true);
}

boot();
