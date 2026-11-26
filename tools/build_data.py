"""Převede surová OSM data (Overpass JSON) do kompaktního herního formátu.

Použití:
    python3 -I tools/build_data.py <hk.json> <trol.json> <výstup.json> [areas.json]

Souřadnice: metry od návsi ve Vinařicích, x = východ, y = sever.
"""
import json
import re
import math
import sys

ORIGIN_LAT, ORIGIN_LON = 50.17585, 14.09106
M_LAT = 111_320.0
M_LON = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))
HALF = 1600  # herní svět = čtverec ±HALF metrů


def xy(lat, lon):
    return (round((lon - ORIGIN_LON) * M_LON, 1), round((lat - ORIGIN_LAT) * M_LAT, 1))


def geom_xy(g):
    return [xy(p['lat'], p['lon']) for p in g]


def inside(pts, margin=0):
    return any(abs(x) < HALF + margin and abs(y) < HALF + margin for x, y in pts)


def flat(pts):
    out = []
    for x, y in pts:
        out += [x, y]
    return out


def ring_area(pts):
    a = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2


def clean_ring(pts):
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    # sjednotit orientaci (CCW)
    if ring_area(pts) < 0:
        pts = pts[::-1]
    return pts


def stitch(ways):
    """Spojí otevřené linie multipolygonu do uzavřených kruhů."""
    ways = [list(w) for w in ways if len(w) > 1]
    rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w + cur[1:]
                elif w[0] == cur[0]:
                    cur = w[::-1] + cur[1:]
                else:
                    continue
                ways.pop(i)
                changed = True
                break
        if len(cur) >= 4:
            rings.append(cur)
    return rings


def num(v):
    try:
        return float(str(v).replace(',', '.').split()[0])
    except (ValueError, IndexError):
        return None


ROAD_W = {
    'primary': 14, 'primary_link': 8, 'secondary': 12, 'secondary_link': 8,
    'tertiary': 10, 'tertiary_link': 7, 'unclassified': 7, 'residential': 7,
    'living_street': 6, 'service': 5, 'busway': 7,
    'pedestrian': 6, 'footway': 2.5, 'path': 2, 'cycleway': 2.5, 'steps': 2.5, 'track': 3.5,
}
DRIVABLE = {'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
            'unclassified', 'residential', 'living_street', 'service', 'busway'}
PITCHED = {'house', 'yes', 'residential', 'detached', 'semidetached_house', 'barn', 'farm', 'civic', 'school',
           'hotel', 'apartments', 'commercial', 'retail', 'church', 'chapel', 'kindergarten', 'public'}
GREEN = {'grass', 'meadow', 'recreation_ground', 'park', 'garden', 'pitch', 'forest', 'wood', 'cemetery'}


def is_poi(t):
    """Pojmenovaná místa pro teleport, taxi a minimapu."""
    return (t.get('tourism') in ('museum', 'attraction', 'viewpoint', 'information')
            or t.get('amenity') in ('police', 'hospital', 'fuel', 'prison', 'restaurant', 'pub', 'school', 'kindergarten',
                                    'post_office', 'place_of_worship', 'townhall', 'community_centre')
            or t.get('historic') in ('memorial', 'monument', 'wayside_cross', 'wayside_shrine', 'mine', 'mine_shaft')
            or t.get('man_made') in ('mineshaft', 'headframe', 'water_tower')
            or (t.get('natural') == 'water' and t.get('name')))


def building_kind(t, h, levels):
    b = t.get('building', 'yes')
    if t.get('amenity') == 'place_of_worship' or b in ('church', 'cathedral', 'chapel'):
        return 'church'
    if b in ('industrial', 'warehouse', 'garage', 'garages', 'shed', 'hangar', 'roof', 'service', 'manufacture'):
        return 'industrial'
    if b in ('house', 'detached', 'semidetached_house', 'bungalow', 'hut') and h < 14:
        return 'house'
    if (levels and levels >= 8) or h >= 24:
        return 'panel'
    if b in ('commercial', 'retail', 'office', 'public', 'civic', 'school', 'university', 'hospital',
             'government', 'train_station', 'hotel', 'college', 'kindergarten'):
        return 'civic'
    return 'block'


