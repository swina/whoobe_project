#!/usr/bin/env python3
"""Third-party licence notices: THIRD_PARTY_NOTICES.md from the production dependencies of every workspace.

 python3 scripts/release/third-party-notices.py            write THIRD_PARTY_NOTICES.md (root)
 python3 scripts/release/third-party-notices.py --check    write nothing; exit 1 if a licence is not allowed or reviewed,
                                                           or if THIRD_PARTY_NOTICES.md is out of date with the lockfile

Needs `pnpm install` done (it reads the packages' own licence files from node_modules). Production dependencies only
(`pnpm licenses list --prod -r`): what ends up in the images and the generated sites, not the build tools.
Policy: the licence ids in ALLOWED are permissive; the ones in REVIEWED are accepted with a written reason (shown in the file);
anything else fails the check, so a new dependency with an unknown or copyleft licence is looked at before a release.
"""
import json, os, re, subprocess, sys

ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
os.chdir(ROOT)
OUT = 'THIRD_PARTY_NOTICES.md'

ALLOWED = {'MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'BSD', 'Unlicense', 'CC0-1.0', 'MIT-0', '0BSD',
           '(MIT AND Zlib)', 'Python-2.0', '(MPL-2.0 OR Apache-2.0)', '(MIT OR GPL-3.0-or-later)'}
# licence field missing in package.json: the packages' own licence file says MIT (checked 2026-10-13)
OVERRIDES = {'khroma': 'MIT', 'thirty-two': 'MIT'}
REVIEWED = {
    'OFL-1.1': '`@fontsource/inter`: the Inter typeface (SIL Open Font License 1.1) bundled as woff2 files for the dashboard and the editor, unmodified; '
               'a free licence that allows redistribution and commercial use. The font files are not sold on their own and keep their licence text.',
    'LGPL-3.0-or-later': 'libvips binaries shipped by `sharp` (image processing in asset-processor). LGPL: used as a separate dynamically linked library, '
                         'not modified; the licence text and the source location (https://github.com/lovell/sharp-libvips) are given here.',
}
SPECIAL_TEXT = {  # canonical SPDX name -> file names to look for in a package
}
LICENSE_FILES = re.compile(r'^(licen[sc]e|licen[sc]ing|copying|unlicense)([-_.].*)?$', re.I)
NOTICE_FILES = re.compile(r'^notice([-_.].*)?$', re.I)

def run_pnpm():
    out = subprocess.check_output(['pnpm', 'licenses', 'list', '--json', '--prod', '-r'], text=True, stderr=subprocess.DEVNULL)
    return json.loads(out)

def read_first(path, pattern):
    try:
        for f in sorted(os.listdir(path)):
            fp = os.path.join(path, f)
            if os.path.isfile(fp) and pattern.match(f):
                return open(fp, encoding='utf-8', errors='replace').read().strip()
    except OSError:
        pass
    return ''

def copyright_lines(text):
    lines = [l.strip(' *#/\t') for l in text.splitlines()]
    lines = [l for l in lines if re.match(r'(copyright|\(c\)\s*\d|©)', l, re.I) and not re.search(r'notice|owner|holders?\b.*(be|shall)|licen[sc]e', l, re.I)]
    return [l for l in lines if 6 < len(l) < 160][:2]

def collect():
    data = run_pnpm()
    pk = {}
    for lic, items in data.items():
        for it in items:
            lic_id = OVERRIDES.get(it['name'], lic)
            for v, path in zip(it['versions'], it['paths']):
                key = (it['name'], v)
                text = read_first(path, LICENSE_FILES)
                pk[key] = {'name': it['name'], 'version': v, 'license': lic_id, 'author': it.get('author') or '', 'homepage': it.get('homepage') or '',
                           'copyright': copyright_lines(text), 'text': text, 'notice': read_first(path, NOTICE_FILES)}
    return pk

def render(pk):
    by_lic = {}
    for p in pk.values():
        by_lic.setdefault(p['license'], []).append(p)
    L = ['# Third-party notices', '',
         'Whoobe is released under the MIT licence ([LICENSE.md](LICENSE.md)). It includes or depends on the third-party software below, each under its own',
         'licence. This file is **generated** from the production dependencies of every workspace by `scripts/release/third-party-notices.py`; do not edit it by hand.',
         'The human-readable thanks are in [docs/release/credits.md](docs/release/credits.md).', '',
         f'**{len(pk)} packages** under {len(by_lic)} licence identifiers.', '', '## Summary by licence', '', '| Licence | Packages |', '|---|---|']
    for lic in sorted(by_lic, key=lambda k: -len(by_lic[k])):
        L.append(f'| {lic} | {len(by_lic[lic])} |')
    L += ['', '## Licences that need attention', '']
    for lic, why in REVIEWED.items():
        if lic in by_lic:
            names = ', '.join(sorted(f"{p['name']} {p['version']}" for p in by_lic[lic]))
            L += [f'- **{lic}** ({names}): {why}']
    if OVERRIDES:
        L += [f'- **Licence field missing in the package metadata**: ' + ', '.join(sorted(OVERRIDES)) + ' (their licence files say MIT).']
    L += ['', '## Packages', '', '| Package | Version | Licence | Copyright |', '|---|---|---|---|']
    for p in sorted(pk.values(), key=lambda p: (p['name'].lower(), p['version'])):
        c = '; '.join(p['copyright']).replace('|', '/') or p['author'].replace('|', '/')
        L.append(f"| {p['name']} | {p['version']} | {p['license']} | {c} |")
    L += ['', '## Licence texts', '',
          'One text per licence, taken from the first package that carries it; the copyright holders are in the table above and in each package.', '']
    for lic in sorted(by_lic):
        pkgs = sorted(by_lic[lic], key=lambda p: p['name'].lower())
        sample = next((p for p in pkgs if p['text']), None)
        L += [f'### {lic}', '']
        if sample:
            L += [f"Text of `{sample['name']}`:", '', '```text', sample['text'], '```', '']
        else:
            L += ['No licence file was found in the packages; see their homepages.', '']
    notices = [p for p in pk.values() if p['notice']]
    if notices:
        L += ['## NOTICE files (Apache-2.0)', '']
        for p in sorted(notices, key=lambda p: p['name'].lower()):
            L += [f"### {p['name']} {p['version']}", '', '```text', p['notice'], '```', '']
    return '\n'.join(L).rstrip() + '\n'

def main():
    check = '--check' in sys.argv
    pk = collect()
    problems = []
    for p in pk.values():
        if p['license'] not in ALLOWED and p['license'] not in REVIEWED:
            problems.append(f"licence not allowed or reviewed: {p['name']} {p['version']}: {p['license']}")
    text = render(pk)
    if check:
        # same packages and licences as the committed file (ignores the order of the texts)
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        names = lambda t: set(re.findall(r'^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|', t, re.M))
        if names(cur) != names(text):
            problems.append(f'{OUT} is out of date: run scripts/release/third-party-notices.py and commit it')
        for pr in problems: print('  FAIL', pr)
        print(f'  third-party notices: {len(pk)} packages checked')
        sys.exit(1 if problems else 0)
    for pr in problems: print('  WARN', pr)
    open(OUT, 'w', encoding='utf-8').write(text)
    print(f'wrote {OUT}: {len(pk)} packages, {len(text) // 1024} KB')
    sys.exit(1 if problems else 0)

main()
