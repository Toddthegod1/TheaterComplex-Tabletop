"""Build web-sized card art for the digital game.

The source art in assets/ is print resolution (3000x4200 and 3600x6000 PNGs,
~137 MB total), which is far too heavy for a browser game. This script writes
downscaled WebP copies to game/img/, mirroring the assets/ folder layout.

Usage:  python tools/build_assets.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
DST = ROOT / "game" / "img"

# Max width per top-level folder; height follows the aspect ratio.
WIDTHS = {
    "tasks": 480,
    "capabilities": 360,
    "commands": 360,
    "staff": 360,
    "asos": 360,
    "disruptionCards": 360,
    "trackers": 900,
    "mats": 900,
}


def build():
    count = 0
    for src in SRC.rglob("*"):
        if src.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        rel = src.relative_to(SRC)
        width = WIDTHS.get(rel.parts[0], 600)
        dst = (DST / rel).with_suffix(".webp")
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
            if im.width > width:
                im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            im.save(dst, "WEBP", quality=84, method=6)
        count += 1
    print(f"wrote {count} images to {DST.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
