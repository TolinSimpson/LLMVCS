/**
 * VCS Engine (JavaScript)
 * Port of `vcs-pseudo/vcs.pseudo` with small compatibility additions:
 * - After each instruction, the returned value is written to shared register `result` (slot allocated at init).
 *
 * Works in both browser (attaches to `window`) and Node (CommonJS export).
 */

(function (global) {
  "use strict";

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const MAX_REGISTERS = 1024;
  const MAX_STACK = 256;
  const MAX_PARAMS = 8;
  const MAX_PROGRAMS = 32;
  const MAX_CONTEXTS = 32;
  const MAX_MODULES = 16;
  const MAX_INSTRUCTIONS = 4096;
  const MAX_PARAM_POOL = MAX_INSTRUCTIONS * 4;
  const MAX_STRINGS = 1024;

  // ============================================================================
  // VcsValue
  // ============================================================================

  const VType = Object.freeze({
    NULL: 0,
    INT: 1,
    FLOAT: 2,
    BOOL: 3,
    STRING: 4, // string table id
    SLOT: 5, // register slot reference
  });

  class VcsValue {
    constructor(type, i = 0, f = 0.0, sid = 0) {
      this.type = type;
      this.i = i | 0; // int32 (slot/int/bool)
      this.f = +f; // float64
      this.sid = sid | 0; // string id
    }

    static get Null() {
      return VcsValue._null ?? (VcsValue._null = new VcsValue(VType.NULL, 0, 0, 0));
    }
    static get True() {
      return VcsValue._true ?? (VcsValue._true = new VcsValue(VType.BOOL, 1, 0, 0));
    }
    static get False() {
      return VcsValue._false ?? (VcsValue._false = new VcsValue(VType.BOOL, 0, 0, 0));
    }

    static Int(v) {
      return new VcsValue(VType.INT, v | 0, 0, 0);
    }
    static Float(v) {
      return new VcsValue(VType.FLOAT, 0, +v, 0);
    }
    static Bool(v) {
      return v ? VcsValue.True : VcsValue.False;
    }
    static String(id) {
      return new VcsValue(VType.STRING, 0, 0, id | 0);
    }
    static Slot(slotIdx) {
      return new VcsValue(VType.SLOT, slotIdx | 0, 0, 0);
    }

    isNull() {
      return this.type === VType.NULL;
    }
    isSlot() {
      return this.type === VType.SLOT;
    }
    slotIndex() {
      return this.i | 0;
    }

    asInt() {
      switch (this.type) {
        case VType.INT:
          return this.i | 0;
        case VType.FLOAT:
          return this.f | 0;
        case VType.BOOL:
          return this.i | 0;
        default:
          return 0;
      }
    }

    asFloat() {
      switch (this.type) {
        case VType.FLOAT:
          return +this.f;
        case VType.INT:
          return +this.i;
        case VType.BOOL:
          return +this.i;
        default:
          return 0.0;
      }
    }

    asBool() {
      switch (this.type) {
        case VType.BOOL:
        case VType.INT:
          return (this.i | 0) !== 0;
        case VType.FLOAT:
          return this.f !== 0.0;
        case VType.STRING:
          return true;
        case VType.SLOT:
          return true;
        default:
          return false;
      }
    }

    isTruthy() {
      return this.asBool();
    }
  }

  // ============================================================================
  // StringTable (interned strings)
  // ============================================================================

  class StringTable {
    constructor() {
      this._strings = [];
      this._map = new Map();
    }

    reset() {
      this._strings.length = 0;
      this._map.clear();
    }

    intern(s) {
      const key = String(s);
      const hit = this._map.get(key);
      if (hit !== undefined) return hit;
      if (this._strings.length >= MAX_STRINGS) return 0;
      const id = this._strings.length;
      this._strings.push(key);
      this._map.set(key, id);
      return id;
    }

    get(id) {
      return id >= 0 && id < this._strings.length ? this._strings[id] : "";
    }
  }

  // ============================================================================
  // RegisterFile (shared variables)
  // ============================================================================

  class RegisterFile {
    constructor() {
      this.slots = Array.from({ length: MAX_REGISTERS }, () => VcsValue.Null);
      this.names = Array.from({ length: MAX_REGISTERS }, () => "");
      this.nameToSlot = new Map(); // lower-case -> slot
      this.nextSlot = 0;
    }

    reset() {
      this.nameToSlot.clear();
      this.nextSlot = 0;
      for (let i = 0; i < MAX_REGISTERS; i++) {
        this.slots[i] = VcsValue.Null;
        this.names[i] = "";
      }
    }

    get(slot) {
      return slot >= 0 && slot < MAX_REGISTERS ? this.slots[slot] : VcsValue.Null;
    }

    set(slot, val) {
      if (slot >= 0 && slot < MAX_REGISTERS) this.slots[slot] = val ?? VcsValue.Null;
    }

    allocate(name) {
      const key = String(name).toLowerCase();
      const existing = this.nameToSlot.get(key);
      if (existing !== undefined) return existing;
      if (this.nextSlot >= MAX_REGISTERS) throw new Error("Register file full");
      const slot = this.nextSlot++;
      this.names[slot] = String(name);
      this.nameToSlot.set(key, slot);
      return slot;
    }

    getSlot(name) {
      const key = String(name).toLowerCase();
      const v = this.nameToSlot.get(key);
      return v === undefined ? -1 : v;
    }

    clearValues() {
      for (let i = 0; i < this.nextSlot; i++) this.slots[i] = VcsValue.Null;
    }
  }

  // ============================================================================
  // VcsArgs (reusable buffer)
  // ============================================================================

  class VcsArgs {
    constructor() {
      this.values = Array.from({ length: MAX_PARAMS }, () => VcsValue.Null);
      this.count = 0;
      this._strings = null;
    }

    setStrings(strings) {
      this._strings = strings;
    }

    clear() {
      this.count = 0;
    }

    add(v) {
      if (this.count < MAX_PARAMS) this.values[this.count++] = v ?? VcsValue.Null;
    }

    get(i) {
      return i >= 0 && i < this.count ? this.values[i] : VcsValue.Null;
    }

    int(i, def = 0) {
      return i >= 0 && i < this.count ? this.values[i].asInt() : def | 0;
    }

    double(i, def = 0.0) {
      return i >= 0 && i < this.count ? this.values[i].asFloat() : +def;
    }
    float(i, def = 0.0) {
      return this.double(i, def);
    }

    bool(i, def = false) {
      return i >= 0 && i < this.count ? this.values[i].asBool() : !!def;
    }

    string(i, def = "") {
      if (!(i >= 0 && i < this.count)) return String(def);
      const v = this.values[i];
      if (v.type === VType.STRING) return this._strings ? this._strings.get(v.sid) : "";
      if (v.type === VType.INT) return String(v.i | 0);
      if (v.type === VType.FLOAT) return String(v.f);
      if (v.type === VType.BOOL) return (v.i | 0) !== 0 ? "true" : "false";
      return String(def);
    }
  }

  // ============================================================================
  // Program structures
  // ============================================================================

  function makeInstruction() {
    return { module_id: 0, method_id: 0, param_count: 0, flags: 0, params_offset: 0 };
  }

  class VcsProgram {
    constructor() {
      this.id = 0;
      this.name = "program";
      this.inst_count = 0;
      this.param_count = 0;
      this.in_use = false;
      this.instructions = Array.from({ length: MAX_INSTRUCTIONS }, () => makeInstruction());
      this.params = Array.from({ length: MAX_PARAM_POOL }, () => VcsValue.Null);
    }

    reset() {
      this.inst_count = 0;
      this.param_count = 0;
      this.in_use = false;
    }

    getParams(inst) {
      return this.params.slice(inst.params_offset, inst.params_offset + inst.param_count);
    }
  }

  // ============================================================================
  // VcsContext
  // ============================================================================

  const ContextState = Object.freeze({
    IDLE: 0,
    RUNNING: 1,
    PAUSED: 2,
    STOPPED: 3,
    ERROR: 4,
  });

  class VcsContext {
    constructor(ctxId) {
      this.id = ctxId | 0;
      this.program_id = 0;
      this.ip = 0;
      this.stack_top = 0;
      this.state = ContextState.IDLE;
      this.stack = Array.from({ length: MAX_STACK }, () => VcsValue.Null);
      this.args = new VcsArgs();
      this.error_msg = "";
      this.print_fn = null;
      this.sleepUntilMs = 0; // for non-blocking delays
    }

    reset() {
      this.ip = 0;
      this.stack_top = 0;
      this.state = ContextState.IDLE;
      this.args.clear();
      this.error_msg = "";
      this.sleepUntilMs = 0;
    }

    load(program_id) {
      this.program_id = program_id | 0;
      this.reset();
    }

    push(v) {
      if (this.stack_top < MAX_STACK) this.stack[this.stack_top++] = v ?? VcsValue.Null;
    }

    pop() {
      if (this.stack_top > 0) return this.stack[--this.stack_top];
      return VcsValue.Null;
    }

    peek() {
      return this.stack_top > 0 ? this.stack[this.stack_top - 1] : VcsValue.Null;
    }

    start() {
      this.state = ContextState.RUNNING;
    }

    pause() {
      this.state = ContextState.PAUSED;
    }

    stop() {
      this.state = ContextState.STOPPED;
    }

    setError(msg) {
      this.error_msg = String(msg ?? "Error");
      this.state = ContextState.ERROR;
    }

    isRunning() {
      return this.state === ContextState.RUNNING;
    }

    isComplete() {
      return this.state === ContextState.STOPPED || this.state === ContextState.ERROR;
    }
  }

  // ============================================================================
  // Compiler
  // ============================================================================

  class VcsCompiler {
    constructor(registers, strings) {
      this.registers = registers;
      this.strings = strings;
      this._labels = null; // labelName -> instruction index (compile-time only)
    }

    compileString(source, program) {
      const lines = String(source ?? "").split(/\r?\n/);
      return this.compileLines(lines, program);
    }

    compileLines(lines, program) {
      program.reset();

      // First pass: strip comments/whitespace and collect labels.
      const labelMap = new Map();
      const instLines = [];
      let instIndex = 0;

      for (let rawLine of lines) {
        let line = String(rawLine ?? "").trim();
        if (!line) continue;
        if (line.startsWith("//") || line.startsWith("#")) continue;
        line = this._stripInlineComment(line).trim();
        if (!line) continue;

        // Label definitions (not part of pseudo-spec; convenience for authoring):
        //   :loop
        //   loop:
        const label1 = line.match(/^:([A-Za-z_][A-Za-z0-9_]*)$/);
        const label2 = line.match(/^([A-Za-z_][A-Za-z0-9_]*):$/);
        const label = label1?.[1] ?? label2?.[1] ?? null;
        if (label) {
          if (labelMap.has(label)) return false; // duplicate label
          labelMap.set(label, instIndex);
          continue;
        }

        instLines.push(line);
        instIndex++;
      }

      // Second pass: compile instructions with labels available.
      this._labels = labelMap;
      try {
        for (let line of instLines) {
          const inst = this.parseInstruction(line, program);
          if (inst.module_id === 255) return false;
          if (program.inst_count >= MAX_INSTRUCTIONS) return false;
          program.instructions[program.inst_count++] = inst;
        }
      } finally {
        this._labels = null;
      }

      program.in_use = true;
      return true;
    }

    _stripInlineComment(line) {
      // remove `// ...` unless inside quotes
      let inQuotes = false;
      let quoteChar = "";
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (!inQuotes && (c === '"' || c === "'")) {
          inQuotes = true;
          quoteChar = c;
          continue;
        }
        if (inQuotes && c === quoteChar) {
          inQuotes = false;
          quoteChar = "";
          continue;
        }
        if (!inQuotes && c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    }

    parseInstruction(line, program) {
      const dotPos = line.indexOf(".");
      const parenOpen = line.indexOf("(");
      const parenClose = line.lastIndexOf(")");

      if (dotPos < 0 || parenOpen < 0 || parenClose < 0) return { module_id: 255 };
      if (dotPos >= parenOpen) return { module_id: 255 };

      const moduleStr = line.slice(0, dotPos).trim();
      const methodStr = line.slice(dotPos + 1, parenOpen).trim();
      const paramsStr = line.slice(parenOpen + 1, parenClose).trim();

      const module_id = parseInt(moduleStr, 10);
      const method_id = parseInt(methodStr, 10);
      if (!Number.isFinite(module_id) || !Number.isFinite(method_id)) return { module_id: 255 };

      const inst = {
        module_id: module_id | 0,
        method_id: method_id | 0,
        param_count: 0,
        flags: 0,
        params_offset: program.param_count | 0,
      };

      if (paramsStr.length > 0) {
        const params = this.splitParams(paramsStr);
        for (let i = 0; i < params.length; i++) {
          const val = this.parseValue(params[i].trim(), inst.module_id, inst.method_id, inst.param_count);
          // Label parse error marker (slotIndex beyond register range)
          if (val && val.type === VType.SLOT && (val.i | 0) === 65535) return { module_id: 255 };
          if (program.param_count >= MAX_PARAM_POOL) return { module_id: 255 };
          program.params[program.param_count++] = val;
          inst.param_count++;
          if (inst.param_count >= MAX_PARAMS) break;
        }
      }

      return inst;
    }

    splitParams(paramsStr) {
      const result = [];
      let current = "";
      let inQuotes = false;
      let quoteChar = "";

      for (let i = 0; i < paramsStr.length; i++) {
        const c = paramsStr[i];
        if (!inQuotes && (c === '"' || c === "'")) {
          inQuotes = true;
          quoteChar = c;
          current += c;
        } else if (inQuotes && c === quoteChar) {
          inQuotes = false;
          current += c;
        } else if (!inQuotes && c === ",") {
          result.push(current);
          current = "";
        } else {
          current += c;
        }
      }
      if (current.length > 0) result.push(current);
      return result;
    }

    parseValue(token, module_id, method_id, param_idx) {
      const t = String(token ?? "").trim();
      if (!t) return VcsValue.Null;

      // Label reference (compile-time only): @label
      // Compiles to integer address.
      if (t.startsWith("@")) {
        const label = t.slice(1);
        const addr = this._labels?.get(label);
        // Parse error marker if unknown label
        if (addr === undefined) return VcsValue.Slot(65535);
        return VcsValue.Int(addr);
      }

      // Variable reference: $varName
      if (t.startsWith("$")) {
        const name = t.slice(1);
        const slot = this.registers.allocate(name);
        return VcsValue.Slot(slot);
      }

      // Quoted string: "text" or 'text'
      const q = t[0];
      if ((q === '"' && t.endsWith('"')) || (q === "'" && t.endsWith("'"))) {
        const inner = t.slice(1, -1);
        if (this.isVarnameParam(module_id, method_id, param_idx)) {
          const slot = this.registers.allocate(inner);
          return VcsValue.Int(slot);
        }
        const id = this.strings.intern(inner);
        return VcsValue.String(id);
      }

      // Boolean
      if (t === "true") return VcsValue.True;
      if (t === "false") return VcsValue.False;

      // Number
      if (t.includes(".")) {
        const f = parseFloat(t);
        if (Number.isFinite(f)) return VcsValue.Float(f);
      } else {
        const n = parseInt(t, 10);
        if (Number.isFinite(n)) return VcsValue.Int(n);
      }

      // Fallback: treat as bare string token
      if (this.isVarnameParam(module_id, method_id, param_idx)) {
        const slot = this.registers.allocate(t);
        return VcsValue.Int(slot);
      }
      return VcsValue.String(this.strings.intern(t));
    }

    isVarnameParam(module_id, method_id, param_idx) {
      if (param_idx !== 0) return false;
      // store/load first param is a variable name; support both module 0 and legacy module 3
      if ((module_id === 0 || module_id === 3) && (method_id === 11 || method_id === 12)) return true;
      return false;
    }
  }

  // ============================================================================
  // Engine
  // ============================================================================

  class VcsEngine {
    constructor() {
      this.registers = new RegisterFile();
      this.strings = new StringTable();
      this.modules = Array.from({ length: MAX_MODULES }, () => null);
      this.programs = Array.from({ length: MAX_PROGRAMS }, () => new VcsProgram());
      this.contexts = Array.from({ length: MAX_CONTEXTS }, (_, i) => new VcsContext(i));
      this.compiler = new VcsCompiler(this.registers, this.strings);

      this._resultSlot = -1;
    }

    init() {
      this.registers.reset();
      this.strings.reset();

      // Reserve a shared result slot for `$result`
      this._resultSlot = this.registers.allocate("result");

      // Clear programs
      for (let i = 0; i < MAX_PROGRAMS; i++) this.programs[i].in_use = false;
      // Reset contexts
      for (let i = 0; i < MAX_CONTEXTS; i++) this.contexts[i].reset();
    }

    registerModule(moduleId, moduleInstance) {
      if (moduleId < 0 || moduleId >= MAX_MODULES) throw new Error("Module id out of range");
      this.modules[moduleId] = moduleInstance;
    }

    loadString(source, name = "program") {
      const slot = this.findFreeProgramSlot();
      if (slot < 0) return -1;
      const program = this.programs[slot];
      program.id = slot;
      program.name = String(name);
      if (!this.compiler.compileString(source, program)) return -1;
      return slot;
    }

    unloadProgram(program_id) {
      if (program_id >= 0 && program_id < MAX_PROGRAMS) this.programs[program_id].in_use = false;
    }

    createContext(program_id) {
      const slot = this.findFreeContextSlot();
      if (slot < 0) return -1;
      this.contexts[slot].load(program_id);
      return slot;
    }

    start(ctx_id) {
      const ctx = this.contexts[ctx_id];
      if (ctx) ctx.start();
    }
    pause(ctx_id) {
      const ctx = this.contexts[ctx_id];
      if (ctx) ctx.pause();
    }
    stop(ctx_id) {
      const ctx = this.contexts[ctx_id];
      if (ctx) ctx.stop();
    }

    step(ctx_id, count = 1) {
      const ctx = this.contexts[ctx_id];
      if (!ctx || ctx.state !== ContextState.RUNNING) return 0;
      const program = this.programs[ctx.program_id];
      if (!program || !program.in_use) return 0;

      let executed = 0;
      while (executed < count && ctx.state === ContextState.RUNNING && ctx.ip < program.inst_count) {
        // Non-blocking sleep support
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (ctx.sleepUntilMs && now < ctx.sleepUntilMs) break;

        const inst = program.instructions[ctx.ip];

        ctx.args.setStrings(this.strings);
        ctx.args.clear();
        for (let i = 0; i < inst.param_count; i++) {
          const p = program.params[inst.params_offset + i];
          if (p && p.type === VType.SLOT) ctx.args.add(this.registers.get(p.slotIndex()));
          else ctx.args.add(p ?? VcsValue.Null);
        }

        const mod = this.modules[inst.module_id];
        if (!mod || typeof mod.eval !== "function") {
          ctx.setError(`Missing module ${inst.module_id}`);
          break;
        }

        try {
          const result = mod.eval(inst.method_id, ctx.args, ctx, this.registers, this.strings);
          // Write `$result` for compatibility with provided stacks (e.g. pong.vcs)
          if (this._resultSlot >= 0) this.registers.set(this._resultSlot, result ?? VcsValue.Null);
        } catch (e) {
          ctx.setError(e?.message ?? String(e));
          break;
        }

        ctx.ip++;
        executed++;
      }

      if (ctx.state === ContextState.RUNNING && ctx.ip >= program.inst_count) ctx.state = ContextState.STOPPED;
      return executed;
    }

    stepAll(count = 1) {
      for (let i = 0; i < MAX_CONTEXTS; i++) if (this.contexts[i].state === ContextState.RUNNING) this.step(i, count);
    }

    run(ctx_id) {
      // Blocking run. If a script uses non-blocking sleep (GraphicsOps.delay),
      // `step()` may return 0 while the context remains RUNNING; in that case,
      // return to avoid a busy-loop.
      while (this.contexts[ctx_id]?.state === ContextState.RUNNING) {
        const n = this.step(ctx_id, 100);
        if (n === 0) return;
      }
    }

    runAll() {
      // Best-effort blocking run. If any context is sleeping (delay), we return
      // to avoid busy-waiting; use `stepAll()` from a timed loop instead.
      let anyRunning = true;
      while (anyRunning) {
        anyRunning = false;
        for (let i = 0; i < MAX_CONTEXTS; i++) {
          if (this.contexts[i].state === ContextState.RUNNING) {
            const n = this.step(i, 100);
            if (n === 0) return;
            anyRunning = true;
          }
        }
      }
    }

    getVar(name) {
      const slot = this.registers.getSlot(name);
      return slot >= 0 ? this.registers.get(slot) : VcsValue.Null;
    }

    setVar(name, val) {
      const slot = this.registers.getSlot(name);
      if (slot >= 0) this.registers.set(slot, val ?? VcsValue.Null);
    }

    findFreeProgramSlot() {
      for (let i = 0; i < MAX_PROGRAMS; i++) if (!this.programs[i].in_use) return i;
      return -1;
    }

    findFreeContextSlot() {
      for (let i = 0; i < MAX_CONTEXTS; i++) {
        const s = this.contexts[i].state;
        if (s === ContextState.IDLE || s === ContextState.STOPPED || s === ContextState.ERROR) return i;
      }
      return -1;
    }
  }

  // ============================================================================
  // Exports
  // ============================================================================

  const exported = {
    // constants (useful for diagnostics)
    MAX_REGISTERS,
    MAX_STACK,
    MAX_PARAMS,
    MAX_PROGRAMS,
    MAX_CONTEXTS,
    MAX_MODULES,
    MAX_INSTRUCTIONS,

    // core types
    VType,
    VcsValue,
    VcsArgs,
    VcsProgram,
    StringTable,
    RegisterFile,
    ContextState,
    VcsContext,
    VcsCompiler,
    VcsEngine,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof window !== "undefined") Object.assign(window, exported);
})(typeof window !== "undefined" ? window : global);