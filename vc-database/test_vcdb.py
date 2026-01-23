import json
import tempfile
import unittest
from pathlib import Path

import vcdb


class TestVcdb(unittest.TestCase):
    def test_vectorize_and_search_smoke(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            source_dir = td / "source"
            build_dir = td / "vectors"
            source_dir.mkdir(parents=True, exist_ok=True)

            # Define module IDs (order matters)
            (source_dir / "vector-categories.txt").write_text(
                "mymod | Example module for tests.\n",
                encoding="utf-8",
            )

            # Define operations (entry order matters; separated by blank lines)
            (source_dir / "mymod.txt").write_text(
                "add | Adds two numbers. Parameters: a, b.\n\n"
                "print | Prints a value. Parameters: value.\n",
                encoding="utf-8",
            )

            # Ensure cache doesn't leak between tests
            vcdb.load_module_id_map.cache_clear()

            # Vectorize file into .dat
            ok = vcdb.vectorize_file(source_dir / "mymod.txt", build_dir)
            self.assertTrue(ok)

            dat_path = build_dir / "mymod.dat"
            self.assertTrue(dat_path.exists())

            # Dat should be valid JSON with expected shape
            data = json.loads(dat_path.read_text(encoding="utf-8"))
            self.assertIn("entries", data)
            self.assertIn("vocab", data)
            self.assertIn("vectors", data)

            # Search should return enriched result fields. Use internal `_search`
            # so we can supply a module map from our temp `vector-categories.txt`.
            module_map = vcdb.load_module_id_map(str(source_dir))
            results = vcdb._search("how to add numbers", str(dat_path), top_k=1, module_map=module_map)
            self.assertEqual(len(results), 1)
            r0 = results[0]
            self.assertEqual(r0["kind"], "op")
            self.assertEqual(r0["database"], "mymod")
            self.assertEqual(r0["module_name"], "mymod")
            # Module id should be resolved via vector-categories.txt
            self.assertEqual(r0["module_id"], 0)
            self.assertIsInstance(r0["signature"], str)


if __name__ == "__main__":
    unittest.main()

