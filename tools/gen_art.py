"""Generate the original abstract SVG artwork for Thunderous Applause."""
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'html', 'img')
os.makedirs(OUT, exist_ok=True)
GOLD = '#e8c76a'


def stars(rng, w, h, n, rmax=1.4, opacity=0.8):
    out = []
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.uniform(0.3, rmax)
        o = rng.uniform(0.25, opacity)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="#fff" opacity="{o:.2f}"/>')
    return ''.join(out)


def frame(w, h, accent, title=None):
    s = f'<rect x="6" y="6" width="{w-12}" height="{h-12}" rx="10" fill="none" stroke="{accent}" stroke-width="2" opacity="0.8"/>'
    s += f'<rect x="12" y="12" width="{w-24}" height="{h-24}" rx="7" fill="none" stroke="{accent}" stroke-width="0.6" opacity="0.5"/>'
    if title:
        s += (f'<text x="{w/2}" y="{h-22}" text-anchor="middle" font-family="Georgia, serif" font-size="{w/12:.0f}" '
              f'letter-spacing="2" fill="{accent}">{title}</text>')
    return s


def base(w, h, c1, c2, seed, nstars=60):
    rng = random.Random(seed)
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
         f'<defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="{c1}"/>'
         f'<stop offset="1" stop-color="{c2}"/></radialGradient>'
         f'<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/>'
         f'<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
         f'<rect width="{w}" height="{h}" fill="url(#g)"/>')
    s += stars(rng, w, h, nstars)
    return s, rng


# ---------------------------------------------------------------- motifs
def m_rotunda(w, h, color, rng):
    cx, cy = w / 2, h * 0.62
    s = ''
    for ring in range(5):
        r = 30 + ring * 20
        n = 8 + ring * 5
        for i in range(n):
            a = math.pi + math.pi * (i + 0.5) / n
            x, y = cx + r * math.cos(a), cy + r * math.sin(a) * 0.75
            s += f'<rect x="{x-4:.1f}" y="{y-3:.1f}" width="8" height="6" rx="1.5" fill="{color}" opacity="{0.45 + ring*0.1:.2f}"/>'
    s += f'<rect x="{cx-14}" y="{cy-6}" width="28" height="26" rx="3" fill="{GOLD}" opacity="0.85"/>'
    return s


def m_spires(w, h, color, rng):
    cx, by = w / 2, h * 0.78
    s = f'<rect x="{cx-70}" y="{by-30}" width="140" height="30" fill="{color}" opacity="0.6"/>'
    for i, (dx, hh) in enumerate([(-55, 70), (-28, 95), (0, 140), (28, 95), (55, 70)]):
        x = cx + dx
        s += f'<polygon points="{x-9},{by-30} {x+9},{by-30} {x+3},{by-30-hh} {x-3},{by-30-hh}" fill="{color}" opacity="{0.75 if i != 2 else 0.95}"/>'
    s += f'<circle cx="{cx}" cy="{by-178}" r="16" fill="url(#glow)" opacity="0.7"/>'
    return s


def m_eclipse(w, h, color, rng):
    cx, cy, r = w / 2, h * 0.45, min(w, h) * 0.24
    s = f'<circle cx="{cx}" cy="{cy}" r="{r+10}" fill="{color}" opacity="0.35"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r+4}" fill="{color}" opacity="0.6"/>'
    s += f'<circle cx="{cx+8}" cy="{cy-4}" r="{r}" fill="#05060a"/>'
    s += f'<line x1="{cx-r*0.9}" y1="{cy+r*1.5}" x2="{cx+r*0.9}" y2="{cy+r*1.5}" stroke="{color}" stroke-width="3" opacity="0.8"/>'
    return s


def m_streaks(w, h, color, rng):
    s = ''
    for _ in range(9):
        x, y = rng.uniform(0, w), rng.uniform(h * 0.15, h * 0.8)
        l = rng.uniform(30, 80)
        c = color if rng.random() < 0.6 else '#ff5a4a'
        s += f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x+l:.0f}" y2="{y-l*0.45:.0f}" stroke="{c}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>'
    cx, cy = w * 0.5, h * 0.55
    s += f'<polygon points="{cx-60},{cy+10} {cx+60},{cy} {cx-40},{cy-18}" fill="#c9d1db" opacity="0.8"/>'
    return s


