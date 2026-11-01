import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import unittest

spec = importlib.util.spec_from_file_location("snapshot_probe", Path(__file__).with_name("diagnose-odoo-snapshot.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SnapshotProbeTest(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.allowed = {"7": {}}
        self.rpc_error = None
        parent = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                parent.requests.append((self.path, body["params"]))
                if self.path == "/web/session/authenticate":
                    result = {"result": {"uid": 1, "user_companies": {"allowed_companies": parent.allowed}}}
                else:
                    result = {"error": parent.rpc_error} if parent.rpc_error else {"result": [{"id": 3, "name": "PRIVATE CUSTOMER"}]}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.config = {"ODOO_BASE_URL": f"http://127.0.0.1:{self.server.server_port}",
                       "ODOO_DATABASE": "test", "ODOO_SERVICE_USERNAME": "test", "ODOO_SERVICE_PASSWORD": "SECRET"}

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_success_is_scoped_read_only_and_does_not_export_rows(self):
        result = module.probe(self.config, 7, 9)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["businessWrites"], 0)
        self.assertEqual(len(self.requests), 4)
        for path, params in self.requests[1:]:
            self.assertEqual(path, "/web/dataset/call_kw")
            self.assertEqual(params["method"], "search_read")
            self.assertEqual(params["kwargs"]["context"], {"allowed_company_ids": [7], "force_company": 7, "warehouse": 9})
            self.assertEqual(params["kwargs"]["limit"], 1)
        self.assertNotIn("PRIVATE CUSTOMER", json.dumps(result))
        self.assertNotIn("SECRET", json.dumps(result))

    def test_stale_or_unauthorized_binding_never_falls_back_to_another_company(self):
        with self.assertRaisesRegex(module.ProbeFailure, "COMPANY_NOT_ACCESSIBLE_OR_BINDING_STALE"):
            module.probe(self.config, 188)
        self.assertEqual(len(self.requests), 1)

    def test_errors_are_classified_without_raw_provider_data(self):
        self.rpc_error = {"message": "SECRET", "data": {"name": "odoo.exceptions.AccessError", "debug": "PRIVATE CUSTOMER"}}
        result = module.probe(self.config, 7)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertTrue(all(row["cause"] == "ACCESS_DENIED" for row in result["checks"]))
        self.assertNotIn("PRIVATE CUSTOMER", json.dumps(result))
        self.assertNotIn("SECRET", json.dumps(result))

    def test_unknown_or_malformed_error_names_are_not_echoed(self):
        for error in [None, "SECRET", {"data": "SECRET"}, {"data": {"name": "SECRET"}}]:
            self.assertEqual(module.error_category(error), "RPC_ERROR")
        self.assertEqual(module.error_category({"data": {"name": "builtins.ValueError"}}), "INVALID_REQUEST_OR_SCHEMA")


if __name__ == "__main__":
    unittest.main()
