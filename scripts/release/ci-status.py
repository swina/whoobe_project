#!/usr/bin/env python3
"""Release gate: did the `security` workflow pass on this commit, DAST included?

Usage: ci-status.py <commit-sha>
Reads the repository from `git remote origin` and a token from GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN
(needed for a private repository). Exit 0 = gate passed, 1 = gate failed, 2 = could not verify.
"""
import json, os, re, subprocess, sys, urllib.request

sha = sys.argv[1]
remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], text=True).strip()
m = re.search(r'github\.com[:/](.+?)(?:\.git)?$', remote)
if not m:
    print(f"  cannot tell the GitHub repository from remote '{remote}'"); sys.exit(2)
repo = m.group(1)
token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GITHUB_PERSONAL_ACCESS_TOKEN')


def api(path):
    req = urllib.request.Request(f'https://api.github.com/repos/{repo}/{path}', headers={'Accept': 'application/vnd.github+json'})
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


try:
    runs = [r for r in api(f'actions/runs?head_sha={sha}&per_page=50')['workflow_runs'] if r['name'] == 'security']
except Exception as e:  # network, auth, rate limit
    print(f'  cannot query GitHub Actions: {e}'); sys.exit(2)

if not runs:
    print(f'  no `security` workflow run for {sha[:7]}: push the commit and wait for the run'); sys.exit(1)

status = 0
latest = max(runs, key=lambda r: r['created_at'])
print(f"  security run {latest['id']} ({latest['event']}): {latest['status']} / {latest['conclusion']}")
if latest['status'] != 'completed':
    print('  the run has not finished'); status = 1
elif latest['conclusion'] != 'success':
    print('  the run did not succeed'); status = 1

dast_ok = False
for r in runs:
    for j in api(f"actions/runs/{r['id']}/jobs?per_page=50")['jobs']:
        if j['name'].startswith('DAST') and j['conclusion'] == 'success':
            dast_ok = True
if dast_ok:
    print('  DAST (OWASP ZAP): passed on this commit')
else:
    print('  DAST (OWASP ZAP): no successful run on this commit - start the workflow manually with "Also run the ZAP DAST scan" ticked')
    status = 1
sys.exit(status)
