import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from sync import validate_manifest


class ValidateManifestTests(unittest.TestCase):
    def setUp(self):
        self.payload = b"product_id,quantity\n1,4\n"
        self.key = "shopfront/exports/stock.csv"
        self.sha256 = hashlib.sha256(self.payload).hexdigest()
        self.objects = [
            {"key": "shopfront/manifest.json", "size": 120},
            {"key": self.key, "size": len(self.payload)},
        ]
        self.summaries = [
            {"key": "shopfront/manifest.json", "sizeBytes": 120, "sha256": "a" * 64},
            {"key": self.key, "sizeBytes": len(self.payload), "sha256": self.sha256},
        ]
        self.tempdir = tempfile.TemporaryDirectory()
        self.manifest_path = Path(self.tempdir.name) / "manifest.json"
        self.manifest = {"objects": [{"key": self.key, "bytes": len(self.payload), "sha256": self.sha256}]}
        self.write_manifest()

    def tearDown(self):
        self.tempdir.cleanup()

    def write_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_matching_manifest_is_accepted(self):
        validate_manifest(self.manifest_path, self.objects, self.summaries)

    def test_checksum_mismatch_is_rejected(self):
        self.manifest["objects"][0]["sha256"] = "0" * 64
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            validate_manifest(self.manifest_path, self.objects, self.summaries)

    def test_incomplete_manifest_is_rejected(self):
        self.manifest["objects"] = []
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "cover every"):
            validate_manifest(self.manifest_path, self.objects, self.summaries)

    def test_manifest_size_mismatch_is_rejected(self):
        self.manifest["objects"][0]["bytes"] += 1
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "size"):
            validate_manifest(self.manifest_path, self.objects, self.summaries)


if __name__ == "__main__":
    unittest.main()