def m_ring(w, h, color, rng):
    cx, cy, r = w / 2, h * 0.47, min(w, h) * 0.26
    s = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="16" opacity="0.8"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*0.35}" fill="{color}" opacity="0.9"/>'
    s += f'<rect x="{cx-r-12}" y="{cy-8}" width="24" height="16" fill="#05060a"/>'
    for i in range(6):
        a = i * math.pi / 3
        s += f'<line x1="{cx+r*0.35*math.cos(a):.1f}" y1="{cy+r*0.35*math.sin(a):.1f}" x2="{cx+r*math.cos(a):.1f}" y2="{cy+r*math.sin(a):.1f}" stroke="{color}" stroke-width="3" opacity="0.6"/>'
    return s


def m_tower(w, h, color, rng):
    cx, by = w / 2, h * 0.82
    s = f'<polygon points="{cx-22},{by} {cx+22},{by} {cx+8},{by-190} {cx},{by-215} {cx-8},{by-190}" fill="{color}" opacity="0.85"/>'
    for i in range(10):
        y = by - 20 - i * 17
        s += f'<line x1="{cx-14+i*0.9:.1f}" y1="{y}" x2="{cx+14-i*0.9:.1f}" y2="{y}" stroke="#05060a" stroke-width="1" opacity="0.5"/>'
    s += f'<rect x="{cx-90}" y="{by-50}" width="40" height="50" fill="{color}" opacity="0.35"/><rect x="{cx+50}" y="{by-70}" width="34" height="70" fill="{color}" opacity="0.35"/>'
    return s


def m_planet(w, h, color, rng):
    cx, cy, r = w / 2, h * 0.5, min(w, h) * 0.3
    s = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" opacity="0.9"/>'
    s += f'<path d="M {cx-r} {cy} Q {cx} {cy-r*0.4} {cx+r} {cy}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.35"/>'
    s += f'<path d="M {cx-r*0.9} {cy+r*0.35} Q {cx} {cy+r*0.1} {cx+r*0.9} {cy+r*0.4}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.25"/>'
    s += f'<circle cx="{cx-r*0.35}" cy="{cy-r*0.35}" r="{r*0.9}" fill="url(#glow)" opacity="0.15"/>'
    return s


def m_hexwheel(w, h, color, rng):
    cx, cy, r = w / 2, h * 0.47, min(w, h) * 0.27
    pts = ' '.join(f'{cx + r*math.cos(math.pi/6 + i*math.pi/3):.1f},{cy + r*math.sin(math.pi/6 + i*math.pi/3):.1f}' for i in range(6))
    s = f'<polygon points="{pts}" fill="none" stroke="{color}" stroke-width="6" opacity="0.85"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*0.55}" fill="none" stroke="{color}" stroke-width="3" stroke-dasharray="10 7" opacity="0.8"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*0.2}" fill="{color}" opacity="0.9"/>'
    return s


def m_figures(w, h, color, rng):
    s = ''
    for row in range(3):
        for col in range(5):
            x = w * 0.18 + col * w * 0.16
            y = h * 0.28 + row * h * 0.17
            s += f'<rect x="{x-11:.0f}" y="{y-14:.0f}" width="22" height="26" rx="10" fill="{color}" opacity="{0.55 + row*0.15:.2f}"/>'
            s += f'<rect x="{x-7:.0f}" y="{y-6:.0f}" width="14" height="4" rx="1" fill="#05060a" opacity="0.7"/>'
    return s


def m_rings(w, h, color, rng):
    cx, cy = w / 2, h * 0.47
    s = ''
    for i in range(5):
        s += f'<circle cx="{cx}" cy="{cy}" r="{18 + i*16}" fill="none" stroke="{color}" stroke-width="{3 - i*0.4:.1f}" opacity="{0.9 - i*0.15:.2f}"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="10" fill="{color}"/>'
    return s


def m_waves(w, h, color, rng):
    cx, cy = w * 0.32, h * 0.62
    s = f'<polygon points="{cx-14},{cy+40} {cx+14},{cy+40} {cx+4},{cy} {cx-4},{cy}" fill="{color}" opacity="0.8"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="7" fill="{color}"/>'
    for i in range(4):
        r = 30 + i * 24
        s += f'<path d="M {cx + r*math.cos(-0.9):.1f} {cy + r*math.sin(-0.9):.1f} A {r} {r} 0 0 1 {cx + r*math.cos(0.4):.1f} {cy + r*math.sin(0.4):.1f}" fill="none" stroke="{color}" stroke-width="3" opacity="{0.9 - i*0.18:.2f}"/>'
    return s


