/* Turns My PC input (onInput actions + MyPC.gamepad buttons and sticks) into app commands:
 *   left right up down  (with { repeat, accel } for held directions)
 *   ok, okLong (hold OK ~0.6 s), back, menu (Start/Select), ctx (X), search (Y),
 *   prevTab / nextTab (LB / RB), pageUp / pageDown (LT / RT, right stick), zoomIn / zoomOut (RT / LT in the viewer)
 * The TV remote only has arrows + OK: every command above also has an on-screen way in. */

const LONG_MS = 600;
const DIRS = { left: 1, right: 1, up: 1, down: 1 };

export class Input {
    constructor(dispatch) {
        this.dispatch = dispatch;     // (cmd, info) => void
        this.okTimer = 0;
        this.okLong = false;
        this.okDown = false;
        this.holdStart = 0;
        this.lastStick = 0;
        this.enabled = true;
        this.padNames = [];
        this._padFns = [];
    }

    /** MyPC.init's onInput */
    onInput(action, pressed, repeat, dev) {
        if (!this.enabled) return;
        if (DIRS[action]) {
            if (!pressed) { this.holdStart = 0; return; }
            const now = performance.now();
            if (!repeat || !this.holdStart) this.holdStart = now;
            const held = now - this.holdStart;
            // acceleration: 1 step per repeat, then 2 after 1.5 s, 4 after 3 s
            const accel = !repeat ? 1 : held > 3000 ? 4 : held > 1500 ? 2 : 1;
            this.dispatch(action, { repeat: !!repeat, accel, dev });
            return;
        }
        if (action === 'confirm') {
            if (repeat) return;
            if (pressed) {
                this.okDown = true; this.okLong = false;
                clearTimeout(this.okTimer);
                this.okTimer = setTimeout(() => { if (this.okDown) { this.okLong = true; this.dispatch('okLong', { dev }); } }, LONG_MS);
            } else if (this.okDown) {
                this.okDown = false;
                clearTimeout(this.okTimer);
                if (!this.okLong) this.dispatch('ok', { dev });
            }
            return;
        }
        if (!pressed || repeat) return;
        if (action === 'cancel') this.dispatch('back', { dev });
        else if (action === 'menu') this.dispatch('menu', { dev });
        // 'jump' duplicates confirm, 'run' comes with cancel on a pad: both ignored on purpose
    }

    /** Extra controller buttons (API level 9). */
    attachGamepad() {
        if (!(window.MyPC && MyPC.gamepad && MyPC.apiLevel >= 9)) return;
        const onButton = (i, pressed, value, dev, name) => {
            if (!this.enabled || !pressed) return;
            const cmd = { X: 'ctx', Y: 'search', LB: 'prevTab', RB: 'nextTab', LT: 'trigL', RT: 'trigR' }[name];
            if (cmd) this.dispatch(cmd, { dev });
        };
        const onAxes = (axes, dev) => {
            if (!this.enabled) return;
            const y = axes[3] || 0;
            const now = performance.now();
            if (Math.abs(y) > 0.6 && now - this.lastStick > 280) {
                this.lastStick = now;
                this.dispatch(y > 0 ? 'stickDown' : 'stickUp', { dev });
            }
        };
        const onPads = (list) => { this.padNames = (list || []).map((p) => p.name); this.dispatch('pads', { list }); };
        this._padFns = [MyPC.gamepad.on('button', onButton), MyPC.gamepad.on('axes', onAxes), MyPC.gamepad.on('pads', onPads)];
    }

    hasPad() { return this.padNames.length > 0; }

    destroy() {
        clearTimeout(this.okTimer);
        this._padFns.forEach((off) => typeof off === 'function' && off());
        this._padFns = [];
        this.enabled = false;
    }
}
