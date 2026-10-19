"""Copy complete, unmodified font files; preserve their metadata and licenses."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/font-tools'))
from fontTools.ttLib import TTFont

SOURCE = Path.home() / 'AppData/Local/Microsoft/Windows/Fonts'
DEST = ROOT / 'assets/fonts'
LICENSES = ROOT / 'assets/licenses/fonts'
DEST.mkdir(parents=True, exist_ok=True)
LICENSES.mkdir(parents=True, exist_ok=True)
OFFICIAL_WENKAI = 'https://github.com/lxgw/LxgwWenkaiGB/releases/download/v1.522/LXGWWenKaiGB-Regular.ttf'
official_font = ROOT / 'tmp/font-sources/LXGWWenKaiGB-Regular.ttf'
if not official_font.exists():
    official_font.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(OFFICIAL_WENKAI, official_font)
FACES = [
    ('lmroman10-regular.otf', 'Inkpage Roman', '400', 'normal', 'Latin-Modern'),
    ('lmroman10-bold.otf', 'Inkpage Roman', '700', 'normal', 'Latin-Modern'),
    ('lmroman10-italic.otf', 'Inkpage Roman', '400', 'italic', 'Latin-Modern'),
    ('lmroman10-bolditalic.otf', 'Inkpage Roman', '700', 'italic', 'Latin-Modern'),
    ('LXGWWenKaiGB-Regular.ttf', 'Inkpage WenKai', '400', 'normal', 'LXGW-WenKai-GB'),
    ('NotoSans-VariableFont_wdth,wght.ttf', 'Inkpage Sans', '100 900', 'normal', 'Noto-Sans'),
    ('Inconsolata-Regular.ttf', 'Inkpage Mono', '400', 'normal', 'Inconsolata'),
    ('Inconsolata-Bold.ttf', 'Inkpage Mono', '700', 'normal', 'Inconsolata'),
    ('SarasaFixedSC-Regular.ttf', 'Inkpage CJK Sans', '400', 'normal', 'Sarasa-Gothic'),
]
LICENSE_URLS = {
    'LXGW-WenKai-GB-OFL.txt': 'https://raw.githubusercontent.com/lxgw/LxgwWenKaiGB/main/OFL.txt',
    'Noto-Sans-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/OFL.txt',
    'Inconsolata-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/inconsolata/OFL.txt',
    'Sarasa-Gothic-OFL.txt': 'https://raw.githubusercontent.com/be5invis/Sarasa-Gothic/master/LICENSE',
    'Latin-Modern-GUST.txt': 'https://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt',
    'Latin-Modern-LPPL.txt': 'https://www.latex-project.org/lppl/lppl-1-3c.txt',
}

manifest = []
for name, family, weight, style, license_name in FACES:
    target = DEST / name
    source = official_font if name == 'LXGWWenKaiGB-Regular.ttf' else SOURCE / name
    if source.exists():
        shutil.copyfile(source, target)
    elif not target.exists():
        raise FileNotFoundError(f'Provide the original font file: {name}')
    font = TTFont(target, lazy=True)
    records = {}
    for key, name_id in [('copyright', 0), ('family', 1), ('version', 5), ('license', 13), ('licenseUrl', 14)]:
        records[key] = list(dict.fromkeys(n.toUnicode() for n in font['name'].names if n.nameID == name_id))
    manifest.append({
        'file': 'fonts/' + name, 'family': family, 'weight': weight, 'style': style,
        'format': 'opentype' if name.endswith('.otf') else 'truetype',
        'license': license_name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'bytes': target.stat().st_size, 'originalMetadata': records,
        'source': OFFICIAL_WENKAI if name == 'LXGWWenKaiGB-Regular.ttf' else 'Original installed font; upstream linked in THIRD_PARTY_NOTICES.md',
    })
    font.close()

for filename, url in LICENSE_URLS.items():
    target = LICENSES / filename
    if not target.exists():
        with urllib.request.urlopen(url, timeout=45) as response:
            content = response.read()
        if b'<html' in content[:200].lower() or len(content) < 1000:
            raise ValueError(f'Invalid license response: {url}')
        target.write_bytes(content)

(ROOT / 'assets/font-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
css = '\n'.join(
    f"@font-face {{ font-family: '{f['family']}'; src: url('./{f['file']}') format('{f['format']}'); "
    f"font-weight: {f['weight']}; font-style: {f['style']}; font-display: swap; }}"
    for f in manifest
)
(ROOT / 'assets/fonts.css').write_text(css + '\n', encoding='utf-8')
notices = ['Complete, unmodified fonts. CSS family names are local aliases only; font binaries are unchanged.']
for f in manifest:
    notices.append('\n' + f['file'] + '\n' + '\n'.join(f['originalMetadata']['copyright']))
(LICENSES / 'FONT-COPYRIGHT-NOTICES.txt').write_text('\n'.join(notices) + '\n', encoding='utf-8')
print(json.dumps({'fontFiles': len(manifest), 'bytes': sum(f['bytes'] for f in manifest), 'licenses': len(LICENSE_URLS)}))