def m_scales(w, h, color, rng):
    cx, cy = w / 2, h * 0.32
    s = f'<line x1="{cx}" y1="{cy-10}" x2="{cx}" y2="{cy+150}" stroke="{color}" stroke-width="5"/>'
    s += f'<line x1="{cx-80}" y1="{cy+10}" x2="{cx+80}" y2="{cy+10}" stroke="{color}" stroke-width="4"/>'
    for dx in (-80, 80):
        x = cx + dx
        s += f'<line x1="{x}" y1="{cy+10}" x2="{x-24}" y2="{cy+70}" stroke="{color}" stroke-width="1.5"/><line x1="{x}" y1="{cy+10}" x2="{x+24}" y2="{cy+70}" stroke="{color}" stroke-width="1.5"/>'
        s += f'<path d="M {x-30} {cy+70} Q {x} {cy+95} {x+30} {cy+70} Z" fill="{color}" opacity="0.85"/>'
    s += f'<rect x="{cx-40}" y="{cy+150}" width="80" height="10" rx="3" fill="{color}"/>'
    return s


def m_credits(w, h, color, rng):
    s = ''
    for i in range(6):
        y = h * 0.66 - i * 13
        s += f'<ellipse cx="{w/2}" cy="{y:.0f}" rx="44" ry="12" fill="{color}" opacity="{0.6 + i*0.06:.2f}" stroke="#05060a" stroke-width="1"/>'
    s += f'<ellipse cx="{w/2+60}" cy="{h*0.66:.0f}" rx="30" ry="9" fill="{color}" opacity="0.6"/>'
    return s


def m_arrow(w, h, color, rng):
    cx, cy = w / 2, h * 0.48
    return (f'<polygon points="{cx-60},{cy+40} {cx},{cy-60} {cx+60},{cy+40} {cx+20},{cy+40} {cx+20},{cy+80} {cx-20},{cy+80} {cx-20},{cy+40}" '
            f'fill="{color}" opacity="0.85"/>')


def m_handshake(w, h, color, rng):
    cx, cy = w / 2, h * 0.48
    s = f'<circle cx="{cx-34}" cy="{cy}" r="38" fill="none" stroke="{color}" stroke-width="7" opacity="0.85"/>'
    s += f'<circle cx="{cx+34}" cy="{cy}" r="38" fill="none" stroke="{GOLD}" stroke-width="7" opacity="0.85"/>'
    return s


def m_shield(w, h, color, rng):
    cx, cy = w / 2, h * 0.28
    s = f'<path d="M {cx} {cy} L {cx+70} {cy+25} Q {cx+65} {cy+125} {cx} {cy+165} Q {cx-65} {cy+125} {cx-70} {cy+25} Z" fill="{color}" opacity="0.85"/>'
    s += f'<path d="M {cx} {cy+30} L {cx+12} {cy+70} L {cx+50} {cy+72} L {cx+20} {cy+95} L {cx+30} {cy+132} L {cx} {cy+110} L {cx-30} {cy+132} L {cx-20} {cy+95} L {cx-50} {cy+72} L {cx-12} {cy+70} Z" fill="#05060a" opacity="0.6"/>'
    return s


def m_split(w, h, color, rng):
    cx, cy = w / 2, h * 0.48
    s = f'<path d="M {cx-6} {cy-75} A 75 75 0 0 0 {cx-6} {cy+75} Z" fill="{color}" opacity="0.85"/>'
    s += f'<path d="M {cx+6} {cy-75} A 75 75 0 0 1 {cx+6} {cy+75} Z" fill="{color}" opacity="0.45"/>'
    return s


def m_hourglass(w, h, color, rng):
    cx, cy = w / 2, h * 0.48
    return (f'<polygon points="{cx-50},{cy-75} {cx+50},{cy-75} {cx},{cy} {cx+50},{cy+75} {cx-50},{cy+75} {cx},{cy}" fill="{color}" opacity="0.8"/>'
            f'<rect x="{cx-60}" y="{cy-85}" width="120" height="10" fill="{GOLD}"/><rect x="{cx-60}" y="{cy+75}" width="120" height="10" fill="{GOLD}"/>')


