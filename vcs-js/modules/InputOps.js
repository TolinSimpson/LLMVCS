/**
 * InputOps Module - Keyboard input (browser)
 *
 * Minimal module to decouple input from graphics.
 *
 * Opcodes:
 *  0: is_key_down(keyCode) -> bool
 *  1: was_key_pressed(keyCode) -> bool (edge-triggered; true once per press)
 *  2: clear() -> bool
 */

(function (global) {
  const VcsValue = (typeof window !== "undefined" && window.VcsValue)
    ? window.VcsValue
    : (typeof require !== "undefined" ? require("../vcs.js").VcsValue : null);

  class InputOps {
    constructor() {
      this.name = "input-ops";
      this._keysDown = new Set();
      this._pressedQueue = new Set();
      this._listenersInstalled = false;
      this._ensureListeners();
    }

    _ensureListeners() {
      if (this._listenersInstalled) return;
      if (typeof document === "undefined") return; // Node or non-DOM
      this._listenersInstalled = true;

      document.addEventListener("keydown", (e) => {
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
        const isTypingTarget =
          tag === "input" || tag === "textarea" || (target && target.isContentEditable);

        if (isTypingTarget) return;

        if (!this._keysDown.has(e.keyCode)) this._pressedQueue.add(e.keyCode);
        this._keysDown.add(e.keyCode);
      });

      document.addEventListener("keyup", (e) => {
        this._keysDown.delete(e.keyCode);
      });
    }

    eval(id, a) {
      switch (id) {
        case 0: {
          const keyCode = a.int(0, 0);
          return VcsValue.Bool(this._keysDown.has(keyCode));
        }
        case 1: {
          const keyCode = a.int(0, 0);
          const hit = this._pressedQueue.has(keyCode);
          if (hit) this._pressedQueue.delete(keyCode);
          return VcsValue.Bool(hit);
        }
        case 2: {
          this._keysDown.clear();
          this._pressedQueue.clear();
          return VcsValue.Bool(true);
        }
        default:
          throw new Error(`Unknown input-ops operation ID: ${id}`);
      }
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { InputOps };
  }
  if (typeof window !== "undefined") {
    window.InputOps = InputOps;
  }
})(typeof window !== "undefined" ? window : global);

