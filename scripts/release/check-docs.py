#!/usr/bin/env python3
"""Release gate: docs/release must describe what the code does.

 1. every core-api route (scripts/security/routes.expected.json) is in the API route table;
 2. the generated API reference / OpenAPI file are exactly what the generator produces now;
 3. no broken relative link or `docs/...` path in docs/release, and every repository path quoted in backticks exists;
 4. docs/release/README.md carries the "Aligned to release" line.
Exit 0 = all good, 1 = something to fix.
"""
import filecmp, json, os, re, shutil, subprocess, sys, tempfile

ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
os.chdir(ROOT)
problems = []

# --- 1. route coverage
def norm(p): return re.sub(r':[A-Za-z]+', '{p}', p)
expected = json.load(open('scripts/security/routes.expected.json'))['routes']
code = {(k.split(' ')[0], norm(k.split(' ', 1)[1])) for k in expected}
gen = open('docs/release/api/gen-api-docs.py').read()
documented = {(m, norm(p)) for m, p in re.findall(r'\("(GET|POST|PUT|PATCH|DELETE)",\s*"(/[^"]*)"', gen)}
for m, p in sorted(code - documented):
    problems.append(f'route not in the API docs: {m} {p}')
print(f'  api routes: {len(code)} in core-api, {len(code & documented)} documented')

# --- 2. generated files are current
tmp = tempfile.mkdtemp()
try:
    work = os.path.join(tmp, 'api')
    shutil.copytree('docs/release/api', work)
    subprocess.run([sys.executable, os.path.join(work, 'gen-api-docs.py')], check=True, capture_output=True)
    for f in ('api-reference.md', 'openapi.yaml'):
        if not filecmp.cmp(os.path.join(work, f), os.path.join('docs/release/api', f), shallow=False):
            problems.append(f'docs/release/api/{f} is not what gen-api-docs.py generates: run it and commit the result')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# --- 3. links and quoted paths
IGNORE_PATH = re.compile(r'[<>{}*$]|client-a|\.\.\.|your-|example')
md = [os.path.join(d, f) for d, _, fs in os.walk('docs/release') for f in fs if f.endswith('.md')]
for f in sorted(md):
    t = open(f, encoding='utf-8').read()
    t_nocode = re.sub(r'```.*?```', '', t, flags=re.S)
    for l in set(re.findall(r'\]\((?!https?:|#|mailto)([^)#\s]+)', t_nocode)):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), l))):
            problems.append(f'{f}: broken link {l}')
    for m in set(re.findall(r'docs/[A-Za-z0-9_./-]+\.(?:md|yaml|py|json)\b', t)):
        if not os.path.exists(m):
            problems.append(f'{f}: missing file {m}')
    for m in set(re.findall(r'`((?:apps|packages|scripts|deploy|docker)/[A-Za-z0-9_./\-]+)`', t_nocode)):
        if IGNORE_PATH.search(m) or os.path.exists(m.rstrip('/')):
            continue
        # generated or local-only files (reports, env files) are git-ignored and absent from a fresh checkout
        if any(subprocess.run(['git', 'check-ignore', '-q', cand], capture_output=True).returncode == 0
               for cand in (m.rstrip('/'), m.rstrip('/') + '/')):
            continue
        problems.append(f'{f}: quoted path does not exist: {m}')
print(f'  documents checked: {len(md)}')

# --- 4. alignment line
readme = open('docs/release/README.md', encoding='utf-8').read()
if not re.search(r'^\*\*Aligned to release:\*\*', readme, re.M):
    problems.append('docs/release/README.md has no "**Aligned to release:**" line')

for p in problems:
    print(f'  FAIL {p}')
sys.exit(1 if problems else 0)
