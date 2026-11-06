"""Generate the original artwork for Thunderous Applause.

Cards and decks: bold black emblems on white tiles. Events: the same emblems in charcoal on a
tinted ground. Advisors: illustrated portrait busts. Every emblem and portrait is an original
drawing; none copies an official insignia or photograph.

Usage: python3 tools/gen_art.py   (writes into out/html/img)
"""
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'html', 'img')
os.makedirs(OUT, exist_ok=True)
INK = '#151515'
PAPER = '#fbfaf6'
GOLD = '#e8c76a'


def write(name, content):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(content)


def pts(points):
    return ' '.join(f'{x:.1f},{y:.1f}' for x, y in points)


def star(cx, cy, ro, ri, n=5, rot=-90):
    p = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 180 / n)
        p.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return f'<polygon points="{pts(p)}"/>'


# ------------------------------------------------------------------ emblems
# Each emblem draws in a 200 x 200 box centred on (100, 100), in the current fill colour.

def e_rotunda():
    s = ''
    for ring, (r, n) in enumerate([(46, 7), (64, 10), (82, 13)]):
        for i in range(n):
            a = math.pi + math.pi * (i + 0.5) / n
            x, y = 100 + r * math.cos(a), 128 + r * math.sin(a) * 0.82
            s += f'<rect x="{x-6:.1f}" y="{y-4.5:.1f}" width="12" height="9" rx="2"/>'
    s += '<rect x="86" y="112" width="28" height="34" rx="3"/>'
    s += '<rect x="44" y="150" width="112" height="9" rx="2"/>'
    s += star(100, 92, 9, 4)
    return s


def e_senate_crest():
    s = '<path d="M40 112 Q100 40 160 112 Z"/>'
    s += '<rect x="34" y="112" width="132" height="10"/>'
    for i in range(6):
        s += f'<rect x="{44 + i*21}" y="128" width="11" height="34"/>'
    s += '<rect x="30" y="166" width="140" height="10"/>'
    s += f'<g fill="{PAPER}">' + star(100, 90, 12, 5) + '</g>'
    return s


def e_caucus():
    s = '<rect x="90" y="68" width="20" height="64"/><rect x="80" y="60" width="40" height="10"/><rect x="78" y="132" width="44" height="10"/>'
    for i in range(8):
        a = math.radians(-90 + i * 45)
        s += star(100 + 66 * math.cos(a), 100 + 66 * math.sin(a), 11, 4.5)
    return s


def e_temple():
    s = '<polygon points="34,170 52,104 148,104 166,170"/>'
    for x, h in [(60, 70), (80, 84), (100, 112), (120, 84), (140, 70)]:
        s += f'<polygon points="{x-7},{104} {x},{104-h} {x+7},{104}"/>'
    s += f'<rect x="92" y="138" width="16" height="32" fill="{PAPER}"/>'
    return s


def e_eclipse():
    s = '<circle cx="100" cy="100" r="58"/>'
    for i in range(16):
        a = math.radians(i * 22.5)
        s += f'<polygon points="{pts([(100 + 64*math.cos(a-0.06), 100 + 64*math.sin(a-0.06)), (100 + 86*math.cos(a), 100 + 86*math.sin(a)), (100 + 64*math.cos(a+0.06), 100 + 64*math.sin(a+0.06))])}"/>'
    s += f'<circle cx="114" cy="90" r="48" fill="{PAPER}"/>'
    return s


def e_streaks():
    s = ''
    for i, (x, y, k) in enumerate([(60, 70, 1), (118, 92, 0.85), (78, 132, 0.75)]):
        s += f'<polygon points="{pts([(x, y), (x + 46*k, y + 14*k), (x, y + 28*k), (x + 12*k, y + 14*k)])}"/>'
        s += f'<rect x="{x - 40*k:.0f}" y="{y + 12*k:.0f}" width="{36*k:.0f}" height="{4*k+1:.0f}" rx="2"/>'
    return s


