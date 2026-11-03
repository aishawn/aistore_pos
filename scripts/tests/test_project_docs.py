"""Regression checks for evidence/link validation, without providers or business data."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("project_docs", Path(__file__).resolve().parents[1] / "check-project-docs.py")
docs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(docs)


class ProjectDocsChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "README.md"
        self.source.write_text("", encoding="utf-8")

    def entry(self):
        (self.root / "evidence.json").write_text('{"passed": 2, "runtime": {"matches": true}}', encoding="utf-8")
        return {
            "id": "E-TEST", "status": "PASS", "evidenceType": "local-fixture",
            "recordedAt": "2026-11-03", "sourceSha": None, "runtimeSha": None,
            "model": None, "promptVersion": None, "configVersion": None, "snapshotVersion": None,
            "scope": "fixture only", "sample": "two checks", "result": "2 passed",
            "limitations": ["not production"], "artifacts": ["evidence.json"],
            "jsonChecks": {"passed": 2, "runtime.matches": True}, "releaseAccepted": False,
        }

    def registry_errors(self, entries):
        return docs.check_registry(self.root, {"schemaVersion": 1, "entries": entries})

    def test_local_file_unicode_heading_and_external_url(self):
        (self.root / "设计.md").write_text("# 验证与效果\n", encoding="utf-8")
        self.source.write_text("[设计](设计.md#验证与效果) [tool](https://example.com)", encoding="utf-8")
        self.assertEqual(docs.check_links(self.root, self.source), [])

    def test_missing_file_and_heading_fail(self):
        self.source.write_text("[missing](gone.md) [heading](README.md#absent)", encoding="utf-8")
        self.assertEqual(len(docs.check_links(self.root, self.source)), 2)

    def test_fenced_examples_are_not_links(self):
        self.source.write_text("```md\n[x](missing.md)\n```\n`[x](missing.md)`", encoding="utf-8")
        self.assertEqual(docs.check_links(self.root, self.source), [])

    def test_escaping_and_machine_specific_links_fail(self):
        for target in ("../outside.md", "C:/private/a.md", "/private/a.md", "file:///a.md"):
            with self.subTest(target=target):
                self.source.write_text(f"[x]({target})", encoding="utf-8")
                self.assertTrue(docs.check_links(self.root, self.source))

    def test_valid_fixture_evidence_does_not_imply_release(self):
        self.assertEqual(self.registry_errors([self.entry()]), [])

    def test_missing_metadata_and_duplicate_ids_fail(self):
        entry = self.entry()
        del entry["runtimeSha"]
        self.assertTrue(self.registry_errors([entry]))
        self.assertTrue(self.registry_errors([self.entry(), self.entry()]))

    def test_missing_evidence_cannot_pass(self):
        entry = self.entry()
        entry["artifacts"] = ["missing.json"]
        self.assertTrue(self.registry_errors([entry]))

    def test_changed_quoted_number_fails(self):
        entry = self.entry()
        entry["jsonChecks"]["passed"] = 3
        self.assertTrue(self.registry_errors([entry]))

    def test_invalid_status_and_false_release_fail(self):
        entry = self.entry()
        entry["status"] = "DONE"
        self.assertTrue(self.registry_errors([entry]))
        entry = self.entry()
        entry["releaseAccepted"] = True
        self.assertTrue(self.registry_errors([entry]))

    def test_duplicate_heading_suffix(self):
        self.assertEqual(docs.headings("# Test\n# Test\n# Test"), {"test", "test-1", "test-2"})

    def test_raw_blocked_cannot_be_registered_as_pass(self):
        entry = self.entry()
        (self.root / "evidence.json").write_text('{"passed": 2, "runtime": {"matches": true}, "status": "BLOCKED"}', encoding="utf-8")
        self.assertTrue(self.registry_errors([entry]))

    def test_nonobject_registry_fails_cleanly(self):
        self.assertTrue(docs.check_registry(self.root, []))


if __name__ == "__main__":
    unittest.main()
