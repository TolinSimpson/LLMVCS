const { VcsEngine } = require("./vcs.js");
const { LlmvccOps } = require("./modules/LlmvccOps.js");
const { GraphicsOps } = require("./modules/GraphicsOps.js");

const engine = new VcsEngine();
engine.init();
engine.registerModule(0, new LlmvccOps());
engine.registerModule(2, new GraphicsOps());
engine.registerModule(3, new LlmvccOps()); // legacy compatibility

const src = [
  '0.11("x", 10)',
  "0.17($x, 5)",
  '0.11("x", $result)',
  "0.13($x)",
  "0.1()",
].join("\n");

const progId = engine.loadString(src, "smoke");
if (progId < 0) throw new Error("Compilation failed");

const ctxId = engine.createContext(progId);
if (ctxId < 0) throw new Error("Context creation failed");

engine.contexts[ctxId].print_fn = (msg) => process.stdout.write(String(msg) + "\n");
engine.start(ctxId);
engine.run(ctxId);

const xSlot = engine.registers.getSlot("x");
const rSlot = engine.registers.getSlot("result");
console.log("x =", engine.registers.get(xSlot));
console.log("result =", engine.registers.get(rSlot));
console.log("ctx.state =", engine.contexts[ctxId].state, "ctx.ip =", engine.contexts[ctxId].ip);