def e_ring_ship():
    s = '<circle cx="100" cy="100" r="74"/>'
    s += f'<circle cx="100" cy="100" r="50" fill="{PAPER}"/>'
    s += '<circle cx="100" cy="100" r="26"/>'
    s += f'<rect x="138" y="88" width="40" height="24" fill="{PAPER}"/>'
    return s


def e_spire():
    s = '<polygon points="100,22 116,150 84,150"/>'
    s += '<rect x="64" y="150" width="72" height="16"/><rect x="50" y="166" width="100" height="12"/>'
    s += '<polygon points="72,150 80,96 88,150"/><polygon points="112,150 120,96 128,150"/>'
    return s


def e_planet(moons=1):
    s = '<circle cx="100" cy="104" r="50"/>'
    s += '<ellipse cx="100" cy="104" rx="88" ry="20" fill="none" stroke="currentColor" stroke-width="9"/>'
    s += f'<path d="M50 104 A50 50 0 0 0 150 104 Z" fill="currentColor"/>'
    if moons:
        s += '<circle cx="160" cy="44" r="12"/>'
    if moons > 1:
        s += '<circle cx="40" cy="40" r="8"/>'
    return s


def e_twin_suns():
    s = '<circle cx="74" cy="66" r="22"/><circle cx="126" cy="80" r="15"/>'
    s += '<path d="M20 170 Q60 120 100 150 Q140 176 180 140 L180 180 L20 180 Z"/>'
    return s


def e_palace():
    s = '<path d="M60 120 A40 40 0 0 1 140 120 Z"/><rect x="56" y="120" width="88" height="40"/>'
    s += '<path d="M24 136 A20 20 0 0 1 64 136 Z"/><rect x="24" y="136" width="40" height="24"/>'
    s += '<path d="M136 136 A20 20 0 0 1 176 136 Z"/><rect x="136" y="136" width="40" height="24"/>'
    s += f'<rect x="92" y="132" width="16" height="28" fill="{PAPER}"/>'
    s += '<rect x="20" y="160" width="160" height="10"/>'
    return s


def e_hexwheel():
    s = ''
    for i in range(6):
        a = math.radians(i * 60)
        x, y = 100 + 56 * math.cos(a), 100 + 56 * math.sin(a)
        hexp = [(x + 20 * math.cos(math.radians(30 + j * 60)), y + 20 * math.sin(math.radians(30 + j * 60))) for j in range(6)]
        s += f'<polygon points="{pts(hexp)}"/>'
    s += '<circle cx="100" cy="100" r="26"/>'
    return s


def e_figures(n=5):
    s = ''
    for i in range(n):
        x = 100 + (i - (n - 1) / 2) * 30
        y = 150 if i % 2 == 0 else 138
        s += f'<circle cx="{x:.0f}" cy="{y-58}" r="11"/><path d="M{x-14:.0f} {y} L{x-14:.0f} {y-30} Q{x:.0f} {y-46} {x+14:.0f} {y-30} L{x+14:.0f} {y} Z"/>'
    s += '<rect x="20" y="152" width="160" height="10"/>'
    return s


def e_people():
    s = ''
    for x, y, k in [(60, 132, 0.85), (140, 132, 0.85), (100, 122, 1.05)]:
        s += f'<circle cx="{x}" cy="{y-46*k:.0f}" r="{20*k:.0f}"/>'
        s += f'<path d="M{x-34*k:.0f} {y+44*k:.0f} Q{x-34*k:.0f} {y-14*k:.0f} {x:.0f} {y-16*k:.0f} Q{x+34*k:.0f} {y-14*k:.0f} {x+34*k:.0f} {y+44*k:.0f} Z"/>'
    return s


def e_banner():
    s = '<rect x="58" y="30" width="9" height="148"/>'
    s += '<path d="M67 36 L160 36 L140 66 L160 96 L67 96 Z"/>'
    s += f'<g fill="{PAPER}">' + star(104, 66, 16, 7) + '</g>'
    return s


