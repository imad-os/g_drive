# MyDrive

A Google Drive file explorer for **My PC** (Samsung Smart TVs, Tizen 8/9, and browsers), designed for a TV remote
and game controllers first. Dark, Windows 11 File Explorer-inspired UI at 1920×1080.

- Install address for the App Store Manager: **`https://imad-os.github.io/g_drive/`**
- My PC guide: https://raw.githubusercontent.com/imad-os/g/main/sdk/GUIDE.md

## What it does

| Area | What works |
|---|---|
| Browse | My Drive folders, All files, Starred, Recent, Images, Videos, Audio, Documents, Trash; breadcrumb; Back / Forward / Up / Refresh; paging (100 per page, more load as you scroll) |
| Views | Large tiles, small tiles, details list (virtualized: only visible rows exist in the DOM) |
| Search / sort | Name search with an on-screen keyboard (debounced live results); sort by name, date, type, size, asc / desc |
| File operations | New folder, rename, cut + "Move here", copy + paste (files), star / unstar, move to Trash, restore from Trash, upload (computers and phones), details |
| Images | Full-screen viewer, previous / next, fit and 4 zoom steps with panning, dimensions; originals over 20 MB or formats the browser cannot decode use Google's 1920 px rendition |
| Video / audio | Streams with HTTP Range requests (seeking works, nothing is downloaded whole), play / pause, ±10 s / ±60 s, volume, previous / next, sidecar `.srt` / `.vtt` subtitles |
| Accounts | Several Google accounts per My PC profile, switch, disconnect (revokes Google's grant), re-link after expiry / revocation |
| Demo | "Try the demo" runs the whole UI on local fake data (`src/drive/mock.js`), no Google account needed |

## Controls

| Input | Action |
|---|---|
| Arrows / D-pad / left stick | Move (hold to accelerate) |
| OK / A | Open |
| Hold OK / X | Actions menu for the selected file |
| Y | Search |
| LB / RB | Previous / next section (viewer / player: previous / next file) |
| LT / RT, right stick | Page up / down (player: −60 s / +60 s; viewer: zoom) |
| B, Esc / Backspace | Back / close |
| Start or Select | MyDrive menu |
| TV remote Back | My PC's pause menu (Resume / Quit) |

Everything also has an on-screen control, so arrows + OK are enough. The status bar shows the controls that
apply right now, and the **Controls** screen in the sidebar lists all of them.

## How sign-in and cross-device accounts work

My PC runs the app in a sandboxed iframe with no pop-ups, so a normal Google sign-in window cannot open on the
TV. MyDrive uses Google's **OAuth 2.0 for TVs and Limited-Input Devices** (device code) flow:

1. The TV shows a code and a QR code for `google.com/device`.
2. The user approves on a phone or computer.
3. Google gives the TV an access token (1 h) and a **refresh token**.

**The refresh token is saved with `MyPC.save('accounts', …)`**, together with the Google account id, e-mail and
name. My PC save data is per My PC profile and per app. When the profile is a signed-in My PC player account, the
data is synced to the Firestore document `players/{uid}`, which only that account can read. So a profile that
links Drive on one TV finds it linked on every TV, phone or computer it signs in on. There the app swaps the
refresh token for a new access token. If Google rotates the refresh token, the new one is saved straight away.
Access tokens are never saved: they stay in memory and are dropped when the app closes.

Other My PC profiles get their own save data, so they never see another profile's accounts, tokens or file
listings. In-memory caches (listings, thumbnails as `blob:` URLs) are cleared when you switch accounts or close
the app. Disconnecting removes only MyDrive's own `accounts` entry and revokes Google's grant. No other save data
is touched.

### Security notes (read before publishing)

- **My PC save data is not encrypted.** It is protected by My PC's Firestore rules: `players/{uid}` can be read
  only by the account itself. My PC's **TV backup** (`tvs/{hash}`) also contains the saves, and anyone who knows
  that TV's hashed id can read that document. A refresh token stored there is as safe as that backup. The
  owner asked for this storage; a token broker with server-side storage would be stronger, but My PC's guide
  forbids backends.
- What a leaked refresh token exposes: only MyDrive's `drive.file` access to that account (see below). The user
  can cancel it at any time at https://myaccount.google.com/permissions, or with **Disconnect** in MyDrive.
- Opened directly in a browser (standalone development mode), the SDK keeps saves in `localStorage`. Use test
  accounts there.
- Tokens are sent only in `Authorization` headers, never in URLs. They are never logged or put in error reports.

### Why `drive.file` (and what it means)

Google's device flow **does not allow** the full `drive` or `drive.readonly` scopes. It allows `drive.file`, so
MyDrive sees:

- files and folders it created or uploaded, and
- existing files and folders the user picks on their phone with **Add files**. This opens `picker.html`, a
  Google Picker page. Picker grants belong to the Cloud project, so the TV client sees them too. Picked files
  show up in **All files**, and in their folder if that folder was picked as well.

A side benefit: `drive.file` is a non-sensitive scope. The Cloud project can be published to Production without
Google's restricted-scope security assessment, so **refresh tokens do not expire after 7 days** as they do for
apps in "Testing".

## Google Cloud setup (store owner)

**Fastest way:** open https://shell.cloud.google.com and run:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/imad-os/g_drive/main/tools/gcloud-setup.sh)
```

[`tools/gcloud-setup.sh`](tools/gcloud-setup.sh) creates the project, enables the APIs, makes the restricted
Picker API key and reads the project number. Google has no public API for the consent screen or for
OAuth clients, so the script opens those console pages, says exactly what to click, asks for the IDs, and
then prints the finished Config JSON. You can run it again safely: pass an existing project id as the first
argument to reuse that project.

The manual steps it walks you through are the same as these:

1. Create a project at https://console.cloud.google.com and enable the **Google Drive API** and the
   **Google Picker API**.
2. **OAuth consent screen** (Google Auth Platform): External. Add the scopes `openid`, `email`, `profile` and
   `.../auth/drive.file`. Add a privacy policy link. Then **Publish app** (Production). While the app is in
   "Testing", refresh tokens expire after 7 days and users must link their account again.
3. **Credentials → Create OAuth client ID → "TVs and Limited Input devices".** Keep its client ID and secret.
   Google treats this client's secret as non-confidential (installed apps), which is why the device flow needs it.
4. For **Add files**: create OAuth client ID → **Web application** with the authorized JavaScript origin
   `https://imad-os.github.io`. Then create an **API key** limited to the Google Picker API and to the HTTP
   referrer `https://imad-os.github.io/g_drive/*`. Note the **project number** (Project settings).
5. In the **App Store Manager → MyDrive → Config**, set:

```json
{
  "google": {
    "tvClientId": "123-abc.apps.googleusercontent.com",
    "tvClientSecret": "GOCSPX-…",
    "pickerClientId": "123-web.apps.googleusercontent.com",
    "pickerApiKey": "AIza…",
    "projectNumber": "123456789012"
  },
  "pageSize": 100,
  "thumbConcurrency": 4
}
```

Nothing secret or personal is committed to this repository. These values live only in the app config.

## Video playback

A `<video>` element cannot send the `Authorization` header, and Drive does not accept tokens in URLs. MyDrive
registers a service worker (`public/sw.js`). The player points the video at `./mydrive-stream/<random id>`. The
worker answers each Range request with a 206 piece of at most 2 MB, which the page downloads from
`files.get?alt=media` through `MyPC.net` with the header. Seeking works, memory stays small, and nothing is
cached.

- Plays natively: MP4 (H.264 / AAC), WebM (VP8 / VP9), MP3, M4A / AAC, and OGG where the browser supports it.
  Samsung TVs often also play MKV and HEVC in hardware; MyDrive tries, then shows a clear message if it fails.
- Needs converting on a computer (MyDrive does no transcoding): AVI, WMV, FLV, and codecs the screen lacks.
- Without service workers, files up to 64 MB are loaded whole as a fallback. Larger files show an explanation.

## Project layout

```
index.html, picker.html        entry pages (the SDK <script> comes first)
public/                        mypc-app.json, icon.svg, sw.js, .nojekyll (copied as-is)
src/main.js                    My PC lifecycle (init / start / pause / resume / destroy) and app glue
src/config.js                  owner config (MyPC.app_config) + OAuth scopes
src/store.js                   MyPC.save / load: accounts, active account, preferences
src/net.js                     MyPC.net wrapper: retries, cancellation, concurrency limiter
src/auth/oauth.js              device flow, refresh, revoke
src/auth/accounts.js           per-profile accounts, in-memory access tokens
src/drive/api.js               Drive API v3 (list, get, create, rename, move, copy, star, trash, ranges, upload)
src/drive/mock.js              demo data, same interface as api.js
src/media/thumbs.js            lazy, rate-limited, LRU thumbnails
src/media/stream.js            page side of the streaming worker
src/ui/*                       focus system, explorer, virtual grid, dialogs, on-screen keyboard, viewer, player, accounts
src/picker.js                  phone page: Google Picker for "Add files"
docs/                          build output served by GitHub Pages
```

## Develop, build, publish

```bash
npm install
npm run dev          # http://localhost:5173 (?demo=1 for the demo, ?app_config={...} to test a config)
npm run build        # -> docs/ (Chrome 108 target, every asset gets ?v=<version>)
```

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/docs`**. Then, in the App Store Manager
(https://imad-os.github.io/g/installer/), paste `https://imad-os.github.io/g_drive/`, press **Check** and
**Add to store**. For every release, bump `version` in `public/mypc-app.json` (and its `icon?v=`), run
`npm run build`, commit `docs/`, push, and press **Update** in the App Store Manager.

## Test status

Verified in a desktop browser in standalone mode, using the demo data and a fake Google client:

- the UI at 16:9 and 4:3
- arrow / Enter / Backspace navigation between sidebar, command bar and grid
- folders, the image viewer, the on-screen keyboard and live search
- the accounts screen and the device-flow error path (a real `oauth2.googleapis.com` round trip through `MyPC.net`)
- the streaming worker's 206 Range answers

**Not yet tested** (no TV, Google client or second device was available):

- a real Google account
- real video playback from Drive
- a Samsung TV with Tizen
- game controllers
- the cross-device scenarios (link on device 1 → restored on device 2, profile isolation, expired / revoked
  tokens)

Run them after the Google Cloud setup above.