def m_target(w, h, color, rng):
    cx, cy = w / 2, h * 0.48
    s = ''
    for r in (70, 48, 26):
        s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="5" opacity="0.85"/>'
    s += f'<line x1="{cx-90}" y1="{cy}" x2="{cx+90}" y2="{cy}" stroke="{color}" stroke-width="2"/><line x1="{cx}" y1="{cy-90}" x2="{cx}" y2="{cy+90}" stroke="{color}" stroke-width="2"/>'
    return s


def m_people(w, h, color, rng):
    s = ''
    for i in range(7):
        x = w * 0.14 + i * w * 0.12
        hh = 60 + (i % 3) * 14
        y = h * 0.7
        s += f'<circle cx="{x:.0f}" cy="{y-hh-12:.0f}" r="11" fill="{color}" opacity="0.85"/><rect x="{x-12:.0f}" y="{y-hh:.0f}" width="24" height="{hh}" rx="10" fill="{color}" opacity="0.7"/>'
    return s


def svg_scene(w, h, c1, c2, motif, color, seed, title=None, accent=GOLD):
    s, rng = base(w, h, c1, c2, seed)
    s += motif(w, h, color, rng)
    s += frame(w, h, accent, title)
    return s + '</svg>'


def write(name, content):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(content)


# event vignettes (300 x 360)
EV = {
    'ev_senate': ('#24324d', '#070a12', m_rotunda, '#9fb6d6'),
    'ev_jedi': ('#2a3a4d', '#06090f', m_spires, '#c9d4e0'),
    'ev_shadow': ('#2a1016', '#050307', m_eclipse, '#d0302a'),
    'ev_war': ('#2d2422', '#07060a', m_streaks, '#7fb6ec'),
    'ev_trade': ('#3a2f18', '#0a0806', m_ring, '#c58b2b'),
    'ev_chancellery': ('#3a1418', '#08050a', m_tower, '#b3141b'),
    'ev_naboo': ('#1d3a2c', '#05090a', m_planet, '#6fae7d'),
    'ev_separatist': ('#2c2240', '#07050c', m_hexwheel, '#8a5cb8'),
    'ev_rim': ('#3d2614', '#0a0604', m_planet, '#d9661f'),
    'ev_clones': ('#2c3036', '#07080a', m_figures, '#e6e9ee'),
    'ev_peace': ('#203a3d', '#05090a', m_rings, '#8fd1c8'),
    'ev_holonet': ('#1d2c40', '#05070c', m_waves, '#7fb6ec'),
    'ev_law': ('#2e2a1c', '#08070a', m_scales, GOLD),
}
for i, (k, (c1, c2, m, col)) in enumerate(EV.items()):
    write(k + '.svg', svg_scene(300, 360, c1, c2, m, col, 100 + i))

# cards (240 x 300) with titles
CARDS = {
    'card_routine': ('#2a2f3a', m_hourglass, '#aeb7c4', 'ROUTINE'),
    'card_credits': ('#3a2f18', m_credits, GOLD, 'CREDITS'),
    'card_campaign': ('#1d2c40', m_people, '#7fb6ec', 'CAMPAIGN'),
    'card_holonet': ('#1d2c40', m_waves, '#7fb6ec', 'HOLONET'),
    'card_relations': ('#24324d', m_handshake, '#9fb6d6', 'ALLIES'),
    'card_platform': ('#24324d', m_scales, GOLD, 'PLATFORM'),
    'card_enemy': ('#3a1418', m_target, '#e0745a', 'ENEMY'),
    'card_confront': ('#3a1418', m_tower, '#b3141b', 'CONFRONT'),
    'card_pact': ('#1d2c40', m_shield, '#7fb6ec', 'THE PACT'),
    'card_shadow': ('#2a1016', m_eclipse, '#d0302a', 'SHADOWS'),
    'card_jedi': ('#2a3a4d', m_spires, '#c9d4e0', 'THE JEDI'),
    'card_rim': ('#3d2614', m_planet, '#d9661f', 'THE RIM'),
    'card_peace': ('#203a3d', m_rings, '#8fd1c8', 'PEACE'),
    'card_disunity': ('#2c2240', m_split, '#c8a0e0', 'DISUNITY'),
    'card_civil': ('#1d3a2c', m_people, '#7fd18b', 'CITIZENS'),
    'card_law': ('#2e2a1c', m_scales, GOLD, 'THE LAW'),
    'card_forces': ('#2c3036', m_shield, '#c9d1db', 'DEFENCE'),
    'card_clones': ('#2c3036', m_figures, '#e6e9ee', 'THE ARMY'),
    'card_senate': ('#24324d', m_rotunda, '#9fb6d6', 'SENATE'),
    'card_shuffle': ('#24324d', m_arrow, GOLD, 'RESHUFFLE'),
}
for i, (k, (c1, m, col, title)) in enumerate(CARDS.items()):
    write(k + '.svg', svg_scene(240, 300, c1, '#05070c', m, col, 300 + i, title))

