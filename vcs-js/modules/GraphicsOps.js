/**
 * GraphicsOps Module - Canvas-based graphics for browser
 */

(function(global) {
    // Get VcsValue from appropriate source
    const VcsValue = (typeof window !== 'undefined' && window.VcsValue)
        ? window.VcsValue
        : (typeof require !== 'undefined' ? require('../vcs.js').VcsValue : null);

    class GraphicsOps {
        constructor() {
            this.name = 'graphics-ops';
            this._canvas = null;
            this._ctx = null;
            this._isRunning = false;
            this._startTime = 0;
            this._keysDown = new Set();
            this._gameState = new Map();
            this._listenersInstalled = false;
        }

        /**
         * Signature matches `VcsEngine.step()`:
         *   eval(method_id, args, ctx, regs, strings) -> VcsValue
         */
        eval(id, a, ctx) {
            switch (id) {
                case 0: return this._initWindow(a);
                case 1: return this._closeWindow();
                case 2: return this._clearScreen(a);
                case 3: return this._drawRect(a);
                case 4: return this._drawCircle(a);
                case 5: return this._drawText(a);
                case 6: return this._present();
                case 7: return this._pollEvents();
                case 8: return this._isKeyDown(a);
                case 9: return this._getTime();
                case 10: return this._delay(a, ctx);
                case 11: return this._randomInt(a);
                case 12: return this._randomFloat(a);
                case 13: return this._setGameState(a);
                case 14: return this._getGameState(a);
                default: throw new Error(`Unknown graphics-ops operation ID: ${id}`);
            }
        }

        _initWindow(a) {
            const width = a.int(0, 800);
            const height = a.int(1, 600);
            const title = a.string(2, 'LLMVCC Graphics');

            // Update document title
            if (typeof document !== 'undefined') {
                document.title = title;

                // Create or get canvas
                this._canvas = document.getElementById('gameCanvas');
                if (!this._canvas) {
                    this._canvas = document.createElement('canvas');
                    this._canvas.id = 'gameCanvas';
                    document.body.appendChild(this._canvas);
                }

                this._canvas.width = width;
                this._canvas.height = height;
                this._ctx = this._canvas.getContext('2d');

                // Key event handlers
                if (!this._listenersInstalled) {
                    this._listenersInstalled = true;
                    document.addEventListener('keydown', (e) => {
                        // Avoid breaking typing in inputs/textareas/contenteditable
                        const target = e.target;
                        const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
                        const isTypingTarget =
                            tag === 'input' ||
                            tag === 'textarea' ||
                            (target && target.isContentEditable);
                        if (!isTypingTarget) this._keysDown.add(e.keyCode);
                    });
                    document.addEventListener('keyup', (e) => {
                        this._keysDown.delete(e.keyCode);
                    });
                }
            }

            this._startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            this._isRunning = true;
            return VcsValue.Bool(true);
        }

        _closeWindow() {
            this._isRunning = false;
            return VcsValue.Bool(true);
        }

        _clearScreen(a) {
            if (!this._ctx) return VcsValue.Bool(false);
            const r = a.int(0, 0), g = a.int(1, 0), b = a.int(2, 0);
            this._ctx.fillStyle = `rgb(${r},${g},${b})`;
            this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
            return VcsValue.Bool(true);
        }

        _drawRect(a) {
            if (!this._ctx) return VcsValue.Bool(false);
            const x = a.int(0), y = a.int(1);
            const w = a.int(2, 10), h = a.int(3, 10);
            const r = a.int(4, 255), g = a.int(5, 255), b = a.int(6, 255);
            this._ctx.fillStyle = `rgb(${r},${g},${b})`;
            this._ctx.fillRect(x, y, w, h);
            return VcsValue.Bool(true);
        }

        _drawCircle(a) {
            if (!this._ctx) return VcsValue.Bool(false);
            const cx = a.int(0), cy = a.int(1);
            const radius = a.int(2, 10);
            const r = a.int(3, 255), g = a.int(4, 255), b = a.int(5, 255);
            this._ctx.fillStyle = `rgb(${r},${g},${b})`;
            this._ctx.beginPath();
            this._ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this._ctx.fill();
            return VcsValue.Bool(true);
        }

        _drawText(a) {
            if (!this._ctx) return VcsValue.Bool(false);
            const text = a.string(0, '');
            const x = a.int(1), y = a.int(2);
            const size = a.int(3, 12);
            const r = a.int(4, 255), g = a.int(5, 255), b = a.int(6, 255);
            this._ctx.fillStyle = `rgb(${r},${g},${b})`;
            this._ctx.font = `${size}px Arial`;
            this._ctx.fillText(text, x, y);
            return VcsValue.Bool(true);
        }

        _present() {
            // Canvas draws immediately, no double-buffering needed in basic mode
            return VcsValue.Bool(true);
        }

        _pollEvents() {
            // Browser handles events automatically
            return VcsValue.Bool(this._isRunning);
        }

        _isKeyDown(a) {
            const keyCode = a.int(0);
            return VcsValue.Bool(this._keysDown.has(keyCode));
        }

        _getTime() {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            return VcsValue.Int((now - this._startTime) | 0);
        }

        _delay(a, ctx) {
            const ms = a.int(0, 0) | 0;
            // Non-blocking delay: engine checks ctx.sleepUntilMs before executing.
            if (ctx) {
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                ctx.sleepUntilMs = now + ms;
            }
            return VcsValue.Int(ms);
        }

        _randomInt(a) {
            const min = a.int(0, 0), max = a.int(1, 100);
            return VcsValue.Int(Math.floor(Math.random() * (max - min + 1)) + min);
        }

        _randomFloat(a) {
            const min = a.double(0, 0), max = a.double(1, 1);
            return VcsValue.Float(Math.random() * (max - min) + min);
        }

        _setGameState(a) {
            const name = a.string(0, 'temp');
            const val = a.get(1);
            this._gameState.set(name, val);
            return val;
        }

        _getGameState(a) {
            const name = a.string(0, 'temp');
            return this._gameState.get(name) ?? VcsValue.Null;
        }
    }

    // Export for both Node.js and browser
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { GraphicsOps };
    }
    if (typeof window !== 'undefined') {
        window.GraphicsOps = GraphicsOps;
    }

})(typeof window !== 'undefined' ? window : global);
