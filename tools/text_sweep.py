"""Find text that assumes Palpatine holds the Chancellery when he may not.

Usage: python3 tools/text_sweep.py <repo>

A phrase is reported when it appears outside a guard: neither the scene's view-if nor an
enclosing [? if ... ?] condition mentions who holds office (pal_chancellor, chancellor_bloc,
rc_chancellor, ...). Use [+ pal_title +], [+ pal_office +] or [+ pal_people +] for phrases that
should follow whether he is in office. Act I scenes (Valorum's term) are skipped.
Exit status is 1 when anything is found.
"""
import os
import re
import sys

PHRASES = re.compile(
    r"Chancellor Palpatine|Chancellor's Bloc|"
    r"the Chancellor's (allies|people|company|circle|kindness|bloc|spokesman|protégé)|"
    r"Chancellery's (orbit|propaganda|people)|Chancellery guards|"
    r"(confides in|goes to|trust in|fond of) the Chancellor\b"
)
GUARD = re.compile(r'pal_chancellor|puppet_chancellor|chancellor_bloc|rc_chancellor|finale|pal_was_chancellor')
SKIP = ('library', 'credits', 'ending_slides', 'root')


def strip_guarded(text):
    """Drop conditional text whose condition names who holds office; keep other conditional text."""
    prev = None
    while prev != text:
        prev = text
        text = re.sub(r'\[\?\s*if\s*([^:\[\]]*?):([^\[\]]*?)\?\]',
                      lambda m: '' if GUARD.search(m.group(1)) else m.group(2), text)
    return text


def main(repo):
    root = os.path.join(repo, 'source', 'scenes')
    hits = 0
    for dp, _, files in os.walk(root):
        for f in sorted(files):
            if not f.endswith('.scene.dry') or f.split('.')[0] in SKIP or f.startswith('a1_'):
                continue
            raw = open(os.path.join(dp, f), encoding='utf8').read()
            parts = re.split(r'\n(?=@[a-z0-9_]+\n)', raw)
            top_vif = (re.search(r'^view-if:(.*)$', parts[0], re.M) or [None, ''])[1]
            for part in parts:
                sec = part.split('\n', 1)[0] if part.startswith('@') else '(top)'
                vif = (re.search(r'^view-if:(.*)$', part, re.M) or [None, ''])[1]
                if GUARD.search(top_vif + ' ' + vif):
                    continue
                lines = [l for l in part.split('\n') if not re.match(r'^[a-z-]+:', l) and not l.startswith('@') and not l.startswith('#')]
                prose = strip_guarded('\n'.join(lines))
                for m in PHRASES.finditer(prose):
                    s = max(0, m.start() - 60)
                    print('%s %s: ...%s...' % (f.replace('.scene.dry', ''), sec, prose[s:m.end() + 40].replace('\n', ' ')))
                    hits += 1
    print('unguarded Palpatine-in-office phrases:', hits)
    return 1 if hits else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '.'))
