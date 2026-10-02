#!/usr/bin/env python3
"""Reads the static scan reports of a run directory, applies baseline.json and prints/writes a summary.
Exit code 1 when anything new (not baselined) is found or a baseline entry has expired."""
import json, sys, datetime, pathlib, re

here = pathlib.Path(__file__).resolve().parent
reports = pathlib.Path(sys.argv[1])
stamp = sys.argv[2] if len(sys.argv) > 2 else datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
base = json.loads((here / 'baseline.json').read_text())
today = datetime.date.today().isoformat()

def load(name, default=None):
    p = reports / name
    try:
        return json.loads(p.read_text())
    except Exception:
        return default

expired = [f"{sec}: {e.get('id') or e.get('check') or e.get('file')} (review {e['review']})" for sec in ('audit', 'gitleaks', 'semgrep') for e in base.get(sec, []) if e.get('review', '9999') < today]
sections = []

def section(name, status, lines):
    sections.append({'name': name, 'status': status, 'lines': lines})

# dependencies
audit = load('pnpm-audit.json')
if audit is None:
    section('pnpm audit', 'NOT RUN', [])
else:
    accepted = {e['id'] for e in base['audit']}
    adv = audit.get('advisories', {}).values()
    new = [a for a in adv if a['severity'] in ('high', 'critical') and a.get('github_advisory_id') not in accepted]
    known = [a for a in adv if a.get('github_advisory_id') in accepted]
    low = [a for a in adv if a['severity'] not in ('high', 'critical') and a.get('github_advisory_id') not in accepted]
    section('pnpm audit (prod)', 'FAIL' if new else 'ok', [f"NEW {a['severity']} {a['module_name']} {a.get('github_advisory_id')}: {a['title']}" for a in new] + [f"accepted {a['module_name']} {a.get('github_advisory_id')}" for a in known] + [f"info {a['severity']} {a['module_name']}: {a['title']}" for a in low])

# secrets
gl = load('gitleaks.json')
if gl is None:
    section('gitleaks', 'NOT RUN', [])
else:
    def is_accepted(f):
        return any(e['file'] == f['File'] and (not e.get('commit') or f.get('Commit', '').startswith(e['commit'])) for e in base['gitleaks'])
    new = [f for f in gl if not is_accepted(f)]
    section('gitleaks (tree + history)', 'FAIL' if new else 'ok', [f"NEW {f['RuleID']} {f['File']}:{f.get('StartLine')} commit {f.get('Commit', '')[:7]}" for f in new] + [f"accepted {len(gl) - len(new)} baselined finding(s)"])

# code
sg = load('semgrep.json')
if sg is None:
    section('semgrep', 'NOT RUN', [])
else:
    res = sg.get('results', [])
    def sg_accepted(r):
        path = r['path'].replace('/src/', '', 1)
        return any(e['check'] == r['check_id'].split('.')[-1] and e['path'] == path for e in base['semgrep'])
    new = [r for r in res if not sg_accepted(r)]
    fatal = [r for r in new if r['extra']['severity'] == 'ERROR']
    section('semgrep', 'FAIL' if fatal else 'ok', [f"NEW {r['extra']['severity']} {r['check_id'].split('.')[-1]} {r['path'].replace('/src/', '', 1)}:{r['start']['line']}" for r in new] + [f"accepted {len(res) - len(new)} baselined finding(s)"])

# shell
sc = load('shellcheck.json')
if sc is None:
    section('shellcheck', 'NOT RUN', [])
else:
    bad = [x for x in sc if x['level'] in ('error', 'warning')]
    section('shellcheck', 'FAIL' if bad else 'ok', [f"{x['file']}:{x['line']} SC{x['code']} {x['level']}" for x in sc])

# containers
tr = load('trivy-config.json')
hl = load('hadolint.json')
if tr is None:
    section('trivy config', 'NOT RUN', [])
else:
    skip = base['trivy_skip_targets']
    lines, fail = [], False
    for r in tr.get('Results', []):
        if any(s in r['Target'] for s in skip):
            continue
        for m in r.get('Misconfigurations', []):
            lines.append(f"{m['Severity']} {r['Target']} {m['ID']} {m['Title']}")
            fail = fail or m['Severity'] in ('HIGH', 'CRITICAL')
    section('trivy config (tracked files)', 'FAIL' if fail else 'ok', lines)
if hl is not None:
    bad = [x for x in hl if x['level'] in ('error', 'warning')]
    section('hadolint', 'FAIL' if bad else 'ok', [f"Dockerfile:{x['line']} {x['code']} {x['level']} {x['message']}" for x in hl])

vh = reports / 'vhtml-inventory.txt'
if vh.exists():
    n = len(vh.read_text().splitlines())
    section('v-html / innerHTML inventory', 'info', [f"{n} sites to review (F-008)"])

fail = bool(expired) or any(s['status'] == 'FAIL' for s in sections)
out = [f"Static security scan - {'FAIL' if fail else 'PASS'}   {datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')}", '']
for s in sections:
    out.append(f"[{s['status']:^7}] {s['name']}")
    out += [f"           {l}" for l in s['lines']]
if expired:
    out += ['', 'Expired baseline entries (re-review or remove):'] + [f"  - {e}" for e in expired]
text = '\n'.join(out) + '\n'
(reports / f'static-{stamp}.txt').write_text(text)
(reports / f'static-{stamp}.json').write_text(json.dumps({'result': 'FAIL' if fail else 'PASS', 'sections': sections, 'expired': expired}, indent=2))
print(text)
print(f"Report written: {reports}/static-{stamp}.txt (+ .json)")
sys.exit(1 if fail else 0)