def main(src, trol_src, dst, areas_src=None):
    E = json.load(open(src, encoding='utf-8'))['elements']
    out = {'origin': [ORIGIN_LAT, ORIGIN_LON], 'half': HALF, 'buildings': [], 'roads': [], 'water': [],
           'rivers': [], 'green': [], 'rail': [], 'poi': [], 'stops': [], 'districts': [], 'lines': [], 'plazas': [], 'prison': None}

    for e in E:
        t = e.get('tags', {})
        typ = e['type']

        # ---------- budovy ----------
        if 'building' in t and typ in ('way', 'relation'):
            if typ == 'way':
                rings = [geom_xy(e['geometry'])]
            else:
                rings = stitch([geom_xy(m['geometry']) for m in e.get('members', [])
                                if m.get('role') == 'outer' and 'geometry' in m])
            levels = num(t.get('building:levels'))
            h = num(t.get('height'))
            explicit = bool(h or levels)
            if not h:
                # vesnice: neznámý dům = přízemí + patro; RÚIAN udává jen podlaží → přičíst šikmou střechu
                h = (levels or (1 if t.get('building') in ('garage', 'garages', 'shed') else 2)) * 3.0 + 0.4
                if t.get('building', 'yes') in PITCHED:
                    h += 3.2
            mh = num(t.get('min_height')) or 0
            if h < 2.5:
                h = 2.5
            kind = building_kind(t, h, levels)
            for r in rings:
                r = clean_ring(r)
                if len(r) < 3 or not inside(r) or abs(ring_area(r)) < 6:
                    continue
                rec = {'p': flat(r), 'h': round(h, 1), 'k': kind}
                if not explicit:
                    rec['_guess'] = True  # výška neznámá – dopočítá se níž podle druhu a velikosti
                if t.get('amenity') == 'shelter' or t.get('shelter_type') == 'public_transport':
                    rec['_shelter'] = True
                if mh:
                    rec['mh'] = mh
                if t.get('name'):
                    rec['n'] = t['name']
                rs = t.get('roof:shape')
                rs = {'half-hipped': 'hipped', 'gambrel': 'gabled', 'round_gabled': 'gabled', 'double_saltbox': 'gabled',
                      'quadruple_saltbox': 'hipped', 'mansard': 'hipped', 'round': 'gabled', 'many': 'hipped'}.get(rs, rs)
                if rs in ('onion', 'pyramidal', 'gabled', 'hipped', 'dome', 'flat', 'skillion'):
                    rec['r'] = rs
                rl = num(t.get('roof:levels'))
                if rl is not None:
                    rec['rl'] = rl
                if t.get('roof:orientation') == 'across':
                    rec['ro'] = 1
                if levels:
                    rec['l'] = levels
                y = re.match(r'\D*(\d{4})', t.get('start_date', ''))
                if y:
                    rec['y'] = int(y.group(1))
                if t.get('building') not in (None, 'yes'):
                    rec['b'] = t['building']
                out['buildings'].append(rec)
            continue

        # ---------- silnice ----------
        if typ == 'way' and t.get('highway') in ROAD_W:
            pts = geom_xy(e['geometry'])
            if not inside(pts, 200):
                continue
            hw = t['highway']
            w = num(t.get('width')) if hw in DRIVABLE else None
            lanes = num(t.get('lanes'))
            if not w:
                w = ROAD_W[hw]
                if lanes and hw in DRIVABLE:
                    w = max(w, lanes * 3.4)
            rec = {'p': flat(pts), 't': hw, 'w': round(min(w, 26), 1)}
            if t.get('name'):
                rec['n'] = t['name']
            if t.get('bridge') == 'yes':
                rec['b'] = 1
            if t.get('oneway') == 'yes':
                rec['o'] = 1
            if t.get('junction') == 'roundabout':
                rec['o'] = 1
            if t.get('tunnel') == 'yes':
                continue
            out['roads'].append(rec)
            continue

        # ---------- železnice ----------
        if typ == 'way' and t.get('railway') == 'rail':
            pts = geom_xy(e['geometry'])
            if inside(pts) and t.get('service') not in ('siding', 'yard', 'spur'):
                out['rail'].append({'p': flat(pts), 'b': 1 if t.get('bridge') == 'yes' else 0})
            continue

        # ---------- voda ----------
        if t.get('natural') == 'water' and typ in ('way', 'relation'):
            if typ == 'way':
                rings = [geom_xy(e['geometry'])]
            else:
                rings = stitch([geom_xy(m['geometry']) for m in e.get('members', [])
                                if m.get('role') == 'outer' and 'geometry' in m])
            for r in rings:
                r = clean_ring(r)
                if len(r) >= 3 and inside(r, 400):
                    out['water'].append({'p': flat(r)})
                    if t.get('name') and inside(r):
                        out['poi'].append({'x': round(sum(q[0] for q in r) / len(r), 1), 'y': round(sum(q[1] for q in r) / len(r), 1),
                                           'n': t['name'], 't': 'water'})
            continue
        if typ == 'way' and t.get('waterway') in ('river', 'canal', 'stream'):
            pts = geom_xy(e['geometry'])
            if inside(pts, 400) and t.get('tunnel') not in ('culvert', 'yes'):
                out['rivers'].append({'p': flat(pts), 'n': t.get('name', ''),
                                      'w': 40 if t['waterway'] == 'river' else 6})
            continue

        # ---------- zeleň ----------
        g = t.get('landuse') or t.get('leisure') or t.get('natural')
        if typ == 'way' and g in GREEN and 'geometry' in e:
            r = clean_ring(geom_xy(e['geometry']))
            if len(r) >= 3 and inside(r):
                rec = {'p': flat(r), 't': g}
                if t.get('name'):
                    rec['n'] = t['name']
                out['green'].append(rec)
            continue

        # ---------- body zájmu ----------
        if typ == 'node':
            p = xy(e['lat'], e['lon'])
            if t.get('highway') == 'bus_stop' and t.get('name') and inside([p]):
                out['stops'].append({'x': p[0], 'y': p[1], 'n': t['name']})
            elif t.get('place') in ('suburb', 'quarter', 'neighbourhood') and t.get('name'):
                out['districts'].append({'x': p[0], 'y': p[1], 'n': t['name'], 'big': t['place'] == 'suburb'})
            elif t.get('name') and inside([p]) and is_poi(t):
                out['poi'].append({'x': p[0], 'y': p[1], 'n': t['name'],
                                   't': t.get('amenity') or t.get('tourism')})
            continue
        if typ == 'way' and t.get('amenity') == 'prison' and 'geometry' in e:
            out['prison'] = flat(clean_ring(geom_xy(e['geometry'])))
        if typ in ('way', 'relation') and t.get('name') and is_poi(t):
            b = e.get('bounds')
            if b:
                p = xy((b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2)
                if inside([p]):
                    out['poi'].append({'x': p[0], 'y': p[1], 'n': t['name'],
                                       't': t.get('amenity') or t.get('tourism')})

    # ---------- autobusové linky PID (oříznuté na herní území) ----------
    seen = set()
    for r in json.load(open(trol_src, encoding='utf-8'))['elements']:
        t = r.get('tags', {})
        ref = t.get('ref')
        if not ref or ref in seen:
            continue
        ways = [geom_xy(m['geometry']) for m in r['members'] if m['type'] == 'way' and 'geometry' in m
                and m.get('role', '') in ('', 'forward', 'backward')]
        if not ways:
            continue
        # zřetězit úseky trasy v pořadí relace
        path = list(ways[0])
        for w in ways[1:]:
            if not path:
                break
            if w[0] == path[-1]:
                path += w[1:]
            elif w[-1] == path[-1]:
                path += w[::-1][1:]
            elif len(path) == len(ways[0]) and (w[0] == path[0] or w[-1] == path[0]):
                path = path[::-1]
                path += (w[1:] if w[0] == path[-1] else w[::-1][1:])
            else:
                d0 = math.dist(path[-1], w[0])
                d1 = math.dist(path[-1], w[-1])
                path += (w if d0 <= d1 else w[::-1])
        # nejdelší souvislý úsek uvnitř herního území
        best, cur = [], []
        lim = HALF - 25
        for q in path:
            if abs(q[0]) < lim and abs(q[1]) < lim:
                cur.append(q)
                if len(cur) > len(best):
                    best = cur
            else:
                cur = []
        path = best
        if len(path) < 10 or sum(math.dist(path[i], path[i + 1]) for i in range(len(path) - 1)) < 600:
            continue
        seen.add(ref)
        name = re.sub(r'^(Bus\s*)?\d+\s*:\s*', '', t.get('name', ''))
        out['lines'].append({'ref': ref, 'n': name or 'Autobus ' + ref, 'p': flat(path)})

    # ---------- náměstí, pěší zóny, parkoviště ----------
    if areas_src:
        for e in json.load(open(areas_src, encoding='utf-8'))['elements']:
            t = e.get('tags', {})
            if t.get('amenity') == 'parking' and t.get('parking') in ('multi-storey', 'underground', 'rooftop'):
                continue
            kind = 'parking' if t.get('amenity') == 'parking' else 'square'
            if e['type'] == 'way':
                rings = [geom_xy(e['geometry'])]
            else:
                rings = stitch([geom_xy(m['geometry']) for m in e.get('members', [])
                                if m.get('role') in ('outer', '') and 'geometry' in m])
            for r in rings:
                r = clean_ring(r)
                if len(r) >= 3 and inside(r) and abs(ring_area(r)) > 20:
                    rec = {'p': flat(r), 't': kind}
                    if t.get('name'):
                        rec['n'] = t['name']
                    out['plazas'].append(rec)

    # ---------- stavby bez výšky: přístřešky, garáže, kiosky… ----------
    SMALL = {'garage': 2.8, 'garages': 2.8, 'shed': 2.6, 'allotment_house': 3.2, 'cabin': 3.0, 'hut': 2.8, 'kiosk': 3.0,
             'carport': 2.8, 'toilets': 3.0, 'transportation': 3.2, 'service': 3.4, 'signal_box': 6.0, 'bunker': 2.5,
             'construction': 6.0, 'barn': 6.0, 'greenhouse': 3.0, 'parking': 9.0}
    stops = [(s_['x'], s_['y']) for s_ in out['stops']]
    fixed = shelters = 0
    for b in out['buildings']:
        guess = b.pop('_guess', False)
        shelter = b.pop('_shelter', False)
        area = abs(ring_area(list(zip(b['p'][0::2], b['p'][1::2]))))
        xs, ys = b['p'][0::2], b['p'][1::2]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        near_stop = any((cx - sx) ** 2 + (cy - sy) ** 2 < 18 ** 2 for sx, sy in stops)
        bt = b.get('b')
        if shelter or bt == 'roof' or (guess and area < 70 and near_stop):
            # přístřešek / zastávka: střecha na sloupcích
            b['h'] = 3.0 if bt == 'roof' else 2.8
            b['mh'] = 2.4 if bt == 'roof' else 0
            b['k'] = 'shelter'
            b['r'] = 'flat'
            shelters += 1
            continue
        if not guess:
            continue
        if bt in SMALL:
            b['h'] = SMALL[bt]
        elif bt in ('industrial', 'warehouse', 'manufacture'):
            b['h'] = 7.0
        elif area < 40:
            b['h'] = 3.0
        elif area < 120:
            b['h'] = 6.2
        else:
            continue
        if b['h'] < 4:
            b['r'] = b.get('r') or 'flat'
            if b['k'] not in ('industrial', 'house'):
                b['k'] = 'industrial' if bt in ('garage', 'garages', 'shed', 'service', 'transportation') else b['k']
        fixed += 1
    print(f'opraveno {fixed} staveb bez výšky, {shelters} přístřešků')

    # věznice: spojka přes vjezd ve vnitřní zdi (x ≈ −266, viditelný na ortofotu) mezi vnitřní cestou a předním dvorem
    def road_pt(near_x, near_y):
        best, bd = None, 1e9
        for r in out['roads']:
            for j in range(0, len(r['p']), 2):
                d = (r['p'][j] - near_x) ** 2 + (r['p'][j + 1] - near_y) ** 2
                if d < bd:
                    bd, best = d, (r['p'][j], r['p'][j + 1])
        return best if bd < 9 else None
    a, b = road_pt(-270, -1081), road_pt(-278, -1127)
    if a and b:
        out['roads'].append({'p': [a[0], a[1], -267.0, -1095.0, -266.0, -1110.0, -266.5, -1124.0, b[0], b[1]],
                             't': 'service', 'w': 5.5, 'n': 'Věznice – vnitřní vjezd'})
        print('věznice: přidána spojka přes vnitřní vjezd')

    # věznice: vnitřní cesty, které v OSM chybí (podle pamětníka a ortofota); x, y = metry (y = sever)
    for name, pts in (
        ('Věznice – ulička k jídelně', [(-329.5, -1066.6), (-329.5, -1085.5), (-329.5, -1099), (-329.5, -1112)]),
        ('Věznice – příčka mezi dvory', [(-270, -1057), (-269.5, -1068), (-268.5, -1080.8)]),
        ('Věznice – cesta k jídelně (vchod 1)', [(-312.5, -1063.6), (-312.5, -1080), (-312.5, -1091.2)]),
    ):
        out['roads'].append({'p': [c for q in pts for c in q], 't': 'service', 'w': 5.0, 'n': name})
    print('věznice: doplněny vnitřní cesty')

    # výšky budov věznice změřené ze stínů na ortofotu (tools/prison_heights.json)
    import os
    hp = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prison_heights.json')
    if os.path.exists(hp):
        n = 0
        for hx, hy, hh, _src in json.load(open(hp, encoding='utf-8'))['b']:
            for b in out['buildings']:
                xs, ys = b['p'][0::2], b['p'][1::2]
                if abs(sum(xs) / len(xs) - hx) < 1.5 and abs(sum(ys) / len(ys) - hy) < 1.5:
                    b['h'] = hh
                    b.pop('l', None)
                    n += 1
        print(f'výšky ze stínů: {n} budov')

    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print({k: len(v) for k, v in out.items() if isinstance(v, list)})


if __name__ == '__main__':
    main(*sys.argv[1:5])
