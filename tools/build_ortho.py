"""Stáhne ortofoto ČÚZK (WMTS, Web Mercator, z17) pro herní svět a složí ho do 2×2 dlaždic.

Použití (potřebuje Pillow):
    python3 tools/build_ortho.py <cache_dir> <výstupní_složka>

Ortofoto © ČÚZK, otevřená data.
"""
import math
import os
import sys
import time
import urllib.request

from PIL import Image

ORIGIN_LAT, ORIGIN_LON = 50.17585, 14.09106
HALF = 1600  # herní svět = čtverec ±HALF metrů
M_LAT = 111_320.0
M_LON = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))
Z = 18
URL = 'https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}'


def gpx(lat, lon):
    n = 2 ** Z * 256
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main(cache, out):
    os.makedirs(cache, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    lat0, lat1 = ORIGIN_LAT - HALF / M_LAT, ORIGIN_LAT + HALF / M_LAT
    lon0, lon1 = ORIGIN_LON - HALF / M_LON, ORIGIN_LON + HALF / M_LON
    x0, y0 = gpx(lat1, lon0)  # severozápad
    x1, y1 = gpx(lat0, lon1)  # jihovýchod
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    w, h = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mosaic = Image.new('RGB', (w, h))
    total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    done = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            fn = os.path.join(cache, f'{tx}_{ty}.jpg')
            if not os.path.exists(fn):
                for attempt in range(4):
                    try:
                        req = urllib.request.Request(URL.format(z=Z, x=tx, y=ty), headers={'User-Agent': 'hrej-vinarice-ortho/1.0'})
                        data = urllib.request.urlopen(req, timeout=30).read()
                        open(fn, 'wb').write(data)
                        break
                    except Exception as e:  # noqa: BLE001
                        print('retry', tx, ty, e)
                        time.sleep(2 * (attempt + 1))
                time.sleep(0.03)
            try:
                mosaic.paste(Image.open(fn).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
            except Exception as e:  # noqa: BLE001
                print('bad tile', fn, e)
            done += 1
            if done % 50 == 0:
                print(f'{done}/{total}')
    crop = mosaic.crop((round(x0 - tx0 * 256), round(y0 - ty0 * 256), round(x1 - tx0 * 256), round(y1 - ty0 * 256)))
    for name, size in (('hi', 4096), ('lo', 2048)):
        full = crop.resize((size * 2, size * 2), Image.LANCZOS)
        for j in range(2):      # řádek (sever → jih)
            for i in range(2):  # sloupec (západ → východ)
                tile = full.crop((i * size, j * size, (i + 1) * size, (j + 1) * size))
                tile.save(os.path.join(out, f'ortho_{name}_{i}{j}.jpg'), quality=82 if name == 'hi' else 78, optimize=True)
    print('hotovo', crop.size)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