def e_laurel():
    s = ''
    for side in (-1, 1):
        for i in range(7):
            a = math.radians(110 + i * 22) if side < 0 else math.radians(70 - i * 22)
            x, y = 100 + 66 * math.cos(a), 112 + 66 * math.sin(a) * -1 + 0
            rot = math.degrees(a) + (90 if side < 0 else -90)
            s += f'<ellipse cx="{x:.1f}" cy="{200 - y:.1f}" rx="7" ry="17" transform="rotate({-rot:.0f} {x:.1f} {200 - y:.1f})"/>'
    s += '<circle cx="100" cy="94" r="30"/>'
    s += f'<g fill="{PAPER}">' + star(100, 94, 16, 7) + '</g>'
    return s


def e_waves():
    s = '<rect x="84" y="142" width="32" height="30" rx="3"/><rect x="66" y="170" width="68" height="10" rx="3"/>'
    s += '<circle cx="100" cy="128" r="12"/>'
    for i, r in enumerate([34, 56, 78]):
        s += f'<path d="M{100 - r*0.7:.0f} {128 - r*0.7:.0f} A{r} {r} 0 0 1 {100 + r*0.7:.0f} {128 - r*0.7:.0f}" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>'
    return s


def e_scales():
    s = '<rect x="95" y="38" width="10" height="122"/><rect x="62" y="160" width="76" height="12" rx="3"/>'
    s += '<rect x="34" y="52" width="132" height="8" rx="3"/>' + star(100, 36, 11, 5)
    for x in (48, 152):
        s += f'<path d="M{x} 60 L{x-24} 116 L{x+24} 116 Z" fill="none" stroke="currentColor" stroke-width="4"/>'
        s += f'<path d="M{x-28} 116 A28 18 0 0 0 {x+28} 116 Z"/>'
    return s


def e_hourglass():
    s = '<rect x="50" y="30" width="100" height="14" rx="3"/><rect x="50" y="156" width="100" height="14" rx="3"/>'
    s += '<path d="M62 44 L138 44 L108 100 L138 156 L62 156 L92 100 Z"/>'
    s += f'<path d="M76 56 L124 56 L104 92 L96 92 Z" fill="{PAPER}"/><path d="M80 146 L100 118 L120 146 Z" fill="{PAPER}" opacity="0"/>'
    return s


def e_credits():
    s = ''
    for i, (x, y) in enumerate([(70, 130), (100, 116), (130, 130)]):
        s += f'<ellipse cx="{x}" cy="{y+22}" rx="34" ry="12"/><rect x="{x-34}" y="{y}" width="68" height="22"/>'
        s += f'<ellipse cx="{x}" cy="{y}" rx="34" ry="12" fill="{PAPER}" stroke="currentColor" stroke-width="5"/>'
    s += '<path d="M100 30 L128 50 L128 82 L100 102 L72 82 L72 50 Z"/>'
    s += f'<rect x="92" y="48" width="16" height="36" rx="3" fill="{PAPER}"/>'
    return s


def e_handshake():
    s = '<circle cx="78" cy="100" r="48" fill="none" stroke="currentColor" stroke-width="16"/>'
    s += '<circle cx="122" cy="100" r="48" fill="none" stroke="currentColor" stroke-width="16"/>'
    return s


def e_target():
    s = '<circle cx="100" cy="100" r="72" fill="none" stroke="currentColor" stroke-width="12"/>'
    s += '<circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" stroke-width="12"/><circle cx="100" cy="100" r="12"/>'
    for x, y, w, h in [(94, 14, 12, 40), (94, 146, 12, 40), (14, 94, 40, 12), (146, 94, 40, 12)]:
        s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>'
    return s


