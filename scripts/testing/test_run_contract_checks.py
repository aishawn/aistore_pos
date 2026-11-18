import os
import subprocess
import sys
import unittest


SCRIPT = os.path.join(os.path.dirname(__file__), "run_contract_checks.py")


class ContractTargetSafetyTests(unittest.TestCase):
    def test_non_allowlisted_host_is_rejected_before_runner_invocation(self):
        env = {
            **os.environ,
            "API_BASE_URL": "https://pos.example.invalid",
            "SCHEMATHESIS_ALLOWED_HOSTS": "localhost",
        }
        result = subprocess.run([sys.executable, SCRIPT], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("not in SCHEMATHESIS_ALLOWED_HOSTS", result.stderr)


if __name__ == "__main__":
    unittest.main()
