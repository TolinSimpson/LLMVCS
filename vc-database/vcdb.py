"""
Zero-dependency TF-IDF vector database for MCP tools.
Builds and searches .dat files using pure Python.
"""

import json, math, re
from functools import lru_cache
from pathlib import Path


def tokenize(text):
    """Split text into lowercase words."""
    return re.findall(r'\w+', text.lower())


@lru_cache(maxsize=1)
def load_module_id_map(source_dir=None):
    """
    Load a mapping of module_name -> module_id from vector-categories.txt.

    Module IDs are defined by the entry order (split by blank lines),
    consistent with DOCUMENTATION.md.
    """
    base = Path(__file__).parent
    source_dir = Path(source_dir) if source_dir else base / "source"
    cat_path = source_dir / "vector-categories.txt"
    if not cat_path.exists():
        return {}

    content = cat_path.read_text(encoding="utf-8")
    entries = [e.strip() for e in content.split("\n\n") if e.strip()]

    module_map = {}
    for module_id, entry in enumerate(entries):
        name = entry.split("|", 1)[0].strip()
        if name:
            module_map[name] = module_id
    return module_map


def parse_op_name(entry):
    """Extract operation name from a source entry (prefix before '|')."""
    return entry.split("|", 1)[0].strip()


def parse_params(entry):
    """
    Heuristically parse a parameter list from prose like:
      '... Parameters: x, y, width, height.'
    """
    m = re.search(r"Parameters?:\s*([^\.]+)", entry, flags=re.IGNORECASE)
    if not m:
        return []
    raw = m.group(1)
    return [p.strip() for p in raw.split(",") if p.strip()]


def make_signature(module_id, opcode, params):
    """
    Build a canonical .vcs signature string.
    Example: '0.17(a, b)' or '2.3(x, y, w, h, r, g, b)'
    """
    mid = "?" if module_id is None else str(int(module_id))
    if params:
        return f"{mid}.{opcode}({', '.join(params)})"
    return f"{mid}.{opcode}()"


def enrich_result(entry, opcode, similarity, database, module_map):
    """
    Additive enrichment for backward compatibility.
    Keeps original keys (entry/opcode/similarity) and adds metadata fields.
    """
    op_name = parse_op_name(entry)
    kind = "category" if database == "vector-categories" else "op"

    # For normal op databases, module_id is derived from the database stem.
    # For vector-categories search results, the op_name IS the module name.
    module_id = module_map.get(op_name if kind == "category" else database)
    module_name = op_name if kind == "category" else database

    params = [] if kind == "category" else parse_params(entry)
    signature = "" if kind == "category" else make_signature(module_id, opcode, params)

    return {
        "entry": entry,
        "opcode": opcode,
        "similarity": similarity,
        "database": database,
        "kind": kind,
        "module_name": module_name,
        "module_id": module_id,
        "op_name": op_name,
        "params": params,
        "signature": signature,
    }


def build_tfidf(entries):
    """Build TF-IDF vectors for all entries."""
    docs = [tokenize(e) for e in entries]
    vocab = sorted(set(w for d in docs for w in d))
    word_idx = {w: i for i, w in enumerate(vocab)}
    
    # IDF: log(N / docs_containing_word)
    N = len(docs)
    df = {w: sum(1 for d in docs if w in d) for w in vocab}
    idf = {w: math.log(N / df[w]) if df[w] else 0 for w in vocab}
    
    # TF-IDF sparse vectors (only non-zero values, keys as strings for JSON)
    vectors = []
    for doc in docs:
        if not doc:
            vectors.append({})
            continue
        tf = {}
        for w in doc:
            tf[w] = tf.get(w, 0) + 1
        vec = {str(word_idx[w]): (tf[w] / len(doc)) * idf[w] for w in tf}
        vectors.append(vec)
    
    return {'vocab': vocab, 'idf': idf, 'vectors': vectors}


def cosine_sim(v1, v2):
    """Cosine similarity between sparse vectors (dicts)."""
    keys = set(v1) | set(v2)
    dot = sum(v1.get(k, 0) * v2.get(k, 0) for k in keys)
    n1 = math.sqrt(sum(x*x for x in v1.values())) if v1 else 0
    n2 = math.sqrt(sum(x*x for x in v2.values())) if v2 else 0
    return dot / (n1 * n2) if n1 and n2 else 0


def _search(query, db_path, top_k, module_map):
    """Internal search that reuses a provided module_id map."""
    db_path = Path(db_path)
    database = db_path.stem

    with open(db_path, encoding="utf-8") as f:
        db = json.load(f)

    words = tokenize(query)
    if not words:
        return []

    word_idx = {w: i for i, w in enumerate(db["vocab"])}
    idf = db["idf"]

    # Build query vector
    tf = {}
    for w in words:
        if w in word_idx:
            tf[w] = tf.get(w, 0) + 1
    q_vec = {str(word_idx[w]): (tf[w] / len(words)) * idf.get(w, 0) for w in tf}

    # Score all entries
    scores = [(i, cosine_sim(q_vec, v)) for i, v in enumerate(db["vectors"])]
    scores.sort(key=lambda x: -x[1])

    results = []
    for i, s in scores[:top_k]:
        entry = db["entries"][i]
        results.append(enrich_result(entry, i, s, database, module_map))
    return results


def search(query, db_path, top_k=1):
    """
    Search database, return top matches with opcode.\n
    Backward compatible: still returns entry/opcode/similarity, with added fields:\n
      database, module_name, module_id, op_name, params, signature\n
    """
    module_map = load_module_id_map()
    return _search(query, db_path, top_k, module_map)


def search_all(query, build_dir, top_k=1):
    """Search all .dat databases, return top matches across all."""
    build_dir = Path(build_dir)
    module_map = load_module_id_map()
    results = []
    for dat in build_dir.glob('*.dat'):
        results.extend(_search(query, dat, top_k, module_map))
    results.sort(key=lambda x: -x['similarity'])
    return results[:top_k]


def vectorize_file(source_file, build_dir):
    """Vectorize a .txt source file and save to build directory."""
    with open(source_file, encoding='utf-8') as f:
        content = f.read()
    
    entries = [e.strip() for e in content.split('\n\n') if e.strip()]
    if not entries:
        return False
    
    data = build_tfidf(entries)
    data['entries'] = entries
    data['metadata'] = {'source': source_file.name}
    
    build_dir = Path(build_dir)
    build_dir.mkdir(parents=True, exist_ok=True)
    
    out_path = build_dir / source_file.name.replace('.txt', '.dat')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"  {source_file.name} -> {out_path.name} ({len(entries)} entries)")
    return True


def vectorize_all(source_dir=None, build_dir=None):
    """Vectorize all .txt files in source directory."""
    base = Path(__file__).parent
    source_dir = Path(source_dir) if source_dir else base / 'source'
    build_dir = Path(build_dir) if build_dir else base / 'vectors'
    txt_files = list(source_dir.glob('*.txt'))
    if not txt_files:
        print(f"No .txt files in {source_dir}")
        return
    
    print(f"Vectorizing {len(txt_files)} files:")
    for f in txt_files:
        vectorize_file(f, build_dir)
    print("Done.")


if __name__ == '__main__':
    import sys

    # Backward compatible default: vectorize all .txt sources to .dat files.
    if len(sys.argv) > 1 and sys.argv[1] == "--demo-search":
        base = Path(__file__).parent
        vectors_dir = base / "vectors"
        query = " ".join(sys.argv[2:]).strip() or "add numbers"
        print(json.dumps(search_all(query, vectors_dir, top_k=5), indent=2, ensure_ascii=False))
    else:
        vectorize_all()