def e_shield(stars=4):
    s = '<path d="M100 22 L164 44 Q164 136 100 180 Q36 136 36 44 Z"/>'
    if stars:
        s += f'<g fill="{PAPER}">' + ''.join(star(100 + dx, 92 + dy, 12, 5) for dx, dy in [(-26, -18), (26, -18), (-26, 22), (26, 22)][:stars]) + '</g>'
    else:
        s += f'<path d="M64 74 L100 104 L136 74 L136 96 L100 126 L64 96 Z" fill="{PAPER}"/>'
    return s


def e_split():
    s = '<path d="M96 24 A76 76 0 0 0 96 176 L84 132 L104 104 L82 74 Z"/>'
    s += '<path d="M112 24 A76 76 0 0 1 112 176 L124 140 L102 108 L122 76 Z"/>'
    return s


def e_arrows():
    s = ''
    for rot in (0, 180):
        s += f'<g transform="rotate({rot} 100 100)"><path d="M100 30 A70 70 0 0 1 170 100 L150 100 A50 50 0 0 0 100 50 Z"/>'
        s += '<polygon points="140,92 180,92 160,124"/></g>'
    return s


def e_podium():
    s = '<path d="M60 96 L140 96 L128 176 L72 176 Z"/><rect x="48" y="84" width="104" height="14" rx="3"/>'
    s += f'<g fill="{PAPER}">' + star(100, 132, 18, 8) + '</g>'
    s += '<rect x="96" y="42" width="8" height="42"/><circle cx="100" cy="38" r="9"/>'
    return s


def e_broken_chain():
    s = e_spire()
    s += f'<g fill="none" stroke="{PAPER}" stroke-width="8">' \
         '<path d="M40 120 L84 72"/></g>'
    s += '<g fill="none" stroke="currentColor" stroke-width="9"><rect x="18" y="104" width="30" height="16" rx="8" transform="rotate(-40 33 112)"/>' \
         '<rect x="152" y="104" width="30" height="16" rx="8" transform="rotate(40 167 112)"/></g>'
    return s


def e_sunset():
    s = '<path d="M30 130 A70 70 0 0 1 170 130 Z"/>'
    for i, y in enumerate([142, 156, 170]):
        s += f'<rect x="{30 + i*14}" y="{y}" width="{140 - i*28}" height="7" rx="3"/>'
    for i in range(7):
        a = math.radians(180 + 15 + i * 25)
        s += f'<rect x="96" y="20" width="8" height="26" transform="rotate({math.degrees(a)+90:.0f} 100 130)"/>'
    return s


EMBLEMS = {
    'rotunda': e_rotunda, 'crest': e_senate_crest, 'caucus': e_caucus, 'temple': e_temple, 'eclipse': e_eclipse,
    'streaks': e_streaks, 'ring': e_ring_ship, 'spire': e_spire, 'planet': lambda: e_planet(1), 'twin_suns': e_twin_suns,
    'palace': e_palace, 'hexwheel': e_hexwheel, 'figures': e_figures, 'people': e_people, 'banner': e_banner,
    'laurel': e_laurel, 'waves': e_waves, 'scales': e_scales, 'hourglass': e_hourglass, 'credits': e_credits,
    'rings': e_handshake, 'target': e_target, 'shield': lambda: e_shield(4), 'chevron': lambda: e_shield(0),
    'split': e_split, 'arrows': e_arrows, 'podium': e_podium, 'chain': e_broken_chain, 'sunset': e_sunset,
}


def tile(w, h, emblem, ink=INK, ground=PAPER, accent=None, scale=None):
    """A card tile: the emblem centred on a paper ground, with an optional coloured band."""
    k = scale or min(w, h) * 0.98 / 200
    ex, ey = w / 2 - 100 * k, h / 2 - 100 * k - (6 if accent else 0)
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
         f'<rect width="{w}" height="{h}" fill="{ground}"/>')
    if accent:
        s += f'<rect y="{h-14}" width="{w}" height="14" fill="{accent}"/>'
    s += (f'<g transform="translate({ex:.1f} {ey:.1f}) scale({k:.3f})" fill="{ink}" color="{ink}" '
          f'style="--paper:{ground}">{EMBLEMS[emblem]().replace(PAPER, ground)}</g>')
    s += f'<rect x="1.5" y="1.5" width="{w-3}" height="{h-3}" fill="none" stroke="#c9c6bc" stroke-width="3"/>'
    return s + '</svg>'


