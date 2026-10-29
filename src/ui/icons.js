/* Original line icons (24×24, stroke = currentColor) and coloured file-type glyphs. */

const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icon = {
    back: S('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    forward: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    up: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    refresh: S('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    search: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    sort: S('<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M14 6h7M14 11h5M14 16h3"/>'),
    view: S('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    list: S('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    more: S('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    newFolder: S('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><path d="M12 11v5M9.5 13.5h5"/>'),
    upload: S('<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
    cut: S('<circle cx="6" cy="17.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M8 16 18 4M16 16 6 4"/>'),
    copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
    paste: S('<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3.8A.8.8 0 0 1 9.8 3h4.4a.8.8 0 0 1 .8.8V5M9 11h6M9 15h4"/>'),
    rename: S('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    star: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    starFill: S('<path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>'),
    restore: S('<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/><path d="M12 8v4l3 2"/>'),
    info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>'),
    drive: S('<path d="M3.5 15.5 8.5 6.5h7l5 9-2.5 4h-12z"/><path d="M8.5 6.5l5 9h7M3.5 15.5h10"/>'),
    clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
    image: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5L5 19.5"/>'),
    video: S('<rect x="3" y="5.5" width="13" height="13" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>'),
    audio: S('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
    doc: S('<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>'),
    user: S('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.3-3.7 4-5.5 7.5-5.5s6.2 1.8 7.5 5.5"/>'),
    link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    unlink: S('<path d="M15 9l-6 6M9.5 5.5l1-1a4 4 0 0 1 5.7 5.7l-1 1M14.5 18.5l-1 1a4 4 0 0 1-5.7-5.7l1-1M4 4l16 16"/>'),
    close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    play: S('<path fill="currentColor" d="M7 4.5v15l12.5-7.5z"/>'),
    pause: S('<path fill="currentColor" d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/>'),
    prev: S('<path fill="currentColor" d="M18 5v14L8 12z"/><path d="M6 5v14"/>'),
    next: S('<path fill="currentColor" d="M6 5v14l10-7z"/><path d="M18 5v14"/>'),
    rew: S('<path d="M11 7 6 12l5 5M18 7l-5 5 5 5"/>'),
    ffw: S('<path d="M13 7l5 5-5 5M6 7l5 5-5 5"/>'),
    volUp: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    volDown: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>'),
    cc: S('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M10 10.3a2.2 2.2 0 1 0 0 3.4M17 10.3a2.2 2.2 0 1 0 0 3.4"/>'),
    zoomIn: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5"/>'),
    zoomOut: S('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/>'),
    fit: S('<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>'),
    phone: S('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
    gamepad: S('<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.8 3.8a2 2 0 0 1-3.5.8L15.5 16h-7l-1.6 2a2 2 0 0 1-3.5-.8l-.8-3.8A4.5 4.5 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".6"/><circle cx="17.5" cy="13.5" r=".6"/>'),
    exit: S('<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10"/>'),
    backspace: S('<path d="M8.5 5H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8.5L3 12z"/><path d="M11.5 9.5l5 5M16.5 9.5l-5 5"/>'),
    shift: S('<path d="M12 4 4 12h4.5v7h7v-7H20z"/>'),
    space: S('<path d="M4 10v4h16v-4"/>')
};

const TYPE = [
    [/folder$/, 'folder', '#f2c14e'],
    [/^image\//, 'image', '#3cc8b4'],
    [/^video\//, 'video', '#a77bff'],
    [/^audio\//, 'audio', '#ff9b52'],
    [/pdf$/, 'pdf', '#ff6161'],
    [/spreadsheet|ms-excel|csv/, 'sheet', '#3fbf6b'],
    [/presentation|powerpoint/, 'slides', '#f5b335'],
    [/document|msword|wordprocessing/, 'doc', '#4f8dff'],
    [/zip|compressed|x-7z|x-rar|x-tar|gzip/, 'archive', '#c79a6b'],
    [/^text\/|json|xml|subrip|vtt/, 'text', '#a7b0bd']
];

export function fileKind(mime) {
    for (const [re, kind] of TYPE) if (re.test(mime || '')) return kind;
    return 'file';
}
export function kindColor(kind) {
    const t = TYPE.find((x) => x[1] === kind);
    return t ? t[2] : '#8a94a3';
}

/** Big coloured glyph for a file kind (used when there is no thumbnail). */
export function fileGlyph(kind) {
    const c = kindColor(kind);
    if (kind === 'folder') {
        return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 12.5A3.5 3.5 0 0 1 7.5 9H18l4 4h18.5a3.5 3.5 0 0 1 3.5 3.5v19a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 35.5z" fill="#c9952d"/>`
            + `<path d="M4 18.5A3.5 3.5 0 0 1 7.5 15h33a3.5 3.5 0 0 1 3.5 3.5v17a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 35.5z" fill="${c}"/></svg>`;
    }
    const label = { image: 'IMG', video: 'VID', audio: 'AUD', pdf: 'PDF', sheet: 'XLS', slides: 'PPT', doc: 'DOC', archive: 'ZIP', text: 'TXT', file: '' }[kind] || '';
    return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 4h18l10 10v28a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#2f343c" stroke="${c}" stroke-width="2"/>`
        + `<path d="M29 4v10h10" fill="none" stroke="${c}" stroke-width="2"/>`
        + (label ? `<rect x="6" y="25" width="30" height="12" rx="2.5" fill="${c}"/><text x="21" y="34" text-anchor="middle" font-size="8.5" font-weight="700" font-family="Segoe UI,Arial,sans-serif" fill="#111">${label}</text>` : '')
        + '</svg>';
}
