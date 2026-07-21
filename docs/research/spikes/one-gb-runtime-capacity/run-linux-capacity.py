import json
import math
import pathlib
import subprocess
import sys
import time


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else 0


def read_meminfo(proc_root):
    values = {}
    for line in (proc_root / "meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        values[key] = int(value.split()[0])
    return values


def read_cpu(proc_root):
    fields = [int(value) for value in (proc_root / "stat").read_text().splitlines()[0].split()[1:]]
    idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
    return sum(fields), idle


def read_pswpout(proc_root):
    for line in (proc_root / "vmstat").read_text().splitlines():
        key, value = line.split()
        if key == "pswpout":
            return int(value)
    raise ValueError("pswpout missing from /proc/vmstat")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("typescript", "python"):
        raise SystemExit("usage: run-linux-capacity.py typescript|python seconds")
    runtime, seconds_text = sys.argv[1:]
    seconds = int(seconds_text)
    if seconds < 1:
        raise SystemExit("seconds must be positive")
    proc_root = pathlib.Path("/proc")
    if not (proc_root / "meminfo").exists():
        raise SystemExit("Linux /proc is required")

    started = time.monotonic()
    process = subprocess.Popen(
        ["./run-runtime-harness.sh", runtime, str(seconds)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    available_samples = []
    cpu_samples = []
    low_run = 0
    low_max = 0
    previous_total, previous_idle = read_cpu(proc_root)
    swap_start = read_pswpout(proc_root)
    while process.poll() is None:
        time.sleep(1)
        memory = read_meminfo(proc_root)
        available_mib = memory["MemAvailable"] / 1024
        available_samples.append(available_mib)
        low_run = low_run + 1 if available_mib < 128 else 0
        low_max = max(low_max, low_run)
        total, idle = read_cpu(proc_root)
        delta_total = total - previous_total
        delta_idle = idle - previous_idle
        if delta_total > 0:
            cpu_samples.append(100 * (delta_total - delta_idle) / delta_total)
        previous_total, previous_idle = total, idle

    stdout, stderr = process.communicate()
    if process.returncode != 0:
        sys.stderr.write(stderr)
        result = {}
    else:
        result = json.loads(stdout)
    elapsed = time.monotonic() - started
    result.update({
        "process_exit_code": process.returncode,
        "duration_target_seconds": seconds,
        "duration_met": elapsed >= seconds,
        "system_cpu_p95_percent": percentile(cpu_samples, 0.95),
        "min_available_memory_mib": min(available_samples) if available_samples else 0,
        "low_available_memory_max_seconds": low_max,
        "swap_out_pages": max(0, read_pswpout(proc_root) - swap_start),
    })
    print(json.dumps(result))


if __name__ == "__main__":
    main()
