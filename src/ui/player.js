/* TV video / audio player.
 * On a Samsung TV (My PC 24+, MyPC.video.drive()): the TV's own player plays 'drive:<file id>' (guide section 21). My PC makes
 * the link with the sign-in, every format the TV plays works (MKV, AVI, HEVC...) and seeking too. The TV's <video> does NOT
 * go through public/sw.js (owner report 2026-11-20: "This screen cannot play ... (video/mp4)"), so on a TV only this works.
 * The picture is drawn behind the page: the player and the page are transparent meanwhile (html.tv-video).
 * Elsewhere: the <video> streams from Drive through My PC (MyPC.drive.stream + public/sw.js: Range requests in 2 MB pieces),
 * so seeking works and a movie is never held in memory as a whole. Where service workers are missing, My PC downloads a
 * small file whole and it plays from a blob. */

import { h, formatTime } from './dom.js';
import { Layer, onActivate } from './focus.js';
import { progressText } from './progress.js';
import { icon } from './icons.js';

const HIDE_MS = 4500;

function tvDrive() { try { return !!(window.MyPC && MyPC.video && MyPC.video.drive && MyPC.video.drive()); } catch (e) { return false; } }
// cues of a .vtt text: [{ s, e, text }] (the TV's player draws no subtitle file: MyDrive does)
function vttCues(vtt) {
    const out = [], sec = (x) => { const p = x.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    for (const block of String(vtt).split(/\n\s*\n/)) {
        const m = /([\d:.]+)\s*-->\s*([\d:.]+)[^\n]*\n([\s\S]*)/.exec(block);
        if (m) out.push({ s: sec(m[1]), e: sec(m[2]), text: m[3].replace(/<[^>]+>/g, '').trim() });
    }
    return out;
}

function srtToVtt(text) {
    return 'WEBVTT\n\n' + String(text).replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

export class Player extends Layer {
    constructor(app, files, index, siblings) {
        super(h('div', { class: 'player' }));
        this.app = app; this.files = files; this.index = Math.max(0, index); this.siblings = siblings || [];
        this.stream = null; this.trackUrl = ''; this.hideTimer = 0; this.wasPlaying = false; this.raf = 0;
        this.video = h('video', { class: 'player-video', preload: 'metadata', playsinline: '' });
        this.tv = tvDrive(); this.gen = 0; this.cues = null; this.subOn = true;
        this.tst = { t: 0, d: 0, playing: false, at: 0, open: false };
        this.sub = h('div', { class: 'player-sub' });
        this.poster = h('div', { class: 'player-audio', html: icon.audio });
        this.msg = h('div', { class: 'player-msg' });
        this.title = h('div', { class: 'player-title' });
        this.timeNow = h('span', { class: 'ptime' }, '0:00');
        this.timeEnd = h('span', { class: 'ptime' }, '--:--');
        this.fill = h('div', { class: 'seek-fill' });
        this.buf = h('div', { class: 'seek-buf' });
        this.seek = h('div', { class: 'seek', role: 'slider', 'aria-label': 'Seek' }, this.buf, this.fill, h('div', { class: 'seek-knob' }));
        onActivate(this.seek, () => this.togglePlay());
        this.seek.addEventListener('click', (e) => { const r = this.seek.getBoundingClientRect(); if (this.dur()) this.seekTo((e.clientX - r.left) / r.width * this.dur()); });
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
        this.el.append(this.video, this.sub, this.poster, this.msg, h('div', { class: 'player-top' }, this.title), this.controls);
        if (this.tv) this.bindTv(); else this.bindVideo();
    }

    // the TV's player (MyPC.video): its news come as events; the time is guessed between its reports (twice a second)
    bindTv() {
        this.el.classList.add('tv');
        this.video.style.display = 'none';
        this.controls.querySelectorAll('.vol-label, [aria-label^="Volume"]').forEach((x) => { x.style.display = 'none'; });    // the remote's own volume
        document.documentElement.classList.add('tv-video');
        const st = this.tst;
        this.offs = [
            MyPC.video.on('time', (e) => { st.t = e.t; if (e.d) st.d = e.d; st.at = performance.now(); }),
            MyPC.video.on('state', (e) => {
                if (!st.open) return;
                const was = st.playing;
                st.playing = e.state === 'playing'; st.at = performance.now();
                this.status(e.state === 'buffering' ? 'Buffering…' : '');
                if (st.playing && !was) this.onV.play(); else if (!st.playing && was && e.state !== 'buffering') this.onV.pause();
                if (e.state === 'ended') this.onV.ended();
            }),
            MyPC.video.on('error', (e) => { if (st.open) { st.playing = false; this.tvError(e); } })
        ];
        this.onV = {
            play: () => { this.playBtn.querySelector('.ico').innerHTML = icon.pause; this.armHide(); this.loop(); },
            pause: () => { this.playBtn.querySelector('.ico').innerHTML = icon.play; this.showControls(); },
            ended: () => { if (this.index < this.files.length - 1) this.step(1); }
        };
    }
    tvError(e) {
        const f = this.files[this.index] || {};
        if (e && (e.code === 'signed-out' || e.code === 'reauth' || e.code === 'noconfig')) { this.app.handleError(e); this.status(e.message, true); return; }
        this.status(e && e.code === 'format' ? `This TV cannot play "${f.name}".`
            : e && e.code === 'denied' ? 'MyDrive is not allowed to use your Google Drive: sign in again from the menu.'
            : e && e.code === 'not-found' ? 'This file is no longer on Google Drive.'
            : 'Playback failed (network or file error).', true);
    }
    // one set of calls for both players
    now() { const st = this.tst; return this.tv ? Math.min(st.d || 1e9, st.t + (st.playing && st.at ? (performance.now() - st.at) / 1000 : 0)) : this.video.currentTime; }
    dur() { return this.tv ? this.tst.d : this.video.duration; }
    isPaused() { return this.tv ? !this.tst.playing : this.video.paused; }
    hasMedia() { return this.tv ? this.tst.open : !!this.video.getAttribute('src'); }
    seekTo(t) {
        if (!this.tv) { this.video.currentTime = t; return; }
        this.tst.t = t; this.tst.at = performance.now();
        MyPC.video.seek(t).catch(() => {});
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
        const my = ++this.gen;
        if (this.tv) {
            this.status('Loading…');
            this.showControls();
            this.tst.t = 0; this.tst.d = 0; this.tst.playing = false;
            try {
                const r = await MyPC.video.open('drive:' + f.id, { name: f.name });
                if (this.closed || my !== this.gen) return;
                this.tst.open = true; this.tst.d = (r && r.duration) || this.tst.d; this.tst.playing = true; this.tst.at = performance.now();
                this.timeEnd.textContent = formatTime(this.tst.d);
                this.status('');
                this.onV.play();
                this.attachSubs(f);
            } catch (e) {
                if (!this.closed && my === this.gen && e.code !== 'cancelled') this.tvError(e);
            }
            return;
        }
        const can = this.video.canPlayType(f.mimeType);
        this.status(can ? 'Loading…' : 'Loading… (this format may not play on this screen)');
        this.showControls();
        let st;
        try {
            st = await this.app.source.stream(f, (p) => {
                if (!this.closed && this.files[this.index] === f) this.status('Loading… ' + progressText(p, +f.size || 0));
            });
        } catch (e) {
            if (!this.closed && this.files[this.index] === f && e.code !== 'cancelled') this.status(e.message, true);
            return;
        }
        if (this.closed || this.files[this.index] !== f) { st.close(); return; }
        if (this.stream) this.stream.close();
        this.stream = st;
        this.video.src = st.url;
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
            if (this.tv) { this.cues = vttCues(text); this.subOn = true; this.ccBtn.classList.add('on'); return; }
            this.trackUrl = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
            const tr = h('track', { kind: 'subtitles', src: this.trackUrl, srclang: this.app.lang || 'en', label: sub.name, default: '' });
            this.video.appendChild(tr);
            tr.track.mode = 'showing';
            this.ccBtn.classList.add('on');
        } catch (e) { this.ccBtn.disabled = true; }
    }

    toggleSubs() {
        if (this.tv) { if (!this.cues) return; this.subOn = !this.subOn; this.ccBtn.classList.toggle('on', this.subOn); this.drawSub(); return; }
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

    togglePlay() {
        if (!this.hasMedia()) return;
        if (this.tv) {
            const st = this.tst;
            if (st.playing) { st.t = this.now(); st.playing = false; MyPC.video.pause().catch(() => {}); this.onV.pause(); }
            else { st.playing = true; st.at = performance.now(); MyPC.video.play().catch(() => {}); this.onV.play(); }
            return;
        }
        const v = this.video; if (v.paused) v.play().catch(() => {}); else v.pause();
    }
    skip(s) {
        const d = this.dur();
        if (!d) return;
        this.seekTo(Math.max(0, Math.min(d - 0.5, this.now() + s)));
        this.paintTime(); this.showControls();
    }
    volume(d) {
        if (this.tv) return;
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

    drawSub() {
        if (!this.tv) return;
        let text = '';
        if (this.cues && this.subOn) { const t = this.now(); const c = this.cues.find((x) => t >= x.s && t <= x.e); if (c) text = c.text; }
        if (this.sub.textContent !== text) { this.sub.textContent = text; this.sub.classList.toggle('on', !!text); }
    }
    paintTime() {
        const d = this.dur();
        if (!d) return;
        this.timeNow.textContent = formatTime(this.now());
        this.fill.style.transform = `scaleX(${Math.min(1, this.now() / d)})`;
        if (this.tv) return;
        const v = this.video;
        const b = v.buffered;
        if (b.length) this.buf.style.transform = `scaleX(${b.end(b.length - 1) / v.duration})`;
    }
    loop() {
        // the time is painted 4 times a second while playing and the controls are visible
        clearTimeout(this.raf);
        if (this.isPaused() || this.closed) return;
        if (!this.el.classList.contains('hide-ui')) this.paintTime();
        this.drawSub();
        this.raf = setTimeout(() => this.loop(), 250);
    }

    showControls() { this.el.classList.remove('hide-ui'); this.paintTime(); this.armHide(); }
    armHide() {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => { if (!this.isPaused() && !this.msg.classList.contains('on')) this.el.classList.add('hide-ui'); }, HIDE_MS);
    }

    handle(cmd, info) {
        const hidden = this.el.classList.contains('hide-ui');
        if (hidden) {
            // controls hidden: arrows act directly, OK shows the controls
            this.showControls();
            if (cmd === 'left' || cmd === 'right') { this.skip((cmd === 'left' ? -10 : 10) * (info.accel || 1)); return true; }
            if (cmd === 'up' || cmd === 'down') { if (!this.tv) this.volume(cmd === 'up' ? 0.1 : -0.1); return true; }
            if (cmd === 'ok') return true;
        }
        this.armHide();
        if (this.current === this.seek && (cmd === 'left' || cmd === 'right')) { this.skip((cmd === 'left' ? -10 : 10) * (info.accel || 1)); return true; }
        switch (cmd) {
            case 'back': if (!hidden && !this.isPaused()) { this.el.classList.add('hide-ui'); return true; } this.close(); return true;
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
    // (the TV's player: My PC pauses it under its menu and plays it again on Resume by itself)
    suspend() { if (this.tv) return; this.wasPlaying = !this.video.paused; this.video.pause(); }
    resume() { if (this.tv) return; if (this.wasPlaying) this.video.play().catch(() => {}); }

    release() {
        if (this.tv) {
            this.gen++;
            if (this.tst.open) MyPC.video.stop().catch(() => {});
            this.tst.open = false; this.tst.playing = false; this.cues = null; this.drawSub();
            this.ccBtn.classList.remove('on');
            return;
        }
        const v = this.video;
        v.pause();
        Array.from(v.querySelectorAll('track')).forEach((t) => t.remove());
        v.removeAttribute('src');
        try { v.load(); } catch (e) { /* nothing loaded */ }
        if (this.stream) { this.stream.close(); this.stream = null; }
        if (this.trackUrl) { URL.revokeObjectURL(this.trackUrl); this.trackUrl = ''; }
        this.ccBtn.classList.remove('on');
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.hideTimer); clearTimeout(this.raf);
        if (this.tv) { (this.offs || []).forEach((off) => off()); document.documentElement.classList.remove('tv-video'); }
        else for (const k in this.onV) this.video.removeEventListener(k, this.onV[k]);
        this.release();
        this.stack.remove(this);
    }
}
