import json, sys
data = json.load(open(sys.argv[1])); img = sys.argv[2]
rows = []
for res in data.get('Results') or []:
    for v in res.get('Vulnerabilities') or []:
        rows.append((v['Severity'], v['VulnerabilityID'], v['PkgName'], v['InstalledVersion'], v.get('FixedVersion', ''), res.get('Target', '')))
rows.sort(key=lambda r: (r[0] != 'CRITICAL', r[2], r[1]))
print(f"trivy image {img}: {'FAIL' if rows else 'PASS'} ({len(rows)} fixable HIGH/CRITICAL)")
for sev, vid, pkg, inst, fix, tgt in rows[:40]: print(f"  {sev:8} {vid:18} {pkg} {inst} -> {fix}")
sys.exit(1 if rows else 0)