# cards (240 x 300)
CARDS = {
    'card_routine': 'hourglass', 'card_credits': 'credits', 'card_campaign': 'banner', 'card_holonet': 'waves',
    'card_relations': 'rings', 'card_platform': 'podium', 'card_enemy': 'target', 'card_confront': 'chain',
    'card_pact': 'shield', 'card_shadow': 'eclipse', 'card_jedi': 'temple', 'card_rim': 'twin_suns',
    'card_peace': 'laurel', 'card_disunity': 'split', 'card_civil': 'people', 'card_law': 'scales',
    'card_forces': 'chevron', 'card_clones': 'figures', 'card_senate': 'rotunda', 'card_shuffle': 'arrows',
}
for name, em in CARDS.items():
    write(name + '.svg', tile(240, 300, em))

# decks: the same style with a coloured band at the foot
DECKS = {'deck_caucus': ('caucus', '#3b82c4'), 'deck_senate': ('crest', '#b8902e'), 'deck_last_days': ('sunset', '#a31d1d')}
for name, (em, accent) in DECKS.items():
    write(name + '.svg', tile(240, 300, em, accent=accent))

# events (300 x 360): charcoal emblem on a tinted ground
EVENTS = {
    'ev_senate': ('rotunda', '#e3e8f0'), 'ev_jedi': ('temple', '#e6eaee'), 'ev_shadow': ('eclipse', '#efdcdc'),
    'ev_war': ('streaks', '#e2e6ec'), 'ev_trade': ('ring', '#efe6d2'), 'ev_chancellery': ('spire', '#f0dada'),
    'ev_naboo': ('palace', '#dfece2'), 'ev_separatist': ('hexwheel', '#e7e0ef'), 'ev_rim': ('twin_suns', '#f2e2d2'),
    'ev_clones': ('figures', '#e6e8eb'), 'ev_peace': ('laurel', '#dcecea'), 'ev_holonet': ('waves', '#dfe7f2'),
    'ev_law': ('scales', '#efe9d6'),
}
for name, (em, ground) in EVENTS.items():
    write(name + '.svg', tile(300, 360, em, ink='#22252b', ground=ground))


