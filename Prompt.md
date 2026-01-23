# VCS File Generator

Convert user tasks into `.vcs` files using the vector database MCP tool.

## Process

1. **Search categories**: `search(query, "vc-database/vectors/vector-categories.dat", top_k=2)` → get relevant module names
2. **Search operations**: `search(query, "vc-database/vectors/<module>.dat", top_k=5)` → get opcodes
3. **Generate .vcs**: Use `MODULE_ID.OPCODE(params)` format

## .vcs Syntax

```
// Comments start with //
MODULE_ID.OPCODE(param1, param2)
```

- Strings: `"text"`
- Variables: `$varname`
- Numbers/booleans: literals

## Example

Task: "Print hello then stop"

```vcs
// Print and stop
0.13("Hello")
0.1()
```

Output the .vcs file with inline comments explaining each line.
