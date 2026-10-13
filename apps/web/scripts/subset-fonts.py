"""
Lighter Saira for the site: the original variable fonts (package
@fontsource-variable/saira, Latin subset, OFL licence) carry every width
(50–125 %) and weight (100–900). The site uses only:
  - upright text at normal width (100 %), weights 400 to 900;
  - italic display type (titles, logo) at 75 % width, weights 700 to 900,
    plus narrower widths (down to 50 %) for the landing title animation.
Each file keeps only those ranges of its weight and width axes.
Run: python3 scripts/subset-fonts.py   (needs `pip install fonttools brotli`)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = Path(__file__).resolve().parent.parent
source = here / "node_modules/@fontsource-variable/saira/files"
target = here / "src/fonts"

for name, limits in {
    "saira-latin-wdth-normal": {"wdth": 100, "wght": (400, 900)},
    "saira-latin-wdth-italic": {"wdth": (50, 75), "wght": (700, 900)},
}.items():
    font = TTFont(source / f"{name}.woff2")
    font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
    font.flavor = "woff2"
    out = target / f"{name.replace('-wdth', '')}.woff2"
    font.save(out)
    print(f"{out.name}: {out.stat().st_size // 1024} KB (from {(source / f'{name}.woff2').stat().st_size // 1024} KB)")
