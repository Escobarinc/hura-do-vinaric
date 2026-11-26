"""Stáhne surová OSM data pro herní svět (Overpass API) s opakováním a záložními servery.

Použití: python3 -I tools/fetch_osm.py <složka>   → main.json, routes.json, areas.json, names.json
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

ORIGIN_LAT, ORIGIN_LON = 50.17585, 14.09106
HALF = 1600
M_LAT = 111_320.0
M_LON = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))
PAD = 600  # silnice a voda kousek za okrajem

SERVERS = ['https://overpass-api.de/api/interpreter',
           'https://overpass.private.coffee/api/interpreter',
           'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter']


def bbox(pad=0):
    h = HALF + pad
    return f'{ORIGIN_LAT - h / M_LAT:.6f},{ORIGIN_LON - h / M_LON:.6f},{ORIGIN_LAT + h / M_LAT:.6f},{ORIGIN_LON + h / M_LON:.6f}'


def query(q):
    body = urllib.parse.urlencode({'data': q}).encode()
    wait = 5
    for attempt in range(12):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=body, headers={'User-Agent': 'osm-game-build/1.0'})
            data = urllib.request.urlopen(req, timeout=240).read()
            j = json.loads(data)
            if 'elements' in j:
                return j
            raise ValueError(str(j)[:200])
        except Exception as e:  # noqa: BLE001
            print('  retry', url.split('/')[2], str(e)[:90])
            time.sleep(wait)
            wait = min(wait * 2, 60)
    raise SystemExit('Overpass nedostupný')


def main(out):
    os.makedirs(out, exist_ok=True)
    B, BP = bbox(), bbox(PAD)
    jobs = {
        'main.json': f'''[out:json][timeout:200];
(
  way["building"]({B}); relation["building"]({B});
  way["highway"]({BP});
  way["railway"="rail"]({BP});
  way["natural"="water"]({BP}); relation["natural"="water"]({BP});
  way["waterway"~"river|canal|stream"]({BP});
  way["landuse"~"grass|meadow|recreation_ground|forest|cemetery"]({B});
  way["leisure"~"park|garden|pitch|recreation_ground"]({B});
  way["natural"~"wood|grassland|scrub"]({B});
  node["highway"="bus_stop"]({B});
  node["place"]({BP});
  node["name"]["tourism"]({B}); node["name"]["amenity"]({B}); node["name"]["historic"]({B});
  way["name"]["amenity"]({B}); way["name"]["tourism"]({B}); way["name"]["historic"]({B});
);
out geom;''',
        'routes.json': f'[out:json][timeout:200];relation["route"="bus"]({B});out geom;',
        'areas.json': f'''[out:json][timeout:200];
(
  way["place"="square"]({B}); relation["place"="square"]({B});
  way["highway"="pedestrian"]["area"="yes"]({B});
  way["amenity"="parking"]({B}); relation["amenity"="parking"]({B});
);
out geom;''',
        'names.json': f'[out:json][timeout:120];nwr["name"]({B})[!"highway"][!"route"][!"public_transport"];out center tags;',
    }
    for fn, q in jobs.items():
        path = os.path.join(out, fn)
        if os.path.exists(path):
            print(fn, 'už je')
            continue
        print('stahuji', fn)
        j = query(q)
        json.dump(j, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
        print(' ', len(j['elements']), 'prvků')
        time.sleep(3)


if __name__ == '__main__':
    main(sys.argv[1])
