"""Převede postavy Quaternius (glTF s base64 bufferem) na kompaktní GLB jen s potřebnými animacemi.

Použití: python3 -I tools/pack_chars.py <složka_glTF> <výstupní_složka> Jméno1 Jméno2 ...
"""
import base64
import json
import struct
import sys
from pathlib import Path

KEEP_ANIMS = {'Idle', 'Walk', 'Run', 'Death', 'Jump', 'Punch'}


def pack(src: Path, dst: Path):
    j = json.loads(src.read_text())
    uri = j['buffers'][0]['uri']
    raw = base64.b64decode(uri.split(',', 1)[1])

    j['animations'] = [a for a in j.get('animations', []) if a['name'] in KEEP_ANIMS]
    used = set()
    for m in j['meshes']:
        for p in m['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p:
                used.add(p['indices'])
            for t in p.get('targets', []):
                used.update(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used.add(s['inverseBindMatrices'])
    for a in j['animations']:
        for s in a['samplers']:
            used.update((s['input'], s['output']))

    comp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    out = bytearray()
    views, accs, remap = [], [], {}
    for old in sorted(used):
        a = dict(j['accessors'][old])
        v = j['bufferViews'][a['bufferView']]
        assert 'byteStride' not in v or v['byteStride'] == comp[a['type']] * size[a['componentType']]
        n = a['count'] * comp[a['type']] * size[a['componentType']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        while len(out) % 4:
            out.append(0)
        nv = {'buffer': 0, 'byteOffset': len(out), 'byteLength': n}
        if 'target' in v:
            nv['target'] = v['target']
        out += raw[start:start + n]
        a['bufferView'] = len(views)
        a.pop('byteOffset', None)
        views.append(nv)
        remap[old] = len(accs)
        accs.append(a)

    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: remap[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = remap[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: remap[v] for k, v in t.items()} for t in p['targets']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = remap[s['inverseBindMatrices']]
    for a in j['animations']:
        for s in a['samplers']:
            s['input'] = remap[s['input']]
            s['output'] = remap[s['output']]

    while len(out) % 4:
        out.append(0)
    j['accessors'] = accs
    j['bufferViews'] = views
    j['buffers'] = [{'byteLength': len(out)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js
    glb += struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    dst.write_bytes(glb)
    return len(glb)


if __name__ == '__main__':
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[3:]:
        n = pack(src / f'{name}.gltf', dst / f'{name}.glb')
        print(f'{name}: {n / 1e6:.2f} MB')
