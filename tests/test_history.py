import os
import tempfile
import unittest
from unittest.mock import patch
from hush import history


class TestHistory(unittest.TestCase):
    def test_append_creates_directory_and_writes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            nested_path = os.path.join(tmpdir, "nested", "sub", "history.jsonl")
            with patch("hush.history.HISTORY_PATH", nested_path):
                history.append("First dictation test", 2.5)
                entries = history.load(limit=10)
                self.assertEqual(len(entries), 1)
                self.assertEqual(entries[0]["text"], "First dictation test")
                self.assertEqual(entries[0]["seconds"], 2.5)

    def test_load_limit_and_order(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            hist_path = os.path.join(tmpdir, "history.jsonl")
            with patch("hush.history.HISTORY_PATH", hist_path):
                for i in range(20):
                    history.append(f"Entry {i}", float(i))
                # Load only 5 most recent
                loaded = history.load(limit=5)
                self.assertEqual(len(loaded), 5)
                # Newest first
                self.assertEqual(loaded[0]["text"], "Entry 19")
                self.assertEqual(loaded[4]["text"], "Entry 15")

    def test_clear_history(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            hist_path = os.path.join(tmpdir, "history.jsonl")
            with patch("hush.history.HISTORY_PATH", hist_path):
                history.append("To be deleted", 1.0)
                self.assertEqual(len(history.load()), 1)
                history.clear()
                self.assertEqual(len(history.load()), 0)

    def test_delete_single_entry(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            hist_path = os.path.join(tmpdir, "history.jsonl")
            with patch("hush.history.HISTORY_PATH", hist_path):
                history.append("Keep 1", 1.0)
                history.append("Delete me", 2.0)
                history.append("Keep 2", 3.0)
                entries = history.load(limit=10)
                self.assertEqual(len(entries), 3)

                to_delete = next(e for e in entries if e["text"] == "Delete me")
                success = history.delete_entry(to_delete["ts"], to_delete["text"])
                self.assertTrue(success)

                remaining = history.load(limit=10)
                self.assertEqual(len(remaining), 2)
                self.assertNotIn("Delete me", [e["text"] for e in remaining])


if __name__ == "__main__":
    unittest.main()
