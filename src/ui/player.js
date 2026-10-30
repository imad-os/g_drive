/* TV video / audio player. The <video> streams from Drive through the streaming worker (Range requests,
 * 2 MB pieces), so seeking works and a movie is never held in memory as a whole. */

import { h, formatTime, formatSize } from './dom.js';
import { Layer, onActivate } from './focus.js';
import { progressText } from './progress.js';
import { icon } from './icons.js';
import { openStream } from '../media/stream.js';

const HIDE_MS = 4500;
const FALLBACK_MAX = 64 * 1024 * 1024;     // no streaming worker: small files only, as one blob

function srtToVtt(text) {
    return 'WEBVTT\n\n' + String(text).replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

export class Player extends Layer {
    constructor(app, files, index, siblings) {
        super(h('div', { class: 'player' }));
        this.app = app; this.files = files; this.index = Math.max(0, index); this.siblings = siblings || [];
        this.stream = null; this.blobUrl = ''; this.trackUrl = ''; this.hideTimer = 0; this.wasPlaying = false; this.raf = 0;
        this.video = h('video', { class: 'player-video', preload: 'metadata', playsinline: '' });
        this.poster = h('div', { class: 'player-audio', html: icon.audio });
        this.msg = h('div', { class: 'player-msg' });
        this.title = h('div', { class: 'player-title' });
        this.timeNow = h('span', { class: 'ptime' }, '0:00');
        this.timeEnd = h('span', { class: 'ptime' }, '--:--');
        this.fill = h('div', { class: 'seek-fill' });
        this.buf = h('div', { class: 'seek-buf' });
        this.seek = h('div', { class: 'seek', role: 'slider', 'aria-label': 'Seek' }, this.buf, this.fill, h('div', { class: 'seek-knob' }));
        onActivate(this.seek, () => this.togglePlay());
        this.seek.addEventListener('click', (e) => { const r = this.seek.getBoundingClientRect(); if (this.video.duration) this.video.currentTime = (e.clientX - r.left) / r.width * this.video.duration; });
        const b = (ic, label, fn) => onActivate(h('button', { class: 'vbtn', type: 'button', 'aria-label': label }, h('span', { class: 'ico', html: ic })), fn);
        this.playBtn = b(icon.pause, 'Play / pause', () => this.togglePlay());
        this.playBtn.setAttribute('data-autofocus', '1');
        this.ccBtn = b(icon.cc, 'Subtitles', () => this.toggleSubs());
        this.volLabel = h('span', { class: 'vol-label' });
        this.controls = h('div', { class: 'player-controls' },
            h('div', { class: 'seek-row' }, this.timeNow, this.seek, this.timeEnd),
            h('div', { class: 'btn-row' },
                b(icon.close, 'Close', () => this.close()),
                b(icon.prev, 'Previous', () => this.step(-1)),
                b(icon.rew, 'Back 10 s', () => this.skip(-10)),
                this.playBtn,
                b(icon.ffw, 'Forward 30 s', () => this.skip(30)),
                b(icon.next, 'Next', () => this.step(1)),
                h('span', { class: 'btn-gap' }),
                b(icon.volDown, 'Volume down', () => this.volume(-0.1)),
                this.volLabel,
                b(icon.volUp, 'Volume up', () => this.volume(0.1)),
                this.ccBtn));
        this.el.append(this.video, this.poster, this.msg, h('div', { class: 'player-top' }, this.title), this.controls);
        this.bindVideo();
    }

    bindVideo() {
        const v = this.video;
        this.onV = {
            play: () => { this.playBtn.querySelector('.ico').innerHTML = icon.pause; this.armHide(); this.loop(); },
            pause: () => { this.playBtn.querySelector('.ico').innerHTML = icon.play; this.showControls(); },
            waiting: () => this.status('Buffering…'),
            playing: () => this.status(''),
            canplay: () => this.status(''),
            loadedmetadata: () => { this.timeEnd.textContent = formatTime(v.duration); this.paintTime(); },
            ended: () => { if (this.index < this.files.length - 1) this.step(1); },
            error: () => this.onError()
        };
        for (const k in this.onV) v.addEventListener(k, this.onV[k]);
    }

    onShow() { this.focusFirst(); this.load(); this.volume(0); }

    async load() {
        this.release();
        const f = this.files[this.index];
        if (!f) return;
        this.title.textContent = `${f.name}   ·   ${this.index + 1} / ${this.files.length}`;
        this.timeNow.textContent = '0:00'; this.timeEnd.textContent = '--:--'; this.fill.style.transform = 'scaleX(0)';
        const audio = /^audio\//.test(f.mimeType);
        this.el.classList.toggle('is-audio', audio);
        const can = this.video.canPlayType(f.mimeType);
        this.status(can ? 'Loading…' : 'Loading… (this format may not play on this screen)');
        this.showControls();
        const streaming = await this.app.streaming;
        if (this.closed || this.files[this.index] !== f) return;
        if (streaming) {
            this.stream = openStream(f);
            this.video.src = this.stream.url;
        } else if ((+f.size || 0) <= FALLBACK_MAX) {
            try {
                const r = await this.app.source.download(f.id, undefined, (p) => {
                    if (!this.closed && this.files[this.index] === f) this.status('Loading… ' + progressText(p, +f.size || 0));
                });
                if (this.closed || this.files[this.index] !== f) return;
                this.blobUrl = URL.createObjectURL(new Blob([r.buf], { type: f.mimeType }));
                this.video.src = this.blobUrl;
            } catch (e) { this.status(e.message, true); return; }
        } else {
            this.status(`Streaming is not available in this browser, and this file (${formatSize(f.size)}) is too big to load at once.`, true);
            return;
        }
        this.attachSubs(f);
        this.video.play().catch(() => { /* autoplay refused: the play button is focused */ });
    }

    /** A .srt or .vtt with the same base name in the same folder becomes a subtitle track. */
    async attachSubs(f) {
        const base = f.name.replace(/\.[^.]+$/, '').toLowerCase();
        const sub = this.siblings.find((s) => /\.(srt|vtt)$/i.test(s.name) && s.name.replace(/\.[^.]+$/, '').toLowerCase() === base);
        this.ccBtn.disabled = !sub;
        if (!sub) return;
        try {
            const r = await this.app.source.download(sub.id);
            if (this.closed || this.files[this.index] !== f) return;
            let text = new TextDecoder().decode(r.buf);
            if (/\.srt$/i.test(sub.name)) text = srtToVtt(text);
            this.trackUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
            const tr = h('track', { kind: 'subtitles', src: this.trackUrl, srclang: this.app.lang || 'en', label: sub.name, default: '' });
            this.video.appendChild(tr);
            tr.track.mode = 'showing';
            this.ccBtn.classList.add('on');
        } catch (e) { this.ccBtn.disabled = true; }
    }

    toggleSubs() {
        const t = this.video.textTracks[0];
        if (!t) return;
        t.mode = t.mode === 'showing' ? 'hidden' : 'showing';
        this.ccBtn.classList.toggle('on', t.mode === 'showing');
    }

    onError() {
        if (this.closed || !this.video.getAttribute('src')) return;
        const f = this.files[this.index];
        const se = this.stream && this.stream.lastError();
        if (se) { this.app.handleError(se); this.status(se.message, true); return; }
        const code = this.video.error ? this.video.error.code : 0;
        this.status(code === 4
            ? `This screen cannot play "${f.name}" (${f.mimeType}). Formats that play: MP4 (H.264/AAC), WebM, MP3, M4A; others would need converting on a computer.`
            : 'Playback failed (network or file error).', true);
    }

    status(text, isError) {
        this.msg.textContent = text || '';
        this.msg.className = 'player-msg' + (text ? ' on' : '') + (isError ? ' error' : '');
        if (isError) this.showControls();
    }

    togglePlay() { const v = this.video; if (!v.getAttribute('src')) return; if (v.paused) v.play().catch(() => {}); else v.pause(); }
    skip(s) {
        const v = this.video;
        if (!v.duration) return;
        v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + s));
        this.paintTime(); this.showControls();
    }
    volume(d) {
        const v = this.video;
        v.volume = Math.max(0, Math.min(1, Math.round((v.volume + d) * 10) / 10));
        this.volLabel.textContent = Math.round(v.volume * 100) + '%';
    }
    step(d) {
        const i = this.index + d;
        if (i < 0 || i >= this.files.length) return;
        this.index = i;
        this.load();
    }

    paintTime() {
        const v = this.video;
        if (!v.duration) return;
        this.timeNow.textContent = formatTime(v.currentTime);
        this.fill.style.transform = `scaleX(${v.currentTime / v.duration})`;
        const b = v.buffered;
        if (b.length) this.buf.style.transform = `scaleX(${b.end(b.length - 1) / v.duration})`;
    }
    loop() {
        // the time is painted 4 times a second while playing and the controls are visible
        clearTimeout(this.raf);
        if (this.video.paused || this.closed) return;
        if (!this.el.classList.contains('hide-ui')) this.paintTime();
        this.raf = setTimeout(() => this.loop(), 250);
    }

    showControls() { this.el.classList.remove('hide-ui'); this.paintTime(); this.armHide(); }
    armHide() {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => { if (!this.video.paused && !this.msg.classList.contains('on')) this.el.classList.add('hide-ui'); }, HIDE_MS);
    }

    handle(cmd, info) {
        const hidden = this.el.classList.contains('hide-ui');
        if (hidden) {
            // controls hidden: arrows act directly, OK shows the controls
            this.showControls();
            if (cmd === 'left' || cmd === 'right') { this.skip((cmd === 'left' ? -10 : 10) * (info.accel || 1)); return true; }
            if (cmd === 'up' || cmd === 'down') { this.volume(cmd === 'up' ? 0.1 : -0.1); return true; }
            if (cmd === 'ok') return true;
        }
        this.armHide();
        if (this.current === this.seek && (cmd === 'left' || cmd === 'right')) { this.skip((cmd === 'left' ? -10 : 10) * (info.accel || 1)); return true; }
        switch (cmd) {
            case 'back': if (!hidden && !this.video.paused) { this.el.classList.add('hide-ui'); return true; } this.close(); return true;
            case 'prevTab': this.step(-1); return true;
            case 'nextTab': this.step(1); return true;
            case 'trigL': this.skip(-60); return true;
            case 'trigR': this.skip(60); return true;
            case 'ctx': this.toggleSubs(); return true;
            case 'menu': case 'search': this.togglePlay(); return true;
            case 'okLong': this.togglePlay(); return true;
            default: return super.handle(cmd, info);
        }
    }

    /** onPause of My PC: stop the sound; onResume: play again if it was playing. */
    suspend() { this.wasPlaying = !this.video.paused; this.video.pause(); }
    resume() { if (this.wasPlaying) this.video.play().catch(() => {}); }

    release() {
        const v = this.video;
        v.pause();
        Array.from(v.querySelectorAll('track')).forEach((t) => t.remove());
        v.removeAttribute('src');
        try { v.load(); } catch (e) { /* nothing loaded */ }
        if (this.stream) { this.stream.close(); this.stream = null; }
        if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = ''; }
        if (this.trackUrl) { URL.revokeObjectURL(this.trackUrl); this.trackUrl = ''; }
        this.ccBtn.classList.remove('on');
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.hideTimer); clearTimeout(this.raf);
        for (const k in this.onV) this.video.removeEventListener(k, this.onV[k]);
        this.release();
        this.stack.remove(this);
    }
}
