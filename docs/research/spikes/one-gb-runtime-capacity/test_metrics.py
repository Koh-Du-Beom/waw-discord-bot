import importlib.util
import pathlib
import tempfile
import unittest

MODULE_PATH = pathlib.Path(__file__).with_name("run-linux-capacity.py")
SPEC = importlib.util.spec_from_file_location("run_linux_capacity", MODULE_PATH)
metrics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(metrics)


class MetricsTest(unittest.TestCase):
    def test_proc_parsers_and_percentile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "meminfo").write_text("MemAvailable: 131072 kB\nSwapFree: 0 kB\n")
            (root / "stat").write_text("cpu  10 2 3 20 5 0 0 0 0 0\n")
            (root / "vmstat").write_text("pswpin 2\npswpout 7\n")
            self.assertEqual(metrics.read_meminfo(root)["MemAvailable"], 131072)
            self.assertEqual(metrics.read_cpu(root), (40, 25))
            self.assertEqual(metrics.read_pswpout(root), 7)
            self.assertEqual(metrics.percentile([4, 1, 3, 2], 0.95), 4)


if __name__ == "__main__":
    unittest.main()
