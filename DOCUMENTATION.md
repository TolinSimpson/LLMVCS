# LLMVCS - LLM-Friendly Vectorized Code Stack Interpreter

A modular, cross-language stack-based interpreter with semantic search capabilities.

## Architecture

```
LLMVCS/
├── vc-database/
│   ├── source/     # Human-readable function definitions (.txt)
│   ├── vectors/    # Vectorized outputs (.dat)
│   └── vcdb.py     # Converts .txt → .dat and semantic search via TF-IDF (pure Python)
├── vcs-js/         # Working JavaScript interpreter + compiler for .vcs
│   ├── modules/    # Opcode modules (registered into the engine by moduleId)
│   ├── stacks/     # Example .vcs programs
│   └── vcs.js      # Single-file interpreter + compiler (JS)
├── vcs-pseudo/     # Language-agnostic single-file interpreter specification
│   └── vcs.pseudo
```

## Database

### Source Files (`vc-database/source/*.txt`)

Define operations in a simple format. Each entry separated by `\n\n` gets a sequential ID (0, 1, 2...).

```
add | Adds two types.

subtract | Subtracts two types.

multiply | Multiplies two types.
```

### Vectorization

```bash
cd vc-database
python vcdb.py
```

Converts `.txt` files to `.dat` (JSON TF-IDF vectors) for semantic search.

### Vector Search

```python
# Run this from inside `vc-database/`
from vcdb import search

results = search(
    query="how to add numbers",
    db_path="vectors/llmvcc-ops.dat",
    top_k=3,
)
```

## .vcs File Format

Compact instruction format: `moduleId.methodId(params)`

```vcs
// Comments start with //
0.13("Hello")       // print("Hello")
0.11("x", 10)       // store("x", 10)
0.17($x, 5)         // add($x, 5)
0.5(0, true)        // jump_if(0, true)
0.1()               // stop()
```

### Note on naming

The current JS compiler (`vcs-js/vcs.js`) parses numeric `moduleId.methodId(...)` only. Named variants like `math.add(...)` are a potential extension, but are not implemented today.

### Parameters

- Numbers: `10`, `3.14`
- Strings: `"hello"`, `'world'`
- Booleans: `true`, `false`
- Variables: `$varName`

## Compatibility policy (stable IDs)

LLMVCS relies on **stable numeric IDs**:

- **Module IDs** are derived from the entry order in `vc-database/source/vector-categories.txt`
- **Operation IDs / opcodes** are derived from the entry order in each `vc-database/source/*.txt`

Reordering existing entries is a breaking change. Prefer only appending new entries to preserve old IDs.

Recommended convention (optional): add a format version header to `.vcs` programs:

```text
// vcs:1
```


## Adding New Modules

1. Create `vc-database/source/your-module.txt` with operations
2. Add entry to `vc-database/source/vector-categories.txt`
3. Implement the module in your interpreter (for JS, add a class under `vcs-js/modules/` with `eval(methodId, args, ctx, regs, strings)`)
4. Register it into the engine at the desired `moduleId`
5. Run `vcdb.py` to update the search index

## Cross-Language Compatibility

The interpreter design is intended to be portable across languages. The authoritative portability reference is `vcs-pseudo/vcs.pseudo`, and `vcs-js/` is a working reference implementation.
