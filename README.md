# LLMVCS (Large Language Model Vectorized Code Stack)

> ⚠️ **EXPERIMENTAL** – This project is theoretical & pending benchmarks, the JavaScript interpreter is functional but not widely tested. Use at your own risk.

## Overview: 
LLMVCS reduces LLM agent token costs by turning prompts into tiny, stable instruction references that a deterministic interpreter can execute.

Instead of having the LLM repeatedly re-describe common operations in natural language, you define those operations once in human-readable `.txt` catalogs, index them for semantic search, and then have the LLM output compact `.vcs` programs that reference operations by numeric IDs. The .vcs (vectorized code stack) can then be interpreted via a plugin for your software environment by including a small interpreter and static code modules correlating to the human-readable operations. Overall this should save tokens on thinking by offloading that to a vector search client side then saves tokens via the output format in the response. The interpreter plugin is Turing complete and mimics CPU architecture. This makes it fast and requires only static function calls that enable operations to be implemented however the user likes for their environment. If an LLM gets confused while generating a .vcs file it can always refer to the human readable catalog or correlating function library directly if the vector search produced insufficient results due to poor human description. Early benchmarks suggest a 90% token reduction if initial prompts contain sufficient keywords.

## History:
This algorithm is inspired by my real-time code interpreter written in C# for the Unity game engine called Smart GameObjects. By combining principles of utility theory AI and opcodes in a switch case or hashmap scaleable simulation loops could be designed through a UI abstraction. This required developers to only need to write static function libraries where designers could use a visual frontend to configure logic while the application was running. The original algorithm suffered from being hard for humans to wrap their heads around at times. Today's LLMs solve the burden of abstraction and weight balancing of stacked instructions and could be further used as a bridge between LLM experts.

## The algorithm (in simple terms)

1. **Write operations once (human-readable)**  
   Put reusable operations in `.txt` files under `vc-database/source/`. Each entry is separated by a blank line and has a stable position (its index).

2. **Build a searchable index**  
   Run `vc-database/vcdb.py` to convert the `.txt` catalogs into `.dat` files under `vc-database/vectors/` (JSON TF‑IDF vectors).

3. **At runtime: semantic lookup (via MCP in your system)**  
   When a user asks for something, the agent calls your vector-search tool to retrieve the best matching **module** and **operation** IDs.

4. **Emit low-token `.vcs`**  
   The agent outputs a tiny instruction stack like `moduleId.opcode(params)` instead of verbose code.

5. **Execute `.vcs` in an embedded interpreter**  
   A small, language-agnostic, single-file interpreter executes the instructions deterministically inside your app.

## Why this reduces tokens

- **Knowledge is stored once** in the operation catalogs (`.txt`) and searchable indexes (`.dat`).
- **Agent output stays small** because `.vcs` references operations numerically (stable IDs) instead of repeating long explanations or boilerplate.

## Repository layout

- `vc-database/` — builds/searches `.dat` indexes from human-readable `.txt` sources (zero-dependency Python).
- `vcs-js/` — a working JavaScript interpreter + `.vcs` compiler and example stacks.
- `vcs-pseudo/` — the language-agnostic pseudo-code spec used to generate new interpreters.

## `.vcs` format (vectorized code stack)

Each line is an instruction:

```text
MODULE_ID.OPCODE(param1, param2, ...)
```

- Comments start with `//` (and `#` is also ignored by the JS compiler).
- Variables are referenced as `$name` (resolved to a register slot at compile time).
- Strings can be `"double quoted"` or `'single quoted'`.
- Labels are supported by the JS interpreter for authoring convenience:
  - define: `:loop`
  - jump to: `@loop` (compile-time label reference)

Example:

```text
// x = 10
0.11("x", 10)
// x = x + 5
0.17($x, 5)
0.11("x", $result)
// print x, then stop
0.13($x)
0.1()
```

## Quickstart

### 1) Build the vector databases (`.dat`)

From the repo root:

```bash
python vc-database/vcdb.py
```

This reads `vc-database/source/*.txt` and writes `vc-database/vectors/*.dat`.

To demo search output:

```bash
python vc-database/vcdb.py --demo-search add numbers
```

### 2) Run the JavaScript interpreter smoke test

From the repo root:

```bash
node vcs-js/smoke-test.js
```

### 3) (Optional) Run the browser demo

Open `vcs-js/index.html` in a browser.

## Porting to other languages

Use the single-file interpreter spec in `vcs-pseudo/vcs.pseudo` as the authoritative reference. New-language interpreters can be generated by an LLM by following that spec (data structures, compiler, engine loop, module interface).

## Compatibility: stable IDs (important)

LLMVCS relies on **stable numeric IDs**:

- **Module IDs** come from the entry order in `vc-database/source/vector-categories.txt`.
- **Operation IDs / opcodes** come from the entry order in each `vc-database/source/*.txt` module catalog.

This means reordering entries is a breaking change. Prefer only appending new entries to preserve old IDs.

Recommended convention (optional): put a version header at the top of `.vcs` programs, for example:

```text
// vcs:1
```

## Safety / security note

`.vcs` is executable instruction input. Treat it like code:

- Only enable modules/opcodes you intend to allow.
- Sandbox or validate inputs if `.vcs` can come from untrusted sources.
- Keep module/opcode mappings stable; changing IDs is a breaking change.


## License

Modified BSL 1.1 | see for permissions for entities under $1,000,000 in revenue this license will switch to MIT 4 years after 1/23/2026.
https://github.com/TolinSimpson/LLMVCS/tree/main?tab=License-1-ov-file#readme

### Commercial & Enterprise Use
If you are an Enterprise user or are selling derivatives to one (per the LICENSE), please contact me privately for royalty processing:

Go to the Security tab above.

Click Report a vulnerability.

Subject: "Commercial Royalty Report - [Your Company Name]".