# ------------------------------------------------------------------ advisor portraits
def portrait(p):
    """An illustrated bust. p: dict of skin, hair, hair_style, beard, robe, trim, ground and species extras."""
    w, h = 240, 300
    skin, shade = p['skin'], p.get('shade', '#00000022')
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
         '<defs>'
         f'<radialGradient id="bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="{p["ground"][0]}"/><stop offset="1" stop-color="{p["ground"][1]}"/></radialGradient>'
         f'<linearGradient id="robe" x1="0" x2="1"><stop offset="0" stop-color="{p["robe"][0]}"/><stop offset="0.55" stop-color="{p["robe"][1]}"/><stop offset="1" stop-color="{p["robe"][0]}"/></linearGradient>'
         f'<radialGradient id="face" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="{p.get("skin_hi", skin)}"/><stop offset="1" stop-color="{skin}"/></radialGradient>'
         '</defs>'
         f'<rect width="{w}" height="{h}" fill="url(#bg)"/>')
    # shoulders and robe
    s += '<path d="M14 300 Q20 214 84 200 L156 200 Q220 214 226 300 Z" fill="url(#robe)"/>'
    if p.get('collar') == 'high':
        s += f'<path d="M86 196 Q120 236 154 196 L160 214 Q120 252 80 214 Z" fill="{p["trim"]}"/>'
    elif p.get('collar') == 'v':
        s += f'<path d="M90 200 L120 250 L150 200 L140 200 L120 234 L100 200 Z" fill="{p["trim"]}"/>'
    elif p.get('collar') == 'mantle':
        s += f'<path d="M30 250 Q120 200 210 250 L214 270 Q120 222 26 270 Z" fill="{p["trim"]}"/>'
    elif p.get('collar') == 'military':
        s += f'<rect x="96" y="196" width="48" height="18" rx="3" fill="{p["trim"]}"/>'
        s += f'<rect x="56" y="232" width="26" height="8" rx="2" fill="{p["trim"]}"/><rect x="56" y="244" width="26" height="8" rx="2" fill="{p["trim"]}"/>'
    # neck
    s += f'<path d="M102 160 L102 204 Q120 214 138 204 L138 160 Z" fill="{skin}"/>'
    s += f'<path d="M102 166 Q120 186 138 166 L138 180 Q120 194 102 180 Z" fill="{shade}"/>'
    species = p.get('species', 'human')
    if species == 'rodian':
        s += f'<path d="M78 86 Q78 34 120 32 Q162 34 162 86 Q164 130 140 156 Q128 172 120 172 Q112 172 100 156 Q76 130 78 86 Z" fill="url(#face)"/>'
        s += f'<path d="M104 32 Q120 14 136 32" fill="none" stroke="{skin}" stroke-width="8"/>'
        for x in (98, 142):
            s += f'<ellipse cx="{x}" cy="94" rx="17" ry="22" fill="#101418" transform="rotate({-12 if x < 120 else 12} {x} 94)"/>'
            s += f'<ellipse cx="{x-4}" cy="86" rx="5" ry="6" fill="#ffffff" opacity="0.45"/>'
        s += f'<path d="M110 132 Q120 162 130 132 Q130 150 120 160 Q110 150 110 132 Z" fill="{shade}"/>'
        s += '<circle cx="114" cy="140" r="2.4" fill="#16341a"/><circle cx="126" cy="140" r="2.4" fill="#16341a"/>'
        for i, y in enumerate([60, 72, 84]):
            s += f'<path d="M84 {y+20} Q78 {y+26} 80 {y+34}" fill="none" stroke="{shade}" stroke-width="3"/>'
        return s + frame_svg(w, h)
    # head
    s += f'<ellipse cx="120" cy="116" rx="44" ry="56" fill="url(#face)"/>'
    s += f'<ellipse cx="76" cy="122" rx="7" ry="13" fill="{skin}"/><ellipse cx="164" cy="122" rx="7" ry="13" fill="{skin}"/>'
    # features
    s += f'<path d="M92 104 Q103 98 113 104" fill="none" stroke="{p.get("brow", "#3a2a20")}" stroke-width="4" stroke-linecap="round"/>'
    s += f'<path d="M127 104 Q137 98 148 104" fill="none" stroke="{p.get("brow", "#3a2a20")}" stroke-width="4" stroke-linecap="round"/>'
    s += f'<ellipse cx="103" cy="116" rx="6" ry="4" fill="#fff"/><circle cx="103" cy="116" r="3.2" fill="{p.get("eyes", "#3b2c22")}"/>'
    s += f'<ellipse cx="137" cy="116" rx="6" ry="4" fill="#fff"/><circle cx="137" cy="116" r="3.2" fill="{p.get("eyes", "#3b2c22")}"/>'
    s += f'<path d="M120 118 L113 142 Q120 146 127 142" fill="none" stroke="{shade}" stroke-width="3" stroke-linecap="round"/>'
    s += f'<path d="M106 156 Q120 {162 if p.get("smile") else 158} 134 156" fill="none" stroke="#7a3f36" stroke-width="3.2" stroke-linecap="round"/>'
    if p.get('marks'):   # Pantoran facial markings
        m = p['marks']
        s += f'<rect x="88" y="128" width="16" height="5" rx="2" fill="{m}"/><rect x="136" y="128" width="16" height="5" rx="2" fill="{m}"/>'
        s += f'<rect x="117" y="163" width="6" height="6" rx="2" fill="{m}"/>'
    if p.get('age'):
        s += f'<path d="M92 126 Q100 132 110 128 M130 128 Q140 132 148 126" fill="none" stroke="{shade}" stroke-width="2"/>'
        s += f'<path d="M100 146 Q96 156 102 166 M140 146 Q144 156 138 166" fill="none" stroke="{shade}" stroke-width="2"/>'
    # beard and moustache
    hair = p.get('hair', '#2a1d14')
    if p.get('beard') == 'full':
        s += f'<path d="M78 128 Q80 186 120 190 Q160 186 162 128 Q156 160 140 160 Q120 150 100 160 Q84 160 78 128 Z" fill="{hair}"/>'
        s += f'<path d="M104 152 Q120 146 136 152 Q120 158 104 152 Z" fill="{hair}"/>'
    elif p.get('beard') == 'short':
        s += f'<path d="M84 136 Q88 182 120 184 Q152 182 156 136 Q150 166 134 166 Q120 162 106 166 Q90 166 84 136 Z" fill="{hair}" opacity="0.9"/>'
        s += f'<path d="M104 151 Q120 145 136 151 Q120 156 104 151 Z" fill="{hair}"/>'
    elif p.get('beard') == 'moustache':
        s += f'<path d="M102 150 Q120 140 138 150 Q132 156 120 152 Q108 156 102 150 Z" fill="{hair}"/>'
    # hair
    style = p.get('hair_style', 'short')
    if style == 'short':
        s += f'<path d="M74 112 Q72 54 120 52 Q168 54 166 112 Q160 82 140 76 Q120 70 100 76 Q80 82 74 112 Z" fill="{hair}"/>'
    elif style == 'receding':
        s += f'<path d="M74 118 Q72 70 96 62 Q86 82 84 108 Z M166 118 Q168 70 144 62 Q154 82 156 108 Z" fill="{hair}"/>'
        s += f'<path d="M78 112 Q84 150 82 176 L74 176 Q70 140 74 112 Z M162 112 Q156 150 158 176 L166 176 Q170 140 166 112 Z" fill="{hair}"/>'
    elif style == 'swept':
        s += f'<path d="M72 120 Q66 50 120 48 Q174 50 168 120 Q164 84 150 74 Q128 64 104 70 Q82 80 72 120 Z" fill="{hair}"/>'
        s += f'<path d="M72 120 Q70 160 80 190 L70 190 Q60 150 72 120 Z M168 120 Q170 160 160 190 L170 190 Q180 150 168 120 Z" fill="{hair}"/>'
    elif style == 'bob':
        s += f'<path d="M70 150 Q60 54 120 50 Q180 54 170 150 L156 150 Q158 96 140 84 Q118 74 96 84 Q80 96 84 150 Z" fill="{hair}"/>'
    elif style == 'updo':
        s += f'<path d="M72 118 Q70 56 120 52 Q170 56 168 118 Q162 84 120 80 Q78 84 72 118 Z" fill="{hair}"/>'
        s += f'<ellipse cx="120" cy="46" rx="40" ry="26" fill="{hair}"/>'
        s += f'<path d="M80 40 Q120 4 160 40 Q120 24 80 40 Z" fill="{p["trim"]}"/>'
        s += f'<circle cx="120" cy="22" r="7" fill="{p["trim"]}"/>'
    elif style == 'hood':
        s += f'<path d="M60 200 Q50 60 120 40 Q190 60 180 200 L160 200 Q168 96 120 86 Q72 96 80 200 Z" fill="{hair}"/>'
        s += f'<path d="M86 100 Q120 70 154 100 Q120 90 86 100 Z" fill="{p["trim"]}"/>'
    return s + frame_svg(w, h)


