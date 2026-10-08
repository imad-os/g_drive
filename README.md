# Cloud Shelf

Version 1.0.0. A cloud-only file explorer for My PC. It looks and behaves like a desktop file browser while clearly marking everything as cloud content.

## Controls

- Arrows move between the sidebar and folder items.
- OK opens a folder, previews a file, or closes the preview.
- Back opens the My PC pause menu.

## Current provider

The first version is ready with a realistic demo library so the full remote experience can be reviewed before a storage provider is connected. It stores the last visited folder per My PC profile.

`providerUrl` and `demoMode` are owner settings in `mypc-app.json`. Do not put a storage API key in this static site or in My PC app config: both are visible to every client. When you provide the provider details, connect the app to a small authenticated service at `providerUrl`; that service should keep the API key and return folder lists and temporary preview links.

## Publish

Enable GitHub Pages: **Settings → Pages → Deploy from a branch → main / root**. Then install `https://imad-os.github.io/g_drive/` through the My PC installer.
