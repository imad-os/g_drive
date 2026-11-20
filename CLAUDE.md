# This repository is a My PC app or game

**Main instruction: before every task, fetch the latest My PC guide from GitHub and follow it.**

1. Guide (always fetch it fresh, never work from memory or a saved copy):
   https://raw.githubusercontent.com/imad-os/g/main/sdk/GUIDE.md
   (if that fails: https://imad-os.github.io/g/sdk/GUIDE.md)
2. SDK (load it with a `<script>` tag from this address; never copy it into this repo):
   https://imad-os.github.io/g/sdk/mypc-sdk.js
3. Working example: https://github.com/imad-os/g/tree/main/sdk/example

The guide says how the app must be built (files, `mypc-app.json`, lifecycle, TV remote input,
screen, performance, languages, publishing). Follow every MUST, finish each task with its
checklist, and when the guide has changed, update this app to match it. If anything in this file
disagrees with the guide, the guide wins.

Touch controls: My PC draws a customizable pad on phones by itself (guide, "Touch controls"); do not build one, or set `"touch": false` in `mypc-app.json`.

For multiplayer use `MyPC.multiplayer` (section "Multiplayer" of the guide): no own lobby, no backend, no Firebase keys.

For every release: bump `version` in `mypc-app.json` and the same `?v=<version>` on every own file
`index.html` loads (section 10 of the guide), so TVs never open old cached files.

When a task is done: commit, push, and tell the owner the address to paste into the My PC
App Store Manager (https://imad-os.github.io/g/installer/): `https://<owner>.github.io/<repo>/`
(GitHub Pages: Settings → Pages → Deploy from a branch → main / root), and to press **Update** next to
the app in the App Store Manager once GitHub Pages has published it.

## This app (MyDrive)

- Built with Vite: source in `src/`, `index.html`, `public/`; `npm run build` writes the site to `docs/`.
  Commit `docs/` with every release. GitHub Pages serves **main / docs** (not main / root).
- Version: `public/mypc-app.json` (`version` and the `icon?v=`); the build adds `?v=<version>` to every asset.
- **Google Drive is My PC's (owner decision 2026-11-06, version 1.1.0): MyDrive uses only `MyPC.drive` (guide section 19).**
  Never add a Google sign-in, token, client ID / secret, Picker, `MyPC.net` call to googleapis.com or Drive API code here.
  `src/drive/api.js` adapts `MyPC.drive` to the methods the screens call (same interface as `src/drive/mock.js`, the demo).
  Sign-in = `MyPC.drive.signIn()` (My PC's screen); switching account / signing out is in My PC (Control Panel > Google Drive).
  "Add files" = `MyPC.drive.addFiles()`, shown only when `status().picker`. Video: `MyPC.drive.stream(file, { worker: 'sw.js' })`,
  `public/sw.js` = only `importScripts('https://pc.geekspro.us/sdk/drive-sw.js');` (My PC's live site is https://pc.geekspro.us).
  Pre-1.1.0 saves `accounts` / `active` are emptied once `status()` says `configured` (My PC has taken them over by then).
- **USB drives + copies Drive <-> USB (version 1.2.0, owner request 2026-11-10): My PC copies (guide section 20).** MyDrive only browses
  with `MyPC.usb` and asks with `MyPC.copy` (`src/drive/usb.js`, `src/ui/copies.js`); never read / write the TV's files or move a copy's
  bytes in MyDrive. Shown only when `MyPC.info().bridges.usb === 1`. Places `{ kind: 'usbroot' }` / `{ kind: 'usb', id: path }` in the explorer.
- Controls and hints: A B X Y + **+** in the Nintendo places (B bottom = open / OK, A right = back, Y left = actions,
  X top = search, L / R sections, ZL / ZR pages, + = MyDrive menu). Never A B C or "Menu".
