import copy
import json
import pathlib
import subprocess
import sys
import unittest


VERIFY = pathlib.Path(__file__).with_name("verify.py")
VALID = {
    "input_events": 10_000,
    "duplicate_events": 1_000,
    "applied_events": 9_000,
    "requests": 7_200,
    "request_rate_per_second": 2.0,
    "endpoint_requests": {"/health": 2_400, "/status": 2_400, "/settings": 2_400},
    "endpoint_errors": {"/health": 0, "/status": 0, "/settings": 0},
    "error_rate": 0.001,
    "http_p95_ms": 500,
    "scheduler_p99_ms": 100,
    "rss_p95_mib": 650,
    "process_exit_code": 0,
    "duration_met": True,
    "low_available_memory_max_seconds": 59,
    "system_cpu_p95_percent": 70,
    "swap_out_pages": 0,
    "oom_kill_count": 0,
    "process_restart_count": 0,
}


def verify(result):
    return subprocess.run(
        [sys.executable, str(VERIFY)],
        input=json.dumps(result),
        text=True,
        capture_output=True,
        check=False,
    )


class VerifyTest(unittest.TestCase):
    def test_all_boundaries_pass(self):
        self.assertEqual(verify(VALID).returncode, 0)

    def test_missing_metrics_fail_without_traceback(self):
        completed = verify({})
        self.assertEqual(completed.returncode, 1)
        self.assertEqual(completed.stdout.count("FAIL "), 16)
        self.assertNotIn("Traceback", completed.stderr)

    def test_workload_and_failure_signals_fail(self):
        for key, value in (
            ("request_rate_per_second", 1.94),
            ("oom_kill_count", 1),
            ("process_restart_count", 1),
        ):
            with self.subTest(key=key):
                result = copy.deepcopy(VALID)
                result[key] = value
                self.assertEqual(verify(result).returncode, 1)
        result = copy.deepcopy(VALID)
        result["endpoint_errors"]["/health"] = 1
        self.assertEqual(verify(result).returncode, 1)


if __name__ == "__main__":
    unittest.main()
