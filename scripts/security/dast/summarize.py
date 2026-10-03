#!/usr/bin/env python3
"""Summarises the ZAP JSON reports of one run (reports/<date>/zap-<service>-<time>.json) against baseline.json."""
import json, sys, pathlib, datetime, glob, re

here = pathlib.Path(__file__).resolve().parent
reports = pathlib.Path(sys.argv[1]); stamp = sys.argv[2]
base = json.loads((here / 'baseline.json').read_text())
today = datetime.date.today().isoformat()
RISK = {'3': 'High', '2': 'Medium', '1': 'Low', '0': 'Info'}

expired = [f"{e.get('alert')} ({e.get('service','*')}, review {e['review']})" for e in base['accepted'] if e.get('review', '9999') < today]

def accepted(alert, service):
    return any(e['alert'].lower() in alert.lower() and e.get('service', service) == service and e.get('review', '9999') >= today for e in base['accepted'])

rows, fail = [], bool(expired)
for f in sorted(glob.glob(str(reports / f'zap-*-{stamp}.json'))):
    service = re.match(r'zap-(.+)-' + re.escape(stamp), pathlib.Path(f).name).group(1)
    try:
        data = json.load(open(f))
    except Exception:
        rows.append((service, 'NOT RUN', 'report missing or unreadable')); continue
    alerts = [a for s in data.get('site', []) for a in s.get('alerts', [])]
    for a in sorted(alerts, key=lambda x: -int(x.get('riskcode', 0))):
        risk = RISK.get(str(a.get('riskcode')), '?')
        acc = accepted(a['alert'], service)
        new_high = risk == 'High' and not acc
        fail = fail or new_high
        rows.append((service, risk, f"{'NEW ' if new_high else ('accepted ' if acc else '')}{a['alert']} ({a.get('count', len(a.get('instances', [])))} instance(s))"))

lines = [f"DAST (OWASP ZAP) - {'FAIL' if fail else 'PASS'}   {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}", '']
counts = {}
for svc, risk, text in rows:
    counts[(svc, risk)] = counts.get((svc, risk), 0) + 1
for svc in sorted({r[0] for r in rows}):
    lines.append(f"[{svc}] " + ', '.join(f"{k[1]}: {v}" for k, v in sorted(counts.items(), key=lambda kv: ['High','Medium','Low','Info','NOT RUN','?'].index(kv[0][1]) if kv[0][1] in ['High','Medium','Low','Info','NOT RUN','?'] else 9) if k[0] == svc))
lines.append('')
for svc, risk, text in rows:
    if risk in ('High', 'Medium', 'NOT RUN', '?'):
        lines.append(f"  {svc:16} {risk:7} {text}")
if expired:
    lines += ['', 'Expired baseline entries:'] + [f"  - {e}" for e in expired]
text = '\n'.join(lines) + '\n'
(reports / f'zap-summary-{stamp}.txt').write_text(text)
print(text); print(f"Report written: {reports}/zap-summary-{stamp}.txt (+ per-service .html/.json)")
sys.exit(1 if fail else 0)
