#!/usr/bin/env python3
"""
check-rules.py — run this before every Firestore rules deploy.

WHAT IT CATCHES, AND WHY IT EXISTS
──────────────────────────────────
The Firestore rules lexer does NOT nest block comments. The first `*/` after a
`/*` ends the comment, wherever it appears. So a comment containing a literal
`*/` — for example writing a glob like  portal*/p*  in prose — closes the
comment early, and every subsequent line of prose is parsed as code.

That failure is nasty out of proportion to its cause:

  · the reported error is at the FIRST prose token after the early close,
    which may be dozens of lines from the real mistake
  · it is then followed by hundreds of "token recognition error at: '—'"
    lines, one per em-dash in the rest of the file, which buries the one
    message that matters
  · a heavily commented rules file (this one) has thousands of characters
    of prose waiting to be misparsed

Since the whole point of this rules file is that it explains itself, the
comments are not optional and this check is the price of keeping them.

Usage:  python3 check-rules.py firestore.rules
Exit 0 = safe to paste into the console. Exit 1 = it will be rejected.
"""

import sys
import re


def strip_comments(src):
    """Strip comments exactly the way the rules lexer does: block comments do
    NOT nest, and // runs to end of line. Returns (code, findings) where code
    keeps line numbering intact so offsets still mean something."""
    out = []
    findings = []
    i, n = 0, len(src)
    line = 1
    in_block = False
    block_start_line = 0

    while i < n:
        two = src[i:i + 2]

        if in_block:
            if two == '*/':
                in_block = False
                out.append('  ')
                i += 2
                continue
            if src[i] == '\n':
                out.append('\n')
                line += 1
            else:
                out.append(' ')
            i += 1
            continue

        if two == '/*':
            in_block = True
            block_start_line = line
            out.append('  ')
            i += 2
            continue

        if two == '//':
            while i < n and src[i] != '\n':
                out.append(' ')
                i += 1
            continue

        if src[i] == '\n':
            line += 1
        out.append(src[i])
        i += 1

    if in_block:
        findings.append(
            (block_start_line, 'block comment opened here is never closed'))
    return ''.join(out), findings


# Characters that only ever appear in prose. If one of these survives comment
# stripping, a comment closed early and prose is being parsed as code.
PROSE = {
    '\u2014': 'em dash',
    '\u2013': 'en dash',
    '\u2190': 'left arrow',
    '\u2192': 'right arrow',
    '\u26a0': 'warning sign',
    '\u2705': 'check mark',
    '\u2500': 'box drawing',
    '\u2550': 'box drawing (double)',
    '\u2018': 'curly quote',
    '\u2019': 'curly quote',
    '\u201c': 'curly quote',
    '\u201d': 'curly quote',
    '\u00b7': 'middle dot',
}


def main(path):
    src = open(path, encoding='utf-8').read()
    code, findings = strip_comments(src)
    problems = list(findings)

    # 1 · prose leaking into code
    for lineno, text in enumerate(code.split('\n'), start=1):
        for ch, name in PROSE.items():
            if ch in text:
                problems.append((
                    lineno,
                    'a %s survived comment stripping, so a comment above this '
                    'closed early. Look back for a literal */ inside prose.' % name))
                break

    # 2 · the specific cause, reported directly rather than by symptom
    in_block, i, line = False, 0, 1
    while i < len(src) - 1:
        two = src[i:i + 2]
        if src[i] == '\n':
            line += 1
        if not in_block and two == '/*':
            in_block = True
            i += 2
            continue
        if in_block and two == '*/':
            # a legitimate close is preceded by whitespace or is on its own
            before = src[max(0, i - 1):i]
            if before and not before.isspace():
                problems.append((
                    line,
                    'literal */ inside a comment, directly after %r. This closes '
                    'the comment early. Rewrite the glob in words.' % before))
            in_block = False
            i += 2
            continue
        i += 1

    # 3 · structural balance on the stripped code
    if code.count('{') != code.count('}'):
        problems.append((0, 'braces unbalanced: %d { vs %d }'
                         % (code.count('{'), code.count('}'))))
    if code.count('(') != code.count(')'):
        problems.append((0, 'parens unbalanced'))

    # 4 · duplicate top-level helpers — the collision class that silently
    #     rewrites another portal's access model rather than erroring
    tops = re.findall(r'^    function (\w+)\(', code, flags=re.M)
    for name in sorted(set(tops)):
        if tops.count(name) > 1:
            problems.append((0, 'top-level function %s() defined %d times'
                             % (name, tops.count(name))))

    if not problems:
        matches = re.findall(r'match (\S+)', code)
        print('OK  %s' % path)
        print('    %d match blocks, %d top-level functions, braces balanced.'
              % (len(matches), len(tops)))
        return 0

    print('FAIL  %s' % path)
    for lineno, msg in sorted(problems):
        where = ('line %d' % lineno) if lineno else 'file'
        print('  %-10s %s' % (where, msg))
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'firestore.rules'))
