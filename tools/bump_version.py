"""Přidá ?v=<verze> ke všem importům JS a k CSS, aby telefony po nahrání nové verze nenačítaly starou z mezipaměti.
Spouštět před každým git push:  python3 -I tools/bump_version.py"""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M%S')
for f in (root / 'js').glob('*.js'):
    s = f.read_text()
    n = re.sub(r"""(from\s+'\./[\w-]+\.js)(\?v=\d+)?'""", rf"\1?v={v}'", s)
    if n != s: f.write_text(n)
idx = root / 'index.html'
s = idx.read_text()
s = re.sub(r'(src="js/main\.js)(\?v=\d+)?"', rf'\1?v={v}"', s)
s = re.sub(r'(href="css/style\.css)(\?v=\d+)?"', rf'\1?v={v}"', s)
idx.write_text(s)
print('verze', v)
