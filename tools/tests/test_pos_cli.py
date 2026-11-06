import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


CLI = Path(__file__).resolve().parents[1] / "orithos-pos"


class FixtureHandler(BaseHTTPRequestHandler):
    requests = []

    def do_GET(self):
        self.__class__.requests.append(("GET", self.path, self.headers, None))
        if self.path.endswith("/operations/op-1"):
            payload = {"operationId": "op-1", "status": "completed"}
        else:
            payload = {"resource": "products", "items": [{"id": 7, "name": "Test"}]}
        self._respond(payload)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        self.__class__.requests.append(("POST", self.path, self.headers, body))
        self._respond({"operationId": "op-1", "accepted": len(body)})

    def _respond(self, payload):
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args):
        pass


class PosCliFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        FixtureHandler.requests.clear()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / "config.json"
        self.config_path.write_text(json.dumps({"api_url": self.base_url, "token": "fixture-token"}))
        self.env = os.environ.copy()
        self.env["ORITHOS_POS_CONFIG"] = str(self.config_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_read_and_operation_commands_use_rest_api_token(self):
        products = self.run_cli("--json", "products", "list")
        operation = self.run_cli("--json", "operations", "get", "op-1")

        self.assertEqual(products.returncode, 0, products.stderr)
        self.assertEqual(operation.returncode, 0, operation.stderr)
        self.assertIn('"id": 7', products.stdout)
        self.assertIn('"status": "completed"', operation.stdout)
        self.assertEqual([entry[1] for entry in FixtureHandler.requests], [
            "/api/pos/v1/products",
            "/api/pos/v1/operations/op-1",
        ])
        for _, _, headers, _ in FixtureHandler.requests:
            self.assertEqual(headers.get("Authorization"), "Bearer fixture-token")

    def test_write_requires_confirmation_and_sends_idempotency_key(self):
        records_path = Path(self.temp_dir.name) / "records.json"
        records_path.write_text(json.dumps([{"sourceId": "fixture-1"}]))

        rejected = self.run_cli("sales", "create", "--file", str(records_path))
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("--confirm", rejected.stderr)
        self.assertEqual(FixtureHandler.requests, [])

        accepted = self.run_cli("--json", "sales", "create", "--file", str(records_path), "--confirm")
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        method, path, headers, body = FixtureHandler.requests[0]
        self.assertEqual((method, path), ("POST", "/api/pos/v1/sales:batch"))
        self.assertTrue(headers.get("Idempotency-Key"))
        self.assertEqual(body, [{"sourceId": "fixture-1"}])
        self.assertNotIn("fixture-token", accepted.stdout)

    def test_explicit_idempotency_key_can_be_reused_across_invocations(self):
        records_path = Path(self.temp_dir.name) / "records.json"
        records_path.write_text(json.dumps([{"sourceId": "fixture-1"}]))

        first = self.run_cli(
            "--json", "sync", "batch", "--resource", "inventory", "--file", str(records_path),
            "--confirm", "--idempotency-key", "retry-fixture-1",
        )
        second = self.run_cli(
            "--json", "sync", "batch", "--resource", "inventory", "--file", str(records_path),
            "--confirm", "--idempotency-key", "retry-fixture-1",
        )

        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(len(FixtureHandler.requests), 2)
        self.assertEqual([entry[2].get("Idempotency-Key") for entry in FixtureHandler.requests], [
            "retry-fixture-1",
            "retry-fixture-1",
        ])


if __name__ == "__main__":
    unittest.main()
