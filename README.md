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
| Video / audio | Streams through My PC with HTTP Range requests (seeking works, nothing is downloaded whole), play / pause, ±10 s / ±60 s, volume, previous / next, sidecar `.srt` / `.vtt` subtitles |
| Google account | My PC's own Google Drive sign-in (`MyPC.drive`, one account per My PC profile); MyDrive has no Google code of its own |
| Demo | "Try the demo" runs the whole UI on local fake data (`src/drive/mock.js`), no Google account needed |

## Controls

| Input | Action |
|---|---|
| Arrows / D-pad / left stick | Move (hold to accelerate) |
| OK / B | Open |
| Hold OK / Y | Actions menu for the selected file |
| X | Search |
| L / R | Previous / next section (viewer / player: previous / next file) |
| ZL / ZR, right stick | Page up / down (player: −60 s / +60 s; viewer: zoom) |
| A, Esc / Backspace | Back / close |
| + | MyDrive menu |
| TV remote Back | My PC's pause menu (Resume / Quit) |

Buttons are named as on a Nintendo-style pad (B bottom, A right, X top, Y left, + menu), as everywhere in My PC.
Everything also has an on-screen control, so arrows + OK are enough. The status bar shows the controls that
apply right now, and the **Controls** screen in the sidebar lists all of them.

## Google sign-in: My PC's (`MyPC.drive`)

Since version 1.1.0 MyDrive has **no Google sign-in, token, client ID, Picker or Drive API code of its own**. It uses
My PC's built-in Google Drive (SDK API level 14, guide section 19):

- Each My PC profile signs in **once**, in My PC: Control Panel > Google Drive, or MyDrive's **Sign in to Google
  Drive** button, which opens My PC's own sign-in screen (QR code + Google's page on the phone) over MyDrive.
  The first time, My PC asks once "MyDrive wants to use your Google Drive".
- My PC sends every Drive request for MyDrive. MyDrive only gets file objects and bytes, never a token.
- Switching the Google account and signing out are done in My PC (Control Panel > Google Drive).
- What MyDrive sees is what My PC may see: the **whole Drive** when My PC is set up for it (`status().full`), else
  Google's `drive.file` (files My PC and its apps made + files picked with **Add files**, which then opens My PC's
  own "Add files from your phone" QR screen; the button shows only when `status().picker` is true).
- Accounts linked in MyDrive before 1.1.0 are taken over by My PC (same Google project) the first time; MyDrive
  then empties its old `accounts` / `active` saves (no token is left in MyDrive's save data). `prefs` stay.
- An older My PC (API level < 14) gets "Update My PC (Control Panel > Update)"; the demo still works there.

`src/drive/api.js` is a thin adapter over `MyPC.drive` with the same methods as the demo (`src/drive/mock.js`).

## Google Cloud setup (store owner)

The Google client now belongs to **My PC**, not to MyDrive: it is entered once in the App Store Manager >
**Google Drive** (Firestore `settings/google`) and used by Control Panel > Google Drive, Music, MyDrive and every
app. MyDrive's own `config` needs no `google` any more (an old `google` there is only read by My PCs that have no
`settings/google` yet).

[`tools/gcloud-setup.sh`](tools/gcloud-setup.sh) can still create the Google project for you. Open
https://shell.cloud.google.com and run:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/imad-os/g_drive/main/tools/gcloud-setup.sh)
```

It enables the Drive and Picker APIs, makes the Picker API key limited to the referrer `https://pc.geekspro.us/*`
(My PC's live site, where its phone pages are), walks you through the consent screen and the two OAuth clients
(a "TVs and Limited Input devices" client, and a "Web application" client with the origin `https://pc.geekspro.us`
and the redirect URI `https://pc.geekspro.us/drive-signin.html`), then prints the values to paste into
App Store Manager > Google Drive.

## Video playback

A `<video>` element cannot send Google's `Authorization` header, and MyDrive has no token anyway.
`public/sw.js` contains only `importScripts('https://pc.geekspro.us/sdk/drive-sw.js');` (My PC's streaming
worker). The player calls `MyPC.drive.stream(file, { worker: 'sw.js' })` and plays the address it returns: the
worker answers each Range request with a 206 piece of at most 2 MB, read through My PC. Seeking works, memory
stays small, and nothing is cached. `close()` ends the address when the player leaves the file.

- Plays natively: MP4 (H.264 / AAC), WebM (VP8 / VP9), MP3, M4A / AAC, and OGG where the browser supports it.
  Samsung TVs often also play MKV and HEVC in hardware; MyDrive tries, then shows a clear message if it fails.
- Needs converting on a computer (MyDrive does no transcoding): AVI, WMV, FLV, and codecs the screen lacks.
- Without service workers, My PC downloads files up to 64 MB whole as a fallback. Larger files show an explanation.

## Project layout

```
index.html                     entry page (the SDK <script> comes first)
public/                        mypc-app.json, icon.svg, sw.js (My PC's drive-sw.js), privacy / terms pages
src/main.js                    My PC lifecycle (init / start / pause / resume / destroy), Google Drive status, app glue
src/config.js                  owner config (MyPC.app_config): pageSize, thumbConcurrency
src/store.js                   MyPC.save / load: preferences (and removal of the pre-1.1.0 accounts)
src/net.js                     AppError + concurrency limiter
src/drive/api.js               adapter over MyPC.drive (list, get, create, rename, move, copy, star, trash, read, upload, stream)
src/drive/mock.js              demo data, same interface as api.js
src/media/thumbs.js            lazy, rate-limited, LRU thumbnails
src/ui/*                       focus system, explorer, virtual grid, dialogs, on-screen keyboard, viewer, player, Google Drive screen
docs/                          build output served by GitHub Pages
```

## Test without My PC (standalone)

Open the site directly in a desktop browser, for example `https://imad-os.github.io/g_drive/` or
`http://localhost:5173` with `npm run dev`. The SDK then runs My PC's own Drive code in the page with the Google
client of every My PC (`settings/google`), shows a plain sign-in box, and keeps the account in this browser's
`localStorage` (`mypc_drive`). Use a test Google account. `?demo=1` opens the demo.

## Develop, build, publish

```bash
npm install
npm run dev          # http://localhost:5173 (?demo=1 for the demo)
npm run build        # -> docs/ (Chrome 108 target, every asset gets ?v=<version>)
```

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/docs`**. Then, in the App Store Manager
(https://imad-os.github.io/g/installer/), paste `https://imad-os.github.io/g_drive/`, press **Check** and
**Add to store**. For every release, bump `version` in `public/mypc-app.json` (and its `icon?v=`), run
`npm run build`, commit `docs/`, push, and press **Update** in the App Store Manager.

## Test status

1.1.0 was tested inside My PC (the real shell, MyDrive installed from the App Store, Chromium, a fake Google
behind My PC): welcome screen, My PC's sign-in screen over MyDrive, listing My Drive, opening a folder, playing a
WebM video through `sw.js` and seeking to 0:30 (a Range read from the middle of the file), rename and new folder
with the on-screen keyboard, upload, move to Trash, the Controls screen, the "not set up" message, and an account
linked in old MyDrive being taken over by My PC (permission asked once, old tokens removed). MyDrive itself sent
no request to Google. Not yet tested on a Samsung TV with a real Google account.