# decks
DECKS = {
    'deck_caucus': ('#1b3557', m_people, '#7fb6ec', 'CAUCUS'),
    'deck_senate': ('#3a2f18', m_rotunda, GOLD, 'SENATE'),
    'deck_last_days': ('#3a0d12', m_eclipse, '#ff5a4a', 'LAST DAYS'),
}
for i, (k, (c1, m, col, title)) in enumerate(DECKS.items()):
    write(k + '.svg', svg_scene(240, 300, c1, '#05070c', m, col, 500 + i, title, accent=col))

# advisor monograms
FACTION_COLOURS = {'inst': '#7fb6ec', 'hawk': '#c9d1db', 'rimward': '#d9661f', 'pacifist': '#8fd1c8'}
ADVISORS = {
    'antilles': ('BA', 'inst', 'ANTILLES'), 'organa': ('BO', 'inst', 'ORGANA'), 'bel_iblis': ('GB', 'hawk', 'BEL IBLIS'),
    'farr': ('OF', 'rimward', 'FARR'), 'mothma': ('MM', 'pacifist', 'MOTHMA'), 'amidala': ('PA', 'inst', 'AMIDALA'),
    'valorum': ('FV', 'inst', 'VALORUM'), 'chuchi': ('RC', 'rimward', 'CHUCHI'),
}
for i, (k, (ini, fac, name)) in enumerate(ADVISORS.items()):
    col = FACTION_COLOURS[fac]
    s, rng = base(240, 300, '#1b2333', '#05070c', 700 + i, nstars=30)
    s += f'<circle cx="120" cy="125" r="70" fill="none" stroke="{col}" stroke-width="5"/>'
    s += f'<circle cx="120" cy="125" r="60" fill="{col}" opacity="0.15"/>'
    s += f'<text x="120" y="146" text-anchor="middle" font-family="Georgia, serif" font-size="58" fill="{col}">{ini}</text>'
    s += frame(240, 300, GOLD, name)
    write(f'adv_{k}.svg', s + '</svg>')

# backgrounds
rng = random.Random(42)
bg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice">'
      '<defs><radialGradient id="neb" cx="70%" cy="30%" r="60%"><stop offset="0" stop-color="#1b2a4a" stop-opacity="0.9"/>'
      '<stop offset="1" stop-color="#03040a" stop-opacity="0"/></radialGradient>'
      '<radialGradient id="neb2" cx="20%" cy="80%" r="50%"><stop offset="0" stop-color="#3a1630" stop-opacity="0.6"/>'
      '<stop offset="1" stop-color="#03040a" stop-opacity="0"/></radialGradient></defs>'
      '<rect width="1600" height="1000" fill="#03040a"/><rect width="1600" height="1000" fill="url(#neb)"/>'
      '<rect width="1600" height="1000" fill="url(#neb2)"/>' + stars(rng, 1600, 1000, 650, 1.6, 0.9) + '</svg>')
write('bg_stars.svg', bg)

rng = random.Random(7)
s = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice">'
     '<defs><radialGradient id="hall" cx="50%" cy="100%" r="90%"><stop offset="0" stop-color="#26324a"/><stop offset="1" stop-color="#04050a"/></radialGradient></defs>'
     '<rect width="1600" height="1000" fill="url(#hall)"/>')
s += stars(rng, 1600, 400, 120, 1.2, 0.6)
cx, cy = 800, 1150
for ring in range(9):
    r = 300 + ring * 95
    n = 18 + ring * 7
    for i in range(n):
        a = math.pi + math.pi * (i + 0.5) / n
        x, y = cx + r * math.cos(a), cy + r * math.sin(a) * 0.7
        if y < 0 or y > 1000:
            continue
        s += f'<rect x="{x-14:.0f}" y="{y-8:.0f}" width="28" height="16" rx="4" fill="#9fb6d6" opacity="{0.08 + ring*0.03:.2f}"/>'
write('bg_senate.svg', s + '</svg>')

print('wrote', len(os.listdir(OUT)), 'files')
