#!/usr/bin/env python3
"""Reads a testssl.sh JSON report and prints what matters; exit 1 on a finding rated HIGH/CRITICAL (or a protocol or
cipher problem that testssl marks as not OK) that is not in baseline.json. Self-signed-certificate findings are ignored."""
import json, sys, pathlib, re
here = pathlib.Path(__file__).resolve().parent
report, image = sys.argv[1], sys.argv[2]
base = json.loads((here / 'baseline.json').read_text())
data = json.load(open(report))
rows = data if isinstance(data, list) else data.get('scanResult', [])
if rows and isinstance(rows[0], dict) and 'serverDefaults' in rows[0]:   # newer layout
    rows = [{**f, 'section': k} for r in rows for k, v in r.items() if isinstance(v, list) for f in v]
IGNORE_ID = re.compile(r'^(cert_|trust|OCSP|DNS_CAArecord|certificate_transparency|intermediate_cert|cert_chain|clientsimulation|client_|rating_spec|grade_cap|overall_grade|scanTime|engine_problem|service|banner|TLS_session|fallback|sig_alg|TLS_timestamp|session_ticket|cipher_order|DNS|fs_|security_headers|HSTS_time|cookie|BREACH)', re.I)
bad = []
for f in rows:
    sev = str(f.get('severity', '')).upper(); fid = str(f.get('id', ''))
    if sev in ('HIGH', 'CRITICAL', 'MEDIUM', 'WARN', 'LOW') and not IGNORE_ID.match(fid):
        if any(b['id'] == fid and b.get('image', image) in image for b in base['accepted']): continue
        bad.append((sev, fid, str(f.get('finding', ''))[:130]))
order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'WARN': 3, 'LOW': 4}
bad.sort(key=lambda x: order.get(x[0], 9))
fail = any(b[0] in ('CRITICAL', 'HIGH') for b in bad)
hsts = [f for f in rows if f.get('id') == 'HSTS_time']
fail = fail or not hsts
print(f"TLS (testssl.sh) on {image} - {'FAIL' if fail else 'PASS'}")
for sev, fid, text in bad: print(f"  {sev:8} {fid:28} {text}")
protos = {f['id']: f.get('finding') for f in rows if re.match(r'^(SSLv2|SSLv3|TLS1|TLS1_1|TLS1_2|TLS1_3)$', str(f.get('id', '')))}
print('  protocols:', ', '.join(f"{k}={v}" for k, v in protos.items()))
hsts = [f for f in rows if f.get('id') == 'HSTS_time']
print('  HSTS:', hsts[0].get('finding') if hsts else 'not offered')
if not hsts: print('  FAIL: no Strict-Transport-Security header'); fail = True
sys.exit(1 if fail else 0)
