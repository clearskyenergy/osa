#!/usr/bin/env python3
"""
check-deploy.py — run before every push.

Catches the three things that have actually broken a deploy on this repo:

  1. vercel.json schema violations. It is JSON, it has no comments, and Vercel
     validates it strictly — an inline "//" key failed the build with
     `headers[1] should NOT have additional property '//'`. Notes belong in
     README.md, not in the config.
  2. Firestore rules that will not parse (delegates to check-rules.py).
  3. JavaScript that will not parse, in the .js files AND inline in the HTML.

Usage:  python3 check-deploy.py
Exit 0 = safe to push.
"""
import json, os, re, subprocess, sys

ok = True
def fail(msg):
    global ok
    ok = False
    print('FAIL  ' + msg)
def good(msg):
    print('ok    ' + msg)

here = os.path.dirname(os.path.abspath(__file__))
def path(*p): return os.path.join(here, *p)

# ── 1 · vercel.json ────────────────────────────────────────────────────────
VERCEL_TOP = {'cleanUrls','headers','redirects','rewrites','trailingSlash','regions',
              'buildCommand','outputDirectory','framework','installCommand','devCommand',
              'github','functions','crons','images','public','ignoreCommand'}
RULE_KEYS  = {'source','headers','has','missing','destination','permanent','statusCode'}
try:
    v = json.load(open(path('vercel.json')))
    bad = [k for k in v if k not in VERCEL_TOP]
    if bad: fail('vercel.json unknown top-level keys: %s' % bad)
    for i, rule in enumerate(v.get('headers', [])):
        extra = [k for k in rule if k not in RULE_KEYS]
        if extra:
            fail('vercel.json headers[%d] has %s — Vercel rejects unknown properties. '
                 'JSON has no comments; move the note to README.md.' % (i, extra))
        for hdr in rule.get('headers', []):
            if set(hdr) != {'key','value'}:
                fail('vercel.json headers[%d] entry must be exactly key+value: %s' % (i, hdr))
    if ok: good('vercel.json schema')
except FileNotFoundError:
    fail('vercel.json missing — the HTML will be cached and deploys will land half-applied')
except json.JSONDecodeError as e:
    fail('vercel.json is not valid JSON: %s' % e)

# ── 2 · Firestore rules ────────────────────────────────────────────────────
r = subprocess.run([sys.executable, path('check-rules.py'), path('firestore.rules')],
                   capture_output=True, text=True)
if r.returncode == 0: good('firestore.rules')
else:
    fail('firestore.rules'); print(r.stdout.strip())

# ── 3 · JavaScript ─────────────────────────────────────────────────────────
for js in ['forms.js','config.js','access-data.js','partner-data.js',
           'portfolio-data.js','ingest-data.js','assign-panel.js']:
    p = path(js)
    if not os.path.exists(p): continue
    if subprocess.run(['node','--check',p], capture_output=True).returncode == 0:
        good(js)
    else:
        fail(js + ' does not parse')

for html in ['portfolio.html','index.html']:
    p = path(html)
    if not os.path.exists(p): continue
    blocks = re.findall(r'<script>(.*?)</script>', open(p).read(), re.S)
    tmp = path('.check-inline.js')
    open(tmp,'w').write('\n'.join(blocks))
    rc = subprocess.run(['node','--check',tmp], capture_output=True, text=True)
    os.remove(tmp)
    if rc.returncode == 0: good(html + ' (inline js)')
    else:
        fail(html + ' inline script does not parse'); print(rc.stderr.strip()[:400])

# ── 4 · Serverless handlers must actually RUN ──────────────────────────────
# `node --check` only parses. Both recent production failures were runtime-only:
# a const used before its declaration, and a handler that threw into a catch-all
# that hid the cause. Executing each handler once catches that class outright.
if os.path.exists(path('test-api.js')):
    r = subprocess.run(['node', path('test-api.js')], capture_output=True, text=True,
                       cwd=here)
    if r.returncode == 0:
        good('api handlers execute')
    else:
        fail('an api handler threw at runtime')
        print(r.stdout.strip())

print()
print('READY TO PUSH' if ok else 'DO NOT PUSH — fix the above')
sys.exit(0 if ok else 1)
