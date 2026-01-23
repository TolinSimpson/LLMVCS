/**
 * LlmvccOps Module - Core interpreter operations
 */

(function(global) {
    // Get VcsValue from appropriate source
    const VcsValue = (typeof window !== 'undefined' && window.VcsValue)
        ? window.VcsValue
        : (typeof require !== 'undefined' ? require('../vcs.js').VcsValue : null);
    const VType = (typeof window !== 'undefined' && window.VType)
        ? window.VType
        : (typeof require !== 'undefined' ? require('../vcs.js').VType : null);

    class LlmvccOps {
        constructor() {
            this.name = 'llmvcc-ops';
        }

        /**
         * Evaluate operation by ID.
         * Signature matches `VcsEngine.step()`:
         *   eval(method_id, args, ctx, regs, strings) -> VcsValue
         */
        eval(id, a, ctx, regs, strings) {
            // Control flow & stack (0-13)
            if (id <= 13) {
                switch (id) {
                    case 0: return VcsValue.Null; // nop
                    case 1: ctx?.stop?.(); return VcsValue.Null; // stop
                    case 2: throw new Error(a.string(0, 'Error')); // error
                    case 3: { // skip(n)
                        const n = a.int(0, 1);
                        if (ctx) ctx.ip += n;
                        return VcsValue.Int(n);
                    }
                    case 4: { // jump(addr)
                        const addr = a.int(0, 0);
                        if (ctx) ctx.ip = addr - 1;
                        return VcsValue.Int(addr);
                    }
                    case 5: { // jump_if(addr, cond)
                        const addr = a.int(0, 0);
                        const cond = a.bool(1, false);
                        if (ctx && cond) ctx.ip = addr - 1;
                        return VcsValue.Bool(cond);
                    }
                    case 6: { // jump_if_not(addr, cond)
                        const addr = a.int(0, 0);
                        const cond = a.bool(1, true);
                        if (ctx && !cond) ctx.ip = addr - 1;
                        return VcsValue.Bool(!cond);
                    }
                    case 7: { // push(val)
                        const v = a.get(0);
                        ctx?.push?.(v);
                        return v;
                    }
                    case 8: return ctx?.pop?.() ?? VcsValue.Null; // pop()
                    case 9: { // dup()
                        const v = ctx?.peek?.() ?? VcsValue.Null;
                        ctx?.push?.(v);
                        return v;
                    }
                    case 10: { // swap()
                        const x = ctx?.pop?.() ?? VcsValue.Null;
                        const y = ctx?.pop?.() ?? VcsValue.Null;
                        ctx?.push?.(x);
                        ctx?.push?.(y);
                        return VcsValue.Null;
                    }
                    case 11: { // store(slot, val)
                        const slot = a.int(0, 0);
                        const val = a.get(1);
                        regs?.set?.(slot, val);
                        return val;
                    }
                    case 12: { // load(slot)
                        const slot = a.int(0, 0);
                        const val = regs?.get?.(slot) ?? VcsValue.Null;
                        ctx?.push?.(val);
                        return val;
                    }
                    case 13: { // print(val)
                        const v = a.get(0);
                        const msg = this._formatValue(v, strings);
                        if (ctx && typeof ctx.print_fn === 'function') ctx.print_fn(msg);
                        return v;
                    }
                }
            }

            // Math (14-19)
            if (id <= 19) {
                const x = a.double(0, 0.0), y = a.double(1, 0.0);
                switch (id) {
                    case 14: return VcsValue.Float(y === 0 ? 0.0 : (x % y));
                    case 15: return VcsValue.Float(x * y);
                    case 16: return VcsValue.Float(y === 0 ? 0.0 : (x / y));
                    case 17: return VcsValue.Float(x + y);
                    case 18: return VcsValue.Float(x - y);
                    case 19: return VcsValue.Float(Math.pow(x, y));
                }
            }

            // Comparison (20-25)
            if (id <= 25) {
                const x = a.double(0, 0.0), y = a.double(1, 0.0);
                switch (id) {
                    case 20: return VcsValue.Bool(x === y);
                    case 21: return VcsValue.Bool(x !== y);
                    case 22: return VcsValue.Bool(x > y);
                    case 23: return VcsValue.Bool(x < y);
                    case 24: return VcsValue.Bool(x >= y);
                    case 25: return VcsValue.Bool(x <= y);
                }
            }

            // Logic (26-29)
            if (id <= 29) {
                const x = a.bool(0, false), y = a.bool(1, false);
                switch (id) {
                    case 26: return VcsValue.Bool(x && y);
                    case 27: return VcsValue.Bool(x || y);
                    case 28: return VcsValue.Bool(!x);
                    case 29: return VcsValue.Bool(x !== y);
                }
            }

            throw new Error(`Unknown llmvcc-ops operation ID: ${id}`);
        }

        _formatValue(v, strings) {
            if (!v) return 'null';
            if (!VType) return String(v);
            switch (v.type) {
                case VType.NULL: return 'null';
                case VType.INT: return String(v.i | 0);
                case VType.FLOAT: return String(v.f);
                case VType.BOOL: return (v.i | 0) !== 0 ? 'true' : 'false';
                case VType.STRING: return strings?.get?.(v.sid) ?? '';
                case VType.SLOT: return `slot(${v.i | 0})`;
                default: return 'null';
            }
        }
    }

    // Export for both Node.js and browser
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { LlmvccOps };
    }
    if (typeof window !== 'undefined') {
        window.LlmvccOps = LlmvccOps;
    }

})(typeof window !== 'undefined' ? window : global);