def frame_svg(w, h):
    return f'<rect x="1.5" y="1.5" width="{w-3}" height="{h-3}" fill="none" stroke="#c9c6bc" stroke-width="3"/></svg>'


ADVISORS = {
    'antilles': dict(skin='#c99a74', skin_hi='#dcb08a', hair='#d8d4cc', hair_style='short', robe=('#2d4f7c', '#3f6aa0'), trim='#c9d6e8',
                     collar='high', ground=('#e9eef5', '#c7d3e3'), age=True, brow='#9a958c'),
    'organa': dict(skin='#b9875f', skin_hi='#cfa078', hair='#1e1612', hair_style='short', beard='short', robe=('#2a2530', '#3d3546'),
                   trim='#8c7a5a', collar='mantle', ground=('#eceae4', '#cfcabd')),
    'bel_iblis': dict(skin='#e2b89a', skin_hi='#eccab0', hair='#bdb8b0', hair_style='short', beard='moustache', robe=('#4a4f46', '#646a5e'),
                      trim='#c9b77a', collar='military', ground=('#ecebe6', '#cfccc2'), age=True, brow='#8f8a82'),
    'farr': dict(species='rodian', skin='#5e9a52', skin_hi='#7fbf6c', robe=('#6b4a2a', '#8a6236'), trim='#d9a441', collar='v',
                 ground=('#eef2e6', '#cfdcc2'), shade='#00000030'),
    'mothma': dict(skin='#f0d2c0', skin_hi='#f8e2d4', hair='#a8502e', hair_style='bob', robe=('#e9e6df', '#ffffff'), trim='#c9c4b8',
                   collar='high', ground=('#f1ece6', '#d9cfc4'), eyes='#4a6a5a', brow='#8a4a30'),
    'amidala': dict(skin='#ecc7ad', skin_hi='#f6d9c4', hair='#3a2418', hair_style='updo', robe=('#5a1e2c', '#7c2a3c'), trim='#d8b25a',
                    collar='v', ground=('#f2e9e6', '#dcc9c6'), eyes='#4a3020', smile=True),
    'valorum': dict(skin='#e8c3a8', skin_hi='#f2d5c0', hair='#cfcac2', hair_style='swept', robe=('#1f2c4a', '#2f4170'), trim='#c9a54a',
                    collar='mantle', ground=('#ecebf2', '#cdd0de'), age=True, brow='#a8a39a'),
    'chuchi': dict(skin='#7fa6d8', skin_hi='#a0c0e8', hair='#2a2a3a', hair_style='hood', robe=('#d8d4e8', '#f0eef8'), trim='#e0b84a',
                   collar='high', ground=('#eef0f6', '#d2d6e6'), marks='#e8c23a', eyes='#e8c23a', brow='#2a2a3a', shade='#00000026'),
}
for k, p in ADVISORS.items():
    write(f'adv_{k}.svg', portrait(p))


# ------------------------------------------------------------------ backgrounds kept for the dark theme and old saves
rng = random.Random(42)
stars_svg = ''.join(f'<circle cx="{rng.uniform(0,1600):.1f}" cy="{rng.uniform(0,1000):.1f}" r="{rng.uniform(0.3,1.6):.2f}" fill="#fff" opacity="{rng.uniform(0.25,0.9):.2f}"/>' for _ in range(650))
write('bg_stars.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice">'
      '<defs><radialGradient id="neb" cx="70%" cy="30%" r="60%"><stop offset="0" stop-color="#1b2a4a" stop-opacity="0.9"/>'
      '<stop offset="1" stop-color="#03040a" stop-opacity="0"/></radialGradient></defs>'
      '<rect width="1600" height="1000" fill="#03040a"/><rect width="1600" height="1000" fill="url(#neb)"/>' + stars_svg + '</svg>')

print('wrote', len(os.listdir(OUT)), 'files')
