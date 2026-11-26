"""Výškový model terénu pro herní svět z ČÚZK DMR 5G (ArcGIS ImageServer).

Použití: python3 -I tools/build_terrain.py <výstup.bin> [cache.tif]
Výstup: hlavička JSON (1 řádek) + Uint16 výšky v cm nad `base` na mřížce N×N (řádky od severu).
Potřebuje Pillow.
"""
import io
import json
import math
import struct
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ORIGIN_LAT, ORIGIN_LON = 50.17585, 14.09106
HALF = 1600  # herní svět = čtverec ±HALF metrů
M_LAT = 111_320.0
M_LON = 111_320.0 * math.cos(math.radians(ORIGIN_LAT))
RAW = 2000          # 1,6 m / px stažení
STEP = 2.0          # herní mřížka 2 m
URL = 'https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer/exportImage'


def fetch(cache: Path):
    if cache.exists():
        return Image.open(cache)
    lat0, lat1 = ORIGIN_LAT - HALF / M_LAT, ORIGIN_LAT + HALF / M_LAT
    lon0, lon1 = ORIGIN_LON - HALF / M_LON, ORIGIN_LON + HALF / M_LON
    q = (f'?bbox={lon0},{lat0},{lon1},{lat1}&bboxSR=4326&imageSR=4326&size={RAW},{RAW}'
         '&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image')
    req = urllib.request.Request(URL + q, headers={'User-Agent': 'hrej-vinarice-build'})
    data = urllib.request.urlopen(req, timeout=180).read()
    cache.write_bytes(data)
    return Image.open(io.BytesIO(data))


def main(out: Path, cache: Path):
    img = fetch(cache).convert('F')
    w, h = img.size
    px = img.load()
    n = int(2 * HALF / STEP) + 1
    vals = []
    for j in range(n):            # j: sever → jih
        for i in range(n):        # i: západ → východ
            fx = i / (n - 1) * (w - 1)
            fy = j / (n - 1) * (h - 1)
            x0, y0 = int(fx), int(fy)
            x1, y1 = min(w - 1, x0 + 1), min(h - 1, y0 + 1)
            tx, ty = fx - x0, fy - y0
            v = (px[x0, y0] * (1 - tx) * (1 - ty) + px[x1, y0] * tx * (1 - ty)
                 + px[x0, y1] * (1 - tx) * ty + px[x1, y1] * tx * ty)
            vals.append(v)
    good = [v for v in vals if 100 < v < 2000]
    base = math.floor(min(good))
    fill = sorted(good)[len(good) // 2]
    vals = [v if 100 < v < 2000 else fill for v in vals]
    hdr = json.dumps({'n': n, 'step': STEP, 'half': HALF, 'base': base, 'min': min(vals), 'max': max(vals)}).encode() + b'\n'
    body = struct.pack(f'<{n * n}H', *(max(0, min(65535, round((v - base) * 100))) for v in vals))
    out.write_bytes(hdr + body)
    print(f'{n}×{n}, base {base} m, rozsah {min(vals):.1f}–{max(vals):.1f} m, {len(hdr) + len(body)} B')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2] if len(sys.argv) > 2 else 'dmr5g_cache.tif'))
