# Cloud Shelf

Version 1.1.0. A cloud-only file explorer for My PC. It looks and behaves like a desktop file browser while clearly marking everything as cloud content.

## Controls

- Arrows move between the sidebar and folder items.
- OK opens a folder, previews a file, or closes the preview.
- In a photo preview, Left and Right switch between cloud photos in the current folder.
- Back opens the My PC pause menu.

## Providers and setup

The app runs in `demo` mode now. It is prepared for `dropbox` through a small Dropbox proxy service. It stores the last visited folder per My PC profile.

Set these values in **My PC App Store Manager → Config**:

| Key | Required | Value |
| --- | --- | --- |
| `provider` | Yes | `demo` now, then `dropbox` |
| `demoMode` | Yes | `true` for the sample library; `false` for Dropbox |
| `providerUrl` | Dropbox | HTTPS base URL for your Dropbox proxy, for example `https://drive-api.example.com` |
| `workspaceId` | Optional | A non-secret library or account label your proxy understands |
| `connectionLabel` | Optional | A displayed non-secret connection name |

`MyPC.app_config` is public to every client. Do **not** put `apiKey`, `clientSecret`, access tokens, refresh tokens, or any secured value there. Store these on the Dropbox proxy instead:

| Server-only value | Required |
| --- | --- |
| `DROPBOX_APP_KEY` | Yes |
| `DROPBOX_APP_SECRET` | Yes |
| `DROPBOX_REFRESH_TOKEN` or a per-user OAuth session store | Yes |
| Allowed origin: `https://imad-os.github.io` | Yes |

The proxy should expose `GET /health`, `GET /v1/files?path=/...&workspaceId=...`, and `GET /v1/preview?id=...`. File responses should include `id`, `name`, `type` (`folder`, `photo`, `text`, `html`, `doc`, `video`, `audio`), `size`, `modified`, plus a short `text` value or a temporary `previewUrl` when relevant.

## Publish

Enable GitHub Pages: **Settings → Pages → Deploy from a branch → main / root**. Then install `https://imad-os.github.io/g_drive/` through the My PC installer.
