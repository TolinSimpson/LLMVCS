const assert = require("assert");

const { VcsEngine, VType } = require("../vcs.js");
const { LlmvccOps } = require("../modules/LlmvccOps.js");

function runProgram(source) {
  const engine = new VcsEngine();
  engine.init();
  engine.registerModule(0, new LlmvccOps());
  engine.registerModule(3, new LlmvccOps()); // legacy compatibility (used by some stacks)

  const progId = engine.loadString(source, "test");
  assert.ok(progId >= 0, "Compilation failed");

  const ctxId = engine.createContext(progId);
  assert.ok(ctxId >= 0, "Context creation failed");

  engine.start(ctxId);
  engine.run(ctxId);

  return engine;
}

// -----------------------------------------------------------------------------
// Parsing: inline comments inside quotes are preserved
// -----------------------------------------------------------------------------
{
  const src = [
    '0.11("s", "a//b")',
    "0.1()",
  ].join("\n");

  const engine = runProgram(src);
  const v = engine.getVar("s");
  assert.strictEqual(v.type, VType.STRING);
  assert.strictEqual(engine.strings.get(v.sid), "a//b");
}

// -----------------------------------------------------------------------------
// Execution: jump labels work and control flow loops correctly
// -----------------------------------------------------------------------------
{
  const src = [
    '0.11("x", 0)',
    ":loop",
    "0.17($x, 1)",
    '0.11("x", $result)',
    "0.23($x, 3)", // x < 3
    "0.5(@loop, $result)", // jump_if(loop, true)
    "0.1()",
  ].join("\n");

  const engine = runProgram(src);
  const x = engine.getVar("x");
  // add/sub/etc return FLOAT in current JS implementation
  assert.strictEqual(x.type, VType.FLOAT);
  assert.ok(Math.abs(x.f - 3.0) < 1e-9, `expected x≈3.0, got ${x.f}`);
}

console.log("OK: vcs-js tests passed");

