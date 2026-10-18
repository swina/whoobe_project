"""Table from the k6 summary export: requests per second, latency percentiles and failures for each scenario."""
import json, os, platform, sys

path, vus, duration, limits = sys.argv[1:5]
stats = sys.argv[5] if len(sys.argv) > 5 else None
m = json.load(open(path))["metrics"]
rows = []
for s in ("public_page", "public_query", "client_data", "login"):
    d = m.get(f"http_req_duration{{scenario:{s}}}", {})
    n = m.get(f"http_reqs{{scenario:{s}}}", {})
    f = m.get(f"http_req_failed{{scenario:{s}}}", {})
    secs = int(duration.rstrip("s"))   # k6 divides by the whole test, the scenarios run one after the other
    rows.append((s, n.get("count", 0), n.get("count", 0) / secs, d.get("med", 0), d.get("p(95)", 0), d.get("p(99)", 0), d.get("max", 0), f.get("value", f.get("rate", 0)) * 100))
cpus = os.cpu_count()
mem = next((int(l.split()[1]) // 1024 // 1024 for l in open("/proc/meminfo") if l.startswith("MemTotal")), 0)
print(f"machine: {platform.machine()}, {cpus} CPUs, {mem} GB; {vus} virtual users per scenario, {duration} each; container limits: {limits}")
print(f"{'scenario':<14}{'requests':>10}{'req/s':>9}{'median ms':>11}{'p95 ms':>9}{'p99 ms':>9}{'max ms':>9}{'failed %':>10}")
for r in rows:
    print(f"{r[0]:<14}{r[1]:>10}{r[2]:>9.1f}{r[3]:>11.1f}{r[4]:>9.1f}{r[5]:>9.1f}{r[6]:>9.1f}{r[7]:>10.2f}")
if stats and os.path.exists(stats):
    peak = {}
    for line in open(stats):
        p = line.split()
        if len(p) >= 4:
            name = p[0].split("-")[-2] if p[0].count("-") >= 2 else p[0]
            cpu = float(p[1].rstrip("%")); used = p[2]
            peak[name] = (max(cpu, peak.get(name, (0, ""))[0]), used if cpu >= peak.get(name, (0, ""))[0] else peak[name][1])
    print("peak CPU % (100 = one CPU) and memory at that sample, sampled every 10 s: " + ", ".join(f"{k} {v[0]:.0f}% {v[1]}" for k, v in sorted(peak.items())))
